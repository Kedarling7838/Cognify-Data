
import json
from pathlib import Path

import pandas as pd
import sqlite3
from django.db.models import Sum
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import (
    require_GET,
    require_POST,
    require_http_methods,
)

from .models import Dataset
from accounts.permissions import role_required
import mysql.connector
from mysql.connector import Error as MySQLConnectionError

import csv
import io
from django.core.files.base import ContentFile

import oracledb

# Initialize Oracle Thick mode
ORACLE_CLIENT_PATH = (
    r"C:\Users\Asus\Downloads\instantclient-basic-windows.x64-23.26.4.0.0"
    r"\instantclient_23_26"
)

oracledb.init_oracle_client(lib_dir=ORACLE_CLIENT_PATH)

MAX_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls", ".json"}


def read_dataset_file(file_object, extension):
    """Read a dataset file into a pandas DataFrame."""

    file_object.seek(0)

    if extension == ".csv":
        return pd.read_csv(file_object)

    if extension in {".xlsx", ".xls"}:
        return pd.read_excel(file_object)

    if extension == ".json":
        data = json.loads(file_object.read().decode("utf-8"))

        if isinstance(data, dict):
            data = data.get("data", [data])

        if not isinstance(data, list):
            raise ValueError("JSON must contain a list of records.")

        return pd.DataFrame(data)

    raise ValueError("Unsupported dataset format.")


def dataframe_to_json_records(df):
    """Convert a DataFrame preview into JSON-safe records."""

    preview_df = df.head(20).astype(object)
    preview_df = preview_df.where(pd.notna(preview_df), None)

    return json.loads(
        preview_df.to_json(
            orient="records",
            date_format="iso",
            force_ascii=False,
        )
    )


def get_dataframe(dataset):
    """Load the original stored file for complete-dataset analysis."""

    if not dataset.uploaded_file:
        raise ValueError(
            "The original file is not available for this dataset. "
            "Please upload it again to enable full analytics."
        )

    extension = Path(dataset.filename).suffix.lower()

    with dataset.uploaded_file.open("rb") as file_object:
        return read_dataset_file(file_object, extension)


@csrf_exempt
@require_POST
@role_required("admin", "user")
def upload_dataset(request):
    uploaded_file = request.FILES.get("file")

    if not uploaded_file:
        return JsonResponse(
            {"error": "Please select a file."},
            status=400,
        )

    extension = Path(uploaded_file.name).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        return JsonResponse(
            {"error": "Supported formats: CSV, XLSX, XLS, JSON."},
            status=400,
        )

    if uploaded_file.size > MAX_FILE_SIZE:
        return JsonResponse(
            {"error": "Maximum file size is 10 MB."},
            status=413,
        )

    try:
        df = read_dataset_file(uploaded_file, extension)

        preview = dataframe_to_json_records(df)

        # Rewind before Django copies the uploaded file into media storage.
        uploaded_file.seek(0)

        dataset = Dataset.objects.create(
            user=request.user,
            filename=Path(uploaded_file.name).name,
            file_type=extension.lstrip("."),
            uploaded_file=uploaded_file,
            rows_count=int(len(df)),
            columns_count=int(len(df.columns)),
            missing_values=int(df.isna().sum().sum()),
            duplicate_rows=int(df.duplicated().sum()),
            columns=[str(column) for column in df.columns],
            preview=preview,
        )

        return JsonResponse(
            {
                "message": "Dataset uploaded and analyzed successfully.",
                "id": dataset.id,
                "filename": dataset.filename,
                "file_type": dataset.file_type,
                "rows": dataset.rows_count,
                "rows_count": dataset.rows_count,
                "columns_count": dataset.columns_count,
                "columns": dataset.columns,
                "missing_values": dataset.missing_values,
                "duplicate_rows": dataset.duplicate_rows,
                "preview": dataset.preview,
                "uploaded_at": dataset.uploaded_at.isoformat(),
            },
            status=201,
        )

    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        return JsonResponse(
            {"error": f"Unable to read dataset: {str(exc)}"},
            status=400,
        )
    except Exception:
        return JsonResponse(
            {
                "error": (
                    "Unable to process this file. Check its format "
                    "and contents, and ensure the required file-reading "
                    "packages are installed."
                )
            },
            status=400,
        )


@require_GET
def dataset_history(request):
    datasets = Dataset.objects.filter(
        user=request.user
    ).order_by("-uploaded_at")

    results = [
        {
            "id": dataset.id,
            "filename": dataset.filename,
            "file_type": dataset.file_type,
            "rows": dataset.rows_count,
            "rows_count": dataset.rows_count,
            "columns_count": dataset.columns_count,
            "missing_values": dataset.missing_values,
            "duplicate_rows": dataset.duplicate_rows,
            "uploaded_at": dataset.uploaded_at.isoformat(),
        }
        for dataset in datasets
    ]

    return JsonResponse({"datasets": results})


@require_GET
def dashboard_stats(request):
    datasets = Dataset.objects.filter(user=request.user)

    totals = datasets.aggregate(
        total_rows=Sum("rows_count"),
        total_missing=Sum("missing_values"),
        total_duplicates=Sum("duplicate_rows"),
    )

    return JsonResponse(
        {
            "total_datasets": datasets.count(),
            "total_rows": totals["total_rows"] or 0,
            "total_missing": totals["total_missing"] or 0,
            "total_duplicates": totals["total_duplicates"] or 0,
        }
    )



@require_GET
def dataset_analytics(request):
    dataset_id = request.GET.get("dataset_id")

    if not dataset_id:
        return JsonResponse(
            {"error": "Please select a dataset."},
            status=400,
        )

    try:
        dataset = Dataset.objects.get(
            id=dataset_id,
            user=request.user,
        )
    except (Dataset.DoesNotExist, ValueError):
        return JsonResponse(
            {"error": "Dataset not found."},
            status=404,
        )

    try:
        df = get_dataframe(dataset)

        total_rows = len(df)
        total_columns = len(df.columns)
        total_cells = total_rows * total_columns

        numeric_df = df.select_dtypes(include="number")
        categorical_df = df.select_dtypes(
            include=["object", "category", "bool", "string"]
        )

        missing_by_column = {}
        column_profiles = {}
        numeric_summary = {}
        category_summary = {}
        outlier_summary = {}
        insights = []

        total_missing = int(df.isna().sum().sum())
        duplicate_rows = int(df.duplicated().sum())

        # Column-wise profiling
        for column in df.columns:
            series = df[column]
            missing_count = int(series.isna().sum())
            missing_percentage = (
                round((missing_count / total_rows) * 100, 2)
                if total_rows else 0
            )

            missing_by_column[str(column)] = {
                "count": missing_count,
                "percentage": missing_percentage,
            }

            column_profiles[str(column)] = {
                "data_type": str(series.dtype),
                "unique_values": int(series.nunique(dropna=True)),
                "missing_values": missing_count,
                "missing_percentage": missing_percentage,
            }

        # Numeric analysis
        for column in numeric_df.columns:
            series = numeric_df[column].dropna()

            numeric_summary[str(column)] = {
                "count": int(series.count()),
                "mean": float(series.mean()) if not series.empty else None,
                "median": float(series.median()) if not series.empty else None,
                "std": float(series.std()) if len(series) > 1 else None,
                "min": float(series.min()) if not series.empty else None,
                "max": float(series.max()) if not series.empty else None,
                "sum": float(series.sum()) if not series.empty else None,
            }

            # IQR outlier detection
            if len(series) >= 4:
                q1 = float(series.quantile(0.25))
                q3 = float(series.quantile(0.75))
                iqr = q3 - q1

                lower_bound = q1 - (1.5 * iqr)
                upper_bound = q3 + (1.5 * iqr)

                outlier_count = int(
                    ((series < lower_bound) | (series > upper_bound)).sum()
                )

                outlier_summary[str(column)] = {
                    "count": outlier_count,
                    "percentage": round(
                        (outlier_count / len(series)) * 100, 2
                    ),
                    "lower_bound": lower_bound,
                    "upper_bound": upper_bound,
                }

        # Categorical analysis
        for column in categorical_df.columns:
            counts = (
                categorical_df[column]
                .fillna("(Missing)")
                .astype(str)
                .value_counts()
                .head(10)
            )

            category_summary[str(column)] = [
                {
                    "category": str(category),
                    "count": int(count),
                }
                for category, count in counts.items()
            ]

        # Correlation analysis
        correlation = {}

        if len(numeric_df.columns) >= 2:
            corr_df = numeric_df.corr(numeric_only=True)
            correlation = {
                str(column): {
                    str(other_column): (
                        float(value) if pd.notna(value) else None
                    )
                    for other_column, value in corr_df[column].items()
                }
                for column in corr_df.columns
            }

        # Data quality score
        missing_percentage = (
            (total_missing / total_cells) * 100
            if total_cells else 0
        )

        duplicate_percentage = (
            (duplicate_rows / total_rows) * 100
            if total_rows else 0
        )

        quality_score = max(
            0,
            round(
                100
                - (missing_percentage * 0.7)
                - (duplicate_percentage * 0.3),
                2,
            ),
        )

        # Automated statistical insights
        if total_rows:
            insights.append(
                f"Dataset contains {total_rows:,} rows and "
                f"{total_columns:,} columns."
            )

        if total_missing:
            highest_missing = max(
                missing_by_column.items(),
                key=lambda item: item[1]["percentage"],
            )

            insights.append(
                f"Column '{highest_missing[0]}' has the highest "
                f"missing-value percentage "
                f"({highest_missing[1]['percentage']}%)."
            )
        else:
            insights.append("No missing values were detected.")

        if duplicate_rows:
            insights.append(
                f"{duplicate_rows:,} duplicate rows were detected."
            )
        else:
            insights.append("No duplicate rows were detected.")

        if len(numeric_df.columns):
            insights.append(
                f"Found {len(numeric_df.columns)} numeric columns "
                "suitable for statistical analysis."
            )

        if outlier_summary:
            highest_outliers = max(
                outlier_summary.items(),
                key=lambda item: item[1]["count"],
            )

            if highest_outliers[1]["count"] > 0:
                insights.append(
                    f"Column '{highest_outliers[0]}' has "
                    f"{highest_outliers[1]['count']} potential outliers "
                    "using the IQR method."
                )

        if total_cells:
            insights.append(
                f"Overall data quality score is {quality_score}/100."
            )

        return JsonResponse({
            "id": dataset.id,
            "filename": dataset.filename,
            "rows": int(total_rows),
            "columns_count": int(total_columns),
            "columns": [str(column) for column in df.columns],
            "missing_values": total_missing,
            "duplicate_rows": duplicate_rows,
            "numeric_columns": [
                str(column) for column in numeric_df.columns
            ],
            "categorical_columns": [
                str(column) for column in categorical_df.columns
            ],
            "numeric_summary": numeric_summary,
            "category_summary": category_summary,
            "missing_by_column": missing_by_column,
            "column_profiles": column_profiles,
            "outlier_summary": outlier_summary,
            "correlation": correlation,
            "quality_score": quality_score,
            "insights": insights,
        })

    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    except Exception:
        return JsonResponse(
            {
                "error": (
                    "Unable to analyze this dataset. Check that the "
                    "original file exists and is readable."
                )
            },
            status=400,
        )



@csrf_exempt
@require_http_methods(["DELETE"])
@role_required("admin", "user")
def delete_dataset(request, dataset_id):
    try:
        dataset = Dataset.objects.get(
            id=dataset_id,
            user=request.user,
        )
    except (Dataset.DoesNotExist, ValueError):
        return JsonResponse(
            {"error": "Dataset not found."},
            status=404,
        )

    filename = dataset.filename

    # Delete the stored file as well as the database record.
    if dataset.uploaded_file:
        dataset.uploaded_file.delete(save=False)

    dataset.delete()

    return JsonResponse(
        {
            "message": "Dataset deleted successfully.",
            "filename": filename,
        }
    )


@csrf_exempt
@require_POST
@role_required("admin", "user")
def connect_mysql(request):
    """
    Test a MySQL connection and list accessible tables.
    Credentials are used for this request only and are not saved.
    """

    try:
        body = json.loads(request.body or "{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse(
            {"error": "Invalid JSON request."},
            status=400,
        )

    host = str(body.get("host", "")).strip()
    database = str(body.get("database", "")).strip()
    username = str(body.get("username", "")).strip()
    password = body.get("password", "")
    port = body.get("port", 3306)

    if not all([host, database, username]):
        return JsonResponse(
            {"error": "Host, database, and username are required."},
            status=400,
        )

    if not isinstance(password, str):
        return JsonResponse(
            {"error": "Password must be a string."},
            status=400,
        )

    try:
        port = int(port)

        if not 1 <= port <= 65535:
            raise ValueError
    except (TypeError, ValueError):
        return JsonResponse(
            {"error": "Port must be between 1 and 65535."},
            status=400,
        )

    connection = None

    try:
        connection = mysql.connector.connect(
            host=host,
            port=port,
            user=username,
            password=password,
            database=database,
            connection_timeout=5,
        )

        cursor = connection.cursor()
        cursor.execute(
            """
            SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = %s
            ORDER BY TABLE_NAME
            """,
            (database,),
        )

        tables = [row[0] for row in cursor.fetchall()]
        cursor.close()

        return JsonResponse({
            "message": "MySQL connection successful.",
            "database": database,
            "tables": tables,
            "table_count": len(tables),
        })

    except MySQLConnectionError:
        return JsonResponse(
            {
                "error": (
                    "Could not connect to MySQL. Check the host, port, "
                    "database, username, password, and server availability."
                )
            },
            status=400,
        )

    finally:
        if connection is not None and connection.is_connected():
            connection.close()


MYSQL_MAX_IMPORT_BYTES = 10 * 1024 * 1024
MYSQL_MAX_IMPORT_ROWS = 50000
MYSQL_PREVIEW_ROWS = 100


def get_mysql_request_data(request):
    """Validate MySQL connection details supplied by the frontend."""
    try:
        body = json.loads(request.body or "{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None, JsonResponse(
            {"error": "Invalid JSON request."},
            status=400,
        )

    host = str(body.get("host", "")).strip()
    database = str(body.get("database", "")).strip()
    username = str(body.get("username", "")).strip()
    password = body.get("password", "")
    table = body.get("table", "")
    port = body.get("port", 3306)

    if not host or not database or not username:
        return None, JsonResponse(
            {"error": "Host, database, and username are required."},
            status=400,
        )

    if not isinstance(password, str) or not isinstance(table, str):
        return None, JsonResponse(
            {"error": "Invalid password or table value."},
            status=400,
        )

    try:
        port = int(port)
        if not 1 <= port <= 65535:
            raise ValueError
    except (ValueError, TypeError):
        return None, JsonResponse(
            {"error": "Invalid MySQL port."},
            status=400,
        )

    return {
        "host": host,
        "port": port,
        "database": database,
        "username": username,
        "password": password,
        "table": table,
    }, None


def open_mysql_connection(details):
    return mysql.connector.connect(
        host=details["host"],
        port=details["port"],
        user=details["username"],
        password=details["password"],
        database=details["database"],
        connection_timeout=5,
    )


def validate_mysql_table(connection, database, table):
    """Only allow a table that exists in the selected database."""
    cursor = connection.cursor()
    cursor.execute(
        """
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
        """,
        (database, table),
    )
    result = cursor.fetchone()
    cursor.close()
    return result is not None


@csrf_exempt
@require_POST
@role_required("admin", "user")
def preview_mysql_table(request):
    details, error_response = get_mysql_request_data(request)

    if error_response:
        return error_response

    connection = None

    try:
        connection = open_mysql_connection(details)

        if not validate_mysql_table(
            connection, details["database"], details["table"]
        ):
            return JsonResponse(
                {"error": "Table not found in the selected database."},
                status=404,
            )

        # Table identifiers cannot be passed as SQL parameters.
        # The table is verified against INFORMATION_SCHEMA first.
        table_name = details["table"].replace("`", "``")
        cursor = connection.cursor()
        cursor.execute(f"SELECT * FROM `{table_name}` LIMIT 100")

        columns = [item[0] for item in cursor.description]
        rows = cursor.fetchall()

        records = [
            dict(zip(columns, row))
            for row in rows
        ]

        cursor.close()

        return JsonResponse(
            {
                "database": details["database"],
                "table": details["table"],
                "columns": columns,
                "rows": json.loads(
                    json.dumps(records, default=str)
                ),
                "row_count": len(records),
                "preview_limit": MYSQL_PREVIEW_ROWS,
            }
        )

    except mysql.connector.Error:
        return JsonResponse(
            {
                "error": (
                    "Unable to preview this table. Check your connection "
                    "and ensure the MySQL account has SELECT permission."
                )
            },
            status=400,
        )

    finally:
        if connection is not None and connection.is_connected():
            connection.close()


@csrf_exempt
@require_POST
@role_required("admin", "user")
def import_mysql_table(request):
    details, error_response = get_mysql_request_data(request)

    if error_response:
        return error_response

    connection = None
    cursor = None

    try:
        connection = open_mysql_connection(details)

        if not validate_mysql_table(
            connection, details["database"], details["table"]
        ):
            return JsonResponse(
                {"error": "Table not found in the selected database."},
                status=404,
            )

        table_name = details["table"].replace("`", "``")
        cursor = connection.cursor()
        cursor.execute(f"SELECT * FROM `{table_name}`")

        columns = [item[0] for item in cursor.description]
        output = io.StringIO(newline="")
        writer = csv.writer(output)
        writer.writerow(columns)

        imported_rows = 0

        while True:
            batch = cursor.fetchmany(1000)

            if not batch:
                break

            for row in batch:
                if imported_rows >= MYSQL_MAX_IMPORT_ROWS:
                    return JsonResponse(
                        {
                            "error": (
                                "This table exceeds the import limit of "
                                f"{MYSQL_MAX_IMPORT_ROWS} rows. Filter or "
                                "reduce the table before importing."
                            )
                        },
                        status=413,
                    )

                writer.writerow([
                    "" if value is None else value
                    for value in row
                ])
                imported_rows += 1

                if output.tell() > MYSQL_MAX_IMPORT_BYTES:
                    return JsonResponse(
                        {
                            "error": (
                                "The CSV export exceeds the 10 MB import "
                                "limit. Reduce the table before importing."
                            )
                        },
                        status=413,
                    )

        csv_content = output.getvalue().encode("utf-8")
        output.close()

        df = pd.read_csv(io.BytesIO(csv_content))

        preview = dataframe_to_json_records(df)

        dataset = Dataset(
            user=request.user,
            filename=f"{details['table']}.csv",
            file_type="csv",
            rows_count=len(df),
            columns_count=len(df.columns),
            missing_values=int(df.isna().sum().sum()),
            duplicate_rows=int(df.duplicated().sum()),
            columns=[str(column) for column in df.columns],
            preview=preview,
        )

        dataset.uploaded_file.save(
            f"{details['table']}.csv",
            ContentFile(csv_content),
            save=False,
        )
        dataset.save()

        return JsonResponse(
            {
                "message": "MySQL table imported successfully.",
                "id": dataset.id,
                "filename": dataset.filename,
                "rows": dataset.rows_count,
                "columns_count": dataset.columns_count,
            },
            status=201,
        )

    except mysql.connector.Error:
        return JsonResponse(
            {
                "error": (
                    "Unable to import this table. Check your MySQL "
                    "connection and SELECT permissions."
                )
            },
            status=400,
        )

    except Exception:
        return JsonResponse(
            {"error": "Unable to process the MySQL table for import."},
            status=400,
        )

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None and connection.is_connected():
            connection.close()


# ============================================================
# ORACLE DATABASE INTEGRATION
# ============================================================

import oracledb

ORACLE_MAX_IMPORT_BYTES = 10 * 1024 * 1024
ORACLE_MAX_IMPORT_ROWS = 50000
ORACLE_PREVIEW_ROWS = 100


def get_oracle_request_data(request):
    """Validate Oracle connection details supplied by the frontend."""

    try:
        body = json.loads(request.body or "{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None, JsonResponse(
            {"error": "Invalid JSON request."},
            status=400,
        )

    host = str(body.get("host", "")).strip()
    username = str(body.get("username", "")).strip()
    password = body.get("password", "")
    service_name = str(body.get("service_name", "")).strip()
    table = body.get("table", "")
    port = body.get("port", 1521)

    if not host or not username or not service_name:
        return None, JsonResponse(
            {
                "error": "Host, service name, and username are required."
            },
            status=400,
        )

    if not isinstance(password, str):
        return None, JsonResponse(
            {"error": "Password must be a string."},
            status=400,
        )

    if not isinstance(table, str):
        return None, JsonResponse(
            {"error": "Invalid table value."},
            status=400,
        )

    try:
        port = int(port)
        if not 1 <= port <= 65535:
            raise ValueError
    except (TypeError, ValueError):
        return None, JsonResponse(
            {"error": "Port must be between 1 and 65535."},
            status=400,
        )

    return {
        "host": host,
        "port": port,
        "username": username,
        "password": password,
        "service_name": service_name,
        "table": table,
    }, None


def open_oracle_connection(details):
    """Open an Oracle connection using Thin mode."""

    dsn = oracledb.makedsn(
        details["host"],
        details["port"],
        service_name=details["service_name"],
    )

    return oracledb.connect(
        user=details["username"],
        password=details["password"],
        dsn=dsn,
        tcp_connect_timeout=5,
    )


def get_oracle_accessible_tables(connection):
    """Return tables and views accessible to the current Oracle user."""

    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            SELECT TABLE_NAME
            FROM USER_TABLES
            UNION
            SELECT VIEW_NAME
            FROM USER_VIEWS
            ORDER BY 1
            """
        )

        return [row[0] for row in cursor.fetchall()]

    finally:
        cursor.close()


def validate_oracle_table(connection, table):
    """Ensure the requested table or view belongs to the current user."""

    if not table or len(table) > 128:
        return False

    allowed_tables = get_oracle_accessible_tables(connection)

    return table in allowed_tables


def oracle_value_to_string(value):
    """Convert Oracle values into CSV-compatible values."""

    if value is None:
        return ""

    # Oracle LOB values need to be read before exporting.
    if hasattr(value, "read") and callable(value.read):
        value = value.read()

    if isinstance(value, bytes):
        return value.hex()

    return value


def oracle_records_to_json(columns, rows):
    """Convert Oracle rows into JSON-safe dictionaries."""

    records = []

    for row in rows:
        record = {}

        for column, value in zip(columns, row):
            record[column] = oracle_value_to_string(value)

        records.append(record)

    return json.loads(json.dumps(records, default=str))


@csrf_exempt
@require_POST
@role_required("admin", "user")
def connect_oracle(request):
    """Test Oracle connection and list accessible tables."""

    details, error_response = get_oracle_request_data(request)

    if error_response:
        return error_response

    connection = None

    try:
        connection = open_oracle_connection(details)

        tables = get_oracle_accessible_tables(connection)

        return JsonResponse(
            {
                "message": "Oracle connection successful.",
                "database": details["service_name"],
                "username": details["username"],
                "tables": tables,
                "table_count": len(tables),
            }
        )

    except oracledb.Error:
        return JsonResponse(
            {
                "error": (
                    "Could not connect to Oracle. Check the host, port, "
                    "service name, username, password, and server availability."
                )
            },
            status=400,
        )

    finally:
        if connection is not None:
            connection.close()



@csrf_exempt
@require_POST
@role_required("admin", "user")
def preview_oracle_table(request):
    """Preview the first 100 records from an Oracle table or view."""

    details, error_response = get_oracle_request_data(request)

    if error_response:
        return error_response

    connection = None
    cursor = None

    try:
        connection = open_oracle_connection(details)

        table = details["table"]

        if not validate_oracle_table(connection, table):
            return JsonResponse(
                {"error": "Table not found or not accessible."},
                status=404,
            )

        # Oracle 11g compatible query.
        # Table name is validated against USER_TABLES and USER_VIEWS.
        table_name = table.replace('"', '""')

        cursor = connection.cursor()

        cursor.execute(
            f'SELECT * FROM "{table_name}" WHERE ROWNUM <= 100'
        )

        columns = [item[0] for item in cursor.description]
        rows = cursor.fetchall()

        records = oracle_records_to_json(columns, rows)

        return JsonResponse({
            "database": details["service_name"],
            "table": table,
            "columns": columns,
            "rows": records,
            "row_count": len(records),
            "preview_limit": ORACLE_PREVIEW_ROWS,
        })

    except oracledb.Error as exc:
        print("ORACLE PREVIEW ERROR:", exc)

        return JsonResponse(
            {
                "error": (
                    "Unable to preview this Oracle table. "
                    "Check the table name, connection, and SELECT permissions."
                )
            },
            status=400,
        )

    except Exception as exc:
        print("ORACLE PREVIEW UNEXPECTED ERROR:", exc)

        return JsonResponse(
            {"error": "Unexpected error while previewing Oracle table."},
            status=500,
        )

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None:
            connection.close()


@csrf_exempt
@require_POST
@role_required("admin", "user")
def import_oracle_table(request):
    """Import an Oracle table into the existing Cognify Data pipeline."""

    details, error_response = get_oracle_request_data(request)

    if error_response:
        return error_response

    connection = None
    cursor = None
    output = None

    try:
        connection = open_oracle_connection(details)

        if not validate_oracle_table(connection, details["table"]):
            return JsonResponse(
                {"error": "Table not found or not accessible."},
                status=404,
            )

        table_name = details["table"].replace('"', '""')

        cursor = connection.cursor()
        cursor.execute(f'SELECT * FROM "{table_name}"')

        columns = [item[0] for item in cursor.description]

        output = io.StringIO(newline="")
        writer = csv.writer(output)
        writer.writerow(columns)

        imported_rows = 0

        while True:
            batch = cursor.fetchmany(1000)

            if not batch:
                break

            for row in batch:
                if imported_rows >= ORACLE_MAX_IMPORT_ROWS:
                    return JsonResponse(
                        {
                            "error": (
                                "This Oracle table exceeds the import "
                                f"limit of {ORACLE_MAX_IMPORT_ROWS} rows."
                            )
                        },
                        status=413,
                    )

                writer.writerow([
                    oracle_value_to_string(value)
                    for value in row
                ])

                imported_rows += 1

                if output.tell() > ORACLE_MAX_IMPORT_BYTES:
                    return JsonResponse(
                        {
                            "error": (
                                "The Oracle table export exceeds the "
                                "10 MB import limit. Reduce the table "
                                "before importing."
                            )
                        },
                        status=413,
                    )

        csv_content = output.getvalue().encode("utf-8")

        df = pd.read_csv(io.BytesIO(csv_content))

        preview = dataframe_to_json_records(df)

        dataset = Dataset(
            user=request.user,
            filename=f"{details['table']}.csv",
            file_type="csv",
            rows_count=len(df),
            columns_count=len(df.columns),
            missing_values=int(df.isna().sum().sum()),
            duplicate_rows=int(df.duplicated().sum()),
            columns=[str(column) for column in df.columns],
            preview=preview,
        )

        dataset.uploaded_file.save(
            f"{details['table']}.csv",
            ContentFile(csv_content),
            save=False,
        )

        dataset.save()

        return JsonResponse(
            {
                "message": "Oracle table imported successfully.",
                "id": dataset.id,
                "filename": dataset.filename,
                "rows": dataset.rows_count,
                "columns_count": dataset.columns_count,
            },
            status=201,
        )

    except oracledb.Error:
        return JsonResponse(
            {
                "error": (
                    "Unable to import this Oracle table. Check your "
                    "Oracle connection and SELECT permissions."
                )
            },
            status=400,
        )

    except Exception:
        return JsonResponse(
            {
                "error": (
                    "Unable to process the Oracle table for import. "
                    "Check its column types and data."
                )
            },
            status=400,
        )

    finally:
        if output is not None:
            output.close()

        if cursor is not None:
            cursor.close()

        if connection is not None:
            connection.close()
            
            

# ============================================================
# SQLITE DATABASE INTEGRATION
# ============================================================

import sqlite3

SQLITE_DATABASE_DIR = Path(__file__).resolve().parent / "sqlite_databases"

SQLITE_MAX_IMPORT_BYTES = 10 * 1024 * 1024
SQLITE_MAX_IMPORT_ROWS = 50000
SQLITE_PREVIEW_ROWS = 100


def get_sqlite_request_data(request):
    """Validate SQLite database filename and selected table."""

    try:
        body = json.loads(request.body or "{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None, JsonResponse(
            {"error": "Invalid JSON request."},
            status=400,
        )

    database_file = body.get("database_file", "")
    table = body.get("table", "")

    if not isinstance(database_file, str) or not isinstance(table, str):
        return None, JsonResponse(
            {"error": "Invalid database filename or table."},
            status=400,
        )

    database_file = database_file.strip()
    table = table.strip()

    if not database_file:
        return None, JsonResponse(
            {"error": "Please provide a SQLite database filename."},
            status=400,
        )

    # Accept filenames only, not arbitrary paths.
    if Path(database_file).name != database_file:
        return None, JsonResponse(
            {"error": "Only database filenames are accepted."},
            status=400,
        )

    extension = Path(database_file).suffix.lower()

    if extension not in {".db", ".sqlite", ".sqlite3"}:
        return None, JsonResponse(
            {"error": "Supported formats: .db, .sqlite, .sqlite3"},
            status=400,
        )

    database_path = (SQLITE_DATABASE_DIR / database_file).resolve()

    try:
        database_path.relative_to(SQLITE_DATABASE_DIR.resolve())
    except ValueError:
        return None, JsonResponse(
            {"error": "Invalid database file location."},
            status=400,
        )

    if not database_path.is_file():
        return None, JsonResponse(
            {"error": "SQLite database file not found in the allowed folder."},
            status=404,
        )

    return {
        "database_file": database_file,
        "database_path": database_path,
        "table": table,
    }, None


def open_sqlite_connection(database_path):
    """Open an existing SQLite database in read-only mode."""

    uri = database_path.as_uri() + "?mode=ro"

    connection = sqlite3.connect(
        uri,
        uri=True,
        timeout=5,
    )

    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only = ON")

    return connection


def get_sqlite_accessible_tables(connection):
    """List user-created SQLite tables and views."""

    cursor = connection.cursor()

    try:
        cursor.execute("""
            SELECT name
            FROM sqlite_master
            WHERE type IN ('table', 'view')
              AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        """)

        return [row["name"] for row in cursor.fetchall()]

    finally:
        cursor.close()


def validate_sqlite_table(connection, table):
    """Verify that a table or view exists in this database."""

    if not table or len(table) > 128:
        return False

    return table in get_sqlite_accessible_tables(connection)


def sqlite_value_to_string(value):
    """Convert SQLite values into CSV-compatible values."""

    if value is None:
        return ""

    if isinstance(value, bytes):
        return value.hex()

    return value


@csrf_exempt
@require_POST
@role_required("admin", "user")
def connect_sqlite(request):
    """Test SQLite connection and list available tables."""

    details, error_response = get_sqlite_request_data(request)

    if error_response:
        return error_response

    connection = None

    try:
        connection = open_sqlite_connection(
            details["database_path"]
        )

        tables = get_sqlite_accessible_tables(connection)

        return JsonResponse({
            "message": "SQLite connection successful.",
            "database": details["database_file"],
            "tables": tables,
            "table_count": len(tables),
        })

    except sqlite3.Error as exc:
        print("SQLITE CONNECTION ERROR:", exc)

        return JsonResponse(
            {"error": "Unable to open this SQLite database. Check the file."},
            status=400,
        )

    finally:
        if connection is not None:
            connection.close()


@csrf_exempt
@require_POST
@role_required("admin", "user")
def preview_sqlite_table(request):
    """Preview up to 100 rows from a SQLite table or view."""

    details, error_response = get_sqlite_request_data(request)

    if error_response:
        return error_response

    connection = None
    cursor = None

    try:
        connection = open_sqlite_connection(
            details["database_path"]
        )

        table = details["table"]

        if not validate_sqlite_table(connection, table):
            return JsonResponse(
                {"error": "Table not found in the selected SQLite database."},
                status=404,
            )

        # The identifier is validated against sqlite_master.
        table_name = table.replace('"', '""')

        cursor = connection.cursor()

        cursor.execute(
            f'SELECT * FROM "{table_name}" LIMIT 100'
        )

        columns = [item[0] for item in cursor.description]
        rows = cursor.fetchall()

        records = [
            {
                column: sqlite_value_to_string(row[column])
                for column in columns
            }
            for row in rows
        ]

        records = json.loads(json.dumps(records, default=str))

        return JsonResponse({
            "database": details["database_file"],
            "table": table,
            "columns": columns,
            "rows": records,
            "row_count": len(records),
            "preview_limit": SQLITE_PREVIEW_ROWS,
        })

    except sqlite3.Error as exc:
        print("SQLITE PREVIEW ERROR:", exc)

        return JsonResponse(
            {"error": "Unable to preview this SQLite table."},
            status=400,
        )

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None:
            connection.close()


@csrf_exempt
@require_POST
@role_required("admin", "user")
def import_sqlite_table(request):
    """Import a SQLite table into the existing Cognify Data pipeline."""

    details, error_response = get_sqlite_request_data(request)

    if error_response:
        return error_response

    connection = None
    cursor = None
    output = None

    try:
        connection = open_sqlite_connection(
            details["database_path"]
        )

        table = details["table"]

        if not validate_sqlite_table(connection, table):
            return JsonResponse(
                {"error": "Table not found in the selected SQLite database."},
                status=404,
            )

        table_name = table.replace('"', '""')

        cursor = connection.cursor()

        cursor.execute(
            f'SELECT * FROM "{table_name}"'
        )

        columns = [item[0] for item in cursor.description]

        output = io.StringIO(newline="")
        writer = csv.writer(output)
        writer.writerow(columns)

        imported_rows = 0

        while True:
            batch = cursor.fetchmany(1000)

            if not batch:
                break

            for row in batch:
                if imported_rows >= SQLITE_MAX_IMPORT_ROWS:
                    return JsonResponse(
                        {
                            "error": (
                                "This SQLite table exceeds the "
                                f"{SQLITE_MAX_IMPORT_ROWS} row import limit."
                            )
                        },
                        status=413,
                    )

                writer.writerow([
                    sqlite_value_to_string(value)
                    for value in row
                ])

                imported_rows += 1

                if output.tell() > SQLITE_MAX_IMPORT_BYTES:
                    return JsonResponse(
                        {
                            "error": (
                                "The SQLite table export exceeds the "
                                "10 MB import limit."
                            )
                        },
                        status=413,
                    )

        csv_content = output.getvalue().encode("utf-8")

        df = pd.read_csv(io.BytesIO(csv_content))

        preview = dataframe_to_json_records(df)

        dataset = Dataset(
            user=request.user,
            filename=f"{table}.csv",
            file_type="csv",
            rows_count=len(df),
            columns_count=len(df.columns),
            missing_values=int(df.isna().sum().sum()),
            duplicate_rows=int(df.duplicated().sum()),
            columns=[str(column) for column in df.columns],
            preview=preview,
        )

        dataset.uploaded_file.save(
            f"{table}.csv",
            ContentFile(csv_content),
            save=False,
        )

        dataset.save()

        return JsonResponse(
            {
                "message": "SQLite table imported successfully.",
                "id": dataset.id,
                "filename": dataset.filename,
                "rows": dataset.rows_count,
                "columns_count": dataset.columns_count,
            },
            status=201,
        )

    except sqlite3.Error as exc:
        print("SQLITE IMPORT ERROR:", exc)

        return JsonResponse(
            {"error": "Unable to import this SQLite table."},
            status=400,
        )

    except Exception as exc:
        print("SQLITE IMPORT PROCESSING ERROR:", exc)

        return JsonResponse(
            {"error": "Unable to process this SQLite table for import."},
            status=400,
        )

    finally:
        if output is not None:
            output.close()

        if cursor is not None:
            cursor.close()

        if connection is not None:
            connection.close()



# ============================================================
# POSTGRESQL DATABASE CONNECTOR
# ============================================================

import json
import csv
import io
import psycopg

from psycopg import sql
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.core.files.base import ContentFile
from .models import Dataset


POSTGRESQL_MAX_IMPORT_ROWS = 50000
POSTGRESQL_MAX_IMPORT_BYTES = 10 * 1024 * 1024
POSTGRESQL_PREVIEW_ROWS = 100



def get_postgresql_connection(data):
    import psycopg

    connection = psycopg.connect(
        host=data.get("host"),
        port=int(data.get("port", 5432)),
        dbname=data.get("database"),
        user=data.get("username"),
        password=data.get("password"),
        connect_timeout=15,
        sslmode="require"
    )

    # Apply session settings after connecting.
    # Do not send statement_timeout through startup options.
    connection.execute("SET statement_timeout = '15s'")
    connection.execute("SET default_transaction_read_only = on")

    return connection


def get_postgresql_table_columns(connection, schema_name, table_name):
    """Return column names after verifying the table exists."""

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = %s
              AND table_name = %s
            ORDER BY ordinal_position
            """,
            (schema_name, table_name),
        )

        return [row[0] for row in cursor.fetchall()]


def postgresql_json_value(value):
    """Convert database values into JSON-safe values."""

    if value is None:
        return None

    if hasattr(value, "isoformat"):
        return value.isoformat()

    if isinstance(value, (str, int, float, bool)):
        return value

    return str(value)


@csrf_exempt
@role_required("admin", "user")
def connect_postgresql(request):
    """Test PostgreSQL connection and list available tables."""

    if request.method != "POST":
        return JsonResponse(
            {"success": False, "message": "POST method required."},
            status=405,
        )

    connection = None

    try:
        data = json.loads(request.body or "{}")
        connection = get_postgresql_connection(data)

        schema_name = data.get("schema", "public").strip() or "public"

        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = %s
                  AND table_type = 'BASE TABLE'
                ORDER BY table_name
                """,
                (schema_name,),
            )

            tables = [row[0] for row in cursor.fetchall()]

        return JsonResponse({
            "success": True,
            "message": "PostgreSQL connection successful.",
            "database": data["database"],
            "schema": schema_name,
            "tables": tables,
        })

    except Exception as e:
        return JsonResponse(
            {"success": False, "message": str(e)},
            status=400,
        )

    finally:
        if connection:
            connection.close()


@csrf_exempt
@role_required("admin", "user")
def preview_postgresql_table(request):
    """Preview the first 100 rows of a PostgreSQL table."""

    if request.method != "POST":
        return JsonResponse(
            {"success": False, "message": "POST method required."},
            status=405,
        )

    connection = None

    try:
        data = json.loads(request.body or "{}")

        schema_name = data.get("schema", "public").strip() or "public"
        table_name = data.get("table_name", "").strip()

        if not table_name:
            raise ValueError("Table name is required.")

        connection = get_postgresql_connection(data)

        columns = get_postgresql_table_columns(
            connection, schema_name, table_name
        )

        if not columns:
            raise ValueError("Table not found or has no columns.")

        query = sql.SQL(
            "SELECT * FROM {}.{} LIMIT %s"
        ).format(
            sql.Identifier(schema_name),
            sql.Identifier(table_name),
        )

        with connection.cursor() as cursor:
            cursor.execute(query, (POSTGRESQL_PREVIEW_ROWS,))
            rows = cursor.fetchall()

        preview = [
            {
                column: postgresql_json_value(value)
                for column, value in zip(columns, row)
            }
            for row in rows
        ]

        return JsonResponse({
            "success": True,
            "table_name": table_name,
            "schema": schema_name,
            "columns": columns,
            "preview": preview,
            "rows_count": len(preview),
        })

    except Exception as e:
        return JsonResponse(
            {"success": False, "message": str(e)},
            status=400,
        )

    finally:
        if connection:
            connection.close()


@csrf_exempt
@role_required("admin", "user")
def import_postgresql_table(request):
    """Import a PostgreSQL table into Cognify Data as a CSV dataset."""

    if request.method != "POST":
        return JsonResponse(
            {"success": False, "message": "POST method required."},
            status=405,
        )

    connection = None

    try:
        data = json.loads(request.body or "{}")

        schema_name = data.get("schema", "public").strip() or "public"
        table_name = data.get("table_name", "").strip()

        if not table_name:
            raise ValueError("Table name is required.")

        connection = get_postgresql_connection(data)

        columns = get_postgresql_table_columns(
            connection, schema_name, table_name
        )

        if not columns:
            raise ValueError("Table not found or has no columns.")

        query = sql.SQL(
            "SELECT * FROM {}.{} LIMIT %s"
        ).format(
            sql.Identifier(schema_name),
            sql.Identifier(table_name),
        )

        with connection.cursor() as cursor:
            cursor.execute(query, (POSTGRESQL_MAX_IMPORT_ROWS + 1,))
            rows = cursor.fetchall()

        if len(rows) > POSTGRESQL_MAX_IMPORT_ROWS:
            raise ValueError(
                f"Import limited to {POSTGRESQL_MAX_IMPORT_ROWS} rows. "
                "Use a smaller table or filtered source."
            )

        # Build CSV content.
        csv_buffer = io.StringIO()
        writer = csv.writer(csv_buffer)

        writer.writerow(columns)

        missing_values = 0
        seen_rows = set()
        duplicate_rows = 0

        for row in rows:
            writer.writerow([
                "" if value is None else str(value)
                for value in row
            ])

            missing_values += sum(value is None for value in row)

            normalized_row = tuple(
                str(value) if value is not None else None
                for value in row
            )

            if normalized_row in seen_rows:
                duplicate_rows += 1
            else:
                seen_rows.add(normalized_row)

        csv_content = csv_buffer.getvalue().encode("utf-8")

        if len(csv_content) > POSTGRESQL_MAX_IMPORT_BYTES:
            raise ValueError(
                "Imported CSV exceeds the 10 MB size limit."
            )

        filename = f"{table_name}_postgresql.csv"

        dataset = Dataset.objects.create(
            user=request.user,
            filename=filename,
            file_type="csv",
            uploaded_file=ContentFile(
                csv_content,
                name=filename,
            ),
            rows_count=len(rows),
            columns_count=len(columns),
            missing_values=missing_values,
            duplicate_rows=duplicate_rows,
            columns=columns,
            preview=[
                {
                    column: postgresql_json_value(value)
                    for column, value in zip(columns, row)
                }
                for row in rows[:POSTGRESQL_PREVIEW_ROWS]
            ],
        )

        return JsonResponse({
            "success": True,
            "message": "PostgreSQL table imported successfully.",
            "dataset_id": dataset.id,
            "filename": dataset.filename,
            "rows_count": dataset.rows_count,
            "columns_count": dataset.columns_count,
        })

    except Exception as e:
        return JsonResponse(
            {"success": False, "message": str(e)},
            status=400,
        )

    finally:
        if connection:
            connection.close()
            
            
            

# ============================================================
# MONGODB ATLAS INTEGRATION
# ============================================================

import csv
import json
from io import StringIO
from datetime import datetime, date
from decimal import Decimal

from bson import ObjectId
from pymongo import MongoClient
from pymongo.errors import (
    PyMongoError,
    ServerSelectionTimeoutError
)


MONGODB_MAX_IMPORT_ROWS = 50000
MONGODB_MAX_IMPORT_BYTES = 10 * 1024 * 1024
MONGODB_PREVIEW_ROWS = 100


def get_mongodb_connection(data):
    """
    Connect to MongoDB Atlas or another MongoDB server.
    """

    connection_string = data.get("connection_string", "").strip()

    if not connection_string:
        raise ValueError("MongoDB connection string is required.")

    client = MongoClient(
        connection_string,
        serverSelectionTimeoutMS=10000,
        connectTimeoutMS=10000,
        socketTimeoutMS=15000,
        readPreference="secondaryPreferred"
    )

    # Force connection verification.
    client.admin.command("ping")

    return client


def mongodb_json_value(value):
    """
    Convert MongoDB BSON values into JSON-compatible values.
    """

    if isinstance(value, ObjectId):
        return str(value)

    if isinstance(value, (datetime, date)):
        return value.isoformat()

    if isinstance(value, Decimal):
        return float(value)

    if isinstance(value, bytes):
        return value.hex()

    if isinstance(value, dict):
        return {
            str(key): mongodb_json_value(item)
            for key, item in value.items()
        }

    if isinstance(value, list):
        return [
            mongodb_json_value(item)
            for item in value
        ]

    return value


def mongodb_get_database_and_collection(client, data):
    database_name = data.get("database", "").strip()
    collection_name = data.get("collection", "").strip()

    if not database_name:
        raise ValueError("Database name is required.")

    if not collection_name:
        raise ValueError("Collection name is required.")

    database = client[database_name]

    if collection_name not in database.list_collection_names():
        raise ValueError("The selected collection does not exist.")

    return database, database[collection_name]


def mongodb_documents_to_csv(documents):
    """
    Convert MongoDB documents into CSV content.
    """

    columns = []

    for document in documents:
        for key in document.keys():
            if key not in columns:
                columns.append(key)

    if not columns:
        return "", [], 0

    output = StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=columns,
        extrasaction="ignore"
    )

    writer.writeheader()

    for document in documents:
        row = {}

        for column in columns:
            value = mongodb_json_value(document.get(column))

            if isinstance(value, (dict, list)):
                value = json.dumps(value, ensure_ascii=False)

            row[column] = value

        writer.writerow(row)

    csv_content = output.getvalue()

    return csv_content, columns, len(documents)


from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.core.files.base import ContentFile
from django.http import JsonResponse


@csrf_exempt
@require_POST
@role_required("admin", "user")
def connect_mongodb(request):
    client = None

    try:
        data = json.loads(request.body or "{}")

        database_name = data.get("database", "").strip()

        if not database_name:
            return JsonResponse({
                "success": False,
                "message": "Database name is required."
            }, status=400)

        client = get_mongodb_connection(data)

        database = client[database_name]

        collections = database.list_collection_names()

        return JsonResponse({
            "success": True,
            "message": "MongoDB connection successful.",
            "database": database_name,
            "collections": sorted(collections)
        })

    except ServerSelectionTimeoutError as error:
        return JsonResponse({
            "success": False,
            "message": f"MongoDB connection timeout: {str(error)}"
        }, status=400)

    except (ValueError, PyMongoError) as error:
        return JsonResponse({
            "success": False,
            "message": str(error)
        }, status=400)

    except Exception as error:
        return JsonResponse({
            "success": False,
            "message": f"MongoDB connection failed: {str(error)}"
        }, status=500)

    finally:
        if client:
            client.close()


@csrf_exempt
@require_POST
@role_required("admin", "user")
def preview_mongodb_collection(request):
    client = None

    try:
        data = json.loads(request.body or "{}")

        client = get_mongodb_connection(data)

        database, collection = mongodb_get_database_and_collection(
            client,
            data
        )

        documents = list(
            collection.find({}).limit(MONGODB_PREVIEW_ROWS)
        )

        preview = [
            mongodb_json_value(document)
            for document in documents
        ]

        columns = []

        for document in preview:
            for key in document.keys():
                if key not in columns:
                    columns.append(key)

        total_documents = collection.count_documents({})

        return JsonResponse({
            "success": True,
            "database": database.name,
            "collection": collection.name,
            "columns": columns,
            "preview": preview,
            "rows_count": total_documents,
            "preview_count": len(preview)
        })

    except ServerSelectionTimeoutError as error:
        return JsonResponse({
            "success": False,
            "message": f"MongoDB connection timeout: {str(error)}"
        }, status=400)

    except (ValueError, PyMongoError) as error:
        return JsonResponse({
            "success": False,
            "message": str(error)
        }, status=400)

    except Exception as error:
        return JsonResponse({
            "success": False,
            "message": f"Preview failed: {str(error)}"
        }, status=500)

    finally:
        if client:
            client.close()


@csrf_exempt
@require_POST
@role_required("admin", "user")
def import_mongodb_collection(request):
    client = None

    try:
        data = json.loads(request.body or "{}")

        client = get_mongodb_connection(data)

        database, collection = mongodb_get_database_and_collection(
            client,
            data
        )

        total_documents = collection.count_documents({})

        if total_documents == 0:
            return JsonResponse({
                "success": False,
                "message": "The selected collection is empty."
            }, status=400)

        if total_documents > MONGODB_MAX_IMPORT_ROWS:
            return JsonResponse({
                "success": False,
                "message": (
                    f"Collection contains {total_documents} documents. "
                    f"Maximum import limit is "
                    f"{MONGODB_MAX_IMPORT_ROWS} documents."
                )
            }, status=400)

        documents = list(
            collection.find({}).limit(MONGODB_MAX_IMPORT_ROWS)
        )

        csv_content, columns, rows_count = (
            mongodb_documents_to_csv(documents)
        )

        csv_bytes = csv_content.encode("utf-8")

        if len(csv_bytes) > MONGODB_MAX_IMPORT_BYTES:
            return JsonResponse({
                "success": False,
                "message": (
                    "Generated CSV exceeds the 10 MB import limit."
                )
            }, status=400)

        filename = (
            f"{database.name}_{collection.name}.csv"
        )

        dataset = Dataset(
            user=request.user,
            filename=filename,
            file_type="csv",
            rows_count=rows_count,
            columns_count=len(columns),
            missing_values=0,
            duplicate_rows=0,
            columns=columns,
            preview=[
                mongodb_json_value(document)
                for document in documents[:5]
            ]
        )

        dataset.uploaded_file.save(
            filename,
            ContentFile(csv_bytes),
            save=True
        )

        return JsonResponse({
            "success": True,
            "message": "MongoDB collection imported successfully.",
            "dataset_id": dataset.id,
            "filename": dataset.filename,
            "rows_count": dataset.rows_count,
            "columns_count": dataset.columns_count
        })

    except ServerSelectionTimeoutError as error:
        return JsonResponse({
            "success": False,
            "message": f"MongoDB connection timeout: {str(error)}"
        }, status=400)

    except (ValueError, PyMongoError) as error:
        return JsonResponse({
            "success": False,
            "message": str(error)
        }, status=400)

    except Exception as error:
        return JsonResponse({
            "success": False,
            "message": f"Import failed: {str(error)}"
        }, status=500)

    finally:
        if client:
            client.close()

# ============================================================
# MICROSOFT SQL SERVER DATABASE INTEGRATION
# ============================================================

import pyodbc


SQLSERVER_MAX_IMPORT_ROWS = 50000
SQLSERVER_MAX_IMPORT_BYTES = 10 * 1024 * 1024
SQLSERVER_PREVIEW_ROWS = 100


def get_sqlserver_request_data(request):
    """Read and validate SQL Server connection details."""

    try:
        data = json.loads(request.body or "{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None, JsonResponse(
            {"success": False, "message": "Invalid JSON request."},
            status=400
        )

    host = str(data.get("host", "")).strip()
    database = str(data.get("database", "")).strip()
    username = str(data.get("username", "")).strip()
    password = data.get("password", "")
    port = data.get("port", 1433)
    driver = str(
        data.get("driver", "ODBC Driver 18 for SQL Server")
    ).strip()

    schema = str(data.get("schema", "dbo")).strip() or "dbo"
    table_name = data.get("table_name", "")

    if not all([host, database, username, driver]):
        return None, JsonResponse(
            {
                "success": False,
                "message": "Host, database, username and driver are required."
            },
            status=400
        )

    if not isinstance(password, str):
        return None, JsonResponse(
            {"success": False, "message": "Password must be a string."},
            status=400
        )

    if not isinstance(table_name, str):
        return None, JsonResponse(
            {"success": False, "message": "Invalid table name."},
            status=400
        )

    try:
        port = int(port)
        if not 1 <= port <= 65535:
            raise ValueError
    except (TypeError, ValueError):
        return None, JsonResponse(
            {"success": False, "message": "Invalid SQL Server port."},
            status=400
        )

    return {
        "host": host,
        "port": port,
        "database": database,
        "username": username,
        "password": password,
        "driver": driver,
        "schema": schema,
        "table_name": table_name.strip(),
    }, None


def sqlserver_connection_value(value):
    """Escape a value for an ODBC connection-string field."""
    return "{" + str(value).replace("}", "}}") + "}"


def get_sqlserver_connection(details):
    """Connect to local SQL Server, remote SQL Server or Azure SQL."""

    host = details["host"]

    # Allow host\instance or host,port formats.
    if "\\" in host or "," in host:
        server = host
    else:
        server = f"{host},{details['port']}"

    connection_string = (
        f"DRIVER={sqlserver_connection_value(details['driver'])};"
        f"SERVER={sqlserver_connection_value(server)};"
        f"DATABASE={sqlserver_connection_value(details['database'])};"
        f"UID={sqlserver_connection_value(details['username'])};"
        f"PWD={sqlserver_connection_value(details['password'])};"
        "Encrypt=yes;"
        "TrustServerCertificate=yes;"
        "Connection Timeout=10;"
    )

    return pyodbc.connect(connection_string, timeout=10)


def get_sqlserver_accessible_tables(connection):
    """List accessible SQL Server tables and views."""

    cursor = connection.cursor()

    try:
        cursor.execute("""
            SELECT
                TABLE_SCHEMA,
                TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_TYPE IN ('BASE TABLE', 'VIEW')
            ORDER BY TABLE_SCHEMA, TABLE_NAME
        """)

        return [
            f"{row[0]}.{row[1]}"
            for row in cursor.fetchall()
        ]

    finally:
        cursor.close()


def parse_sqlserver_table_name(table_name, default_schema="dbo"):
    """Split a table name into schema and table components."""

    if not table_name or len(table_name) > 257:
        raise ValueError("A valid table name is required.")

    parts = table_name.split(".")

    if len(parts) == 1:
        schema_name = default_schema
        actual_table = parts[0]
    elif len(parts) == 2:
        schema_name, actual_table = parts
    else:
        raise ValueError(
            "Use a table name in schema.table format."
        )

    if (
        not schema_name
        or not actual_table
        or len(schema_name) > 128
        or len(actual_table) > 128
    ):
        raise ValueError("Invalid SQL Server schema or table name.")

    return schema_name, actual_table


def validate_sqlserver_table(connection, schema_name, table_name):
    """Check that the selected table or view exists."""

    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            SELECT COUNT(*)
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = ?
              AND TABLE_NAME = ?
              AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
            """,
            (schema_name, table_name)
        )

        return cursor.fetchone()[0] > 0

    finally:
        cursor.close()


def sqlserver_quote_identifier(identifier):
    """Safely quote a SQL Server identifier."""

    return "[" + identifier.replace("]", "]]") + "]"


def sqlserver_value_to_string(value):
    """Convert SQL Server values into CSV-compatible values."""

    if value is None:
        return ""

    if isinstance(value, bytes):
        return value.hex()

    if hasattr(value, "isoformat"):
        return value.isoformat()

    return str(value)


@csrf_exempt
@require_POST
@role_required("admin", "user")
def connect_sqlserver(request):
    """Test SQL Server connection and list available tables."""

    details, error_response = get_sqlserver_request_data(request)

    if error_response:
        return error_response

    connection = None

    try:
        connection = get_sqlserver_connection(details)

        tables = get_sqlserver_accessible_tables(connection)

        return JsonResponse({
            "success": True,
            "message": "SQL Server connection successful.",
            "database": details["database"],
            "tables": tables,
            "table_count": len(tables)
        })

    except pyodbc.Error as error:
        print("SQL SERVER CONNECTION ERROR:", error)

        return JsonResponse({
            "success": False,
            "message": (
                "Unable to connect to SQL Server. Check the server address, "
                "port, database, SQL login credentials and ODBC driver."
            )
        }, status=400)

    finally:
        if connection is not None:
            connection.close()


@csrf_exempt
@require_POST
@role_required("admin", "user")
def preview_sqlserver_table(request):
    """Preview the first 100 rows of a SQL Server table or view."""

    details, error_response = get_sqlserver_request_data(request)

    if error_response:
        return error_response

    connection = None
    cursor = None

    try:
        if not details["table_name"]:
            raise ValueError("Table name is required.")

        schema_name, table_name = parse_sqlserver_table_name(
            details["table_name"],
            details["schema"]
        )

        connection = get_sqlserver_connection(details)

        if not validate_sqlserver_table(
            connection, schema_name, table_name
        ):
            return JsonResponse({
                "success": False,
                "message": "Table not found or not accessible."
            }, status=404)

        qualified_table = (
            f"{sqlserver_quote_identifier(schema_name)}."
            f"{sqlserver_quote_identifier(table_name)}"
        )

        cursor = connection.cursor()
        cursor.execute(
            f"SELECT TOP ({SQLSERVER_PREVIEW_ROWS}) * "
            f"FROM {qualified_table}"
        )

        columns = [column[0] for column in cursor.description]
        rows = cursor.fetchall()

        records = [
            {
                column: sqlserver_value_to_string(value)
                for column, value in zip(columns, row)
            }
            for row in rows
        ]

        return JsonResponse({
            "success": True,
            "database": details["database"],
            "table_name": f"{schema_name}.{table_name}",
            "columns": columns,
            "preview": records,
            "rows_count": len(records),
            "preview_limit": SQLSERVER_PREVIEW_ROWS
        })

    except ValueError as error:
        return JsonResponse({
            "success": False,
            "message": str(error)
        }, status=400)

    except pyodbc.Error as error:
        print("SQL SERVER PREVIEW ERROR:", error)

        return JsonResponse({
            "success": False,
            "message": "Unable to preview the SQL Server table."
        }, status=400)

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None:
            connection.close()


@csrf_exempt
@require_POST
@role_required("admin", "user")
def import_sqlserver_table(request):
    """Import a SQL Server table into Cognify Data as a CSV dataset."""

    details, error_response = get_sqlserver_request_data(request)

    if error_response:
        return error_response

    connection = None
    cursor = None
    output = None

    try:
        if not details["table_name"]:
            raise ValueError("Table name is required.")

        schema_name, table_name = parse_sqlserver_table_name(
            details["table_name"],
            details["schema"]
        )

        connection = get_sqlserver_connection(details)

        if not validate_sqlserver_table(
            connection, schema_name, table_name
        ):
            return JsonResponse({
                "success": False,
                "message": "Table not found or not accessible."
            }, status=404)

        qualified_table = (
            f"{sqlserver_quote_identifier(schema_name)}."
            f"{sqlserver_quote_identifier(table_name)}"
        )

        cursor = connection.cursor()
        cursor.execute(
            f"SELECT TOP ({SQLSERVER_MAX_IMPORT_ROWS + 1}) * "
            f"FROM {qualified_table}"
        )

        columns = [column[0] for column in cursor.description]

        output = io.StringIO(newline="")
        writer = csv.writer(output)
        writer.writerow(columns)

        imported_rows = 0

        while True:
            batch = cursor.fetchmany(1000)

            if not batch:
                break

            for row in batch:
                imported_rows += 1

                if imported_rows > SQLSERVER_MAX_IMPORT_ROWS:
                    return JsonResponse({
                        "success": False,
                        "message": (
                            f"Import is limited to "
                            f"{SQLSERVER_MAX_IMPORT_ROWS} rows."
                        )
                    }, status=413)

                writer.writerow([
                    sqlserver_value_to_string(value)
                    for value in row
                ])

                if output.tell() > SQLSERVER_MAX_IMPORT_BYTES:
                    return JsonResponse({
                        "success": False,
                        "message": (
                            "Generated CSV exceeds the 10 MB import limit."
                        )
                    }, status=413)

        csv_content = output.getvalue().encode("utf-8")

        df = pd.read_csv(io.BytesIO(csv_content))

        filename = f"{table_name}_sqlserver.csv"

        dataset = Dataset(
            user=request.user,
            filename=filename,
            file_type="csv",
            rows_count=len(df),
            columns_count=len(df.columns),
            missing_values=int(df.isna().sum().sum()),
            duplicate_rows=int(df.duplicated().sum()),
            columns=[str(column) for column in df.columns],
            preview=dataframe_to_json_records(df)
        )

        dataset.uploaded_file.save(
            filename,
            ContentFile(csv_content),
            save=False
        )

        dataset.save()

        return JsonResponse({
            "success": True,
            "message": "SQL Server table imported successfully.",
            "dataset_id": dataset.id,
            "filename": dataset.filename,
            "rows_count": dataset.rows_count,
            "columns_count": dataset.columns_count
        }, status=201)

    except ValueError as error:
        return JsonResponse({
            "success": False,
            "message": str(error)
        }, status=400)

    except pyodbc.Error as error:
        print("SQL SERVER IMPORT ERROR:", error)

        return JsonResponse({
            "success": False,
            "message": "Unable to import the SQL Server table."
        }, status=400)

    except Exception as error:
        print("SQL SERVER IMPORT PROCESSING ERROR:", error)

        return JsonResponse({
            "success": False,
            "message": "Unable to process the SQL Server table."
        }, status=500)

    finally:
        if output is not None:
            output.close()

        if cursor is not None:
            cursor.close()

        if connection is not None:
            connection.close()
            
            
# ============================================================
# WEB SCRAPING INTEGRATION
# Add this section at the END of datasets/views.py.
# Dependencies: requests, beautifulsoup4
# ============================================================

import ipaddress
import socket
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from django.core.files.base import ContentFile


SCRAPE_MAX_RESPONSE_BYTES = 2 * 1024 * 1024
SCRAPE_MAX_ROWS = 50000
SCRAPE_PREVIEW_ROWS = 100
SCRAPE_TIMEOUT_SECONDS = 12
SCRAPE_MAX_REDIRECTS = 3


def validate_public_http_url(url):
    """
    Validate an HTTP(S) URL and reject local/private destinations.
    Every redirect destination is validated before it is requested.
    """
    if not isinstance(url, str) or len(url) > 2048:
        raise ValueError("Enter a valid URL (maximum 2048 characters).")

    parsed = urlparse(url.strip())

    if parsed.scheme not in ("http", "https"):
        raise ValueError("Only HTTP and HTTPS URLs are supported.")

    if not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Enter a valid public website URL.")

    host = parsed.hostname.rstrip(".").lower()

    if host in {"localhost", "localhost.localdomain"}:
        raise ValueError("Local and private network addresses are not allowed.")

    try:
        addresses = {
            item[4][0]
            for item in socket.getaddrinfo(
                host, parsed.port or (443 if parsed.scheme == "https" else 80),
                type=socket.SOCK_STREAM
            )
        }
    except socket.gaierror:
        raise ValueError("The website address could not be resolved.")

    if not addresses:
        raise ValueError("The website address could not be resolved.")

    for address in addresses:
        ip = ipaddress.ip_address(address)
        if not ip.is_global:
            raise ValueError(
                "Scraping local, private, or reserved network addresses is blocked."
            )

    return parsed.geturl()


def fetch_public_webpage(url):
    """Fetch a small public HTML page, validating every redirect."""
    current_url = validate_public_http_url(url)

    session = requests.Session()
    session.trust_env = False
    headers = {
        "User-Agent": "CognifyDataBot/1.0 (+https://cognifydata.local)",
        "Accept": "text/html,application/xhtml+xml",
    }

    try:
        for redirect_count in range(SCRAPE_MAX_REDIRECTS + 1):
            response = session.get(
                current_url,
                headers=headers,
                timeout=(5, SCRAPE_TIMEOUT_SECONDS),
                allow_redirects=False,
                stream=True,
            )

            if response.is_redirect or response.is_permanent_redirect:
                location = response.headers.get("Location")
                response.close()

                if not location:
                    raise ValueError("The website returned an invalid redirect.")

                if redirect_count >= SCRAPE_MAX_REDIRECTS:
                    raise ValueError("Too many redirects.")

                current_url = validate_public_http_url(
                    urljoin(current_url, location)
                )
                continue

            response.raise_for_status()

            content_type = response.headers.get("Content-Type", "").lower()
            if "text/html" not in content_type and "application/xhtml+xml" not in content_type:
                response.close()
                raise ValueError("The URL must return an HTML webpage.")

            content_length = response.headers.get("Content-Length")
            if content_length and int(content_length) > SCRAPE_MAX_RESPONSE_BYTES:
                response.close()
                raise ValueError("The webpage is larger than the 2 MB scraping limit.")

            chunks = []
            total_bytes = 0

            for chunk in response.iter_content(chunk_size=65536):
                if not chunk:
                    continue
                total_bytes += len(chunk)
                if total_bytes > SCRAPE_MAX_RESPONSE_BYTES:
                    response.close()
                    raise ValueError("The webpage is larger than the 2 MB scraping limit.")
                chunks.append(chunk)

            encoding = response.encoding or "utf-8"
            html = b"".join(chunks).decode(encoding, errors="replace")
            response.close()
            return current_url, html

        raise ValueError("Unable to fetch this webpage.")
    except requests.RequestException:
        raise ValueError(
            "Unable to access the webpage. Check the URL and try again."
        )
    finally:
        session.close()


def extract_webpage_records(html, page_url, extraction_type="text", selector=""):
    """Extract text, headings, links, tables, or elements matching a CSS selector."""
    soup = BeautifulSoup(html, "html.parser")

    for unwanted in soup(["script", "style", "noscript", "svg"]):
        unwanted.decompose()

    title = soup.title.get_text(" ", strip=True) if soup.title else ""

    if selector:
        try:
            elements = soup.select(selector)
        except Exception:
            raise ValueError("Invalid CSS selector.")

        records = [
            {
                "text": element.get_text(" ", strip=True),
                "tag": element.name or "",
                "url": (
                    urljoin(page_url, element.get("href", ""))
                    if element.get("href") else ""
                ),
            }
            for element in elements
            if element.get_text(" ", strip=True) or element.get("href")
        ]
        columns = ["text", "tag", "url"]

    elif extraction_type == "headings":
        records = [
            {"level": heading.name, "text": heading.get_text(" ", strip=True)}
            for heading in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"])
            if heading.get_text(" ", strip=True)
        ]
        columns = ["level", "text"]

    elif extraction_type == "links":
        records = [
            {
                "text": link.get_text(" ", strip=True),
                "url": urljoin(page_url, link.get("href", "")),
            }
            for link in soup.find_all("a", href=True)
        ]
        columns = ["text", "url"]

    elif extraction_type == "tables":
        records = []
        for table_index, table in enumerate(soup.find_all("table"), start=1):
            rows = table.find_all("tr")
            if not rows:
                continue

            table_headers = [
                cell.get_text(" ", strip=True)
                for cell in rows[0].find_all(["th", "td"])
            ]
            for row_index, row in enumerate(rows[1:], start=1):
                values = [
                    cell.get_text(" ", strip=True)
                    for cell in row.find_all(["th", "td"])
                ]
                record = {
                    "table": table_index,
                    "row": row_index,
                }
                for col_index, value in enumerate(values):
                    key = (
                        table_headers[col_index]
                        if col_index < len(table_headers) and table_headers[col_index]
                        else f"column_{col_index + 1}"
                    )
                    record[key] = value
                records.append(record)

        columns = list(dict.fromkeys(
            key for record in records for key in record.keys()
        ))

    elif extraction_type == "text":
        main = soup.find("main") or soup.find("article") or soup.body or soup
        text_value = main.get_text("\n", strip=True)
        records = [
            {"text": line.strip()}
            for line in text_value.splitlines()
            if line.strip()
        ]
        columns = ["text"]

    else:
        raise ValueError("Choose text, headings, links, or tables.")

    if len(records) > SCRAPE_MAX_ROWS:
        records = records[:SCRAPE_MAX_ROWS]

    return title, columns, records


@csrf_exempt
@require_POST
@role_required("admin", "user")
def scrape_webpage(request):
    """Fetch and preview a public webpage without saving it yet."""
    try:
        data = json.loads(request.body or "{}")
        url = data.get("url", "")
        extraction_type = data.get("extraction_type", "text")
        selector = data.get("selector", "")

        if not isinstance(selector, str) or len(selector) > 500:
            return JsonResponse({"error": "CSS selector is too long or invalid."}, status=400)

        final_url, html = fetch_public_webpage(url)
        title, columns, records = extract_webpage_records(
            html, final_url, extraction_type, selector.strip()
        )

        if not records:
            return JsonResponse(
                {"error": "No data was found. Try another extraction type or CSS selector."},
                status=404,
            )

        return JsonResponse({
            "success": True,
            "url": final_url,
            "title": title,
            "extraction_type": "css_selector" if selector.strip() else extraction_type,
            "columns": columns,
            "records": records,
            "rows_count": len(records),
            "preview": records[:SCRAPE_PREVIEW_ROWS],
            "truncated": len(records) >= SCRAPE_MAX_ROWS,
        })

    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"error": "Invalid JSON request."}, status=400)
    except ValueError as error:
        return JsonResponse({"error": str(error)}, status=400)
    except Exception:
        return JsonResponse({"error": "Web scraping failed. Please try again."}, status=500)


@csrf_exempt
@require_POST
@role_required("admin", "user")
def save_scraped_dataset(request):
    """Save reviewed scrape records through the existing Dataset pipeline."""
    try:
        data = json.loads(request.body or "{}")
        source_url = data.get("url", "")
        title = data.get("title", "")
        columns = data.get("columns", [])
        records = data.get("records", [])

        if not isinstance(source_url, str) or len(source_url) > 2048:
            return JsonResponse({"error": "Invalid source URL."}, status=400)

        # Revalidate URL before recording it as a source.
        validate_public_http_url(source_url)

        if (
            not isinstance(columns, list)
            or not columns
            or not all(isinstance(column, str) for column in columns)
        ):
            return JsonResponse({"error": "Scraped columns are invalid."}, status=400)

        if not isinstance(records, list) or not records:
            return JsonResponse({"error": "There is no scraped data to save."}, status=400)

        if len(records) > SCRAPE_MAX_ROWS:
            return JsonResponse(
                {"error": f"Maximum save limit is {SCRAPE_MAX_ROWS} rows."},
                status=413,
            )

        df = pd.DataFrame(records, columns=columns)
        if df.empty or len(df.columns) == 0:
            return JsonResponse({"error": "The scraped dataset is empty."}, status=400)

        csv_content = df.to_csv(index=False).encode("utf-8-sig")
        if len(csv_content) > MAX_FILE_SIZE:
            return JsonResponse(
                {"error": "Scraped dataset exceeds the 10 MB file limit."},
                status=413,
            )

        safe_title = "".join(
            character for character in str(title)[:60]
            if character.isalnum() or character in (" ", "-", "_")
        ).strip()
        filename = f"{safe_title or 'web_scrape'}_scraped.csv"

        dataset = Dataset(
            user=request.user,
            filename=filename,
            file_type="csv",
            rows_count=int(len(df)),
            columns_count=int(len(df.columns)),
            missing_values=int(df.isna().sum().sum()),
            duplicate_rows=int(df.duplicated().sum()),
            columns=[str(column) for column in df.columns],
            preview=dataframe_to_json_records(df),
        )
        dataset.uploaded_file.save(
            filename,
            ContentFile(csv_content),
            save=False,
        )
        dataset.save()

        return JsonResponse({
            "success": True,
            "message": "Scraped data saved to Dataset History successfully.",
            "dataset_id": dataset.id,
            "filename": dataset.filename,
            "rows_count": dataset.rows_count,
            "columns_count": dataset.columns_count,
            "missing_values": dataset.missing_values,
            "duplicate_rows": dataset.duplicate_rows,
            "preview": dataset.preview,
        }, status=201)

    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"error": "Invalid JSON request."}, status=400)
    except ValueError as error:
        return JsonResponse({"error": str(error)}, status=400)
    except Exception:
        return JsonResponse({"error": "Unable to save the scraped dataset."}, status=500)

import time
SCRAPE_CRAWL_MAX_PAGES = 10
SCRAPE_CRAWL_MAX_LINKS_PER_PAGE = 100
SCRAPE_CRAWL_DELAY_SECONDS = 0.25


def normalize_crawl_url(url):
    """Remove fragments and normalize a URL for duplicate detection."""
    parsed = urlparse(url)

    return parsed._replace(
        fragment=""
    ).geturl().rstrip("/") or parsed._replace(fragment="").geturl()


def get_same_domain_links(html, page_url, allowed_host):
    """Find public HTTP(S) links on the starting hostname."""
    soup = BeautifulSoup(html, "html.parser")
    links = []

    for anchor in soup.find_all("a", href=True):
        href = anchor.get("href", "").strip()

        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue

        absolute_url = urljoin(page_url, href)

        try:
            parsed = urlparse(absolute_url)

            if parsed.scheme not in ("http", "https"):
                continue

            if not parsed.hostname:
                continue

            if parsed.hostname.rstrip(".").lower() != allowed_host:
                continue

            # Apply the existing public-address and URL validation.
            validated_url = validate_public_http_url(absolute_url)
            normalized_url = normalize_crawl_url(validated_url)

            if normalized_url not in links:
                links.append(normalized_url)

            if len(links) >= SCRAPE_CRAWL_MAX_LINKS_PER_PAGE:
                break

        except ValueError:
            # Ignore invalid, private, or otherwise blocked links.
            continue

    return links


@csrf_exempt
@require_POST
@role_required("admin", "user")
def crawl_website(request):
    """Crawl a limited number of same-host public webpages and combine records."""

    try:
        data = json.loads(request.body or "{}")

        start_url = data.get("url", "")
        extraction_type = data.get("extraction_type", "text")
        selector = data.get("selector", "")
        max_pages = data.get("max_pages", SCRAPE_CRAWL_MAX_PAGES)

        if not isinstance(selector, str) or len(selector) > 500:
            return JsonResponse(
                {"error": "CSS selector is too long or invalid."},
                status=400,
            )

        try:
            max_pages = int(max_pages)
        except (TypeError, ValueError):
            return JsonResponse(
                {"error": "Maximum pages must be a number."},
                status=400,
            )

        if not 1 <= max_pages <= SCRAPE_CRAWL_MAX_PAGES:
            return JsonResponse(
                {
                    "error": (
                        f"Choose between 1 and "
                        f"{SCRAPE_CRAWL_MAX_PAGES} pages."
                    )
                },
                status=400,
            )

        validated_start_url = validate_public_http_url(start_url)
        start_host = urlparse(validated_start_url).hostname.rstrip(".").lower()

        pending_urls = [normalize_crawl_url(validated_start_url)]
        visited_urls = set()

        all_records = []
        all_columns = []
        pages = []
        errors = []

        while pending_urls and len(visited_urls) < max_pages:
            current_url = pending_urls.pop(0)
            current_url = normalize_crawl_url(current_url)

            if current_url in visited_urls:
                continue

            visited_urls.add(current_url)

            try:
                final_url, html = fetch_public_webpage(current_url)

                final_host = (
                    urlparse(final_url).hostname or ""
                ).rstrip(".").lower()

                if final_host != start_host:
                    errors.append({
                        "url": current_url,
                        "error": "Page redirected outside the starting hostname.",
                    })
                    continue

                title, columns, records = extract_webpage_records(
                    html,
                    final_url,
                    extraction_type,
                    selector.strip(),
                )

                page_records = []

                for record in records:
                    if len(all_records) >= SCRAPE_MAX_ROWS:
                        break

                    item = dict(record)
                    item["source_url"] = final_url
                    page_records.append(item)

                    for column in item.keys():
                        if column not in all_columns:
                            all_columns.append(column)

                all_records.extend(page_records)

                pages.append({
                    "url": final_url,
                    "title": title,
                    "rows_count": len(page_records),
                })

                # Discover more pages only while there is room to crawl.
                if len(visited_urls) < max_pages:
                    discovered_links = get_same_domain_links(
                        html,
                        final_url,
                        start_host,
                    )

                    for link in discovered_links:
                        if (
                            link not in visited_urls
                            and link not in pending_urls
                            and len(visited_urls) + len(pending_urls) < max_pages
                        ):
                            pending_urls.append(link)

                if len(all_records) >= SCRAPE_MAX_ROWS:
                    break

                if pending_urls and len(visited_urls) < max_pages:
                    time.sleep(SCRAPE_CRAWL_DELAY_SECONDS)

            except ValueError as error:
                errors.append({
                    "url": current_url,
                    "error": str(error),
                })

            except Exception:
                errors.append({
                    "url": current_url,
                    "error": "Unable to extract this webpage.",
                })

        if not all_records:
            return JsonResponse(
                {
                    "error": (
                        "No data was extracted from the crawled pages. "
                        "Try another URL or extraction type."
                    ),
                    "pages": pages,
                    "errors": errors,
                },
                status=404,
            )

        return JsonResponse({
            "success": True,
            "url": validated_start_url,
            "title": pages[0]["title"] if pages else "",
            "extraction_type": (
                "css_selector" if selector.strip() else extraction_type
            ),
            "columns": all_columns,
            "records": all_records,
            "rows_count": len(all_records),
            "preview": all_records[:SCRAPE_PREVIEW_ROWS],
            "pages_crawled": len(pages),
            "pages": pages,
            "errors": errors,
            "truncated": len(all_records) >= SCRAPE_MAX_ROWS,
        })

    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse(
            {"error": "Invalid JSON request."},
            status=400,
        )

    except ValueError as error:
        return JsonResponse(
            {"error": str(error)},
            status=400,
        )

    except Exception:
        return JsonResponse(
            {"error": "Website crawling failed. Please try again."},
            status=500,
        )
        
# ==========================================
# ADMIN PLATFORM-WIDE DASHBOARD STATISTICS
# ==========================================

@require_GET
@role_required("admin")
def admin_dashboard_stats(request):
    """
    Return platform-wide dataset statistics.
    Only administrators can access these totals.
    """

    datasets = Dataset.objects.all()

    totals = datasets.aggregate(
        total_rows=Sum("rows_count"),
        total_missing=Sum("missing_values"),
        total_duplicates=Sum("duplicate_rows"),
    )

    return JsonResponse({
        "total_datasets": datasets.count(),
        "total_rows": totals["total_rows"] or 0,
        "total_missing": totals["total_missing"] or 0,
        "total_duplicates": totals["total_duplicates"] or 0,
    })