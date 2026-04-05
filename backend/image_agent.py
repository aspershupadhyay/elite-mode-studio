"""
image_agent.py — ChatGPT image generation via CDP (Playwright).

Connects to an already-logged-in Brave browser on port 9222,
opens the configured ChatGPT image GPT, submits a prompt,
intercepts the generated image URL from the network layer,
downloads + quality-gates it, and returns the image as base64.

Designed to run in a thread executor from FastAPI so the async
event loop is never blocked.
"""

import time, io, base64, random, math
import numpy as np
from PIL import Image as PILImage
from playwright.sync_api import sync_playwright, Page

# ── Configuration (mirrors instagram_automation/config.py) ────────────────────

BRAVE_EXECUTABLE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
DEBUG_PORT       = 9222
CHATGPT_URL      = "https://chatgpt.com/g/g-p-695fa0174ec88191a103a44f86864e61-image-generation/project"

# ── Selectors ─────────────────────────────────────────────────────────────────

STOP_BUTTON  = 'button[data-testid="stop-button"]'
INPUT_BOX    = '#prompt-textarea'
MODAL_SEL    = '[data-testid="modal-personality-onboarding"]'
IMAGE_SELECTORS = [
    'img[alt="Generated image"]',
    'img[alt="generated image"]',
    'img[alt*="Generated"]',
    'img[src*="oaiusercontent.com"]',
    'img[src*="files.oaiusercontent"]',
]
_CDN_PATTERNS = ("oaiusercontent.com", "files.oaiusercontent", "openai.com/backend-api")

# ── Quality gates ─────────────────────────────────────────────────────────────

MIN_KB        = 200    # generated images are typically 300-800 KB
MIN_DIM       = 800    # shorter side must be ≥ 800 px
MIN_SHARPNESS = 60.0   # Laplacian variance — blurry previews score ~5-30
MAX_RETRIES   = 4
RENDER_BUFFER = 35     # seconds to wait for CDN after generation completes
RETRY_WAIT    = 20     # seconds between quality-gate retries

# ── Simple human-like delays (self-contained, no external deps) ───────────────

def _delay(min_ms: int = 300, max_ms: int = 900):
    t = random.uniform(min_ms / 1000, max_ms / 1000)
    if random.random() < 0.04:               # occasional distraction spike
        t += random.uniform(0.3, 1.2)
    time.sleep(t)

def _idle_scroll(page: Page):
    try:
        for _ in range(random.randint(1, 2)):
            page.mouse.wheel(0, random.choice([-1, 1]) * random.randint(20, 80))
            _delay(200, 500)
    except Exception:
        pass

# ── CDN network listener ──────────────────────────────────────────────────────

def _make_response_listener(bucket: list):
    def handler(response):
        try:
            url = response.url
            if not any(p in url for p in _CDN_PATTERNS):
                return
            ct = (response.headers.get("content-type") or
                  response.headers.get("Content-Type") or "")
            if not ct.startswith("image/"):
                return
            cl = int(response.headers.get("content-length") or
                     response.headers.get("Content-Length") or 0)
            if cl > 0 and cl < 50_000:
                return
            if url not in bucket:
                bucket.append(url)
        except Exception:
            pass
    return handler

# ── DOM URL scanning ──────────────────────────────────────────────────────────

def _is_real_url(src: str) -> bool:
    return bool(src and not src.startswith("blob:") and
                not src.startswith("data:") and
                src.startswith("https://") and len(src) > 80)

def _collect_dom_urls(page: Page) -> list:
    seen, out = set(), []
    for sel in IMAGE_SELECTORS:
        try:
            for img in page.locator(sel).all():
                try:
                    src = img.get_attribute("src") or ""
                    if _is_real_url(src) and src not in seen:
                        seen.add(src); out.append(src)
                except Exception:
                    pass
        except Exception:
            pass
    return out

# ── Modal dismissal ───────────────────────────────────────────────────────────

def _dismiss_modal(page: Page):
    try:
        if not page.locator(MODAL_SEL).is_visible():
            return
        page.keyboard.press("Escape")
        _delay(500, 800)
        if not page.locator(MODAL_SEL).is_visible():
            return
        for sel in [
            f'{MODAL_SEL} button:has-text("Skip")',
            f'{MODAL_SEL} button:has-text("Close")',
            f'{MODAL_SEL} button:last-child',
        ]:
            try:
                btn = page.locator(sel).first
                if btn.is_visible():
                    btn.click(); _delay(400, 600)
                    if not page.locator(MODAL_SEL).is_visible():
                        return
            except Exception:
                pass
        page.evaluate("""
            () => {
                const m = document.querySelector('[data-testid="modal-personality-onboarding"]');
                if (m) m.remove();
            }
        """)
    except Exception:
        pass

# ── Prompt submission ─────────────────────────────────────────────────────────

def _send_prompt(page: Page, text: str):
    _dismiss_modal(page)
    _delay(300, 600)

    # Focus via JS (bypasses pointer-event overlays)
    page.evaluate("""
        () => {
            const m = document.querySelector('[data-testid="modal-personality-onboarding"]');
            if (m) m.remove();
            const el = document.getElementById('prompt-textarea')
                     || document.querySelector('div[contenteditable="true"]');
            if (el) { el.click(); el.focus(); }
        }
    """)
    _delay(300, 500)

    # Paste via clipboard
    import pyperclip
    pyperclip.copy(text)
    _delay(150, 300)
    page.keyboard.press("Meta+V")
    _delay(700, 1100)

    # Verify paste — fallback to insert_text
    try:
        content = page.locator(INPUT_BOX).first.inner_text().strip()
    except Exception:
        content = ""
    if len(content) < 10:
        page.evaluate("""
            () => {
                const el = document.getElementById('prompt-textarea')
                         || document.querySelector('div[contenteditable="true"]');
                if (el) { el.click(); el.focus(); }
            }
        """)
        _delay(150, 300)
        page.keyboard.insert_text(text)
        _delay(700, 1100)

    _delay(400, 800)
    page.keyboard.press("Enter")
    _delay(1500, 2200)

# ── Wait for generation ───────────────────────────────────────────────────────

def _wait_generation(page: Page, timeout: int = 180, progress_cb=None) -> bool:
    if progress_cb: progress_cb("waiting_start")
    try:
        page.wait_for_selector(STOP_BUTTON, state="visible", timeout=25_000)
        if progress_cb: progress_cb("generating")
    except Exception:
        pass
    try:
        page.wait_for_selector(STOP_BUTTON, state="hidden", timeout=timeout * 1000)
        if progress_cb: progress_cb("generation_done")
        return True
    except Exception:
        if progress_cb: progress_cb("generation_timeout")
        return False

# ── URL resolution ────────────────────────────────────────────────────────────

def _wait_for_new_url(page: Page, known: list, network_bucket: list,
                      timeout: int = 60) -> str | None:
    # Strategy A: network bucket (fastest)
    for url in reversed(network_bucket):
        if url not in known:
            return url
    # Strategy B: DOM poll
    deadline = time.time() + timeout
    while time.time() < deadline:
        for url in _collect_dom_urls(page):
            if url not in known:
                return url
        time.sleep(3)
    return None

# ── Quality gate ──────────────────────────────────────────────────────────────

def _sharpness(img: PILImage.Image) -> float:
    grey = np.array(img.convert("L"), dtype=np.float32)
    k = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float32)
    from numpy.lib.stride_tricks import sliding_window_view
    windows = sliding_window_view(grey, (3, 3))
    return float((windows * k).sum(axis=(-2, -1)).var())

def _verify(body: bytes) -> tuple[bool, str]:
    kb = len(body) // 1024
    if kb < MIN_KB:
        return False, f"too small ({kb} KB, need ≥ {MIN_KB})"
    try:
        img = PILImage.open(io.BytesIO(body))
        w, h = img.size
        if min(w, h) < MIN_DIM:
            return False, f"dimensions {w}×{h} too small"
        lap = _sharpness(img)
        if lap < MIN_SHARPNESS:
            return False, f"blurry (sharpness {lap:.0f} < {MIN_SHARPNESS})"
        return True, f"{kb}KB {w}×{h} sharpness={lap:.0f}"
    except Exception as e:
        return False, f"PIL error: {e}"

def _download_verified(page: Page, url: str, known_before: list,
                        progress_cb=None) -> bytes | None:
    current_url = url
    for attempt in range(1, MAX_RETRIES + 1):
        if attempt > 1:
            if progress_cb: progress_cb(f"retry_download_{attempt}")
            time.sleep(RETRY_WAIT)
            newer = [u for u in _collect_dom_urls(page)
                     if u not in known_before and u != current_url]
            if newer:
                current_url = newer[-1]
        try:
            resp = page.context.request.get(current_url)
            if resp.status != 200:
                continue
            body = resp.body()
            ok, reason = _verify(body)
            if ok:
                if progress_cb: progress_cb(f"quality_pass:{reason}")
                return body
            if progress_cb: progress_cb(f"quality_fail:{reason}")
        except Exception as e:
            if progress_cb: progress_cb(f"download_error:{e}")
    return None

# ── CDP check ─────────────────────────────────────────────────────────────────

def check_cdp() -> dict:
    """Check if Brave is running with CDP. Returns {ok, message}."""
    import socket
    try:
        s = socket.create_connection(("localhost", DEBUG_PORT), timeout=2)
        s.close()
        return {"ok": True, "message": f"Brave CDP ready on port {DEBUG_PORT}"}
    except Exception:
        return {"ok": False,
                "message": f"Brave not detected on port {DEBUG_PORT}. "
                           f"Launch Brave with --remote-debugging-port={DEBUG_PORT}"}

# ── Main entry point ──────────────────────────────────────────────────────────

def generate_image(prompt: str, progress_cb=None) -> dict:
    """
    Generate an image via ChatGPT, return base64 PNG.

    progress_cb(status_string) is called at key milestones for SSE streaming.
    Returns {"ok": bool, "base64": str|None, "error": str|None}
    """
    cdp = check_cdp()
    if not cdp["ok"]:
        return {"ok": False, "base64": None, "error": cdp["message"]}

    if progress_cb: progress_cb("connecting")

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.connect_over_cdp(f"http://localhost:{DEBUG_PORT}")
            context = browser.contexts[0]

            # Reuse existing ChatGPT tab if open, else create new
            page = None
            for p in context.pages:
                if "chatgpt.com" in p.url:
                    page = p
                    break
            if page is None:
                page = context.new_page()
                if progress_cb: progress_cb("opening_chatgpt")
                try:
                    page.goto(CHATGPT_URL, wait_until="networkidle", timeout=30_000)
                except Exception:
                    page.goto(CHATGPT_URL, wait_until="domcontentloaded", timeout=30_000)
                _delay(1000, 1800)
            else:
                if progress_cb: progress_cb("reusing_tab")
                # Navigate to the image GPT if we're not already there
                if "g-p-695fa0174ec88191a103a44f86864e61" not in page.url:
                    try:
                        page.goto(CHATGPT_URL, wait_until="domcontentloaded", timeout=20_000)
                    except Exception:
                        pass
                    _delay(800, 1200)

            _dismiss_modal(page)

            try:
                page.wait_for_selector(INPUT_BOX, state="visible", timeout=12_000)
            except Exception:
                pass

            # Collect pre-existing image URLs so we can detect the new one
            known_before = _collect_dom_urls(page)

            # Arm network listener BEFORE sending prompt
            net_bucket: list = []
            listener = _make_response_listener(net_bucket)
            page.on("response", listener)

            if progress_cb: progress_cb("sending_prompt")
            _send_prompt(page, prompt)

            _wait_generation(page, timeout=180, progress_cb=progress_cb)

            # Render buffer — wait for CDN to finish encoding
            if progress_cb: progress_cb("waiting_cdn")
            for i in range(RENDER_BUFFER):
                time.sleep(1)
                _idle_scroll(page) if i % 10 == 5 else None
                if net_bucket and i >= 5:
                    break  # URL captured early — skip remaining buffer

            page.remove_listener("response", listener)

            # Resolve URL
            if progress_cb: progress_cb("resolving_url")
            url = _wait_for_new_url(page, known_before, net_bucket, timeout=45)
            if not url:
                return {"ok": False, "base64": None,
                        "error": "No image URL captured (network + DOM both empty)"}

            # Download + quality gate
            if progress_cb: progress_cb("downloading")
            body = _download_verified(page, url, known_before, progress_cb=progress_cb)
            if body is None:
                return {"ok": False, "base64": None,
                        "error": "Image failed quality gate after all retries"}

            b64 = base64.b64encode(body).decode("utf-8")
            if progress_cb: progress_cb("done")
            return {"ok": True, "base64": b64, "error": None}

    except Exception as e:
        return {"ok": False, "base64": None, "error": str(e)}
