const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

const isServerless = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DB_PATH = isServerless ? path.join('/tmp', 'users.db') : path.join(__dirname, 'users.db');

let db = null;
let SQL = null;

async function initDb() {
  if (db) return db;
  try {
    const wasmCandidates = [
      path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
      path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
      path.join('/var', 'task', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
      path.join('/var', 'task', 'src', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    ];
    let foundWasm = wasmCandidates.find((p) => fs.existsSync(p));

    if (foundWasm) {
      SQL = await initSqlJs({ locateFile: () => foundWasm });
    } else {
      SQL = await initSqlJs();
    }
  } catch (err) {
    console.error('Failed to initialize sql.js WASM engine:', err.message);
    // Return null so function doesn't crash entirely
    return null;
  }

  if (!SQL) return null;

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      contact_person TEXT DEFAULT '',
      email TEXT NOT NULL,
      demand TEXT DEFAULT '',
      subject TEXT DEFAULT '',
      body TEXT DEFAULT '',
      status TEXT DEFAULT 'Waiting for Approval',
      sent_timestamp TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  saveDb();
  return db;
}

function saveDb() {
  if (!db) return;
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (err) {
    console.warn('saveDb warning (safe to ignore in transient serverless):', err.message);
  }
}

function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(password + salt).digest('hex');
}

async function registerUser(name, email, password) {
  await initDb();
  if (!db) {
    return { success: false, message: 'Database initialization failed', user: null };
  }
  email = (email || '').trim().toLowerCase();
  name = (name || '').trim();

  if (!email || !email.includes('@')) {
    return { success: false, message: 'Invalid email address', user: null };
  }
  if (!password || password.length < 6) {
    return { success: false, message: 'Password must be at least 6 characters long', user: null };
  }
  if (!name) {
    name = email.split('@')[0];
    name = name.charAt(0).toUpperCase() + name.slice(1);
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return { success: false, message: 'An account with this email already exists. Please sign in.', user: null };
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const pwHash = hashPassword(password, salt);

  try {
    db.run(
      'INSERT INTO users (name, email, password_hash, salt) VALUES (?, ?, ?, ?)',
      [name, email, pwHash, salt]
    );
    saveDb();

    // Fetch created user
    const res = db.exec('SELECT last_insert_rowid() as id');
    const userId = res[0] && res[0].values[0] ? res[0].values[0][0] : null;

    const user = { id: userId, name, email };
    return { success: true, message: 'Account created successfully!', user };
  } catch (err) {
    return { success: false, message: 'Registration failed: ' + err.message, user: null };
  }
}

async function authenticateUser(email, password) {
  await initDb();
  if (!db) {
    return { success: false, message: 'Database initialization failed', user: null };
  }
  email = (email || '').trim().toLowerCase();
  if (!email || !password) {
    return { success: false, message: 'Email and password are required', user: null };
  }

  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  stmt.bind([email]);

  if (!stmt.step()) {
    stmt.free();
    return { success: false, message: 'No account found with this email. Please sign up first.', user: null };
  }

  const row = stmt.getAsObject();
  stmt.free();

  const givenHash = hashPassword(password, row.salt);
  if (givenHash !== row.password_hash) {
    return { success: false, message: 'Incorrect password. Please try again.', user: null };
  }

  const user = {
    id: row.id,
    name: row.name,
    email: row.email,
    created_at: row.created_at
  };
  return { success: true, message: 'Login successful!', user };
}

async function getUserByEmail(email) {
  await initDb();
  if (!db) return null;
  email = (email || '').trim().toLowerCase();
  const stmt = db.prepare('SELECT id, name, email, created_at FROM users WHERE email = ?');
  stmt.bind([email]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

async function upsertGoogleUser(email, name = null) {
  await initDb();
  email = (email || '').trim().toLowerCase();
  const existing = await getUserByEmail(email);
  if (existing) return existing;

  let displayName = name || email.split('@')[0];
  displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
  const dummyPass = crypto.randomBytes(20).toString('hex');

  const reg = await registerUser(displayName, email, dummyPass);
  if (reg.success && reg.user) {
    return reg.user;
  }
  return { name: displayName, email };
}

async function setSetting(key, value) {
  await initDb();
  if (!db) return false;
  try {
    const valStr = typeof value === 'string' ? value : JSON.stringify(value);
    db.run(
      'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP',
      [key, valStr]
    );
    saveDb();
    return true;
  } catch (err) {
    console.warn(`setSetting(${key}) failed:`, err.message);
    return false;
  }
}

async function getSetting(key) {
  await initDb();
  if (!db) return null;
  try {
    const stmt = db.prepare('SELECT value FROM app_settings WHERE key = ?');
    stmt.bind([key]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row.value;
    }
    stmt.free();
    return null;
  } catch (err) {
    console.warn(`getSetting(${key}) failed:`, err.message);
    return null;
  }
}

async function deleteSetting(key) {
  await initDb();
  if (!db) return false;
  try {
    db.run('DELETE FROM app_settings WHERE key = ?', [key]);
    saveDb();
    return true;
  } catch (err) {
    console.warn(`deleteSetting(${key}) failed:`, err.message);
    return false;
  }
}

async function getAllLeads() {
  await initDb();
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT * FROM leads ORDER BY id ASC');
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  } catch (err) {
    console.warn('getAllLeads failed:', err.message);
    return [];
  }
}

async function insertLead({ company_name, contact_person = '', email, demand = '', subject = '', body = '', status = 'Waiting for Approval', sent_timestamp = '' }) {
  await initDb();
  if (!db) return null;
  try {
    db.run(
      `INSERT INTO leads (company_name, contact_person, email, demand, subject, body, status, sent_timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [company_name || '', contact_person || '', email || '', demand || '', subject || '', body || '', status || 'Waiting for Approval', sent_timestamp || '']
    );
    saveDb();
    const idStmt = db.prepare('SELECT last_insert_rowid() AS id');
    let newId = null;
    if (idStmt.step()) {
      newId = idStmt.getAsObject().id;
    }
    idStmt.free();
    return newId;
  } catch (err) {
    console.error('insertLead failed:', err.message);
    return null;
  }
}

async function updateLeadStatus(id, status, sentTimestamp = '') {
  await initDb();
  if (!db) return false;
  try {
    db.run('UPDATE leads SET status = ?, sent_timestamp = ? WHERE id = ?', [status, sentTimestamp, id]);
    saveDb();
    return true;
  } catch (err) {
    console.warn(`updateLeadStatus(${id}) failed:`, err.message);
    return false;
  }
}

async function updateLeadContent(id, subject, body, status = null) {
  await initDb();
  if (!db) return false;
  try {
    if (status) {
      db.run('UPDATE leads SET subject = ?, body = ?, status = ? WHERE id = ?', [subject, body, status, id]);
    } else {
      db.run('UPDATE leads SET subject = ?, body = ? WHERE id = ?', [subject, body, id]);
    }
    saveDb();
    return true;
  } catch (err) {
    console.warn(`updateLeadContent(${id}) failed:`, err.message);
    return false;
  }
}

async function deleteLead(id) {
  await initDb();
  if (!db) return false;
  try {
    db.run('DELETE FROM leads WHERE id = ?', [id]);
    saveDb();
    return true;
  } catch (err) {
    console.warn(`deleteLead(${id}) failed:`, err.message);
    return false;
  }
}

module.exports = {
  initDb,
  registerUser,
  authenticateUser,
  getUserByEmail,
  upsertGoogleUser,
  setSetting,
  getSetting,
  deleteSetting,
  getAllLeads,
  insertLead,
  updateLeadStatus,
  updateLeadContent,
  deleteLead,
};

