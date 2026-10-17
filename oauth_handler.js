const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const ROOT = __dirname;
const TOKEN_PATH = path.join(ROOT, 'google_token.json');
const CLIENT_SECRET_PATH = path.join(ROOT, 'google_credentials.json');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
];

const REDIRECT_URI = 'http://localhost:8000/auth/callback';

let _oauth2Client = null;

function loadClientConfig() {
  if (fs.existsSync(CLIENT_SECRET_PATH)) {
    const raw = fs.readFileSync(CLIENT_SECRET_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    const cfg = parsed.web || parsed.installed;
    if (cfg) {
      return {
        clientId: cfg.client_id,
        clientSecret: cfg.client_secret,
        redirectUri: (cfg.redirect_uris && cfg.redirect_uris[0]) || REDIRECT_URI,
      };
    }
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'Google OAuth credentials not found. Place google_credentials.json in the project root.'
    );
  }
  return {
    clientId,
    clientSecret,
    redirectUri: REDIRECT_URI,
  };
}

function getOAuth2Client() {
  if (_oauth2Client) return _oauth2Client;
  const { clientId, clientSecret, redirectUri } = loadClientConfig();
  _oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  return _oauth2Client;
}

function getCredentials() {
  if (!fs.existsSync(TOKEN_PATH)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(TOKEN_PATH, 'utf-8');
    const tokens = JSON.parse(raw);
    const client = getOAuth2Client();
    client.setCredentials(tokens);
    return client;
  } catch (err) {
    console.warn('Failed to load Google tokens:', err.message);
    return null;
  }
}

function saveToken(tokens) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf-8');
}

function isAuthenticated() {
  return getCredentials() !== null;
}

async function getLoggedInEmail() {
  const auth = getCredentials();
  if (!auth) return null;
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth });
    const res = await oauth2.userinfo.get();
    return res.data.email || null;
  } catch (err) {
    console.warn('Failed to fetch userinfo:', err.message);
    return null;
  }
}

function logout() {
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      fs.unlinkSync(TOKEN_PATH);
    } catch (_) {}
  }
  if (_oauth2Client) {
    _oauth2Client.setCredentials({});
  }
}

function getAuthorizationUrl() {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

async function exchangeCodeForToken(code) {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  saveToken(tokens);
  return tokens;
}

/**
 * Creates RFC 2822 email string with HTML support and inline attachments (CID).
 */
function buildRawEmail({ to, subject, body, fromName, fromEmail, inReplyTo }) {
  const isHtml = body.includes('<html') || body.includes('<table') || body.includes('<div');
  const boundary = '----=_Part_' + Math.random().toString(36).substring(2);
  const altBoundary = '----=_Alt_' + Math.random().toString(36).substring(2);

  const fromHeader = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

  let headers = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`,
    'MIME-Version: 1.0',
  ];

  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`);
    headers.push(`References: ${inReplyTo}`);
  }

  let emailContent = '';

  if (isHtml) {
    headers.push(`Content-Type: multipart/related; boundary="${boundary}"`);
    emailContent += headers.join('\r\n') + '\r\n\r\n';

    // Alternative part
    emailContent += `--${boundary}\r\n`;
    emailContent += `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n`;

    // Plain text part
    const cleanText = body.replace(/<(?:.|\n)*?>/gm, ' ').replace(/\s+/g, ' ').trim();
    emailContent += `--${altBoundary}\r\n`;
    emailContent += 'Content-Type: text/plain; charset=UTF-8\r\n';
    emailContent += 'Content-Transfer-Encoding: 7bit\r\n\r\n';
    emailContent += cleanText + '\r\n\r\n';

    // HTML part
    let htmlBody = body;
    htmlBody = htmlBody.replace(/src=["']\/?images\/image1\.png["']/g, 'src="cid:image1"');
    htmlBody = htmlBody.replace(/src=["']\/?images\/image2\.png["']/g, 'src="cid:image2"');

    emailContent += `--${altBoundary}\r\n`;
    emailContent += 'Content-Type: text/html; charset=UTF-8\r\n';
    emailContent += 'Content-Transfer-Encoding: 7bit\r\n\r\n';
    emailContent += htmlBody + '\r\n\r\n';
    emailContent += `--${altBoundary}--\r\n\r\n`;

    // Embed image1 if exists
    const img1Path = path.join(ROOT, 'images', 'image1.png');
    if (fs.existsSync(img1Path) && htmlBody.includes('cid:image1')) {
      const img1Data = fs.readFileSync(img1Path).toString('base64');
      emailContent += `--${boundary}\r\n`;
      emailContent += 'Content-Type: image/png; name="image1.png"\r\n';
      emailContent += 'Content-Transfer-Encoding: base64\r\n';
      emailContent += 'Content-ID: <image1>\r\n';
      emailContent += 'Content-Disposition: inline; filename="image1.png"\r\n\r\n';
      emailContent += img1Data + '\r\n\r\n';
    }

    // Embed image2 if exists
    const img2Path = path.join(ROOT, 'images', 'image2.png');
    if (fs.existsSync(img2Path) && htmlBody.includes('cid:image2')) {
      const img2Data = fs.readFileSync(img2Path).toString('base64');
      emailContent += `--${boundary}\r\n`;
      emailContent += 'Content-Type: image/png; name="image2.png"\r\n';
      emailContent += 'Content-Transfer-Encoding: base64\r\n';
      emailContent += 'Content-ID: <image2>\r\n';
      emailContent += 'Content-Disposition: inline; filename="image2.png"\r\n\r\n';
      emailContent += img2Data + '\r\n\r\n';
    }

    emailContent += `--${boundary}--\r\n`;
  } else {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    emailContent += headers.join('\r\n') + '\r\n\r\n';

    emailContent += `--${boundary}\r\n`;
    emailContent += 'Content-Type: text/plain; charset=UTF-8\r\n';
    emailContent += 'Content-Transfer-Encoding: 7bit\r\n\r\n';
    emailContent += body + '\r\n\r\n';

    const htmlBody = `<html><body><p>${body.replace(/\n/g, '<br>')}</p></body></html>`;
    emailContent += `--${boundary}\r\n`;
    emailContent += 'Content-Type: text/html; charset=UTF-8\r\n';
    emailContent += 'Content-Transfer-Encoding: 7bit\r\n\r\n';
    emailContent += htmlBody + '\r\n\r\n';
    emailContent += `--${boundary}--\r\n`;
  }

  // Convert to URL-safe base64
  return Buffer.from(emailContent)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sendEmailGmail({ toEmail, subject, body, fromName = 'SAPCON Instruments', inReplyTo = null, threadId = null }) {
  const auth = getCredentials();
  if (!auth) {
    return { success: false, message: 'GOOGLE_AUTH_REQUIRED: Please sign in with Google in the top bar before sending.' };
  }

  try {
    const gmail = google.gmail({ version: 'v1', auth });
    const senderEmail = (await getLoggedInEmail()) || 'me';

    const raw = buildRawEmail({
      to: toEmail,
      subject,
      body,
      fromName,
      fromEmail: senderEmail,
      inReplyTo,
    });

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw,
        threadId: threadId || undefined,
      },
    });

    const msgId = res.data.id;
    return { success: true, message: `Email sent successfully! (Message ID: ${msgId})` };
  } catch (err) {
    console.error('sendEmailGmail error:', err.message);
    return { success: false, message: 'Gmail API error: ' + (err.response?.data?.error?.message || err.message) };
  }
}

module.exports = {
  getCredentials,
  isAuthenticated,
  getLoggedInEmail,
  logout,
  getAuthorizationUrl,
  exchangeCodeForToken,
  sendEmailGmail,
};
