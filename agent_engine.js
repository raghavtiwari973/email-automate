const { GoogleGenerativeAI } = require('@google/generative-ai');
const { renderSapconEmail } = require('./template_renderer');

class GeminiAgent {
  constructor(apiKey = null, modelName = 'gemini-1.5-flash') {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    this.modelName = modelName;
    this.genAI = null;
    this.initClient();
  }

  initClient() {
    if (!this.apiKey) {
      console.warn('No GEMINI_API_KEY configured. AI cold emails will use heuristic fallback.');
      return;
    }
    try {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
    } catch (err) {
      console.error('Failed to initialize GoogleGenerativeAI:', err.message);
    }
  }

  heuristicFallback(customerDemand, contactPerson, companyName) {
    const demandLower = (customerDemand || '').toLowerCase();
    let product = 'Radar Level Transmitter';
    let appNote = 'Solids-Liquid Level Applications';
    let pitch =
      'Our SLK series radar level transmitter provides continuous non-contact level measurement with millimeter-precision, resilient against process dust and vapor.';

    if (demandLower.includes('switch') || demandLower.includes('sla') || demandLower.includes('admittance')) {
      product = 'RF Admittance Level Switch';
      appNote = 'Slurry & Build-up Immunity';
      pitch =
        'Our SLA series RF admittance switch features patented coat-guard circuitry preventing false switching from sticky material buildup on probes.';
    } else if (demandLower.includes('fork') || demandLower.includes('elixir')) {
      product = 'Vibrating Fork (Elixir)';
      appNote = 'Liquid Level Switching';
      pitch =
        'Our Elixir vibrating fork level switch delivers fail-safe high/low level detection with no moving parts and universal 4-20mA/relay output.';
    } else if (demandLower.includes('fuel') || demandLower.includes('capvel') || demandLower.includes('diesel')) {
      product = 'Capvel-FUEL Level Transmitter';
      appNote = 'Turbulence Damped Fuel Monitoring';
      pitch =
        'Capvel-FUEL is engineered for fuel tank and generator monitoring, featuring internal slosh-damping and precision RS485 telemetry.';
    } else if (demandLower.includes('flow') || demandLower.includes('mprof') || demandLower.includes('channel')) {
      product = 'MPROF Open Channel Flow Meter';
      appNote = 'ETP/STP Industrial Effluent Measurement';
      pitch =
        'MPROF open-channel ultrasonic flow transmitter accurately calculates volumetric discharge in flumes and weirs with totalizer memory.';
    } else if (demandLower.includes('speed') || demandLower.includes('sms') || demandLower.includes('conveyor')) {
      product = 'Speed Monitoring System (SMS)';
      appNote = 'Conveyor Slip & Zero Speed Protection';
      pitch =
        'SMS provides reliable speed sensing, belt slip detection, and zero-speed interlocking to prevent catastrophic mechanical failure on conveyor drives.';
    }

    const greetingName = contactPerson || companyName || 'Technical Team';
    return {
      subject: `Level & Process Instrumentation for ${companyName} | SAPCON`,
      product_name: product,
      application_note: appNote,
      personalized_pitch: pitch,
      recipient_salutation: greetingName,
      include_flyer: false,
    };
  }

  async generateColdEmail(leadData, senderProfile) {
    const companyName = leadData.company_name || 'Valued Client';
    const contactPerson = leadData.contact_person || '';
    const customerDemand =
      leadData.demand || leadData.requirement || 'Industrial process control and level measurement requirements';
    const prospectEmail = leadData.email || '';

    const prompt = `
You are Elvis Joseph, Regional Sales Manager at SAPCON Instruments Pvt. Ltd. (Indore, India).
You are writing a direct 1-to-1 business communication to ${contactPerson || 'the Plant Engineering & Procurement Team'} at ${companyName}.

CRITICAL STYLE INSTRUCTION:
The recipient must feel this email was personally hand-typed by a senior human sales engineer who deeply understands industrial processes.
ABSOLUTELY AVOID robotic AI patterns, pompous adjectives, or synthetic marketing hype:
- DO NOT use words like: "cutting-edge", "game-changer", "revolutionary", "delve", "pinnacle", "beacon", "testament", "seamless synergy", "transform your operations".
- Write naturally, crisp, respectful, and technically precise, like an experienced Indian instrumentation engineer speaking to plant managers.

### PROSPECT APPLICATION & DETAILS:
- Prospect Company: ${companyName}
- Contact / Addressed To: ${contactPerson || 'Plant Engineering & Technical Team'}
- Requirement / Application Challenge: ${customerDemand}
- Target Email: ${prospectEmail}

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
4. Craft an authentic, human subject line (e.g. "Level instrumentation enquiry for ${companyName}" or "Technical details: Radar Level Transmitter for ${companyName}").
5. Decide if a visual product diagram/flyer is relevant (true or false).

### OUTPUT FORMAT:
Respond strictly with valid JSON:
{
  "subject": "Authentic, human subject line",
  "product_name": "Radar Level Transmitter",
  "application_note": "Solids-Liquid Level Applications",
  "personalized_pitch": "2-3 crisp, natural, human technical sentences without buzzwords.",
  "recipient_salutation": "${contactPerson || companyName}",
  "include_flyer": false
}
Do NOT output markdown backticks or commentary outside JSON.
`;

    let parsed = null;

    if (this.genAI) {
      const modelsToTry = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-flash-latest'];
      for (const modelName of modelsToTry) {
        try {
          const model = this.genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(prompt);
          let text = result.response.text().trim();
          if (text.includes('```json')) {
            text = text.split('```json')[1].split('```')[0].trim();
          } else if (text.includes('```')) {
            text = text.split('```')[1].split('```')[0].trim();
          }
          parsed = JSON.parse(text);
          console.log(`AI cold email generated via model: ${modelName}`);
          break;
        } catch (err) {
          console.warn(`Model ${modelName} warning:`, err.message);
        }
      }
    }

    if (!parsed) {
      parsed = this.heuristicFallback(customerDemand, contactPerson, companyName);
    }

    const productName = parsed.product_name || 'Radar Level Transmitter';
    const applicationNote = parsed.application_note || 'Solids-Liquid Applications';
    const personalizedPitch = parsed.personalized_pitch || '';
    const salutationName = parsed.recipient_salutation || contactPerson || companyName;
    const subject = parsed.subject || `Level & Process Instrumentation for ${companyName} | SAPCON`;
    const includeFlyer = parsed.include_flyer === true || parsed.include_flyer === 'true';

    const htmlBody = renderSapconEmail({
      recipientName: salutationName,
      productName,
      applicationNote,
      personalizedPitch,
      senderInfo: senderProfile,
      includeFlyer,
      productImageRel: 'images/image2.png',
      logoImageRel: 'images/image1.png',
      forEmailCid: false,
    });

    return {
      subject,
      body: htmlBody,
      product_name: productName,
      application_note: applicationNote,
      personalized_pitch: personalizedPitch,
    };
  }

  async generateReplyEmail(incomingEmail, senderProfile) {
    const fromAddr = incomingEmail.from || 'Customer';
    const subject = incomingEmail.subject || 'Inquiry';
    const bodyText = incomingEmail.body || '';
    const cleanFrom = fromAddr.split('<')[0].replace(/"/g, '').trim() || 'Client';

    const prompt = `
You are an expert technical sales engineer at ${senderProfile.company_name || 'SAPCON Instruments Pvt. Ltd.'}.
A customer sent us this email:
---
From: ${fromAddr}
Subject: ${subject}
Message Body:
${bodyText.slice(0, 1800)}
---

Write a polite, professional, and consultative technical reply addressing their question, requirements, or inquiry.
Company Profile & Competencies:
- Experience: ${senderProfile.stats?.experience || '40+ years'}
- Specialized in industrial level measurement, continuous radar/capacitive transmitters, RF admittance switches, speed monitors, MPROF flow meters, Capvel-FUEL.
- Sender: ${senderProfile.sender_name || 'Sales Team'} (${senderProfile.sender_designation || 'Technical Sales'})
- Contact Phone: ${senderProfile.sender_phone || '+91-731-4855999'}
- Website: ${senderProfile.sender_website || 'sapconinstruments.com'}

Reply rules:
1. Greet them by name or 'Dear Customer' if name is unavailable.
2. Directly answer their query, acknowledge their application details, and propose the suitable SAPCON product or request necessary process specs (like tank height, material, temperature, pressure).
3. Keep the tone warm, consultative, and concise (2-3 short paragraphs).
4. Include a clear next step (e.g., offer a technical datasheet, discovery call, or quotation).
5. Output ONLY a valid JSON object with the exact keys:
{
  "reply_subject": "Re: ${subject.replace(/^Re:\s*/i, '')}",
  "reply_body": "Plain text or clean HTML email body",
  "summary_of_inquiry": "One sentence summary of what the customer is asking"
}
Do NOT output any markdown backticks outside the JSON.
`;

    let parsed = null;

    if (this.genAI) {
      const modelsToTry = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-flash-latest'];
      for (const modelName of modelsToTry) {
        try {
          const model = this.genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(prompt);
          let text = result.response.text().trim();
          if (text.includes('```json')) {
            text = text.split('```json')[1].split('```')[0].trim();
          } else if (text.includes('```')) {
            text = text.split('```')[1].split('```')[0].trim();
          }
          parsed = JSON.parse(text);
          console.log(`Smart reply generated via model: ${modelName}`);
          break;
        } catch (err) {
          console.warn(`Model ${modelName} reply warning:`, err.message);
        }
      }
    }

    if (!parsed) {
      const replySubj = `Re: ${subject.replace(/^Re:\s*/i, '')}`;
      const replyText = `Dear ${cleanFrom},

Thank you for contacting SAPCON Instruments Pvt. Ltd. We have received your inquiry regarding ${subject}.

Our application engineering team has reviewed your note. Could you kindly share further technical specifics such as medium name, operating temperature, pressure, and tank dimensions? This will allow us to recommend the most optimal instrument (e.g. Radar Level Transmitter or RF Admittance switch) and provide an accurate technical datasheet.

We look forward to assisting you.

Best regards,
${senderProfile.sender_name || 'Technical Sales Team'}
${senderProfile.sender_designation || 'Regional Sales'}
SAPCON Instruments Pvt. Ltd.
Phone: ${senderProfile.sender_phone || '+91-731-4855999'}
Website: https://www.sapconinstruments.com`;

      parsed = {
        reply_subject: replySubj,
        reply_body: replyText,
        summary_of_inquiry: `Inquiry regarding ${subject}`,
      };
    }

    return parsed;
  }
}

module.exports = {
  GeminiAgent,
};
