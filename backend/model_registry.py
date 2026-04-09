"""
model_registry.py — Model catalogue.

Philosophy:
  - NVIDIA NIM: every available free-endpoint model listed (one key unlocks all)
  - Other paid providers (OpenAI, Anthropic, Google, etc.): top 3-4 flagship models only
  - Free/local providers (Groq free tier, Ollama): keep all
  - Live discovery merges fresh models on top when an API key is present

Updated: April 2025.
"""

from typing import TypedDict, Optional

class ModelDef(TypedDict):
    id:        str
    name:      str
    provider:  str
    type:      str
    tier:      str
    open_src:  bool
    context:   Optional[int]


def _t(id, name, provider, tier, open_src, context):
    return ModelDef(id=id, name=name, provider=provider, type="text",
                    tier=tier, open_src=open_src, context=context)

def _i(id, name, provider, tier, open_src):
    return ModelDef(id=id, name=name, provider=provider, type="image",
                    tier=tier, open_src=open_src, context=None)


TEXT_MODELS: list[ModelDef] = [

    # ══ NVIDIA NIM — full free-endpoint catalog ════════════════════════════════
    # One API key (free at build.nvidia.com) unlocks all models below.
    # Live discovery auto-fetches the latest list when key is set.

    # Meta Llama 3.x
    _t("meta/llama-3.3-70b-instruct",            "Llama 3.3 70B",             "nvidia", "recommended", True,  128000),
    _t("meta/llama-3.1-405b-instruct",           "Llama 3.1 405B",            "nvidia", "powerful",    True,  128000),
    _t("meta/llama-3.1-70b-instruct",            "Llama 3.1 70B",             "nvidia", "fast",        True,  128000),
    _t("meta/llama-3.1-8b-instruct",             "Llama 3.1 8B",              "nvidia", "fast",        True,  128000),
    _t("meta/llama-3.2-90b-vision-instruct",     "Llama 3.2 90B Vision",      "nvidia", "powerful",    True,  128000),
    _t("meta/llama-3.2-11b-vision-instruct",     "Llama 3.2 11B Vision",      "nvidia", "fast",        True,  128000),
    _t("meta/llama-3.2-3b-instruct",             "Llama 3.2 3B",              "nvidia", "fast",        True,  128000),
    _t("meta/llama-3.2-1b-instruct",             "Llama 3.2 1B",              "nvidia", "fast",        True,  128000),
    _t("meta/codellama-70b",                     "Code Llama 70B",            "nvidia", "fast",        True,  100000),

    # NVIDIA Nemotron
    _t("nvidia/llama-3.1-nemotron-70b-instruct",      "Nemotron 70B",         "nvidia", "recommended", False, 128000),
    _t("nvidia/llama-3.1-nemotron-51b-instruct",      "Nemotron 51B",         "nvidia", "powerful",    False, 128000),
    _t("nvidia/llama-3.3-nemotron-super-49b-v1",      "Nemotron Super 49B",   "nvidia", "powerful",    False, 128000),
    _t("nvidia/llama-3.1-nemotron-nano-8b-v1",        "Nemotron Nano 8B",     "nvidia", "fast",        False, 128000),
    _t("nvidia/nemotron-mini-4b-instruct",            "Nemotron Mini 4B",     "nvidia", "fast",        False,   4096),
    _t("nvidia/nemotron-4-340b-instruct",             "Nemotron 340B",        "nvidia", "powerful",    False,   4096),

    # Mistral on NIM
    _t("mistralai/mixtral-8x22b-instruct",       "Mixtral 8x22B",             "nvidia", "powerful",    True,   65536),
    _t("mistralai/mixtral-8x7b-instruct-v01",    "Mixtral 8x7B",              "nvidia", "fast",        True,   32768),
    _t("mistralai/mistral-large-2-instruct",     "Mistral Large 2",           "nvidia", "powerful",    False, 128000),
    _t("mistralai/mistral-nemo-12b-instruct",    "Mistral Nemo 12B",          "nvidia", "fast",        True,  128000),
    _t("mistralai/mistral-7b-instruct-v0.3",     "Mistral 7B v0.3",           "nvidia", "fast",        True,   32768),
    _t("mistralai/codestral-22b-instruct-v0.1",  "Codestral 22B",             "nvidia", "fast",        False, 256000),

    # Qwen on NIM
    _t("qwen/qwen2.5-72b-instruct",             "Qwen 2.5 72B",              "nvidia", "powerful",    True,  131072),
    _t("qwen/qwen2.5-7b-instruct",              "Qwen 2.5 7B",               "nvidia", "fast",        True,  131072),
    _t("qwen/qwen2.5-coder-32b-instruct",       "Qwen 2.5 Coder 32B",        "nvidia", "fast",        True,  131072),
    _t("qwen/qwen2.5-coder-7b-instruct",        "Qwen 2.5 Coder 7B",         "nvidia", "fast",        True,  131072),
    _t("qwen/qwen2-7b-instruct",                "Qwen 2 7B",                 "nvidia", "fast",        True,  131072),

    # Microsoft on NIM
    _t("microsoft/phi-3.5-mini-instruct",       "Phi-3.5 Mini",              "nvidia", "fast",        True,  128000),
    _t("microsoft/phi-3.5-moe-instruct",        "Phi-3.5 MoE",               "nvidia", "fast",        True,  131072),
    _t("microsoft/phi-3-medium-128k-instruct",  "Phi-3 Medium 128K",         "nvidia", "fast",        True,  128000),
    _t("microsoft/phi-3-medium-4k-instruct",    "Phi-3 Medium 4K",           "nvidia", "fast",        True,    4096),
    _t("microsoft/phi-3-mini-128k-instruct",    "Phi-3 Mini 128K",           "nvidia", "fast",        True,  128000),
    _t("microsoft/phi-3-mini-4k-instruct",      "Phi-3 Mini 4K",             "nvidia", "fast",        True,    4096),
    _t("microsoft/phi-3-small-128k-instruct",   "Phi-3 Small 128K",          "nvidia", "fast",        True,  128000),
    _t("microsoft/phi-3-small-8k-instruct",     "Phi-3 Small 8K",            "nvidia", "fast",        True,    8192),

    # Google on NIM
    _t("google/gemma-2-27b-it",                 "Gemma 2 27B",               "nvidia", "fast",        True,   8192),
    _t("google/gemma-2-9b-it",                  "Gemma 2 9B",                "nvidia", "fast",        True,   8192),
    _t("google/gemma-2-2b-it",                  "Gemma 2 2B",                "nvidia", "fast",        True,   8192),
    _t("google/recurrentgemma-2b",              "RecurrentGemma 2B",         "nvidia", "fast",        True,   4096),
    _t("google/codegemma-7b",                   "CodeGemma 7B",              "nvidia", "fast",        True,   8192),
    _t("google/codegemma-1.1-7b",               "CodeGemma 1.1 7B",          "nvidia", "fast",        True,   8192),

    # GLM (ZhipuAI) on NIM
    _t("zhipuai/glm-4-9b-chat",                 "GLM-4 9B",                  "nvidia", "fast",        True,  131072),
    _t("zhipuai/glm-4-9b-0414",                 "GLM-4 9B (Apr 25)",         "nvidia", "fast",        True,  131072),
    _t("zhipuai/glm-z1-9b-0414",                "GLM-Z1 9B (Reasoning)",     "nvidia", "reasoning",   True,  131072),
    _t("zhipuai/glm-z1-rumination-32b",         "GLM-Z1 Rumination 32B",     "nvidia", "reasoning",   True,  131072),
    _t("zhipuai/glm-4v-9b",                     "GLM-4V 9B (Vision)",        "nvidia", "fast",        True,  131072),

    # IBM Granite on NIM
    _t("ibm/granite-3.1-8b-instruct",           "Granite 3.1 8B",            "nvidia", "fast",        False, 131072),
    _t("ibm/granite-3.1-2b-instruct",           "Granite 3.1 2B",            "nvidia", "fast",        False,   8192),
    _t("ibm/granite-3.0-8b-instruct",           "Granite 3.0 8B",            "nvidia", "fast",        False, 131072),
    _t("ibm/granite-3.0-2b-instruct",           "Granite 3.0 2B",            "nvidia", "fast",        False,   8192),
    _t("ibm/granite-34b-code-instruct",         "Granite 34B Code",          "nvidia", "fast",        False,   8192),
    _t("ibm/granite-8b-code-instruct",          "Granite 8B Code",           "nvidia", "fast",        False,   4096),

    # AI21 Jamba on NIM
    _t("ai21labs/jamba-1.5-large",              "Jamba 1.5 Large",           "nvidia", "powerful",    False, 256000),
    _t("ai21labs/jamba-1.5-mini",               "Jamba 1.5 Mini",            "nvidia", "fast",        False, 256000),

    # DeepSeek on NIM
    _t("deepseek-ai/deepseek-r1",               "DeepSeek R1 (NIM)",         "nvidia", "reasoning",   True,  128000),
    _t("deepseek-ai/deepseek-r1-distill-llama-70b","DeepSeek R1 Llama 70B",  "nvidia", "reasoning",   True,  128000),
    _t("deepseek-ai/deepseek-r1-distill-qwen-32b","DeepSeek R1 Qwen 32B",   "nvidia", "reasoning",   True,  131072),

    # Writer on NIM
    _t("writer/palmyra-x-004",                  "Palmyra X 004",             "nvidia", "powerful",    False, 128000),
    _t("writer/palmyra-med-70b",                "Palmyra Med 70B",           "nvidia", "powerful",    False,  32768),
    _t("writer/palmyra-fin-70b-32k",            "Palmyra Fin 70B",           "nvidia", "powerful",    False,  32768),

    # Snowflake on NIM
    _t("snowflake/arctic",                      "Snowflake Arctic",          "nvidia", "powerful",    True,   4096),

    # Databricks on NIM
    _t("databricks/dbrx-instruct",              "DBRX Instruct",             "nvidia", "fast",        True,  32768),

    # Multilingual / regional on NIM
    _t("seallms/seallm-7b-v2.5",               "SeaLLM 7B",                 "nvidia", "fast",        True,  131072),
    _t("tokyotech-llm/llama-3.1-swallow-70b-instruct-v0.1","Swallow 70B",   "nvidia", "fast",        True,  128000),
    _t("yentinglin/llama-3-taiwan-70b-instruct","Taiwan Llama 70B",          "nvidia", "fast",        True,  128000),
    _t("mediatek-research/breeze-7b-32k-instruct-v1_0","Breeze 7B 32K",     "nvidia", "fast",        True,   32768),
    _t("upstage/solar-10.7b-instruct",          "Solar 10.7B",               "nvidia", "fast",        True,   4096),

    # Adept on NIM
    _t("adept/fuyu-8b",                         "Fuyu 8B",                   "nvidia", "fast",        False,  16384),

    # ══ OpenAI — flagship models only ════════════════════════════════════════
    _t("gpt-4.5-preview",   "GPT-4.5 Preview",  "openai", "powerful",    False, 128000),
    _t("gpt-4o",            "GPT-4o",           "openai", "recommended", False, 128000),
    _t("o3",                "o3",               "openai", "reasoning",   False, 200000),
    _t("o4-mini",           "o4 Mini",          "openai", "reasoning",   False, 200000),

    # ══ Anthropic — flagship models only ═════════════════════════════════════
    _t("claude-opus-4-6",            "Claude Opus 4.6",    "anthropic", "powerful",    False, 200000),
    _t("claude-sonnet-4-6",          "Claude Sonnet 4.6",  "anthropic", "recommended", False, 200000),
    _t("claude-haiku-4-5-20251001",  "Claude Haiku 4.5",   "anthropic", "fast",        False, 200000),
    _t("claude-3-5-sonnet-20241022", "Claude 3.5 Sonnet",  "anthropic", "recommended", False, 200000),

    # ══ Google Gemini — flagship models only ══════════════════════════════════
    _t("gemini-2.5-pro-preview-03-25",   "Gemini 2.5 Pro",         "google", "powerful",    False, 1048576),
    _t("gemini-2.5-flash-preview-04-17", "Gemini 2.5 Flash",       "google", "fast",        False, 1048576),
    _t("gemini-2.0-flash",               "Gemini 2.0 Flash",       "google", "fast",        False, 1048576),
    _t("gemini-1.5-pro-002",             "Gemini 1.5 Pro",         "google", "powerful",    False, 2097152),

    # ══ Groq — free tier, keep top models ═════════════════════════════════════
    _t("llama-3.3-70b-versatile",        "Llama 3.3 70B",          "groq", "recommended", True,  128000),
    _t("llama-3.1-8b-instant",           "Llama 3.1 8B",           "groq", "fast",        True,  128000),
    _t("deepseek-r1-distill-llama-70b",  "DeepSeek R1 70B",        "groq", "reasoning",   True,  128000),
    _t("qwen-qwq-32b",                   "QwQ 32B",                "groq", "reasoning",   True,  131072),
    _t("gemma2-9b-it",                   "Gemma 2 9B",             "groq", "fast",        True,    8192),

    # ══ Mistral AI — flagship models only ════════════════════════════════════
    _t("mistral-large-latest",     "Mistral Large",      "mistral", "recommended", False, 131072),
    _t("mistral-small-latest",     "Mistral Small",      "mistral", "fast",        False, 131072),
    _t("codestral-latest",         "Codestral",          "mistral", "fast",        False, 256000),
    _t("pixtral-large-latest",     "Pixtral Large",      "mistral", "powerful",    False, 131072),

    # ══ Cohere ════════════════════════════════════════════════════════════════
    _t("command-a-03-2025",        "Command A",          "cohere", "recommended", False, 256000),
    _t("command-r-plus-08-2024",   "Command R+",         "cohere", "powerful",    False, 128000),

    # ══ Together AI — top models only ════════════════════════════════════════
    _t("meta-llama/Llama-3.3-70B-Instruct-Turbo",       "Llama 3.3 70B",   "together", "recommended", True,  131072),
    _t("meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo", "Llama 3.1 405B",  "together", "powerful",    True,  130815),
    _t("deepseek-ai/DeepSeek-R1",                       "DeepSeek R1",     "together", "reasoning",   True,  163840),
    _t("Qwen/Qwen2.5-72B-Instruct-Turbo",               "Qwen 2.5 72B",    "together", "fast",        True,  131072),

    # ══ Fireworks AI — top models only ═══════════════════════════════════════
    _t("accounts/fireworks/models/llama-v3p3-70b-instruct", "Llama 3.3 70B", "fireworks", "recommended", True, 131072),
    _t("accounts/fireworks/models/deepseek-r1",             "DeepSeek R1",   "fireworks", "reasoning",   True, 163840),
    _t("accounts/fireworks/models/qwen2p5-72b-instruct",    "Qwen 2.5 72B",  "fireworks", "fast",        True, 131072),

    # ══ DeepSeek (direct API) ════════════════════════════════════════════════
    _t("deepseek-chat",     "DeepSeek V3",  "deepseek", "recommended", True, 128000),
    _t("deepseek-reasoner", "DeepSeek R1",  "deepseek", "reasoning",   True, 128000),

    # ══ xAI Grok ════════════════════════════════════════════════════════════
    _t("grok-3",       "Grok 3",       "xai", "powerful",    False, 131072),
    _t("grok-3-mini",  "Grok 3 Mini",  "xai", "fast",        False, 131072),
    _t("grok-2-1212",  "Grok 2",       "xai", "recommended", False, 131072),

    # ══ Perplexity ══════════════════════════════════════════════════════════
    _t("sonar-pro",           "Sonar Pro",        "perplexity", "powerful",    False, 200000),
    _t("sonar-reasoning-pro", "Sonar Reasoning",  "perplexity", "reasoning",   False, 200000),
    _t("sonar",               "Sonar",            "perplexity", "recommended", False, 200000),

    # ══ Ollama — local, no key needed ═══════════════════════════════════════
    _t("llama3.3",         "Llama 3.3",       "ollama", "local", True, 131072),
    _t("llama3.2",         "Llama 3.2",       "ollama", "local", True, 131072),
    _t("llama3.1",         "Llama 3.1",       "ollama", "local", True, 131072),
    _t("mistral",          "Mistral 7B",      "ollama", "local", True,  32768),
    _t("gemma3",           "Gemma 3",         "ollama", "local", True,  32768),
    _t("qwen2.5",          "Qwen 2.5",        "ollama", "local", True, 131072),
    _t("qwen2.5-coder",    "Qwen 2.5 Coder",  "ollama", "local", True, 131072),
    _t("qwq",              "QwQ",             "ollama", "local", True, 131072),
    _t("deepseek-r1",      "DeepSeek R1",     "ollama", "local", True, 131072),
    _t("phi4",             "Phi-4",           "ollama", "local", True, 131072),
    _t("codellama",        "Code Llama",      "ollama", "local", True, 100000),
    _t("mixtral",          "Mixtral 8x7B",    "ollama", "local", True,  32768),
    _t("solar",            "Solar 10.7B",     "ollama", "local", True,   4096),
]


IMAGE_MODELS: list[ModelDef] = [

    # ══ OpenAI ══════════════════════════════════════════════════════════════
    _i("gpt-image-1",     "GPT Image 1",   "openai", "image", False),
    _i("dall-e-3",        "DALL-E 3",      "openai", "image", False),

    # ══ Stability AI ════════════════════════════════════════════════════════
    _i("stable-diffusion-3-5-large",       "SD 3.5 Large",     "stability", "image", False),
    _i("stable-diffusion-3-5-large-turbo", "SD 3.5 Turbo",     "stability", "image", False),
    _i("stable-image/generate/ultra",      "Stable Image Ultra","stability", "image", False),
    _i("stable-image/generate/core",       "Stable Image Core", "stability", "image", False),

    # ══ Replicate / Flux ════════════════════════════════════════════════════
    _i("black-forest-labs/flux-1.1-pro",       "Flux 1.1 Pro",      "replicate", "image", False),
    _i("black-forest-labs/flux-1.1-pro-ultra", "Flux 1.1 Ultra",    "replicate", "image", False),
    _i("black-forest-labs/flux-dev",           "Flux Dev",          "replicate", "image", True),
    _i("black-forest-labs/flux-schnell",       "Flux Schnell",      "replicate", "image", True),
    _i("ideogram-ai/ideogram-v2",              "Ideogram v2",       "replicate", "image", False),
    _i("recraft-ai/recraft-v3",                "Recraft v3",        "replicate", "image", False),

    # ══ Together AI Image ═══════════════════════════════════════════════════
    _i("black-forest-labs/FLUX.1-schnell-Free", "Flux Schnell Free", "together", "image", True),
    _i("black-forest-labs/FLUX.1-pro",          "Flux Pro",          "together", "image", False),

    # ══ NVIDIA NIM Image ════════════════════════════════════════════════════
    _i("stabilityai/stable-diffusion-3-medium", "SD 3 Medium (NIM)", "nvidia", "image", False),
    _i("stabilityai/stable-diffusion-xl",       "SDXL (NIM)",        "nvidia", "image", True),
]


ALL_MODELS: list[ModelDef] = TEXT_MODELS + IMAGE_MODELS


def get_models(provider: str | None = None, model_type: str | None = None) -> list[ModelDef]:
    """Filter the static registry by provider and/or type."""
    result = ALL_MODELS
    if provider:
        result = [m for m in result if m["provider"] == provider]
    if model_type:
        result = [m for m in result if m["type"] == model_type]
    return result
