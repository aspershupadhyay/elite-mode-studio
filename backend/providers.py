"""
providers.py — LLM provider registry.

Defines every supported provider: env key name, LangChain client type,
base URL (for OpenAI-compatible providers), and the settings schema
the frontend renders as sliders/inputs for that provider.
"""

import os

# ── Settings schema helpers ────────────────────────────────────────────────────

def _slider(key, label, mn, mx, step, default, tip=""):
    return {"key": key, "label": label, "type": "slider",
            "min": mn, "max": mx, "step": step, "default": default, "tip": tip}

def _number(key, label, mn, mx, step, default, tip=""):
    return {"key": key, "label": label, "type": "number",
            "min": mn, "max": mx, "step": step, "default": default, "tip": tip}

def _toggle(key, label, default, tip=""):
    return {"key": key, "label": label, "type": "toggle", "default": default, "tip": tip}


# Shared base schema (temperature + max_tokens + top_p) — most providers support these
_BASE = [
    _slider("temperature",  "Temperature",  0,  2,    0.01, 0.7,  "Randomness. 0 = deterministic, 2 = very creative."),
    _number("max_tokens",   "Max Tokens",   1,  None, 1,    None, "Output token limit. Leave blank to use model max."),
    _slider("top_p",        "Top P",        0,  1,    0.01, 1.0,  "Nucleus sampling. 1.0 = off."),
]

_OPENAI_EXTRA = [
    _slider("frequency_penalty", "Frequency Penalty", -2, 2, 0.01, 0.0, "Penalises repeated tokens."),
    _slider("presence_penalty",  "Presence Penalty",  -2, 2, 0.01, 0.0, "Encourages new topics."),
    _number("seed", "Seed", 0, None, 1, None, "Fixed seed for reproducibility. Leave blank for random."),
]

_ANTHROPIC_EXTRA = [
    _number("top_k", "Top K", 0, 500, 1, 0, "0 = disabled. Limits next-token candidates."),
]

_OLLAMA_EXTRA = [
    _number("num_ctx",        "Context Window",   512,  131072, 512, 4096, "Local context override."),
    _slider("repeat_penalty", "Repeat Penalty",   0.5,  2,      0.01, 1.1, "Penalises repeated text."),
    _number("top_k",          "Top K",            0,    100,    1,    40,  "Limits candidate pool per step."),
]

_MISTRAL_EXTRA = [
    _toggle("safe_prompt", "Safe Prompt",    False, "Prepend system safety instructions."),
    _number("random_seed", "Random Seed",    0, None, 1, None, "Fixed seed for reproducibility."),
]

_GOOGLE_EXTRA = [
    _number("top_k",            "Top K",            1, 40, 1, 32, "Limits next-token candidates."),
    _slider("candidate_count",  "Candidate Count",  1, 8,  1,  1, "Number of completions to generate."),
]


# ── Provider registry ──────────────────────────────────────────────────────────

PROVIDERS: dict = {

    # ── OpenAI-native ──────────────────────────────────────────────────────────
    "openai": {
        "name": "OpenAI", "env_key": "OPENAI_API_KEY",
        "client_type": "openai", "base_url": None,
        "settings_schema": _BASE + _OPENAI_EXTRA,
    },

    # ── Anthropic ─────────────────────────────────────────────────────────────
    "anthropic": {
        "name": "Anthropic", "env_key": "ANTHROPIC_API_KEY",
        "client_type": "anthropic", "base_url": None,
        "settings_schema": _BASE + _ANTHROPIC_EXTRA,
    },

    # ── NVIDIA NIM ────────────────────────────────────────────────────────────
    "nvidia": {
        "name": "NVIDIA NIM", "env_key": "NVIDIA_API_KEY",
        "client_type": "nvidia", "base_url": None,
        "settings_schema": _BASE + _OPENAI_EXTRA,
    },

    # ── Groq ──────────────────────────────────────────────────────────────────
    "groq": {
        "name": "Groq", "env_key": "GROQ_API_KEY",
        "client_type": "groq", "base_url": None,
        "settings_schema": _BASE + _OPENAI_EXTRA,
    },

    # ── Mistral AI ────────────────────────────────────────────────────────────
    "mistral": {
        "name": "Mistral AI", "env_key": "MISTRAL_API_KEY",
        "client_type": "mistral", "base_url": None,
        "settings_schema": _BASE + _MISTRAL_EXTRA,
    },

    # ── Google Gemini ─────────────────────────────────────────────────────────
    "google": {
        "name": "Google Gemini", "env_key": "GOOGLE_API_KEY",
        "client_type": "google", "base_url": None,
        "settings_schema": _BASE + _GOOGLE_EXTRA,
    },

    # ── Cohere ────────────────────────────────────────────────────────────────
    "cohere": {
        "name": "Cohere", "env_key": "COHERE_API_KEY",
        "client_type": "cohere", "base_url": None,
        "settings_schema": _BASE,
    },

    # ── OpenAI-compatible (custom base_url) ───────────────────────────────────
    "together": {
        "name": "Together AI", "env_key": "TOGETHER_API_KEY",
        "client_type": "openai_compat", "base_url": "https://api.together.xyz/v1",
        "settings_schema": _BASE + _OPENAI_EXTRA,
    },
    "fireworks": {
        "name": "Fireworks AI", "env_key": "FIREWORKS_API_KEY",
        "client_type": "openai_compat", "base_url": "https://api.fireworks.ai/inference/v1",
        "settings_schema": _BASE + _OPENAI_EXTRA,
    },
    "deepseek": {
        "name": "DeepSeek", "env_key": "DEEPSEEK_API_KEY",
        "client_type": "openai_compat", "base_url": "https://api.deepseek.com",
        "settings_schema": _BASE + _OPENAI_EXTRA,
    },
    "xai": {
        "name": "xAI (Grok)", "env_key": "XAI_API_KEY",
        "client_type": "openai_compat", "base_url": "https://api.x.ai/v1",
        "settings_schema": _BASE + _OPENAI_EXTRA,
    },
    "perplexity": {
        "name": "Perplexity", "env_key": "PERPLEXITY_API_KEY",
        "client_type": "openai_compat", "base_url": "https://api.perplexity.ai",
        "settings_schema": _BASE,
    },

    # ── Image-only providers ──────────────────────────────────────────────────
    "stability": {
        "name": "Stability AI", "env_key": "STABILITY_API_KEY",
        "client_type": "stability", "base_url": None,
        "settings_schema": [
            _number("steps",           "Steps",           10, 150, 1,    30,   "Diffusion steps."),
            _slider("cfg_scale",       "CFG Scale",       1,  20,  0.5,  7.0,  "Prompt adherence."),
            _number("seed",            "Seed",            0,  None, 1,   None, "Fixed seed or blank for random."),
            _number("width",           "Width",           256, 2048, 64, 1024, "Output width in pixels."),
            _number("height",          "Height",          256, 2048, 64, 1024, "Output height in pixels."),
        ],
    },
    "replicate": {
        "name": "Replicate", "env_key": "REPLICATE_API_KEY",
        "client_type": "replicate", "base_url": None,
        "settings_schema": [
            _number("num_inference_steps", "Steps",      1,   100, 1,   28,   "Flux inference steps."),
            _slider("guidance_scale",      "Guidance",   0,   20,  0.5, 3.5,  "How closely to follow prompt."),
            _number("seed",                "Seed",       0,   None, 1,  None, "Fixed seed or blank for random."),
        ],
    },

    # ── Local ─────────────────────────────────────────────────────────────────
    "ollama": {
        "name": "Ollama (Local)", "env_key": None,
        "client_type": "ollama", "base_url": "http://localhost:11434",
        "settings_schema": _BASE + _OLLAMA_EXTRA,
    },
}

# Features that can be assigned a model
FEATURES = ["forge", "doc_rag"]

DEFAULT_PROVIDER = "nvidia"
DEFAULT_MODEL    = "meta/llama-3.3-70b-instruct"


def get_provider_key(provider: str) -> str:
    """Read the API key for a provider from the current environment."""
    env_key = PROVIDERS.get(provider, {}).get("env_key")
    return os.environ.get(env_key, "") if env_key else ""
