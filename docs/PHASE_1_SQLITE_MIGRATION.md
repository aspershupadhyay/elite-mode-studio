# Phase 1 — SQLite Migration Instructions

## Goal
Replace the current fragile data layer with a proper SQLite database.
Three problems to fix in one shot:
- Posts stored in a flat JSON file (`data/posts.json`)
- Templates stored in browser `localStorage` (fragile, 5MB cap, no metadata)
- FAISS vector index is in-memory only — resets on every backend restart

---

## Files You Will Touch

### Backend (Python)
- Create `backend/database.py` — new file, this is the core of this task
- Rewrite `backend/storage.py` — make it a thin shim over `database.py`
- Modify `backend/api.py` — add template + skill endpoints, call `init_db()` on startup
- Modify `backend/rag.py` — make FAISS index persist to disk

### Frontend (TypeScript/React)
- Modify `src/pages/TemplateGallery.tsx` — swap localStorage calls for API calls
- Modify `src/pages/DesignStudio.tsx` — swap localStorage template save/load for API calls
- Modify `src/types/domain.ts` — update the `Template` interface

---

## Task 1 — Create `backend/database.py`

This file owns all SQLite logic. Use Python's built-in `sqlite3` module only — no new dependencies, no ORM.

Database file lives at `../data/elite_mode.db` relative to the backend folder (same `data/` directory that already has `posts.json`).

### Tables to create

Create all tables using `CREATE TABLE IF NOT EXISTS` so it is safe to call multiple times.

**posts** — replaces `data/posts.json`
- id (text, primary key)
- topic (text, not null)
- platform (text, default instagram)
- title (text)
- caption (text)
- angle (text)
- highlight_words (text) — store as JSON string
- image_prompts (text) — store as JSON string
- sources (text) — store as JSON string
- freshness (text)
- created_at (text, not null)

**templates** — replaces `localStorage` key `elite_templates`
- id (text, primary key)
- name (text, not null)
- canvas_json (text, not null) — full Fabric.js JSON blob
- slot_schema (text) — JSON object mapping role names to Fabric object IDs, e.g. `{"headline": "obj1", "image": "obj2"}`
- thumbnail (text) — base64 data URL
- width (integer, default 1080)
- height (integer, default 1080)
- created_at (text, not null)
- updated_at (text, not null)

**skills** — Automation Engine, just scaffold the table for now, no logic yet
- id (text, primary key)
- name (text, not null)
- platform (text, default instagram)
- template_id (text) — foreign key to templates.id
- output_schema (text) — JSON object of user-defined field definitions
- ai_instructions (text)
- schedule_cron (text) — null means on-demand only
- is_active (integer, default 1)
- created_at (text, not null)

### Functions to expose

**Initialisation**
- `init_db()` — creates all tables, then calls the migration function below

**Posts**
- `save_post(topic, platform, content_dict, sources_list)` → returns the new post id string
- `get_posts(limit=50)` → returns list of dicts
- `get_post(post_id)` → returns dict or None
- `delete_post(post_id)` → returns bool
- `clear_posts()`

**Templates**
- `save_template(name, canvas_json, thumbnail, width, height, slot_schema=None)` → returns new id string
- `update_template(template_id, **kwargs)` → accepts any subset of columns, returns bool
- `get_templates()` → returns list of dicts
- `get_template(template_id)` → returns dict or None
- `delete_template(template_id)` → returns bool

**Skills (stub only — just enough to support the API endpoints)**
- `get_skills()` → returns list of dicts
- `save_skill(name, platform, template_id, output_schema, ai_instructions, schedule_cron)` → returns new id string
- `delete_skill(skill_id)` → returns bool

### JSON column rules
Any column that stores a list or dict must be serialised with `json.dumps()` on write and deserialised with `json.loads()` on read. If the value is None, store NULL and return None on read — do not crash.

### One-time migration function
Add a function `migrate_posts_json_to_sqlite()` inside `database.py`.
- Read `data/posts.json` if it exists
- For each post in that file, insert it into the `posts` table — skip silently if the id already exists (use INSERT OR IGNORE)
- Do not delete `posts.json` — leave it as a backup
- Call this function at the end of `init_db()`

---

## Task 2 — Rewrite `backend/storage.py`

The existing `api.py` already calls `storage.save_post`, `storage.get_posts`, `storage.delete_post`, and `storage.clear_posts`. These calls must keep working without changing `api.py`.

Rewrite the entire `storage.py` to simply re-export those four functions from `database.py`. Nothing else. The old caching logic, the file paths, all of it goes away.

---

## Task 3 — Modify `backend/api.py`

### Startup
In the existing `startup()` function, call `database.init_db()` so the database and tables are created when the backend boots.

### New Pydantic models to add
Add a model for creating a template — fields: name (required string), canvas_json (required string), thumbnail (optional string), width (optional int, default 1080), height (optional int, default 1080), slot_schema (optional dict).

Add a model for partially updating a template — same fields as above but all optional.

### New routes to add

**Templates**
- `GET /api/templates` — return all templates from the database
- `POST /api/templates` — save a new template, return the created record
- `GET /api/templates/{template_id}` — return one template or 404
- `PUT /api/templates/{template_id}` — partial update, return the updated record
- `DELETE /api/templates/{template_id}` — delete and return success/failure

**Skills**
- `GET /api/skills` — return all skills
- `POST /api/skills` — save a new skill, return the created record
- `DELETE /api/skills/{skill_id}` — delete and return success/failure

### Existing routes to keep
Do not touch any existing routes. Only add new ones.

---

## Task 4 — Persistent FAISS in `backend/rag.py`

Define a constant for the index path — it should point to a folder called `faiss_index` inside the existing `data/` directory.

In `NvidiaRAG.__init__`, after the embedder is initialised, check if the index folder exists on disk. If it does, load it using FAISS's `load_local` method. Pass `allow_dangerous_deserialization=True`. If loading fails for any reason, log a warning and set `self.vectorstore = None` — do not crash startup.

In the `load_pdf` and `load_txt` methods, after the vectorstore is built or merged, save it to disk using FAISS's `save_local` method pointing at the same path.

That is the only change to `rag.py`. Do not touch content generation, prompts, or search logic.

---

## Task 5 — Frontend: replace localStorage with API calls

### `src/pages/TemplateGallery.tsx`
Find every place that reads or writes to `localStorage` with the key `elite_templates`. Replace:
- Loading templates → `GET /api/templates`
- Saving a template → `POST /api/templates`
- Deleting a template → `DELETE /api/templates/{id}`

Use the existing `apiFetch`, `apiPost`, `apiDelete` helpers from `src/api.ts` — same pattern used everywhere else in the codebase.

### `src/pages/DesignStudio.tsx`
Same as above — find any template save or load that touches localStorage and replace with the API calls.

### `src/types/domain.ts`
Update the `Template` interface to match the database columns exactly:
- Rename `canvasJSON` to `canvas_json` to match the backend
- Add `slot_schema` as an optional field — type is `Record<string, string> | null`
- Add `updated_at` as a required string field
- Keep all other existing fields

---

## Do Not Touch
- Any canvas or Fabric.js logic inside `src/studio/`
- Any content generation or prompt logic in `rag.py` beyond the FAISS change above
- `main.ts`, `preload.ts`, `vite.config.ts`
- Any existing UI layout or component styling
- The existing content generation API routes in `api.py`

---

## Verify It Works

After all changes are done, run this in the terminal to confirm the database initialises correctly:

```
cd /Users/sparsh/Desktop/nvidia_rag_app/backend
python3 -c "from database import init_db; init_db(); print('DB OK')"
```

Expected output: `DB OK` and a new file at `data/elite_mode.db`.

Then start the backend normally and confirm:
- `/api/health` returns ok
- `/api/templates` returns an empty array (no crash)
- `/api/posts` returns posts migrated from the old JSON file
- `/api/skills` returns an empty array
