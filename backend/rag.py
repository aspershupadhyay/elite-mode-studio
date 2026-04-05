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
import database as _db

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
FAISS_INDEX_PATH  = os.path.join(os.path.dirname(__file__), "data", "faiss_index")
MAX_CONTEXT_CHARS = 16_000

# ── Load / save search config ─────────────────────────────────────────────────
_DEFAULT_CONFIG = {
    "tavily": {
        "search_depth": "advanced",
        "max_results": 20,
        "chunks_per_source": 5,
        "include_answer": "advanced",
        "time_range": "day",
        "topic": "news",
        "include_images": False,
        "include_raw_content": "markdown",
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
        "max_tokens": 2048,
        "top_n_rerank": 4
    },
    "output": {
        "title_min_length": 60,
        "title_max_length": 110,
        "include_hook": False,
        "include_category": False,
        "include_9x16": False,
        "include_sources_block": True,
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
        cfg["output"].update(saved.get("output", {}))
        if "persona" in saved:
            cfg["persona"] = saved["persona"]
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
    "AI & TECH": [
        "top AI artificial intelligence breakthrough {date}",
        "technology startup funding product launch {date}",
        "machine learning robotics software release {date}",
    ],
    "AUTOMOTIVE": [
        "top automotive car EV electric vehicle news {date}",
        "Tesla BMW Mercedes new model launch {date}",
        "self-driving autonomous vehicle industry {date}",
    ],
    "BEAUTY & FASHION": [
        "top beauty fashion trend style {date}",
        "luxury brand runway collection launch {date}",
        "skincare makeup influencer trend {date}",
    ],
    "BUSINESS": [
        "top business corporate strategy deal merger {date}",
        "CEO leadership company news earnings {date}",
        "startup entrepreneurship funding round {date}",
    ],
    "CLIMATE": [
        "top climate energy transition policy {date}",
        "renewable energy carbon emissions environment {date}",
        "climate disaster weather extreme event {date}",
    ],
    "CREATOR ECONOMY": [
        "top creator economy influencer brand deal {date}",
        "YouTube Instagram TikTok creator news {date}",
        "social media monetization platform update {date}",
    ],
    "CRYPTO": [
        "top cryptocurrency bitcoin ethereum {date}",
        "crypto blockchain defi regulation {date}",
        "altcoin NFT web3 exchange {date}",
    ],
    "CULTURE & ENTERTAINMENT": [
        "top entertainment culture pop music film {date}",
        "celebrity news awards show release {date}",
        "viral moment cultural trend {date}",
    ],
    "DEFENSE": [
        "top military defense conflict {date}",
        "army navy weapons pentagon NATO {date}",
        "warfare security threat intelligence {date}",
    ],
    "EDUCATION": [
        "top education learning university news {date}",
        "edtech online learning skill development {date}",
        "student career academic research {date}",
    ],
    "FINANCE": [
        "top global finance markets economy {date}",
        "stock market earnings central bank interest rates {date}",
        "recession inflation trade deal economy {date}",
    ],
    "FITNESS & HEALTH": [
        "top fitness health wellness trend {date}",
        "workout nutrition diet science {date}",
        "mental health wellbeing research {date}",
    ],
    "FOOD & BEVERAGE": [
        "top food beverage restaurant industry {date}",
        "chef cuisine recipe trend {date}",
        "food startup brand launch {date}",
    ],
    "GAMING": [
        "top gaming video game esports {date}",
        "PlayStation Xbox Nintendo PC game release {date}",
        "game studio funding esports tournament {date}",
    ],
    "GEOPOLITICS": [
        "top geopolitics breaking news {date} verified",
        "international diplomacy crisis conflict {date}",
        "world leaders summit war sanctions {date}",
    ],
    "MOTIVATION & MINDSET": [
        "top motivation mindset productivity self-improvement {date}",
        "success habits entrepreneur mindset {date}",
        "personal growth psychology discipline {date}",
    ],
    "MUSIC": [
        "top music artist album release chart {date}",
        "music industry streaming concert tour {date}",
        "new song drop music video release {date}",
    ],
    "REAL ESTATE": [
        "top real estate property market housing {date}",
        "mortgage interest rate housing prices {date}",
        "real estate investment commercial property {date}",
    ],
    "SCIENCE & SPACE": [
        "top science discovery research breakthrough {date}",
        "NASA SpaceX space exploration mission {date}",
        "biology physics chemistry discovery {date}",
    ],
    "SPORTS": [
        "top sports breaking news {date}",
        "football cricket basketball match result {date}",
        "athlete transfer deal championship {date}",
    ],
    "STARTUPS & VC": [
        "top startup venture capital funding round {date}",
        "unicorn IPO acquisition founder {date}",
        "seed series A B funding announcement {date}",
    ],
    "TRAVEL & LIFESTYLE": [
        "top travel destination lifestyle trend {date}",
        "tourism hotel airline luxury experience {date}",
        "travel visa policy destination guide {date}",
    ],
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

def build_trending_queries(category: str, freshness: str = "2days") -> list:
    d    = get_date_strings()
    date_tag = f"today {d['today']}" if freshness == "today" else \
               f"last 2 days {d['month']}" if freshness == "2days" else d["month"]
    templates = TRENDING_QUERIES.get(category, ["top {cat} news {date}"])
    return [t.format(date=date_tag, cat=category) for t in templates]

def build_trending_query(category: str, freshness: str = "2days") -> str:
    return build_trending_queries(category, freshness)[0]


def classify_error(e: Exception) -> str:
    msg = str(e)
    if "502" in msg or "Bad Gateway" in msg:   return "NVIDIA API gateway error (502). Wait 30s and retry."
    if "401" in msg or "invalid api key" in msg.lower(): return "Invalid API key. Check Settings."
    if "403" in msg or "forbidden" in msg.lower(): return "Access denied (403). Check your API key permissions."
    if "404" in msg and "not found for account" in msg.lower(): return "NVIDIA model not available on your account. Go to Settings → AI Models and select a different LLM (e.g. meta/llama-3.3-70b-instruct)."
    if "404" in msg or msg.strip() == "Not Found": return "API endpoint not found (404). Check your API keys in Settings."
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

# ── Filler words for highlight_words post-processing ─────────────────────────
_FILLER = {
    "the","a","an","in","to","of","and","but","for","with","by","on","at","is","are",
    "has","have","been","that","this","it","as","or","not","no","all","its","now",
    "from","after","was","were","be","will","can","may","their","there","then","than",
    "when","where","how","who","which","what","up","out","over","new","so","if","do",
    "into","just","also","about","more","amid","vs","despite","before","during","since",
    "within","across","under","against","per","via","off","other","many","much","well",
    "still","back","could","should","would","both","each","between","through","only",
}

def clean_highlight_words(raw: str, title: str) -> str:
    """Filter comma-separated highlight_words: remove filler, keep title-present words, return top 4-5 UPPER."""
    title_upper = title.upper()
    title_words = set(re.findall(r"[A-Z0-9$\u20ac\xa3%\']+", title_upper))
    candidates = [w.strip().upper() for w in raw.split(",") if w.strip()]
    candidates = [w for w in candidates if w in title_words and w.lower() not in _FILLER]
    seen, filtered = set(), []
    for w in candidates:
        if w not in seen:
            seen.add(w); filtered.append(w)
    if len(filtered) < 4:
        def score(w):
            if re.search(r'[0-9$\u20ac\xa3%]', w): return 3
            if len(w) >= 5: return 2
            return 1
        pool = [w for w in re.findall(r"[A-Z0-9$\u20ac\xa3%\']+", title_upper)
                if w.lower() not in _FILLER and w not in seen]
        for w in sorted(set(pool), key=score, reverse=True):
            if len(filtered) >= 5: break
            filtered.append(w); seen.add(w)
    return ", ".join(filtered[:5])


# ═════════════════════════════════════════════════════════════════════════════
# Generic XML-based content engine — zero hardcoding
# ═════════════════════════════════════════════════════════════════════════════

def build_xml_system_prompt(
    system_prompt: str,
    output_fields: list,
    tone: str = "",
    language: str = "en",
    post_count: int = 1,
    search_enabled: bool = True,
    custom_instructions: str = "",
    freshness: str = "2days",
    title_min_length: int = 60,
    title_max_length: int = 110,
) -> str:
    """
    Assemble the full system prompt from the user's profile.
    system_prompt  — user-written, owns the persona/rules/style.
    output_fields  — list of {id, label, aiHint, type, enabled} dicts.
    Instructs the AI to wrap each field in <field_id>...</field_id> XML tags.
    Robust to code blocks, long captions, special characters.
    """
    # ── Resolve dynamic placeholders in the user's system prompt ─────────────
    # These are injected by the backend (not user content). Any prompt — whether
    # the built-in Elite Mode instruction or a completely custom user-written one —
    # can optionally include these placeholders. If the user's prompt doesn't use
    # them, the replacements are no-ops. If they do use them, they resolve correctly
    # regardless of what persona or use case the user has written.
    #
    # Must run BEFORE the LangChain-escape step at the bottom of this function
    # (which turns all remaining {X} into {{X}}), otherwise placeholders never resolve.
    date_rule = build_date_rule(freshness)
    resolved = system_prompt.strip()
    resolved = resolved.replace('{DATE_RULE}',      date_rule or '')
    resolved = resolved.replace('{TITLE_MIN_LEN}',  str(title_min_length))
    resolved = resolved.replace('{TITLE_MAX_LEN}',  str(title_max_length))
    # Optional output-block placeholders — these are Elite Mode specific.
    # Other use-cases that don't include these placeholders are unaffected.
    resolved = resolved.replace('{HOOK_BLOCK}',     '')
    resolved = resolved.replace('{PORTRAIT_BLOCK}', '')
    resolved = resolved.replace('{CATEGORY_BLOCK}', '')

    parts = [resolved]

    # Date freshness rule — append only if NOT already embedded via {DATE_RULE}
    if date_rule and '{DATE_RULE}' not in system_prompt:
        parts.append(f"\n## DATE RULE\n{date_rule}")

    # Tone directive
    if tone and tone.strip():
        parts.append(f"\n## TONE\nWrite in a {tone.strip()} tone throughout.")

    # Language directive
    if language and language != "en":
        parts.append(f"\n## LANGUAGE\nWrite all output in language code: {language}. Do not mix languages.")

    # Title length constraint
    parts.append(f"\n## TITLE LENGTH\nEvery title must be between {title_min_length} and {title_max_length} characters. Enforce strictly.")

    # Custom instructions (user override, highest priority)
    if custom_instructions and custom_instructions.strip():
        parts.append(f"\n## CUSTOM INSTRUCTIONS (FOLLOW EXACTLY)\n{custom_instructions.strip()}")

    # XML output format
    enabled = [f for f in output_fields if f.get("enabled", True)]
    if enabled:
        lines = [
            "\n## OUTPUT FORMAT",
            f"Generate exactly {post_count} post{'s' if post_count != 1 else ''}.",
            "",
            "Wrap EVERY field in XML tags exactly as shown below.",
            "Do NOT add any text, commentary, or explanation outside the XML tags.",
            "For code examples, wrap code in triple-backtick fences inside the XML tag.",
            "Do not escape or encode the tag names.",
            "",
        ]
        if post_count > 1:
            lines.append("<posts>")
            lines.append("  <post>")
        for f in enabled:
            fid   = f.get("id") or f.get("key", "")
            hint  = f.get("aiHint") or f.get("instruction", "")
            label = f.get("label", fid)
            indent = "    " if post_count > 1 else ""
            lines.append(f"{indent}<{fid}>")
            hint_str = f": {hint}" if hint else ""
            lines.append(f"{indent}  [{label}{hint_str}]")
            lines.append(f"{indent}</{fid}>")
        if post_count > 1:
            lines.append("  </post>")
            lines.append("  ... (repeat <post>...</post> block for each post)")
            lines.append("</posts>")
        lines += [
            "",
            "After all XML output, append:",
            "SOURCES",
            "- bullet list of sources used",
            "",
            "CONFIDENCE: HIGH | MEDIUM | LOW",
        ]
        parts.append("\n".join(lines))

    if not search_enabled:
        parts.append("\n## NOTE\nWeb search is disabled. Base response on training knowledge only.")

    full = "\n".join(parts)
    # Escape { } so LangChain never treats content as template variables
    full = re.sub(r'\{([A-Za-z_][A-Za-z0-9_]*)\}', r'{{\1}}', full)
    return full


def parse_xml_response(text: str, field_ids: list) -> dict:
    """
    Robust XML field extractor.

    For each field_id:
      - Tries <field_id>...</field_id> with re.DOTALL (handles multiline, code blocks,
        special chars, angle brackets inside code fences).
      - Missing fields return empty string — never raises.
    Also extracts SOURCES block and CONFIDENCE level.
    Post-processes highlight_words if both highlight_words and title are present.
    """
    result: dict = {}

    for fid in field_ids:
        pattern = rf"<{re.escape(fid)}>\s*(.*?)\s*</{re.escape(fid)}>"
        m = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
        result[fid] = m.group(1).strip() if m else ""

    # Sources block
    src_m = re.search(r"SOURCES\s*\n(.*?)(?=\nCONFIDENCE:|$)", text, re.DOTALL)
    result["sources_block"] = src_m.group(1).strip() if src_m else ""

    # Confidence
    conf_m = re.search(r"CONFIDENCE:\s*(HIGH|MEDIUM|LOW)", text, re.IGNORECASE)
    result["confidence"] = conf_m.group(1).upper() if conf_m else ""

    # Post-process highlight_words
    if result.get("highlight_words") and result.get("title"):
        result["highlight_words"] = clean_highlight_words(
            result["highlight_words"], result["title"]
        )

    return result


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
        title   = r.get("title", "").strip()
        content = (r.get("raw_content") or r.get("content") or title).strip()
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
        # Read keys directly from os.environ so a load_dotenv(override=True) reload
        # is picked up correctly when the pipeline is reinitialized after a key update.
        _nvidia_key  = os.environ.get("NVIDIA_API_KEY", "")
        _tavily_key  = os.environ.get("TAVILY_API_KEY", "")
        self.llm      = ChatNVIDIA(model=cfg["llm_model"],    api_key=_nvidia_key, max_completion_tokens=cfg["max_tokens"])
        self.embedder = NVIDIAEmbeddings(model=cfg["embed_model"],   api_key=_nvidia_key, truncate="END")
        self.reranker = NVIDIARerank(model=cfg["rerank_model"],      api_key=_nvidia_key, top_n=cfg["top_n_rerank"])
        self.tavily   = TavilyClient(api_key=_tavily_key)
        self.vectorstore  = None
        # Try to load persisted FAISS index from disk
        if os.path.isdir(FAISS_INDEX_PATH):
            try:
                self.vectorstore = FAISS.load_local(FAISS_INDEX_PATH, self.embedder, allow_dangerous_deserialization=True)
                log.info("FAISS index loaded from disk (%s).", FAISS_INDEX_PATH)
            except Exception as _e:
                log.warning("Could not load persisted FAISS index: %s", _e)
                self.vectorstore = None
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

    def _fetch_web_elite(self, query: str, freshness: str = "2days", is_news: bool = True, max_results_override: int = None) -> tuple:
        """
        Full Tavily v2 search with all advanced parameters.
        Config comes from search_config.json — fully user-customisable.
        """
        cfg = self._cfg_cache["tavily"]  # use in-memory cache, not a fresh disk read
        start_date, end_date = get_date_range(freshness)

        kwargs = dict(
            query               = query,
            search_depth        = cfg.get("search_depth", "advanced"),
            max_results         = max_results_override if max_results_override is not None else cfg.get("max_results", 20),
            chunks_per_source   = cfg.get("chunks_per_source", 5),
            include_answer      = cfg.get("include_answer", "advanced"),
            include_raw_content = cfg.get("include_raw_content", "markdown"),
            include_images      = cfg.get("include_images", False),
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

        # topic: if is_news, force "news" unless user has set "finance" or "general" explicitly
        cfg_topic = cfg.get("topic", "news")
        if is_news:
            kwargs["topic"] = cfg_topic if cfg_topic in ("news", "finance") else "news"
        elif cfg_topic == "finance":
            kwargs["topic"] = "finance"

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
            content = r.get("raw_content") or r.get("content") or r.get("title", "")
            if content:
                for c in self.splitter.split_text(content):
                    web_docs.append(Document(page_content=c,
                        metadata={"url": r.get("url",""), "title": r.get("title","")}))
        # Fallback: domain whitelist may have blocked all results — retry without it
        if not web_docs and self._cfg_cache["tavily"].get("include_domains"):
            log.warning("Domain filter yielded no web docs for '%s'. Retrying without domain filter.", query[:60])
            raw, sources, _ = self._fetch_web_elite(
                query, freshness=freshness, is_news=False,
                max_results_override=self._cfg_cache["tavily"].get("max_results", 10)
            )
            for r in raw:
                content = r.get("raw_content") or r.get("content") or r.get("title", "")
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
        try:
            os.makedirs(FAISS_INDEX_PATH, exist_ok=True)
            self.vectorstore.save_local(FAISS_INDEX_PATH)
            log.info("FAISS index saved to disk.")
        except Exception as _e:
            log.warning("Could not save FAISS index to disk: %s", _e)
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

    def generate_content(
        self,
        topic: str,
        system_prompt: str,
        output_fields: list,
        tone: str = "",
        language: str = "en",
        post_count: int = 1,
        search_enabled: bool = True,
        custom_instructions: str = "",
        freshness: str = "2days",
        title_min_length: int = 60,
        title_max_length: int = 110,
    ) -> dict:
        """
        Generic content generator — fully driven by the caller's profile.
        system_prompt    — user-written full system prompt (no hardcoded base).
        output_fields    — list of {id, label, aiHint, type, enabled} dicts.
        Returns {"content": {field_id: value, ...}, "sources": [...], "freshness": str}
        """
        cfg_label    = FRESHNESS_CONFIG.get(freshness, FRESHNESS_CONFIG["2days"])["label"]
        field_ids    = [f.get("id") or f.get("key","") for f in output_fields if f.get("enabled", True)]

        # Web search
        if search_enabled:
            query = build_search_query(topic, freshness)
            raw_results, sources_meta, tavily_answer = self._fetch_web_elite(
                query, freshness=freshness, is_news=True
            )
            context = build_sourced_context(raw_results) if raw_results else ""
            # Fallback: if domain whitelist produced no usable content, retry without it
            if not context and self._cfg_cache["tavily"].get("include_domains"):
                log.warning("Domain filter yielded no content for '%s'. Retrying without domain filter.", topic)
                raw_results, sources_meta, tavily_answer = self._fetch_web_elite(
                    query, freshness=freshness, is_news=False,
                    max_results_override=self._cfg_cache["tavily"].get("max_results", 10)
                )
                context = build_sourced_context(raw_results) if raw_results else ""
            if not context:
                log.warning("No usable content for '%s'.", topic)
                context = f"Topic: {topic}\nNo verified sources found. Use your training knowledge."
            elif tavily_answer:
                context = f"[TAVILY VERIFIED SUMMARY]\n{tavily_answer}\n\n---\n\n{context}"
        else:
            sources_meta = []
            context = f"Topic: {topic}\nWeb search is disabled. Use your training knowledge."

        system = build_xml_system_prompt(
            system_prompt       = system_prompt,
            output_fields       = output_fields,
            tone                = tone,
            language            = language,
            post_count          = post_count,
            search_enabled      = search_enabled,
            custom_instructions = custom_instructions,
            freshness           = freshness,
            title_min_length    = title_min_length,
            title_max_length    = title_max_length,
        )
        citation_rule = (
            "\n\nSOURCE RULE: Every fact MUST come from the research context above. "
            "Each source is labeled [SOURCE: Publisher | url]. Cite inline. "
            "Do NOT fabricate facts not present in the context."
        ) if search_enabled else ""

        log.info("Generating: '%s' | freshness=%s | sources=%d | fields=%s",
                 topic, freshness, len(sources_meta), field_ids)

        _sys = system + citation_rule  # already escaped by build_xml_system_prompt
        prompt = ChatPromptTemplate.from_messages([
            ("system", _sys),
            ("human",  "Generate content about: {question}\n\nResearch context:\n{context}")
        ])
        raw    = retry(lambda: (prompt | self.llm | StrOutputParser())
                       .invoke({"question": topic, "context": context}))
        parsed = parse_xml_response(raw, field_ids)
        parsed["raw"] = raw
        return {"content": parsed, "sources": sources_meta, "freshness": cfg_label}

    def generate_instagram(self, topic: str, include_9x16=False, include_hook=False,
                           include_category=False, freshness="2days",
                           persona="journalist", tone="analytical",
                           platform_target="instagram", caption_length="medium",
                           custom_instructions="",
                           title_min_length=50, title_max_length=100) -> dict:
        """Legacy wrapper — routes through generate_content with a sensible default profile."""
        default_fields = [
            {"id": "title",           "label": "Title",           "aiHint": "Punchy headline. Must contain at least one number.", "type": "text",  "enabled": True},
            {"id": "highlight_words", "label": "Highlight Words", "aiHint": "4-5 high-signal words from the title. Comma-separated.", "type": "text", "enabled": True},
            {"id": "caption",         "label": "Caption",         "aiHint": "800-1200 character social media caption with inline source citations.", "type": "text", "enabled": True},
            {"id": "image_prompt_1x1","label": "Image Prompt",    "aiHint": "Photorealistic editorial image prompt. No text in image.", "type": "image_prompt", "enabled": True},
        ]
        default_system = (
            "You are an expert social media content creator. "
            "Create high-quality, factual, engaging content based on the research provided. "
            "Every claim must be backed by the sources in the research context."
        )
        return self.generate_content(
            topic             = topic,
            system_prompt     = default_system,
            output_fields     = default_fields,
            tone              = tone,
            search_enabled    = True,
            custom_instructions = custom_instructions,
            freshness         = freshness,
        )

    def get_trending(self, category: str, freshness: str = "2days", count: int = 20) -> list:
        queries = build_trending_queries(category, freshness)
        seen_titles = set()
        topics = []

        for query in queries:
            if len(topics) >= count:
                break
            try:
                raw, _, _ = self._fetch_web_elite(
                    query, freshness=freshness, is_news=True,
                    max_results_override=20,
                )
            except Exception:
                continue
            for r in raw:
                if len(topics) >= count:
                    break
                title = r.get("title", "").strip()
                key = title.lower()[:60]
                if title and len(title) > 10 and key not in seen_titles:
                    seen_titles.add(key)
                    topics.append({
                        "title":     title,
                        "url":       r.get("url", ""),
                        "publisher": _extract_publisher(r.get("url", "")),
                        "snippet":   r.get("content", "")[:200],
                    })

        return topics

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

        human_msg = (
            f"Category: {category}\n\n"
            f"Topics:\n{topic_lines}\n\n"
            f"Assign one angle from this exact list to each topic: {angles_csv}\n\n"
            'Return JSON with this structure exactly: '
            '{"series_tone": "string", "assignments": [{"post_index": 0, "angle": "string", "angle_rationale": "string"}]}'
        )

        prompt = ChatPromptTemplate.from_messages([
            ("system",
             "You are an elite social media campaign strategist. "
             "You receive a list of news topics and assign one unique angle to each post "
             "so the content series feels varied and non-repetitive. "
             "Respond with ONLY a valid JSON object — no markdown fences, no prose outside JSON."),
            ("human", "{input}"),
        ])

        try:
            raw = retry(lambda: (prompt | self.llm | StrOutputParser()).invoke({"input": human_msg}))
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
        topics: list | None = None,
        include_9x16: bool = False,
        include_hook: bool = False,
        include_category: bool = False,
        freshness: str = "2days",
        persona: str = "journalist",
        tone: str = "analytical",
        platform_target: str = "instagram",
        caption_length: str = "medium",
        custom_instructions: str = "",
        title_min_length: int = 50,
        title_max_length: int = 100,
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
        import dedup as _dedup

        loop = asyncio.get_running_loop()

        def sse(obj: dict) -> str:
            return f"data: {json.dumps(obj)}\n\n"

        # ── Step 0: Init dedup store (create DB, cleanup expired) ──────────────
        await loop.run_in_executor(None, _dedup.init)

        # ── Step 1: Resolve topics then deduplicate ────────────────────────────
        if topics:
            # User-provided topics — use exactly as-is, skip dedup entirely.
            # Dedup exists to prevent re-generating the same trending news stories;
            # it must never intercept or replace explicit user queries.
            # If fewer topics than count (e.g. 1 topic, count=3), repeat the topic
            # so all N posts are generated on the same subject with different angles.
            base = [{"title": t, "url": ""} for t in topics]
            resolved_topics = (base * count)[:count] if len(base) < count else base[:count]
        else:
            try:
                # Fetch enough candidates for dedup to work with (2x headroom)
                raw_topics = await loop.run_in_executor(
                    None, lambda: self.get_trending(category, freshness=freshness, count=count * 2)
                )
            except Exception as e:
                yield sse({"type": "post_error", "post_index": -1, "error": classify_error(e)})
                yield sse({"type": "batch_done"})
                return

            if not raw_topics:
                yield sse({"type": "post_error", "post_index": -1,
                           "error": f"No trending topics found for '{category}'. Try a different category."})
                yield sse({"type": "batch_done"})
                return

            # Run dedup pipeline — gates 1, 2, 3 as needed
            dedup_result = await loop.run_in_executor(
                None,
                lambda: _dedup.filter_topics(
                    raw_topics=raw_topics,
                    target=count,
                    category=category,
                    freshness=freshness,
                    llm=self.llm,
                    get_trending_fn=self.get_trending,
                )
            )

            resolved_topics = dedup_result["approved"]

            if not resolved_topics:
                yield sse({"type": "post_error", "post_index": -1,
                           "error": dedup_result.get("message") or "No unique topics found after deduplication."})
                yield sse({"type": "batch_done"})
                return

            # If shortfall, notify frontend but continue with what we have
            if dedup_result["shortfall"] > 0:
                yield sse({"type": "shortfall_notice",
                           "message": dedup_result["message"],
                           "found": len(resolved_topics),
                           "requested": count})

        topics = resolved_topics

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
        # Cache web results per unique query so repeated topics (same user topic, N posts)
        # don't hammer Tavily N times with the identical query.
        _web_cache: dict = {}

        # Build XML system prompt once for the batch using caller-supplied profile args
        default_fields = [
            {"id": "title",           "label": "Title",           "aiHint": "Punchy headline.", "type": "text",         "enabled": True},
            {"id": "highlight_words", "label": "Highlight Words", "aiHint": "4-5 high-signal words from the title, comma-separated.", "type": "text", "enabled": True},
            {"id": "caption",         "label": "Caption",         "aiHint": "800-1200 character social media caption.", "type": "text",         "enabled": True},
            {"id": "image_prompt_1x1","label": "Image Prompt",    "aiHint": "Photorealistic editorial image prompt. No text in image.", "type": "image_prompt", "enabled": True},
        ]
        _output_fields = getattr(self, '_batch_output_fields', default_fields)
        _system_prompt = getattr(self, '_batch_system_prompt',
            "You are an expert social media content creator. "
            "Create high-quality, factual, engaging content based on the research provided. "
            "Every claim must be backed by the sources in the research context."
        )
        _tone             = getattr(self, '_batch_tone', tone)
        _custom_instr     = getattr(self, '_batch_custom_instructions', custom_instructions)
        _title_min        = getattr(self, '_batch_title_min_length', 60)
        _title_max        = getattr(self, '_batch_title_max_length', 110)
        # "news" = Tavily news topic (time-sensitive stories)
        # "general" = Tavily general web search (evergreen facts, profiles, stats)
        _is_news          = getattr(self, '_batch_search_mode', 'news') == 'news'
        field_ids         = [f.get("id") or f.get("key","") for f in _output_fields if f.get("enabled", True)]

        system_base = build_xml_system_prompt(
            system_prompt       = _system_prompt,
            output_fields       = _output_fields,
            tone                = _tone,
            search_enabled      = True,
            custom_instructions = _custom_instr,
            freshness           = freshness,
            title_min_length    = _title_min,
            title_max_length    = _title_max,
        )
        citation_rule = (
            "\n\nSOURCE RULE: Every fact MUST come from the research context. "
            "Each source is labeled [SOURCE: Publisher | url]. Cite inline. No fabrication."
        )

        for i, topic_item in enumerate(topics):
            log.info("Post %d/%d starting: '%s'", i + 1, len(topics), topic_item["title"][:60])
            try:
                assignment = angle_map.get(i, {
                    "angle": CAMPAIGN_ANGLES[i % len(CAMPAIGN_ANGLES)],
                    "angle_rationale": ""
                })
                angle      = assignment.get("angle", CAMPAIGN_ANGLES[i % len(CAMPAIGN_ANGLES)])
                angle_note = ANGLE_PROMPTS.get(angle, "")
            except Exception as e:
                log.error("Post %d angle assignment failed: %s", i, e)
                angle      = CAMPAIGN_ANGLES[i % len(CAMPAIGN_ANGLES)]
                angle_note = ANGLE_PROMPTS.get(angle, "")

            yield sse({
                "type":       "post_started",
                "post_index": i,
                "angle":      angle,
                "topic":      topic_item["title"],
            })

            try:
                # ── Web fetch (cache repeated queries) ──────────────────────
                _query = build_search_query(topic_item["title"], freshness)
                if _query in _web_cache:
                    raw_results, sources_meta, tavily_answer, context = _web_cache[_query]
                    log.info("Web cache hit for post %d: '%s'", i, _query[:60])
                else:
                    try:
                        raw_results, sources_meta, tavily_answer = await loop.run_in_executor(
                            None,
                            lambda t=topic_item: self._fetch_web_elite(
                                build_search_query(t["title"], freshness),
                                freshness=freshness,
                                is_news=_is_news,
                            )
                        )
                    except Exception as e:
                        yield sse({"type": "post_error", "post_index": i,
                                   "error": classify_error(e), "topic": topic_item["title"]})
                        continue

                    context = build_sourced_context(raw_results) if raw_results else ""
                    if not context and raw_results and self._cfg_cache["tavily"].get("include_domains"):
                        log.warning("Domain filter yielded no content for '%s'. Retrying without.", topic_item["title"][:60])
                        try:
                            raw_results, sources_meta, tavily_answer = await loop.run_in_executor(
                                None,
                                lambda t=topic_item: self._fetch_web_elite(
                                    build_search_query(t["title"], freshness),
                                    freshness=freshness, is_news=False,
                                    max_results_override=self._cfg_cache["tavily"].get("max_results", 10),
                                )
                            )
                            context = build_sourced_context(raw_results) if raw_results else ""
                        except Exception:
                            pass
                    if not context:
                        context = f"Topic: {topic_item['title']}\nNo verified sources found."
                    elif tavily_answer:
                        context = f"[TAVILY VERIFIED SUMMARY]\n{tavily_answer}\n\n---\n\n{context}"
                    _web_cache[_query] = (raw_results, sources_meta, tavily_answer, context)

                yield sse({"type": "web_fetched", "post_index": i, "source_count": len(sources_meta)})

                # ── Build prompt ─────────────────────────────────────────────
                d = get_date_strings()
                angle_injection = (
                    f"\n\n--- CAMPAIGN DIRECTIVE ---\n"
                    f"This is post {i + 1} of {len(topics)} in the '{category}' series.\n"
                    f"Assigned angle: {str(angle).upper().replace('_', ' ')}.\n"
                    f"Angle instruction: {angle_note}\n"
                    f"Series tone: {brief.get('series_tone', 'authoritative')}.\n"
                    f"Today's date: {d['today']}.\n"
                    f"--- END DIRECTIVE ---"
                )
                _sys_final = system_base + angle_injection + citation_rule
                prompt = ChatPromptTemplate.from_messages([
                    ("system", _sys_final),
                    ("human", "Generate content about: {question}\n\nResearch context:\n{context}")
                ])
                chain = prompt | self.llm | StrOutputParser()

                # ── Token streaming ──────────────────────────────────────────
                full_text = ""
                try:
                    async for chunk in chain.astream(
                        {"question": topic_item["title"], "context": context}
                    ):
                        full_text += chunk
                        yield sse({"type": "post_chunk", "post_index": i, "text": chunk})
                except asyncio.CancelledError:
                    log.info("SSE stream cancelled during post %d.", i)
                    raise
                except Exception as e:
                    log.error("LLM streaming failed for post %d: %s", i, e)
                    yield sse({"type": "post_error", "post_index": i,
                               "error": classify_error(e), "topic": topic_item["title"]})
                    continue

                # ── Parse & save ─────────────────────────────────────────────
                parsed        = parse_xml_response(full_text, field_ids)
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

                try:
                    await loop.run_in_executor(
                        None,
                        lambda ti=topic_item, pid=post_id, ang=angle: _dedup.record_post(
                            post_id    = pid or f"local_{i}",
                            title      = ti["title"],
                            url        = ti.get("url", ""),
                            signature  = ti.get("_dedup_signature", ""),
                            cluster_id = ti.get("_dedup_cluster_id", ""),
                            angle_type = ang,
                        )
                    )
                except Exception as _dedup_err:
                    log.warning("dedup record_post failed (non-fatal): %s", _dedup_err)

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
                log.info("Post %d/%d completed.", i + 1, len(topics))

            except asyncio.CancelledError:
                raise
            except Exception as e:
                log.error("Unhandled error in post %d/%d: %s", i + 1, len(topics), e, exc_info=True)
                yield sse({"type": "post_error", "post_index": i,
                           "error": classify_error(e), "topic": topic_item["title"]})

        yield sse({"type": "batch_done"})
