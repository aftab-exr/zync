import json
import logging
import base64
from functools import lru_cache
import firebase_admin
from firebase_admin import credentials
from app.config.env import get_settings

logger = logging.getLogger(__name__)

@lru_cache
def get_firebase_app():
    settings = get_settings()
    if not settings.firebase_service_account:
        logger.error("FIREBASE_SERVICE_ACCOUNT is not configured in the environment.")
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT is not configured")

    try:
        raw_val = settings.firebase_service_account.strip()
        
        # Base64 bypass: Decode the string back into pure JSON, ignoring environment mangling
        if not raw_val.startswith("{"):
            raw_json = base64.b64decode(raw_val).decode('utf-8')
        else:
            raw_json = raw_val  # Fallback just in case standard JSON is used

        service_account = json.loads(raw_json)
        cred = credentials.Certificate(service_account)
        return firebase_admin.initialize_app(cred)
        
    except json.JSONDecodeError as e:
        logger.error("Firebase JSON Parsing Error: %s", e)
        raise RuntimeError(f"Invalid Firebase JSON: {e}")
    except Exception as e:
        logger.error("Firebase Initialization Error: %s", e)
        raise RuntimeError(f"Failed to initialize Firebase: {e}")