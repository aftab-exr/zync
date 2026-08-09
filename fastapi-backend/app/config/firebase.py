import base64
import json
import re
from functools import lru_cache

# pyrefly: ignore [missing-import]
import firebase_admin
# pyrefly: ignore [missing-import]
from firebase_admin import credentials

from app.config.env import get_settings


def parse_firebase_service_account(raw_val: str | dict) -> dict:
    if isinstance(raw_val, dict):
        return raw_val
    if not isinstance(raw_val, str):
        raise ValueError("FIREBASE_SERVICE_ACCOUNT must be a string or dict")

    val = raw_val.strip()

    if not val.startswith("{") and not val.startswith('"'):
        try:
            decoded = base64.b64decode(val).decode("utf-8")
            if decoded.strip().startswith("{"):
                val = decoded.strip()
        except Exception:
            pass

    try:
        return json.loads(val)
    except json.JSONDecodeError:
        pass

    try:
        return json.loads(val, strict=False)
    except json.JSONDecodeError:
        pass

    fixed_val = re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', val)
    try:
        return json.loads(fixed_val, strict=False)
    except json.JSONDecodeError:
        pass

    fixed_val = val.replace("\r\n", "\n")
    fixed_val = re.sub(r'(?<=[\":,])\n', " ", fixed_val)
    return json.loads(fixed_val, strict=False)


@lru_cache
def get_firebase_app():
    if firebase_admin._apps:
        return firebase_admin.get_app()

    settings = get_settings()
    if not settings.firebase_service_account:
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT is not configured")

    try:
        service_account = parse_firebase_service_account(settings.firebase_service_account)
    except Exception as exc:
        raise RuntimeError(f"Invalid FIREBASE_SERVICE_ACCOUNT JSON: {exc}") from exc

    if isinstance(service_account, dict) and "private_key" in service_account:
        pk = str(service_account["private_key"])
        service_account["private_key"] = pk.replace("\\n", "\n")

    cred = credentials.Certificate(service_account)
    return firebase_admin.initialize_app(cred)



