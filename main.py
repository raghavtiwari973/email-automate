import argparse
import csv
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import requests
import smtplib
import ssl
from email.message import EmailMessage

ROOT = Path(__file__).resolve().parent
LEADS_FILE = ROOT / "leads.csv"
TRACKING_FILE = ROOT / "tracking.csv"
DRAFTS_DIR = ROOT / "drafts"
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3.5:4b")
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "300"))

WORKFLOW_FIELDS = [
    "workflow_status", "product_fit", "fit_evidence", "email_subject",
    "draft_file", "last_processed_at", "follow_up_date", "notes"
]

COMPANY_KEYS = ["company name", "company", "organisation", "organization", "business name", "account name"]
EMAIL_KEYS = ["email", "email id", "email address", "e-mail", "contact email"]
CONTACT_KEYS = ["contact person", "contact name", "person", "name", "decision maker"]
INDUSTRY_KEYS = ["industry", "industry category", "sector", "business type"]
WEBSITE_KEYS = ["website", "url", "company website"]
ADDRESS_KEYS = ["address", "complete address", "location", "city", "area"]

def norm(value):
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()

def find_value(row, candidates):
    for key, value in row.items():
        if norm(key) in candidates and str(value or "").strip():
            return str(value).strip()
    for key, value in row.items():
        nk = norm(key)
        if any(c in nk for c in candidates) and str(value or "").strip():
            return str(value).strip()
    return ""

def load_env_file():
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

def read_csv(path):
    if not path.exists():
        print(f"ERROR: Missing {path.name}. Put your exported lead CSV in this folder and name it leads.csv.")
        sys.exit(1)
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            print("ERROR: CSV has no header row.")
            sys.exit(1)
        rows = list(reader)
    return reader.fieldnames, rows

def write_csv(path, fields, rows):
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in fields})

def row_key(row):
    company = find_value(row, COMPANY_KEYS)
    email = find_value(row, EMAIL_KEYS)
    website = find_value(row, WEBSITE_KEYS)
    # Stable local identifier; no data is sent to an external service.
    return (email or website or company).strip().lower()

def ensure_tracking():
    source_fields, source_rows = read_csv(LEADS_FILE)
    if TRACKING_FILE.exists():
        tracking_fields, tracking_rows = read_csv(TRACKING_FILE)
        existing = {row_key(r) for r in tracking_rows if row_key(r)}
        added = 0
        for source in source_rows:
            key = row_key(source)
            if key and key not in existing:
                row = {k: source.get(k, "") for k in source_fields}
                row.update({f: "" for f in WORKFLOW_FIELDS})
                row["workflow_status"] = "NEW"
                tracking_rows.append(row)
                existing.add(key)
                added += 1
        fields = list(dict.fromkeys(tracking_fields + source_fields + WORKFLOW_FIELDS))
        write_csv(TRACKING_FILE, fields, tracking_rows)
        return fields, tracking_rows, added
    fields = list(dict.fromkeys(source_fields + WORKFLOW_FIELDS))
    tracking_rows = []
    for source in source_rows:
        row = {k: source.get(k, "") for k in source_fields}
        row.update({f: "" for f in WORKFLOW_FIELDS})
        row["workflow_status"] = "NEW"
        tracking_rows.append(row)
    write_csv(TRACKING_FILE, fields, tracking_rows)
    return fields, tracking_rows, len(tracking_rows)

def build_prompt(row):
    company = find_value(row, COMPANY_KEYS) or "Company name not supplied"
    contact = find_value(row, CONTACT_KEYS)
    email = find_value(row, EMAIL_KEYS)
    industry = find_value(row, INDUSTRY_KEYS)
    website = find_value(row, WEBSITE_KEYS)
    address = find_value(row, ADDRESS_KEYS)
    # Limit input size and avoid sending unnecessary oversized row data to the local model.
    facts = {str(k): str(v)[:500] for k, v in row.items()
             if str(v or "").strip() and k not in WORKFLOW_FIELDS}
    return f"""
You are preparing a REVIEW-ONLY B2B outreach draft for SAPCON Instruments.
Do not send email. Do not invent facts, product capabilities, contact names, or personal details.
Use only the supplied lead information and the approved general product categories listed here:
- Level measurement instruments
- Flow measurement instruments
- Speed monitoring systems
- RF admittance level switches
If the supplied company data does not clearly support a product match, say "Needs human review" and explain what evidence is missing.
Write a concise, professional email. Do not claim the recipient has a known problem unless the data explicitly says so.
Do not add phone numbers, links, prices, certifications, performance figures, or claims that were not provided.
If no contact name is provided, use "Hello,".
Return ONLY valid JSON with these keys:
{{
  "product_fit": "one short product category or Needs human review",
  "fit_evidence": "one or two sentences grounded in supplied facts; clearly mark uncertainty",
  "email_subject": "short subject line",
  "email_body": "email body with greeting and sign-off placeholder [Sender Name]",
  "uncertainty": "missing facts or assumptions that require human review"
}}
Lead fields:
{json.dumps(facts, ensure_ascii=False)}
Known values: company={company}; contact={contact}; email={email}; industry={industry}; website={website}; address={address}
""".strip()

def ollama_generate(row):
    url = OLLAMA_URL.rstrip("/") + "/api/generate"
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": build_prompt(row),
        "stream": False,
        "think": False,
        "format": "json",
        "options": {"num_predict": 700, "temperature": 0.2}
    }
    response = requests.post(url, json=payload, timeout=OLLAMA_TIMEOUT)
    response.raise_for_status()
    data = response.json()
    raw = (data.get("response") or "").strip()
    if not raw:
        raise RuntimeError("Ollama returned an empty response. Try again or inspect model logs.")
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.S)
        if not match:
            raise RuntimeError(f"Model did not return valid JSON. Response starts: {raw[:250]}")
        result = json.loads(match.group(0))
    for key in ["product_fit", "fit_evidence", "email_subject", "email_body", "uncertainty"]:
        result.setdefault(key, "")

    # Validate the model output instead of marking an empty draft as ready.
    if not str(result.get("product_fit", "")).strip():
        result["product_fit"] = "Needs human review"

    if not str(result.get("fit_evidence", "")).strip():
        result["fit_evidence"] = (
            "The model did not provide evidence. Review the company information manually before choosing a product."
        )

    if not str(result.get("email_subject", "")).strip():
        result["email_subject"] = "Introduction to SAPCON Industrial Instrumentation"

    if len(str(result.get("email_body", "")).strip()) < 100:
        result["email_body"] = (
    "Hello,\n\n"
    "I’m reaching out to introduce SAPCON Instruments and its industrial measurement and monitoring solutions, "
    "including level measurement, flow measurement, and speed monitoring systems.\n\n"
    "If these solutions are relevant to your work, we would be glad to understand your application requirements "
    "and explore whether there may be a suitable fit.\n\n"
    "Please let us know if this is relevant, or who the appropriate contact would be.\n\n"
    "Regards,\n"
    "[Sender Name]"
)
        existing = str(result.get("uncertainty", "")).strip()
        fallback_note = (
            "The email body was filled with a generic fallback because the model returned an empty body. "
            "Company affiliation and product fit still require human review."
        )
        result["uncertainty"] = (existing + " " + fallback_note).strip()

    if result.get("product_fit") == "Needs human review" and not str(result.get("uncertainty", "")).strip():
        result["uncertainty"] = (
            "Company affiliation, industry, and application details are insufficient to confirm product fit. "
            "Review before sending."
        )

    return result

def safe_name(value):
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", value or "lead")
    return value.strip("._-")[:70] or "lead"

def save_draft(row, result):
    DRAFTS_DIR.mkdir(exist_ok=True)
    company = find_value(row, COMPANY_KEYS) or "Company"
    contact_email = find_value(row, EMAIL_KEYS)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{safe_name(company)}_{stamp}.md"
    path = DRAFTS_DIR / filename
    content = f"""# Email draft — {company}

**To:** {contact_email or "No email address found — add/verify manually"}
**Subject:** {result.get('email_subject', '')}

## Product-fit assessment
**Suggested fit:** {result.get('product_fit', 'Needs human review')}

**Evidence:** {result.get('fit_evidence', '')}

**Human review required:** {result.get('uncertainty', '')}

## Draft — NOT SENT

{result.get('email_body', '')}

---
Created locally by SAPCON Lead Workflow. Review all facts and approve manually before sending.
"""
    path.write_text(content, encoding="utf-8")
    return filename

def telegram_send(message):
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat_id:
        return False, "Telegram not configured; report printed locally."
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    response = requests.post(url, json={"chat_id": chat_id, "text": message[:3900]}, timeout=20)
    response.raise_for_status()
    return True, "Telegram summary sent."

def send_test_email():
    """Send only the saved Raghav Tiwari dummy draft to the configured test Gmail."""
    load_env_file()
    sender = os.getenv("SMTP_EMAIL", "").strip()
    password = os.getenv("SMTP_APP_PASSWORD", "").replace(" ", "").strip()
    recipient = os.getenv("GMAIL_TEST_TO", "").strip()

    if not sender or not password or not recipient:
        raise RuntimeError(
            "Missing Gmail settings. Add SMTP_EMAIL, SMTP_APP_PASSWORD, and "
            "GMAIL_TEST_TO to .env. Use a Google App Password, not your normal password."
        )
    if sender.lower() != recipient.lower():
        raise RuntimeError("Safety check failed: sender and test recipient must be the same Gmail address.")

    # Restrict this test command to the known dummy record, not other lead drafts.
    candidates = []
    if DRAFTS_DIR.exists():
        for path in DRAFTS_DIR.glob("*.md"):
            try:
                text = path.read_text(encoding="utf-8")
            except OSError:
                continue
            header = re.search(r"^# Email draft\s*[-—]\s*(.+)$", text, re.MULTILINE)
            if header and header.group(1).strip().casefold() == "raghav tiwari":
                candidates.append((path.stat().st_mtime, path, text))

    if not candidates:
        raise RuntimeError(
            "No draft for the dummy test record 'Raghav Tiwari' found. "
            "Generate the dummy draft first; no lead rows were processed."
        )
    _, draft_path, content = max(candidates, key=lambda item: item[0])

    subject_match = re.search(r"^\*\*Subject:\*\*\s*(.+)$", content, re.MULTILINE)
    body_match = re.search(
        r"^## Draft[^\n]*\n\s*(.*?)\n\s*---\nCreated locally",
        content,
        re.MULTILINE | re.DOTALL,
    )
    if not subject_match or not body_match:
        raise RuntimeError("The dummy draft is missing a subject or email body; refusing to send.")
    subject = subject_match.group(1).strip()
    body = body_match.group(1).strip()
    if not subject or len(body) < 100 or "[Sender Name]" not in body:
        raise RuntimeError("The dummy draft is incomplete or has no sender placeholder; refusing to send.")

    message = EmailMessage()
    message["From"] = sender
    message["To"] = recipient
    message["Subject"] = "[TEST - SAPCON WORKFLOW] " + subject
    message.set_content(
        "This is a TEST email from the local SAPCON Lead Workflow.\n"
        "It is addressed only to the configured test Gmail account. No external lead is being contacted.\n\n"
        + body
    )

    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context(), timeout=30) as server:
        server.login(sender, password)
        server.send_message(message)

    print("TEST EMAIL SENT successfully.")
    print(f"Recipient: {recipient}")
    print(f"Draft used: {draft_path.name}")
    print("No leads.csv or tracking.csv rows were processed by this test command.")


def main():
    load_env_file()
    parser = argparse.ArgumentParser(description="Local SAPCON lead tracking and draft workflow")
    parser.add_argument("--limit", type=int, default=5, help="Maximum NEW leads to process per run (default: 5)")
    parser.add_argument("--summary-only", action="store_true", help="Print status summary without generating drafts")
    parser.add_argument("--retry-ready", action="store_true", help="Reprocess DRAFT_READY rows (use for testing only)")
    parser.add_argument("--send-test-email", action="store_true", help="Send the saved Raghav Tiwari dummy draft to your own configured Gmail only")
    args = parser.parse_args()

    # Handle the test-email command before reading or modifying CSV/tracking files.
    if args.send_test_email:
        try:
            send_test_email()
        except Exception as e:
            print(f"TEST EMAIL FAILED: {e}")
            sys.exit(1)
        return

    fields, rows, added = ensure_tracking()
    if args.summary_only:
        counts = {}
        for r in rows:
            status = r.get("workflow_status", "NEW") or "NEW"
            counts[status] = counts.get(status, 0) + 1
        msg = "SAPCON Lead Workflow\n" + "\n".join(f"{k}: {v}" for k, v in sorted(counts.items())) + f"\nNew rows imported this run: {added}"
        print(msg)
        try:
            sent, detail = telegram_send(msg)
            print(detail)
        except Exception as e:
            print(f"Telegram report failed: {e}")
        return

    processed = 0
    errors = 0
    for row in rows:
        if processed >= max(1, args.limit):
            break
        allowed_statuses = ("NEW", "DRAFT_FAILED", "DRAFT_READY") if args.retry_ready else ("NEW", "DRAFT_FAILED")
        if (row.get("workflow_status") or "NEW").upper() not in allowed_statuses:
            continue
        company = find_value(row, COMPANY_KEYS) or "Unnamed company"
        print(f"[{processed + 1}/{args.limit}] Drafting for: {company}")
        try:
            result = ollama_generate(row)
            filename = save_draft(row, result)
            row["product_fit"] = result.get("product_fit", "")
            row["fit_evidence"] = result.get("fit_evidence", "")
            row["email_subject"] = result.get("email_subject", "")
            row["draft_file"] = str(Path("drafts") / filename)
            row["workflow_status"] = "DRAFT_READY"
            row["last_processed_at"] = datetime.now().isoformat(timespec="seconds")
            row["notes"] = result.get("uncertainty", "")
            processed += 1
        except Exception as e:
            row["workflow_status"] = "DRAFT_FAILED"
            row["last_processed_at"] = datetime.now().isoformat(timespec="seconds")
            row["notes"] = str(e)[:500]
            errors += 1
            print(f"  ERROR: {e}")
        write_csv(TRACKING_FILE, fields, rows)
        time.sleep(0.5)

    counts = {}
    for r in rows:
        status = r.get("workflow_status", "NEW") or "NEW"
        counts[status] = counts.get(status, 0) + 1
    msg = (
        "SAPCON Lead Workflow\n"
        f"Drafts created this run: {processed}\n"
        f"Errors this run: {errors}\n"
        f"New rows imported: {added}\n"
        + "\n".join(f"{k}: {v}" for k, v in sorted(counts.items()))
        + "\nEmail sending: DISABLED — all drafts require human approval."
    )
    print("\n" + msg)
    try:
        sent, detail = telegram_send(msg)
        print(detail)
    except Exception as e:
        print(f"Telegram report failed: {e}")
    print(f"\nTracking file: {TRACKING_FILE}")
    print(f"Drafts folder: {DRAFTS_DIR}")

if __name__ == "__main__":
    main()
