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
  SQL = await initSqlJs();
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
    )
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

module.exports = {
  initDb,
  registerUser,
  authenticateUser,
  getUserByEmail,
  upsertGoogleUser
};
