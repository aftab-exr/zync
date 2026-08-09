import base64
import json
import logging
import re
from functools import lru_cache

# pyrefly: ignore [missing-import]
import firebase_admin
# pyrefly: ignore [missing-import]
from firebase_admin import credentials

from app.config.env import get_settings

logger = logging.getLogger(__name__)


def _normalize_pem_key(pk: str) -> str:
    """Ensure the PEM private_key uses real newline characters.

    Render environment variables store ``\\n`` as the literal two-character
    sequence *backslash + n*.  Depending on how many escaping layers the
    value went through (Render dashboard → shell → pydantic-settings →
    json.loads), the parsed ``private_key`` may still contain one or more
    levels of escaped newlines (``\\n``, ``\\\\n``, etc.).

    This helper collapses ALL literal backslash-n sequences (at any depth)
    to real newlines so the PEM/cryptography parser can load the key.
    """
    if not pk:
        return pk

    # Handle Windows-style carriage returns first
    result = pk.replace("\r\n", "\n").replace("\r", "\n")

    # Replace one-or-more backslashes followed by 'n' with a real newline.
    # This handles \\n, \\\\n, \\\\\\n, etc. in a single pass.
    # Safe because PEM base64 data never contains backslashes.
    result = re.sub(r"\\+n", "\n", result)

    return result



def parse_firebase_service_account(raw_val: str | dict) -> dict:
    """Parse the FIREBASE_SERVICE_ACCOUNT env-var value into a dict.

    Supports:
    * A plain JSON string (standard Firebase download format)
    * A Base64-encoded JSON string
    * JSON with invalid backslash escapes (e.g. ``\\M``, ``\\P`` from
      Render's env-var handling)
    """
    if isinstance(raw_val, dict):
        return raw_val
    if not isinstance(raw_val, str):
        raise ValueError("FIREBASE_SERVICE_ACCOUNT must be a string or dict")

    val = raw_val.strip()

    # --- Attempt Base64 decode if the value doesn't look like JSON ----------
    if not val.startswith("{") and not val.startswith('"'):
        try:
            decoded = base64.b64decode(val).decode("utf-8")
            if decoded.strip().startswith("{"):
                val = decoded.strip()
        except Exception:
            pass

    # --- 1. Standard json.loads (strict) ------------------------------------
    try:
        return json.loads(val)
    except json.JSONDecodeError:
        pass

    # --- 2. Relaxed json.loads (non-strict) ---------------------------------
    try:
        return json.loads(val, strict=False)
    except json.JSONDecodeError:
        pass

    # --- 3. Repair invalid backslash escapes --------------------------------
    # Some characters after backslash (e.g. \M, \A, \P) are not valid JSON
    # escapes.  Double-escape them so json.loads can proceed.
    fixed_val = re.sub(r'\\(?!["\\\/bfnrtu])', r"\\\\", val)
    try:
        return json.loads(fixed_val, strict=False)
    except json.JSONDecodeError:
        pass

    # --- 4. Last resort: strip real newlines inside JSON values -------------
    fixed_val = val.replace("\r\n", "\n")
    fixed_val = re.sub(r'(?<=[\\":,])\n', " ", fixed_val)
    return json.loads(fixed_val, strict=False)


@lru_cache
def get_firebase_app():
    if firebase_admin._apps:
        return firebase_admin.get_app()

    settings = get_settings()
    if not settings.firebase_service_account:
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT is not configured")

    try:
        service_account = parse_firebase_service_account(
            settings.firebase_service_account
        )
    except Exception as exc:
        raise RuntimeError(
            f"Invalid FIREBASE_SERVICE_ACCOUNT JSON: {exc}"
        ) from exc

    # --- Normalize private_key newlines ------------------------------------
    if isinstance(service_account, dict) and "private_key" in service_account:
        raw_pk = str(service_account["private_key"])
        normalized_pk = _normalize_pem_key(raw_pk)

        if raw_pk != normalized_pk:
            logger.info(
                "Normalized private_key: replaced escaped newlines with real newlines"
            )

        service_account["private_key"] = normalized_pk

    cred = credentials.Certificate(service_account)
    return firebase_admin.initialize_app(cred)
