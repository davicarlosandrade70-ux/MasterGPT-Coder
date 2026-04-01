import httpx
import json
import asyncio
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# ── API KEYS ───────────────────────────────────────────────────────
# Helper function to get keys from environment or fallback
def get_keys_from_env(key_name, default=[]):
    raw_keys = os.getenv(key_name)
    if not raw_keys:
        return default
    return [k.strip() for k in raw_keys.split(",") if k.strip()]

KEYS = {
    "groq": get_keys_from_env("GROQ_KEYS"),
    "openrouter": get_keys_from_env("OPENROUTER_KEYS"),
    "mistral": get_keys_from_env("MISTRAL_KEYS")
}


class KeyManager:
    def __init__(self, keys):
        self.keys = keys
        self.indices = {p: 0 for p in keys}

    def get_key(self, provider):
        keys = self.keys.get(provider, [])
        if not keys:
            return None
        key = keys[self.indices[provider] % len(keys)]
        return key

    def rotate(self, provider):
        self.indices[provider] += 1

km = KeyManager(KEYS)

async def stream_provider(provider: str, model: str, messages: list):
    """
    Stream from AI providers with key rotation support.
    """
    if provider == "groq":
        url = "https://api.groq.com/openai/v1/chat/completions"
    elif provider == "openrouter":
        url = "https://openrouter.ai/api/v1/chat/completions"
    elif provider == "mistral":
        url = "https://api.mistral.ai/v1/chat/completions"
    else:
        raise ValueError(f"Unknown provider: {provider}")

    max_retries = len(KEYS.get(provider, []))
    for attempt in range(max_retries):
        key = km.get_key(provider)
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}"
        }
        
        if provider == "openrouter":
            headers["HTTP-Referer"] = "http://localhost:8000"
            headers["X-Title"] = "MasterGPT-Coder"

        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "temperature": 0.4,
            "max_tokens": 4096
        }

        async with httpx.AsyncClient() as client:
            try:
                async with client.stream("POST", url, headers=headers, json=payload, timeout=60.0) as response:
                    if response.status_code == 200:
                        async for line in response.aiter_lines():
                            if line.startswith("data: "):
                                yield line + "\n"
                        return
                    
                    # Handle rate limits or invalid keys
                    if response.status_code in [401, 429]:
                        km.rotate(provider)
                        continue
                    
                    # Handle other errors
                    error_text = await response.aread()
                    yield f"data: {json.dumps({'error': f'API Error {response.status_code}: {error_text.decode()}'})}\n"
                    return
            except Exception as e:
                if attempt == max_retries - 1:
                    yield f"data: {json.dumps({'error': str(e)})}\n"
                km.rotate(provider)
