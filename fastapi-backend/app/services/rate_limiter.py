import logging
import time
import uuid
from typing import Any

import redis.asyncio as aioredis

from app.config.env import get_settings

logger = logging.getLogger(__name__)

_redis_client: aioredis.Redis | None = None


def init_redis_rate_limiter() -> aioredis.Redis | None:
    global _redis_client
    settings = get_settings()
    if not settings.redis_url:
        logger.warning("REDIS_URL not configured, rate limiting will be disabled")
        return None

    if _redis_client is None:
        _redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis_client


async def check_rate_limit(*, key: str, limit: int, window_ms: int) -> dict[str, Any]:
    now = int(time.time() * 1000)
    window_start = now - window_ms
    redis_key = f"ratelimit:{key}"

    if _redis_client is None:
        return {"allowed": True, "remaining": limit, "reset_at": now + window_ms}

    try:
        pipe = _redis_client.pipeline()
        pipe.zremrangebyscore(redis_key, 0, window_start)
        pipe.zcard(redis_key)
        request_id = f"{now}:{uuid.uuid4()}"
        pipe.zadd(redis_key, {request_id: now})
        pipe.expire(redis_key, int(window_ms / 1000) + 1)
        results = await pipe.execute()

        current_count = results[1]
        allowed = current_count < limit
        remaining = max(0, limit - current_count - 1)
        reset_at = now + window_ms

        if not allowed:
            await _redis_client.zrem(redis_key, request_id)
            oldest = await _redis_client.zrange(redis_key, 0, 0, withscores=True)
            retry_after_ms = window_ms
            if oldest:
                retry_after_ms = int(oldest[0][1]) + window_ms - now
            return {
                "allowed": False,
                "remaining": 0,
                "reset_at": reset_at,
                "retry_after_ms": retry_after_ms,
            }

        return {"allowed": True, "remaining": remaining, "reset_at": reset_at}
    except Exception as exc:
        logger.error("Rate limit check failed: %s", exc)
        return {"allowed": True, "remaining": limit, "reset_at": now + window_ms}
