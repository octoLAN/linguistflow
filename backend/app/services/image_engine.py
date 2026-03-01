"""
Image Engine – Pexels stock photos + Stable Diffusion AI generation

Priority:
  1. Try Pexels API (commercial-licensed stock photos)
  2. Fallback: Stable Diffusion API (SDXL, commercial_safe mode)

All results are passed through watermark_asset() for EU AI Act compliance.
"""
from __future__ import annotations

import logging
import base64
from typing import Any

import httpx

from app.core.config import get_settings
from app.services.compliance import watermark_asset

logger = logging.getLogger(__name__)
settings = get_settings()


# ── Pexels Stock Search ───────────────────────────────────────────────────────

async def search_pexels(query: str, per_page: int = 5) -> list[dict[str, Any]]:
    """
    Search Pexels for commercial-licensed images.
    Returns a list of asset dicts ready for watermark_asset().
    """
    url = "https://api.pexels.com/v1/search"
    headers = {"Authorization": settings.pexels_api_key}
    params = {"query": query, "per_page": per_page, "orientation": "landscape", "size": "large"}

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(url, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json()
            results = []
            for photo in data.get("photos", []):
                asset = {
                    "url": photo["src"]["large2x"],
                    "alt_text": photo.get("alt", query),
                    "mime_type": "image/jpeg",
                    "source_url": photo.get("url"),
                    "width": photo.get("width"),
                    "height": photo.get("height"),
                }
                results.append(watermark_asset(asset, "pexels"))
            return results
        except Exception as exc:
            logger.warning("Pexels search failed: %s", exc)
            return []


# ── Stable Diffusion Generation ───────────────────────────────────────────────

SD_NEGATIVE_PROMPT = (
    "nsfw, explicit, violence, nudity, watermark, logo, low quality, "
    "blurry, distorted, overexposed"
)


async def generate_sd_image(prompt: str) -> dict[str, Any] | None:
    """
    Generate an image via Stable Diffusion API (SDXL).
    Returns a single asset dict or None on failure.
    """
    url = settings.stable_diffusion_endpoint
    headers = {
        "Authorization": f"Bearer {settings.stable_diffusion_api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    payload = {
        "text_prompts": [
            {"text": prompt, "weight": 1.0},
            {"text": SD_NEGATIVE_PROMPT, "weight": -1.0},
        ],
        "cfg_scale": 7,
        "height": 1024,
        "width": 1024,
        "samples": 1,
        "steps": 30,
        # commercial_safe is not an official SD param but acts as doc signal;
        # the negative prompt above handles content filtering.
    }

    async with httpx.AsyncClient(timeout=60) as client:
        try:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            artifact_b64 = data["artifacts"][0]["base64"]
            # In production: upload to S3/GCS and return the URL
            data_uri = f"data:image/png;base64,{artifact_b64}"
            asset = {
                "url": data_uri,
                "alt_text": f"AI-generated image: {prompt[:80]}",
                "mime_type": "image/png",
                "source_url": None,
                "width": 1024,
                "height": 1024,
            }
            return watermark_asset(asset, "stable_diffusion")
        except Exception as exc:
            logger.error("Stable Diffusion generation failed: %s", exc)
            return None


# ── Main image resolver ───────────────────────────────────────────────────────

async def resolve_image(topic: str) -> dict[str, Any] | None:
    """
    Try Pexels first; fall back to Stable Diffusion.
    Always returns a watermarked asset dict, or None if both fail.
    """
    pexels_results = await search_pexels(topic, per_page=1)
    if pexels_results:
        logger.info("Image resolved via Pexels for topic='%s'", topic)
        return pexels_results[0]

    logger.info("Pexels returned nothing – generating via Stable Diffusion.")
    sd_result = await generate_sd_image(
        f"Professional blog header image: {topic}, photorealistic, high quality, commercial use"
    )
    return sd_result
