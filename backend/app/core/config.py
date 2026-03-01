from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "LinguistFlow"
    debug: bool = False

    # Database
    database_url: str = "postgresql+asyncpg://linguist:password@localhost:5432/linguistflow"

    # Redis / Celery
    redis_url: str = "redis://localhost:6379/0"

    # LLM
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    default_llm_provider: str = "gemini"  # "openai" | "anthropic" | "gemini"

    # Research / Academic APIs
    openalex_api_key: str = ""

    # Image APIs
    pexels_api_key: str = ""
    stable_diffusion_api_key: str = ""
    stable_diffusion_endpoint: str = (
        "https://api.stability.ai/v1/generation/"
        "stable-diffusion-xl-1024-v1-0/text-to-image"
    )

    # Security
    secret_key: str = "CHANGE-ME"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # CORS
    frontend_origin: str = "http://localhost:5173"

    # GDPR – MUST stay False in production
    log_client_ips: bool = False

    # GEO-Elite
    serp_api_key: str = ""

    # App Password Protection
    app_password: str = ""






def get_settings() -> Settings:
    return Settings()
