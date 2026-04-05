"""
dedup_gate3.py — Exhaustion handler.

Called when approved_count < target after Gates 1+2.
Tries strategies in order until target is met or all strategies exhausted.

Strategies:
  1. Query expansion   — re-run Tavily with 3 new query variants
  2. Time expansion    — widen date window (yesterday → 3 days → 7 days)
  3. Angle generation  — reuse approved stories that still have variant slots
  4. Shortfall report  — give up cleanly, report what was found
"""

import logging
from dedup_store import cluster_count, MAX_VARIANTS_PER_CLUSTER

log = logging.getLogger(__name__)

MAX_STRATEGY_LOOPS = 10

# ── Strategy 1: Query expansion ───────────────────────────────────────────────

def _expansion_queries(category: str, base_query: str) -> list:
    """Return 3 query variants that are differently phrased."""
    return [
        f"latest {category.lower()} news developments today",
        f"{category.lower()} breaking updates analysis",
        f"recent {category.lower()} events impact consequences",
    ]

def strategy_query_expansion(category: str, freshness: str, get_trending_fn, count_needed: int) -> list:
    """
    Re-run trending fetch with alternate query phrasings.
    get_trending_fn: callable(category, freshness, count) → list of topic dicts
    """
    log.info("Gate3 S1: query expansion for %s (need %d more)", category, count_needed)
    expansion_cats = _expansion_queries(category, "")
    results = []
    seen = set()

    for variant in expansion_cats:
        if len(results) >= count_needed:
            break
        try:
            # Pass variant as a category-like string — get_trending handles query building
            topics = get_trending_fn(variant, freshness, count_needed * 2)
            for t in topics:
                key = t.get("title", "").lower()[:60]
                if key and key not in seen:
                    seen.add(key)
                    results.append(t)
        except Exception as e:
            log.warning("Gate3 S1 variant failed: %s", e)

    log.info("Gate3 S1: found %d new candidates", len(results))
    return results

# ── Strategy 2: Time expansion ────────────────────────────────────────────────

_TIME_LADDER = ["today", "2days", "7days", "any"]

def strategy_time_expansion(category: str, current_freshness: str, get_trending_fn, count_needed: int) -> list:
    """
    Widen the date window step by step.
    Returns new topic candidates found in the wider window.
    """
    try:
        current_idx = _TIME_LADDER.index(current_freshness)
    except ValueError:
        current_idx = 1   # default to 2days

    results = []
    seen = set()

    for freshness in _TIME_LADDER[current_idx + 1:]:
        if len(results) >= count_needed:
            break
        log.info("Gate3 S2: expanding time to freshness=%s", freshness)
        try:
            topics = get_trending_fn(category, freshness, count_needed * 2)
            for t in topics:
                key = t.get("title", "").lower()[:60]
                if key and key not in seen:
                    seen.add(key)
                    results.append(t)
        except Exception as e:
            log.warning("Gate3 S2 failed for freshness=%s: %s", freshness, e)

    log.info("Gate3 S2: found %d new candidates", len(results))
    return results

# ── Strategy 3: Angle generation ─────────────────────────────────────────────

_EXTRA_ANGLES = ["reaction", "consequence", "prediction", "analysis", "breaking"]

def strategy_angle_generation(approved_results: list, count_needed: int) -> list:
    """
    For approved topics that still have variant slots available,
    synthesise new topic dicts with a fresh angle directive.
    These are NOT new Tavily results — they reuse the same headline
    with a forced angle so the LLM produces a different post.
    """
    new_topics = []

    for result in approved_results:
        if len(new_topics) >= count_needed:
            break

        cluster_id = result.get("cluster_id", "")
        if not cluster_id:
            continue

        used = cluster_count(cluster_id)
        if used >= MAX_VARIANTS_PER_CLUSTER:
            continue

        topic = result["topic"]
        current_angle = result.get("angle_type", "")

        # Pick an angle we haven't used for this cluster
        for angle in _EXTRA_ANGLES:
            if angle != current_angle:
                new_topic = {
                    **topic,
                    "forced_angle": angle,
                    "_is_angle_variant": True,
                }
                new_topics.append({
                    "verdict":    "pass",
                    "topic":      new_topic,
                    "signature":  result["signature"],
                    "cluster_id": cluster_id,
                    "angle_type": angle,
                    "reason":     f"angle variant ({angle})",
                })
                break

    log.info("Gate3 S3: generated %d angle variants", len(new_topics))
    return new_topics

# ── Strategy 4: Shortfall report ─────────────────────────────────────────────

def build_shortfall_message(found: int, requested: int) -> str:
    return (
        f"Found {found} unique posts. "
        f"{requested - found} more requested but no unique content "
        f"available in the current search window."
    )

# ── Main entry ────────────────────────────────────────────────────────────────

def run(
    approved_so_far: list,
    target: int,
    category: str,
    freshness: str,
    get_trending_fn,        # callable(category, freshness, count) → list[dict]
    run_gates_fn,           # callable(topics) → list of approved results
) -> dict:
    """
    Run exhaustion strategies until target is met or all strategies fail.

    Returns:
      {
        "approved":  [result, ...],   # final approved list (may be < target)
        "shortfall": int,             # how many short (0 = success)
        "message":   str,             # shortfall message if any
      }
    """
    approved = list(approved_so_far)
    loops = 0

    while len(approved) < target and loops < MAX_STRATEGY_LOOPS:
        loops += 1
        needed = target - len(approved)
        log.info("Gate3 loop %d: need %d more (have %d)", loops, needed, len(approved))

        # Strategy 1 — query expansion
        new_topics = strategy_query_expansion(category, freshness, get_trending_fn, needed * 2)
        if new_topics:
            new_approved = run_gates_fn(new_topics)
            approved.extend(new_approved[:needed])
            if len(approved) >= target:
                break

        needed = target - len(approved)

        # Strategy 2 — time expansion
        new_topics = strategy_time_expansion(category, freshness, get_trending_fn, needed * 2)
        if new_topics:
            new_approved = run_gates_fn(new_topics)
            approved.extend(new_approved[:needed])
            if len(approved) >= target:
                break

        needed = target - len(approved)

        # Strategy 3 — angle variants from existing approved
        angle_results = strategy_angle_generation(approved, needed)
        if angle_results:
            approved.extend(angle_results[:needed])
            if len(approved) >= target:
                break

        # If none of the strategies produced anything new, stop looping
        if not new_topics and not angle_results:
            log.info("Gate3: all strategies exhausted after %d loops", loops)
            break

    shortfall = max(0, target - len(approved))
    message = build_shortfall_message(len(approved), target) if shortfall else ""

    if shortfall:
        log.warning("Gate3 shortfall: found %d / %d requested", len(approved), target)

    return {
        "approved":  approved[:target],
        "shortfall": shortfall,
        "message":   message,
    }
