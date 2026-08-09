import uuid
from collections.abc import Awaitable, Callable

# pyrefly: ignore [missing-import]
from fastapi import Depends, Request
# pyrefly: ignore [missing-import]
from starlette.middleware.base import BaseHTTPMiddleware
# pyrefly: ignore [missing-import]
from starlette.responses import Response

from app.services.rate_limiter import check_rate_limit, init_redis_rate_limiter

_redis_initialized = False


def ensure_redis() -> None:
    global _redis_initialized
    if not _redis_initialized:
        init_redis_rate_limiter()
        _redis_initialized = True


class GlobalRateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        if request.method == "OPTIONS":
            return await call_next(request)

        ensure_redis()
        client_ip = request.client.host if request.client else "unknown"
        result = await check_rate_limit(key=f"ip:{client_ip}", limit=200, window_ms=60_000)


        if not result["allowed"]:
            retry_after = max(1, int((result.get("retry_after_ms") or 60_000) / 1000))
            return Response(
                content='{"success":false,"error":"Too many requests. Please try again in a minute.","code":"RATE_LIMITED"}',
                status_code=429,
                media_type="application/json",
                headers={
                    "RateLimit-Limit": "200",
                    "RateLimit-Remaining": "0",
                    "RateLimit-Reset": str(int(result["reset_at"] / 1000)),
                    "Retry-After": str(retry_after),
                },
            )

        response = await call_next(request)
        response.headers["RateLimit-Limit"] = "200"
        response.headers["RateLimit-Remaining"] = str(result["remaining"])
        response.headers["RateLimit-Reset"] = str(int(result["reset_at"] / 1000))
        return response


async def message_send_rate_limit(request: Request) -> None:
    ensure_redis()
    user = getattr(request.state, "user", None)
    user_id = user.get("_id") if user else None
    client_ip = request.client.host if request.client else "unknown"
    key = f"user:{user_id or client_ip}:message"
    result = await check_rate_limit(key=key, limit=30, window_ms=60_000)
    if not result["allowed"]:
        from app.utils.api_error import ApiError

        raise ApiError(429, "Too many messages sent. Please slow down.")
