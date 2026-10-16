"""
Google OAuth 2.0 + Gmail API handler.
Replaces SMTP entirely — no app passwords needed.
"""

import os
import json
import base64
import logging
from pathlib import Path
import re
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent
TOKEN_PATH = ROOT / "google_token.json"
CLIENT_SECRET_PATH = ROOT / "google_credentials.json"

SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]

REDIRECT_URI = "http://localhost:8000/auth/callback"


# ── In-memory flow store (single-user local app) ──
_active_flow: Flow | None = None


# ──────────────────────────────────────────────
# Credential helpers
# ──────────────────────────────────────────────

def _load_client_config() -> dict:
    """Load OAuth client config from google_credentials.json or env vars."""
    if CLIENT_SECRET_PATH.exists():
        with open(CLIENT_SECRET_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    client_id     = os.environ.get("GOOGLE_CLIENT_ID", "")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "")
    if not client_id or not client_secret:
        raise FileNotFoundError(
            "Google OAuth credentials not found. "
            "Place google_credentials.json in the project root."
        )
    return {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uris": [REDIRECT_URI],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }


def get_credentials() -> Credentials | None:
    """Return valid (possibly refreshed) credentials, or None if not logged in."""
    if not TOKEN_PATH.exists():
        return None
    try:
        # Load authorized user without forcing strict scopes so existing refresh tokens work
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH))
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            _save_token(creds)
        if creds and creds.valid:
            return creds
    except Exception as exc:
        logger.warning("Failed to load/refresh token: %s", exc)
    return None



def _save_token(creds: Credentials):
    with open(TOKEN_PATH, "w", encoding="utf-8") as f:
        f.write(creds.to_json())


def is_authenticated() -> bool:
    return get_credentials() is not None


def get_logged_in_email() -> str | None:
    creds = get_credentials()
    if not creds:
        return None
    try:
        service = build("oauth2", "v2", credentials=creds)
        info = service.userinfo().get().execute()
        return info.get("email")
    except Exception:
        return None


def logout():
    TOKEN_PATH.unlink(missing_ok=True)


# ──────────────────────────────────────────────
# OAuth flow helpers — SAME FLOW OBJECT reused
# ──────────────────────────────────────────────

def get_authorization_url() -> str:
    """
    Build the Google OAuth consent URL.
    Saves the Flow object globally so the callback can reuse it
    (required to pass the PKCE code_verifier correctly).
    """
    global _active_flow
    config = _load_client_config()
    _active_flow = Flow.from_client_config(
        config,
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI,
    )
    # Do NOT pass code_challenge / PKCE here — let the library decide,
    # but we reuse the same flow object so verifier is preserved.
    auth_url, _ = _active_flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    return auth_url


def exchange_code_for_token(code: str):
    """
    Exchange auth code → credentials using the SAME flow object
    that generated the auth URL (preserves code_verifier for PKCE).
    """
    global _active_flow
    if _active_flow is None:
        # Fallback: create a new flow without PKCE
        config = _load_client_config()
        _active_flow = Flow.from_client_config(
            config, scopes=SCOPES, redirect_uri=REDIRECT_URI
        )

    _active_flow.fetch_token(code=code)
    creds = _active_flow.credentials
    _save_token(creds)
    _active_flow = None  # clear after use
    return creds


# ──────────────────────────────────────────────
# Gmail send
# ──────────────────────────────────────────────

def send_email_gmail(
    to_email: str,
    subject: str,
    body: str,
    from_name: str = "SAPCON Instruments",
    thread_id: str | None = None,
    in_reply_to: str | None = None,
) -> tuple[bool, str]:
    """Send email via Gmail API supporting both plain text and rich HTML with inline images."""
    creds = get_credentials()
    if not creds:
        return False, "Not authenticated with Google. Please log in first."


    try:
        service = build("gmail", "v1", credentials=creds)
        sender_email = get_logged_in_email() or "me"
        from_header = f"{from_name} <{sender_email}>" if sender_email != "me" else from_name
        is_html = ("<html" in body.lower()) or ("<table" in body.lower()) or ("<div" in body.lower())

        if is_html:
            # Related MIME structure for inline CID images
            msg = MIMEMultipart("related")
            msg["Subject"] = subject
            msg["From"]    = from_header
            msg["To"]      = to_email



            # Alternative part for plain text + HTML
            alt = MIMEMultipart("alternative")

            # Extract plain text fallback (strip <style> and <head> first)
            clean_for_text = re.sub(r'<(style|head|script)[^>]*>.*?</\1>', '', body, flags=re.DOTALL | re.IGNORECASE)
            plain_text = re.sub(r'<[^>]+>', ' ', clean_for_text)
            plain_text = re.sub(r'\s+', ' ', plain_text).strip()
            alt.attach(MIMEText(plain_text, "plain", "utf-8"))

            # Convert image references to CID
            html_content = body
            html_content = re.sub(r'src=["\']/?images/image1\.png["\']', 'src="cid:image1"', html_content)
            html_content = re.sub(r'src=["\']/?images/image2\.png["\']', 'src="cid:image2"', html_content)
            alt.attach(MIMEText(html_content, "html", "utf-8"))
            msg.attach(alt)

            # Embed inline images if they exist and are referenced
            img1_path = ROOT / "images" / "image1.png"
            if img1_path.exists() and "cid:image1" in html_content:
                with open(img1_path, "rb") as f:
                    img1 = MIMEImage(f.read())
                    img1.add_header("Content-ID", "<image1>")
                    img1.add_header("Content-Disposition", "inline", filename="image1.png")
                    msg.attach(img1)

            img2_path = ROOT / "images" / "image2.png"
            if img2_path.exists() and "cid:image2" in html_content:
                with open(img2_path, "rb") as f:
                    img2 = MIMEImage(f.read())
                    img2.add_header("Content-ID", "<image2>")
                    img2.add_header("Content-Disposition", "inline", filename="image2.png")
                    msg.attach(img2)
        else:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"]    = from_header
            msg["To"]      = to_email

            part_text = MIMEText(body, "plain", "utf-8")
            html_body = body.replace("\n", "<br>")
            part_html = MIMEText(
                f"<html><body><p>{html_body}</p></body></html>", "html", "utf-8"
            )
            msg.attach(part_text)
            msg.attach(part_html)

        if in_reply_to:
            msg["In-Reply-To"] = in_reply_to
            msg["References"]  = in_reply_to

        raw    = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
        send_body = {"raw": raw}
        if thread_id:
            send_body["threadId"] = thread_id

        result = service.users().messages().send(
            userId="me", body=send_body
        ).execute()

        msg_id = result.get("id", "")
        logger.info("Gmail API sent message id=%s to %s", msg_id, to_email)
        return True, f"Email sent successfully! (Message ID: {msg_id})"

    except HttpError as e:
        logger.error("Gmail API HttpError: %s", e)
        return False, f"Gmail API error: {e.reason}"
    except Exception as e:
        logger.error("send_email_gmail error: %s", e)
        return False, str(e)
