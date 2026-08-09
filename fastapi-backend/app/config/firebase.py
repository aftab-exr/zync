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

    service_account = json.loads(settings.firebase_service_account)
    cred = credentials.Certificate(service_account)
    return firebase_admin.initialize_app(cred)

