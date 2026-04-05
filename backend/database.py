"""
database.py — SQLite persistence for output schemas.

The DB file lives at backend/data/elite.db (same folder as posts.json).
On init_db(), if no schemas exist yet, a "Standard" schema is seeded that
reproduces every field that was previously hardcoded in the system prompt —
so existing behaviour is preserved without any manual setup.
"""

import sqlite3, json, os, uuid
from datetime import datetime
from typing import Optional

DB_DIR  = os.path.join(os.path.dirname(__file__), "data")
DB_PATH = os.path.join(DB_DIR, "elite.db")

# ── Default "Standard" schema — mirrors the hardcoded fields in rag.py ────────
_STANDARD_FIELDS = [
    {
        "id":          "f_title",
        "label":       "Title",
        "key":         "title",
        "instruction": "Punchy headline, {TITLE_MIN_LEN}–{TITLE_MAX_LEN} characters. Must contain at least one number ($, %, count, date). No source attribution in the title.",
        "type":        "text",
        "enabled":     True,
    },
    {
        "id":          "f_highlight_words",
        "label":       "Highlight Words",
        "key":         "highlight_words",
        "instruction": "4–5 words from the title that carry the most information signal. Numbers, proper nouns, and key terms only. Comma-separated. No stopwords.",
        "type":        "array",
        "enabled":     True,
    },
    {
        "id":          "f_caption",
        "label":       "Caption",
        "key":         "caption",
        "instruction": "800–1200 character social media caption. Three short paragraphs: news hook → analysis → implication. Cite sources inline (e.g. 'per Reuters'). End with 3–5 relevant hashtags on a new line.",
        "type":        "text",
        "enabled":     True,
    },
    {
        "id":          "f_image_prompt_16x9",
        "label":       "Image Prompt (16×9)",
        "key":         "image_prompt_16x9",
        "instruction": "Photorealistic editorial image prompt for the post. No text, no watermarks. STRUCTURE: SUBJECT / COMPOSITION / SCENE / LIGHTING / COLOR / ATMOSPHERE / STYLE / TECHNICAL (1920×1080, 16:9).",
        "type":        "text",
        "enabled":     True,
    },
    {
        "id":          "f_hook_text",
        "label":       "Hook Text",
        "key":         "hook_text",
        "instruction": "5 words maximum. A punch that stops the scroll. Not a shortened title.",
        "type":        "text",
        "enabled":     False,
    },
    {
        "id":          "f_category",
        "label":       "Category Label",
        "key":         "category",
        "instruction": "One of: GEOPOLITICS · AI & TECH · FINANCE · CRYPTO · BUSINESS · POWER · BREAKING · MARKETS · DEFENSE · CLIMATE. Return only the label, nothing else.",
        "type":        "text",
        "enabled":     False,
    },
    {
        "id":          "f_image_prompt_9x16",
        "label":       "Image Prompt (9×16 Portrait)",
        "key":         "image_prompt_9x16",
        "instruction": "Same literal named subjects as 16×9. Portrait framing for Stories/Reels. Primary subject fills top 65%. BOTTOM 35% must be completely clear. TECHNICAL: 1080×1920. Bottom 35% fades to #0A0A0A. Zero text. Zero watermarks.",
        "type":        "text",
        "enabled":     False,
    },
]

_STANDARD_SCHEMA = {
    "id":         "schema_standard",
    "name":       "Standard",
    "fields":     _STANDARD_FIELDS,
    "platform":   "instagram",
    "is_default": 1,
}


def _conn():
    os.makedirs(DB_DIR, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def init_db():
    """Create tables and seed the Standard schema if the table is empty."""
    con = _conn()
    with con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS output_schemas (
                id         TEXT PRIMARY KEY,
                name       TEXT NOT NULL,
                fields     TEXT NOT NULL,
                platform   TEXT NOT NULL DEFAULT 'instagram',
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS posts (
                id              TEXT PRIMARY KEY,
                topic           TEXT NOT NULL,
                platform        TEXT NOT NULL DEFAULT 'instagram',
                title           TEXT,
                caption         TEXT,
                angle           TEXT,
                highlight_words TEXT,
                image_prompts   TEXT,
                sources         TEXT,
                freshness       TEXT,
                fields          TEXT,
                created_at      TEXT NOT NULL
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS templates (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                canvas_json TEXT NOT NULL,
                slot_schema TEXT,
                thumbnail   TEXT,
                width       INTEGER NOT NULL DEFAULT 1080,
                height      INTEGER NOT NULL DEFAULT 1080,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS skills (
                id             TEXT PRIMARY KEY,
                name           TEXT NOT NULL,
                platform       TEXT NOT NULL DEFAULT 'instagram',
                template_id    TEXT,
                output_schema  TEXT,
                ai_instructions TEXT,
                schedule_cron  TEXT,
                is_active      INTEGER NOT NULL DEFAULT 1,
                created_at     TEXT NOT NULL
            )
        """)
    # Seed only when the table is genuinely empty
    cur = con.execute("SELECT COUNT(*) FROM output_schemas")
    if cur.fetchone()[0] == 0:
        _insert_schema(con, _STANDARD_SCHEMA)
    con.close()
    migrate_posts_json_to_sqlite()


def _insert_schema(con: sqlite3.Connection, schema: dict):
    con.execute(
        "INSERT INTO output_schemas (id, name, fields, platform, is_default, created_at) VALUES (?,?,?,?,?,?)",
        (
            schema["id"],
            schema["name"],
            json.dumps(schema["fields"]),
            schema.get("platform", "instagram"),
            int(schema.get("is_default", 0)),
            datetime.utcnow().isoformat(),
        ),
    )


def _row_to_dict(row) -> dict:
    d: dict[str, object] = dict(row)
    d["fields"]     = json.loads(d["fields"])  # type: ignore[arg-type]
    d["is_default"] = bool(d["is_default"])
    return d


# ── Public CRUD ───────────────────────────────────────────────────────────────

def get_output_schemas() -> list[dict]:
    con = _conn()
    rows = con.execute("SELECT * FROM output_schemas ORDER BY created_at ASC").fetchall()
    con.close()
    return [_row_to_dict(r) for r in rows]


def get_default_output_schema() -> dict | None:
    con = _conn()
    row = con.execute("SELECT * FROM output_schemas WHERE is_default=1 LIMIT 1").fetchone()
    con.close()
    return _row_to_dict(row) if row else None


def save_output_schema(name: str, fields: list, platform: str = "instagram") -> dict:
    schema_id = "schema_" + uuid.uuid4().hex[:12]
    con = _conn()
    with con:
        con.execute(
            "INSERT INTO output_schemas (id, name, fields, platform, is_default, created_at) VALUES (?,?,?,?,0,?)",
            (schema_id, name, json.dumps(fields), platform, datetime.utcnow().isoformat()),
        )
    con.close()
    return {"id": schema_id, "name": name, "fields": fields, "platform": platform, "is_default": False}


def set_default_output_schema(schema_id: str) -> bool:
    """Makes schema_id the active default; clears is_default on all others."""
    con = _conn()
    row = con.execute("SELECT id FROM output_schemas WHERE id=?", (schema_id,)).fetchone()
    if not row:
        con.close()
        return False
    with con:
        con.execute("UPDATE output_schemas SET is_default=0")
        con.execute("UPDATE output_schemas SET is_default=1 WHERE id=?", (schema_id,))
    con.close()
    return True


def update_output_schema(schema_id: str, name: str, fields: list, platform: str = "instagram") -> dict | None:
    """Update name/fields/platform of an existing schema (does not touch is_default)."""
    con = _conn()
    row = con.execute("SELECT id FROM output_schemas WHERE id=?", (schema_id,)).fetchone()
    if not row:
        con.close()
        return None
    with con:
        con.execute(
            "UPDATE output_schemas SET name=?, fields=?, platform=? WHERE id=?",
            (name, json.dumps(fields), platform, schema_id),
        )
    updated = _row_to_dict(con.execute("SELECT * FROM output_schemas WHERE id=?", (schema_id,)).fetchone())
    con.close()
    return updated


def delete_output_schema(schema_id: str) -> bool:
    con = _conn()
    row = con.execute("SELECT is_default FROM output_schemas WHERE id=?", (schema_id,)).fetchone()
    if not row:
        con.close()
        return False
    with con:
        con.execute("DELETE FROM output_schemas WHERE id=?", (schema_id,))
        # If we just deleted the default, promote the oldest remaining schema
        if row["is_default"]:
            oldest = con.execute("SELECT id FROM output_schemas ORDER BY created_at ASC LIMIT 1").fetchone()
            if oldest:
                con.execute("UPDATE output_schemas SET is_default=1 WHERE id=?", (oldest["id"],))
    con.close()
    return True


# ── Posts ──────────────────────────────────────────────────────────────────────

def save_post(topic: str, platform: str, content_dict: dict, sources_list: list) -> str:
    post_id = str(uuid.uuid4())[:8]
    now = datetime.utcnow().isoformat()

    # Persist ALL generated field values into the fields column so the frontend
    # can display every output regardless of the user's schema definition.
    # Strip internal/non-display keys before saving.
    _internal = {"raw", "sources_block", "confidence", "fields"}
    fields_blob = {k: v for k, v in content_dict.items() if k not in _internal and v not in (None, "", [])}

    con = _conn()
    with con:
        con.execute(
            """INSERT INTO posts
               (id, topic, platform, title, caption, angle, highlight_words,
                image_prompts, sources, freshness, fields, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                post_id,
                topic,
                platform,
                content_dict.get("title"),
                content_dict.get("caption"),
                content_dict.get("angle"),
                json.dumps(content_dict["highlight_words"]) if content_dict.get("highlight_words") is not None else None,
                json.dumps(content_dict["image_prompts"]) if content_dict.get("image_prompts") is not None else None,
                json.dumps(sources_list) if sources_list is not None else None,
                content_dict.get("freshness"),
                json.dumps(fields_blob) if fields_blob else None,
                now,
            ),
        )
    con.close()
    return post_id


def _post_row_to_dict(row) -> dict:
    d = dict(row)
    for col in ("highlight_words", "image_prompts", "sources", "fields"):
        if d.get(col) is not None:
            d[col] = json.loads(d[col])
    return d


def get_posts(limit: int = 50) -> list:
    con = _conn()
    rows = con.execute(
        "SELECT * FROM posts ORDER BY created_at DESC LIMIT ?", (limit,)
    ).fetchall()
    con.close()
    return [_post_row_to_dict(r) for r in rows]


def get_post(post_id: str) -> dict | None:
    con = _conn()
    row = con.execute("SELECT * FROM posts WHERE id=?", (post_id,)).fetchone()
    con.close()
    return _post_row_to_dict(row) if row else None


def delete_post(post_id: str) -> bool:
    con = _conn()
    row = con.execute("SELECT id FROM posts WHERE id=?", (post_id,)).fetchone()
    if not row:
        con.close()
        return False
    with con:
        con.execute("DELETE FROM posts WHERE id=?", (post_id,))
    con.close()
    return True


def clear_posts():
    con = _conn()
    with con:
        con.execute("DELETE FROM posts")
    con.close()


def attach_image(post_id: str, image_path: str) -> None:
    # posts table has no image_path column — silently do nothing
    pass


def migrate_posts_json_to_sqlite():
    """Read data/posts.json (if present) and import records into SQLite."""
    posts_json = os.path.join(DB_DIR, "posts.json")
    if not os.path.exists(posts_json):
        return
    try:
        with open(posts_json, "r") as f:
            old_posts = json.load(f)
    except Exception:
        return
    if not old_posts:
        return
    con = _conn()
    for p in old_posts:
        post_id = p.get("id", str(uuid.uuid4())[:8])
        topic = p.get("topic", "")
        platform = p.get("platform", "instagram")
        content = p.get("content", {}) if isinstance(p.get("content"), dict) else {}
        sources = p.get("sources", [])
        created_at = p.get("created_at", datetime.utcnow().isoformat())
        try:
            with con:
                con.execute(
                    """INSERT OR IGNORE INTO posts
                       (id, topic, platform, title, caption, angle, highlight_words,
                        image_prompts, sources, freshness, fields, created_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        post_id,
                        topic,
                        platform,
                        content.get("title"),
                        content.get("caption"),
                        content.get("angle"),
                        json.dumps(content["highlight_words"]) if content.get("highlight_words") is not None else None,
                        json.dumps(content["image_prompts"]) if content.get("image_prompts") is not None else None,
                        json.dumps(sources) if sources is not None else None,
                        content.get("freshness"),
                        json.dumps(content["fields"]) if content.get("fields") is not None else None,
                        created_at,
                    ),
                )
        except Exception:
            continue
    con.close()


# ── Templates ─────────────────────────────────────────────────────────────────

def save_template(name: str, canvas_json: str, thumbnail: str | None, width: int, height: int, slot_schema=None) -> str:
    tmpl_id = "tmpl_" + uuid.uuid4().hex[:12]
    now = datetime.utcnow().isoformat()
    con = _conn()
    with con:
        con.execute(
            """INSERT INTO templates
               (id, name, canvas_json, slot_schema, thumbnail, width, height, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                tmpl_id,
                name,
                canvas_json,
                json.dumps(slot_schema) if slot_schema is not None else None,
                thumbnail,
                width,
                height,
                now,
                now,
            ),
        )
    con.close()
    return tmpl_id


def update_template(template_id: str, **kwargs) -> bool:
    allowed = {"name", "canvas_json", "thumbnail", "width", "height", "slot_schema"}
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return False
    con = _conn()
    row = con.execute("SELECT id FROM templates WHERE id=?", (template_id,)).fetchone()
    if not row:
        con.close()
        return False
    now = datetime.utcnow().isoformat()
    if "slot_schema" in updates and updates["slot_schema"] is not None:
        updates["slot_schema"] = json.dumps(updates["slot_schema"])
    set_clause = ", ".join(f"{k}=?" for k in updates) + ", updated_at=?"
    values = list(updates.values()) + [now, template_id]
    with con:
        con.execute(f"UPDATE templates SET {set_clause} WHERE id=?", values)
    con.close()
    return True


def _tmpl_row_to_dict(row) -> dict:
    d = dict(row)
    if d.get("slot_schema") is not None:
        d["slot_schema"] = json.loads(d["slot_schema"])
    return d


def get_templates() -> list:
    con = _conn()
    rows = con.execute("SELECT * FROM templates ORDER BY created_at DESC").fetchall()
    con.close()
    return [_tmpl_row_to_dict(r) for r in rows]


def get_template(template_id: str) -> dict | None:
    con = _conn()
    row = con.execute("SELECT * FROM templates WHERE id=?", (template_id,)).fetchone()
    con.close()
    return _tmpl_row_to_dict(row) if row else None


def delete_template(template_id: str) -> bool:
    con = _conn()
    row = con.execute("SELECT id FROM templates WHERE id=?", (template_id,)).fetchone()
    if not row:
        con.close()
        return False
    with con:
        con.execute("DELETE FROM templates WHERE id=?", (template_id,))
    con.close()
    return True


# ── Skills ────────────────────────────────────────────────────────────────────

def get_skills() -> list:
    con = _conn()
    rows = con.execute("SELECT * FROM skills ORDER BY created_at DESC").fetchall()
    con.close()
    result = []
    for r in rows:
        d = dict(r)
        if d.get("output_schema") is not None:
            d["output_schema"] = json.loads(d["output_schema"])
        result.append(d)
    return result


def save_skill(name: str, platform: str, template_id: str | None, output_schema, ai_instructions: str | None, schedule_cron: str | None) -> str:
    skill_id = "skill_" + uuid.uuid4().hex[:12]
    now = datetime.utcnow().isoformat()
    con = _conn()
    with con:
        con.execute(
            """INSERT INTO skills
               (id, name, platform, template_id, output_schema, ai_instructions, schedule_cron, is_active, created_at)
               VALUES (?,?,?,?,?,?,?,1,?)""",
            (
                skill_id,
                name,
                platform,
                template_id,
                json.dumps(output_schema) if output_schema is not None else None,
                ai_instructions,
                schedule_cron,
                now,
            ),
        )
    con.close()
    return skill_id


def delete_skill(skill_id: str) -> bool:
    con = _conn()
    row = con.execute("SELECT id FROM skills WHERE id=?", (skill_id,)).fetchone()
    if not row:
        con.close()
        return False
    with con:
        con.execute("DELETE FROM skills WHERE id=?", (skill_id,))
    con.close()
    return True
