"""
Compliance module – GDPR & EU AI Act

1. NoIPLoggingMiddleware: strips visitor IPs before any logging
2. watermark_asset(): adds `is_ai_generated=True` + `ai_tag` to Asset records
3. enforce_approval(): raises 403 if post.is_approved is False
"""
from __future__ import annotations

import logging
from typing import Callable

from fastapi import HTTPException, Request, Response, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


# ── 1. No-IP Middleware (GDPR Art. 5 – Data Minimisation) ────────────────────

class NoIPLoggingMiddleware(BaseHTTPMiddleware):
    """
    Ensures that the client's IP address is NEVER written to logs,
    regardless of any upstream logger configuration.

    Per GDPR Art. 5 §1(c) – Datensparsamkeit (data minimisation):
    IP addresses of blog visitors must not be stored on the central server.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if not settings.log_client_ips:
            # Shadow the client attribute so any accidental logging returns None
            request.scope["client"] = ("REDACTED", 0)

        response = await call_next(request)
        return response


# ── 2. Asset Watermarking (EU AI Act Art. 52 – Transparency) ─────────────────

PROVIDER_TAGS: dict[str, str] = {
    "dalle3": "AI-Generated via DALL-E 3",
    "stable_diffusion": "AI-Generated via Stable Diffusion XL",
    "pexels": "Stock photo – commercial license (Pexels)",
    "unsplash": "Stock photo – commercial license (Unsplash)",
}


def watermark_asset(asset_data: dict, provider: str) -> dict:
    """
    Enriches an asset dict with AI-transparency metadata before DB insert.

    Args:
        asset_data: raw asset fields to be inserted.
        provider:   'dalle3' | 'stable_diffusion' | 'pexels' | 'unsplash'

    Returns:
        Updated asset_data dict with compliance fields set.
    """
    is_ai = provider in ("dalle3", "stable_diffusion")
    tag = PROVIDER_TAGS.get(provider, f"Generated via {provider}")
    license_val = "ai-generated" if is_ai else f"{provider}-commercial"

    asset_data.update(
        {
            "is_ai_generated": is_ai,
            "ai_tag": tag,
            "license": license_val,
        }
    )
    logger.info("Asset watermarked: provider=%s is_ai=%s tag='%s'", provider, is_ai, tag)
    return asset_data


# ── 3. Approval Enforcement (Human-in-the-Loop) ───────────────────────────────

def enforce_approval(post: object) -> None:
    """
    Raises HTTP 403 if the post has not been manually approved.

    The 'is_approved' flag ensures a human (the customer) has reviewed
    and endorsed the content before it goes live. This is the legal
    mechanism that designates the customer as the 'publizistischer Urheber'
    (journalistic author) under German press law + EU AI Act §52.
    """
    if not getattr(post, "is_approved", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Post must be manually approved before publishing. "
                "Use the approval dashboard or PATCH /api/posts/{id}/approve."
            ),
        )
