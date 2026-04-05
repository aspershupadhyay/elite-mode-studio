"""
dedup.py — Orchestrator. Wires Gate1 → Gate2 → Gate3.

Public API (used by rag.py):
  init()                            — create DB, run cleanup
  filter_topics(topics, target, category, freshness, llm, get_trending_fn)
    → {"approved": [topic_dict, ...], "shortfall": int, "message": str}
  record_post(post_id, title, url, signature, cluster_id, angle_type)
    — call after a post is successfully generated
"""

import logging
import dedup_store as store
import dedup_gate1 as gate1
import dedup_gate2 as gate2
import dedup_gate3 as gate3

log = logging.getLogger(__name__)

# ── Init ──────────────────────────────────────────────────────────────────────

def init():
    """Must be called once at startup (or before each batch)."""
    store.init_db()
    deleted = store.cleanup_expired()
    log.info("dedup.init: DB ready, %d expired rows removed", deleted)

# ── Internal: run Gate1 + Gate2 on a topic list ───────────────────────────────

def _run_gates_1_and_2(topics: list, llm) -> list:
    """
    Run Gate1 then Gate2 on a list of raw topic dicts.
    Returns list of approved result dicts (each has .topic, .signature, .cluster_id, .angle_type).
    """
    g1 = gate1.run(topics)
    approved = list(g1["passed"])

    if g1["flagged"]:
        g2 = gate2.run(g1["flagged"], llm)
        approved.extend(g2["approved"])

    return approved

# ── Public: filter_topics ─────────────────────────────────────────────────────

def filter_topics(
    raw_topics: list,
    target: int,
    category: str,
    freshness: str,
    llm,
    get_trending_fn,
) -> dict:
    """
    Full deduplication pipeline.

    Args:
      raw_topics:      topics from Tavily (list of dicts with title, url, snippet)
      target:          how many unique approved topics the caller needs
      category:        e.g. "GEOPOLITICS"
      freshness:       e.g. "2days"
      llm:             ChatNVIDIA instance passed in from rag.py
      get_trending_fn: callable(category, freshness, count) → list[dict]
                       (rag.NvidiaRAG.get_trending)

    Returns:
      {
        "approved":  [topic_dict, ...],   # ready to generate, len <= target
        "shortfall": int,
        "message":   str,
      }
    """
    # Gates 1 + 2 on the initial Tavily batch
    approved_results = _run_gates_1_and_2(raw_topics, llm)

    if len(approved_results) < target:
        # Gate 3 — exhaustion handler
        def _gates_fn(topics):
            return _run_gates_1_and_2(topics, llm)

        g3 = gate3.run(
            approved_so_far=approved_results,
            target=target,
            category=category,
            freshness=freshness,
            get_trending_fn=get_trending_fn,
            run_gates_fn=_gates_fn,
        )
        approved_results = g3["approved"]
        shortfall = g3["shortfall"]
        message   = g3["message"]
    else:
        approved_results = approved_results[:target]
        shortfall = 0
        message   = ""

    # Extract plain topic dicts (with angle_type injected if set)
    final_topics = []
    for r in approved_results:
        t = dict(r["topic"])
        if r.get("angle_type"):
            t["_dedup_angle"] = r["angle_type"]
        t["_dedup_signature"]  = r.get("signature", "")
        t["_dedup_cluster_id"] = r.get("cluster_id", "")
        final_topics.append(t)

    log.info("dedup.filter_topics: %d approved (target %d, shortfall %d)",
             len(final_topics), target, shortfall)

    return {
        "approved":  final_topics,
        "shortfall": shortfall,
        "message":   message,
    }

# ── Public: record_post ───────────────────────────────────────────────────────

def record_post(
    post_id: str,
    title: str,
    url: str = "",
    signature: str = "",
    cluster_id: str = "",
    angle_type: str = "",
):
    """
    Persist a successfully generated post to the dedup store.
    Call this after post_completed event fires.
    """
    if not signature:
        signature = store.build_content_signature(title)
    if not cluster_id:
        cluster_id = store.build_cluster_id(signature)

    source_domain = ""
    if url:
        try:
            from urllib.parse import urlparse
            source_domain = urlparse(url).netloc.replace("www.", "")
        except Exception:
            pass

    store.insert_post(
        post_id=post_id,
        title=title,
        url=url,
        content_signature=signature,
        angle_type=angle_type,
        source_domain=source_domain,
        topic_cluster_id=cluster_id,
    )
    log.debug("dedup.record_post: saved %s sig=%s cluster=%s", post_id, signature, cluster_id)
