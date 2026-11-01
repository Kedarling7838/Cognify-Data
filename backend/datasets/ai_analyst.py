import json
import logging
import os
import re

import pandas as pd
import requests

from django.http import JsonResponse
from django.views.decorators.http import require_POST

from accounts.permissions import role_required
from .models import Dataset
from .views import get_dataframe


logger = logging.getLogger(__name__)

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b"
MAX_QUESTION_LENGTH = 1000
MAX_RESULT_ROWS = 25
GROQ_TIMEOUT_SECONDS = 45


def is_greeting(question):
    """Return True for standalone greetings and casual acknowledgements."""
    normalized = question.strip().lower()
    normalized = re.sub(r"[^\w\s]", "", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()

    greetings = {
        "hi", "hii", "hiii", "hello", "hey", "heyy",
        "good morning", "good afternoon", "good evening",
        "how are you", "how are you doing", "whats up", "what is up",
        "thank you", "thanks", "thanks a lot", "bye", "goodbye",
        "see you", "nice to meet you",
    }
    return normalized in greetings


def build_analysis_plan(question, dataframe):
    """
    Ask Groq for a constrained JSON plan.

    The model is only allowed to choose an approved analysis operation.
    It never generates Python, Pandas code, SQL, formulas, or commands.
    Dataset rows are not sent to Groq; only column names, data types,
    the user's question, and the row count are sent.
    """
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY is not configured on the Django server. "
            "Check the backend .env file and restart Django."
        )

    model = os.getenv("GROQ_MODEL", GROQ_DEFAULT_MODEL).strip()
    if not model:
        model = GROQ_DEFAULT_MODEL

    schema = [
        {
            "name": str(column),
            "dtype": str(dataframe[column].dtype),
        }
        for column in dataframe.columns
    ]

    system_prompt = """
You are the query planner for Cognify Data. Convert the user's question into
exactly one JSON object. Do not answer the question. Never generate Python,
Pandas code, SQL, formulas, or commands.

Allowed operations:
- aggregate: sum, mean, median, min, max, count. Use group_by for grouped
  questions such as sales by product or revenue by month.
- describe: descriptive statistics for a numeric column, or all numeric
  columns if column is null.
- value_counts: count distinct values in a categorical column.
- missing: missing-value counts and percentages by column.
- correlation: correlations between numeric columns.
- count_rows: count dataset rows.

Return JSON with these fields:
{
  "operation": "aggregate|describe|value_counts|missing|correlation|count_rows",
  "column": "exact column name or null",
  "group_by": "exact column name or null",
  "metric": "sum|mean|median|min|max|count",
  "sort": "asc|desc",
  "limit": integer from 1 to 25,
  "chart_type": "bar|line|pie|table|none"
}

Column names must exactly match the supplied schema. Use null when not needed.
For "top 5 products by sales", choose aggregate with column=sales column,
group_by=product column, metric=sum, sort=desc, limit=5, chart_type=bar.
For "sales by month", choose aggregate with column=sales column,
group_by=month column, metric=sum.
For "count products by category", choose aggregate with column=product column,
group_by=category column, metric=count.
For missing values choose missing; for numeric relationships choose correlation.
If the question cannot be mapped safely, choose describe with column=null.
Return valid JSON only, without markdown fences.
""".strip()

    payload = {
        "model": model,
        "temperature": 0,
        "max_tokens": 500,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "question": question,
                        "dataset_schema": schema,
                        "row_count": int(len(dataframe)),
                    },
                    ensure_ascii=False,
                ),
            },
        ],
    }

    try:
        response = requests.post(
            GROQ_CHAT_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=GROQ_TIMEOUT_SECONDS,
        )

        if not response.ok:
            try:
                error_data = response.json()
                error_message = (
                    error_data.get("error", {}).get("message")
                    or response.text[:1000]
                )
            except (ValueError, AttributeError):
                error_message = response.text[:1000]

            logger.error(
                "Groq API returned HTTP %s: %s",
                response.status_code,
                error_message,
            )

            if response.status_code == 401:
                raise RuntimeError(
                    "Groq rejected the API key (401 Unauthorized). "
                    "Check that GROQ_API_KEY is valid."
                )
            if response.status_code == 403:
                raise RuntimeError(
                    "Groq denied access (403 Forbidden). Check your API key "
                    "permissions and account access."
                )
            if response.status_code == 404:
                raise RuntimeError(
                    f"Groq could not find the model '{model}'. "
                    "Check GROQ_MODEL against the models available in your Groq account."
                )
            if response.status_code == 429:
                raise RuntimeError(
                    "Groq rate limit or usage quota reached (429). "
                    "Wait and try again, or check your Groq account limits."
                )

            raise RuntimeError(
                f"Groq API returned HTTP {response.status_code}: {error_message}"
            )

        response_data = response.json()
        content = response_data["choices"][0]["message"]["content"]
        plan = json.loads(content)

    except requests.Timeout as error:
        logger.exception("Groq API request timed out.")
        raise RuntimeError(
            "The Groq API request timed out. Please try again."
        ) from error

    except requests.ConnectionError as error:
        logger.exception("Could not connect to the Groq API.")
        raise RuntimeError(
            "Could not connect to Groq. Check your internet connection, "
            "proxy, firewall, or VPN."
        ) from error

    except requests.RequestException as error:
        logger.exception("Groq API request failed.")
        raise RuntimeError(
            f"Groq API request failed: {error}"
        ) from error

    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
        logger.exception("Groq returned an invalid response.")
        raise RuntimeError(
            "Groq returned an invalid analysis plan. Please rephrase your question."
        ) from error

    if not isinstance(plan, dict):
        raise RuntimeError("Groq returned an invalid analysis plan.")

    return plan


def validate_analysis_plan(plan, dataframe):
    """Validate the model's plan against a strict operation/column allowlist."""
    allowed_operations = {
        "aggregate",
        "describe",
        "value_counts",
        "missing",
        "correlation",
        "count_rows",
    }
    allowed_metrics = {"sum", "mean", "median", "min", "max", "count"}
    allowed_charts = {"bar", "line", "pie", "table", "none"}

    operation = plan.get("operation")
    if operation not in allowed_operations:
        raise ValueError("The requested analysis type is not supported.")

    column = plan.get("column")
    group_by = plan.get("group_by")

    column_lookup = {str(name): name for name in dataframe.columns}
    valid_columns = set(column_lookup)

    if column is not None:
        column = str(column)
        if column not in valid_columns:
            raise ValueError(
                "The AI selected a column that does not exist in this dataset."
            )
        column = column_lookup[column]

    if group_by is not None:
        group_by = str(group_by)
        if group_by not in valid_columns:
            raise ValueError(
                "The AI selected an invalid grouping column."
            )
        group_by = column_lookup[group_by]

    metric = plan.get("metric", "sum")
    if metric not in allowed_metrics:
        metric = "sum"

    sort = plan.get("sort", "desc")
    if sort not in {"asc", "desc"}:
        sort = "desc"

    try:
        limit = int(plan.get("limit", 10))
    except (TypeError, ValueError):
        limit = 10

    limit = max(1, min(limit, MAX_RESULT_ROWS))

    chart_type = plan.get("chart_type", "table")
    if chart_type not in allowed_charts:
        chart_type = "table"

    if operation == "aggregate":
        if group_by is not None and column is None:
            raise ValueError(
                "The AI did not identify the column to calculate. "
                "Please rephrase your question."
            )

        if column is None and metric != "count":
            raise ValueError("Please specify the column to calculate.")

        if column is not None and metric != "count":
            if not pd.api.types.is_numeric_dtype(dataframe[column]):
                raise ValueError(
                    f"'{column}' is not a numeric column. "
                    "Choose a numeric column for this calculation."
                )

        if group_by == column and group_by is not None:
            raise ValueError(
                "Choose different columns for grouping and calculation."
            )

    if operation == "value_counts" and column is None:
        raise ValueError("Please specify which column's values to count.")

    if operation == "describe" and column is not None:
        if not pd.api.types.is_numeric_dtype(dataframe[column]):
            raise ValueError(
                f"'{column}' is not numeric. Choose a numeric column."
            )

    return {
        "operation": operation,
        "column": column,
        "group_by": group_by,
        "metric": metric,
        "sort": sort,
        "limit": limit,
        "chart_type": chart_type,
    }


def dataframe_records(frame):
    """Convert a result DataFrame into JSON-safe records."""
    return json.loads(
        frame.to_json(
            orient="records",
            date_format="iso",
            force_ascii=False,
        )
    )
def run_pandas_analysis(dataframe, plan):
    """Execute only validated Pandas operations."""
    operation = plan["operation"]
    column = plan["column"]
    group_by = plan["group_by"]
    metric = plan["metric"]
    limit = plan["limit"]
    sort = plan["sort"]

    if operation == "count_rows":
        return (
            [{"total_rows": int(len(dataframe))}],
            ["total_rows"],
            f"The selected dataset contains {len(dataframe):,} rows.",
        )

    if operation == "missing":
        missing = dataframe.isna().sum()
        row_count = len(dataframe)

        result = pd.DataFrame(
            {
                "column": [str(name) for name in dataframe.columns],
                "missing_count": [
                    int(missing[name]) for name in dataframe.columns
                ],
                "missing_percentage": [
                    round(int(missing[name]) / row_count * 100, 2)
                    if row_count
                    else 0
                    for name in dataframe.columns
                ],
            }
        )

        result = result[result["missing_count"] > 0]
        result = result.sort_values(
            "missing_count",
            ascending=False,
        ).head(limit)

        if result.empty:
            answer = "No missing values were found in this dataset."
        else:
            first = result.iloc[0]
            answer = (
                f"Found missing values in {int((missing > 0).sum())} columns. "
                f"'{first['column']}' has the most "
                f"({int(first['missing_count']):,})."
            )

        return dataframe_records(result), list(result.columns), answer

    if operation == "correlation":
        numeric = dataframe.select_dtypes(include="number")

        if numeric.shape[1] < 2:
            raise ValueError(
                "Correlation requires at least two numeric columns."
            )

        corr = numeric.corr(numeric_only=True).round(4)
        result = corr.rename_axis("column").reset_index().head(limit)

        return (
            dataframe_records(result),
            [str(name) for name in result.columns],
            "Calculated the Pearson correlation matrix for numeric columns.",
        )

    if operation == "describe":
        numeric = dataframe.select_dtypes(include="number")

        if column is not None:
            numeric = numeric[[column]]

        if numeric.empty:
            raise ValueError(
                "There are no numeric columns to summarize."
            )

        result = (
            numeric.describe()
            .transpose()
            .rename_axis("column")
            .reset_index()
        )

        return (
            dataframe_records(result.head(limit)),
            [str(name) for name in result.columns],
            "Generated descriptive statistics for the selected numeric data.",
        )

    if operation == "value_counts":
        result = (
            dataframe[column]
            .fillna("(Missing)")
            .astype(str)
            .value_counts()
            .head(limit)
            .rename_axis("value")
            .reset_index(name="count")
        )

        return (
            dataframe_records(result),
            ["value", "count"],
            f"Showing the {len(result)} most frequent values in '{column}'.",
        )

    if operation == "aggregate":
        if group_by is not None:
            if metric == "count":
                result = (
                    dataframe.groupby(group_by, dropna=False)[column]
                    .count()
                    .reset_index(name="count")
                )
                value_name = "count"
            else:
                value_name = f"{metric}_{column}"
                result = (
                    dataframe.groupby(group_by, dropna=False)[column]
                    .agg(metric)
                    .reset_index(name=value_name)
                )

            result = result.sort_values(
                value_name,
                ascending=(sort == "asc"),
                na_position="last",
            ).head(limit)

            return (
                dataframe_records(result),
                [str(name) for name in result.columns],
                f"Calculated {metric} of '{column}' grouped by '{group_by}'.",
            )

        if metric == "count":
            value = (
                int(dataframe[column].count())
                if column is not None
                else int(len(dataframe))
            )
        else:
            if column is None:
                raise ValueError(
                    "Please specify a column for this calculation."
                )
            value = getattr(dataframe[column], metric)()

        if pd.isna(value):
            value = None
        elif hasattr(value, "item"):
            value = value.item()

        return (
            [
                {
                    "column": str(column) if column is not None else "rows",
                    "metric": metric,
                    "value": value,
                }
            ],
            ["column", "metric", "value"],
            f"The {metric} of '{column if column is not None else 'rows'}' is {value}.",
        )

    raise ValueError("This analysis operation is not supported.")


@require_POST
@role_required("admin", "user")
def ai_analyze_dataset(request):
    """Run a constrained natural-language analysis on the signed-in user's dataset."""
    try:
        body = json.loads(request.body or "{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse(
            {"error": "Invalid JSON request."},
            status=400,
        )

    if not isinstance(body, dict):
        return JsonResponse(
            {"error": "Invalid request format."},
            status=400,
        )

    dataset_id = body.get("dataset_id")
    question = body.get("question")

    if not isinstance(question, str) or not question.strip():
        return JsonResponse(
            {"error": "Please enter a question."},
            status=400,
        )

    question = question.strip()

    # Handle greetings without loading a dataset or calling Groq.
    if is_greeting(question):
        return JsonResponse(
            {
                "success": True,
                "intent": "smalltalk",
                "question": question,
                "answer": (
                    "Hello! 👋 I'm Cognify AI Data Analyst. "
                    "Ask me a question about your dataset and I'll help you "
                    "calculate statistics, explore trends, find missing values, "
                    "compare categories, and create charts."
                ),
                "operation": "smalltalk",
                "chart_type": "none",
                "columns": [],
                "records": [],
                "rows_returned": 0,
                "plan": None,
            }
        )

    if not dataset_id:
        return JsonResponse(
            {"error": "Please select a dataset."},
            status=400,
        )

    if len(question) > MAX_QUESTION_LENGTH:
        return JsonResponse(
            {
                "error": (
                    f"Keep your question under "
                    f"{MAX_QUESTION_LENGTH} characters."
                )
            },
            status=400,
        )

    try:
        dataset = Dataset.objects.get(
            id=dataset_id,
            user=request.user,
        )
    except (Dataset.DoesNotExist, ValueError, TypeError):
        return JsonResponse(
            {"error": "Dataset not found."},
            status=404,
        )

    try:
        dataframe = get_dataframe(dataset)

        if dataframe.empty or len(dataframe.columns) == 0:
            return JsonResponse(
                {"error": "The selected dataset is empty."},
                status=400,
            )

        plan = build_analysis_plan(question, dataframe)
        plan = validate_analysis_plan(plan, dataframe)

        records, columns, answer = run_pandas_analysis(dataframe, plan)

        return JsonResponse(
            {
                "success": True,
                "dataset_id": dataset.id,
                "filename": dataset.filename,
                "question": question,
                "answer": answer,
                "operation": plan["operation"],
                "chart_type": plan["chart_type"],
                "columns": columns,
                "records": records,
                "rows_returned": len(records),
                "plan": {
                    key: (
                        str(value)
                        if key in {"column", "group_by"} and value is not None
                        else value
                    )
                    for key, value in plan.items()
                },
                "note": (
                    "Groq received the question and column names/types to select "
                    "an approved operation. Dataset rows were analyzed locally "
                    "with Pandas and were not sent to Groq."
                ),
            }
        )

    except RuntimeError as error:
        logger.warning("AI Analyst Groq/runtime error: %s", error)
        return JsonResponse(
            {"error": str(error)},
            status=503,
        )

    except ValueError as error:
        return JsonResponse(
            {"error": str(error)},
            status=400,
        )

    except Exception:
        logger.exception("Unexpected error in AI Analyst endpoint.")
        return JsonResponse(
            {
                "error": (
                    "Unable to analyze this question. "
                    "Check the Django terminal for the detailed error."
                )
            },
            status=500,
        )