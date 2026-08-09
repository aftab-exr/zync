import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

# pyrefly: ignore [missing-import]
from fastapi import FastAPI, Request
# pyrefly: ignore [missing-import]
from fastapi.exceptions import RequestValidationError
# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware
# pyrefly: ignore [missing-import]
from fastapi.middleware.gzip import GZipMiddleware
# pyrefly: ignore [missing-import]
from fastapi.responses import JSONResponse
# pyrefly: ignore [missing-import]
from pydantic import ValidationError

from app.config.cloudinary import configure_cloudinary
from app.config.env import validate_env
from app.config.firebase import get_firebase_app
from app.config.supabase import get_supabase
from app.constants.constants import get_allowed_origins
from app.middleware.logger import RequestLoggerMiddleware
from app.middleware.rate_limit import GlobalRateLimitMiddleware
from app.routes import ai, auth, conversations, keys, messages, users
from app.socket.socket_manager import create_socket_app
from app.utils.api_error import ApiError
from app.utils.api_response import ApiResponse

logger = logging.getLogger(__name__)


async def bootstrap_ai() -> None:
    try:
        supabase = get_supabase()
        res = supabase.table("users").select("id").eq("is_ai", True).maybe_single().execute()
        
        if res and res.data:
            return

        supabase.table("users").delete().eq("is_ai", True).execute()
        supabase.table("users").insert(
            {
                "username": "zync_ai",
                "display_name": "Zync Intelligence",
                "email": "ai@zync.dev",
                "firebase_uid": f"zync_internal_ai_{int(datetime.now(timezone.utc).timestamp() * 1000)}",
                "is_ai": True,
            }
        ).execute()
        logger.info("AI Assistant user provisioned successfully.")
    except Exception as exc:
        logger.warning("Could not bootstrap AI user (check Supabase migration & credentials): %s", exc)

@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_env()
    configure_cloudinary()
    try:
        get_firebase_app()
    except Exception as exc:
        logger.warning("Firebase not initialized: %s", exc)
    await bootstrap_ai()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Zync API", lifespan=lifespan)

    app.add_middleware(RequestLoggerMiddleware)
    app.add_middleware(GlobalRateLimitMiddleware)
    app.add_middleware(GZipMiddleware, minimum_size=500)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        try:
            response = await call_next(request)
        except Exception as exc:
            logger.exception("Unhandled exception in request processing: %s", exc)
            response = JSONResponse(
                status_code=500,
                content=ApiResponse(500, "Internal Server Error").model_dump(),
            )
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"
        response.headers["Cross-Origin-Embedder-Policy"] = "unsafe-none"
        return response

    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_allowed_origins(),
        allow_origin_regex=r"https://.*\.onrender\.com",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


    @app.exception_handler(ApiError)
    async def api_error_handler(_: Request, exc: ApiError):
        return JSONResponse(
            status_code=exc.status_code,
            content=ApiResponse(exc.status_code, exc.message, exc.errors or {}).model_dump(),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_: Request, exc: RequestValidationError):
        details = [f"{'.'.join(str(p) for p in err['loc'])}: {err['msg']}" for err in exc.errors()]
        return JSONResponse(
            status_code=400,
            content=ApiResponse(400, "Validation failed", details).model_dump(),
        )

    @app.exception_handler(ValidationError)
    async def pydantic_error_handler(_: Request, exc: ValidationError):
        details = [f"{'.'.join(str(p) for p in err['loc'])}: {err['msg']}" for err in exc.errors()]
        return JSONResponse(
            status_code=400,
            content=ApiResponse(400, "Validation failed", details).model_dump(),
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(_: Request, exc: Exception):
        logger.exception("Unhandled error: %s", exc)
        return JSONResponse(
            status_code=500,
            content=ApiResponse(500, "Internal Server Error").model_dump(),
        )

    @app.get("/health")
    async def health():
        return ApiResponse(200, "OK", {}).model_dump()

    app.include_router(auth.router)
    app.include_router(keys.router)
    app.include_router(users.router)
    app.include_router(conversations.router)
    app.include_router(messages.router)
    app.include_router(ai.router)

    socket_app = create_socket_app()
    app.mount("/socket.io", socket_app)

    return app


app = create_app()
