const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
require('dotenv').config();

const {
  identifyColumns,
  loadDataFile,
  saveDataFile,
  ensureWorkflowColumns,
} = require('./sheet_manager');

const { GeminiAgent } = require('./agent_engine');

const {
  isAuthenticated,
  getLoggedInEmail,
  getAuthorizationUrl,
  exchangeCodeForToken,
  sendEmailGmail,
  logout,
  getYahooAuthorizationUrl,
  exchangeYahooCodeForToken,
  isYahooAuthenticated,
  getYahooLoggedInEmail,
  logoutYahoo,
  sendEmailYahoo,
} = require('./oauth_handler');

const { fetchRecentInboxEmails } = require('./email_reader');

const {
  initDb,
  registerUser,
  authenticateUser,
  getUserByEmail,
  upsertGoogleUser,
  getAllLeads,
  insertLead,
  updateLeadStatus,
  updateLeadContent,
  deleteLead,
} = require('./db_auth');

const ROOT = __dirname;
const isServerlessEnv = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
const PROFILE_PATH = path.join(ROOT, 'company_profile.json');
const DEFAULT_EXCEL = isServerlessEnv ? path.join('/tmp', 'leads.xlsx') : path.join(ROOT, 'leads.xlsx');
const PORT = process.env.PORT || 8000;

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Netlify functions rewrite support (strip /.netlify/functions/server prefix if present)
app.use((req, res, next) => {
  if (req.url.startsWith('/.netlify/functions/server')) {
    req.url = req.url.replace('/.netlify/functions/server', '') || '/';
  }
  next();
});

// Static Mounts
app.use('/static', express.static(path.join(ROOT, 'static')));
app.use('/images', express.static(path.join(ROOT, 'images')));
if (fs.existsSync(path.join(ROOT, 'dist'))) {
  app.use('/dist', express.static(path.join(ROOT, 'dist')));
}

// Multer memory storage for uploads
const upload = multer({ storage: multer.memoryStorage() });

// Global In-Memory Draft Queue & Processing State
const draftQueueCache = {};
const batchJobStatus = {
  is_processing: false,
  total: 0,
  completed: 0,
  current_company: '',
  error: null,
};

function getCompanyProfile() {
  if (fs.existsSync(PROFILE_PATH)) {
    try {
      const raw = fs.readFileSync(PROFILE_PATH, 'utf-8');
      return JSON.parse(raw);
    } catch (_) {}
  }
  return {
    company_name: 'SAPCON Instruments Pvt. Ltd.',
    sender_name: 'Elvis Joseph',
    sender_designation: 'Regional Manager – South India Sales',
    sender_email: 'krishnadas199227@gmail.com',
    company_website: 'https://www.sapconinstruments.com',
    sender_phone: '8871428228 / 0731-4757576, 75',
    call_to_action: 'Are you open for a quick 10-minute call this week to explore this?',
  };
}

function getAgent() {
  return new GeminiAgent(process.env.GEMINI_API_KEY, 'gemini-1.5-flash');
}

async function dispatchEmail(toEmail, subject, body, userSender = null) {
  let sender = (await getLoggedInEmail()) || (await getYahooLoggedInEmail()) || userSender || 'me';
  const profile = getCompanyProfile();
  const senderName = profile.sender_name || 'SAPCON Instruments';

  // 1. If Yahoo OAuth is connected, dispatch via Yahoo XOAUTH2 SMTP / Mail API
  if (isYahooAuthenticated()) {
    const yahooRes = await sendEmailYahoo({
      toEmail,
      subject,
      body,
      fromName: senderName,
    });
    if (yahooRes.success) {
      return { ok: true, message: `${yahooRes.message} (Dispatched from connected Yahoo account: ${sender})` };
    }
    return { ok: false, message: yahooRes.message || 'Yahoo mail dispatch failed.' };
  }

  // 2. If Google OAuth is connected, dispatch via Gmail API
  if (isAuthenticated()) {
    const res = await sendEmailGmail({
      toEmail,
      subject,
      body,
      fromName: senderName,
    });
    if (res.success) {
      return { ok: true, message: `${res.message} (Dispatched from connected account: ${sender})` };
    }
    return { ok: false, message: res.message || 'Gmail dispatch failed.' };
  }

  // If neither account is connected, return clear actionable guidance
  return {
    ok: false,
    message: 'AUTH_REQUIRED: Please connect your Yahoo or Google account (Sign In -> Continue with Yahoo or Google) to dispatch emails directly.',
  };
}

// ──────────────────────────────────────────────
// Page Routes
// ──────────────────────────────────────────────

app.get('/', (req, res) => {
  const userAgent = (req.headers['user-agent'] || '').toLowerCase();
  const isMobile =
    'mobile' in req.query ||
    ['iphone', 'android', 'mobile'].some((dev) => userAgent.includes(dev));

  // If dist/ exists, serve pure HTML/CSS workbench
  const distDir = path.join(ROOT, 'dist');
  const staticDir = path.join(ROOT, 'static');

  if (isMobile) {
    const mobileFile = fs.existsSync(path.join(distDir, 'mobile.html'))
      ? path.join(distDir, 'mobile.html')
      : path.join(staticDir, 'mobile.html');
    if (fs.existsSync(mobileFile)) return res.sendFile(mobileFile);
  }

  const indexFile = fs.existsSync(path.join(distDir, 'index.html'))
    ? path.join(distDir, 'index.html')
    : path.join(staticDir, 'index.html');
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile);

  res.send('SAPCON Workbench Running');
});

app.get('/mobile', (req, res) => {
  const distMobile = path.join(ROOT, 'dist', 'mobile.html');
  const staticMobile = path.join(ROOT, 'static', 'mobile.html');
  const target = fs.existsSync(distMobile) ? distMobile : staticMobile;
  if (fs.existsSync(target)) return res.sendFile(target);
  res.send('Mobile Page Not Found');
});

// ──────────────────────────────────────────────
// Auth Routes
// ──────────────────────────────────────────────

app.post('/auth/register', async (req, res) => {
  const { name = '', email = '', password = '' } = req.body || {};
  if (!email || !email.includes('@')) {
    return res.status(400).json({ detail: 'Please enter a valid email address.' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ detail: 'Password must be at least 6 characters.' });
  }

  const result = await registerUser(name, email, password);
  if (!result.success) {
    return res.status(400).json({ detail: result.message });
  }
  return res.json({ success: true, message: result.message, user: result.user });
});

app.post('/auth/login', async (req, res) => {
  const { email = '', password = '' } = req.body || {};
  const result = await authenticateUser(email, password);
  if (!result.success) {
    return res.status(401).json({ detail: result.message });
  }
  return res.json({ success: true, message: result.message, user: result.user });
});

app.get('/auth/status', async (req, res) => {
  try {
    const authenticated = isAuthenticated();
    let email = null;
    let userRecord = null;

    if (authenticated) {
      email = await getLoggedInEmail();
      if (email) {
        userRecord = await getUserByEmail(email);
        if (!userRecord) {
          userRecord = await upsertGoogleUser(email);
        }
      }
    }

    const yahooAuthenticated = isYahooAuthenticated();
    let yahooEmail = null;
    if (yahooAuthenticated) {
      yahooEmail = await getYahooLoggedInEmail();
    }

    return res.json({
      authenticated,
      email,
      user: userRecord,
      yahoo: {
        authenticated: yahooAuthenticated,
        email: yahooEmail,
      },
    });
  } catch (err) {
    return res.json({
      authenticated: false,
      email: null,
      user: null,
      yahoo: { authenticated: false, email: null },
    });
  }
});

function getRequestRedirectUri(req) {
  if (process.env.REDIRECT_URI) return process.env.REDIRECT_URI;
  const host = req.get('x-forwarded-host') || req.get('host');
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    return `${proto}://${host}/auth/callback`;
  }
  return null;
}

function getYahooRequestRedirectUri(req) {
  if (process.env.YAHOO_REDIRECT_URI) return process.env.YAHOO_REDIRECT_URI;
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:8000';
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  return `${proto}://${host}/auth/yahoo/callback`;
}

app.get('/auth/yahoo', (req, res) => {
  try {
    const callbackUri = getYahooRequestRedirectUri(req);
    const authUrl = getYahooAuthorizationUrl(callbackUri);
    return res.redirect(authUrl);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.get('/auth/yahoo/login-url', (req, res) => {
  try {
    const callbackUri = getYahooRequestRedirectUri(req);
    const authUrl = getYahooAuthorizationUrl(callbackUri);
    return res.json({ url: authUrl });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.get('/auth/yahoo/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Yahoo Authentication Error</title></head>
      <body style="font-family:sans-serif; text-align:center; padding:40px 20px; background:#F8FAFC;">
          <div style="background:white; border-radius:16px; padding:30px; max-width:400px; margin:0 auto; box-shadow:0 4px 20px rgba(0,0,0,0.08);">
              <div style="font-size:48px; margin-bottom:16px;">❌</div>
              <h2 style="color:#DC2626; margin-bottom:8px;">Yahoo Sign In Failed</h2>
              <p style="color:#64748B; font-size:14px; margin-bottom:24px;">${error}</p>
              <a href="/auth/yahoo" style="display:inline-block; background:#6001D2; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;">Try Again</a>
          </div>
      </body>
      </html>
    `);
  }

  if (!code) {
    return res.status(400).send('Missing auth code from Yahoo');
  }

  try {
    const callbackUri = getYahooRequestRedirectUri(req);
    await exchangeYahooCodeForToken(code, callbackUri);
    const yahooEmail = await getYahooLoggedInEmail();
    let yahooUserRecord = null;
    if (yahooEmail) {
      yahooUserRecord = await upsertGoogleUser(yahooEmail);
    }

    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Yahoo Auth Success</title>
      </head>
      <body style="font-family:sans-serif; text-align:center; padding:40px 20px; background:#FAF5FF; margin:0;">
          <div style="background:white; border-radius:20px; padding:32px 24px; max-width:420px; margin:20px auto; box-shadow:0 8px 30px rgba(96,1,210,0.12); border:1px solid #E9D5FF;">
              <div style="width:64px; height:64px; background:#F3E8FF; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 16px;">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="#6001D2"><path d="M14.73 12.87l4.98-9.87h-3.41l-3.26 6.94-3.28-6.94H6.3l4.99 9.87V21h3.44v-8.13zm6.27-4.14a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0z"/></svg>
              </div>
              <h2 style="color:#581C87; font-size:22px; margin:0 0 8px 0;">Yahoo Connected!</h2>
              <p style="color:#475569; font-size:14px; margin:0 0 16px 0;">
                  Authenticated as:<br><strong style="color:#0F172A; font-size:15px;">${yahooEmail || 'Yahoo User'}</strong>
              </p>
              <div style="background:#F8FAFC; border-radius:12px; padding:14px; margin-bottom:24px; font-size:13px; color:#64748B;">
                  Yahoo OAuth 2.0 is now connected and ready.
              </div>
              <a href="/" style="display:block; background:#6001D2; color:white; padding:15px 20px; border-radius:12px; text-decoration:none; font-weight:700; font-size:16px; margin-bottom:12px; box-shadow:0 4px 14px rgba(96,1,210,0.35);">
                  Open Web Dashboard
              </a>
          </div>
          <script>
              try {
                  const u = ${JSON.stringify(yahooUserRecord || { email: yahooEmail, name: (yahooEmail ? yahooEmail.split('@')[0] : 'Yahoo User') })};
                  localStorage.setItem('sapcon_user', JSON.stringify(u));
              } catch (_) {}
              setTimeout(() => {
                  window.location.href = "/?yahoo_success=1";
              }, 1200);
          </script>
      </body>
      </html>
    `);
  } catch (err) {
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Yahoo Authentication Error</title></head>
      <body style="font-family:sans-serif; text-align:center; padding:40px 20px; background:#FEF2F2;">
          <div style="background:white; border-radius:16px; padding:30px; max-width:400px; margin:0 auto; box-shadow:0 4px 20px rgba(0,0,0,0.08);">
              <div style="font-size:48px; margin-bottom:16px;">⚠️</div>
              <h2 style="color:#DC2626; margin-bottom:8px;">Yahoo OAuth Exchange Failed</h2>
              <p style="color:#64748B; font-size:13px; margin-bottom:24px;">${err.message}</p>
              <a href="/auth/yahoo" style="display:inline-block; background:#6001D2; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;">Retry Authentication</a>
          </div>
      </body>
      </html>
    `);
  }
});

app.get('/auth/login', (req, res) => {
  try {
    const callbackUri = getRequestRedirectUri(req);
    const authUrl = getAuthorizationUrl(callbackUri);
    return res.redirect(authUrl);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.get('/auth/login-url', (req, res) => {
  try {
    const callbackUri = getRequestRedirectUri(req);
    const authUrl = getAuthorizationUrl(callbackUri);
    return res.json({ url: authUrl });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

app.get('/auth/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Authentication Error</title></head>
      <body style="font-family:sans-serif; text-align:center; padding:40px 20px; background:#F8FAFC;">
          <div style="background:white; border-radius:16px; padding:30px; max-width:400px; margin:0 auto; box-shadow:0 4px 20px rgba(0,0,0,0.08);">
              <div style="font-size:48px; margin-bottom:16px;">❌</div>
              <h2 style="color:#DC2626; margin-bottom:8px;">Sign In Failed</h2>
              <p style="color:#64748B; font-size:14px; margin-bottom:24px;">${error}</p>
              <a href="/auth/login" style="display:inline-block; background:#2563EB; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;">Try Again</a>
          </div>
      </body>
      </html>
    `);
  }

  if (!code) {
    return res.status(400).send('Missing auth code');
  }

  try {
    const callbackUri = getRequestRedirectUri(req);
    await exchangeCodeForToken(code, callbackUri);
    const googleEmail = await getLoggedInEmail();
    let googleUserRecord = null;
    if (googleEmail) {
      googleUserRecord = await upsertGoogleUser(googleEmail);
    }

    return res.send(`
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
                  Authenticated as:<br><strong style="color:#0F172A; font-size:15px;">${googleEmail || 'Google User'}</strong>
              </p>
              <div style="background:#F8FAFC; border-radius:12px; padding:14px; margin-bottom:24px; font-size:13px; color:#64748B;">
                  Gmail API is now authorized to send all verified sales outreach & quote emails.
              </div>
              <a href="sapcon://oauth-callback" style="display:block; background:#2563EB; color:white; padding:15px 20px; border-radius:12px; text-decoration:none; font-weight:700; font-size:16px; margin-bottom:12px; box-shadow:0 4px 14px rgba(37,99,235,0.35);">
                  🚀 Return to SAPCON App
              </a>
              <a href="/" style="display:block; background:#F1F5F9; color:#1E293B; padding:12px; border-radius:10px; text-decoration:none; font-weight:600; font-size:14px; margin-bottom:12px;">
                  Open Web Dashboard
              </a>
              <p style="font-size:12px; color:#94A3B8; margin:0;">
                  You are now fully logged in. Returning to mobile app...
              </p>
          </div>
          <script>
              try {
                  const gu = ${JSON.stringify(googleUserRecord || { email: googleEmail, name: (googleEmail ? googleEmail.split('@')[0] : 'Google User') })};
                  localStorage.setItem('sapcon_user', JSON.stringify(gu));
              } catch (_) {}
              if (navigator.userAgent.match(/Android|iPhone|Mobile/i)) {
                  setTimeout(() => {
                      window.location.href = "sapcon://oauth-callback";
                  }, 500);
              } else {
                  setTimeout(() => {
                      window.location.href = "/?auth_success=1";
                  }, 1200);
              }
          </script>
      </body>
      </html>
    `);
  } catch (err) {
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Authentication Error</title></head>
      <body style="font-family:sans-serif; text-align:center; padding:40px 20px; background:#FEF2F2;">
          <div style="background:white; border-radius:16px; padding:30px; max-width:400px; margin:0 auto; box-shadow:0 4px 20px rgba(0,0,0,0.08);">
              <div style="font-size:48px; margin-bottom:16px;">⚠️</div>
              <h2 style="color:#DC2626; margin-bottom:8px;">OAuth Exchange Failed</h2>
              <p style="color:#64748B; font-size:13px; margin-bottom:24px;">${err.message}</p>
              <a href="/auth/login" style="display:inline-block; background:#2563EB; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;">Retry Authentication</a>
          </div>
      </body>
      </html>
    `);
  }
});

const handleLogout = (req, res) => {
  logout();
  logoutYahoo();
  return res.json({ success: true, message: 'Logged out successfully' });
};
app.get('/auth/logout', handleLogout);
app.post('/auth/logout', handleLogout);

// ──────────────────────────────────────────────
// Leads & Queue API
// ──────────────────────────────────────────────

app.get('/api/leads', async (req, res) => {
  let leadsList = [];

  // 1. Try SQLite database first for persistent serverless storage
  try {
    const dbLeads = await getAllLeads();
    if (dbLeads && dbLeads.length > 0) {
      leadsList = dbLeads.map((r) => ({
        id: r.id,
        company_name: String(r.company_name || ''),
        contact_person: String(r.contact_person || ''),
        email: String(r.email || ''),
        demand: String(r.demand || ''),
        subject: String(r.subject || ''),
        body: String(r.body || ''),
        status: String(r.status || 'Pending'),
        sent_at: String(r.sent_timestamp || ''),
      }));
    }
  } catch (err) {
    console.warn('getAllLeads error:', err.message);
  }

  // 2. Fall back to Excel file if SQLite returned nothing
  if (leadsList.length === 0 && fs.existsSync(DEFAULT_EXCEL)) {
    const rawRows = loadDataFile(DEFAULT_EXCEL);
    const rows = ensureWorkflowColumns(rawRows);
    leadsList = rows.map((r, idx) => ({
      id: idx,
      company_name: String(r['Company Name'] || ''),
      contact_person: String(r['Contact Person'] || ''),
      email: String(r['Email'] || ''),
      demand: String(r['Demand'] || ''),
      subject: String(r['Generated Subject'] || ''),
      body: String(r['Generated Email Body'] || ''),
      status: String(r['Status'] || 'Pending'),
      sent_at: String(r['Sent Timestamp'] || ''),
    }));
  }

  const profile = getCompanyProfile();
  return res.json({
    leads: leadsList,
    queue: Object.values(draftQueueCache),
    company_name: profile.company_name || 'SAPCON Instruments',
  });
});

app.get('/api/queue', async (req, res) => {
  let sentCount = 0;
  let approvedCount = 0;
  let totalLeads = 0;
  const sentLeads = [];
  const approvedLeads = [];

  // 1. Try loading from SQLite database
  try {
    const dbLeads = await getAllLeads();
    if (dbLeads && dbLeads.length > 0) {
      totalLeads = dbLeads.length;
      dbLeads.forEach((r) => {
        const st = String(r.status || '').trim().toLowerCase();
        if (st.startsWith('sent')) {
          sentCount++;
          sentLeads.push({
            queue_id: `sent_${r.id}`,
            lead_id: r.id,
            company_name: String(r.company_name || ''),
            email: String(r.email || ''),
            subject: String(r.subject || ''),
            body: String(r.body || ''),
            status: 'Sent Out',
            created_at: String(r.sent_timestamp || 'Sent'),
          });
        } else if (st.includes('approved')) {
          approvedCount++;
          approvedLeads.push({
            queue_id: `approved_${r.id}`,
            lead_id: r.id,
            company_name: String(r.company_name || ''),
            email: String(r.email || ''),
            subject: String(r.subject || ''),
            body: String(r.body || ''),
            status: 'Approved',
            created_at: 'Approved',
          });
        } else if (
          r.subject ||
          r.body ||
          st.includes('draft') ||
          st.includes('queue') ||
          st.includes('wait')
        ) {
          const qk = `lead_${r.id}`;
          if (!draftQueueCache[qk]) {
            draftQueueCache[qk] = {
              queue_id: qk,
              lead_id: r.id,
              company_name: String(r.company_name || ''),
              contact_person: String(r.contact_person || ''),
              email: String(r.email || ''),
              demand: String(r.demand || ''),
              subject: String(r.subject || `Instrumentation inquiry for ${r.company_name || 'Client'}`),
              body: String(r.body || ''),
              status: r.status || 'Waiting for Approval',
              created_at: 'Imported',
            };
          }
        }
      });
    }
  } catch (err) {
    console.warn('Could not read leads from DB:', err.message);
  }

  // 2. Fall back to Excel file if SQLite has no leads
  if (totalLeads === 0 && fs.existsSync(DEFAULT_EXCEL)) {
    try {
      const rows = loadDataFile(DEFAULT_EXCEL);
      totalLeads = rows.length;

      rows.forEach((r, idx) => {
        const st = String(r['Status'] || '').trim().toLowerCase();
        if (st.startsWith('sent')) {
          sentCount++;
          sentLeads.push({
            queue_id: `sent_${idx}`,
            lead_id: idx,
            company_name: String(r['Company Name'] || ''),
            email: String(r['Email'] || ''),
            subject: String(r['Generated Subject'] || ''),
            body: String(r['Generated Email Body'] || ''),
            status: 'Sent Out',
            created_at: String(r['Sent Timestamp'] || 'Sent'),
          });
        } else if (st.includes('approved')) {
          approvedCount++;
          approvedLeads.push({
            queue_id: `approved_${idx}`,
            lead_id: idx,
            company_name: String(r['Company Name'] || ''),
            email: String(r['Email'] || ''),
            subject: String(r['Generated Subject'] || ''),
            body: String(r['Generated Email Body'] || ''),
            status: 'Approved',
            created_at: 'Approved',
          });
        } else if (
          r['Generated Subject'] ||
          r['Generated Email Body'] ||
          st.includes('draft') ||
          st.includes('queue') ||
          st.includes('wait')
        ) {
          const qk = `lead_${idx}`;
          if (!draftQueueCache[qk]) {
            draftQueueCache[qk] = {
              queue_id: qk,
              lead_id: idx,
              company_name: String(r['Company Name'] || ''),
              contact_person: String(r['Contact Person'] || ''),
              email: String(r['Email'] || ''),
              demand: String(r['Demand'] || ''),
              subject: String(r['Generated Subject'] || `Instrumentation inquiry for ${r['Company Name'] || 'Client'}`),
              body: String(r['Generated Email Body'] || ''),
              status: r['Status'] || 'Waiting for Approval',
              created_at: 'Imported',
            };
          }
        }
      });
    } catch (err) {
      console.warn('Could not read leads file for metrics:', err.message);
    }
  }

  const effectivePendingCount = Object.keys(draftQueueCache).length;

  return res.json({
    success: true,
    count: effectivePendingCount,
    queue: Object.values(draftQueueCache),
    sent_leads: sentLeads,
    approved_leads: approvedLeads,
    job_status: batchJobStatus,
    metrics: {
      pending_review: effectivePendingCount,
      approved: approvedCount,
      sent: sentCount,
      total_leads: totalLeads,
    },
  });
});

async function runBatchDraftingTask(records, autoSend = false) {
  const agent = getAgent();
  const profile = getCompanyProfile();

  batchJobStatus.is_processing = true;
  batchJobStatus.total = records.length;
  batchJobStatus.completed = 0;
  batchJobStatus.error = null;

  let rows = fs.existsSync(DEFAULT_EXCEL) ? loadDataFile(DEFAULT_EXCEL) : [];
  rows = ensureWorkflowColumns(rows);

  for (const item of records) {
    const leadId = item.id;
    const cName = item.company_name || '';
    const eMail = item.email || '';
    const pName = item.contact_person || '';
    const demand = item.demand || '';

    batchJobStatus.current_company = cName;

    try {
      const aiOut = await agent.generateColdEmail(
        {
          company_name: cName,
          contact_person: pName,
          email: eMail,
          demand,
        },
        profile
      );

      const subj = aiOut.subject || `Instrumentation for ${cName} | SAPCON`;
      const body = aiOut.body || '';

      const nowStr = new Date().toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      if (autoSend) {
        const { ok, message } = await dispatchEmail(eMail, subj, body);
        const finalStatus = ok ? 'Sent' : `Send Failed: ${message}`;
        if (leadId !== null && leadId !== undefined && leadId < rows.length) {
          rows[leadId]['Generated Subject'] = subj;
          rows[leadId]['Generated Email Body'] = body;
          rows[leadId]['Status'] = finalStatus;
          if (ok) rows[leadId]['Sent Timestamp'] = nowStr;
          saveDataFile(rows, DEFAULT_EXCEL);
        }
        // Update database record
        try {
          await updateLeadContent(leadId, subj, body, finalStatus);
          if (ok) await updateLeadStatus(leadId, finalStatus, nowStr);
        } catch (_) {}
      } else {
        if (leadId !== null && leadId !== undefined && leadId < rows.length) {
          rows[leadId]['Generated Subject'] = subj;
          rows[leadId]['Generated Email Body'] = body;
          rows[leadId]['Status'] = 'Waiting for Approval';
          saveDataFile(rows, DEFAULT_EXCEL);
        }
        // Update database record
        try {
          await updateLeadContent(leadId, subj, body, 'Waiting for Approval');
        } catch (_) {}

        const queueKey = `lead_${leadId}`;
        draftQueueCache[queueKey] = {
          queue_id: queueKey,
          lead_id: leadId,
          company_name: cName,
          contact_person: pName,
          email: eMail,
          demand,
          subject: subj,
          body,
          status: 'Waiting for Approval',
          created_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
      }
    } catch (err) {
      console.error(`Error drafting for ${cName}:`, err.message);
    }

    batchJobStatus.completed += 1;
  }

  batchJobStatus.is_processing = false;
  batchJobStatus.current_company = '';
}

app.post('/api/upload_file', upload.single('file'), (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ detail: 'No file uploaded or file is empty' });
  }

  const rawRows = loadDataFile(req.file.buffer);
  if (!rawRows || rawRows.length === 0) {
    return res.status(400).json({ detail: 'Uploaded file is empty' });
  }

  const autoSend = req.body.auto_send === 'true' || req.body.auto_send === true;
  const cols = identifyColumns(rawRows);

  let currentRows = fs.existsSync(DEFAULT_EXCEL) ? loadDataFile(DEFAULT_EXCEL) : [];
  currentRows = ensureWorkflowColumns(currentRows);

  const startIdx = currentRows.length;
  const itemsToProcess = [];

  for (const r of rawRows) {
    const cName = String(r[cols.company || 'Company Name'] || '').trim();
    const eMail = String(r[cols.email || 'Email'] || '').trim();
    const pName = String(r[cols.contact || 'Contact Person'] || '').trim();
    const dVal = String(r[cols.demand || 'Demand'] || '').trim();

    if (!cName && !eMail) continue;

    const assignedId = startIdx + itemsToProcess.length;
    const initialStatus = autoSend ? 'Direct Sending…' : 'Queued for Drafting';
    const newRow = {
      'Company Name': cName,
      'Contact Person': pName,
      Email: eMail,
      Demand: dVal,
      'Generated Subject': '',
      'Generated Email Body': '',
      Status: initialStatus,
      'Sent Timestamp': '',
    };
    currentRows.push(newRow);

    // Save lead to persistent SQLite database
    insertLead({
      company_name: cName,
      contact_person: pName,
      email: eMail,
      demand: dVal,
      status: initialStatus,
    }).then((dbId) => {
      if (dbId) {
        // Also associate db id if available
      }
    }).catch(console.warn);

    itemsToProcess.push({
      id: assignedId,
      company_name: cName,
      contact_person: pName,
      email: eMail,
      demand: dVal,
    });
  }

  const totalDetected = rawRows.length;
  const validCount = itemsToProcess.length;
  const invalidCount = totalDetected - validCount;

  saveDataFile(currentRows, DEFAULT_EXCEL);

  // Background execution
  setImmediate(() => {
    runBatchDraftingTask(itemsToProcess, autoSend).catch(console.error);
  });

  const modeLabel = autoSend
    ? 'Direct sending without approval'
    : 'Drafting into queue cache for approval';

  return res.json({
    success: true,
    message: `Successfully ingested ${validCount} leads [${modeLabel}].`,
    count: validCount,
    total_detected: totalDetected,
    valid_leads: validCount,
    invalid_leads: invalidCount,
    auto_send: autoSend,
    first_id: itemsToProcess.length ? itemsToProcess[0].id : 0,
  });
});

app.post('/api/submit_manual', upload.none(), (req, res) => {
  const body = req.body || {};
  const companyName = (body.company_name || '').trim();
  const email = (body.email || '').trim();
  const demand = (body.demand || '').trim();
  const autoSend = body.direct_send === true || body.direct_send === 'true' || body.auto_send === true || body.auto_send === 'true';

  if (!companyName || !email) {
    return res.status(400).json({ detail: 'Company Name and Email are required.' });
  }

  let df = fs.existsSync(DEFAULT_EXCEL) ? loadDataFile(DEFAULT_EXCEL) : [];
  df = ensureWorkflowColumns(df);

  const newId = df.length;
  const initialStatus = autoSend ? 'Direct Sending…' : 'Queued for Drafting';
  const newRow = {
    'Company Name': companyName,
    'Contact Person': '',
    Email: email,
    Demand: demand,
    'Generated Subject': '',
    'Generated Email Body': '',
    Status: initialStatus,
    'Sent Timestamp': '',
  };
  df.push(newRow);
  saveDataFile(df, DEFAULT_EXCEL);

  // Save to SQLite
  insertLead({
    company_name: companyName,
    contact_person: '',
    email,
    demand,
    status: initialStatus,
  }).catch(console.warn);

  const item = [
    {
      id: newId,
      company_name: companyName,
      contact_person: '',
      email,
      demand,
    },
  ];

  setImmediate(() => {
    runBatchDraftingTask(item, autoSend).catch(console.error);
  });

  const modeMsg = autoSend
    ? 'Direct sending in background (no approval needed).'
    : 'Queued for drafting and approval.';

  return res.json({
    success: true,
    lead_id: newId,
    auto_send: autoSend,
    message: `Lead added: ${modeMsg}`,
  });
});

app.post('/api/queue/approve_all', async (req, res) => {
  const queueKeys = Object.keys(draftQueueCache);
  if (queueKeys.length === 0) {
    return res.json({ success: true, sent_count: 0, message: 'Queue is empty.' });
  }

  let df = fs.existsSync(DEFAULT_EXCEL) ? loadDataFile(DEFAULT_EXCEL) : [];
  df = ensureWorkflowColumns(df);

  let sentCount = 0;
  let failedCount = 0;

  for (const qid of queueKeys) {
    const item = draftQueueCache[qid];
    if (!item) continue;

    const toEmail = item.email;
    const subj = item.subject;
    const body = item.body;
    const leadId = item.lead_id;

    const { ok, message } = await dispatchEmail(toEmail, subj, body);
    const nowStr = new Date().toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    if (ok) {
      sentCount++;
      if (leadId !== null && leadId !== undefined && leadId < df.length) {
        df[leadId]['Status'] = 'Sent';
        df[leadId]['Sent Timestamp'] = nowStr;
      }
      try {
        await updateLeadStatus(leadId, 'Sent', nowStr);
      } catch (_) {}
      delete draftQueueCache[qid];
    } else {
      failedCount++;
      if (leadId !== null && leadId !== undefined && leadId < df.length) {
        df[leadId]['Status'] = `Send Failed: ${message}`;
      }
      try {
        await updateLeadStatus(leadId, `Send Failed: ${message}`);
      } catch (_) {}
    }
  }

  saveDataFile(df, DEFAULT_EXCEL);
  return res.json({
    success: true,
    sent_count: sentCount,
    failed_count: failedCount,
    remaining: Object.keys(draftQueueCache).length,
    message: `Dispatched ${sentCount} emails directly! (${failedCount} failed, ${Object.keys(draftQueueCache).length} left)`,
  });
});

app.post('/api/approve_send', upload.none(), async (req, res) => {
  const queueId = req.body.queue_id;
  const leadId = parseInt(req.body.lead_id, 10);
  const subject = req.body.subject;
  const body = req.body.body;

  let df = fs.existsSync(DEFAULT_EXCEL) ? loadDataFile(DEFAULT_EXCEL) : [];
  df = ensureWorkflowColumns(df);

  let targetEmail = '';
  if (!isNaN(leadId) && leadId >= 0 && leadId < df.length) {
    targetEmail = String(df[leadId]['Email'] || '').trim();
  } else if (queueId && draftQueueCache[queueId]) {
    targetEmail = draftQueueCache[queueId].email;
  }

  if (!targetEmail || !targetEmail.includes('@')) {
    return res.status(400).json({ detail: 'Invalid recipient email address for this lead' });
  }

  const { ok, message } = await dispatchEmail(targetEmail, subject, body);
  if (ok) {
    const nowStr = new Date().toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    if (!isNaN(leadId) && leadId >= 0 && leadId < df.length) {
      df[leadId]['Status'] = 'Sent';
      df[leadId]['Sent Timestamp'] = nowStr;
      df[leadId]['Generated Subject'] = String(subject);
      df[leadId]['Generated Email Body'] = String(body);
      saveDataFile(df, DEFAULT_EXCEL);
    }

    try {
      await updateLeadContent(leadId, subject, body, 'Sent');
      await updateLeadStatus(leadId, 'Sent', nowStr);
    } catch (_) {}

    if (queueId && draftQueueCache[queueId]) {
      delete draftQueueCache[queueId];
    } else {
      const k = `lead_${leadId}`;
      if (draftQueueCache[k]) delete draftQueueCache[k];
    }

    return res.json({
      success: true,
      message: `Approved & sent to ${targetEmail}! Removed from queue cache.`,
      remaining_in_queue: Object.keys(draftQueueCache).length,
    });
  } else {
    const status = message.includes('AUTH_REQUIRED') ? 401 : 500;
    return res.status(status).json({ detail: message });
  }
});

const handleUpdateDraft = (req, res) => {
  const queueId = req.params.queue_id || req.body.queue_id;
  const subject = req.body.subject;
  const body = req.body.body;

  if (!queueId || !draftQueueCache[queueId]) {
    return res.status(404).json({ detail: 'Draft not found in queue cache' });
  }

  if (subject !== undefined) draftQueueCache[queueId].subject = subject;
  if (body !== undefined) draftQueueCache[queueId].body = body;

  return res.json({ success: true, message: 'Draft updated in cache' });
};
app.post('/api/update_draft', upload.none(), handleUpdateDraft);
app.post('/api/update_draft/:queue_id', upload.none(), handleUpdateDraft);

app.post('/api/approve/:queue_id', async (req, res) => {
  if (!isAuthenticated() && !isYahooAuthenticated()) {
    return res.status(401).json({
      detail:
        'AUTH_REQUIRED: Please sign in with Yahoo or Google (Sign In / Sign Up) before sending.',
    });
  }

  const { queue_id } = req.params;
  const item = draftQueueCache[queue_id];
  if (!item) {
    return res.status(404).json({ detail: 'Draft not found in queue cache' });
  }

  const toEmail = item.email;
  const subj = item.subject;
  const body = item.body;
  const leadId = item.lead_id;

  const { ok, message } = await dispatchEmail(toEmail, subj, body);
  if (ok) {
    let df = fs.existsSync(DEFAULT_EXCEL) ? loadDataFile(DEFAULT_EXCEL) : [];
    df = ensureWorkflowColumns(df);
    if (leadId !== null && leadId !== undefined && leadId < df.length) {
      const nowStr = new Date().toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      df[leadId]['Status'] = 'Sent';
      df[leadId]['Sent Timestamp'] = nowStr;
      df[leadId]['Generated Subject'] = String(subj);
      df[leadId]['Generated Email Body'] = String(body);
      saveDataFile(df, DEFAULT_EXCEL);
    }
    try {
      await updateLeadContent(leadId, subj, body, 'Sent');
      await updateLeadStatus(leadId, 'Sent');
    } catch (_) {}
    delete draftQueueCache[queue_id];
    return res.json({ success: true, message: `Approved & sent to ${toEmail}!` });
  } else {
    const status = message.includes('AUTH_REQUIRED') ? 401 : 500;
    return res.status(status).json({ detail: message });
  }
});

const handleDiscardDraft = (req, res) => {
  const { queue_id } = req.params;
  if (draftQueueCache[queue_id]) {
    delete draftQueueCache[queue_id];
    return res.json({ success: true, message: 'Draft removed from cache' });
  }
  return res.json({ success: false, message: 'Not found in cache' });
};
app.delete('/api/discard_draft/:queue_id', handleDiscardDraft);
app.delete('/api/queue/:queue_id', handleDiscardDraft);

// ──────────────────────────────────────────────
// Inbox Reader & AI Smart Reply
// ──────────────────────────────────────────────

app.get('/api/inbox/recent', async (req, res) => {
  try {
    const emails = await fetchRecentInboxEmails(10);
    return res.json({ success: true, emails, count: emails.length });
  } catch (err) {
    return res.json({ success: false, error: err.message, emails: [] });
  }
});

app.post('/api/inbox/generate_reply', upload.none(), async (req, res) => {
  const agent = getAgent();
  const profile = getCompanyProfile();
  const { from_email, subject, body, message_id } = req.body || {};

  const incomingData = {
    from: from_email || 'Customer',
    subject: subject || 'Inquiry',
    body: body || '',
    message_id: message_id || '',
  };

  const replyOut = await agent.generateReplyEmail(incomingData, profile);
  return res.json({
    success: true,
    reply_subject: replyOut.reply_subject || `Re: ${subject}`,
    reply_body: replyOut.reply_body || '',
    summary: replyOut.summary_of_inquiry || '',
    to_email: from_email,
    in_reply_to: message_id || '',
  });
});

app.post('/api/inbox/send_reply', upload.none(), async (req, res) => {
  const { to_email, subject, body } = req.body || {};
  if (!to_email) return res.status(400).json({ detail: 'Recipient email required' });

  const sendRes = await dispatchEmail(to_email, subject, body);
  if (sendRes.ok) {
    return res.json({
      success: true,
      message: sendRes.message,
    });
  }
  return res.status(500).json({ detail: sendRes.message });
});

app.get('/api/profile', (req, res) => {
  return res.json(getCompanyProfile());
});

// Initialize DB & Start Server
if (require.main === module) {
  initDb()
    .then(() => {
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n🚀 SAPCON Node.js Server listening on http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Fatal initialization error:', err);
    });
}

module.exports = { app, initDb };
