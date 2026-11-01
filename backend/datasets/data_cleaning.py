"""Cognify Data - safe dataset cleaning and transformation API."""

import io
import json
import logging
import re
from pathlib import Path

import numpy as np
import pandas as pd
from django.core.files.base import ContentFile
from django.http import HttpResponse, JsonResponse
from django.views.decorators.http import require_POST

from accounts.permissions import role_required
from .models import Dataset
from .views import get_dataframe

logger = logging.getLogger(__name__)
MAX_PREVIEW_ROWS = 20
MAX_COLUMNS = 250
ALLOWED_MISSING_METHODS = {"drop", "mean", "median", "mode", "constant"}
ALLOWED_SCALING = {"none", "minmax", "standard"}
ALLOWED_DTYPES = {"string", "integer", "float", "datetime", "boolean"}


def _records(df, limit=MAX_PREVIEW_ROWS):
    """Return JSON-safe records for a bounded preview."""
    sample = df.head(limit).copy().astype(object)
    sample = sample.where(pd.notna(sample), None)
    return json.loads(sample.to_json(orient="records", date_format="iso", force_ascii=False))


def _column_profile(df):
    result = []
    for col in df.columns:
        series = df[col]
        missing = int(series.isna().sum())
        numeric = pd.to_numeric(series, errors="coerce")
        numeric_values = numeric.dropna()
        outliers = 0
        if len(numeric_values) >= 4:
            q1, q3 = numeric_values.quantile([0.25, 0.75])
            spread = q3 - q1
            if spread > 0:
                outliers = int(((numeric_values < q1 - 1.5 * spread) | (numeric_values > q3 + 1.5 * spread)).sum())
        result.append({
            "column": str(col), "dtype": str(series.dtype),
            "missing": missing, "missing_pct": round(missing / max(len(df), 1) * 100, 2),
            "unique": int(series.nunique(dropna=True)), "outliers_iqr": outliers,
            "numeric_candidate": bool(len(numeric_values) and numeric_values.notna().sum() == series.notna().sum()),
        })
    return result


def _profile_payload(df, dataset):
    return {
        "success": True,
        "dataset_id": dataset.id,
        "filename": dataset.filename,
        "rows": int(len(df)),
        "columns_count": int(len(df.columns)),
        "missing_total": int(df.isna().sum().sum()),
        "duplicate_rows": int(df.duplicated().sum()),
        "memory_mb": round(float(df.memory_usage(deep=True).sum()) / (1024 * 1024), 3),
        "columns": _column_profile(df),
        "preview": _records(df),
    }


def _get_dataset(request, payload):
    dataset_id = payload.get("dataset_id")
    if not dataset_id:
        raise ValueError("Please select a dataset.")
    try:
        return Dataset.objects.get(id=dataset_id, user=request.user)
    except (Dataset.DoesNotExist, ValueError, TypeError):
        raise LookupError("Dataset not found or you do not have access to it.")


def _apply_cleaning(df, options):
    """
    Apply whitelisted transformations to a copy.

    All per-column operations use the ORIGINAL column names. Dropping and
    renaming are deliberately performed at the end so that selecting a rename
    does not break missing-value, type, outlier, or scaling rules configured
    for that same column.
    """
    if not isinstance(options, dict):
        raise ValueError("Cleaning options must be an object.")

    cleaned = df.copy(deep=True)
    changes = []
    original_columns = {str(column): column for column in cleaned.columns}

    drop_columns = options.get("drop_columns", [])
    if not isinstance(drop_columns, list):
        raise ValueError("drop_columns must be a list.")
    if len(set(drop_columns)) != len(drop_columns):
        raise ValueError("A column cannot be selected for removal more than once.")
    for name in drop_columns:
        if name not in original_columns:
            raise ValueError(f"Column not found for removal: {name}")
    if len(drop_columns) >= len(cleaned.columns):
        raise ValueError("At least one column must remain.")

    # Missing values
    missing = options.get("missing", {})
    if not isinstance(missing, dict):
        raise ValueError("missing must be an object keyed by column name.")
    for col_name, config in missing.items():
        if col_name not in original_columns:
            raise ValueError(f"Column not found for missing-value handling: {col_name}")
        if col_name in drop_columns:
            continue
        if not isinstance(config, dict):
            raise ValueError(f"Missing-value configuration for {col_name} must be an object.")
        method = config.get("method", "none")
        if method == "none":
            continue
        if method not in ALLOWED_MISSING_METHODS:
            raise ValueError(f"Unsupported missing-value method for {col_name}.")
        column = original_columns[col_name]
        before = int(cleaned[column].isna().sum())
        if method == "drop":
            cleaned = cleaned.dropna(subset=[column])
        elif method in {"mean", "median"}:
            values = pd.to_numeric(cleaned[column], errors="coerce")
            if values.notna().sum() == 0:
                raise ValueError(f"Cannot calculate {method} for {col_name}; it has no numeric values.")
            fill_value = values.mean() if method == "mean" else values.median()
            cleaned[column] = values.fillna(fill_value)
        elif method == "mode":
            modes = cleaned[column].mode(dropna=True)
            if modes.empty:
                raise ValueError(f"Cannot calculate mode for {col_name}; it has no non-missing values.")
            cleaned[column] = cleaned[column].fillna(modes.iloc[0])
        elif method == "constant":
            fill_value = config.get("value", "Unknown")
            cleaned[column] = cleaned[column].fillna(fill_value)
        changes.append({"type": "missing", "column": col_name, "method": method, "affected": before})

    # Duplicate rows
    duplicate_action = options.get("duplicates", "keep")
    if duplicate_action not in {"keep", "remove"}:
        raise ValueError("duplicates must be 'keep' or 'remove'.")
    if duplicate_action == "remove":
        before = int(cleaned.duplicated().sum())
        cleaned = cleaned.drop_duplicates().reset_index(drop=True)
        changes.append({"type": "duplicates", "removed": before})

    # Data type conversion
    conversions = options.get("convert_types", {})
    if not isinstance(conversions, dict):
        raise ValueError("convert_types must be an object.")
    for col_name, target in conversions.items():
        if col_name not in original_columns:
            raise ValueError(f"Column not found for type conversion: {col_name}")
        if col_name in drop_columns or not target:
            continue
        if target not in ALLOWED_DTYPES:
            raise ValueError(f"Unsupported target type for {col_name}.")
        column = original_columns[col_name]
        try:
            if target == "string":
                cleaned[column] = cleaned[column].astype("string")
            elif target == "integer":
                # Convert to numeric, round fractional values to the nearest
                # whole number, and build nullable integers one value at a time.
                # This avoids pandas' unsafe float/object -> int64 cast and
                # preserves missing values.
                numeric_values = pd.to_numeric(cleaned[column], errors="raise")
                def _safe_nullable_integer(value):
                    if pd.isna(value):
                        return pd.NA
                    return int(round(float(value)))
                cleaned[column] = pd.Series(
                    (_safe_nullable_integer(value) for value in numeric_values),
                    index=cleaned.index,
                    dtype="Int64",
                )
            elif target == "float":
                cleaned[column] = pd.to_numeric(cleaned[column], errors="raise").astype(float)
            elif target == "datetime":
                cleaned[column] = pd.to_datetime(cleaned[column], errors="raise")
            elif target == "boolean":
                mapping = {"true": True, "false": False, "1": True, "0": False, "yes": True, "no": False}
                converted = cleaned[column].astype("string").str.strip().str.lower().map(mapping)
                invalid = cleaned[column].notna() & converted.isna()
                if invalid.any():
                    raise ValueError("contains values other than true/false, 1/0, or yes/no")
                cleaned[column] = converted.astype("boolean")
        except (TypeError, ValueError, OverflowError) as exc:
            raise ValueError(f"Cannot convert '{col_name}' to {target}: {exc}") from exc
        changes.append({"type": "convert_type", "column": col_name, "target": target})

    # Outlier treatment (IQR)
    outliers = options.get("outliers", {})
    if not isinstance(outliers, dict):
        raise ValueError("outliers must be an object.")
    for col_name, method in outliers.items():
        if col_name not in original_columns:
            raise ValueError(f"Column not found for outlier treatment: {col_name}")
        if col_name in drop_columns or method in {None, "none"}:
            continue
        if method not in {"clip", "remove"}:
            raise ValueError(f"Unsupported outlier method for {col_name}.")
        column = original_columns[col_name]
        values = pd.to_numeric(cleaned[column], errors="coerce")
        valid = values.dropna()
        if len(valid) < 4:
            changes.append({"type": "outliers", "column": col_name, "method": method, "affected": 0, "note": "Not enough numeric values"})
            continue
        q1, q3 = valid.quantile([0.25, 0.75])
        iqr = q3 - q1
        if pd.isna(iqr) or iqr == 0:
            affected = 0
            mask = pd.Series(False, index=cleaned.index)
        else:
            low, high = q1 - 1.5 * iqr, q3 + 1.5 * iqr
            mask = values.notna() & ((values < low) | (values > high))
            affected = int(mask.sum())
        if method == "clip" and affected:
            cleaned[column] = values.clip(lower=low, upper=high)
        elif method == "remove" and affected:
            cleaned = cleaned.loc[~mask].copy()
        changes.append({"type": "outliers", "column": col_name, "method": method, "affected": affected})

    # Numeric scaling
    scaling = options.get("scaling", {})
    if not isinstance(scaling, dict):
        raise ValueError("scaling must be an object.")
    for col_name, method in scaling.items():
        if col_name not in original_columns:
            raise ValueError(f"Column not found for scaling: {col_name}")
        if col_name in drop_columns or method in {None, "none"}:
            continue
        if method not in ALLOWED_SCALING:
            raise ValueError(f"Unsupported scaling method for {col_name}.")
        column = original_columns[col_name]
        try:
            values = pd.to_numeric(cleaned[column], errors="raise")
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Cannot scale '{col_name}': values must be numeric.") from exc
        if method == "minmax":
            minimum, maximum = values.min(), values.max()
            cleaned[column] = 0.0 if pd.isna(minimum) or maximum == minimum else (values - minimum) / (maximum - minimum)
        else:
            mean, std = values.mean(), values.std(ddof=0)
            cleaned[column] = 0.0 if pd.isna(std) or std == 0 else (values - mean) / std
        changes.append({"type": "scaling", "column": col_name, "method": method})

    # Drop columns only after all rules have used their original names.
    if drop_columns:
        cleaned = cleaned.drop(columns=[original_columns[name] for name in drop_columns])
        changes.append({"type": "drop_columns", "count": len(drop_columns), "columns": drop_columns})

    # Rename columns last; validate collisions after drops.
    rename_map = options.get("rename_columns", {})
    if not isinstance(rename_map, dict):
        raise ValueError("rename_columns must be an object.")
    surviving_names = {name for name in original_columns if name not in drop_columns}
    for old, new_name in rename_map.items():
        if old not in original_columns:
            raise ValueError(f"Column not found for rename: {old}")
        if old in drop_columns:
            continue
        if not isinstance(new_name, str) or not new_name.strip():
            raise ValueError(f"New name for '{old}' cannot be empty.")
    final_names = [
        rename_map.get(str(column), str(column)).strip()
        for column in cleaned.columns
    ]
    if len(set(final_names)) != len(final_names):
        raise ValueError("Renamed columns must be unique and cannot match another existing column.")
    if rename_map:
        effective = {
            original_columns[old]: new_name.strip()
            for old, new_name in rename_map.items()
            if old in surviving_names and isinstance(new_name, str) and new_name.strip()
        }
        if effective:
            cleaned = cleaned.rename(columns=effective)
            changes.append({"type": "rename_columns", "count": len(effective)})

    return cleaned.reset_index(drop=True), changes


def _serialize_dataframe(df, extension):
    extension = extension.lower().lstrip(".")
    if extension == "csv":
        return df.to_csv(index=False).encode("utf-8-sig"), "csv"
    if extension in {"xlsx", "xls"}:
        buffer = io.BytesIO()
        df.to_excel(buffer, index=False, engine="openpyxl")
        return buffer.getvalue(), "xlsx"
    if extension == "json":
        return df.to_json(orient="records", date_format="iso", force_ascii=False, indent=2).encode("utf-8"), "json"
    raise ValueError("Unsupported export format. Use CSV, XLSX or JSON.")


@require_POST
@role_required("admin", "user")
def cleaning_profile(request):
    try:
        payload = json.loads(request.body or b"{}")
        dataset = _get_dataset(request, payload)
        df = get_dataframe(dataset)
        if len(df.columns) > MAX_COLUMNS:
            return JsonResponse({"error": f"Datasets are limited to {MAX_COLUMNS} columns for this tool."}, status=400)
        return JsonResponse(_profile_payload(df, dataset))
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    except LookupError as exc:
        return JsonResponse({"error": str(exc)}, status=404)
    except Exception as exc:
        logger.exception("Dataset cleaning profile failed")
        return JsonResponse({"error": f"Unable to profile dataset: {exc}"}, status=400)


@require_POST
@role_required("admin", "user")
def cleaning_preview(request):
    try:
        payload = json.loads(request.body or b"{}")
        dataset = _get_dataset(request, payload)
        df = get_dataframe(dataset)
        options = payload.get("options", {})
        if not isinstance(options, dict):
            raise ValueError("options must be an object.")
        cleaned, changes = _apply_cleaning(df, options)
        return JsonResponse({
            "success": True, "dataset_id": dataset.id, "filename": dataset.filename,
            "before": {"rows": int(len(df)), "columns": int(len(df.columns)), "missing": int(df.isna().sum().sum()), "duplicates": int(df.duplicated().sum()), "preview": _records(df)},
            "after": {"rows": int(len(cleaned)), "columns": int(len(cleaned.columns)), "missing": int(cleaned.isna().sum().sum()), "duplicates": int(cleaned.duplicated().sum()), "preview": _records(cleaned), "column_profiles": _column_profile(cleaned)},
            "changes": changes, "options": options,
        })
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    except LookupError as exc:
        return JsonResponse({"error": str(exc)}, status=404)
    except Exception as exc:
        logger.exception("Dataset cleaning preview failed")
        return JsonResponse({"error": f"Unable to preview cleaning: {exc}"}, status=400)


@require_POST
@role_required("admin", "user")
def cleaning_save(request):
    try:
        payload = json.loads(request.body or b"{}")
        dataset = _get_dataset(request, payload)
        df = get_dataframe(dataset)
        options = payload.get("options", {})
        if not isinstance(options, dict):
            raise ValueError("options must be an object.")
        cleaned, changes = _apply_cleaning(df, options)
        if not changes:
            raise ValueError("Choose at least one cleaning operation before saving.")
        extension = Path(dataset.filename).suffix.lower().lstrip(".")
        if extension not in {"csv", "xlsx", "xls", "json"}:
            extension = "csv"
        content, saved_extension = _serialize_dataframe(cleaned, extension)
        base = Path(dataset.filename).stem
        output_name = f"{base}_cleaned.{saved_extension}"
        preview = _records(cleaned)
        new_dataset = Dataset.objects.create(
            user=request.user,
            filename=output_name,
            file_type=saved_extension,
            uploaded_file=ContentFile(content, name=output_name),
            rows_count=int(len(cleaned)),
            columns_count=int(len(cleaned.columns)),
            missing_values=int(cleaned.isna().sum().sum()),
            duplicate_rows=int(cleaned.duplicated().sum()),
            columns=[str(column) for column in cleaned.columns],
            preview=preview,
        )
        return JsonResponse({
            "success": True, "message": "Cleaned dataset saved to Dataset History.",
            "dataset": {"id": new_dataset.id, "filename": new_dataset.filename, "file_type": new_dataset.file_type, "rows": new_dataset.rows_count, "columns_count": new_dataset.columns_count, "missing_values": new_dataset.missing_values, "duplicate_rows": new_dataset.duplicate_rows},
            "changes": changes,
        }, status=201)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    except LookupError as exc:
        return JsonResponse({"error": str(exc)}, status=404)
    except Exception as exc:
        logger.exception("Saving cleaned dataset failed")
        return JsonResponse({"error": f"Unable to save cleaned dataset: {exc}"}, status=400)


@require_POST
@role_required("admin", "user")
def cleaning_export(request):
    try:
        payload = json.loads(request.body or b"{}")
        dataset = _get_dataset(request, payload)
        df = get_dataframe(dataset)
        options = payload.get("options", {})
        if not isinstance(options, dict):
            raise ValueError("options must be an object.")
        cleaned, _ = _apply_cleaning(df, options)
        export_format = payload.get("format", "csv")
        content, extension = _serialize_dataframe(cleaned, export_format)
        filename = f"{Path(dataset.filename).stem}_cleaned.{extension}"
        mime_types = {
            "csv": "text/csv; charset=utf-8",
            "json": "application/json; charset=utf-8",
            "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }
        response = HttpResponse(content, content_type=mime_types[extension])
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    except LookupError as exc:
        return JsonResponse({"error": str(exc)}, status=404)
    except Exception as exc:
        logger.exception("Dataset cleaning export failed")
        return JsonResponse({"error": f"Unable to export cleaned dataset: {exc}"}, status=400)
