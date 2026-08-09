import json
from functools import lru_cache

# pyrefly: ignore [missing-import]
import firebase_admin
# pyrefly: ignore [missing-import]
from firebase_admin import credentials

from app.config.env import get_settings


@lru_cache
def get_firebase_app():
    if firebase_admin._apps:
        return firebase_admin.get_app()

    settings = get_settings()
    if not settings.firebase_service_account:
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT is not configured")

    try:
        service_account = (
            settings.firebase_service_account
            if isinstance(settings.firebase_service_account, dict)
            else json.loads(settings.firebase_service_account)
        )
    except Exception as exc:
        raise RuntimeError(f"Invalid FIREBASE_SERVICE_ACCOUNT JSON: {exc}") from exc

    if isinstance(service_account, dict) and "private_key" in service_account:
        service_account["private_key"] = service_account["private_key"].replace("\\n", "\n")

    cred = credentials.Certificate(service_account)
    return firebase_admin.initialize_app(cred)


