"""
auth.py — OAuth 2.0 Authorization Code Flow with PKCE.

Handles: PKCE pair generation, auth URL building, token exchange,
user profile fetch. Does NOT store tokens — they are used once and discarded.
"""

import base64, hashlib, os, secrets, urllib.parse
import httpx

REDIRECT_URI = "http://127.0.0.1:9876/auth/callback"

# ── Provider registry ──────────────────────────────────────────────────────────
# client_id / client_secret read from env at call time so .env changes are
# picked up without restarting the process.

def _providers() -> dict:
    return {
        "google": {
            "client_id":     os.getenv("GOOGLE_CLIENT_ID", ""),
            "client_secret": os.getenv("GOOGLE_CLIENT_SECRET", ""),
            "auth_url":      "https://accounts.google.com/o/oauth2/v2/auth",
            "token_url":     "https://oauth2.googleapis.com/token",
            "userinfo_url":  "https://openidconnect.googleapis.com/v1/userinfo",
            "scope":         "openid profile email",
        },
        "microsoft": {
            "client_id":     os.getenv("MICROSOFT_CLIENT_ID", ""),
            "client_secret": os.getenv("MICROSOFT_CLIENT_SECRET", ""),
            "auth_url":      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
            "token_url":     "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            "userinfo_url":  "https://graph.microsoft.com/v1.0/me",
            "scope":         "openid profile email User.Read",
        },
    }


def configured_providers() -> list[str]:
    """Return which providers have credentials set — used by the /api/auth/providers route."""
    result = []
    p = _providers()
    if p["google"]["client_id"] and not p["google"]["client_id"].startswith("your-"):
        result.append("google")
    if p["microsoft"]["client_id"] and not p["microsoft"]["client_id"].startswith("your-"):
        result.append("microsoft")
    return result


def _get_provider(name: str) -> dict:
    p = _providers()
    if name not in p:
        raise ValueError(f"Unknown provider '{name}'. Supported: {list(p)}")
    cfg = p[name]
    if not cfg["client_id"] or cfg["client_id"].startswith("your-"):
        raise ValueError(
            f"{name.upper()}_CLIENT_ID is not set in backend/.env. "
            f"See backend/.env.example for setup instructions."
        )
    return cfg


# ── PKCE ──────────────────────────────────────────────────────────────────────

def generate_pkce_pair() -> tuple[str, str]:
    """Return (code_verifier, code_challenge) using S256 method."""
    verifier   = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()
    digest     = hashlib.sha256(verifier.encode()).digest()
    challenge  = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


def generate_state() -> str:
    return secrets.token_urlsafe(24)


# ── Auth URL ──────────────────────────────────────────────────────────────────

def build_auth_url(provider: str, state: str, code_challenge: str) -> str:
    cfg = _get_provider(provider)
    params = {
        "client_id":             cfg["client_id"],
        "redirect_uri":          REDIRECT_URI,
        "response_type":         "code",
        "scope":                 cfg["scope"],
        "state":                 state,
        "code_challenge":        code_challenge,
        "code_challenge_method": "S256",
        "prompt":                "select_account",
    }
    if provider == "microsoft":
        params["response_mode"] = "query"
    query = "&".join(f"{k}={urllib.parse.quote(str(v), safe='')}" for k, v in params.items())
    return f"{cfg['auth_url']}?{query}"


# ── Token exchange ────────────────────────────────────────────────────────────

async def exchange_code(provider: str, code: str, code_verifier: str) -> dict:
    cfg = _get_provider(provider)
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(cfg["token_url"], data={
            "grant_type":    "authorization_code",
            "client_id":     cfg["client_id"],
            "client_secret": cfg["client_secret"],
            "code":          code,
            "redirect_uri":  REDIRECT_URI,
            "code_verifier": code_verifier,
        })
    if resp.status_code != 200:
        raise ValueError(f"Token exchange failed [{resp.status_code}]: {resp.text[:300]}")
    return resp.json()


async def fetch_user_profile(provider: str, access_token: str) -> dict:
    cfg = _get_provider(provider)
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(cfg["userinfo_url"], headers={"Authorization": f"Bearer {access_token}"})
    if resp.status_code != 200:
        raise ValueError(f"Userinfo fetch failed [{resp.status_code}]: {resp.text[:300]}")
    raw = resp.json()

    if provider == "google":
        return {
            "email":            raw.get("email", ""),
            "name":             raw.get("name", ""),
            "avatar_url":       raw.get("picture", ""),
            "provider":         "google",
            "provider_user_id": raw.get("sub", ""),
        }
    elif provider == "microsoft":
        return {
            "email":            raw.get("mail") or raw.get("userPrincipalName", ""),
            "name":             raw.get("displayName", ""),
            "avatar_url":       "",
            "provider":         "microsoft",
            "provider_user_id": raw.get("id", ""),
        }
    raise ValueError(f"No profile normalizer for '{provider}'")


async def complete_oauth(provider: str, code: str, code_verifier: str) -> dict:
    tokens  = await exchange_code(provider, code, code_verifier)
    profile = await fetch_user_profile(provider, tokens["access_token"])
    return profile
