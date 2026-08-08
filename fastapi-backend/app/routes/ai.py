import json

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.config.env import get_settings
from app.constants.constants import AI_MODEL, AI_SYSTEM_PROMPT, ALLOWED_AI_MODELS
from app.middleware.auth import require_user
from app.schemas.validators import AIChatCompletionsBody
from app.utils.api_error import ApiError

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


@router.post("/chat/completions")
async def chat_completions(body: AIChatCompletionsBody, user=Depends(require_user)):
    settings = get_settings()
    if not settings.groq_api_key:
        raise ApiError(500, "GROQ_API_KEY is not configured.")

    selected_model = body.model if body.model in ALLOWED_AI_MODELS else AI_MODEL

    async def event_stream():
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream(
                    "POST",
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.groq_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": selected_model,
                        "messages": [{"role": "system", "content": AI_SYSTEM_PROMPT}, *body.messages],
                        "temperature": 0.7,
                        "stream": True,
                    },
                ) as response:
                    if response.status_code >= 400:
                        yield f"data: {json.dumps({'error': 'Groq API error'})}\n\n"
                        return
                    async for chunk in response.aiter_bytes():
                        yield chunk.decode("utf-8", errors="ignore")
            yield "data: [DONE]\n\n"
        except Exception:
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
