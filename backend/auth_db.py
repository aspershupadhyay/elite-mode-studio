"""
auth_db.py — SQLite persistence for OAuth users and app sessions.

Tables
------
users
    One row per unique (provider, provider_user_id) pair.
    Only identity data — no Google/Microsoft access tokens stored here.

app_sessions
    Our own session tokens issued after a successful OAuth login.
    Completely separate from anything Google/Microsoft issues.

Design
------
- We never store Google or Microsoft access/refresh tokens.
  Those are used once to fetch the user profile and then discarded.
- The app_session token is a 64-char cryptographically random hex string
  stored in SQLite and the user's Electron localStorage.
- Expiry slides forward on each use (rolling TTL).
"""

import sqlite3
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).parent / "data" / "auth.db"
SESSION_TTL_DAYS = 30

_DDL = """
CREATE TABLE IF NOT EXISTS users (
    id                TEXT PRIMARY KEY,
    email             TEXT NOT NULL,
    name              TEXT NOT NULL DEFAULT '',
    avatar_url        TEXT NOT NULL DEFAULT '',
    provider          TEXT NOT NULL,
    provider_user_id  TEXT NOT NULL,
    created_at        TEXT NOT NULL,
    last_login_at     TEXT NOT NULL,
    UNIQUE(provider, provider_user_id)
);

CREATE TABLE IF NOT EXISTS app_sessions (
    token         TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at    TEXT NOT NULL,
    expires_at    TEXT NOT NULL,
    last_used_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON app_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email   ON users(email);
"""


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_auth_db() -> None:
    with _connect() as conn:
        conn.executescript(_DDL)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _expires() -> str:
    return (datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS)).isoformat()


def _user_id() -> str:
    return "usr_" + secrets.token_hex(8)


# ── User CRUD ─────────────────────────────────────────────────────────────────

def upsert_user(*, email: str, name: str, avatar_url: str, provider: str, provider_user_id: str) -> dict:
    now = _now()
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE provider=? AND provider_user_id=?",
            (provider, provider_user_id),
        ).fetchone()

        if row:
            conn.execute(
                "UPDATE users SET email=?, name=?, avatar_url=?, last_login_at=? WHERE id=?",
                (email, name, avatar_url, now, row["id"]),
            )
            return {**dict(row), "email": email, "name": name, "avatar_url": avatar_url, "last_login_at": now}
        else:
            uid = _user_id()
            conn.execute(
                "INSERT INTO users (id,email,name,avatar_url,provider,provider_user_id,created_at,last_login_at) VALUES (?,?,?,?,?,?,?,?)",
                (uid, email, name, avatar_url, provider, provider_user_id, now, now),
            )
            return {"id": uid, "email": email, "name": name, "avatar_url": avatar_url,
                    "provider": provider, "provider_user_id": provider_user_id,
                    "created_at": now, "last_login_at": now}


def get_user(user_id: str) -> Optional[dict]:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    return dict(row) if row else None


# ── Session CRUD ──────────────────────────────────────────────────────────────

def create_session(user_id: str) -> dict:
    token = secrets.token_hex(32)
    now, expires = _now(), _expires()
    with _connect() as conn:
        conn.execute(
            "INSERT INTO app_sessions (token,user_id,created_at,expires_at,last_used_at) VALUES (?,?,?,?,?)",
            (token, user_id, now, expires, now),
        )
    return {"token": token, "user_id": user_id, "expires_at": expires}


def validate_session(token: str) -> Optional[dict]:
    if not token:
        return None
    now = _now()
    with _connect() as conn:
        row = conn.execute(
            "SELECT s.user_id, s.expires_at, u.* FROM app_sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?",
            (token,),
        ).fetchone()
        if not row:
            return None
        try:
            if datetime.now(timezone.utc) > datetime.fromisoformat(row["expires_at"]):
                conn.execute("DELETE FROM app_sessions WHERE token=?", (token,))
                return None
        except ValueError:
            return None
        conn.execute(
            "UPDATE app_sessions SET last_used_at=?, expires_at=? WHERE token=?",
            (now, _expires(), token),
        )
    return dict(row)


def delete_session(token: str) -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM app_sessions WHERE token=?", (token,))


def delete_all_sessions(user_id: str) -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM app_sessions WHERE user_id=?", (user_id,))
