const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

const SAPCON_PRODUCT_LINKS = {
  radar: 'https://www.sapconinstruments.com/products/radar-level-transmitter-slk',
  'radar level transmitter': 'https://www.sapconinstruments.com/products/radar-level-transmitter-slk',
  slk: 'https://www.sapconinstruments.com/products/radar-level-transmitter-slk',
  'guided wave radar': 'https://www.sapconinstruments.com/level-transmitter',
  ultrasonic: 'https://www.sapconinstruments.com/products/ultrasonic-level-transmitter-lut',
  'ultrasonic level transmitter': 'https://www.sapconinstruments.com/products/ultrasonic-level-transmitter-lut',
  lut: 'https://www.sapconinstruments.com/products/ultrasonic-level-transmitter-lut',
  'capacitance level transmitter': 'https://www.sapconinstruments.com/products/capacitance-level-transmitter',
  'capacitive transmitter': 'https://www.sapconinstruments.com/products/capacitance-level-transmitter',
  'capvel-fuel': 'https://www.sapconinstruments.com/products/capvel-fuel-capacitance-level-transmitter',
  capvel: 'https://www.sapconinstruments.com/products/capvel-fuel-capacitance-level-transmitter',
  'fuel level transmitter': 'https://www.sapconinstruments.com/products/capvel-fuel-capacitance-level-transmitter',
  fuel: 'https://www.sapconinstruments.com/products/capvel-fuel-capacitance-level-transmitter',
  magnetostrictive: 'https://www.sapconinstruments.com/level-transmitter',
  'float-based': 'https://www.sapconinstruments.com/level-transmitter',
  'rf admittance': 'https://www.sapconinstruments.com/products/rf-admittance-level-switch-sla',
  'rf admittance level switch': 'https://www.sapconinstruments.com/products/rf-admittance-level-switch-sla',
  sla: 'https://www.sapconinstruments.com/products/rf-admittance-level-switch-sla',
  'vibrating fork': 'https://www.sapconinstruments.com/products/vibrating-fork-level-switch-elixir',
  'vibrating fork level switch': 'https://www.sapconinstruments.com/products/vibrating-fork-level-switch-elixir',
  elixir: 'https://www.sapconinstruments.com/products/vibrating-fork-level-switch-elixir',
  'vibrating rod': 'https://www.sapconinstruments.com/products/vibrating-rod-level-switch-vilastic',
  'vibrating rod level switch': 'https://www.sapconinstruments.com/products/vibrating-rod-level-switch-vilastic',
  vilastic: 'https://www.sapconinstruments.com/products/vibrating-rod-level-switch-vilastic',
  'rotating paddle': 'https://www.sapconinstruments.com/products/rotating-paddle-level-switch-roto',
  'rotating paddle level switch': 'https://www.sapconinstruments.com/products/rotating-paddle-level-switch-roto',
  roto: 'https://www.sapconinstruments.com/products/rotating-paddle-level-switch-roto',
  'capacitance level switch': 'https://www.sapconinstruments.com/products/capacitance-level-switch',
  conductivity: 'https://www.sapconinstruments.com/products/conductivity-level-switch',
  'conductivity level switch': 'https://www.sapconinstruments.com/products/conductivity-level-switch',
  'point level': 'https://www.sapconinstruments.com/point-level-switch',
  mprof: 'https://www.sapconinstruments.com/products/open-channel-flow-meter-mprof',
  'open channel': 'https://www.sapconinstruments.com/products/open-channel-flow-meter-mprof',
  'open channel flow meter': 'https://www.sapconinstruments.com/products/open-channel-flow-meter-mprof',
  'flow meter': 'https://www.sapconinstruments.com/flow-measurement',
  'speed monitoring': 'https://www.sapconinstruments.com/products/speed-monitoring-system-sms',
  'speed monitoring system': 'https://www.sapconinstruments.com/products/speed-monitoring-system-sms',
  'zero speed switch': 'https://www.sapconinstruments.com/products/speed-monitoring-system-sms',
  sms: 'https://www.sapconinstruments.com/products/speed-monitoring-system-sms',
  conveyor: 'https://www.sapconinstruments.com/speed-monitoring',
  'all products': 'https://www.sapconinstruments.com/all-products',
  default: 'https://www.sapconinstruments.com/all-products',
};

function getProductUrl(productName) {
  const pLower = (productName || '').toLowerCase().trim();
  for (const [key, url] of Object.entries(SAPCON_PRODUCT_LINKS)) {
    if (pLower.includes(key)) return url;
  }
  return SAPCON_PRODUCT_LINKS.default;
}

function renderSapconEmail({
  recipientName = '',
  productName = 'Radar Level Transmitter',
  applicationNote = 'Solids-Liquid Applications',
  personalizedPitch = '',
  senderInfo = null,
  productUrl = null,
  includeFlyer = false,
  productImageRel = 'images/image2.png',
  logoImageRel = 'images/image1.png',
  forEmailCid = false,
}) {
  const sender = senderInfo || {};
  const sName = sender.sender_name || 'Elvis Joseph';
  const sDesig = sender.sender_designation || 'Regional Manager – South India Sales';
  const sPhone = sender.sender_phone || '8871428228 / 0731-4757576, 75';
  const sWeb = sender.sender_website || 'sapconinstruments.com';
  const sWebUrl = 'https://www.sapconinstruments.com';

  const resolvedProductUrl = productUrl || getProductUrl(productName);

  const imgLogo = forEmailCid ? 'cid:image1' : '/' + logoImageRel.replace(/^\/+/, '');
  const imgProduct = forEmailCid ? 'cid:image2' : '/' + productImageRel.replace(/^\/+/, '');

  let nameClean = (recipientName || '').trim();
  let salutation = 'Dear Sir/Madam,';
  if (nameClean && !['none', 'nan', 'hi there', ''].includes(nameClean.toLowerCase())) {
    if (!nameClean.toLowerCase().startsWith('dear')) {
      salutation = `Dear ${nameClean},`;
    } else {
      salutation = `${nameClean},`;
    }
  }

  const pitchHtml = personalizedPitch
    ? `<p style="margin:12pt 0; line-height:1.5; color:#2d3748;">${personalizedPitch}</p>`
    : '';

  let flyerHtml = '';
  if (includeFlyer) {
    flyerHtml = `
    <div class="product-image-wrap" style="background-color:#ffffff; padding:12pt 20pt 16pt 20pt; text-align:center;">
      <a href="${resolvedProductUrl}" target="_blank">
        <img src="${imgProduct}" alt="${productName}" style="max-width:520px; width:100%; height:auto; border-radius:6px; border:1px solid #edf2f7; display:inline-block;">
      </a>
    </div>
    `;
  } else {
    flyerHtml = `
    <div style="padding:4pt 24pt 16pt 24pt;">
      <div style="background-color:#f8fafc; border:1px solid #e2e8f0; border-left:4px solid #0f2c59; border-radius:6px; padding:12px 18px;">
        <span style="font-size:10pt; color:#4a5568;">Recommended Product:</span>
        <strong style="font-size:11pt; color:#0f2c59; display:block; margin:2px 0 6px 0;">${productName}</strong>
        <a href="${resolvedProductUrl}" target="_blank" style="display:inline-block; font-size:9.5pt; font-weight:700; color:#0f2c59; text-decoration:underline;">
          View Technical Specifications on SAPCON &rarr;
        </a>
      </div>
    </div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SAPCON Instruments</title>
<style type="text/css">
  body {
    margin: 0;
    padding: 20px 0;
    background-color: #f1f5f9;
    font-family: Arial, Helvetica, sans-serif;
    color: #2d3748;
    -webkit-font-smoothing: antialiased;
  }
  .email-container {
    max-width: 620px;
    margin: 0 auto;
    background-color: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 16px rgba(15, 44, 89, 0.08);
  }
  .email-body {
    padding: 24pt 24pt 14pt 24pt;
    font-size: 11pt;
    line-height: 1.5;
    color: #2d3748;
  }
  .email-body p {
    margin: 0 0 10pt 0;
  }
  .signature-card {
    background-color: #ffffff;
    border-top: 1px solid #e2e8f0;
    padding: 16pt 24pt;
  }
  .sig-table {
    width: 100%;
    border-collapse: collapse;
  }
  .sig-logo-td {
    width: 95px;
    vertical-align: middle;
    padding-right: 16pt;
    border-right: 1.5pt solid #0f2c59;
  }
  .sig-logo-td img {
    width: 88px;
    height: auto;
    display: block;
  }
  .sig-info-td {
    vertical-align: middle;
    padding-left: 16pt;
    font-size: 10pt;
    line-height: 1.35;
    color: #4a5568;
  }
  .sig-thanks {
    font-size: 10.5pt;
    color: #2d3748;
    margin-bottom: 2px;
  }
  .sig-name {
    font-size: 11pt;
    font-weight: 700;
    color: #0f2c59;
  }
  .sig-desig {
    font-size: 9.5pt;
    color: #4a5568;
    margin-bottom: 3px;
  }
  .sig-company {
    font-size: 10pt;
    font-weight: 700;
    color: #2d3748;
  }
  .sig-contact {
    font-size: 9pt;
    color: #4a5568;
    margin-top: 3px;
  }
  .sig-link {
    color: #0f2c59;
    text-decoration: underline;
    font-weight: 600;
  }
  .footer-bar {
    background-color: #f8fafc;
    border-top: 1px solid #e2e8f0;
    padding: 14pt 24pt;
    text-align: center;
    font-size: 9.5pt;
    color: #718096;
    line-height: 1.4;
  }
</style>
</head>
<body>
  <div class="email-container">
    <div class="email-body">
      <p>${salutation}</p>
      <p>Greetings from <strong>SAPCON Instruments Pvt. Ltd.</strong></p>
      <p style="margin-top:12pt;">Please find attached our product details featuring the <a href="${resolvedProductUrl}" target="_blank" style="color:#0f2c59; font-weight:700; text-decoration:underline;">${productName}</a> for ${applicationNote}.</p>
      ${pitchHtml}
      <p style="margin-top:12pt;">We would be pleased to support your project and regular instrumentation requirements and provide further technical or commercial details based on your application.</p>
      <p style="margin-top:12pt; margin-bottom:0;">Looking forward to your requirements.</p>
    </div>

    ${flyerHtml}

    <div class="signature-card">
      <table class="sig-table">
        <tr>
          <td class="sig-logo-td">
            <img src="${imgLogo}" alt="SAPCON Instruments Official Logo">
          </td>
          <td class="sig-info-td">
            <div class="sig-thanks">Thanks &amp; Regards,</div>
            <div class="sig-name">${sName}</div>
            <div class="sig-desig">${sDesig}</div>
            <div class="sig-company">SAPCON Instruments Pvt. Ltd.</div>
            <div class="sig-contact">
              P: ${sPhone}<br>
              W: <a href="${sWebUrl}" class="sig-link" target="_blank">${sWeb}</a>
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
</html>`;
}

module.exports = {
  renderSapconEmail,
  getProductUrl,
  SAPCON_PRODUCT_LINKS,
};
