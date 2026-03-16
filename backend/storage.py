"""
storage.py — Post persistence with in-memory cache.

Previously every save/get/delete opened, parsed, and rewrote the entire
posts.json file. Now the list is kept in memory (_cache) after the first
read and only flushed to disk on mutations, so repeated reads are free.
"""
import json, os, uuid
from datetime import datetime

STORAGE_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "posts.json")

# In-memory cache — None means "not loaded yet"
_cache: list | None = None

def _ensure():
    os.makedirs(os.path.dirname(STORAGE_PATH), exist_ok=True)
    if not os.path.exists(STORAGE_PATH):
        with open(STORAGE_PATH, "w") as f:
            json.dump([], f)

def _load() -> list:
    """Return the cached post list, reading from disk only on first call."""
    global _cache
    if _cache is None:
        _ensure()
        with open(STORAGE_PATH, "r") as f:
            _cache = json.load(f)
    return _cache

def _flush():
    """Write the current in-memory cache back to disk."""
    _ensure()
    with open(STORAGE_PATH, "w") as f:
        json.dump(_cache, f, indent=2)

def save_post(topic: str, platform: str, content: dict, sources: list) -> str:
    posts = _load()
    post = {
        "id": str(uuid.uuid4())[:8],
        "topic": topic,
        "platform": platform,
        "content": content,
        "sources": sources,
        "created_at": datetime.now().isoformat()
    }
    posts.insert(0, post)
    _flush()
    return post["id"]

def get_posts(limit: int = 50) -> list:
    return _load()[:limit]

def delete_post(post_id: str) -> bool:
    global _cache
    posts = _load()
    new_posts = [p for p in posts if p["id"] != post_id]
    if len(new_posts) == len(posts):
        return False
    _cache = new_posts
    _flush()
    return True

def clear_posts():
    global _cache
    _cache = []
    _flush()
