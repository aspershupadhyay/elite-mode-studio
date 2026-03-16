"""
rag.py — Elite Mode content engine v9.0
Tavily v2 full params: include_answer=advanced, start_date/end_date dynamic,
include_raw_content=markdown, chunks_per_source, time_range — all from search_config.json
"""
# ── macOS SSL root fix — MUST be first, before any network library imports ─────
# Python.org macOS installer ships with no system CA bundle.
# Strategy: keep the ORIGINAL ssl.create_default_context logic but inject
# certifi's cafile so that httpx, aiohttp, requests, urllib all get valid certs.
import ssl as _ssl_mod, os as _os_mod

try:
    import certifi as _certifi
    _CA = _certifi.where()
except ImportError:
    _CA = "/etc/ssl/cert.pem"   # macOS 10.15+ system bundle fallback

# Env-var coverage (requests / urllib / curl)
_os_mod.environ["SSL_CERT_FILE"]      = _CA
_os_mod.environ["REQUESTS_CA_BUNDLE"] = _CA
_os_mod.environ["CURL_CA_BUNDLE"]     = _CA
_os_mod.environ["HTTPX_CA_BUNDLE"]    = _CA   # httpx-specific

# Patch ssl.create_default_context to ALWAYS inject cafile=certifi
# This is the call-path used by httpx, aiohttp, and urllib.
_orig_ssl_ctx = _ssl_mod.create_default_context

def _patched_ssl_ctx(*args, **kwargs):
    kwargs.setdefault("cafile", _CA)
    return _orig_ssl_ctx(*args, **kwargs)

_ssl_mod.create_default_context          = _patched_ssl_ctx
_ssl_mod._create_default_https_context   = _patched_ssl_ctx   # urllib fallback
import ssl, os   # re-export so rest of file can use plain names
ssl.create_default_context         = _patched_ssl_ctx
ssl._create_default_https_context  = _patched_ssl_ctx
# ──────────────────────────────────────────────────────────────────────────────

from langchain_nvidia_ai_endpoints import ChatNVIDIA, NVIDIAEmbeddings, NVIDIARerank
from langchain_community.vectorstores import FAISS
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from tavily import TavilyClient
from pypdf import PdfReader
from datetime import datetime, timedelta
import re, time, logging, json, asyncio, itertools

from config import NVIDIA_API_KEY, TAVILY_API_KEY, LLM_MODEL, EMBED_MODEL, RERANK_MODEL

# ── aiohttp nuclear patch (runs AFTER aiohttp is imported via LangChain deps) ──
# aiohttp creates TCPConnectors with ssl=True which calls its own SSL path.
# Force every new ClientSession to use our certifi SSL context.
try:
    import aiohttp
    _orig_session_init = aiohttp.ClientSession.__init__

    def _patched_session_init(self, *args, connector=None, **kwargs):
        if connector is None:
            import ssl as _ssl
            _ctx = _ssl._create_default_https_context()
            connector = aiohttp.TCPConnector(ssl=_ctx)
        _orig_session_init(self, *args, connector=connector, **kwargs)

    aiohttp.ClientSession.__init__ = _patched_session_init
except Exception:
    pass   # aiohttp not installed — httpx path will handle it
# ──────────────────────────────────────────────────────────────────────────────

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

DOCS_DIR          = os.path.join(os.path.dirname(__file__), "..", "docs")
CONFIG_PATH       = os.path.join(os.path.dirname(__file__), "search_config.json")
MAX_CONTEXT_CHARS = 16_000

# ── Load / save search config ─────────────────────────────────────────────────
_DEFAULT_CONFIG = {
    "tavily": {
        "search_depth": "advanced",
        "max_results": 10,
        "chunks_per_source": 5,
        "include_answer": "advanced",
        "time_range": "day",
        "include_domains": [
            "reuters.com","apnews.com","bbc.com","bbc.co.uk",
            "bloomberg.com","ft.com","wsj.com","economist.com",
            "theguardian.com","nytimes.com","washingtonpost.com",
            "aljazeera.com","france24.com","dw.com",
            "cnbc.com","marketwatch.com",
            "techcrunch.com","wired.com","theverge.com","arstechnica.com",
            "nature.com","science.org","un.org","who.int","imf.org",
            "worldbank.org","foreignpolicy.com","foreignaffairs.com","cfr.org"
        ],
        "exclude_domains": []
    },
    "nvidia": {
        "llm_model": LLM_MODEL,
        "embed_model": EMBED_MODEL,
        "rerank_model": RERANK_MODEL,
        "max_tokens": 4096,
        "top_n_rerank": 4
    }
}

def load_search_config() -> dict:
    try:
        with open(CONFIG_PATH, "r") as f:
            saved = json.load(f)
        # Deep merge saved over defaults
        cfg = json.loads(json.dumps(_DEFAULT_CONFIG))
        cfg["tavily"].update(saved.get("tavily", {}))
        cfg["nvidia"].update(saved.get("nvidia", {}))
        return cfg
    except Exception:
        return json.loads(json.dumps(_DEFAULT_CONFIG))

def save_search_config(cfg: dict):
    with open(CONFIG_PATH, "w") as f:
        json.dump(cfg, f, indent=2)


FRESHNESS_CONFIG = {
    "today": {"label": "today only",    "rule": "Use ONLY news published today ({today}). Reject any fact older than 24 hours."},
    "2days": {"label": "last 2 days",   "rule": "Use ONLY news from the last 2 days ({cutoff} or newer). Reject older facts."},
    "7days": {"label": "last 7 days",   "rule": "Use ONLY news from the last 7 days ({cutoff} or newer)."},
    "any":   {"label": "no date filter", "rule": "Use the most recent and well-sourced information available."},
}

TRENDING_QUERIES = {
    "GEOPOLITICS": "top geopolitics breaking news {date} verified",
    "AI & TECH":   "top AI artificial intelligence breakthrough {date}",
    "FINANCE":     "top global finance markets economy {date}",
    "CRYPTO":      "top cryptocurrency bitcoin ethereum {date}",
    "DEFENSE":     "top military defense conflict {date}",
    "CLIMATE":     "top climate energy transition policy {date}",
}

# ── AI Content Director: Campaign angles ──────────────────────────────────────
CAMPAIGN_ANGLES = ["news_analysis", "data_driven", "emotional_hook", "controversy", "call_to_action"]

ANGLE_PROMPTS = {
    "news_analysis":  "Lead with the most newsworthy fact. Use journalistic inverted-pyramid structure. Every claim must be cited from the research context.",
    "data_driven":    "Open with a specific number, stat, or percentage from the research. Build the entire narrative around verifiable data points and comparisons.",
    "emotional_hook": "Open with the human story behind the headline. Focus on impact on real people, communities, or livelihoods.",
    "controversy":    "Frame the post around the central tension or conflict. Present both sides briefly, then take a clear analytical stance backed by the facts.",
    "call_to_action": "Write for a reader who wants to know 'what should I do with this information?'. Every section ends with an implication for the audience.",
}

HOOK_BLOCK = """```hook_text
5 words maximum. A punch that stops the scroll. Not a shortened title.
```"""
CATEGORY_BLOCK = """```category
One of: GEOPOLITICS · AI & TECH · FINANCE · CRYPTO · BUSINESS · POWER · BREAKING · MARKETS · DEFENSE · CLIMATE
Return only the label. Nothing else.
```"""
PORTRAIT_BLOCK = """```image_prompt_9x16
Same literal named subjects as 16x9. Portrait framing for Stories/Reels.
Primary subject fills top 65%. BOTTOM 35% must be completely clear.
STRUCTURE: SUBJECT / COMPOSITION / SCENE / LIGHTING / COLOR / ATMOSPHERE / STYLE / TECHNICAL
TECHNICAL: 1080x1920. Bottom 35% fades to #0A0A0A. Zero text. Zero watermarks.
```"""

# ── Persona, Tone, Platform & Length modifiers ────────────────────────────────
PERSONA_MODIFIERS = {
    "journalist": "",  # default — elite mode unchanged
    "marketer": """
## PERSONA OVERRIDE — DIGITAL MARKETER
You are a top-tier digital marketer creating high-converting social content. Your goals:
- Lead with a benefit-driven angle — "what's in it for the audience"
- Use impressive numbers and social proof to build credibility
- Build desire and aspiration, not just awareness
- End caption with a subtle but clear call-to-action paragraph
- Title should create a curiosity gap — tease the punchline, don't give it away
- Enthusiastic but credible tone; never desperate
""",
    "educator": """
## PERSONA OVERRIDE — EDUCATOR
You are an expert educator making complex topics genuinely accessible. Your goals:
- Lead with "why this matters to YOUR life or business"
- Use analogies to translate abstract concepts into everyday language
- Structure: Hook → What happened → What it means → Why you should care → Key takeaway
- Numbered steps or bullet points welcome for how-to content
- Warm, curious, accessible — no unnecessary jargon
""",
    "crypto": """
## PERSONA OVERRIDE — CRYPTO / WEB3 ANALYST
You are a sharp on-chain analyst writing for DeFi-native and crypto-sophisticated audiences. Your goals:
- Lead with on-chain data, protocol metrics, or wallet flow when available
- Cover: price implications, protocol TVL impact, whale activity, regulatory signal, chain dynamics
- Be specific: which chain, which protocol, which token, which wallet
- Audience understands ETH, BTC, DeFi, NFTs, L2s — no hand-holding basics
- Alpha tone: precise, direct, zero hype
""",
    "finance": """
## PERSONA OVERRIDE — MACRO / FINANCE ANALYST
You are a macro analyst writing for institutional and sophisticated retail investors. Your goals:
- Lead with the market implication: rates, spreads, sector rotation, currency impact
- Reference Fed, ECB, yield curve, credit markets where relevant
- Use proper financial terminology: basis points, P/E multiples, yield spread, carry trade
- Audience: Bloomberg terminal users — not Reddit retail
- Dense, precise, institutional gravity
""",
    "brand": """
## PERSONA OVERRIDE — PERSONAL BRAND BUILDER
You are a personal brand strategist helping founders and executives build authority. Your goals:
- Frame every story: "what this means for your career, business, or worldview"
- Lead with a bold, original perspective — not just a news recap
- Make the author sound insightful and ahead of the curve
- Every post should spark debate or invite replies
- End with a clear personal opinion or prediction
- Conversational but authoritative
""",
}

TONE_MODIFIERS = {
    "analytical": "",  # default
    "conversational": "\n\nTONE DIRECTIVE: Write conversationally. Short sentences. Sound like texting a smart friend — not writing a report. First-person OK. Contractions encouraged. Avoid corporate language.",
    "professional": "\n\nTONE DIRECTIVE: Write with the precision of a senior executive memo. No slang. Dense but clear. Formal register throughout. Every sentence earns its place.",
    "educational": "\n\nTONE DIRECTIVE: Teach, don't just report. Use analogies to simplify. Define technical terms on first use. Guide the reader through the logic step by step.",
    "punchy": "\n\nTONE DIRECTIVE: Short. Sharp. Sentences under 12 words. Maximum impact per word. No filler. Write like a viral tweet thread — each line hits harder than the last.",
}

CAPTION_LENGTH_MODIFIERS = {
    "short":  "\n\nLENGTH DIRECTIVE: Caption must be 300–500 characters total. One strong fact, one implication. No footnotes — inline cite only.",
    "medium": "",  # default (800–1200 chars per main instruction)
    "long":   "\n\nLENGTH DIRECTIVE: Caption should be 1400–2000 characters. Richly detailed. Multiple clearly structured paragraphs. Full context, multi-angle analysis, strong conclusion.",
}

PLATFORM_MODIFIERS = {
    "instagram":  "",  # default
    "linkedin":   "\n\nPLATFORM DIRECTIVE: Optimize for LinkedIn. Blank line after every sentence for white space. First line hooks without context (standalone). End with an open question to spark comments. Use 2–3 professional hashtags only.",
    "twitter":    "\n\nPLATFORM DIRECTIVE: Optimize for Twitter/X. Caption must feel like a viral thread opener — hook on line 1. 280-character mindset. One idea per sentence. Make them click 'see more'.",
    "newsletter": "\n\nPLATFORM DIRECTIVE: Optimize for email newsletter. Conversational intro, clear subheadings, rich analysis. No hashtags. Sign off with a bold key takeaway sentence.",
}

# ── Date helpers ──────────────────────────────────────────────────────────────
def get_date_strings():
    today = datetime.now()
    return {
        "today":   today.strftime("%B %d, %Y"),
        "iso":     today.strftime("%Y-%m-%d"),
        "cutoff2": (today - timedelta(days=2)).strftime("%B %d, %Y"),
        "cutoff7": (today - timedelta(days=7)).strftime("%B %d, %Y"),
        "iso2":    (today - timedelta(days=2)).strftime("%Y-%m-%d"),
        "iso7":    (today - timedelta(days=7)).strftime("%Y-%m-%d"),
        "month":   today.strftime("%B %Y"),
    }

def get_date_range(freshness: str) -> tuple:
    """Returns (start_date_iso, end_date_iso) for the given freshness.
    'today' returns (None, None) — use days=1 instead to avoid Tavily's
    start_date==end_date rejection.  All other ranges use tomorrow as end_date.
    """
    d   = get_date_strings()
    end = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")  # tomorrow — Tavily requires start != end
    if freshness == "today":  return (None, None)   # handled via days=1 in caller
    if freshness == "2days":  return (d["iso2"], end)
    if freshness == "7days":  return (d["iso7"], end)
    return (None, None)  # "any" — no date restriction

def build_date_rule(freshness: str) -> str:
    cfg = FRESHNESS_CONFIG.get(freshness, FRESHNESS_CONFIG["2days"])
    d   = get_date_strings()
    return cfg["rule"].format(today=d["today"],
                              cutoff=d["cutoff2"] if freshness == "2days" else d["cutoff7"])

def build_search_query(topic: str, freshness: str = "2days") -> str:
    d    = get_date_strings()
    base = topic.strip()
    date_tag = f"today {d['today']}" if freshness == "today" else \
               f"last 2 days {d['month']}" if freshness == "2days" else d["month"]
    return (base + f" {date_tag} verified") if len(base) < 60 else (base + f" {date_tag}")

def build_trending_query(category: str, freshness: str = "2days") -> str:
    d    = get_date_strings()
    date_tag = f"today {d['today']}" if freshness == "today" else \
               f"last 2 days {d['month']}" if freshness == "2days" else d["month"]
    template = TRENDING_QUERIES.get(category, "top {cat} news {date}")
    return template.format(date=date_tag, cat=category)


def classify_error(e: Exception) -> str:
    msg = str(e)
    if "502" in msg or "Bad Gateway" in msg:   return "NVIDIA API gateway error (502). Wait 30s and retry."
    if "401" in msg or "invalid api key" in msg.lower(): return "Invalid API key. Check Settings."
    if "429" in msg or "rate limit" in msg.lower(): return "Rate limit hit. Wait 60s."
    if "tavily" in msg.lower() or "tvly" in msg.lower(): return "Tavily search failed. Check your Tavily API key."
    if "connection" in msg.lower() or "timeout" in msg.lower(): return "Network timeout. Check your connection."
    if "No module" in msg: return f"Missing dependency: {msg}. Run: pip install -r requirements.txt"
    if "elite_mode_instruction" in msg: return "System prompt not found at docs/elite_mode_instruction.md"
    return f"Error: {msg}"

def retry(fn, attempts: int = 3, delay: float = 5.0):
    last_err = None
    for i in range(attempts):
        try:
            return fn()
        except Exception as e:
            last_err = e
            if i < attempts - 1:
                log.warning("Attempt %d failed: %s. Retrying in %.0fs...", i+1, e, delay)
                time.sleep(delay)
    raise last_err

def load_instagram_prompt(include_hook=False, include_category=False,
                          include_9x16=False, freshness="2days",
                          persona="journalist", tone="analytical",
                          platform_target="instagram", caption_length="medium",
                          custom_instructions="") -> str:
    path = os.path.join(DOCS_DIR, "elite_mode_instruction.md")
    if not os.path.exists(path):
        raise FileNotFoundError(f"System prompt not found at {path}")
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    content = content.replace("{DATE_RULE}",      build_date_rule(freshness))
    content = content.replace("{HOOK_BLOCK}",     HOOK_BLOCK     if include_hook     else "NOTE: Skip hook_text block entirely.")
    content = content.replace("{CATEGORY_BLOCK}", CATEGORY_BLOCK if include_category else "NOTE: Skip category block entirely.")
    content = content.replace("{PORTRAIT_BLOCK}", PORTRAIT_BLOCK if include_9x16     else "NOTE: Skip image_prompt_9x16 block entirely.")
    # Persona modifier
    persona_mod = PERSONA_MODIFIERS.get(persona, "")
    if persona_mod:
        content += "\n\n" + persona_mod.strip()
    # Tone modifier
    tone_mod = TONE_MODIFIERS.get(tone, "")
    if tone_mod:
        content += tone_mod
    # Platform modifier
    platform_mod = PLATFORM_MODIFIERS.get(platform_target, "")
    if platform_mod:
        content += platform_mod
    # Caption length modifier
    length_mod = CAPTION_LENGTH_MODIFIERS.get(caption_length, "")
    if length_mod:
        content += length_mod
    # Custom instructions — user override, highest priority
    if custom_instructions and custom_instructions.strip():
        content += f"\n\n## CUSTOM INSTRUCTIONS (USER OVERRIDE — FOLLOW EXACTLY)\n{custom_instructions.strip()}"
    return content

def parse_code_blocks(text: str) -> dict:
    keys = ["title","hook_text","highlight_words","category",
            "caption","image_prompt_16x9","image_prompt_9x16"]
    result = {}
    for key in keys:
        m = re.search(rf"```{key}\s*(.*?)```", text, re.DOTALL)
        result[key] = m.group(1).strip() if m else ""
    src  = re.search(r"SOURCES\s*(.*?)(?:CONFIDENCE|$)", text, re.DOTALL | re.MULTILINE)
    conf = re.search(r"CONFIDENCE:\s*(HIGH|MEDIUM|LOW)", text)
    result["sources_block"] = src.group(1).strip() if src else ""
    result["confidence"]    = conf.group(1)         if conf else ""
    # Post-process highlight_words — remove filler, enforce 4-5 high-signal words
    if result.get("highlight_words") and result.get("title"):
        result["highlight_words"] = clean_highlight_words(
            result["highlight_words"], result["title"]
        )
    return result


# Filler words that must never be highlighted (extends the system prompt ban list)
_FILLER = {
    "the","a","an","in","to","of","and","but","for","with","by","on","at","is","are",
    "has","have","been","that","this","it","as","or","not","no","all","its","now",
    "from","after","was","were","be","will","can","may","their","there","then","than",
    "when","where","how","who","which","what","up","out","over","new","so","if","do",
    "into","just","also","about","more","amid","vs","amid","despite","after","before",
    "during","since","within","across","over","under","against","per","via","off",
    "amid","amid","amid", "amid", "other", "many", "much", "well", "still", "back",
    "could", "should", "would", "both", "each", "between", "through", "only",
}

def clean_highlight_words(raw: str, title: str) -> str:
    """
    Given LLM-produced highlight_words and the title:
    1. Filter out filler/stopwords
    2. Only keep words that actually appear in the title (exact match, case-insensitive)
    3. Score remaining by signal: numbers > proper-noun-like > everything else
    4. Return top 4-5, comma-separated, UPPER cased to match title rendering
    """
    title_upper = title.upper()
    title_words = set(re.findall(r"[A-Z0-9$€£%']+", title_upper))

    # Parse raw comma-separated words
    candidates = [w.strip().upper() for w in raw.split(",") if w.strip()]
    # Remove anything not in the title
    candidates = [w for w in candidates if w in title_words]
    # Remove filler
    candidates = [w for w in candidates if w.lower() not in _FILLER]
    # Deduplicate preserving order
    seen, filtered = set(), []
    for w in candidates:
        if w not in seen:
            seen.add(w)
            filtered.append(w)

    # If LLM gave us too few (e.g., 0-1), pick the best from the title ourselves
    if len(filtered) < 4:
        # Score title words: numbers/symbols score highest, longer words next
        def score(w):
            if re.search(r'[0-9$€£%]', w): return 3    # numbers/currencies = highest signal
            if len(w) >= 5:                return 2     # longer = usually more meaningful
            return 1
        all_title_words = re.findall(r"[A-Z0-9$€£%']+", title_upper)
        pool = [w for w in all_title_words if w.lower() not in _FILLER and w not in seen]
        pool_scored = sorted(set(pool), key=score, reverse=True)
        for w in pool_scored:
            if len(filtered) >= 5:
                break
            filtered.append(w)
            seen.add(w)

    # Trim to max 5
    filtered = filtered[:5]

    # Return comma-separated, preserving the UPPER case
    return ", ".join(filtered)

def embed_in_batches(embedder, docs: list, batch_size: int = 48) -> FAISS:
    if not docs:
        raise ValueError("No documents to embed.")
    store = None
    for i in range(0, len(docs), batch_size):
        batch = docs[i:i + batch_size]
        store = FAISS.from_documents(batch, embedder) if store is None \
                else (store.add_documents(batch) or store)
    return store

def build_sourced_context(results_list: list, max_chars: int = MAX_CONTEXT_CHARS) -> str:
    """Context string with every paragraph labeled with its verified source."""
    chunks, total = [], 0
    for r in results_list:
        url     = r.get("url", "")
        pub     = _extract_publisher(url)
        content = (r.get("raw_content") or r.get("content", "")).strip()
        if not content:
            continue
        header = f"[SOURCE: {pub} | {url}]\n"
        text   = header + content[:4000]
        if total + len(text) > max_chars:
            break
        chunks.append(text)
        total += len(text)
    return "\n\n---\n\n".join(chunks)

def _extract_publisher(url: str) -> str:
    mapping = {
        "reuters.com":"Reuters","apnews.com":"AP News","bbc.com":"BBC","bbc.co.uk":"BBC",
        "bloomberg.com":"Bloomberg","ft.com":"Financial Times","wsj.com":"Wall Street Journal",
        "economist.com":"The Economist","theguardian.com":"The Guardian",
        "nytimes.com":"New York Times","washingtonpost.com":"Washington Post",
        "aljazeera.com":"Al Jazeera","cnbc.com":"CNBC","marketwatch.com":"MarketWatch",
        "techcrunch.com":"TechCrunch","wired.com":"Wired","theverge.com":"The Verge",
        "arstechnica.com":"Ars Technica","nature.com":"Nature","science.org":"Science",
        "un.org":"United Nations","who.int":"WHO","imf.org":"IMF","worldbank.org":"World Bank",
        "foreignpolicy.com":"Foreign Policy","cfr.org":"Council on Foreign Relations",
    }
    for domain, name in mapping.items():
        if domain in url:
            return name
    try:
        from urllib.parse import urlparse
        return urlparse(url).netloc.replace("www.","").split(".")[0].capitalize()
    except Exception:
        return "Unknown Source"


class NvidiaRAG:
    def __init__(self):
        # Cache the search config in memory — loaded once here and refreshed
        # only when reload_config() is called (triggered by the settings endpoint).
        # Previously load_search_config() was called on every single search request.
        self._cfg_cache = load_search_config()
        cfg = self._cfg_cache["nvidia"]
        self.llm      = ChatNVIDIA(model=cfg["llm_model"],    api_key=NVIDIA_API_KEY, max_completion_tokens=cfg["max_tokens"])
        self.embedder = NVIDIAEmbeddings(model=cfg["embed_model"],   api_key=NVIDIA_API_KEY, truncate="END")
        self.reranker = NVIDIARerank(model=cfg["rerank_model"],      api_key=NVIDIA_API_KEY, top_n=cfg["top_n_rerank"])
        self.tavily   = TavilyClient(api_key=TAVILY_API_KEY)
        self.vectorstore  = None
        self.doc_name     = None
        self._top_context = ""
        self.splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)
        log.info("NvidiaRAG v9.0 ready")

    def reload_config(self):
        """Re-read search_config.json from disk and update the in-memory cache.
        Called by the /api/search-config POST endpoint after a user saves settings."""
        self._cfg_cache = load_search_config()
        log.info("Search config reloaded from disk.")

    def _call_llm(self, messages: list) -> str:
        prompt = ChatPromptTemplate.from_messages(messages)
        chain  = prompt | self.llm | StrOutputParser()
        return retry(lambda: chain.invoke({}))

    def _fetch_web_elite(self, query: str, freshness: str = "2days", is_news: bool = True) -> tuple:
        """
        Full Tavily v2 search with all advanced parameters.
        Config comes from search_config.json — fully user-customisable.
        """
        cfg = self._cfg_cache["tavily"]  # use in-memory cache, not a fresh disk read
        start_date, end_date = get_date_range(freshness)

        kwargs = dict(
            query               = query,
            search_depth        = cfg.get("search_depth", "advanced"),
            max_results         = cfg.get("max_results", 10),
            chunks_per_source   = cfg.get("chunks_per_source", 5),
            include_answer      = cfg.get("include_answer", "advanced"),
            include_raw_content = "markdown",
            include_images      = False,
        )

        # Apply time range — "today" uses days=1 (Tavily rejects start==end date ranges)
        if freshness == "today":
            kwargs["days"] = 1
        elif start_date and end_date:
            kwargs["start_date"] = start_date
            kwargs["end_date"]   = end_date
        else:
            tr = cfg.get("time_range", "day")
            if tr and tr != "none":
                kwargs["time_range"] = tr

        if is_news:
            kwargs["topic"] = "news"

        # Domain filters
        include_domains = cfg.get("include_domains", [])
        exclude_domains = cfg.get("exclude_domains", [])
        if include_domains:
            kwargs["include_domains"] = include_domains
        if exclude_domains:
            kwargs["exclude_domains"] = exclude_domains

        log.info("Tavily v2: %s | depth=%s | results=%d | chunks=%d | dates=%s→%s | domains=%d",
                 query[:60], kwargs.get("search_depth"), kwargs.get("max_results"),
                 kwargs.get("chunks_per_source"), start_date, end_date, len(include_domains))

        try:
            results = retry(lambda: self.tavily.search(**kwargs))
        except Exception as e:
            # Fallback: strip domain filter and retry
            log.warning("Tavily with domain filter failed (%s). Retrying without.", e)
            kwargs.pop("include_domains", None)
            kwargs.pop("exclude_domains", None)
            results = retry(lambda: self.tavily.search(**kwargs))

        raw          = results.get("results", [])
        tavily_answer = results.get("answer", "")

        sources_meta = [{
            "title":     r.get("title","").strip(),
            "url":       r.get("url",""),
            "publisher": _extract_publisher(r.get("url","")),
            "score":     r.get("score", 0),
        } for r in raw]

        log.info("Tavily: %d results. Answer: %s", len(raw), "yes" if tavily_answer else "no")
        return raw, sources_meta, tavily_answer

    def _fetch_web(self, query: str, freshness: str = "any") -> tuple:
        """Legacy wrapper for doc/web RAG flows."""
        raw, sources, _ = self._fetch_web_elite(query, freshness=freshness, is_news=False)
        web_docs = []
        for r in raw:
            content = r.get("raw_content") or r.get("content","")
            if content:
                for c in self.splitter.split_text(content):
                    web_docs.append(Document(page_content=c,
                        metadata={"url": r.get("url",""), "title": r.get("title","")}))
        return web_docs, sources

    def _retrieve_and_rerank(self, question: str, store: FAISS) -> list:
        raw_docs = store.as_retriever(search_kwargs={"k": 8}).invoke(question)
        reranked = retry(lambda: self.reranker.compress_documents(raw_docs, question))
        self._top_context = "\n\n".join(d.page_content for d in reranked)
        return reranked


    def load_text(self, text: str, name: str = "document") -> int:
        chunks = self.splitter.split_text(text)
        docs   = [Document(page_content=c) for c in chunks]
        self.vectorstore = retry(lambda: embed_in_batches(self.embedder, docs))
        self.doc_name = name
        return len(chunks)

    def load_pdf(self, filepath: str) -> int:
        reader = PdfReader(filepath)
        text   = "\n".join(p.extract_text() or "" for p in reader.pages)
        if not text.strip():
            raise ValueError("PDF appears to be empty or scanned.")
        return self.load_text(text, name=os.path.basename(filepath))

    def load_txt(self, filepath: str) -> int:
        with open(filepath, "r", encoding="utf-8") as f:
            return self.load_text(f.read(), name=os.path.basename(filepath))

    def ask_doc(self, question: str) -> dict:
        if not self.vectorstore:
            raise ValueError("No document loaded.")
        reranked = self._retrieve_and_rerank(question, self.vectorstore)
        answer   = self._call_llm([
            ("system", "Answer only from the context. Be thorough and precise."),
            ("human",  f"Context:\n{self._top_context}\n\nQuestion: {question}")
        ])
        return {"answer": answer, "sources": [d.page_content[:150]+"..." for d in reranked], "doc_name": self.doc_name}

    def web_search_ask(self, question: str) -> dict:
        web_docs, sources_meta = self._fetch_web(build_search_query(question))
        if not web_docs:
            return {"answer": "No results found from trusted sources.", "sources": []}
        store    = retry(lambda: embed_in_batches(self.embedder, web_docs))
        reranked = self._retrieve_and_rerank(question, store)
        answer   = self._call_llm([
            ("system", "Answer using only the web search context from verified sources. Cite inline like 'per Reuters'."),
            ("human",  f"Context:\n{self._top_context}\n\nQuestion: {question}")
        ])
        return {"answer": answer, "sources": sources_meta}

    def generate_instagram(self, topic: str, include_9x16=False, include_hook=False,
                           include_category=False, freshness="2days",
                           persona="journalist", tone="analytical",
                           platform_target="instagram", caption_length="medium",
                           custom_instructions="") -> dict:
        cfg_label = FRESHNESS_CONFIG.get(freshness, FRESHNESS_CONFIG["2days"])["label"]
        query     = build_search_query(topic, freshness)

        raw_results, sources_meta, tavily_answer = self._fetch_web_elite(
            query, freshness=freshness, is_news=True
        )

        if not raw_results:
            log.warning("No trusted results for '%s'.", topic)
            context = f"Topic: {topic}\nNo verified sources found."
        else:
            context = build_sourced_context(raw_results)
            if tavily_answer:
                context = f"[TAVILY VERIFIED SUMMARY]\n{tavily_answer}\n\n---\n\n{context}"

        system = load_instagram_prompt(include_hook=include_hook,
                                       include_category=include_category,
                                       include_9x16=include_9x16,
                                       freshness=freshness,
                                       persona=persona,
                                       tone=tone,
                                       platform_target=platform_target,
                                       caption_length=caption_length,
                                       custom_instructions=custom_instructions)
        citation_rule = (
            "\n\nCRITICAL SOURCE RULE: Every fact in your output MUST come from the research context above. "
            "Each source is labeled [SOURCE: Publisher | url]. Cite inline like 'per Reuters'. "
            "If a fact is NOT in the context — do NOT include it. No fabrication. No assumptions."
        )

        log.info("Forging: '%s' | freshness=%s | sources=%d", topic, freshness, len(sources_meta))
        prompt = ChatPromptTemplate.from_messages([
            ("system", system + citation_rule),
            ("human",  "forge a post about {question}\n\nResearch context:\n{context}")
        ])
        raw    = retry(lambda: (prompt | self.llm | StrOutputParser())
                       .invoke({"question": topic, "context": context}))
        parsed = parse_code_blocks(raw)
        parsed["raw"] = raw
        return {"content": parsed, "sources": sources_meta, "freshness": cfg_label}

    def get_trending(self, category: str, freshness: str = "2days") -> list:
        query = build_trending_query(category, freshness)
        raw, _, _ = self._fetch_web_elite(query, freshness=freshness, is_news=True)
        topics = []
        for r in raw:
            title = r.get("title","").strip()
            if title and len(title) > 10:
                topics.append({
                    "title":     title,
                    "url":       r.get("url",""),
                    "publisher": _extract_publisher(r.get("url","")),
                    "snippet":   r.get("content","")[:200],
                })
        return topics[:8]

    def batch_generate(self, category: str, count: int = 3, include_9x16=False,
                       include_hook=False, include_category=False, freshness="2days") -> list:
        topics = self.get_trending(category, freshness=freshness)
        if not topics:
            raise ValueError(f"No trending topics found for '{category}'.")
        results = []
        for t in topics[:count]:
            try:
                result = self.generate_instagram(t["title"], include_9x16=include_9x16,
                    include_hook=include_hook, include_category=include_category, freshness=freshness)
                result["original_topic"] = t["title"]
                result["source_url"]     = t.get("url","")
                results.append(result)
            except Exception as e:
                results.append({"error": classify_error(e), "original_topic": t["title"], "content": {}, "sources": []})
            # Removed time.sleep(1) — the frontend already adds a 500ms pause between
            # each post in its progressive batch loop, so double-sleeping was unnecessary.
        return results

    # ── AI Content Director ────────────────────────────────────────────────────

    def create_campaign_brief(self, category: str, topics: list, count: int) -> dict:
        """
        One fast LLM call that assigns a unique content angle to each post in the batch.
        Returns {"series_tone": str, "assignments": [{"post_index": int, "angle": str, "angle_rationale": str}]}
        Falls back to programmatic angle assignment if JSON parse fails.
        """
        angle_list = list(itertools.islice(itertools.cycle(CAMPAIGN_ANGLES), count))
        topic_lines = "\n".join(f"{i+1}. {t['title']}" for i, t in enumerate(topics[:count]))
        angles_csv  = ", ".join(CAMPAIGN_ANGLES)

        prompt = ChatPromptTemplate.from_messages([
            ("system",
             "You are an elite social media campaign strategist. "
             "You receive a list of news topics and assign one unique angle to each post "
             "so the content series feels varied and non-repetitive. "
             "Respond with ONLY a valid JSON object — no markdown fences, no prose outside JSON."),
            ("human",
             f"Category: {category}\n\n"
             f"Topics:\n{topic_lines}\n\n"
             f"Assign one angle from this exact list to each topic: {angles_csv}\n\n"
             f'Return JSON with this structure exactly: '
             f'{{"series_tone": "string", "assignments": [{{"post_index": 0, "angle": "string", "angle_rationale": "string"}}]}}'
            )
        ])

        try:
            raw = retry(lambda: (prompt | self.llm | StrOutputParser()).invoke({}))
            clean = re.sub(r"```(?:json)?|```", "", raw).strip()
            brief = json.loads(clean)
            # Validate structure
            if "assignments" not in brief or not isinstance(brief["assignments"], list):
                raise ValueError("Missing assignments")
            return brief
        except Exception as e:
            log.warning("Campaign brief LLM failed (%s) — using programmatic fallback", e)
            return {
                "series_tone": "authoritative and analytical",
                "assignments": [
                    {"post_index": i, "angle": angle_list[i], "angle_rationale": "auto-assigned"}
                    for i in range(count)
                ]
            }

    async def stream_batch_generate(
        self,
        category: str,
        count: int = 3,
        include_9x16: bool = False,
        include_hook: bool = False,
        include_category: bool = False,
        freshness: str = "2days",
    ):
        """
        Async generator — yields SSE-formatted strings ('data: {...}\\n\\n').
        Wrapped by FastAPI StreamingResponse in api.py.

        Event sequence:
          campaign_brief  — once (before any post starts)
          post_started    — once per post
          web_fetched     — once per post (Tavily done)
          post_chunk      — N times per post (LLM token stream)
          post_completed  — once per post (full parsed content)
          post_error      — if a single post fails (batch continues)
          batch_done      — once at the very end
        """
        import storage as _storage

        loop = asyncio.get_running_loop()

        def sse(obj: dict) -> str:
            return f"data: {json.dumps(obj)}\n\n"

        # ── Step 1: Fetch trending topics (sync → executor) ────────────────────
        try:
            topics = await loop.run_in_executor(
                None, lambda: self.get_trending(category, freshness=freshness)
            )
        except Exception as e:
            yield sse({"type": "post_error", "post_index": -1, "error": classify_error(e)})
            yield sse({"type": "batch_done"})
            return

        topics = topics[:count]
        if not topics:
            yield sse({"type": "post_error", "post_index": -1,
                       "error": f"No trending topics found for '{category}'. Try a different category."})
            yield sse({"type": "batch_done"})
            return

        # ── Step 2: Campaign Brief (sync → executor) ─────────────────────────
        try:
            brief = await loop.run_in_executor(
                None, lambda: self.create_campaign_brief(category, topics, len(topics))
            )
        except Exception:
            brief = {
                "series_tone": "authoritative and analytical",
                "assignments": [
                    {"post_index": i, "angle": CAMPAIGN_ANGLES[i % len(CAMPAIGN_ANGLES)],
                     "angle_rationale": "auto-assigned"}
                    for i in range(len(topics))
                ]
            }

        angle_map = {a["post_index"]: a for a in brief.get("assignments", [])}
        yield sse({
            "type":        "campaign_brief",
            "series_tone": brief.get("series_tone", ""),
            "assignments": brief.get("assignments", []),
            "topics":      [{"title": t["title"], "url": t.get("url", "")} for t in topics],
        })

        # ── Step 3: Generate each post ─────────────────────────────────────────
        system_base = load_instagram_prompt(
            include_hook=include_hook,
            include_category=include_category,
            include_9x16=include_9x16,
            freshness=freshness,
        )
        citation_rule = (
            "\n\nCRITICAL SOURCE RULE: Every fact MUST come from the research context above. "
            "Each source is labeled [SOURCE: Publisher | url]. Cite inline like 'per Reuters'. "
            "If a fact is NOT in the context — do NOT include it. No fabrication."
        )

        for i, topic_item in enumerate(topics):
            assignment = angle_map.get(i, {
                "angle": CAMPAIGN_ANGLES[i % len(CAMPAIGN_ANGLES)],
                "angle_rationale": ""
            })
            angle      = assignment.get("angle", CAMPAIGN_ANGLES[i % len(CAMPAIGN_ANGLES)])
            angle_note = ANGLE_PROMPTS.get(angle, "")

            yield sse({
                "type":       "post_started",
                "post_index": i,
                "angle":      angle,
                "topic":      topic_item["title"],
            })

            # Web fetch (sync → executor)
            try:
                raw_results, sources_meta, tavily_answer = await loop.run_in_executor(
                    None,
                    lambda t=topic_item: self._fetch_web_elite(
                        build_search_query(t["title"], freshness),
                        freshness=freshness,
                        is_news=True,
                    )
                )
            except Exception as e:
                yield sse({"type": "post_error", "post_index": i,
                           "error": classify_error(e), "topic": topic_item["title"]})
                continue

            yield sse({"type": "web_fetched", "post_index": i, "source_count": len(sources_meta)})

            # Build context
            if not raw_results:
                context = f"Topic: {topic_item['title']}\nNo verified sources found."
            else:
                context = build_sourced_context(raw_results)
                if tavily_answer:
                    context = f"[TAVILY VERIFIED SUMMARY]\n{tavily_answer}\n\n---\n\n{context}"

            # Angle-injected system prompt
            d = get_date_strings()
            angle_injection = (
                f"\n\n--- CAMPAIGN DIRECTIVE ---\n"
                f"This is post {i + 1} of {len(topics)} in the '{category}' series.\n"
                f"Assigned angle: {angle.upper().replace('_', ' ')}.\n"
                f"Angle instruction: {angle_note}\n"
                f"Series tone: {brief.get('series_tone', 'authoritative')}.\n"
                f"Today's date: {d['today']}.\n"
                f"--- END DIRECTIVE ---"
            )
            system_final = system_base + angle_injection + citation_rule

            prompt = ChatPromptTemplate.from_messages([
                ("system", system_final),
                ("human", "forge a post about {question}\n\nResearch context:\n{context}")
            ])
            chain = prompt | self.llm | StrOutputParser()

            # Token streaming
            full_text = ""
            try:
                async for chunk in chain.astream(
                    {"question": topic_item["title"], "context": context}
                ):
                    full_text += chunk
                    yield sse({"type": "post_chunk", "post_index": i, "text": chunk})
            except asyncio.CancelledError:
                log.info("SSE stream cancelled by client during post %d.", i)
                raise
            except Exception as e:
                yield sse({"type": "post_error", "post_index": i,
                           "error": classify_error(e), "topic": topic_item["title"]})
                continue

            # Parse & save
            parsed       = parse_code_blocks(full_text)
            parsed["raw"] = full_text
            cfg_label     = FRESHNESS_CONFIG.get(freshness, FRESHNESS_CONFIG["2days"])["label"]

            try:
                post_id = await loop.run_in_executor(
                    None,
                    lambda p=parsed, sm=sources_meta, ti=topic_item: _storage.save_post(
                        ti["title"], "instagram", p, sm
                    )
                )
            except Exception:
                post_id = None

            yield sse({
                "type":           "post_completed",
                "post_index":     i,
                "angle":          angle,
                "content":        parsed,
                "sources":        sources_meta,
                "freshness":      cfg_label,
                "original_topic": topic_item["title"],
                "source_url":     topic_item.get("url", ""),
                "post_id":        post_id,
            })

        yield sse({"type": "batch_done"})
