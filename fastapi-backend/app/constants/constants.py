import os

from app.config.env import get_settings

DISPLAY_NAME_LOCKOUT_DAYS = 14
USERNAME_LOCKOUT_DAYS = 60
MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000
UPLOAD_MAX_BYTES = 50 * 1024 * 1024

AI_MODEL = "llama-3.3-70b-versatile"
AI_SYSTEM_PROMPT = (
    "You are Zync Intelligence, a concise and helpful AI embedded in an encrypted messaging app. "
    "Keep answers clean and code well-formatted."
)

ALLOWED_AI_MODELS = {
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "llama3-70b-8192",
    "llama3-8b-8192",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
    "deepseek-r1-distill-llama-70b",
}

ACCESS_TOKEN_EXPIRY = "15m"
REFRESH_TOKEN_DAYS = 7
MAX_DEVICES_PER_USER = 3
REFRESH_COOKIE_NAME = "zync_refresh_token"


def get_port() -> int:
    settings = get_settings()
    return settings.port or int(os.getenv("PORT", "4000"))


def _strip(value: str | None) -> str:
    return value.replace("'", "").replace('"', "").strip() if value else ""


def get_allowed_origins() -> list[str]:
    settings = get_settings()
    client_origin = _strip(settings.client_origin) or "http://localhost:5173"
    production_origin = _strip(settings.production_origin) or "https://zync-app-vu95.onrender.com"
    origins = [o for o in [client_origin, production_origin, "https://zync-app-vu95.onrender.com", "https://zync-znty.onrender.com"] if o]
    # Remove duplicates while preserving order
    unique_origins = list(dict.fromkeys(origins))
    if "localhost" in client_origin:
        unique_origins.append(client_origin.replace("localhost", "127.0.0.1"))
    return unique_origins

