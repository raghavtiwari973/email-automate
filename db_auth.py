import sqlite3
import hashlib
import os
import secrets
from pathlib import Path
from typing import Optional, Dict, Any

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "users.db"

def get_db_connection():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_active INTEGER DEFAULT 1
        )
    """)
    conn.commit()
    conn.close()

def _hash_password(password: str, salt: str) -> str:
    return hashlib.sha256((password + salt).encode("utf-8")).hexdigest()

def register_user(name: str, email: str, password: str) -> tuple[bool, str, Optional[Dict[str, Any]]]:
    email = email.strip().lower()
    name = name.strip()
    if not email or "@" not in email:
        return False, "Invalid email address", None
    if len(password) < 6:
        return False, "Password must be at least 6 characters long", None
    if not name:
        name = email.split("@")[0].capitalize()

    salt = secrets.token_hex(16)
    pw_hash = _hash_password(password, salt)

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO users (name, email, password_hash, salt) VALUES (?, ?, ?, ?)",
            (name, email, pw_hash, salt)
        )
        conn.commit()
        user_id = cursor.lastrowid
        user = {"id": user_id, "name": name, "email": email}
        return True, "Account created successfully!", user
    except sqlite3.IntegrityError:
        return False, "An account with this email already exists. Please sign in.", None
    except Exception as e:
        return False, f"Registration failed: {str(e)}", None
    finally:
        conn.close()

def authenticate_user(email: str, password: str) -> tuple[bool, str, Optional[Dict[str, Any]]]:
    email = email.strip().lower()
    if not email or not password:
        return False, "Email and password are required", None

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
    user_row = cursor.fetchone()
    conn.close()

    if not user_row:
        return False, "No account found with this email. Please sign up first.", None

    salt = user_row["salt"]
    expected_hash = user_row["password_hash"]
    given_hash = _hash_password(password, salt)

    if given_hash != expected_hash:
        return False, "Incorrect password. Please try again.", None

    user = {
        "id": user_row["id"],
        "name": user_row["name"],
        "email": user_row["email"],
        "created_at": user_row["created_at"],
    }
    return True, "Login successful!", user

def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    email = email.strip().lower()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, email, created_at FROM users WHERE email = ?", (email,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return dict(row)
    return None

def upsert_google_user(email: str, name: Optional[str] = None) -> Dict[str, Any]:
    email = email.strip().lower()
    existing = get_user_by_email(email)
    if existing:
        return existing
    displayName = name or email.split("@")[0].capitalize()
    dummy_pass = secrets.token_hex(20)
    ok, _, user = register_user(displayName, email, dummy_pass)
    if ok and user:
        return user
    return {"name": displayName, "email": email}

# Auto-initialize DB on import
init_db()
