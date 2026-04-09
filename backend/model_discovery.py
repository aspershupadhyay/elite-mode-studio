"""
model_discovery.py — Live model discovery from provider APIs.

Each provider that exposes a /models (or equivalent) endpoint is queried
when an API key is present. Results are merged over the static registry,
so new releases appear without any code changes.

Returned format matches ModelDef from model_registry.py.
"""

import logging
import asyncio
from typing import Any

log = logging.getLogger(__name__)

# Providers that support live model listing (and their fetch strategy)
_DISCOVERABLE = {
    "openai":     "openai_v1",
    "nvidia":     "openai_v1",   # NIM exposes /v1/models
    "groq":       "openai_v1",
    "mistral":    "mistral_v1",
    "together":   "openai_v1",
    "fireworks":  "openai_v1",
    "deepseek":   "openai_v1",
    "xai":        "openai_v1",
    "perplexity": "openai_v1",
    "ollama":     "ollama_tags",
    "google":     "google_models",
}

# OpenAI-compatible base URLs per provider
_BASE_URLS = {
    "openai":    "https://api.openai.com",
    "nvidia":    "https://integrate.api.nvidia.com",
    "groq":      "https://api.groq.com/openai",
    "together":  "https://api.together.xyz",
    "fireworks": "https://api.fireworks.ai/inference",
    "deepseek":  "https://api.deepseek.com",
    "xai":       "https://api.x.ai",
    "perplexity":"https://api.perplexity.ai",
}

# Model IDs to skip (embedding / reranking / audio / non-chat models)
_SKIP_SUFFIXES = ("embed", "embedding", "rerank", "tts", "whisper",
                  "moderation", "instruct-fp8")
_SKIP_PREFIXES = ("text-embedding", "text-moderation", "babbage", "davinci",
                  "curie", "ada-", "audio-")


def _should_skip(model_id: str) -> bool:
    mid = model_id.lower()
    return (any(mid.endswith(s) for s in _SKIP_SUFFIXES) or
            any(mid.startswith(p) for p in _SKIP_PREFIXES))


def _make_model_def(model_id: str, provider: str) -> dict:
    """Build a minimal ModelDef from a discovered model ID."""
    from model_registry import TEXT_MODELS
    existing = next((m for m in TEXT_MODELS if m["id"] == model_id), None)
    if existing:
        return dict(existing)
    name = model_id.split("/")[-1].replace("-", " ").replace("_", " ").title()
    return {
        "id": model_id, "name": name, "provider": provider,
        "type": "text", "tier": "fast", "open_src": False, "context": None,
    }


async def _fetch_openai_v1(provider: str, api_key: str) -> list[dict]:
    """Fetch /v1/models from any OpenAI-compatible endpoint."""
    try:
        import httpx
        base = _BASE_URLS.get(provider, "")
        if not base:
            from providers import PROVIDERS
            base = (PROVIDERS.get(provider, {}).get("base_url") or "").rstrip("/")
        url = f"{base}/v1/models"
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(url, headers={"Authorization": f"Bearer {api_key}"})
            r.raise_for_status()
            data = r.json()
        models = []
        for m in data.get("data", []):
            mid = m.get("id", "")
            if mid and not _should_skip(mid):
                models.append(_make_model_def(mid, provider))
        return models
    except Exception as e:
        log.debug("Discovery failed for %s: %s", provider, e)
        return []


async def _fetch_mistral_v1(api_key: str) -> list[dict]:
    try:
        import httpx
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get("https://api.mistral.ai/v1/models",
                            headers={"Authorization": f"Bearer {api_key}"})
            r.raise_for_status()
            data = r.json()
        return [_make_model_def(m["id"], "mistral")
                for m in data.get("data", [])
                if not _should_skip(m.get("id", ""))]
    except Exception as e:
        log.debug("Mistral discovery failed: %s", e)
        return []


async def _fetch_ollama_tags(base_url: str = "http://localhost:11434") -> list[dict]:
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(f"{base_url}/api/tags")
            r.raise_for_status()
            data = r.json()
        return [_make_model_def(m["name"], "ollama")
                for m in data.get("models", [])]
    except Exception as e:
        log.debug("Ollama discovery failed: %s", e)
        return []


async def _fetch_google_models(api_key: str) -> list[dict]:
    try:
        import httpx
        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(url)
            r.raise_for_status()
            data = r.json()
        models = []
        for m in data.get("models", []):
            mid = m.get("name", "").replace("models/", "")
            if mid and "generateContent" in m.get("supportedGenerationMethods", []):
                models.append(_make_model_def(mid, "google"))
        return models
    except Exception as e:
        log.debug("Google discovery failed: %s", e)
        return []


async def discover_models(provider: str, api_key: str = "", base_url: str = "") -> list[dict]:
    """
    Fetch live models for a provider.
    Returns deduplicated list (discovered models first, then static fallback).
    """
    from model_registry import get_models

    strategy = _DISCOVERABLE.get(provider)
    live: list[dict] = []

    if strategy == "openai_v1" and api_key:
        live = await _fetch_openai_v1(provider, api_key)
    elif strategy == "mistral_v1" and api_key:
        live = await _fetch_mistral_v1(api_key)
    elif strategy == "ollama_tags":
        live = await _fetch_ollama_tags(base_url or "http://localhost:11434")
    elif strategy == "google_models" and api_key:
        live = await _fetch_google_models(api_key)

    static = get_models(provider=provider, model_type="text")

    # Merge: live first, then static entries not already in live
    seen: set[str] = {m["id"] for m in live}
    merged = list(live)
    for m in static:
        if m["id"] not in seen:
            merged.append(dict(m))
            seen.add(m["id"])

    return merged


async def discover_all(provider_keys: dict[str, str]) -> dict[str, list[dict]]:
    """Fetch models for all providers concurrently."""
    from providers import PROVIDERS

    tasks = {}
    for provider in PROVIDERS:
        key = provider_keys.get(provider, "")
        base = PROVIDERS[provider].get("base_url") or ""
        tasks[provider] = discover_models(provider, key, base)

    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    return {p: (r if isinstance(r, list) else [])
            for p, r in zip(tasks.keys(), results)}
