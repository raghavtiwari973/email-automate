import os
import smtplib
import ssl
from email.message import EmailMessage
from typing import Dict, Any, Tuple

def send_email_smtp(
    to_email: str,
    subject: str,
    body: str,
    smtp_server: str = "smtp.gmail.com",
    smtp_port: int = 465,
    sender_email: str = "",
    sender_password: str = ""
) -> Tuple[bool, str]:
    """
    Sends an email using standard SMTP.
    Requires an App Password if using Gmail.
    """
    sender_email = sender_email or os.getenv("SMTP_USER", "")
    sender_password = sender_password or os.getenv("SMTP_PASSWORD", "")
    smtp_server = smtp_server or os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(smtp_port or os.getenv("SMTP_PORT", "587"))

    if not sender_email or not sender_password:
        return False, "SMTP credentials missing. Please set SMTP_USER and SMTP_PASSWORD."

    if not to_email:
        return False, "Recipient email address is missing."

    import re
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from email.mime.image import MIMEImage
    from pathlib import Path

    is_html = ("<html" in body.lower()) or ("<table" in body.lower()) or ("<div" in body.lower())

    if is_html:
        msg = MIMEMultipart("related")
        msg["Subject"] = subject
        msg["From"] = sender_email
        msg["To"] = to_email

        alt = MIMEMultipart("alternative")
        plain_text = re.sub(r'<[^>]+>', ' ', body)
        plain_text = re.sub(r'\s+', ' ', plain_text).strip()
        alt.attach(MIMEText(plain_text, "plain", "utf-8"))

        html_content = body
        html_content = re.sub(r'src=["\']/?images/image1\.png["\']', 'src="cid:image1"', html_content)
        html_content = re.sub(r'src=["\']/?images/image2\.png["\']', 'src="cid:image2"', html_content)
        alt.attach(MIMEText(html_content, "html", "utf-8"))
        msg.attach(alt)

        images_dir = Path(__file__).resolve().parent / "images"
        img1_path = images_dir / "image1.png"
        if img1_path.exists() and "cid:image1" in html_content:
            with open(img1_path, "rb") as f:
                img1 = MIMEImage(f.read())
                img1.add_header("Content-ID", "<image1>")
                img1.add_header("Content-Disposition", "inline", filename="image1.png")
                msg.attach(img1)

        img2_path = images_dir / "image2.png"
        if img2_path.exists() and "cid:image2" in html_content:
            with open(img2_path, "rb") as f:
                img2 = MIMEImage(f.read())
                img2.add_header("Content-ID", "<image2>")
                img2.add_header("Content-Disposition", "inline", filename="image2.png")
                msg.attach(img2)
    else:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = sender_email
        msg["To"] = to_email
        msg.set_content(body)

    try:
        sender_password = sender_password.replace(" ", "").strip()
        context = ssl.create_default_context()
        if smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_server, smtp_port, context=context) as server:
                server.login(sender_email, sender_password)
                server.send_message(msg)
        else:
            server = smtplib.SMTP(smtp_server, smtp_port, timeout=20)
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            server.login(sender_email, sender_password)
            server.send_message(msg)
            server.quit()
        return True, "Email sent successfully!"
    except Exception as e:
        return False, f"Failed to send email: {str(e)}"
