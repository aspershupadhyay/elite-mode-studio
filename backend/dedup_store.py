"""
dedup_store.py — SQLite persistence layer for the deduplication system.

Responsibilities:
  - Schema creation & migrations
  - Insert / query / expire records
  - Content signature builder
  - Cleanup job (delete expired rows)
"""

import sqlite3
import hashlib
import re
import os
import logging
from datetime import datetime, timedelta
from contextlib import contextmanager

log = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "dedup.db")
WINDOW_DAYS = 5
MAX_VARIANTS_PER_CLUSTER = 3

# ── Schema ────────────────────────────────────────────────────────────────────

DDL = """
CREATE TABLE IF NOT EXISTS generated_posts (
    id                  TEXT PRIMARY KEY,
    url                 TEXT,
    title               TEXT NOT NULL,
    content_signature   TEXT NOT NULL,
    angle_type          TEXT,
    source_domain       TEXT,
    topic_cluster_id    TEXT,
    generated_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at          DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_expires ON generated_posts(expires_at);
CREATE INDEX IF NOT EXISTS idx_sig     ON generated_posts(content_signature);
CREATE INDEX IF NOT EXISTS idx_url     ON generated_posts(url);
CREATE INDEX IF NOT EXISTS idx_cluster ON generated_posts(topic_cluster_id);
"""

# ── Connection ─────────────────────────────────────────────────────────────────

def _ensure_dir():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

def get_connection() -> sqlite3.Connection:
    _ensure_dir()
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

@contextmanager
def db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

# ── Init ──────────────────────────────────────────────────────────────────────

def init_db():
    """Create tables and indexes. Safe to call multiple times."""
    with db() as conn:
        conn.executescript(DDL)
    log.info("dedup_store: DB initialised at %s", DB_PATH)

# ── Cleanup ───────────────────────────────────────────────────────────────────

def cleanup_expired():
    """Delete all rows past their expiry. Call before every generation session."""
    with db() as conn:
        cur = conn.execute(
            "DELETE FROM generated_posts WHERE expires_at < CURRENT_TIMESTAMP"
        )
        deleted = cur.rowcount
    if deleted:
        log.info("dedup_store: cleaned up %d expired rows", deleted)
    return deleted

# ── Content Signature Builder ─────────────────────────────────────────────────

# Common stop-words to skip when extracting entity/action
_STOP = {
    "the","a","an","is","are","was","were","be","been","being",
    "have","has","had","do","does","did","will","would","shall","should",
    "may","might","must","can","could","to","of","in","on","at","for",
    "with","by","from","as","that","this","it","its","says","say","said",
}

_STRONG_VERBS = {
    "raises","hikes","cuts","launches","bans","crashes","surges","drops",
    "falls","rises","announces","approves","rejects","signs","blocks",
    "seizes","sanctions","invades","withdraws","expands","contracts",
    "acquires","merges","files","sues","wins","loses","warns","threatens",
    "condemns","demands","proposes","passes","vetoes","resigns","appoints",
    "arrests","releases","kills","attacks","strikes","halts","resumes",
}

def _extract_entity(text: str) -> str:
    """Return first capitalised token that is not a stop-word."""
    for tok in text.split():
        clean = re.sub(r"[^a-zA-Z]", "", tok)
        if clean and clean[0].isupper() and clean.lower() not in _STOP:
            return clean.lower()
    # fallback: first non-stop word
    for tok in text.lower().split():
        clean = re.sub(r"[^a-z]", "", tok)
        if clean and clean not in _STOP:
            return clean
    return "unknown"

def _extract_action(title: str) -> str:
    """Return first strong verb found in title, else first content verb."""
    lower = title.lower()
    for verb in _STRONG_VERBS:
        if re.search(r"\b" + verb + r"\b", lower):
            return verb
    # fallback: third token (usually verb position in headline)
    tokens = [re.sub(r"[^a-z]", "", t) for t in lower.split()]
    tokens = [t for t in tokens if t and t not in _STOP]
    return tokens[1] if len(tokens) > 1 else "update"

def build_content_signature(title: str, snippet: str = "", date: str = "") -> str:
    """
    Build a short deterministic signature from title + snippet.
    Format: {entity}_{action}_{date_bucket}
    """
    combined = (title + " " + snippet).strip()
    entity   = _extract_entity(combined)
    action   = _extract_action(title)
    bucket   = date[:10] if date else datetime.utcnow().strftime("%Y-%m-%d")
    raw      = f"{entity}_{action}_{bucket}"
    return re.sub(r"[^a-z0-9_\-]", "", raw.lower())

def build_cluster_id(signature: str) -> str:
    """Stable cluster ID from signature — first 12 chars of SHA1."""
    return hashlib.sha1(signature.encode()).hexdigest()[:12]

# ── Write ──────────────────────────────────────────────────────────────────────

def insert_post(
    post_id: str,
    title: str,
    url: str = "",
    content_signature: str = "",
    angle_type: str = "",
    source_domain: str = "",
    topic_cluster_id: str = "",
):
    expires = datetime.utcnow() + timedelta(days=WINDOW_DAYS)
    with db() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO generated_posts
              (id, url, title, content_signature, angle_type,
               source_domain, topic_cluster_id, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (post_id, url, title, content_signature, angle_type,
             source_domain, topic_cluster_id,
             expires.strftime("%Y-%m-%d %H:%M:%S")),
        )

# ── Read ───────────────────────────────────────────────────────────────────────

def url_exists(url: str) -> bool:
    """Gate 1 Check 1 — exact URL match."""
    if not url:
        return False
    with db() as conn:
        row = conn.execute(
            "SELECT id FROM generated_posts WHERE url = ? AND expires_at > CURRENT_TIMESTAMP",
            (url,),
        ).fetchone()
    return row is not None

def signature_count(sig: str) -> int:
    """Gate 1 Check 2 — how many active posts share this signature."""
    with db() as conn:
        row = conn.execute(
            "SELECT COUNT(*) FROM generated_posts WHERE content_signature = ? AND expires_at > CURRENT_TIMESTAMP",
            (sig,),
        ).fetchone()
    return row[0] if row else 0

def cluster_count(cluster_id: str) -> int:
    """Gate 1 Check 3 — how many variants exist in this cluster."""
    with db() as conn:
        row = conn.execute(
            "SELECT COUNT(*) FROM generated_posts WHERE topic_cluster_id = ? AND expires_at > CURRENT_TIMESTAMP",
            (cluster_id,),
        ).fetchone()
    return row[0] if row else 0

def get_recent_posts(limit: int = 50) -> list:
    """Return recent active posts for Gate 2 LLM context."""
    with db() as conn:
        rows = conn.execute(
            """
            SELECT id, title, content_signature, angle_type, topic_cluster_id
            FROM generated_posts
            WHERE expires_at > CURRENT_TIMESTAMP
            ORDER BY generated_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]
