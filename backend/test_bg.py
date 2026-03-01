import asyncio
from app.core.config import settings
print(f"Gemini: {bool(settings.gemini_api_key)}")
print(f"OpenAlex: {bool(settings.openalex_api_key)}")
