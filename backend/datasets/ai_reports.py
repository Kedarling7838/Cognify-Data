
import json
import logging
import os
import re
from io import BytesIO

import numpy as np
import pandas as pd
import requests

from django.http import JsonResponse, HttpResponse
from django.views.decorators.http import require_POST

from accounts.permissions import role_required
from .models import Dataset
from .views import get_dataframe


logger = logging.getLogger(__name__)

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b"
LEGACY_UNAVAILABLE_MODELS = {"llama-3.3-70b-versatile"}

GROQ_TIMEOUT_SECONDS = 60
MAX_COLUMNS_FOR_REPORT = 60
MAX_CATEGORIES_PER_COLUMN = 10
MAX_REPORT_TEXT = 12000


# ============================================================
# JSON UTILITIES
# ============================================================

def _json_safe(value):

    if value is None:
        return None

    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass

    if isinstance(value, np.integer):
        return int(value)

    if isinstance(value, np.floating):
        value = float(value)
        return value if np.isfinite(value) else None

    if isinstance(value, np.bool_):
        return bool(value)

    if isinstance(value, pd.Timestamp):
        return value.isoformat()

    if isinstance(value, np.ndarray):
        return [_json_safe(item) for item in value.tolist()]

    if isinstance(value, dict):
        return {
            str(key): _json_safe(item)
            for key, item in value.items()
        }

    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]

    if isinstance(value, (str, int, float, bool)):
        return value

    return str(value)


def _column_schema(dataframe):

    return [
        {
            "name": str(column),
            "dtype": str(dataframe[column].dtype),
        }
        for column in list(dataframe.columns)[:MAX_COLUMNS_FOR_REPORT]
    ]


# ============================================================
# DATASET ANALYSIS
# ============================================================

def build_dataset_report_data(dataframe):
    """
    Analyze the dataset locally.
    Raw dataset rows are never sent to Groq.
    """

    row_count, column_count = dataframe.shape

    total_cells = row_count * column_count

    missing_by_column = dataframe.isna().sum()

    missing_total = int(missing_by_column.sum())

    duplicate_rows = int(dataframe.duplicated().sum())

    # Missing value analysis

    missing_profile = []

    for column in dataframe.columns[:MAX_COLUMNS_FOR_REPORT]:

        missing_count = int(missing_by_column[column])

        missing_profile.append({
            "column": str(column),
            "missing_count": missing_count,
            "missing_percentage": round(
                missing_count / row_count * 100,
                2
            ) if row_count else 0,
        })

    missing_profile.sort(
        key=lambda item: item["missing_count"],
        reverse=True
    )

    # Numeric analysis

    numeric_df = dataframe.select_dtypes(include="number")

    numeric_summary = {}

    for column in numeric_df.columns[:MAX_COLUMNS_FOR_REPORT]:

        series = pd.to_numeric(
            numeric_df[column],
            errors="coerce"
        ).dropna()

        if series.empty:
            continue

        numeric_summary[str(column)] = {
            "count": int(series.count()),
            "mean": round(float(series.mean()), 4),
            "median": round(float(series.median()), 4),
            "std": round(
                float(series.std()), 4
            ) if len(series) > 1 else 0,
            "min": round(float(series.min()), 4),
            "max": round(float(series.max()), 4),
            "sum": round(float(series.sum()), 4),
        }

    # Categorical analysis

    categorical_summary = {}

    categorical_columns = dataframe.select_dtypes(
        include=["object", "category", "bool"]
    ).columns

    for column in list(categorical_columns)[:MAX_COLUMNS_FOR_REPORT]:

        counts = (
            dataframe[column]
            .fillna("(Missing)")
            .astype(str)
            .value_counts()
            .head(MAX_CATEGORIES_PER_COLUMN)
        )

        categorical_summary[str(column)] = [
            {
                "value": str(index),
                "count": int(count),
            }
            for index, count in counts.items()
        ]

    # Correlation analysis

    correlations = {}

    if numeric_df.shape[1] >= 2:

        corr = numeric_df.corr(
            numeric_only=True
        ).round(4)

        corr = corr.iloc[:20, :20]

        correlations = {
            str(index): {
                str(column): _json_safe(value)
                for column, value in row.items()
            }
            for index, row in corr.iterrows()
        }

    # Outlier analysis

    outlier_summary = {}

    for column in numeric_df.columns[:MAX_COLUMNS_FOR_REPORT]:

        series = pd.to_numeric(
            numeric_df[column],
            errors="coerce"
        ).dropna()

        if len(series) < 4:
            continue

        q1, q3 = series.quantile([0.25, 0.75])

        iqr = q3 - q1

        lower = q1 - 1.5 * iqr

        upper = q3 + 1.5 * iqr

        count = int(
            ((series < lower) | (series > upper)).sum()
        )

        outlier_summary[str(column)] = {
            "count": count,
            "percentage": round(
                count / len(series) * 100, 2
            ),
            "lower_bound": round(float(lower), 4),
            "upper_bound": round(float(upper), 4),
        }

    # Data quality score

    quality_score = 100.0

    if total_cells:

        missing_percentage = (
            missing_total / total_cells * 100
        )

        duplicate_percentage = (
            duplicate_rows / row_count * 100
            if row_count else 0
        )

        quality_score = max(
            0.0,
            round(
                100
                - missing_percentage * 0.7
                - duplicate_percentage * 0.3,
                2
            )
        )

    # Date analysis

    date_summary = {}

    for column in list(dataframe.columns)[:MAX_COLUMNS_FOR_REPORT]:

        if pd.api.types.is_datetime64_any_dtype(dataframe[column]):

            parsed = dataframe[column].dropna()

        elif dataframe[column].dtype == "object":

            sample = (
                dataframe[column]
                .dropna()
                .astype(str)
                .head(100)
            )

            if sample.empty:
                continue

            parsed_sample = pd.to_datetime(
                sample,
                errors="coerce"
            )

            if parsed_sample.notna().mean() < 0.8:
                continue

            parsed = pd.to_datetime(
                dataframe[column],
                errors="coerce"
            ).dropna()

        else:
            continue

        if not parsed.empty:

            date_summary[str(column)] = {
                "minimum": parsed.min().isoformat(),
                "maximum": parsed.max().isoformat(),
                "valid_values": int(parsed.count()),
            }

    return {
        "overview": {
            "total_rows": int(row_count),
            "total_columns": int(column_count),
            "total_cells": int(total_cells),
            "missing_values": missing_total,
            "duplicate_rows": duplicate_rows,
            "quality_score": quality_score,
        },
        "schema": _column_schema(dataframe),
        "numeric_summary": numeric_summary,
        "categorical_summary": categorical_summary,
        "missing_profile": missing_profile,
        "outlier_summary": outlier_summary,
        "correlations": correlations,
        "date_summary": date_summary,
    }


# ============================================================
# GROQ AI REPORT GENERATION
# ============================================================

def _call_groq_for_report(report_data, filename):

    api_key = os.getenv("GROQ_API_KEY", "").strip()

    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY is not configured. "
            "Check your backend .env file."
        )

    configured_model = os.getenv("GROQ_MODEL", "").strip()

    if configured_model in LEGACY_UNAVAILABLE_MODELS:

        logger.warning(
            "Old Groq model configured. Using default model %s",
            GROQ_DEFAULT_MODEL
        )

        model = GROQ_DEFAULT_MODEL

    else:

        model = configured_model or GROQ_DEFAULT_MODEL

    system_prompt = """
You are Cognify Data's senior business intelligence analyst.

Create a clear, evidence-based executive report using only the
supplied dataset profile and aggregate statistics.

Do not invent facts, causes, business context, currency,
units, targets or unsupported trends.

Return exactly one valid JSON object:

{
  "report_title": "short report title",
  "executive_summary": "2-4 concise paragraphs",
  "key_findings": [
    {
      "title": "finding",
      "description": "evidence-based explanation",
      "importance": "high|medium|low"
    }
  ],
  "business_recommendations": [
    {
      "title": "recommendation",
      "description": "practical next step",
      "priority": "high|medium|low"
    }
  ],
  "risks_and_data_quality": [
    {
      "title": "risk",
      "description": "evidence-based explanation"
    }
  ],
  "opportunities": [
    {
      "title": "opportunity",
      "description": "evidence-based opportunity"
    }
  ],
  "conclusion": "short conclusion",
  "limitations": ["limitations"]
}

Rules:

- Use numeric values accurately.
- Do not claim causation from correlation.
- Do not claim time trends without evidence.
- Do not assume an industry for generic datasets.
- Include useful findings and recommendations where evidence allows.
- Return JSON only, without Markdown fences.
""".strip()

    payload = {
        "model": model,
        "temperature": 0.2,
        "max_tokens": 3000,
        "response_format": {
            "type": "json_object"
        },
        "messages": [
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "dataset_filename": filename,
                        "dataset_analysis": report_data
                    },
                    ensure_ascii=False,
                    default=str
                )[:MAX_REPORT_TEXT]
            }
        ]
    }

    try:

        response = requests.post(
            GROQ_CHAT_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json=payload,
            timeout=GROQ_TIMEOUT_SECONDS
        )

        if not response.ok:

            try:
                error_data = response.json()

                message = (
                    error_data.get("error", {}).get("message")
                    or response.text[:800]
                )

            except (ValueError, AttributeError):
                message = response.text[:800]

            if response.status_code == 401:
                raise RuntimeError("Groq API key is invalid.")

            if response.status_code == 403:
                raise RuntimeError("Groq access denied.")

            if response.status_code == 404:
                raise RuntimeError(
                    f"Groq model '{model}' was not found. "
                    "Check GROQ_MODEL."
                )

            if response.status_code == 429:
                raise RuntimeError(
                    "Groq rate limit or usage quota reached."
                )

            raise RuntimeError(
                f"Groq API HTTP {response.status_code}: {message}"
            )

        content = response.json()["choices"][0]["message"]["content"]

        result = json.loads(content)

        if not isinstance(result, dict):
            raise RuntimeError("Groq returned an invalid report.")

        return result

    except requests.Timeout as error:

        raise RuntimeError(
            "Groq report generation timed out."
        ) from error

    except requests.ConnectionError as error:

        raise RuntimeError(
            "Could not connect to Groq."
        ) from error

    except requests.RequestException as error:

        raise RuntimeError(
            f"Groq request failed: {error}"
        ) from error

    except (
        KeyError,
        IndexError,
        TypeError,
        json.JSONDecodeError
    ) as error:

        logger.exception("Invalid Groq report response.")

        raise RuntimeError(
            "Groq returned an invalid report."
        ) from error


# ============================================================
# GENERATE AI REPORT API
# ============================================================

@require_POST
@role_required("admin", "user")
def analyze_dataset_report(request):

    try:
        body = json.loads(request.body or "{}")

    except (json.JSONDecodeError, UnicodeDecodeError):

        return JsonResponse(
            {"error": "Invalid JSON request."},
            status=400
        )

    if not isinstance(body, dict):

        return JsonResponse(
            {"error": "Invalid request format."},
            status=400
        )

    dataset_id = body.get("dataset_id")

    if not dataset_id:

        return JsonResponse(
            {"error": "Please select a dataset."},
            status=400
        )

    try:

        dataset = Dataset.objects.get(
            id=dataset_id,
            user=request.user
        )

    except (
        Dataset.DoesNotExist,
        ValueError,
        TypeError
    ):

        return JsonResponse(
            {"error": "Dataset not found."},
            status=404
        )

    try:

        dataframe = get_dataframe(dataset)

        if dataframe.empty or len(dataframe.columns) == 0:

            return JsonResponse(
                {"error": "The selected dataset is empty."},
                status=400
            )

        report_data = build_dataset_report_data(dataframe)

        ai_report = _call_groq_for_report(
            report_data,
            dataset.filename
        )

        return JsonResponse({
            "success": True,
            "dataset_id": dataset.id,
            "filename": dataset.filename,
            "generated_at": pd.Timestamp.utcnow().isoformat(),
            "report_data": _json_safe(report_data),
            "ai_report": _json_safe(ai_report),
            "privacy_note": (
                "Dataset calculations were performed locally. "
                "Only filename, schema and aggregate statistics "
                "were sent to Groq. Raw dataset rows were not sent."
            )
        })

    except RuntimeError as error:

        logger.warning("AI Report error: %s", error)

        return JsonResponse(
            {"error": str(error)},
            status=503
        )

    except Exception:

        logger.exception("Unexpected AI Report error.")

        return JsonResponse(
            {
                "error": (
                    "Unable to generate report. "
                    "Check the Django terminal."
                )
            },
            status=500
        )


# ============================================================
# EXPORT HELPERS
# ============================================================

def _export_payload(request):

    try:
        body = json.loads(request.body or "{}")

    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ValueError("Invalid JSON request.")

    if not isinstance(body, dict):
        raise ValueError("Invalid request format.")

    dataset_id = body.get("dataset_id")

    if not dataset_id:
        raise ValueError("Please select a dataset.")

    try:

        dataset = Dataset.objects.get(
            id=dataset_id,
            user=request.user
        )

    except (
        Dataset.DoesNotExist,
        ValueError,
        TypeError
    ):

        raise LookupError("Dataset not found.")

    report_data = body.get("report_data") or {}

    ai_report = body.get("ai_report") or {}

    if not isinstance(report_data, dict):
        raise ValueError("Invalid report data.")

    if not isinstance(ai_report, dict):
        raise ValueError("Invalid AI report.")

    return dataset, report_data, ai_report


def _clean_filename(value):

    value = re.sub(
        r"[^A-Za-z0-9._-]+",
        "-",
        str(value or "cognify-report")
    )

    return value.strip("-._")[:80] or "cognify-report"


def _report_text(value, fallback="Not available"):

    if value is None:
        return fallback

    if isinstance(value, (dict, list)):
        return json.dumps(
            value,
            ensure_ascii=False,
            default=str
        )

    return str(value)


# ============================================================
# POWERPOINT EXPORT
# ============================================================

def _make_pptx(filename, report_data, ai_report):

    try:

        from pptx import Presentation
        from pptx.util import Inches, Pt
        from pptx.dml.color import RGBColor
        from pptx.enum.text import PP_ALIGN
        from pptx.enum.shapes import MSO_SHAPE

    except ImportError as exc:

        raise RuntimeError(
            "Install PowerPoint dependency: pip install python-pptx"
        ) from exc

    prs = Presentation()

    prs.slide_width = Inches(13.333)

    prs.slide_height = Inches(7.5)

    navy = RGBColor(20, 24, 42)

    maroon = RGBColor(125, 35, 65)

    white = RGBColor(255, 255, 255)

    pink = RGBColor(205, 155, 175)

    overview = report_data.get("overview", {})

    numeric = report_data.get("numeric_summary", {})

    def add_bg(slide):

        fill = slide.background.fill

        fill.solid()

        fill.fore_color.rgb = navy

    def add_title(slide, title, subtitle="COGNIFY DATA • BUSINESS INTELLIGENCE"):

        box = slide.shapes.add_textbox(
            Inches(.65),
            Inches(.35),
            Inches(12),
            Inches(.65)
        )

        p = box.text_frame.paragraphs[0]

        p.text = title

        p.font.size = Pt(27)

        p.font.bold = True

        p.font.color.rgb = white

        sub = slide.shapes.add_textbox(
            Inches(.68),
            Inches(1.02),
            Inches(12),
            Inches(.35)
        )

        sp = sub.text_frame.paragraphs[0]

        sp.text = subtitle

        sp.font.size = Pt(10)

        sp.font.color.rgb = pink

    def add_text_slide(title, body, subtitle=None):

        slide = prs.slides.add_slide(prs.slide_layouts[6])

        add_bg(slide)

        add_title(slide, title, subtitle or filename)

        box = slide.shapes.add_textbox(
            Inches(.8),
            Inches(1.65),
            Inches(11.8),
            Inches(5.2)
        )

        tf = box.text_frame

        tf.word_wrap = True

        tf.clear()

        paragraphs = body if isinstance(body, list) else [body]

        for i, paragraph in enumerate(paragraphs):

            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()

            p.text = str(paragraph)

            p.font.size = Pt(
                18 if len(str(paragraph)) < 180 else 15
            )

            p.font.color.rgb = white

            p.space_after = Pt(16)

        return slide

    # Cover slide

    slide = prs.slides.add_slide(prs.slide_layouts[6])

    add_bg(slide)

    title_box = slide.shapes.add_textbox(
        Inches(.9),
        Inches(1.55),
        Inches(11.5),
        Inches(1.5)
    )

    p = title_box.text_frame.paragraphs[0]

    p.text = _report_text(
        ai_report.get("report_title"),
        "Dataset Intelligence Report"
    )

    p.font.size = Pt(34)

    p.font.bold = True

    p.font.color.rgb = white

    sub = slide.shapes.add_textbox(
        Inches(.95),
        Inches(3.15),
        Inches(11),
        Inches(1)
    )

    sp = sub.text_frame.paragraphs[0]

    sp.text = f"{filename}\nGenerated by Cognify Data"

    sp.font.size = Pt(19)

    sp.font.color.rgb = pink

    # KPI slide

    slide = prs.slides.add_slide(prs.slide_layouts[6])

    add_bg(slide)

    add_title(slide, "Executive KPI Snapshot")

    kpis = [
        ("Total rows", overview.get("total_rows", 0)),
        ("Total columns", overview.get("total_columns", 0)),
        ("Missing values", overview.get("missing_values", 0)),
        ("Data quality", f'{overview.get("quality_score", 0)}%'),
    ]

    for i, (label, value) in enumerate(kpis):

        x = .8 + i * 3.05

        shape = slide.shapes.add_shape(
            MSO_SHAPE.ROUNDED_RECTANGLE,
            Inches(x),
            Inches(2.2),
            Inches(2.7),
            Inches(1.7)
        )

        shape.fill.solid()

        shape.fill.fore_color.rgb = maroon

        shape.line.color.rgb = maroon

        tf = shape.text_frame

        tf.text = f"{label}\n{value}"

        for para in tf.paragraphs:

            para.alignment = PP_ALIGN.CENTER

            para.font.size = Pt(22)

            para.font.bold = True

            para.font.color.rgb = white

    def items_to_lines(items, max_items=8):

        lines = []

        for item in (items or [])[:max_items]:

            if isinstance(item, dict):

                lines.append(
                    f"{item.get('title', 'Item')}: "
                    f"{item.get('description', '')}"
                )

            else:

                lines.append(str(item))

        return lines or ["No items were returned."]

    # Executive summary

    add_text_slide(
        "Executive Summary",
        _report_text(ai_report.get("executive_summary"))
    )

    # Dataset overview

    add_text_slide(
        "Dataset Overview",
        [
            f"Dataset: {filename}",
            f"Rows: {overview.get('total_rows', 0)}",
            f"Columns: {overview.get('total_columns', 0)}",
            f"Cells: {overview.get('total_cells', 0)}",
            f"Duplicate rows: {overview.get('duplicate_rows', 0)}",
            f"Data quality score: {overview.get('quality_score', 0)}%",
        ]
    )

    add_text_slide(
        "Key Findings",
        items_to_lines(ai_report.get("key_findings"))
    )

    add_text_slide(
        "Business Recommendations",
        items_to_lines(ai_report.get("business_recommendations"))
    )

    add_text_slide(
        "Risks & Data Quality",
        items_to_lines(ai_report.get("risks_and_data_quality"))
    )

    add_text_slide(
        "Opportunities",
        items_to_lines(ai_report.get("opportunities"))
    )

    # Statistical analysis

    numeric_lines = []

    for col, stats in list(numeric.items())[:12]:

        numeric_lines.append(
            f"{col}: mean {stats.get('mean')}, "
            f"median {stats.get('median')}, "
            f"min {stats.get('min')}, "
            f"max {stats.get('max')}, "
            f"std {stats.get('std')}"
        )

    add_text_slide(
        "Statistical Analysis",
        numeric_lines or ["No numeric columns detected."]
    )

    # Missing values

    missing = report_data.get("missing_profile", [])

    add_text_slide(
        "Missing Values Profile",
        [
            f"{item.get('column')}: "
            f"{item.get('missing_count')} missing "
            f"({item.get('missing_percentage')}%)"
            for item in missing[:12]
        ] or ["No missing-value profile available."]
    )

    # Outliers

    outliers = report_data.get("outlier_summary", {})

    add_text_slide(
        "Outlier Analysis",
        [
            f"{col}: {item.get('count')} potential outliers "
            f"({item.get('percentage')}%)"
            for col, item in list(outliers.items())[:12]
        ] or ["No outlier summary available."]
    )

    # Correlation highlights

    correlations = report_data.get("correlations", {})

    corr_lines = []

    for col, values in list(correlations.items())[:8]:

        strongest = sorted(
            [
                (key, value)
                for key, value in values.items()
                if key != col
                and isinstance(value, (int, float))
                and value is not None
            ],
            key=lambda pair: abs(pair[1]),
            reverse=True
        )[:2]

        if strongest:

            corr_lines.append(
                f"{col}: "
                + ", ".join(
                    f"{name} ({value})"
                    for name, value in strongest
                )
            )

    add_text_slide(
        "Correlation Highlights",
        corr_lines or [
            "Insufficient numeric columns for correlation analysis."
        ]
    )

    # Date analysis

    add_text_slide(
        "Date & Time Coverage",
        [
            f"{col}: {item.get('minimum')} to "
            f"{item.get('maximum')} "
            f"({item.get('valid_values')} values)"
            for col, item in list(
                report_data.get("date_summary", {}).items()
            )[:10]
        ] or ["No date-like columns identified."]
    )

    add_text_slide(
        "Strategic Action Plan",
        items_to_lines(
            ai_report.get("business_recommendations"),
            6
        )
    )

    add_text_slide(
        "Analysis Limitations",
        ai_report.get("limitations", [])
        or ["No limitations supplied."]
    )

    add_text_slide(
        "Conclusion",
        _report_text(ai_report.get("conclusion"))
    )

    add_text_slide(
        "Methodology & Privacy",
        [
            "Descriptive statistics, missing-value analysis, "
            "duplicate detection, IQR outlier checks and numeric "
            "correlations were calculated locally with Pandas.",

            "The AI narrative uses dataset schema and aggregate "
            "statistics. Raw dataset rows are not sent to Groq.",

            "Correlation does not establish causation. "
            "Business context and metric definitions should be validated."
        ]
    )

    add_text_slide(
        "Thank You",
        "Prepared with Cognify Data • AI-powered data intelligence"
    )

    output = BytesIO()

    prs.save(output)

    output.seek(0)

    return output.getvalue()


# ============================================================
# PDF EXPORT
# ============================================================

def _make_pdf(filename, report_data, ai_report):

    try:

        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import mm
        from reportlab.platypus import (
            SimpleDocTemplate,
            Paragraph,
            Spacer,
            Table,
            TableStyle
        )

    except ImportError as exc:

        raise RuntimeError(
            "Install PDF dependency: pip install reportlab"
        ) from exc

    output = BytesIO()

    doc = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm
    )

    styles = getSampleStyleSheet()

    styles.add(
        ParagraphStyle(
            name="CognifyTitle",
            parent=styles["Title"],
            textColor=colors.HexColor("#7d2341"),
            spaceAfter=12
        )
    )

    story = [
        Paragraph(
            "Cognify Data — Analytics Report",
            styles["CognifyTitle"]
        ),
        Paragraph(filename, styles["Heading2"]),
        Spacer(1, 8)
    ]

    overview = report_data.get("overview", {})

    rows = [["Metric", "Value"]]

    rows += [
        [
            str(key).replace("_", " ").title(),
            str(value)
        ]
        for key, value in overview.items()
    ]

    table = Table(rows, hAlign="LEFT")

    table.setStyle(
        TableStyle([
            (
                "BACKGROUND",
                (0, 0),
                (-1, 0),
                colors.HexColor("#351322")
            ),
            (
                "TEXTCOLOR",
                (0, 0),
                (-1, 0),
                colors.white
            ),
            (
                "GRID",
                (0, 0),
                (-1, -1),
                0.4,
                colors.grey
            ),
            (
                "PADDING",
                (0, 0),
                (-1, -1),
                6
            )
        ])
    )

    story += [
        table,
        Spacer(1, 14)
    ]

    def add_section(title, content):

        story.append(
            Paragraph(title, styles["Heading2"])
        )

        if isinstance(content, list):

            for item in content[:20]:

                if isinstance(item, dict):

                    text = (
                        f"<b>{item.get('title', '')}</b> — "
                        f"{item.get('description', '')}"
                    )

                else:

                    text = str(item)

                story.append(
                    Paragraph(text, styles["BodyText"])
                )

                story.append(Spacer(1, 5))

        else:

            story.append(
                Paragraph(
                    str(content or "Not available"),
                    styles["BodyText"]
                )
            )

        story.append(Spacer(1, 10))

    add_section(
        "Executive Summary",
        ai_report.get("executive_summary")
    )

    add_section(
        "Key Findings",
        ai_report.get("key_findings")
    )

    add_section(
        "Recommendations",
        ai_report.get("business_recommendations")
    )

    add_section(
        "Risks & Data Quality",
        ai_report.get("risks_and_data_quality")
    )

    add_section(
        "Opportunities",
        ai_report.get("opportunities")
    )

    add_section(
        "Conclusion",
        ai_report.get("conclusion")
    )

    add_section(
        "Limitations",
        ai_report.get("limitations", [])
    )

    doc.build(story)

    output.seek(0)

    return output.getvalue()


# ============================================================
# EXCEL EXPORT
# ============================================================

def _make_xlsx(filename, report_data, ai_report):

    try:

        from openpyxl import Workbook

        from openpyxl.styles import (
            Font,
            PatternFill,
            Alignment
        )

        from openpyxl.utils import get_column_letter

    except ImportError as exc:

        raise RuntimeError(
            "Install Excel dependency: pip install openpyxl"
        ) from exc

    wb = Workbook()

    # Overview sheet

    ws = wb.active

    ws.title = "Overview"

    ws.append([
        "Cognify Data Analytics Report",
        filename
    ])

    ws.append([])

    ws.append([
        "Metric",
        "Value"
    ])

    for key, value in report_data.get("overview", {}).items():

        ws.append([
            key.replace("_", " ").title(),
            value
        ])

    ws.append([])

    ws.append([
        "Executive Summary",
        ai_report.get("executive_summary", "")
    ])

    for cell in ws[1]:

        cell.font = Font(
            bold=True,
            color="FFFFFF",
            size=14
        )

        cell.fill = PatternFill(
            "solid",
            fgColor="351322"
        )

    for cell in ws[3]:

        cell.font = Font(
            bold=True,
            color="FFFFFF"
        )

        cell.fill = PatternFill(
            "solid",
            fgColor="7D2341"
        )

    # Numeric analysis sheet

    numeric_ws = wb.create_sheet("Numeric Analysis")

    numeric_ws.append([
        "Column",
        "Count",
        "Mean",
        "Median",
        "Std Dev",
        "Min",
        "Max",
        "Sum"
    ])

    for col, stats in report_data.get(
        "numeric_summary", {}
    ).items():

        numeric_ws.append([
            col,
            stats.get("count"),
            stats.get("mean"),
            stats.get("median"),
            stats.get("std"),
            stats.get("min"),
            stats.get("max"),
            stats.get("sum")
        ])

    # AI insights sheet

    findings_ws = wb.create_sheet("AI Insights")

    findings_ws.append([
        "Section",
        "Title",
        "Description",
        "Priority"
    ])

    sections = [
        ("Finding", "key_findings", "importance"),
        (
            "Recommendation",
            "business_recommendations",
            "priority"
        ),
        (
            "Risk",
            "risks_and_data_quality",
            "importance"
        ),
        (
            "Opportunity",
            "opportunities",
            "importance"
        )
    ]

    for section, key, priority in sections:

        for item in ai_report.get(key, []) or []:

            findings_ws.append([
                section,
                item.get("title", ""),
                item.get("description", ""),
                item.get(priority, "")
            ])

    # Format sheets

    for sheet in wb.worksheets:

        sheet.freeze_panes = "A2"

        for row in sheet.iter_rows():

            for cell in row:

                cell.alignment = Alignment(
                    vertical="top",
                    wrap_text=True
                )

        for col_cells in sheet.columns:

            width = min(
                max(
                    max(
                        len(str(cell.value or ""))
                        for cell in col_cells
                    ) + 2,
                    12
                ),
                48
            )

            sheet.column_dimensions[
                get_column_letter(col_cells[0].column)
            ].width = width

        for cell in sheet[1]:

            cell.font = Font(
                bold=True,
                color="FFFFFF"
            )

            cell.fill = PatternFill(
                "solid",
                fgColor="351322"
            )

    output = BytesIO()

    wb.save(output)

    output.seek(0)

    return output.getvalue()


# ============================================================
# EXPORT API
# ============================================================

@require_POST
@role_required("admin", "user")
def export_dataset_report(request, export_format):
    """
    Export the generated report as PPTX, PDF or XLSX.
    Dataset ownership is verified before export.
    """

    try:

        dataset, report_data, ai_report = _export_payload(request)

        filename = _clean_filename(
            os.path.splitext(dataset.filename)[0]
        )

        fmt = (export_format or "").lower()

        if fmt == "pptx":

            content = _make_pptx(
                dataset.filename,
                report_data,
                ai_report
            )

            content_type = (
                "application/vnd.openxmlformats-officedocument."
                "presentationml.presentation"
            )

            extension = "pptx"

        elif fmt == "pdf":

            content = _make_pdf(
                dataset.filename,
                report_data,
                ai_report
            )

            content_type = "application/pdf"

            extension = "pdf"

        elif fmt in {"xlsx", "excel"}:

            content = _make_xlsx(
                dataset.filename,
                report_data,
                ai_report
            )

            content_type = (
                "application/vnd.openxmlformats-officedocument."
                "spreadsheetml.sheet"
            )

            extension = "xlsx"

        else:

            return JsonResponse(
                {
                    "error": (
                        "Unsupported format. "
                        "Use pptx, pdf or xlsx."
                    )
                },
                status=400
            )

        response = HttpResponse(
            content,
            content_type=content_type
        )

        response["Content-Disposition"] = (
            f'attachment; filename="{filename}-cognify-report.{extension}"'
        )

        return response

    except ValueError as error:

        return JsonResponse(
            {"error": str(error)},
            status=400
        )

    except LookupError as error:

        return JsonResponse(
            {"error": str(error)},
            status=404
        )

    except RuntimeError as error:

        return JsonResponse(
            {"error": str(error)},
            status=503
        )

    except Exception:

        logger.exception("Report export failed.")

        return JsonResponse(
            {
                "error": (
                    "Unable to export report. "
                    "Check the Django terminal."
                )
            },
            status=500
        )
