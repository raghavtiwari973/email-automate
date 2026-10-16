import os
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Tuple
import pandas as pd

COMPANY_KEYS = ["company name", "company", "organisation", "organization", "business name"]
EMAIL_KEYS = ["email", "email id", "email address", "e-mail", "contact email"]
CONTACT_KEYS = ["contact person", "contact name", "person", "name", "decision maker"]
DEMAND_KEYS = ["demand", "requirement", "need", "problem", "notes", "inquiry", "pain point", "product fit"]
STATUS_KEYS = ["status", "workflow status", "workflow_status", "mail status", "email status"]

def normalize_text(val: Any) -> str:
    return re.sub(r"\s+", " ", str(val or "")).strip().lower()

def identify_columns(df: pd.DataFrame) -> Dict[str, str]:
    mapping = {}
    cols = list(df.columns)
    for col in cols:
        norm = normalize_text(col)
        if "company" not in mapping and any(k in norm for k in COMPANY_KEYS):
            mapping["company"] = col
        elif "email" not in mapping and any(k in norm for k in EMAIL_KEYS):
            mapping["email"] = col
        elif "contact" not in mapping and any(k in norm for k in CONTACT_KEYS):
            mapping["contact"] = col
        elif "demand" not in mapping and any(k in norm for k in DEMAND_KEYS):
            mapping["demand"] = col
        elif "status" not in mapping and any(k in norm for k in STATUS_KEYS):
            mapping["status"] = col

    # Fallbacks if not detected
    if "company" not in mapping and len(cols) > 1:
        mapping["company"] = cols[1]
    if "email" not in mapping:
        for col in cols:
            if "email" in col.lower() or "@" in col.lower():
                mapping["email"] = col
                break
    return mapping

def load_data_file(file_input: Any) -> pd.DataFrame:
    # 1. Handle in-memory buffer from Streamlit
    if hasattr(file_input, "read") and hasattr(file_input, "seek"):
        file_input.seek(0)
        content = file_input.read()
        file_input.seek(0)
        # Check if content starts with PK (ZIP header of modern .xlsx)
        if content.startswith(b"PK"):
            try:
                return pd.read_excel(file_input, engine="openpyxl")
            except Exception:
                pass
        # Fallback to CSV
        try:
            file_input.seek(0)
            return pd.read_csv(file_input)
        except Exception:
            file_input.seek(0)
            return pd.read_excel(file_input)

    # 2. Handle file path / string
    path = Path(file_input)
    if not path.exists() or path.stat().st_size == 0:
        return pd.DataFrame()

    with open(path, "rb") as f:
        head = f.read(10)

    # Real .xlsx files start with PK (ZIP format)
    if head.startswith(b"PK"):
        try:
            return pd.read_excel(path, engine="openpyxl")
        except Exception:
            return pd.read_excel(path)
    else:
        # If it's plain text / CSV (even if named .xlsx)
        try:
            return pd.read_csv(path)
        except Exception:
            return pd.read_excel(path)

def save_data_file(df: pd.DataFrame, file_path: Path):
    suffix = file_path.suffix.lower()
    if suffix in [".xlsx", ".xls"]:
        df.to_excel(file_path, index=False)
    else:
        df.to_csv(file_path, index=False)

def ensure_workflow_columns(df: pd.DataFrame) -> pd.DataFrame:
    required_cols = [
        "Company Name", "Contact Person", "Email", "Demand",
        "Generated Subject", "Generated Email Body", "Status", "Sent Timestamp"
    ]
    for col in required_cols:
        if col not in df.columns:
            df[col] = ""
        else:
            # Ensure text columns are object dtype, not float64 due to empty NaN cells
            df[col] = df[col].fillna("").astype(str)
    return df
