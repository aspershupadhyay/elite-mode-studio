"""storage.py — thin shim over database.py for post persistence."""
from database import save_post, get_posts, get_post, delete_post, clear_posts, attach_image

__all__ = ["save_post", "get_posts", "get_post", "delete_post", "clear_posts", "attach_image"]
