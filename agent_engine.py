import os
import json
import logging
from typing import Dict, Any, Optional
from template_renderer import render_sapcon_email, extract_plain_text

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

class GeminiAgent:
    def __init__(self, api_key: Optional[str] = None, model_name: str = "gemini-3.5-flash-lite"):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")
        self.model_name = model_name
        self.client = None
        self._init_client()

    def _init_client(self):
        if not self.api_key:
            logger.warning("No GEMINI_API_KEY found. AI generation will need an API key configured.")
            return
        try:
            from google import genai
            self.client = genai.Client(api_key=self.api_key)
            logger.info("Initialized Google GenAI client successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize google-genai client: {e}")

    def research_company(self, company_name: str) -> str:
        """Optional quick web lookup for company background"""
        if not company_name or len(company_name.strip()) < 3:
            return ""
        try:
            from ddgs import DDGS
            with DDGS(timeout=1.5) as ddgs:
                results = list(ddgs.text(f"{company_name} industrial overview", max_results=1))
                if results:
                    return f"- {results[0].get('title', '')}: {results[0].get('body', '')}"
        except Exception:
            pass
        return ""

    def generate_reply_email(
        self,
        incoming_email: Dict[str, Any],
        sender_profile: Dict[str, Any]
    ) -> Dict[str, str]:
        """
        Analyze an incoming customer email and draft a context-aware,
        professional reply on behalf of SAPCON Instruments.
        """
        from_addr = incoming_email.get("from", "Customer")
        subject = incoming_email.get("subject", "Inquiry")
        body_text = incoming_email.get("body", "")
        clean_from = from_addr.split("<")[0].replace('"', '').strip() or "Client"

        prompt = f"""
You are an expert technical sales engineer at {sender_profile.get('company_name', 'SAPCON Instruments Pvt. Ltd.')}.
A customer sent us this email:
---
From: {from_addr}
Subject: {subject}
Message Body:
{body_text[:1800]}
---

Write a polite, professional, and consultative technical reply addressing their question, requirements, or inquiry.
Company Profile & Competencies:
- Experience: {sender_profile.get('stats', {}).get('experience', '40+ years')}
- Specialized in industrial level measurement, continuous radar/capacitive transmitters, RF admittance switches, speed monitors, MPROF flow meters, Capvel-FUEL.
- Sender: {sender_profile.get('sender_name', 'Sales Team')} ({sender_profile.get('sender_designation', 'Technical Sales')})
- Contact Phone: {sender_profile.get('sender_phone', '+91-731-4855999')}
- Website: {sender_profile.get('sender_website', 'sapconinstruments.com')}

Reply rules:
1. Greet them by name or 'Dear Customer' if name is unavailable.
2. Directly answer their query, acknowledge their application details, and propose the suitable SAPCON product or request necessary process specs (like tank height, material, temperature, pressure).
3. Keep the tone warm, consultative, and concise (2-3 short paragraphs).
4. Include a clear next step (e.g., offer a technical datasheet, discovery call, or quotation).
5. Output ONLY a valid JSON object with the exact keys:
{{
  "reply_subject": "Re: {subject.replace('Re: ', '').replace('RE: ', '')}",
  "reply_body": "Plain text or clean HTML email body",
  "summary_of_inquiry": "One sentence summary of what the customer is asking"
}}
Do NOT output any markdown backticks outside the JSON.
"""
        parsed = {}
        if self.client:
            models_to_try = [self.model_name, "gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-flash-latest"]
            for m in models_to_try:
                try:
                    response = self.client.models.generate_content(
                        model=m,
                        contents=prompt
                    )
                    text = response.text.strip()
                    if "```json" in text:
                        text = text.split("```json")[1].split("```")[0].strip()
                    elif "```" in text:
                        text = text.split("```")[1].split("```")[0].strip()
                    parsed = json.loads(text)
                    logger.info(f"Generated smart reply successfully using model: {m}")
                    break
                except Exception as e:
                    logger.warning(f"Reply model {m} warning: {e}")

        if not parsed:
            reply_subj = f"Re: {subject.replace('Re: ', '').replace('RE: ', '')}"
            reply_text = f"""Dear {clean_from},

Thank you for contacting SAPCON Instruments Pvt. Ltd. We have received your inquiry regarding {subject}.

Our application engineering team has reviewed your note. Could you kindly share further technical specifics such as medium name, operating temperature, pressure, and tank dimensions? This will allow us to recommend the most optimal instrument (e.g. Radar Level Transmitter or RF Admittance switch) and provide an accurate technical datasheet.

We look forward to assisting you.

Best regards,
{sender_profile.get('sender_name', 'Technical Sales Team')}
{sender_profile.get('sender_designation', 'Regional Sales')}
SAPCON Instruments Pvt. Ltd.
Phone: {sender_profile.get('sender_phone', '+91-731-4855999')}
Website: https://www.sapconinstruments.com"""
            parsed = {
                "reply_subject": reply_subj,
                "reply_body": reply_text,
                "summary_of_inquiry": f"Inquiry about {subject}"
            }

        return parsed


    def generate_cold_email(
        self,
        lead_data: Dict[str, Any],
        sender_profile: Dict[str, Any]
    ) -> Dict[str, str]:
        """
        Takes lead details (prospect company, contact, demand, email)
        and sender's company profile, matches appropriate SAPCON product,
        and generates an email formatted according to SAPCON's official template.
        """
        company_name = lead_data.get("company_name", "Valued Client")
        contact_person = lead_data.get("contact_person", "")
        customer_demand = lead_data.get("demand", lead_data.get("requirement", "Industrial process control and level measurement requirements"))
        prospect_email = lead_data.get("email", "")

        # Perform background research
        web_context = self.research_company(company_name)

        prompt = f"""
You are Elvis Joseph, Regional Sales Manager at SAPCON Instruments Pvt. Ltd. (Indore, India).
You are writing a direct 1-to-1 business communication to {contact_person or 'the Plant Engineering & Procurement Team'} at {company_name}.

CRITICAL STYLE INSTRUCTION:
The recipient must feel this email was personally hand-typed by a senior human sales engineer who deeply understands industrial processes.
ABSOLUTELY AVOID robotic AI patterns, pompous adjectives, or synthetic marketing hype:
- DO NOT use words like: "cutting-edge", "game-changer", "revolutionary", "delve", "pinnacle", "beacon", "testament", "seamless synergy", "transform your operations".
- Write naturally, crisp, respectful, and technically precise, like an experienced Indian instrumentation engineer speaking to plant managers.

### PROSPECT APPLICATION & DETAILS:
- Prospect Company: {company_name}
- Contact / Addressed To: {contact_person or 'Plant Engineering & Technical Team'}
- Requirement / Application Challenge: {customer_demand}
- Target Email: {prospect_email}
- Company Context: {web_context}

### SENDER CONTEXT & PRODUCT FIT:
- Company: SAPCON Instruments Pvt. Ltd. (Indore, MP) – 40+ years in industrial level & process control instrumentation.
- Select the exact suitable product:
  * Radar Level Transmitter (SLK) for continuous silo/tank non-contact measurement in dusty/hot solids & liquids.
  * RF Admittance Level Switch (SLA) for material coating/buildup immunity in fly ash, cement, coal, viscous slurry.
  * Capvel-FUEL for diesel generator sets, fleet, and fuel tanks with turbulence damping.
  * Vibrating Fork (Elixir) for clean liquids, pharma/food, PESO flameproof.
  * MPROF for open channel STP/ETP flow calculation.
  * Speed Monitoring System (SMS) for conveyor slip and zero-speed protection.
  * Vibrating Rod / Rotating Paddle for bulk grain, plastic granules, and dry solids.

### TASK:
1. Select the single right product for their demand.
2. Provide exact Product Name & practical Application Note.
3. Write a warm, human, 2-3 sentence personalized technical note:
   - Acknowledge their specific process/application.
   - Mention why this specific model fits their conditions reliably (e.g. high dust immunity, no-moving-parts, or 4-20mA PLC compatibility).
   - Offer to share technical drawings, sizing recommendations, or schedule a quick technical briefing.
4. Craft an authentic, human subject line (e.g. "Level instrumentation enquiry for {company_name}" or "Technical details: Radar Level Transmitter for {company_name}").
5. Decide if a visual product diagram/flyer is relevant (`true` or `false`).

### OUTPUT FORMAT:
Respond strictly with valid JSON:
{{
  "subject": "Authentic, human subject line",
  "product_name": "Radar Level Transmitter",
  "application_note": "Solids-Liquid Level Applications",
  "personalized_pitch": "2-3 crisp, natural, human technical sentences without buzzwords.",
  "recipient_salutation": "{contact_person or company_name}",
  "include_flyer": false
}}
Do NOT output markdown backticks or commentary outside JSON.
"""

        parsed = {}
        if self.client:
            models_to_try = ["gemini-3.5-flash-lite", "gemini-3-flash-preview", "gemini-3.8-flash", "gemini-flash-lite-latest"]
            for m in models_to_try:
                try:
                    response = self.client.models.generate_content(
                        model=m,
                        contents=prompt
                    )
                    text = response.text.strip()
                    if "```json" in text:
                        text = text.split("```json")[1].split("```")[0].strip()
                    elif "```" in text:
                        text = text.split("```")[1].split("```")[0].strip()

                    parsed = json.loads(text)
                    logger.info(f"Generated SAPCON email data successfully using model: {m}")
                    break
                except Exception as e:
                    logger.warning(f"Model {m} returned: {e}. Trying next available model...")

        # Fallback heuristic if API failed or no response
        if not parsed:
            parsed = self._heuristic_fallback(customer_demand, contact_person, company_name)

        product_name = parsed.get("product_name", "Radar Level Transmitter")
        application_note = parsed.get("application_note", "Solids-Liquid Applications")
        personalized_pitch = parsed.get("personalized_pitch", "")
        salutation_name = parsed.get("recipient_salutation", contact_person or company_name)
        subject = parsed.get("subject", f"Level & Process Instrumentation for {company_name} | SAPCON")
        
        # Determine flyer requirement dynamically based on AI decision or lead context
        include_flyer = parsed.get("include_flyer", False)
        if isinstance(include_flyer, str):
            include_flyer = include_flyer.strip().lower() in ["true", "1", "yes"]
        else:
            include_flyer = bool(include_flyer)

        # Render HTML for browser UI preview
        html_preview = render_sapcon_email(
            recipient_name=salutation_name,
            product_name=product_name,
            application_note=application_note,
            personalized_pitch=personalized_pitch,
            sender_info=sender_profile,
            include_flyer=include_flyer,
            product_image_rel="images/image2.png",
            logo_image_rel="images/image1.png",
            for_email_cid=False
        )

        # Render HTML for email dispatch (using cid:image1 and cid:image2)
        html_email = render_sapcon_email(
            recipient_name=salutation_name,
            product_name=product_name,
            application_note=application_note,
            personalized_pitch=personalized_pitch,
            sender_info=sender_profile,
            include_flyer=include_flyer,
            product_image_rel="images/image2.png",
            logo_image_rel="images/image1.png",
            for_email_cid=True
        )

        plain_text = extract_plain_text(
            recipient_name=salutation_name,
            product_name=product_name,
            application_note=application_note,
            personalized_pitch=personalized_pitch,
            sender_info=sender_profile
        )

        return {
            "subject": subject,
            "body": html_preview,        # used for UI display & editor
            "html_email": html_email,    # CID version used when sending via Gmail
            "plain_text": plain_text,
            "product_name": product_name,
            "application_note": application_note,
            "personalized_pitch": personalized_pitch,
            "salutation_name": salutation_name,
            "status": "Generated"
        }

    def _heuristic_fallback(self, demand: str, contact: str, company: str) -> Dict[str, str]:
        d = (demand or "").lower()
        if any(w in d for w in ["fuel", "diesel", "genset", "generator", "fleet", "dg set"]):
            return {
                "subject": f"Capvel-FUEL Level Monitoring for {company} | SAPCON",
                "product_name": "Capvel-FUEL Level Transmitter",
                "application_note": "Fuel Tanks & Fleet Monitoring",
                "personalized_pitch": f"We noted {company}'s requirement regarding fuel management. Our Capvel-FUEL delivers built-in level-to-volume math with temperature and turbulence drift compensation for precision tracking.",
                "recipient_salutation": contact or company
            }
        elif any(w in d for w in ["water", "flow", "stp", "etp", "drain", "canal", "effluent"]):
            return {
                "subject": f"Open Channel Flow Measurement for {company} | SAPCON",
                "product_name": "MPROF Open Channel Flow Meter",
                "application_note": "Effluent & Water Treatment Applications",
                "personalized_pitch": f"For {company}'s water monitoring requirements, SAPCON's MPROF calculates open-channel flow rate using configured weir parameters with standard 4–20 mA output for seamless PLC integration.",
                "recipient_salutation": contact or company
            }
        elif any(w in d for w in ["sticky", "slurry", "fly ash", "coal", "hopper", "cement", "clinker"]):
            return {
                "subject": f"RF Admittance Level Solutions for {company} | SAPCON",
                "product_name": "RF Admittance Level Switch",
                "application_note": "Challenging Silo & Heavy Slurry Applications",
                "personalized_pitch": f"Addressing {company}'s process conditions, our RF Admittance switch is specifically engineered to ignore material coating and buildup, eliminating false alarms in dusty silos and slurry hoppers.",
                "recipient_salutation": contact or company
            }
        else:
            return {
                "subject": f"Radar Level Transmitter Solutions for {company} | SAPCON",
                "product_name": "Radar Level Transmitter",
                "application_note": "Solids-Liquid Applications",
                "personalized_pitch": f"In line with {company}'s instrumentation needs, SAPCON's Radar Level Transmitter provides high-precision non-contact continuous monitoring across varied process temperatures and pressures.",
                "recipient_salutation": contact or company
            }
