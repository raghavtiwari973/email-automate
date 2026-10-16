import re
from pathlib import Path
from typing import Dict, Any, Optional

ROOT = Path(__file__).resolve().parent
IMAGES_DIR = ROOT / "images"

# Official SAPCON product catalog URLs for recommendation (from https://www.sapconinstruments.com/all-products)
SAPCON_PRODUCT_LINKS = {
    # Continuous Level Transmitters
    "radar": "https://www.sapconinstruments.com/products/radar-level-transmitter-slk",
    "radar level transmitter": "https://www.sapconinstruments.com/products/radar-level-transmitter-slk",
    "slk": "https://www.sapconinstruments.com/products/radar-level-transmitter-slk",
    "guided wave radar": "https://www.sapconinstruments.com/level-transmitter",
    "ultrasonic": "https://www.sapconinstruments.com/products/ultrasonic-level-transmitter-lut",
    "ultrasonic level transmitter": "https://www.sapconinstruments.com/products/ultrasonic-level-transmitter-lut",
    "lut": "https://www.sapconinstruments.com/products/ultrasonic-level-transmitter-lut",
    "capacitance level transmitter": "https://www.sapconinstruments.com/products/capacitance-level-transmitter",
    "capacitive transmitter": "https://www.sapconinstruments.com/products/capacitance-level-transmitter",
    "capvel-fuel": "https://www.sapconinstruments.com/products/capvel-fuel-capacitance-level-transmitter",
    "capvel": "https://www.sapconinstruments.com/products/capvel-fuel-capacitance-level-transmitter",
    "fuel level transmitter": "https://www.sapconinstruments.com/products/capvel-fuel-capacitance-level-transmitter",
    "fuel": "https://www.sapconinstruments.com/products/capvel-fuel-capacitance-level-transmitter",
    "magnetostrictive": "https://www.sapconinstruments.com/level-transmitter",
    "float-based": "https://www.sapconinstruments.com/level-transmitter",

    # Point Level Switches
    "rf admittance": "https://www.sapconinstruments.com/products/rf-admittance-level-switch-sla",
    "rf admittance level switch": "https://www.sapconinstruments.com/products/rf-admittance-level-switch-sla",
    "sla": "https://www.sapconinstruments.com/products/rf-admittance-level-switch-sla",
    "vibrating fork": "https://www.sapconinstruments.com/products/vibrating-fork-level-switch-elixir",
    "vibrating fork level switch": "https://www.sapconinstruments.com/products/vibrating-fork-level-switch-elixir",
    "elixir": "https://www.sapconinstruments.com/products/vibrating-fork-level-switch-elixir",
    "vibrating rod": "https://www.sapconinstruments.com/products/vibrating-rod-level-switch-vilastic",
    "vibrating rod level switch": "https://www.sapconinstruments.com/products/vibrating-rod-level-switch-vilastic",
    "vilastic": "https://www.sapconinstruments.com/products/vibrating-rod-level-switch-vilastic",
    "rotating paddle": "https://www.sapconinstruments.com/products/rotating-paddle-level-switch-roto",
    "rotating paddle level switch": "https://www.sapconinstruments.com/products/rotating-paddle-level-switch-roto",
    "roto": "https://www.sapconinstruments.com/products/rotating-paddle-level-switch-roto",
    "capacitance level switch": "https://www.sapconinstruments.com/products/capacitance-level-switch",
    "conductivity": "https://www.sapconinstruments.com/products/conductivity-level-switch",
    "conductivity level switch": "https://www.sapconinstruments.com/products/conductivity-level-switch",
    "point level": "https://www.sapconinstruments.com/point-level-switch",

    # Flow Measurement
    "mprof": "https://www.sapconinstruments.com/products/open-channel-flow-meter-mprof",
    "open channel": "https://www.sapconinstruments.com/products/open-channel-flow-meter-mprof",
    "open channel flow meter": "https://www.sapconinstruments.com/products/open-channel-flow-meter-mprof",
    "flow meter": "https://www.sapconinstruments.com/flow-measurement",

    # Speed & Motion Monitoring
    "speed monitoring": "https://www.sapconinstruments.com/products/speed-monitoring-system-sms",
    "speed monitoring system": "https://www.sapconinstruments.com/products/speed-monitoring-system-sms",
    "zero speed switch": "https://www.sapconinstruments.com/products/speed-monitoring-system-sms",
    "sms": "https://www.sapconinstruments.com/products/speed-monitoring-system-sms",
    "conveyor": "https://www.sapconinstruments.com/speed-monitoring",
    
    # Fallback to full products catalog
    "all products": "https://www.sapconinstruments.com/all-products",
    "default": "https://www.sapconinstruments.com/all-products"
}

def get_product_url(product_name: str) -> str:
    """Matches a product name to its official SAPCON URL."""
    p_lower = (product_name or "").lower().strip()
    for key, url in SAPCON_PRODUCT_LINKS.items():
        if key in p_lower:
            return url
    return SAPCON_PRODUCT_LINKS["default"]


def render_sapcon_email(
    recipient_name: str,
    product_name: str,
    application_note: str,
    personalized_pitch: str,
    sender_info: Optional[Dict[str, Any]] = None,
    product_url: Optional[str] = None,
    include_flyer: bool = False,
    product_image_rel: str = "images/image2.png",
    logo_image_rel: str = "images/image1.png",
    for_email_cid: bool = False
) -> str:
    """
    Renders an executive-grade HTML marketing email strictly adhering to
    SAPCON Instruments' official template design (SAPCONInstrumentsMarketingEmail.html).

    - If include_flyer is True: embeds the product flyer banner.
    - If include_flyer is False: cleanly omits the flyer and renders a streamlined technical email.
    - Uses official SAPCON product URLs for recommendation.
    """
    sender = sender_info or {}
    s_name = sender.get("sender_name", "Elvis Joseph")
    s_desig = sender.get("sender_designation", "Regional Manager – South India Sales")
    s_phone = sender.get("sender_phone", "8871428228 / 0731-4757576, 75")
    s_web = sender.get("sender_website", "sapconinstruments.com")
    s_web_url = "https://www.sapconinstruments.com"

    # Resolve product URL
    if not product_url:
        product_url = get_product_url(product_name)

    img_logo = "cid:image1" if for_email_cid else f"/{logo_image_rel.lstrip('/')}"
    img_product = "cid:image2" if for_email_cid else f"/{product_image_rel.lstrip('/')}"

    # Clean greeting
    name_clean = recipient_name.strip()
    if not name_clean or name_clean.lower() in ["none", "nan", "hi there", ""]:
        salutation = "Dear Sir/Madam,"
    elif not name_clean.lower().startswith("dear"):
        salutation = f"Dear {name_clean},"
    else:
        salutation = f"{name_clean},"

    if not product_name:
        product_name = "Radar Level Transmitter"
    if not application_note:
        application_note = "Solids-Liquid Applications"

    product_intro = (
        f'Please find attached our product details featuring the '
        f'<a href="{product_url}" target="_blank" style="color:#0f2c59; font-weight:700; text-decoration:underline;">'
        f'{product_name}</a> for {application_note}.'
    )

    pitch_html = (
        f'<p style="margin:12pt 0; line-height:1.5; color:#2d3748;">{personalized_pitch}</p>'
        if personalized_pitch else ""
    )

    # Optional product flyer / banner block
    if include_flyer:
        flyer_html = f"""
    <div class="product-image-wrap" style="background-color:#ffffff; padding:12pt 20pt 16pt 20pt; text-align:center;">
      <a href="{product_url}" target="_blank">
        <img src="{img_product}" alt="{product_name}" style="max-width:520px; width:100%; height:auto; border-radius:6px; border:1px solid #edf2f7; display:inline-block;">
      </a>
    </div>
"""
    else:
        # Streamlined recommendation card without image
        flyer_html = f"""
    <div style="padding:4pt 24pt 16pt 24pt;">
      <div style="background-color:#f8fafc; border:1px solid #e2e8f0; border-left:4px solid #0f2c59; border-radius:6px; padding:12px 18px;">
        <span style="font-size:10pt; color:#4a5568;">Recommended Product:</span>
        <strong style="font-size:11pt; color:#0f2c59; display:block; margin:2px 0 6px 0;">{product_name}</strong>
        <a href="{product_url}" target="_blank" style="display:inline-block; font-size:9.5pt; font-weight:700; color:#0f2c59; text-decoration:underline;">
          View Technical Specifications on SAPCON &rarr;
        </a>
      </div>
    </div>
"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SAPCON Instruments</title>
<style type="text/css">
  body {{
    margin: 0;
    padding: 20px 0;
    background-color: #f1f5f9;
    font-family: Arial, Helvetica, sans-serif;
    color: #2d3748;
    -webkit-font-smoothing: antialiased;
  }}
  .email-container {{
    max-width: 620px;
    margin: 0 auto;
    background-color: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 16px rgba(15, 44, 89, 0.08);
  }}
  .email-body {{
    padding: 24pt 24pt 14pt 24pt;
    font-size: 11pt;
    line-height: 1.5;
    color: #2d3748;
  }}
  .email-body p {{
    margin: 0 0 10pt 0;
  }}
  .signature-card {{
    background-color: #ffffff;
    border-top: 1px solid #e2e8f0;
    padding: 16pt 24pt;
  }}
  .sig-table {{
    width: 100%;
    border-collapse: collapse;
  }}
  .sig-logo-td {{
    width: 95px;
    vertical-align: middle;
    padding-right: 16pt;
    border-right: 1.5pt solid #0f2c59;
  }}
  .sig-logo-td img {{
    width: 88px;
    height: auto;
    display: block;
  }}
  .sig-info-td {{
    vertical-align: middle;
    padding-left: 16pt;
    font-size: 10pt;
    line-height: 1.35;
    color: #4a5568;
  }}
  .sig-thanks {{
    font-size: 10.5pt;
    color: #2d3748;
    margin-bottom: 2px;
  }}
  .sig-name {{
    font-size: 11pt;
    font-weight: 700;
    color: #0f2c59;
  }}
  .sig-desig {{
    font-size: 9.5pt;
    color: #4a5568;
    margin-bottom: 3px;
  }}
  .sig-company {{
    font-size: 10pt;
    font-weight: 700;
    color: #2d3748;
  }}
  .sig-contact {{
    font-size: 9pt;
    color: #4a5568;
    margin-top: 3px;
  }}
  .sig-link {{
    color: #0f2c59;
    text-decoration: underline;
    font-weight: 600;
  }}
  .footer-bar {{
    background-color: #f8fafc;
    border-top: 1px solid #e2e8f0;
    padding: 14pt 24pt;
    text-align: center;
    font-size: 9.5pt;
    color: #718096;
    line-height: 1.4;
  }}
</style>
</head>
<body>
  <div class="email-container">
    <div class="email-body">
      <p>{salutation}</p>
      <p>Greetings from <strong>SAPCON Instruments Pvt. Ltd.</strong></p>
      <p style="margin-top:12pt;">{product_intro}</p>
      {pitch_html}
      <p style="margin-top:12pt;">We would be pleased to support your project and regular instrumentation requirements and provide further technical or commercial details based on your application.</p>
      <p style="margin-top:12pt; margin-bottom:0;">Looking forward to your requirements.</p>
    </div>

    {flyer_html}

    <div class="signature-card">
      <table class="sig-table">
        <tr>
          <td class="sig-logo-td">
            <img src="{img_logo}" alt="SAPCON Instruments Official Logo">
          </td>
          <td class="sig-info-td">
            <div class="sig-thanks">Thanks &amp; Regards,</div>
            <div class="sig-name">{s_name}</div>
            <div class="sig-desig">{s_desig}</div>
            <div class="sig-company">SAPCON Instruments Pvt. Ltd.</div>
            <div class="sig-contact">
              P: {s_phone}<br>
              W: <a href="{s_web_url}" class="sig-link" target="_blank">{s_web}</a>
            </div>
          </td>
        </tr>
      </table>
    </div>

    <div class="footer-bar">
      <div>&copy; 2026 SAPCON Instruments. All rights reserved.</div>
      <div>Process Control Instrumentation &bull; Indore, India</div>
    </div>
  </div>
</body>
</html>
"""
    return html


def extract_plain_text(
    recipient_name: str,
    product_name: str,
    application_note: str,
    personalized_pitch: str,
    sender_info: Optional[Dict[str, Any]] = None,
    product_url: Optional[str] = None
) -> str:
    """Generate clean plain text fallback for email clients that do not render HTML."""
    sender = sender_info or {}
    s_name = sender.get("sender_name", "Elvis Joseph")
    s_desig = sender.get("sender_designation", "Regional Manager – South India Sales")
    s_phone = sender.get("sender_phone", "8871428228 / 0731-4757576, 75")
    s_web = sender.get("sender_website", "sapconinstruments.com")

    if not product_url:
        product_url = get_product_url(product_name)

    name = recipient_name.strip() or "Sir/Madam"
    salutation = f"Dear {name}," if not name.lower().startswith("dear") else name
    pitch = f"\n\n{personalized_pitch}" if personalized_pitch else ""

    return f"""{salutation}

Greetings from SAPCON Instruments Pvt. Ltd.

Please find attached our product details featuring the {product_name} for {application_note}.{pitch}

Product Link & Specifications: {product_url}

We would be pleased to support your project and regular instrumentation requirements and provide further technical or commercial details based on your application.

Looking forward to your requirements.

Thanks & Regards,
{s_name}
{s_desig}
SAPCON Instruments Pvt. Ltd.
P: {s_phone}
W: {s_web}

--
© 2026 SAPCON Instruments. All rights reserved.
Process Control Instrumentation | Indore, India
"""
