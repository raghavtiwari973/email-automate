"""
Email Reader Service.
Reads recent emails from inbox via Gmail API and extracts
full body text (and HTML), sender metadata, subject, timestamp, and message-id
so the user and AI Agent can review the complete incoming email and draft responses.
"""

import os
import re
import base64
import html
import logging
from typing import List, Dict, Any, Optional
from pathlib import Path

logger = logging.getLogger("EmailReader")

ROOT = Path(__file__).resolve().parent


def _clean_text(s: str) -> str:
    if not s:
        return ""
    # Decode HTML entities if present (&amp;, &lt;, &gt;, etc.)
    text = html.unescape(s)
    # Remove zero-width spaces and non-printable unicode
    text = text.replace('\u200b', '').replace('\ufeff', '').replace('\u200e', '').replace('\u200f', '')
    return text.strip()


def _extract_gmail_payload_body(payload: dict) -> tuple[str, str]:
    """
    Recursively extracts (plain_text_body, html_body) from a Gmail API message payload.
    """
    plain_text = ""
    html_content = ""

    def _walk(part: dict):
        nonlocal plain_text, html_content
        mime_type = part.get("mimeType", "").lower()
        body_data = part.get("body", {}).get("data")

        if body_data:
            try:
                # Gmail API returns URL-safe base64
                decoded_bytes = base64.urlsafe_b64decode(body_data.encode("ASCII"))
                decoded_str = decoded_bytes.decode("utf-8", errors="replace")

                if mime_type == "text/plain" and not plain_text:
                    plain_text = decoded_str
                elif mime_type == "text/html" and not html_content:
                    html_content = decoded_str
            except Exception as e:
                logger.debug(f"Error decoding body part: {e}")

        # Recurse through nested multipart children
        for subpart in part.get("parts", []):
            _walk(subpart)

    _walk(payload)

    # Check if plain_text inadvertently contains CSS rules or tags
    if plain_text and ("body {" in plain_text or ".email-container" in plain_text or "font-family:" in plain_text):
        if html_content:
            text = re.sub(r'<(script|style|head)[^>]*>.*?</\1>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
            text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
            text = re.sub(r'</p>', '\n\n', text, flags=re.IGNORECASE)
            text = re.sub(r'</tr>', '\n', text, flags=re.IGNORECASE)
            text = re.sub(r'</td>', '  ', text, flags=re.IGNORECASE)
            text = re.sub(r'<[^>]+>', ' ', text)
            plain_text = html.unescape(text).strip()
        else:
            # Strip CSS block from plain text
            plain_text = re.sub(r'\{[^}]*\}', '', plain_text)
            plain_text = re.sub(r'/\*.*?\*/', '', plain_text, flags=re.DOTALL)

    # If no plain text was found, convert HTML to clean readable text
    if not plain_text and html_content:
        text = re.sub(r'<(script|style|head)[^>]*>.*?</\1>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
        text = re.sub(r'</p>', '\n\n', text, flags=re.IGNORECASE)
        text = re.sub(r'</tr>', '\n', text, flags=re.IGNORECASE)
        text = re.sub(r'</td>', '  ', text, flags=re.IGNORECASE)
        text = re.sub(r'<[^>]+>', ' ', text)
        plain_text = html.unescape(text).strip()

    return plain_text.strip(), html_content.strip()


def fetch_recent_inbox_emails(limit: int = 15) -> List[Dict[str, Any]]:
    """
    Fetches recent incoming messages directly via Gmail API using connected OAuth credentials.
    Extracts FULL body content (not just a 140-char snippet).
    """
    from oauth_handler import get_credentials, is_authenticated
    creds = get_credentials()
    if not creds:
        logger.warning("No authenticated Google OAuth credentials found for fetching inbox.")
        return []

    try:
        from googleapiclient.discovery import build
        service = build("gmail", "v1", credentials=creds)

        # Query messages in INBOX
        res = service.users().messages().list(userId="me", labelIds=["INBOX"], maxResults=limit).execute()
        messages = res.get("messages", [])
        if not messages:
            return []

        results = []
        for m in messages:
            msg_id = m.get("id")
            try:
                full_msg = service.users().messages().get(userId="me", id=msg_id, format="full").execute()
                payload = full_msg.get("payload", {})
                headers = {h.get("name", "").lower(): h.get("value", "") for h in payload.get("headers", [])}

                subj = headers.get("subject", "(No Subject)")
                from_hdr = headers.get("from", "Unknown")
                date_hdr = headers.get("date", "")
                msg_id_hdr = headers.get("message-id", msg_id)
                snippet = full_msg.get("snippet", "")

                email_match = re.search(r'[\w\.-]+@[\w\.-]+', from_hdr)
                from_email = email_match.group(0) if email_match else from_hdr

                # Extract FULL message body from payload parts
                full_plain_text, full_html = _extract_gmail_payload_body(payload)

                # If body extraction was empty, fallback to snippet
                final_body = full_plain_text if full_plain_text else snippet
                final_body = _clean_text(final_body)

                preview_text = snippet if snippet else final_body[:140]

                results.append({
                    "id": msg_id,
                    "subject": subj,
                    "from": from_hdr,
                    "from_email": from_email,
                    "date": date_hdr,
                    "message_id": msg_id_hdr,
                    "body": final_body,
                    "html": full_html,
                    "preview": preview_text
                })
            except Exception as e:
                logger.error(f"Error fetching detail for message {msg_id}: {e}")

        return results

    except Exception as e:
        logger.error(f"Gmail API inbox fetch error: {e}")
        return []
