"""
dedup_gate2.py — LLM batch similarity check.

Only called for topics flagged by Gate 1.
All flagged items are batched into ONE LLM call per cycle to minimise API cost.

Verdicts:
  DUPLICATE  → discard
  VARIANT    → allow (if confidence > CONFIDENCE_THRESHOLD), with angle_type set
  UNIQUE     → allow (Gate 1 was over-cautious)
"""

import json
import logging
import re
from dedup_store import get_recent_posts, MAX_VARIANTS_PER_CLUSTER

log = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.8
MAX_RECENT_POSTS_CONTEXT = 30   # keep LLM prompt short

# ── Prompt builder ─────────────────────────────────────────────────────────────

def _build_prompt(flagged_results: list, recent_posts: list) -> str:
    existing = [
        {"title": p["title"], "angle": p.get("angle_type", ""), "cluster": p.get("topic_cluster_id", "")}
        for p in recent_posts[:MAX_RECENT_POSTS_CONTEXT]
    ]
    candidates = [
        {"id": str(i), "title": r["topic"]["title"], "snippet": r["topic"].get("snippet", "")}
        for i, r in enumerate(flagged_results)
    ]
    return (
        "You are a content deduplication engine.\n\n"
        "EXISTING POSTS (last 5 days):\n"
        + json.dumps(existing, indent=2)
        + "\n\nNEW CANDIDATES (flagged as possible duplicates):\n"
        + json.dumps(candidates, indent=2)
        + """

For each candidate return one verdict:

DUPLICATE = Same core information even if headline is reworded. Block this.
VARIANT   = Same event but genuinely new angle or development adding new info. Allow with angle label.
UNIQUE    = Unrelated story. Allow.

Rules:
- Different headline for same facts = DUPLICATE
- Same event + new data/reaction/consequence = VARIANT
- Return angle label for VARIANT: one of [breaking, analysis, reaction, consequence, prediction]
- confidence < 0.8 → treat as DUPLICATE (safe default)

Respond ONLY in valid JSON array, nothing else:
[
  {
    "id": "0",
    "verdict": "DUPLICATE|VARIANT|UNIQUE",
    "angle": "breaking|analysis|reaction|consequence|prediction|null",
    "confidence": 0.95,
    "reason": "one sentence"
  }
]"""
    )

# ── Response parser ────────────────────────────────────────────────────────────

def _parse_response(raw: str, count: int) -> list:
    """Extract JSON array from LLM response. Falls back to DUPLICATE on parse error."""
    try:
        clean = re.sub(r"```(?:json)?|```", "", raw).strip()
        parsed = json.loads(clean)
        if isinstance(parsed, list):
            return parsed
    except Exception:
        pass
    log.warning("Gate2: failed to parse LLM response — defaulting all to DUPLICATE")
    return [{"id": str(i), "verdict": "DUPLICATE", "angle": None,
             "confidence": 1.0, "reason": "parse error"} for i in range(count)]

# ── Main entry ─────────────────────────────────────────────────────────────────

def run(flagged_results: list, llm) -> dict:
    """
    Run Gate 2 LLM check on flagged items.

    Args:
      flagged_results: list of Gate 1 result dicts with verdict="flag"
      llm: ChatNVIDIA instance (or any LangChain chat model)

    Returns:
      {
        "approved": [result_with_angle, ...],
        "blocked":  [result, ...],
      }
    """
    if not flagged_results:
        return {"approved": [], "blocked": []}

    recent = get_recent_posts(limit=MAX_RECENT_POSTS_CONTEXT)
    prompt_text = _build_prompt(flagged_results, recent)

    try:
        from langchain_core.messages import HumanMessage
        response = llm.invoke([HumanMessage(content=prompt_text)])
        raw = response.content if hasattr(response, "content") else str(response)
    except Exception as e:
        log.warning("Gate2: LLM call failed (%s) — blocking all flagged items", e)
        return {"approved": [], "blocked": flagged_results}

    verdicts = _parse_response(raw, len(flagged_results))

    # Build a lookup by id
    verdict_map = {v["id"]: v for v in verdicts}

    approved, blocked = [], []

    for i, result in enumerate(flagged_results):
        v = verdict_map.get(str(i), {})
        verdict    = v.get("verdict", "DUPLICATE")
        confidence = float(v.get("confidence", 0.0))
        angle      = v.get("angle")
        reason     = v.get("reason", "")

        if verdict == "UNIQUE":
            approved.append({**result, "angle_type": angle or "", "gate2_reason": reason})

        elif verdict == "VARIANT" and confidence >= CONFIDENCE_THRESHOLD:
            approved.append({**result, "angle_type": angle or "analysis", "gate2_reason": reason})

        else:
            # DUPLICATE or low-confidence VARIANT → block
            log.debug("Gate2 BLOCK title=%s verdict=%s conf=%.2f",
                      result["topic"].get("title", "")[:60], verdict, confidence)
            blocked.append({**result, "gate2_reason": reason})

    log.info("Gate2: %d approved | %d blocked", len(approved), len(blocked))
    return {"approved": approved, "blocked": blocked}
