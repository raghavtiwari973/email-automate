import os
import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional, List
import pandas as pd
from dotenv import dotenv_values
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, BackgroundTasks
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from sheet_manager import load_data_file, save_data_file, identify_columns, ensure_workflow_columns
from agent_engine import GeminiAgent
from oauth_handler import (
    is_authenticated,
    get_logged_in_email,
    get_authorization_url,
    exchange_code_for_token,
    send_email_gmail,
    logout,
)
from email_reader import fetch_recent_inbox_emails
from db_auth import (
    register_user,
    authenticate_user,
    get_user_by_email,
    upsert_google_user,
)


logger = logging.getLogger("Server")

ROOT = Path(__file__).resolve().parent
PROFILE_PATH = ROOT / "company_profile.json"
ENV_PATH = ROOT / ".env"
DEFAULT_EXCEL = ROOT / "leads.xlsx"

app = FastAPI(title="Sapcon AI Multi-Task & Mail Queue Workflow")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(ROOT / "static")), name="static")
app.mount("/images", StaticFiles(directory=str(ROOT / "images")), name="images")
if (ROOT / "sapcon_mobile" / "build" / "web").exists():
    app.mount("/flutter", StaticFiles(directory=str(ROOT / "sapcon_mobile" / "build" / "web"), html=True), name="flutter")


# ──────────────────────────────────────────────
# Global In-Memory Draft Queue & Processing State
# ──────────────────────────────────────────────
# Cache of drafts waiting for user approval:
# { queue_id: { "lead_id": int, "company_name": str, "email": str, "demand": str, "subject": str, "body": str, "status": "Waiting for Approval", "created_at": str } }
draft_queue_cache: Dict[str, Dict[str, Any]] = {}

batch_job_status: Dict[str, Any] = {
    "is_processing": False,
    "total": 0,
    "completed": 0,
    "current_company": "",
    "error": None
}


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def get_company_profile():
    if PROFILE_PATH.exists():
        try:
            with open(PROFILE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "company_name": "SAPCON Instruments Pvt. Ltd.",
        "sender_name": "Elvis Joseph",
        "sender_designation": "Regional Manager – South India Sales",
        "sender_email": "krishnadas199227@gmail.com",
        "company_website": "https://www.sapconinstruments.com",
        "sender_phone": "8871428228 / 0731-4757576, 75",
        "call_to_action": "Are you open for a quick 10-minute call this week to explore this?"
    }


def get_agent():
    env_cfg = dotenv_values(ENV_PATH) if ENV_PATH.exists() else {}
    return GeminiAgent(api_key=env_cfg.get("GEMINI_API_KEY"), model_name="gemini-flash-lite-latest"), env_cfg


def dispatch_email(to_email: str, subject: str, body: str) -> tuple[bool, str]:
    """
    Dispatch email strictly via authorized Google OAuth account.
    SMTP is completely eliminated.
    """
    if not is_authenticated():
        return False, "GOOGLE_AUTH_REQUIRED: Please sign in with Google in the top bar before sending."

    sender = get_logged_in_email()
    profile = get_company_profile()
    sender_name = profile.get("sender_name", "SAPCON Instruments")

    ok, msg = send_email_gmail(
        to_email=to_email,
        subject=subject,
        body=body,
        from_name=sender_name
    )
    if ok:
        return True, f"{msg} (Sent from connected account: {sender})"
    return False, msg



# ──────────────────────────────────────────────
# Pages
# ──────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def serve_index(request: Request):
    # If mobile device or explicit ?mode=mobile query param, redirect/serve mobile
    user_agent = request.headers.get("user-agent", "").lower()
    if "mobile" in request.query_params or any(dev in user_agent for dev in ["iphone", "android", "mobile"]):
        mobile_html = (ROOT / "static" / "mobile.html").read_text(encoding="utf-8")
        return HTMLResponse(content=mobile_html)
    index_html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    return HTMLResponse(content=index_html)


@app.get("/mobile", response_class=HTMLResponse)
async def serve_mobile():
    mobile_html = (ROOT / "static" / "mobile.html").read_text(encoding="utf-8")
    return HTMLResponse(content=mobile_html)



# ──────────────────────────────────────────────
# Google OAuth Routes
# ──────────────────────────────────────────────

@app.post("/auth/register")
async def handle_register(payload: Dict[str, Any]):
    """Register a new user (Sign Up) into SQLite database."""
    name = payload.get("name", "").strip()
    email = payload.get("email", "").strip()
    password = payload.get("password", "").strip()

    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    ok, msg, user = register_user(name, email, password)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"success": True, "message": msg, "user": user}


@app.post("/auth/login")
async def handle_login(payload: Dict[str, Any]):
    """Sign in existing user with email and password from SQLite database."""
    email = payload.get("email", "").strip()
    password = payload.get("password", "").strip()

    ok, msg, user = authenticate_user(email, password)
    if not ok:
        raise HTTPException(status_code=401, detail=msg)
    return {"success": True, "message": msg, "user": user}


@app.get("/auth/status")
async def auth_status():
    """Return current OAuth login status, connected email, and user record."""
    authenticated = is_authenticated()
    email = get_logged_in_email() if authenticated else None
    user_record = None
    if email:
        user_record = get_user_by_email(email)
        if not user_record:
            user_record = upsert_google_user(email)

    return {
        "authenticated": authenticated,
        "email": email,
        "user": user_record,
    }


@app.get("/auth/login")
async def auth_login():
    """Redirect user to Google OAuth consent screen."""
    try:
        auth_url = get_authorization_url()
        return RedirectResponse(url=auth_url)
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/auth/login-url")
async def auth_login_url():
    """Return Google OAuth consent URL in JSON for mobile apps."""
    try:
        auth_url = get_authorization_url()
        return {"url": auth_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/auth/callback")
async def auth_callback(code: str = None, error: str = None, from_app: Optional[str] = None):
    """Handle Google OAuth callback, exchange code for token, upsert user in DB, redirect."""
    if error:
        return HTMLResponse(content=f"""
        <!DOCTYPE html>
        <html>
        <head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Authentication Error</title></head>
        <body style="font-family:sans-serif; text-align:center; padding:40px 20px; background:#F8FAFC;">
            <div style="background:white; border-radius:16px; padding:30px; max-width:400px; margin:0 auto; box-shadow:0 4px 20px rgba(0,0,0,0.08);">
                <div style="font-size:48px; margin-bottom:16px;">❌</div>
                <h2 style="color:#DC2626; margin-bottom:8px;">Sign In Failed</h2>
                <p style="color:#64748B; font-size:14px; margin-bottom:24px;">{error}</p>
                <a href="/auth/login" style="display:inline-block; background:#2563EB; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;">Try Again</a>
            </div>
        </body>
        </html>
        """)
    if not code:
        raise HTTPException(status_code=400, detail="Missing auth code")
    try:
        exchange_code_for_token(code)
        google_email = get_logged_in_email()
        if google_email:
            upsert_google_user(google_email)
        
        # Friendly mobile return screen that works both in standalone app and web browser
        return HTMLResponse(content=f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Google Auth Success</title>
        </head>
        <body style="font-family:sans-serif; text-align:center; padding:40px 20px; background:#F0FDF4; margin:0;">
            <div style="background:white; border-radius:20px; padding:32px 24px; max-width:420px; margin:20px auto; box-shadow:0 8px 30px rgba(22,163,74,0.12); border:1px solid #BBF7D0;">
                <div style="width:64px; height:64px; background:#DCFCE7; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 16px;">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <h2 style="color:#166534; font-size:22px; margin:0 0 8px 0;">Google Connected!</h2>
                <p style="color:#475569; font-size:14px; margin:0 0 16px 0;">
                    Authenticated as:<br><strong style="color:#0F172A; font-size:15px;">{google_email or 'Google User'}</strong>
                </p>
                <div style="background:#F8FAFC; border-radius:12px; padding:14px; margin-bottom:24px; font-size:13px; color:#64748B;">
                    Gmail API is now authorized to send all verified sales outreach & quote emails.
                </div>
                <a href="/" style="display:block; background:#16345C; color:white; padding:14px; border-radius:10px; text-decoration:none; font-weight:700; font-size:15px; margin-bottom:12px;">
                    Open Sales Workbench
                </a>
                <p style="font-size:12px; color:#94A3B8; margin:0;">
                    If using the mobile app, you can now return to the app.
                </p>
            </div>
            <script>
                // If in desktop browser, redirect back after 2 seconds
                if (!navigator.userAgent.match(/Android|iPhone|Mobile/i)) {{
                    setTimeout(() => {{ window.location.href = '/?auth_success=1'; }}, 1800);
                }}
            </script>
        </body>
        </html>
        """)
    except Exception as e:
        return HTMLResponse(content=f"""
        <!DOCTYPE html>
        <html>
        <head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Authentication Error</title></head>
        <body style="font-family:sans-serif; text-align:center; padding:40px 20px; background:#FEF2F2;">
            <div style="background:white; border-radius:16px; padding:30px; max-width:400px; margin:0 auto; box-shadow:0 4px 20px rgba(0,0,0,0.08);">
                <div style="font-size:48px; margin-bottom:16px;">⚠️</div>
                <h2 style="color:#DC2626; margin-bottom:8px;">OAuth Exchange Failed</h2>
                <p style="color:#64748B; font-size:13px; margin-bottom:24px;">{str(e)}</p>
                <a href="/auth/login" style="display:inline-block; background:#2563EB; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;">Retry Authentication</a>
            </div>
        </body>
        </html>
        """)


@app.get("/auth/logout")
@app.post("/auth/logout")
async def auth_logout():
    """Revoke local token."""
    logout()
    return {"success": True, "message": "Logged out successfully"}


# ──────────────────────────────────────────────
# API – Lead Management & Queue Cache
# ──────────────────────────────────────────────

@app.get("/api/leads")
async def get_leads():
    if not DEFAULT_EXCEL.exists():
        return {"leads": [], "queue": list(draft_queue_cache.values())}
    df = load_data_file(DEFAULT_EXCEL)
    df = ensure_workflow_columns(df)
    leads_list = []
    for idx, r in df.iterrows():
        leads_list.append({
            "id": idx,
            "company_name": str(r.get("Company Name", "")),
            "contact_person": str(r.get("Contact Person", "")),
            "email": str(r.get("Email", "")),
            "demand": str(r.get("Demand", "")),
            "subject": str(r.get("Generated Subject", "")),
            "body": str(r.get("Generated Email Body", "")),
            "status": str(r.get("Status", "Pending")),
            "sent_at": str(r.get("Sent Timestamp", ""))
        })
    profile = get_company_profile()
    return {
        "leads": leads_list,
        "queue": list(draft_queue_cache.values()),
        "company_name": profile.get("company_name", "SAPCON Instruments")
    }


@app.get("/api/queue")
async def get_queue():
    """Returns all queued drafts currently saved in cache waiting for approval with actual counts."""
    # Compute actual counts from leads.xlsx and draft_queue_cache
    pending_count = len(draft_queue_cache)
    sent_count = 0
    approved_count = 0
    total_leads = 0
    sent_leads = []
    approved_leads = []
    if DEFAULT_EXCEL.exists():
        try:
            df = load_data_file(DEFAULT_EXCEL)
            if not df.empty and "Status" in df.columns:
                total_leads = len(df)
                for idx, r in df.iterrows():
                    st = str(r.get("Status", "")).strip()
                    st_lower = st.lower()
                    if st_lower.startswith("sent"):
                        sent_count += 1
                        sent_leads.append({
                            "queue_id": f"sent_{idx}",
                            "lead_id": idx,
                            "company_name": str(r.get("Company Name", "")),
                            "email": str(r.get("Email", "")),
                            "subject": str(r.get("Generated Subject", "")),
                            "body": str(r.get("Generated Email Body", "")),
                            "status": "Sent Out",
                            "created_at": str(r.get("Sent Timestamp", "Sent"))
                        })
                    elif "approved" in st_lower:
                        approved_count += 1
                        approved_leads.append({
                            "queue_id": f"approved_{idx}",
                            "lead_id": idx,
                            "company_name": str(r.get("Company Name", "")),
                            "email": str(r.get("Email", "")),
                            "subject": str(r.get("Generated Subject", "")),
                            "body": str(r.get("Generated Email Body", "")),
                            "status": "Approved",
                            "created_at": "Approved"
                        })
        except Exception as e:
            logger.warning("Could not read leads file for metrics: %s", e)

    return {
        "success": True,
        "count": pending_count,
        "queue": list(draft_queue_cache.values()),
        "sent_leads": sent_leads,
        "approved_leads": approved_leads,
        "job_status": batch_job_status,
        "metrics": {
            "pending_review": pending_count,
            "approved": approved_count,
            "sent": sent_count,
            "total_leads": total_leads
        }
    }


def run_batch_drafting_task(records: List[Dict[str, Any]], auto_send: bool = False):
    """
    Background task: processes each lead sequentially.
    If auto_send is True: immediately dispatches email and updates status to 'Sent'.
    If auto_send is False: saves draft into queue cache with 'Waiting for Approval'.
    """
    global batch_job_status, draft_queue_cache
    agent, _ = get_agent()
    profile = get_company_profile()

    batch_job_status["is_processing"] = True
    batch_job_status["total"] = len(records)
    batch_job_status["completed"] = 0
    batch_job_status["error"] = None

    df = load_data_file(DEFAULT_EXCEL) if DEFAULT_EXCEL.exists() else pd.DataFrame()
    df = ensure_workflow_columns(df)

    for item in records:
        lead_id = item.get("id")
        c_name = item.get("company_name", "")
        e_mail = item.get("email", "")
        p_name = item.get("contact_person", "")
        demand = item.get("demand", "")

        batch_job_status["current_company"] = c_name

        try:
            ai_out = agent.generate_cold_email({
                "company_name": c_name,
                "contact_person": p_name,
                "email": e_mail,
                "demand": demand
            }, profile)

            subj = str(ai_out.get("subject", f"Instrumentation for {c_name} | SAPCON"))
            body = str(ai_out.get("body", ""))

            if auto_send:
                # Direct send without approval
                ok, msg = dispatch_email(to_email=e_mail, subject=subj, body=body)
                if lead_id is not None and lead_id < len(df):
                    df.at[lead_id, "Generated Subject"] = subj
                    df.at[lead_id, "Generated Email Body"] = body
                    if ok:
                        df.at[lead_id, "Status"] = "Sent"
                        df.at[lead_id, "Sent Timestamp"] = str(datetime.now().strftime("%d-%b-%Y %I:%M %p"))
                    else:
                        df.at[lead_id, "Status"] = f"Send Failed: {msg}"
                    save_data_file(df, DEFAULT_EXCEL)
                logger.info(f"Direct send to {e_mail}: {ok} ({msg})")
            else:
                # Save in queue cache waiting for approval
                if lead_id is not None and lead_id < len(df):
                    df.at[lead_id, "Generated Subject"] = subj
                    df.at[lead_id, "Generated Email Body"] = body
                    df.at[lead_id, "Status"] = "Waiting for Approval"
                    save_data_file(df, DEFAULT_EXCEL)

                queue_key = f"lead_{lead_id}"
                draft_queue_cache[queue_key] = {
                    "queue_id": queue_key,
                    "lead_id": lead_id,
                    "company_name": c_name,
                    "contact_person": p_name,
                    "email": e_mail,
                    "demand": demand,
                    "subject": subj,
                    "body": body,
                    "status": "Waiting for Approval",
                    "created_at": datetime.now().strftime("%I:%M %p")
                }

        except Exception as e:
            logger.error(f"Error drafting for {c_name}: {e}")

        batch_job_status["completed"] += 1

    batch_job_status["is_processing"] = False
    batch_job_status["current_company"] = ""


@app.post("/api/upload_file")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    auto_send: bool = Form(False)
):
    """
    Receives an uploaded CSV or Excel file with leads.
    auto_send: If true, drafts and dispatches directly without approval.
    """
    raw_df = load_data_file(file.file)
    if raw_df.empty:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    raw_df = ensure_workflow_columns(raw_df)
    cols = identify_columns(raw_df)

    # Append or initialize DEFAULT_EXCEL
    current_df = load_data_file(DEFAULT_EXCEL) if DEFAULT_EXCEL.exists() else pd.DataFrame()
    current_df = ensure_workflow_columns(current_df)

    start_idx = len(current_df)
    items_to_process = []

    for idx, r in raw_df.iterrows():
        c_name = str(r.get(cols.get("company", "Company Name"), "")).strip()
        e_mail = str(r.get(cols.get("email", "Email"), "")).strip()
        p_name = str(r.get(cols.get("contact", "Contact Person"), "")).strip()
        d_val = str(r.get(cols.get("demand", "Demand"), "")).strip()

        if not c_name and not e_mail:
            continue

        assigned_id = start_idx + len(items_to_process)
        new_row = {
            "Company Name": c_name,
            "Contact Person": p_name,
            "Email": e_mail,
            "Demand": d_val,
            "Generated Subject": "",
            "Generated Email Body": "",
            "Status": "Direct Sending…" if auto_send else "Queued for Drafting",
            "Sent Timestamp": ""
        }
        current_df = pd.concat([current_df, pd.DataFrame([new_row])], ignore_index=True)

        items_to_process.append({
            "id": assigned_id,
            "company_name": c_name,
            "contact_person": p_name,
            "email": e_mail,
            "demand": d_val
        })

    total_detected = len(raw_df)
    valid_count = len(items_to_process)
    invalid_count = total_detected - valid_count

    save_data_file(current_df, DEFAULT_EXCEL)

    # Process all in background sequence
    background_tasks.add_task(run_batch_drafting_task, items_to_process, auto_send)

    mode_label = "Direct sending without approval" if auto_send else "Drafting into queue cache for approval"
    return {
        "success": True,
        "message": f"Successfully ingested {valid_count} leads [{mode_label}].",
        "count": valid_count,
        "total_detected": total_detected,
        "valid_leads": valid_count,
        "invalid_leads": invalid_count,
        "auto_send": auto_send,
        "first_id": items_to_process[0]["id"] if items_to_process else 0
    }


@app.post("/api/submit_manual")
async def submit_manual(
    request: Request,
    background_tasks: BackgroundTasks,
    company_name: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    demand: Optional[str] = Form(None),
    auto_send: Optional[bool] = Form(False)
):
    if request.headers.get("content-type", "").startswith("application/json"):
        try:
            data = await request.json()
            company_name = company_name or data.get("company_name", "")
            email = email or data.get("email", "")
            demand = demand or data.get("demand", "")
            auto_send = data.get("direct_send", data.get("auto_send", auto_send))
        except Exception:
            pass

    company_name = (company_name or "").strip()
    email = (email or "").strip()
    demand = (demand or "").strip()

    if not company_name or not email:
        raise HTTPException(status_code=400, detail="Company Name and Email are required.")

    df = load_data_file(DEFAULT_EXCEL) if DEFAULT_EXCEL.exists() else pd.DataFrame()
    df = ensure_workflow_columns(df)

    new_id = len(df)
    new_row = {
        "Company Name": company_name,
        "Contact Person": "",
        "Email": email,
        "Demand": demand,
        "Generated Subject": "",
        "Generated Email Body": "",
        "Status": "Direct Sending…" if auto_send else "Queued for Drafting",
        "Sent Timestamp": ""
    }
    df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
    save_data_file(df, DEFAULT_EXCEL)

    item = [{
        "id": new_id,
        "company_name": company_name,
        "contact_person": "",
        "email": email,
        "demand": demand
    }]

    background_tasks.add_task(run_batch_drafting_task, item, auto_send)

    mode_msg = "Direct sending in background (no approval needed)." if auto_send else "Queued for drafting and approval."
    return {
        "success": True,
        "lead_id": new_id,
        "auto_send": auto_send,
        "message": f"Lead added: {mode_msg}"
    }


@app.post("/api/queue/approve_all")
async def approve_all_in_queue():
    """Approve and send all currently pending drafts in cache in one click."""
    global draft_queue_cache
    if not is_authenticated():
        raise HTTPException(
            status_code=401,
            detail="GOOGLE_AUTH_REQUIRED: Google account is not connected. Please connect your Google account in the top bar before sending."
        )

    if not draft_queue_cache:
        return {"success": True, "sent_count": 0, "message": "Queue is empty."}

    df = load_data_file(DEFAULT_EXCEL) if DEFAULT_EXCEL.exists() else pd.DataFrame()
    df = ensure_workflow_columns(df)

    sent_count = 0
    failed_count = 0
    queue_keys = list(draft_queue_cache.keys())

    for qid in queue_keys:
        item = draft_queue_cache.get(qid)
        if not item:
            continue
        to_email = item.get("email")
        subj = item.get("subject")
        body = item.get("body")
        lead_id = item.get("lead_id")

        ok, msg = dispatch_email(to_email=to_email, subject=subj, body=body)
        if ok:
            sent_count += 1
            if lead_id is not None and lead_id < len(df):
                df.at[lead_id, "Status"] = "Sent"
                df.at[lead_id, "Sent Timestamp"] = str(datetime.now().strftime("%d-%b-%Y %I:%M %p"))
            del draft_queue_cache[qid]
        else:
            failed_count += 1
            if lead_id is not None and lead_id < len(df):
                df.at[lead_id, "Status"] = f"Send Failed: {msg}"

    save_data_file(df, DEFAULT_EXCEL)
    return {
        "success": True,
        "sent_count": sent_count,
        "failed_count": failed_count,
        "remaining": len(draft_queue_cache),
        "message": f"Dispatched {sent_count} emails directly! ({failed_count} failed, {len(draft_queue_cache)} left)"
    }



# ──────────────────────────────────────────────
# API – Approve, Update & Dispatch from Cache
# ──────────────────────────────────────────────

@app.post("/api/approve_send")
async def approve_send(
    queue_id: Optional[str] = Form(None),
    lead_id: int = Form(...),
    subject: str = Form(...),
    body: str = Form(...)
):
    """
    User approves a draft:
    1. Sends the email strictly via authenticated Google OAuth account.
    2. Evicts draft from queue cache.
    3. Updates leads.xlsx status to 'Sent'.
    """
    if not is_authenticated():
        raise HTTPException(
            status_code=401,
            detail="GOOGLE_AUTH_REQUIRED: Google account is not connected. Please connect your Google account in the top bar before sending."
        )

    if not DEFAULT_EXCEL.exists():
        raise HTTPException(status_code=404, detail="Leads file not found")

    df = load_data_file(DEFAULT_EXCEL)
    if lead_id < 0 or lead_id >= len(df):
        raise HTTPException(status_code=404, detail="Lead ID not found")

    df = ensure_workflow_columns(df)
    for col_name in ["Status", "Sent Timestamp", "Generated Subject", "Generated Email Body"]:
        if col_name in df.columns:
            df[col_name] = df[col_name].fillna("").astype(object)

    target_email = str(df.iloc[lead_id].get("Email", "")).strip()
    if not target_email or "@" not in target_email:
        raise HTTPException(status_code=400, detail="Invalid email address for this lead")

    ok, msg = dispatch_email(
        to_email=target_email,
        subject=subject,
        body=body,
    )

    if ok:
        df = df.astype(object)
        df.loc[lead_id, "Status"] = "Sent"
        df.loc[lead_id, "Sent Timestamp"] = str(datetime.now().strftime("%d-%b-%Y %I:%M %p"))
        df.loc[lead_id, "Generated Subject"] = str(subject)
        df.loc[lead_id, "Generated Email Body"] = str(body)
        save_data_file(df, DEFAULT_EXCEL)

        # Evict from queue cache
        if queue_id and queue_id in draft_queue_cache:
            del draft_queue_cache[queue_id]
        else:
            k = f"lead_{lead_id}"
            if k in draft_queue_cache:
                del draft_queue_cache[k]

        return {
            "success": True,
            "message": f"Approved & sent to {target_email}! Removed from queue cache.",
            "remaining_in_queue": len(draft_queue_cache)
        }
    else:
        status_code = 401 if "GOOGLE_AUTH_REQUIRED" in msg else 500
        raise HTTPException(status_code=status_code, detail=msg)


@app.post("/api/update_draft")
@app.post("/api/update_draft/{queue_id}")
async def update_draft(
    request: Request,
    queue_id: Optional[str] = None,
    subject: Optional[str] = Form(None),
    body: Optional[str] = Form(None)
):
    """Allows user to edit draft subject or body in cache without sending yet."""
    # Handle JSON if sent as application/json
    if request.headers.get("content-type", "").startswith("application/json"):
        try:
            data = await request.json()
            queue_id = queue_id or data.get("queue_id")
            subject = subject or data.get("subject", "")
            body = body or data.get("body", "")
        except Exception:
            pass

    if not queue_id or queue_id not in draft_queue_cache:
        raise HTTPException(status_code=404, detail="Draft not found in queue cache")

    if subject is not None:
        draft_queue_cache[queue_id]["subject"] = subject
    if body is not None:
        draft_queue_cache[queue_id]["body"] = body
    return {"success": True, "message": "Draft updated in cache"}


@app.post("/api/approve/{queue_id}")
async def approve_by_queue_id(queue_id: str):
    """Convenience endpoint to approve a specific queued draft."""
    if not is_authenticated():
        raise HTTPException(
            status_code=401,
            detail="GOOGLE_AUTH_REQUIRED: Google account is not connected. Please connect your Google account in the top bar before sending."
        )
    if queue_id not in draft_queue_cache:
        raise HTTPException(status_code=404, detail="Draft not found in queue cache")
    item = draft_queue_cache[queue_id]
    to_email = item.get("email")
    subj = item.get("subject")
    body = item.get("body")
    lead_id = item.get("lead_id")

    ok, msg = dispatch_email(to_email=to_email, subject=subj, body=body)
    if ok:
        df = load_data_file(DEFAULT_EXCEL) if DEFAULT_EXCEL.exists() else pd.DataFrame()
        df = ensure_workflow_columns(df)
        if lead_id is not None and lead_id < len(df):
            df.at[lead_id, "Status"] = "Sent"
            df.at[lead_id, "Sent Timestamp"] = str(datetime.now().strftime("%d-%b-%Y %I:%M %p"))
            df.at[lead_id, "Generated Subject"] = str(subj)
            df.at[lead_id, "Generated Email Body"] = str(body)
            save_data_file(df, DEFAULT_EXCEL)
        del draft_queue_cache[queue_id]
        return {"success": True, "message": f"Approved & sent to {to_email}!"}
    else:
        status_code = 401 if "GOOGLE_AUTH_REQUIRED" in msg else 500
        raise HTTPException(status_code=status_code, detail=msg)


@app.delete("/api/discard_draft/{queue_id}")
@app.delete("/api/queue/{queue_id}")
async def discard_draft(queue_id: str):
    """Removes a draft from queue cache."""
    if queue_id in draft_queue_cache:
        del draft_queue_cache[queue_id]
        return {"success": True, "message": "Draft removed from cache"}
    return {"success": False, "message": "Not found in cache"}


# ──────────────────────────────────────────────
# API – Inbox Reader & AI Smart Reply Feature
# ──────────────────────────────────────────────

@app.get("/api/inbox/recent")
async def get_recent_inbox():
    """Fetch recent incoming emails from inbox for review & reply."""
    try:
        emails = fetch_recent_inbox_emails(limit=10)
        return {"success": True, "emails": emails, "count": len(emails)}
    except Exception as e:
        logger.error(f"Failed to fetch inbox: {e}")
        return {"success": False, "error": str(e), "emails": []}


@app.post("/api/inbox/generate_reply")
async def generate_reply(
    from_email: str = Form(...),
    subject: str = Form(...),
    body: str = Form(...),
    message_id: Optional[str] = Form(None)
):
    """
    AI Agent analyzes customer's incoming email and crafts a tailored technical reply.
    """
    agent, _ = get_agent()
    profile = get_company_profile()

    incoming_data = {
        "from": from_email,
        "subject": subject,
        "body": body,
        "message_id": message_id or ""
    }

    reply_out = agent.generate_reply_email(incoming_data, profile)

    return {
        "success": True,
        "reply_subject": reply_out.get("reply_subject", f"Re: {subject}"),
        "reply_body": reply_out.get("reply_body", ""),
        "summary": reply_out.get("summary_of_inquiry", ""),
        "to_email": from_email,
        "in_reply_to": message_id or ""
    }


@app.post("/api/inbox/send_reply")
async def send_inbox_reply(
    to_email: str = Form(...),
    subject: str = Form(...),
    body: str = Form(...),
    in_reply_to: Optional[str] = Form(None)
):
    """
    Sends the generated/approved reply back to the customer strictly via the
    authenticated Google OAuth user account.
    """
    if not is_authenticated():
        raise HTTPException(
            status_code=401,
            detail="GOOGLE_AUTH_REQUIRED: Please sign in with Google in the top bar before sending replies."
        )

    sender_email = get_logged_in_email()
    profile = get_company_profile()
    sender_name = profile.get("sender_name", "SAPCON Instruments")

    ok, msg = send_email_gmail(
        to_email=to_email,
        subject=subject,
        body=body,
        from_name=sender_name,
        in_reply_to=in_reply_to
    )
    if ok:
        return {
            "success": True,
            "message": f"Reply successfully sent to {to_email} from your connected account ({sender_email})!"
        }
    raise HTTPException(status_code=500, detail=msg)


@app.get("/api/profile")
async def get_profile():
    """Return verified company profile and technical catalog for dashboard reference."""
    return get_company_profile()


