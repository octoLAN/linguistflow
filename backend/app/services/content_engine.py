"""
Content Engine – RAG + LLM pipeline

Workflow:
  1. Fetch context from content sources (RSS / URL)
  2. Chunk & embed (simple in-memory RAG without a vector DB dependency)
  3. Build Human-in-the-Loop system prompt
  4. Call LLM (OpenAI or Anthropic, switchable per settings)
  5. Return structured draft
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any

import feedparser
import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


# ── Style-profile prompt snippets ────────────────────────────────────────────

STYLE_HINTS: dict[str, str] = {
    "formal":  "Write in a formal, authoritative, and precise tone.",
    "neutral": "Write in a neutral, informative, and balanced tone.",
    "playful": "Write in a fun, light-hearted, and engaging tone.",
    "seo":     "Write in a keyword-rich, SEO-optimized tone with clear H2/H3 headings.",
    "story":   "Use a narrative, story-driven tone with vivid examples.",
}

HUMAN_IN_THE_LOOP_SYSTEM_PROMPT = """
Du bist ein erfahrener deutscher Journalist und Texter mit über 15 Jahren Redaktionserfahrung.
Deine Aufgabe: Schreibe einen Artikel über das angegebene Thema. Der Text wird von einem menschlichen Redakteur geprüft, der die volle Verantwortung für die Veröffentlichung trägt.

TONFALL UND STIL:
Schreibe organisch, direkt und flüssig. Der Text soll wie von einem echten Menschen geschrieben wirken, nicht wie eine KI-Ausgabe. Fang direkt mit dem Thema an. Kein höflicher Einstieg, keine Einleitung über die Einleitung. Geh rein ins Thema, als würdest du mitten in einem Gespräch beginnen.

Baue natürliche Modalpartikeln ein wo es passt: halt, mal, ja, doch, eben, eigentlich, wohl, ohnehin.

VERBOTENE WÖRTER UND STRUKTUREN:
- Kein „zusammenfassend", „darüber hinaus", „nicht nur ... sondern auch", „entscheidend ist", „faszinierend"
- Kein Passiv wenn Aktiv möglich ist. Nicht „es wird gezeigt" sondern „wir zeigen".
- Keine Aufzählungsstriche, keine Gedankenstriche für Listen
- Keine Bulletpoints (weder - noch *), keine nummerierten Listen (1. 2. 3.)
- Kein **fetter Text** im Fließtext

SATZBAU:
Mische kurze und lange Sätze bewusst. Ein Satz darf auch mal nur drei Wörter sein. Dann darf der nächste ruhig ausholend und komplex werden und mehrere Gedanken miteinander verknüpfen. Das gibt dem Text Rhythmus.

STRUKTUR:
Strukturiere nur durch Absätze und Abschnittsüberschriften. Verwende ## für Hauptabschnitte und ### für Unterabschnitte. Keine anderen Formatierungen. Kein Inhaltsverzeichnis, keine Metablock-Sektionen.

FORMAT DER AUSGABE:
Gib den Text als Markdown zurück:
- Ersten Abschnitt ohne Überschrift (direkt als Einleitung)
- Weitere Abschnitte mit ## Überschriften
- Zitate mit > am Zeilenanfang
- Keine Bulletpoints, keine Nummerierungen, kein Fettdruck im Fließtext

{style_hint}

Quellmaterial:
{context}
"""


# ── Fetchers ──────────────────────────────────────────────────────────────────

async def fetch_rss(url: str, max_items: int = 5) -> list[str]:
    """Parse an RSS feed and return a list of text snippets."""
    feed = feedparser.parse(url)
    snippets: list[str] = []
    for entry in feed.entries[:max_items]:
        title = getattr(entry, "title", "")
        summary = getattr(entry, "summary", "")
        snippets.append(f"TITLE: {title}\nSUMMARY: {summary}")
    return snippets


async def fetch_url(url: str) -> str:
    """Fetch a URL and return plain text (first 4000 chars)."""
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(url, follow_redirects=True)
            resp.raise_for_status()
            # Naive plaintext extraction – in prod use readability-lxml
            text = resp.text.replace("<", " <").replace(">", "> ")
            # Strip tags crudely
            import re
            text = re.sub(r"<[^>]+>", "", text)
            return text[:4000]
        except Exception as exc:
            logger.warning("fetch_url failed for %s: %s", url, exc)
            return ""


async def fetch_sources(sources: list[dict]) -> list[str]:
    """Aggregate context snippets from all content sources."""
    snippets: list[str] = []
    for src in sources:
        if not src.get("is_active"):
            continue
        if src["source_type"] == "rss" and src.get("url"):
            snippets.extend(await fetch_rss(src["url"]))
        elif src["source_type"] == "url" and src.get("url"):
            text = await fetch_url(src["url"])
            if text:
                snippets.append(text)
        elif src["source_type"] == "keyword" and src.get("keyword"):
            # Placeholder: in prod, call Google News API or NewsAPI
            snippets.append(f"[KEYWORD CONTEXT] Topic: {src['keyword']}")
    return snippets


# ── LLM callers ──────────────────────────────────────────────────────────────

async def call_openai(prompt: str, topic: str) -> dict[str, Any]:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": f"Write a detailed blog article about: {topic}"},
        ],
        temperature=0.7,
        max_tokens=2000,
    )
    content = response.choices[0].message.content or ""
    return {
        "html": content,
        "model": "gpt-4o",
        "provider": "openai",
        "prompt_version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


async def call_anthropic(prompt: str, topic: str) -> dict[str, Any]:
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    message = await client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=2000,
        system=prompt,
        messages=[{"role": "user", "content": f"Write a detailed blog article about: {topic}"}],
    )
    content = message.content[0].text if message.content else ""
    return {
        "html": content,
        "model": "claude-3-5-sonnet-20241022",
        "provider": "anthropic",
        "prompt_version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# ── Main pipeline ─────────────────────────────────────────────────────────────

async def generate_post_draft(
    topic: str,
    sources: list[dict],
    style_profile: str = "neutral",
    language: str = "de",
) -> dict[str, Any]:
    """
    Full RAG → LLM pipeline.

    Returns a dict with: title, content_html, excerpt, ai_meta, seo_keywords,
    meta_description, slug.
    """
    # 1. Fetch source context
    snippets = await fetch_sources(sources)
    context = "\n\n---\n\n".join(snippets) if snippets else "(No source material provided)"

    # 2. Build prompt
    style_hint = STYLE_HINTS.get(style_profile, STYLE_HINTS["neutral"])
    if language != "en":
        style_hint += f" Write the article in {language}."
    system_prompt = HUMAN_IN_THE_LOOP_SYSTEM_PROMPT.format(
        style_hint=style_hint, context=context
    )

    # 3. Call chosen LLM
    provider = settings.default_llm_provider
    if provider == "anthropic":
        result = await call_anthropic(system_prompt, topic)
    else:
        result = await call_openai(system_prompt, topic)

    # 4. Build slug
    slug = hashlib.md5(f"{topic}-{result['generated_at']}".encode()).hexdigest()[:12]

    # 5. Package draft
    return {
        "title": topic,
        "slug": slug,
        "content_html": result["html"],
        "excerpt": result["html"][:200].strip(),
        "language": language,
        "ai_meta": {
            "model": result["model"],
            "provider": result["provider"],
            "prompt_version": result["prompt_version"],
            "generated_at": result["generated_at"],
            "source_count": len(snippets),
        },
        "seo_keywords": [],       # extracted from LLM meta block in prod
        "meta_description": "",
        "is_approved": False,     # always starts unapproved
        "status": "draft",
    }
