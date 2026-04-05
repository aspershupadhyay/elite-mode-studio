"""
dedup_gate1.py — Fast SQLite deduplication checks. Zero API cost.

Verdicts per topic:
  "pass"    → definitely unique, skip Gate 2
  "flag"    → possible duplicate/variant, send to Gate 2
  "block"   → definite duplicate or cluster full, discard immediately
"""

import logging
from dedup_store import (
    url_exists,
    signature_count,
    cluster_count,
    build_content_signature,
    build_cluster_id,
    MAX_VARIANTS_PER_CLUSTER,
)

log = logging.getLogger(__name__)

# ── Result shape ──────────────────────────────────────────────────────────────

def _result(verdict: str, topic: dict, signature: str, cluster_id: str, reason: str) -> dict:
    return {
        "verdict":    verdict,   # "pass" | "flag" | "block"
        "topic":      topic,
        "signature":  signature,
        "cluster_id": cluster_id,
        "reason":     reason,
    }

# ── Per-topic check ───────────────────────────────────────────────────────────

def check_topic(topic: dict) -> dict:
    """
    Run all three Gate 1 checks on a single topic dict.
    topic must have: title (str), url (str, optional), snippet (str, optional)
    """
    title   = topic.get("title", "").strip()
    url     = topic.get("url", "").strip()
    snippet = topic.get("snippet", "")

    sig        = build_content_signature(title, snippet)
    cluster_id = build_cluster_id(sig)

    # Check 1 — exact URL already generated
    if url and url_exists(url):
        log.debug("Gate1 BLOCK url=%s", url[:60])
        return _result("block", topic, sig, cluster_id, "URL already generated")

    # Check 2 — signature match (same entity+action+day)
    sig_hits = signature_count(sig)
    if sig_hits > 0:
        # Don't block yet — flag for LLM to decide DUPLICATE vs VARIANT
        log.debug("Gate1 FLAG sig=%s hits=%d", sig, sig_hits)
        return _result("flag", topic, sig, cluster_id, f"Signature match ({sig_hits} existing)")

    # Check 3 — cluster variant cap
    variants = cluster_count(cluster_id)
    if variants >= MAX_VARIANTS_PER_CLUSTER:
        log.debug("Gate1 BLOCK cluster=%s variants=%d", cluster_id, variants)
        return _result("block", topic, sig, cluster_id,
                       f"Cluster full ({variants}/{MAX_VARIANTS_PER_CLUSTER} variants)")

    # All clear
    log.debug("Gate1 PASS title=%s", title[:60])
    return _result("pass", topic, sig, cluster_id, "Unique")

# ── Batch check ───────────────────────────────────────────────────────────────

def run(topics: list) -> dict:
    """
    Run Gate 1 on a list of topic dicts.

    Returns:
      {
        "passed":  [result, ...],   # ready to generate
        "flagged": [result, ...],   # send to Gate 2
        "blocked": [result, ...],   # discard
      }
    """
    passed, flagged, blocked = [], [], []

    for topic in topics:
        result = check_topic(topic)
        v = result["verdict"]
        if v == "pass":
            passed.append(result)
        elif v == "flag":
            flagged.append(result)
        else:
            blocked.append(result)

    log.info("Gate1: %d passed | %d flagged | %d blocked",
             len(passed), len(flagged), len(blocked))
    return {"passed": passed, "flagged": flagged, "blocked": blocked}
