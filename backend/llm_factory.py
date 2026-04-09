"""
llm_factory.py — Build LangChain chat clients from provider + model + config.

All imports are lazy so missing optional packages only fail for that provider,
not the whole app. Pass only the config keys the provider supports.
"""

import logging
log = logging.getLogger(__name__)


def _strip(cfg: dict, *exclude) -> dict:
    """Return cfg without None values and excluded keys."""
    return {k: v for k, v in cfg.items() if v is not None and k not in exclude}


def create_text_llm(provider: str, model: str, api_key: str, config: dict, base_url: str | None = None):
    """
    Build and return a LangChain BaseChatModel.

    config keys (all optional):
        temperature, max_tokens, top_p, frequency_penalty, presence_penalty,
        seed, top_k, num_ctx, repeat_penalty, random_seed, safe_prompt,
        candidate_count, guidance_scale (provider-specific — extras ignored).
    """
    cfg = _strip(config)

    # ── OpenAI native ─────────────────────────────────────────────────────
    if provider == "openai":
        try:
            from langchain_openai import ChatOpenAI
        except ImportError:
            raise ImportError("Run: pip install langchain-openai")
        kw = {k: cfg[k] for k in ("temperature","max_tokens","top_p",
              "frequency_penalty","presence_penalty","seed") if k in cfg}
        return ChatOpenAI(model=model, api_key=api_key, **kw)

    # ── Anthropic ─────────────────────────────────────────────────────────
    if provider == "anthropic":
        try:
            from langchain_anthropic import ChatAnthropic
        except ImportError:
            raise ImportError("Run: pip install langchain-anthropic")
        kw = {k: cfg[k] for k in ("temperature","max_tokens","top_p","top_k") if k in cfg}
        return ChatAnthropic(model=model, api_key=api_key, **kw)

    # ── NVIDIA NIM ────────────────────────────────────────────────────────
    if provider == "nvidia":
        from langchain_nvidia_ai_endpoints import ChatNVIDIA
        max_t = cfg.get("max_tokens", 2048)
        return ChatNVIDIA(model=model, api_key=api_key, max_completion_tokens=max_t)

    # ── Groq ──────────────────────────────────────────────────────────────
    if provider == "groq":
        try:
            from langchain_groq import ChatGroq
        except ImportError:
            raise ImportError("Run: pip install langchain-groq")
        kw = {k: cfg[k] for k in ("temperature","max_tokens","top_p") if k in cfg}
        return ChatGroq(model=model, api_key=api_key, **kw)

    # ── Mistral AI ────────────────────────────────────────────────────────
    if provider == "mistral":
        try:
            from langchain_mistralai import ChatMistralAI
        except ImportError:
            raise ImportError("Run: pip install langchain-mistralai")
        kw = {k: cfg[k] for k in ("temperature","max_tokens","top_p",
              "safe_prompt","random_seed") if k in cfg}
        return ChatMistralAI(model=model, api_key=api_key, **kw)

    # ── Google Gemini ─────────────────────────────────────────────────────
    if provider == "google":
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
        except ImportError:
            raise ImportError("Run: pip install langchain-google-genai")
        kw = {k: cfg[k] for k in ("temperature","max_tokens","top_p","top_k") if k in cfg}
        return ChatGoogleGenerativeAI(model=model, google_api_key=api_key, **kw)

    # ── Cohere ────────────────────────────────────────────────────────────
    if provider == "cohere":
        try:
            from langchain_cohere import ChatCohere
        except ImportError:
            raise ImportError("Run: pip install langchain-cohere")
        kw = {k: cfg[k] for k in ("temperature","max_tokens") if k in cfg}
        return ChatCohere(model=model, cohere_api_key=api_key, **kw)

    # ── Ollama (local) ────────────────────────────────────────────────────
    if provider == "ollama":
        try:
            from langchain_ollama import ChatOllama
        except ImportError:
            raise ImportError("Run: pip install langchain-ollama")
        url = base_url or "http://localhost:11434"
        kw = {k: cfg[k] for k in ("temperature","top_p","top_k",
              "num_ctx","repeat_penalty") if k in cfg}
        if "max_tokens" in cfg:
            kw["num_predict"] = cfg["max_tokens"]
        return ChatOllama(model=model, base_url=url, **kw)

    # ── OpenAI-compatible (Together, Fireworks, DeepSeek, xAI, Perplexity) ─
    if provider in ("together", "fireworks", "deepseek", "xai", "perplexity"):
        try:
            from langchain_openai import ChatOpenAI
        except ImportError:
            raise ImportError("Run: pip install langchain-openai")
        if not base_url:
            from providers import PROVIDERS
            base_url = PROVIDERS.get(provider, {}).get("base_url")
        kw = {k: cfg[k] for k in ("temperature","max_tokens","top_p",
              "frequency_penalty","presence_penalty","seed") if k in cfg}
        return ChatOpenAI(model=model, api_key=api_key, base_url=base_url, **kw)

    raise ValueError(f"Unknown text provider: '{provider}'")


def create_image_client(provider: str, model: str, api_key: str, config: dict):
    """
    Return a callable image-generation client.
    Returned object has: generate(prompt: str) -> bytes  (PNG image bytes)
    Actual wiring done in image_agent.py — this factory just validates provider.
    """
    cfg = _strip(config)

    if provider == "openai":
        try:
            import openai
        except ImportError:
            raise ImportError("Run: pip install openai")
        client = openai.OpenAI(api_key=api_key)

        def generate(prompt: str) -> bytes:
            size = f"{cfg.get('width', 1024)}x{cfg.get('height', 1024)}"
            resp = client.images.generate(
                model=model, prompt=prompt,
                size=size, quality=cfg.get("quality", "standard"),
                response_format="b64_json", n=1,
            )
            import base64
            return base64.b64decode(resp.data[0].b64_json)

        return generate

    if provider == "stability":
        try:
            import requests
        except ImportError:
            raise ImportError("requests is required")

        def generate(prompt: str) -> bytes:
            import requests as req
            url = f"https://api.stability.ai/v2beta/stable-image/generate/core"
            headers = {"authorization": f"Bearer {api_key}", "accept": "image/*"}
            data = {"prompt": prompt, "output_format": "png",
                    "steps": cfg.get("steps", 30),
                    "cfg_scale": cfg.get("cfg_scale", 7.0)}
            if cfg.get("seed"):
                data["seed"] = cfg["seed"]
            r = req.post(url, headers=headers, files={"none": ""}, data=data)
            r.raise_for_status()
            return r.content

        return generate

    if provider == "replicate":
        try:
            import replicate as rep
        except ImportError:
            raise ImportError("Run: pip install replicate")

        def generate(prompt: str) -> bytes:
            import replicate as rep, requests as req
            rep.Client(api_token=api_key)
            output = rep.run(model, input={
                "prompt": prompt,
                "num_inference_steps": cfg.get("num_inference_steps", 28),
                "guidance_scale": cfg.get("guidance_scale", 3.5),
                **({"seed": cfg["seed"]} if cfg.get("seed") else {}),
            })
            url = output[0] if isinstance(output, list) else str(output)
            return req.get(url).content

        return generate

    raise ValueError(f"Unknown image provider: '{provider}'")
