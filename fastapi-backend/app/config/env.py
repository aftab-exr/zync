import os
import sys
from functools import lru_cache

# pyrefly: ignore [missing-import]
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    port: int = 4000
    node_env: str = "development"

    supabase_url: str
    supabase_service_role_key: str
    supabase_anon_key: str = ""

    jwt_secret: str

    firebase_service_account: str = ""

    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    groq_api_key: str = ""

    redis_url: str = ""

    client_origin: str = "http://localhost:5173"
    production_origin: str = "https://zync-znty.onrender.com"
    payload_limit: str = "10mb"

    @property
    def is_production(self) -> bool:
        return self.node_env.lower() in ["production", "prod"] or os.getenv("RENDER") == "true"


@lru_cache
def get_settings() -> Settings:
    return Settings() # type: ignore


def get_port() -> int:
    port_env = os.getenv("PORT")
    if port_env and port_env.isdigit():
        return int(port_env)
    return get_settings().port



def validate_env() -> Settings:
    settings = get_settings()
    missing: list[str] = []

    if not settings.supabase_url.strip():
        missing.append("SUPABASE_URL")
    if not settings.supabase_service_role_key.strip():
        missing.append("SUPABASE_SERVICE_ROLE_KEY")
    if not settings.jwt_secret.strip():
        missing.append("JWT_SECRET")

    if missing:
        print("\n=======================================================", file=sys.stderr)
        print("FATAL ERROR: MISSING REQUIRED ENVIRONMENT VARIABLES", file=sys.stderr)
        for key in missing:
            print(f" - {key}", file=sys.stderr)
        print("Please configure these variables in fastapi-backend/.env", file=sys.stderr)
        print("=======================================================\n", file=sys.stderr)
        sys.exit(1)

    if not settings.groq_api_key:
        print("[ENV WARNING] GROQ_API_KEY is not set. AI Chat Features will be disabled.")

    if not settings.redis_url:
        print("[ENV WARNING] REDIS_URL is not set. Socket.io will run in single-node mode.")

    return settings
