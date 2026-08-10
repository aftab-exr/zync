import json
import logging
import re
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
        
        # THE ULTIMATE ANTIGRAVITY FIX:
        # 1. Convert any literal invisible newlines into escaped \n (two characters)
        cleaned = raw_json.replace('\r', '').replace('\n', '\\n')
        
        # 2. Normalize any multiple backslashes followed by 'n' into a single, valid JSON '\n'
        cleaned = re.sub(r'\\+n', r'\\n', cleaned)
        
        service_account = json.loads(cleaned)
        cred = credentials.Certificate(service_account)
        return firebase_admin.initialize_app(cred)
        
    except json.JSONDecodeError as e:
        logger.error("Firebase JSON Parsing Error: %s. Check Render environment variables.", e)
        raise RuntimeError(f"Invalid Firebase JSON: {e}")
    except Exception as e:
        logger.error("Firebase Initialization Error: %s", e)
        raise RuntimeError(f"Failed to initialize Firebase: {e}")