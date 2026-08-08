import logging

import httpx

from app.config.env import get_settings
from app.constants.constants import AI_MODEL, AI_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


async def generate_ai_response(prompt: str) -> str:
    settings = get_settings()
    if not settings.groq_api_key:
        logger.warning("GROQ_API_KEY is missing. AI will not respond.")
        return "System Warning: Neural link offline. Please configure GROQ_API_KEY in the server environment."

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.groq_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": AI_MODEL,
                    "messages": [
                        {"role": "system", "content": AI_SYSTEM_PROMPT},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.7,
                    "max_tokens": 1024,
                },
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
    except Exception as exc:
        logger.error("Groq Inference Error: %s", exc)
        return "System Warning: Neural link to Groq LPUs severed. Please check the network or API keys."
