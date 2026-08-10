import json
import logging
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
        raw_json = settings.firebase_service_account.strip()
        
        # ANTIGRAVITY V2: Properly reduce Render's double-escaped newlines to valid JSON newlines
        # "\\\\n" looks for literal '\' '\' 'n', and "\\n" replaces it with a valid JSON literal '\' 'n'
        if "\\\\n" in raw_json:
            raw_json = raw_json.replace("\\\\n", "\\n")

        service_account = json.loads(raw_json)
        cred = credentials.Certificate(service_account)
        return firebase_admin.initialize_app(cred)
        
    except json.JSONDecodeError as e:
        logger.error("Firebase JSON Parsing Error: %s. Check Render environment variables.", e)
        raise RuntimeError(f"Invalid Firebase JSON: {e}")
    except Exception as e:
        logger.error("Firebase Initialization Error: %s", e)
        raise RuntimeError(f"Failed to initialize Firebase: {e}")