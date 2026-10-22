const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const { getSetting, setSetting, deleteSetting } = require('./db_auth');

const isServerless = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
const ROOT = __dirname;
const TOKEN_PATH = isServerless ? path.join('/tmp', 'google_token.json') : path.join(ROOT, 'google_token.json');
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
  const redirectUri = process.env.REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI || null;

  if (fs.existsSync(CLIENT_SECRET_PATH)) {
    const raw = fs.readFileSync(CLIENT_SECRET_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    const cfg = parsed.web || parsed.installed;
    if (cfg) {
      return {
        clientId: cfg.client_id,
        clientSecret: cfg.client_secret,
        redirectUri: redirectUri || (cfg.redirect_uris && cfg.redirect_uris[0]) || REDIRECT_URI,
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
    redirectUri: redirectUri || REDIRECT_URI,
  };
}

function getOAuth2Client(customRedirectUri) {
  const { clientId, clientSecret, redirectUri } = loadClientConfig();
  const effectiveUri = customRedirectUri || redirectUri;
  return new google.auth.OAuth2(clientId, clientSecret, effectiveUri);
}

function getCredentials() {
  let tokens = null;
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const raw = fs.readFileSync(TOKEN_PATH, 'utf-8');
      tokens = JSON.parse(raw);
    } catch (_) {}
  }
  if (!tokens) {
    try {
      const dbTokens = getSetting('google_token');
      if (dbTokens) tokens = typeof dbTokens === 'string' ? JSON.parse(dbTokens) : dbTokens;
    } catch (_) {}
  }
  if (!tokens) return null;

  try {
    const client = getOAuth2Client();
    client.setCredentials(tokens);
    return client;
  } catch (err) {
    console.warn('Failed to configure Google client credentials:', err.message);
    return null;
  }
}

function saveToken(tokens) {
  try {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf-8');
  } catch (_) {}
  try {
    setSetting('google_token', tokens);
  } catch (_) {}
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
  try {
    deleteSetting('google_token');
  } catch (_) {}
  if (_oauth2Client) {
    _oauth2Client.setCredentials({});
  }
}

function getAuthorizationUrl(customRedirectUri) {
  const client = getOAuth2Client(customRedirectUri);
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

async function exchangeCodeForToken(code, customRedirectUri) {
  const client = getOAuth2Client(customRedirectUri);
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

// ──────────────────────────────────────────────
// Yahoo OAuth 2.0 Helpers
// ──────────────────────────────────────────────
const YAHOO_TOKEN_PATH = isServerless ? path.join('/tmp', 'yahoo_token.json') : path.join(ROOT, 'yahoo_token.json');
const YAHOO_AUTH_URL = 'https://api.login.yahoo.com/oauth2/request_auth';
const YAHOO_TOKEN_URL = 'https://api.login.yahoo.com/oauth2/get_token';
const YAHOO_USERINFO_URL = 'https://api.login.yahoo.com/openid/v1/userinfo';

function getYahooClientConfig() {
  const clientId = process.env.YAHOO_CLIENT_ID;
  const clientSecret = process.env.YAHOO_CLIENT_SECRET;
  const redirectUri = process.env.YAHOO_REDIRECT_URI || 'http://localhost:8000/auth/yahoo/callback';
  return { clientId, clientSecret, redirectUri };
}

function getYahooAuthorizationUrl(customRedirectUri) {
  const { clientId, redirectUri } = getYahooClientConfig();
  if (!clientId) {
    throw new Error('YAHOO_CLIENT_ID is not configured in .env');
  }
  const effectiveUri = customRedirectUri || redirectUri;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: effectiveUri,
    response_type: 'code',
    scope: 'openid profile email mail-w mail-r',
  });
  return `${YAHOO_AUTH_URL}?${params.toString()}`;
}

async function exchangeYahooCodeForToken(code, customRedirectUri) {
  const { clientId, clientSecret, redirectUri } = getYahooClientConfig();
  const effectiveUri = customRedirectUri || redirectUri;

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    redirect_uri: effectiveUri,
    code,
  });

  const response = await fetch(YAHOO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Failed to exchange Yahoo code');
  }

  if (data.expires_in) {
    data.expiry_date = Date.now() + data.expires_in * 1000;
  }

  try {
    fs.writeFileSync(YAHOO_TOKEN_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (_) {}
  try {
    setSetting('yahoo_token', data);
  } catch (_) {}
  return data;
}

function getYahooTokenData() {
  if (fs.existsSync(YAHOO_TOKEN_PATH)) {
    try {
      const raw = fs.readFileSync(YAHOO_TOKEN_PATH, 'utf-8');
      return JSON.parse(raw);
    } catch (_) {}
  }
  try {
    const dbToken = getSetting('yahoo_token');
    if (dbToken) return typeof dbToken === 'string' ? JSON.parse(dbToken) : dbToken;
  } catch (_) {}
  return null;
}

function isYahooAuthenticated() {
  const data = getYahooTokenData();
  return Boolean(data && data.access_token);
}

async function getYahooLoggedInEmail() {
  const tokenData = getYahooTokenData();
  if (!tokenData || !tokenData.access_token) return null;
  try {
    const resp = await fetch(YAHOO_USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });
    if (resp.ok) {
      const info = await resp.json();
      return info.email || info.preferred_username || null;
    }
  } catch (err) {
    console.warn('Failed to fetch Yahoo userinfo:', err.message);
  }
  return null;
}

async function refreshYahooToken(tokenData) {
  if (!tokenData || !tokenData.refresh_token) return tokenData;
  const { clientId, clientSecret, redirectUri } = getYahooClientConfig();
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    redirect_uri: redirectUri,
    refresh_token: tokenData.refresh_token,
  });

  try {
    const response = await fetch(YAHOO_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await response.json();
    if (response.ok && data.access_token) {
      if (data.expires_in) {
        data.expiry_date = Date.now() + data.expires_in * 1000;
      }
      if (!data.refresh_token && tokenData.refresh_token) {
        data.refresh_token = tokenData.refresh_token;
      }
      try {
        fs.writeFileSync(YAHOO_TOKEN_PATH, JSON.stringify(data, null, 2), 'utf-8');
      } catch (_) {}
      try {
        setSetting('yahoo_token', data);
      } catch (_) {}
      return data;
    }
  } catch (err) {
    console.warn('refreshYahooToken failed:', err.message);
  }
  return tokenData;
}

async function sendEmailYahoo({ toEmail, subject, body, fromName = 'SAPCON Instruments' }) {
  let tokenData = getYahooTokenData();
  if (!tokenData || !tokenData.access_token) {
    return {
      success: false,
      message: 'YAHOO_AUTH_REQUIRED: Yahoo account is not connected. Please connect Yahoo in Sign In / Sign Up.',
    };
  }

  // Check if token expired and refresh if necessary
  if (tokenData.expiry_date && Date.now() >= tokenData.expiry_date - 60000) {
    tokenData = await refreshYahooToken(tokenData);
  }

  const senderEmail = (await getYahooLoggedInEmail()) || 'me';

  // 1. First attempt: Dispatch via Yahoo SMTP with XOAUTH2
  try {
    const { clientId, clientSecret } = getYahooClientConfig();
    const transporter = nodemailer.createTransport({
      host: 'smtp.mail.yahoo.com',
      port: 465,
      secure: true,
      auth: {
        type: 'OAuth2',
        user: senderEmail,
        clientId: clientId,
        clientSecret: clientSecret,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
      },
    });

    const isHtml = body.includes('<html') || body.includes('<table') || body.includes('<div');
    const mailOptions = {
      from: `"${fromName}" <${senderEmail}>`,
      to: toEmail,
      subject: subject,
      [isHtml ? 'html' : 'text']: body,
    };

    const info = await transporter.sendMail(mailOptions);
    return {
      success: true,
      message: `Email sent via Yahoo XOAUTH2! (Message ID: ${info.messageId || 'OK'})`,
    };
  } catch (smtpErr) {
    console.warn('Yahoo XOAUTH2 SMTP attempt returned:', smtpErr.message);

    // 2. Second attempt: Yahoo Mail REST API endpoint (https://mail.yahooapis.com/ws/v3/mailboxes/@.id==V1/messages)
    try {
      const restResp = await fetch('https://mail.yahooapis.com/ws/v3/mailboxes/@.id==V1/messages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          message: {
            to: [{ email: toEmail }],
            subject: subject,
            content: {
              type: body.includes('<html') ? 'text/html' : 'text/plain',
              data: body,
            },
          },
        }),
      });

      if (restResp.ok) {
        const restData = await restResp.json().catch(() => ({}));
        return {
          success: true,
          message: `Email sent via Yahoo Mail API! (ID: ${restData.id || 'OK'})`,
        };
      }
    } catch (restErr) {
      console.warn('Yahoo REST API send failed:', restErr.message);
    }

    return {
      success: false,
      message: `Yahoo dispatch error: ${smtpErr.message}. If Yahoo rejected OAuth SMTP, please ensure "mail-w" permission is enabled in Yahoo Developer Console.`,
    };
  }
}

function logoutYahoo() {
  if (fs.existsSync(YAHOO_TOKEN_PATH)) {
    try {
      fs.unlinkSync(YAHOO_TOKEN_PATH);
    } catch (_) {}
  }
  try {
    deleteSetting('yahoo_token');
  } catch (_) {}
}

module.exports = {
  getCredentials,
  isAuthenticated,
  getLoggedInEmail,
  logout,
  getAuthorizationUrl,
  exchangeCodeForToken,
  sendEmailGmail,
  // Yahoo exports
  getYahooAuthorizationUrl,
  exchangeYahooCodeForToken,
  isYahooAuthenticated,
  getYahooLoggedInEmail,
  logoutYahoo,
  sendEmailYahoo,
};
