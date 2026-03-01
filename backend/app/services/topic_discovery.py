"""
Topic Discovery Service – Autonomous topic generation for LinguistFlow

Workflow:
  1. Crawl the customer's website to understand their niche/focus areas
  2. Fetch configured sources (RSS feeds, URLs, keywords)
  3. Feed everything to Gemini to generate a ranked list of unique, relevant topics
  4. Return the topics so the caller can generate one draft per topic
"""
from __future__ import annotations

import asyncio
import re
import logging
import json
from typing import Any
from typing import Any

import httpx
import feedparser

logger = logging.getLogger(__name__)

# ── Helpers ───────────────────────────────────────────────────────────────────

def _strip_html(html: str) -> str:
    """Naively strip HTML tags and collapse whitespace."""
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


async def crawl_page(url: str, max_chars: int = 5000) -> str:
    """Fetch a URL and return clean plain text (first max_chars characters)."""
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            text = _strip_html(resp.text)
            return text[:max_chars]
    except Exception as exc:
        logger.warning("crawl_page failed for %s: %s", url, exc)
        return ""


async def fetch_rss_headlines(url: str, max_items: int = 8) -> list[str]:
    """Parse an RSS feed and return a list of item titles."""
    try:
        feed = feedparser.parse(url)
        headlines = []
        for entry in feed.entries[:max_items]:
            title   = getattr(entry, "title",   "")
            summary = getattr(entry, "summary", "")
            if title:
                headlines.append(f"- {title}: {summary[:120]}")
        return headlines
    except Exception as exc:
        logger.warning("fetch_rss_headlines failed for %s: %s", url, exc)
        return []


# ── Customer site analysis ────────────────────────────────────────────────────

async def analyse_customer_site(site_url: str) -> str:
    """
    Crawl the customer's site homepage and a /blog or /articles sub-page
    to understand their niche, product, and typical content style.
    Returns a short text summary to feed into the topic selection prompt.
    """
    base = site_url.rstrip("/")
    pages = [base, f"{base}/blog", f"{base}/articles"]
    texts = await asyncio.gather(*[crawl_page(url, max_chars=2500) for url in pages])

    combined = "\n\n---\n".join(t for t in texts if t)
    return combined[:6000]  # cap at 6 000 chars for the prompt

async def extract_site_branding(site_url: str, gemini_api_key: str) -> dict:
    """
    Crawls the site URL, extracts raw HTML, and uses Gemini to analyze it for 
    branding colors (60-30-10 rule) and industry keywords.
    """
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(site_url)
            html_content = resp.text[:15000]  # First 15k chars should contain head/css and main body context
    except Exception as exc:
        logger.warning(f"Failed to crawl {site_url} for branding: {exc}")
        html_content = ""

    prompt = f"""
    You are an expert web designer and SEO strategist. I will give you the raw HTML of a website.
    Your task is to analyze it and extract:
    1. The main 60-30-10 color palette in Hex codes (primary/background, brand/secondary, accent). Guess from CSS or text if missing.
    2. 5-8 relevant industry keywords or a short niche description.

    Return EXACTLY a JSON format with NO markdown formatting, NO backticks:
    {{
      "primaryColor": "#...hex...",
      "brandColor": "#...hex...",
      "accentColor": "#...hex...",
      "keywords": "Keyword1, Keyword2, Niche description..."
    }}

    HTML CONTENT:
    {html_content}
    """
    
    from google import genai as google_genai
    client = google_genai.Client(api_key=gemini_api_key)

    def _call() -> str:
        resp = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=google_genai.types.GenerateContentConfig(
                safety_settings=[
                    google_genai.types.SafetySetting(category=google_genai.types.HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold=google_genai.types.HarmBlockThreshold.BLOCK_ONLY_HIGH),
                    google_genai.types.SafetySetting(category=google_genai.types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold=google_genai.types.HarmBlockThreshold.BLOCK_ONLY_HIGH),
                    google_genai.types.SafetySetting(category=google_genai.types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold=google_genai.types.HarmBlockThreshold.BLOCK_ONLY_HIGH),
                    google_genai.types.SafetySetting(category=google_genai.types.HarmCategory.HARM_CATEGORY_HARASSMENT, threshold=google_genai.types.HarmBlockThreshold.BLOCK_ONLY_HIGH),
                ]
            )
        )
        return resp.text

    try:
        raw = ""
        import asyncio
        from google.api_core import exceptions as google_exceptions
        max_retries = 3
        for attempt in range(max_retries):
            try:
                loop = asyncio.get_event_loop()
                task = loop.run_in_executor(None, _call)
                raw = await asyncio.wait_for(task, timeout=30.0)
                raw = raw.strip()
                break
            except google_exceptions.ResourceExhausted:
                wait_time = 2 ** attempt
                logger.warning(f"Rate Limit beim Branding Extract. Warte {wait_time}s...")
                await asyncio.sleep(wait_time)
            except google_exceptions.ServiceUnavailable:
                logger.warning("Server überlastet beim Branding Extract. Kurze Pause...")
                await asyncio.sleep(5)
            except Exception as exc:
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt
                    logger.warning(f"Branding Extract API Error (attempt {attempt+1}/{max_retries}): {exc}. Retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    raise exc

        if raw.startswith("```"):
            parts = raw.split("```")
            raw = parts[1] if len(parts) > 1 else raw
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
            
        data = json.loads(raw)
        return {
            "primaryColor": data.get("primaryColor", "#ffffff"),
            "brandColor": data.get("brandColor", "#007AFF"),
            "accentColor": data.get("accentColor", "#FF2D55"),
            "keywords": data.get("keywords", "")
        }
    except Exception as e:
        logger.error(f"Failed to extract branding with Gemini: {e}")
        return {
            "primaryColor": "#ffffff",
            "brandColor": "#007AFF",
            "accentColor": "#FF2D55",
            "keywords": "Fehler bei der Analyse"
        }

# ── Source aggregation ────────────────────────────────────────────────────────

async def aggregate_sources(sources: list[dict]) -> str:
    """
    Aggregate content from all active sources into a single context block.
    Sources can be RSS feeds, URLs, or keywords.
    """
    parts: list[str] = []

    async def _handle(src: dict) -> None:
        if not src.get("is_active", True):
            return
        kind = src.get("source_type", "")
        if kind == "rss" and src.get("url"):
            headlines = await fetch_rss_headlines(src["url"])
            if headlines:
                parts.append(f"[RSS: {src['url']}]\n" + "\n".join(headlines))
        elif kind == "url" and src.get("url"):
            text = await crawl_page(src["url"])
            if text:
                parts.append(f"[URL: {src['url']}]\n{text[:2000]}")
        elif kind == "keyword" and src.get("keyword"):
            parts.append(f"[KEYWORD TREND]: {src['keyword']}")

    await asyncio.gather(*[_handle(s) for s in sources])
    return "\n\n".join(parts)[:8000]


# ── Gemini topic picker ───────────────────────────────────────────────────────

TOPIC_DISCOVERY_PROMPT = """\
Du bist ein erfahrener Content-Stratege und SEO-Experte.

Du erhältst zwei Informationsquellen:
1. Die aktuelle Website eines Kunden (Homepage + Blog). Verstehe die Nische, das Produkt und den Schreibstil.
2. Aktuelle Quellen (RSS-Feeds, URLs, Keywords) mit frischen Themen und Trends aus dem Internet.

Deine Aufgabe:
- Analysiere die Nische des Kunden.
- Gleiche sie mit den aktuellen Trends in den Quellen ab.
- Wähle {n} sehr spezifische, SEO-starke Blog-Themen, die:
  a) Exakt zur Nische des Kunden passen.
  b) Aktuell und für Leser relevant sind.
  c) Noch nicht auf der Website zu sehen sind.
  d) Ein konkretes Suchvolumen-Potenzial haben.

Antworte **ausschließlich** mit einem JSON-Array von strings (keine Erklärungen, kein Markdown):
["Thema 1", "Thema 2", "Thema 3"]

KUNDEN-WEBSITE:
{site_content}

AKTUELLE QUELLEN:
{source_content}

BEREITS VERÖFFENTLICHTE/GEPLANTE THEMEN (Ausschlusskriterien! Niemals diese oder sehr ähnliche Themen generieren!):
{past_topics}
"""


async def discover_topics(
    site_url: str,
    sources: list[dict],
    count: int = 3,
    gemini_api_key: str = "",
    past_topics: list[str] | None = None,
) -> list[str]:
    """
    Full autonomous topic discovery:
    1. Crawl customer site
    2. Aggregate sources
    3. Ask Gemini to pick `count` unique topics
    4. Return the list of topic strings
    """
    import asyncio
    site_content, source_content = await asyncio.gather(
        analyse_customer_site(site_url),
        aggregate_sources(sources),
    )

    if not site_content and not source_content:
        # Absolute fallback – shouldn't happen in practice
        return [f"Top-Trends für {site_url}"]

    import json
    from google import genai as google_genai

    prompt = TOPIC_DISCOVERY_PROMPT.format(
        n=count,
        site_content=site_content or "(nicht erreichbar)",
        source_content=source_content or "(keine Quellen konfiguriert)",
        past_topics=json.dumps(past_topics or [], ensure_ascii=False),
    )

    client = google_genai.Client(api_key=gemini_api_key)

    def _call() -> str:
        resp = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=google_genai.types.GenerateContentConfig(
                safety_settings=[
                    google_genai.types.SafetySetting(category=google_genai.types.HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold=google_genai.types.HarmBlockThreshold.BLOCK_ONLY_HIGH),
                    google_genai.types.SafetySetting(category=google_genai.types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold=google_genai.types.HarmBlockThreshold.BLOCK_ONLY_HIGH),
                    google_genai.types.SafetySetting(category=google_genai.types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold=google_genai.types.HarmBlockThreshold.BLOCK_ONLY_HIGH),
                    google_genai.types.SafetySetting(category=google_genai.types.HarmCategory.HARM_CATEGORY_HARASSMENT, threshold=google_genai.types.HarmBlockThreshold.BLOCK_ONLY_HIGH),
                ]
            )
        )
        return resp.text

    import asyncio
    import logging
    from google.api_core import exceptions as google_exceptions
    logger = logging.getLogger(__name__)

    max_retries = 5
    raw = ""
    for attempt in range(max_retries):
        try:
            # We enforce a strict 60 second timeout per topic search
            loop = asyncio.get_event_loop()
            task = loop.run_in_executor(None, _call)
            raw = await asyncio.wait_for(task, timeout=60.0)
            raw = raw.strip()
            break
        except google_exceptions.ResourceExhausted:
            wait_time = 2 ** attempt
            logger.warning(f"Rate Limit erreicht. Warte {wait_time} Sekunden...")
            await asyncio.sleep(wait_time)
        except google_exceptions.ServiceUnavailable:
            logger.warning("Server überlastet. Kurze Pause...")
            await asyncio.sleep(5)
        except Exception as exc:
            if attempt < max_retries - 1:
                wait_time = 2 ** attempt
                logger.warning(f"Topic Discovery API Error/Timeout (attempt {attempt+1}/{max_retries}): {exc}. Retrying in {wait_time}s...")
                await asyncio.sleep(wait_time)
            else:
                logger.error(f"Topic Discovery failed permanently: {exc}")
                raise exc

    # Strip ```json fencing if present
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        topics = json.loads(raw)
        if isinstance(topics, list) and all(isinstance(t, str) for t in topics):
            return topics[:count]
    except (json.JSONDecodeError, ValueError):
        logger.warning("Topic discovery response was not valid JSON: %s", raw[:200])

    # Fallback: split by newlines and take first `count` non-empty lines
    lines = [l.strip().lstrip("-•123456789. ") for l in raw.splitlines() if l.strip()]
    return [l for l in lines if l][:count] or [f"Aktueller Trend auf {site_url}"]
