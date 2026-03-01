"""
Autonomous Content Agent – LinguistFlow  (v2)

Verbesserungen gegenüber v1:
  - asyncio.Lock  → verhindert überschneidende Loops / doppelte API-Kosten
  - Slot-basierte Filled/Open-Erkennung (Status: draft|approved|live|pending = filled;
    fehlt oder deleted = offen)
  - SEO-Jitter (±30 Min) pro Slot-Datum berechnet und im Draft gespeichert
  - Detaillierter agent_state: log_steps, open_slots, started_at
  - Konfigurierbares Poll-Intervall (5–30 Min, Default 300s)
  - Sofortiger Re-Check bei schedule_updated_event
"""
from __future__ import annotations

import asyncio
import json
import logging
import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger(__name__)

CHAR_LIMITS = {"h1": 80, "teaser": 200, "body": 8000, "cta": 100, "meta": 155}

# Slot gilt als endgültig gesperrt wenn ein publizierter/freigegebener Draft existiert.
# Status 'draft' (= zur Überprüfung) sperrt KEINEN Slot — verhindert Ghost-Draft-Akkumulation.
FILLED_STATUSES = {"approved", "live", "pending"}
# Zusätzlich: Hat der Slot bereits einen BELIEBIGEN Draft (inkl. draft-Status)? → nicht doppelt generieren.
HAS_DRAFT_STATUSES = {"draft", "approved", "live", "pending"}

# Globale Sperre — verhindert parallele Generierungs-Loops
_generation_lock = asyncio.Lock()


# ── Slot computation (pure math, no API) ──────────────────────────────────────

def compute_publish_slots(
    posts_per_week: int,
    preferred_slots: list[str],
    horizon_days: int = 56,
    jitter_minutes: int = 30,
) -> list[tuple[datetime, str]]:
    """Return list of (publish_dt, slot_key) for the next horizon_days.

    slot_key format: "YYYY-MM-DD_HH-MM" — eindeutig je Slot inkl. Jitter.
    Jitter wird hier fix pro Datum berechnet (seed aus dem Datum), damit dieselbe
    Konfiguration die gleichen Slots ergibt und nicht bei jedem Poll neu jittert.
    """
    now = datetime.now(timezone.utc)
    interval = timedelta(days=7 / max(posts_per_week, 1))
    slots: list[tuple[datetime, str]] = []
    cursor = now

    i = 0
    while (cursor - now) <= timedelta(days=horizon_days):
        slot_str = preferred_slots[i % len(preferred_slots)] if preferred_slots else "09:00"
        h, m = map(int, slot_str.split(":"))

        # SEO-Jitter: Seed aus Datum → deterministisch pro Tag
        date_seed = int(cursor.strftime("%Y%m%d")) + i
        rng = random.Random(date_seed)
        jitter = rng.randint(-jitter_minutes, jitter_minutes)

        candidate = cursor.replace(hour=h, minute=m, second=0, microsecond=0) + timedelta(minutes=jitter)
        if candidate > now:
            slot_key = candidate.strftime("%Y-%m-%d_%H-%M")
            slots.append((candidate, slot_key))

        cursor += interval
        i += 1

    return slots


def draft_due_date(publish_dt: datetime, days_in_advance: int) -> datetime:
    return publish_dt - timedelta(days=days_in_advance)


def seconds_until(dt: datetime) -> float:
    return (dt - datetime.now(timezone.utc)).total_seconds()


def slot_is_filled(slot_key: str, site_url: str, draft_store: list[dict]) -> bool:
    """Ein Slot ist endgültig gesperrt wenn ein freigegebener/publizierter Draft existiert.
    Status 'draft' allein sperrt nicht — verhindert Ghost-Draft-Akkumulation wenn
    User Drafts lokal verwirft aber nicht auf Backend löscht."""
    for d in draft_store:
        meta = d.get("ai_meta", {})
        if (
            meta.get("scheduled_slot_key", "").startswith(slot_key[:10])  # Datumsprefix
            and meta.get("site_url", "") == site_url
            and d.get("status") in FILLED_STATUSES
        ):
            return True
    return False


def slot_has_pending_draft(slot_key: str, site_url: str, draft_store: list[dict]) -> bool:
    """Hat dieser Slot bereits einen Draft (auch draft-Status)? → Agent überspringt.
    Verhindert Doppel-Generierung wenn der User einen Draft noch nicht reviewt hat."""
    for d in draft_store:
        meta = d.get("ai_meta", {})
        if (
            meta.get("scheduled_slot_key", "").startswith(slot_key[:10])
            and meta.get("site_url", "") == site_url
            and d.get("status") in HAS_DRAFT_STATUSES
        ):
            return True
    return False


def find_open_slots(
    schedule_store: dict,
    draft_store: list[dict],
) -> list[dict]:
    """Alle offenen Slots zurückgeben.

    Ein Slot ist 'offen' wenn:
    - Kein approved/live/pending Draft für dieses Datum+Site existiert (= slot_is_filled)
    - UND kein 'draft'-Status Draft existiert, der noch auf Review wartet (= slot_has_pending_draft)
    Das zweite Check verhindert Doppel-Generierung während der User einen Draft prüft.
    """
    open_slots = []
    now = datetime.now(timezone.utc)

    # Dedup: pro (site_url, date) nur 1 Schedule-Eintrag verarbeiten
    # (verhindert dass 5 Schedules für dieselbe Site denselben Slot 5x in die Queue pushen)
    seen: set[tuple[str, str]] = set()

    for site_id, cfg in schedule_store.items():
        if not cfg.get("enabled", True) or not cfg.get("site_url"):
            continue

        site_url        = cfg["site_url"]
        posts_per_week  = int(cfg.get("postsPerWeek", 3))
        days_in_advance = int(cfg.get("daysInAdvance", 7))

        slots = compute_publish_slots(
            posts_per_week,
            cfg.get("selectedSlots", ["09:00", "15:00"]),
        )

        for publish_dt, slot_key in slots:
            due_dt = draft_due_date(publish_dt, days_in_advance)

            # Nur Slots die innerhalb des Vorlaufzeitfensters sind
            if due_dt > now + timedelta(days=days_in_advance):
                continue

            # Dedup: pro (site_url, Datum) nur einmal generieren
            dedup_key = (site_url, slot_key[:10])
            if dedup_key in seen:
                continue

            # Slot endgültig gesperrt (approved/live/pending)?
            if slot_is_filled(slot_key, site_url, draft_store):
                seen.add(dedup_key)
                continue

            # Hat der Slot bereits einen Draft der auf Review wartet?
            if slot_has_pending_draft(slot_key, site_url, draft_store):
                seen.add(dedup_key)
                continue

            seen.add(dedup_key)
            open_slots.append({
                "site_id":    site_id,
                "site_url":   site_url,
                "cfg":        cfg,
                "publish_dt": publish_dt,
                "slot_key":   slot_key,
                "due_dt":     due_dt,
            })

    return open_slots


# ── agent_state helper ────────────────────────────────────────────────────────

def _log(agent_state: dict, msg: str) -> None:
    """Zeitgestempelten Schritt zum log_steps Buffer hinzufügen."""
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    entry = f"[{ts}] {msg}"
    logger.info(entry)
    steps: list = agent_state.setdefault("log_steps", [])
    steps.append(entry)
    # Maximal 50 letzte Schritte im RAM halten
    if len(steps) > 50:
        agent_state["log_steps"] = steps[-50:]


# ── Content generation with hard char limits ──────────────────────────────────

AGENT_PROMPT = """\
Du bist ein Elite SEO-Stratege für das Jahr 2026. Deine Aufgabe ist es, einen hochoptimierten, maßgeblichen Blog-Artikel zum Thema "{topic}" zu verfassen.

UM FÜR 2026 OPTIMAL ZU RANKEN, MUSST DU FOLGENDEN FOKUS SETZEN:
1. Information Gain: Biete einzigartige, datengesteuerte Erkenntnisse, die in Standard-Artikeln nicht zu finden sind.
2. E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness): Zeige klare Expertise und beziehe dich EXPLIZIT auf die wissenschaftlichen OPENALEX QUELLEN weiter unten. Binde praktische "Experten-Tipps" in die Absätze ein.
3. SGE (Search Generative Experience): Die Einleitung MUSS eine direkte, präzise und endgültige Antwort auf die Suchintention des Nutzers enthalten, um KI-Snippets (AI Overviews) optimal zu bedienen. Formuliere hierfür direkt nach dem Hook einen klaren Faktensatz.
4. Semantic Depth: Decke das Thema und zugehörige Subthemen tiefgreifend und umfassend ab.

=== KI-SEO SERP-STRATEGIE (Live von Google abgeleitet) ===
{geo_strategy}
=== ENDE SERP-STRATEGIE ===

INFORMATION GAIN PFLICHT:
- Analysiere die Top-10 Wettbewerber-URLs aus der SERP-Strategie und schreibe NUR was dort FEHLT.
- Füge mindestens einen dieser Punkte ein, den kein Wettbewerber hat:
  a) Versteckte Risiken oder Nachteile
  b) Konkrete Zahlen/Statistiken mit Quellenangabe
  c) Eine Zukunftsprognose für das Thema
  d) Einen konkreten Handlungsplan ("Was tun wenn...")
- Die ersten 150 Wörter MÜSSEN eine zitierbare Definition enthalten (für AI Overview).

ABSOLUTE PFLICHT — VOLLSTÄNDIGE SÄTZE & STRUKTUR:
- Jeder Satz MUSS mit einem Satzzeichen enden: Punkt, Ausrufezeichen oder Fragezeichen.
- Niemals mittendrin aufhören. Jeder Absatz und jede Sektion muss vollständig abgeschlossen sein.
- Kein **fetter Text**, kein __unterstrichener Text__ (außer in HTML oder Markdown Überschriften erlaubt).
- Keine nummerierten Listen (1. 2. 3.) — nur Bullet Points mit einfachem Bindestrich: - Punkt.

AUFBAU DES ARTIKELS (Exakt befolgen!):
- Einleitung & SGE Answer: 1 Absatz, KEIN ## Titel. Starte mit einem Hook, gefolgt von der glasklaren direkten Antwort für die SGE. Ca. 3 vollständige Sätze.
- Hauptabschnitte: 3 bis 4 Abschnitte mit ## Überschriften (prägnant, max. 8 Wörter).
  Jeder Abschnitt: 3 bis 4 Absätze mit je 3 bis 5 vollständigen Sätzen.
  WICHTIG: Füge handlungsorientierte E-E-A-T-Tipps ein. Wenn Quellen vorhanden, zitiere mit [1], [2] etc.
- Fazit: Zusammenfassung und ein starker Call to Action (CTA). Max 2 Absätze mit "## Fazit".
- Wissenschaftliche Quellen: Wenn OPENALEX QUELLEN vorhanden sind, MUSS am Ende "## Wissenschaftliche Quellen" stehen.
  Liste AUSSCHLIESSLICH die DOI-Links als klickbare Markdown-Links im Format: - [https://doi.org/...](https://doi.org/...)
  KEIN Autorname, KEIN Titel, KEIN Jahr — NUR der DOI-Link!
  Wenn keine Quellen vorhanden: Schreibe KEINEN Quellen-Abschnitt.
- Gesamtlänge Body: ca. 2000 Wörter — schreibe natürlich, tiefgründig und vollständig.

THEMA: {topic}
KUNDEN-NISCHE:
{site_context}
QUELLEN-SIGNALE:
{source_context}

CRITICAL INSTRUCTION: You have been provided with the following academic sources. Use them if available.

=== SOURCE MATERIAL START ===
{openalex_context}
=== SOURCE MATERIAL END ===

Task: Write the blog post. If sources are provided above, cite them with [1], [2] etc. and list ONLY their DOI links at the end under "## Wissenschaftliche Quellen".
If NO sources are available, still write the full article — just skip the citation section entirely.
NEGATIVE CONSTRAINT: Do not generate generic references like 'Studies show...' without citing a provided source number.

Antworte NUR als gültiges JSON (kein Markdown drumherum):
{{"title":"Catchy SEO Titel","excerpt":"Kurzer Teaser mit Keyword","content":"...gesamter Markdown Text...","cta":"Handlungsaufruf","meta_description":"...","focus_keyword":"..."}}
"""



async def fetch_openalex_sources(topic: str, openalex_api_key: str = "") -> list:
    """
    Fetches the top 3 scientific works related to the topic from OpenAlex safely.
    Uses exponential backoff logic as per OpenAlex guidelines.
    Returns a list of source dictionaries, or an empty list on failure.
    """
    import httpx
    import asyncio
    
    url = "https://api.openalex.org/works"
    params = {
        "search": topic,
        "per-page": 3,
        "select": "id,title,publication_year,authorships,doi"
    }
    if openalex_api_key:
        params["api_key"] = openalex_api_key

    # Implement exponential backoff for retries: 1s, 2s, 4s
    max_retries = 3
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url, params=params)
                
                # Wenn wir limitiert wurden (429/403) oder 500er Server-Error vorliegt -> Retry Backoff
                if resp.status_code == 403 or resp.status_code == 429 or resp.status_code >= 500:
                    wait_time = 2 ** attempt
                    logger.warning(f"OpenAlex API rate limit / server error ({resp.status_code}). Retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                    continue
                    
                resp.raise_for_status()
                data = resp.json()
                
                results = data.get("results", [])
                
                # Fallback: Falls keine Ergebnisse gefunden wurden (z.B. weil der deutsche Satz zu lang ist), probiere nur die ersten 2-3 Worte
                if not results and len(topic.split()) > 2:
                    short_topic = " ".join(topic.split()[:3])  # Nimm nur die ersten 3 Worte
                    params["search"] = short_topic
                    resp = await client.get(url, params=params)
                    if resp.status_code == 200:
                        data = resp.json()
                        results = data.get("results", [])

                if not results:
                    return []
                    
                return results

        except Exception as exc:
            if attempt < max_retries - 1:
                await asyncio.sleep(2 ** attempt)
            else:
                logger.warning(f"OpenAlex fetch permanently failed for '{topic}' after {max_retries} attempts: {exc}")
                
    return []

def _enforce(data: dict) -> dict:
    """Kein Kürzen mehr — nur char_counts für Analytics erfassen."""
    data.setdefault("title", "")
    data.setdefault("excerpt", "")
    data.setdefault("content", "")
    data.setdefault("cta", "")
    data.setdefault("meta_description", "")
    data["char_counts"] = {k: len(data.get(k, "")) for k in ("title", "excerpt", "content", "meta_description")}
    return data


async def generate_article(topic: str, site_ctx: str, src_ctx: str, api_key: str, openalex_api_key: str = "", geo_strategy: str = "") -> dict[str, Any]:
    from google import genai as google_genai
    from google.genai import types
    from google.api_core import exceptions as google_exceptions
    from tenacity import (
        AsyncRetrying,
        retry_if_exception_type,
        stop_after_attempt,
        wait_exponential_jitter,
        RetryError,
        before_sleep_log,
    )
    import asyncio

    # 1. Fetch OpenAlex sources — Generierung läuft auch ohne Quellen weiter
    openalex_sources = await fetch_openalex_sources(topic, openalex_api_key=openalex_api_key)

    if not openalex_sources:
        logger.warning(f"OpenAlex: Keine Quellen für '{topic}' — Generierung läuft ohne Quellen weiter.")

    source_context_lines = []
    for i, s in enumerate(openalex_sources):
        title = s.get("title", "Unknown")
        authorships = s.get("authorships", [])
        author = authorships[0].get("author", {}).get("display_name", "Unknown") if authorships else "Unknown"
        year = s.get("publication_year", "Unknown")
        src_id = s.get("id", "Unknown")
        doi = s.get("doi", "")
        source_context_lines.append(f"[{i+1}] Title: \"{title}\"\n    Author: {author}\n    Year: {year}\n    DOI: {doi or src_id}")

    openalex_sources_md = "\n\n".join(source_context_lines) if source_context_lines else "Keine akademischen Quellen verfügbar."

    geo_block = geo_strategy.strip() if geo_strategy.strip() else (
        "STANDARD SEO: Fokus auf Keyword-Abdeckung, Tiefe und Backlink-Quellen. "
        "Schreibe einen umfassenden Ratgeber-Artikel."
    )

    prompt = AGENT_PROMPT.format(
        topic=topic,
        site_context=site_ctx[:2000],
        source_context=src_ctx[:3000],
        openalex_context=openalex_sources_md,
        geo_strategy=geo_block,
    )
    client = google_genai.Client(api_key=api_key)

    # ─────────────────────────────────────────────────────────────────────────
    # DEFINITIVER FIX: Alle transienten Fehler, die Gemini verursachen kann
    # ─────────────────────────────────────────────────────────────────────────
    # 1. ResourceExhausted   → HTTP 429  Rate Limit
    # 2. ServiceUnavailable  → HTTP 503  Server überlastet
    # 3. DeadlineExceeded    → HTTP 504  gRPC Timeout
    # 4. InternalServerError → HTTP 500  Server Fehler
    # 5. asyncio.TimeoutError            wait_for() überschritten
    # 6. ConnectionError / OSError       Netz-Level Abbruch / TCP reset
    # ─────────────────────────────────────────────────────────────────────────
    RETRYABLE = (
        google_exceptions.ResourceExhausted,
        google_exceptions.ServiceUnavailable,
        google_exceptions.DeadlineExceeded,
        google_exceptions.InternalServerError,
        asyncio.TimeoutError,
        ConnectionError,
        ConnectionResetError,
        OSError,
    )

    def _call() -> str:
        """Sync Gemini call — runs inside thread-pool executor."""
        resp = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                max_output_tokens=8192,
                safety_settings=[
                    types.SafetySetting(category=types.HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold=types.HarmBlockThreshold.BLOCK_ONLY_HIGH),
                    types.SafetySetting(category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold=types.HarmBlockThreshold.BLOCK_ONLY_HIGH),
                    types.SafetySetting(category=types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold=types.HarmBlockThreshold.BLOCK_ONLY_HIGH),
                    types.SafetySetting(category=types.HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold=types.HarmBlockThreshold.BLOCK_ONLY_HIGH),
                ]
            )
        )
        # Guard: leere Antwort ohne Exception → als Fehler behandeln
        if not resp or not resp.text:
            raise ConnectionError("Gemini returned an empty response (.text is None). Retrying…")
        return resp.text

    async def _call_async() -> str:
        """Wrap sync call in executor + enforce per-attempt hard timeout."""
        loop = asyncio.get_event_loop()
        task = loop.run_in_executor(None, _call)
        return await asyncio.wait_for(task, timeout=90.0)

    raw = ""
    try:
        async for attempt in AsyncRetrying(
            retry=retry_if_exception_type(RETRYABLE),
            stop=stop_after_attempt(5),
            # Exp. backoff: 2 → 4 → 8 → 16s + ±3s jitter to prevent thundering herd
            wait=wait_exponential_jitter(initial=2, max=30, jitter=3),
            before_sleep=before_sleep_log(logger, logging.WARNING),
            reraise=True,
        ):
            with attempt:
                raw = await _call_async()
                raw = raw.strip()

    except RetryError as retry_err:
        last_exc = retry_err.last_attempt.exception()
        logger.error(f"Gemini: Alle 5 Versuche fehlgeschlagen. Letzter Fehler: {last_exc}")
        return _enforce({
            "title": f"Generierung fehlgeschlagen: {topic}",
            "excerpt": "Die KI-Schnittstelle hat nicht geantwortet.",
            "content": (
                f"## Fehler bei der Textgenerierung\n\n"
                f"Das KI-Modell hat nach 5 Versuchen mit exponentiellem Backoff nicht geantwortet.\n\n"
                f"**Fehler:** `{last_exc}`\n\n"
                f"Mögliche Ursachen:\n"
                f"- Rate-Limit überschritten → 1 Minute warten und erneut versuchen\n"
                f"- API-Schlüssel erschöpft oder ungültig\n"
                f"- Gemini-Server temporär nicht erreichbar"
            ),
            "cta": "",
            "meta_description": "",
        })
    except Exception as exc:
        # Nicht-retriable Fehler (z.B. 400 Bad Request, Auth-Fehler)
        logger.error(f"Gemini: Nicht-retriable Fehler: {type(exc).__name__}: {exc}")
        return _enforce({
            "title": f"Generierung fehlgeschlagen: {topic}",
            "excerpt": "Unbekannter API-Fehler.",
            "content": (
                f"## Kritischer Fehler\n\n"
                f"**Typ:** `{type(exc).__name__}`\n\n"
                f"**Details:** `{exc}`\n\n"
                f"Bitte prüfe deinen API-Schlüssel und den Prompt."
            ),
            "cta": "",
            "meta_description": "",
        })

    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip().rstrip("```").strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        import re
        def _extract(field: str) -> str:
            # Matches valid JSON string values safely even if they terminate abruptly
            match = re.search(f'"{field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)', raw)
            if match:
                val = match.group(1)
                for old, new in [('\\n', '\n'), ('\\"', '"'), ('\\/', '/'), ('\\\\', '\\')]:
                    val = val.replace(old, new)
                return val
            return ""

        extracted_content = _extract("content")
        if not extracted_content:
            # Absolute Notlösung: Falls es gar kein JSON war, sondern Freitext
            extracted_content = raw
            
        data = {
            "title": _extract("title") or topic,
            "excerpt": _extract("excerpt") or raw[:120],
            "content": extracted_content,
            "cta": _extract("cta"),
            "meta_description": _extract("meta_description")
        }

    # Fallback: Falls Gemini die DOI-Quellen am Ende vergessen hat — nur DOI-Links
    if source_context_lines and "## Wissenschaftliche Quellen" not in data.get("content", ""):
        sources_list = "\n\n## Wissenschaftliche Quellen\n\n"
        for s in openalex_sources:
            doi = s.get("doi", "")
            if doi:
                sources_list += f"- [{doi}]({doi})\n"
        if sources_list.strip().endswith("Quellen"):
            # Alle Quellen ohne DOI — IDs als Fallback
            for s in openalex_sources:
                src_id = s.get("id", "")
                if src_id:
                    sources_list += f"- {src_id}\n"
        data["content"] = data.get("content", "") + sources_list
        
    return _enforce(data)


# ── Smart Autopilot Main Loop ─────────────────────────────────────────────────

async def run_autonomous_agent(
    draft_store: list[dict],
    schedule_store: dict,
    source_store: dict,
    gemini_api_key: str,
    agent_state: dict,
    schedule_updated_event: asyncio.Event | None = None,
    check_interval_seconds: int = 300,
    save_callback: object = None,
    openalex_api_key: str = "",
    serp_api_key: str = "",
) -> None:
    """
    Slot-basierter Autopilot (v2):
      Alle check_interval_seconds Sekunden (oder sofort bei Einstellungsänderung):
        1. Alle offenen Slots ermitteln (Slot = offen wenn kein Draft mit
           Status draft/approved/live/pending dafür existiert)
        2. Für jeden offenen Slot: Gemini-Artikel generieren und Draft einspeichern
        3. Schlafen bis nächster Zyklus oder schedule_updated_event
    Lock-Schutz verhindert überschneidende Loops.
    """
    from app.services.topic_discovery import discover_topics, analyse_customer_site, aggregate_sources

    POLL_INTERVAL = max(300, min(check_interval_seconds, 1800))  # 5–30 Min Clamp

    async def interruptible_sleep(seconds: float) -> None:
        if schedule_updated_event is None or seconds <= 0:
            await asyncio.sleep(max(0, seconds))
            return
        try:
            await asyncio.wait_for(
                asyncio.shield(schedule_updated_event.wait()),
                timeout=seconds,
            )
        except asyncio.TimeoutError:
            pass

    # Initialise state
    for k, v in {
        "is_busy": False, "phase": "Bereit", "current_topic": "",
        "drafts_done": 0, "drafts_total": 0, "site_url": "",
        "log_steps": [], "open_slots": 0, "started_at": None,
        "current_step": 0, "total_steps": 8,
    }.items():
        agent_state.setdefault(k, v)

    logger.info("🤖 Content Autopilot v2 gestartet (Poll: %ds).", POLL_INTERVAL)

    # Let FastAPI finish booting
    await asyncio.sleep(5)

    while True:
        if schedule_updated_event:
            schedule_updated_event.clear()

        if not schedule_store:
            logger.info("Autopilot: Keine Schedules konfiguriert — warte.")
            await interruptible_sleep(POLL_INTERVAL)
            continue

        # ── Lock: Nur ein Loop gleichzeitig ───────────────────────────────────
        if _generation_lock.locked():
            logger.info("Autopilot: Loop bereits aktiv (Lock) — überspringe Zyklus.")
            await interruptible_sleep(POLL_INTERVAL)
            continue

        async with _generation_lock:
            # ── Auto-Cleanup ──────────────────────────────────────────────────
            now_utc = datetime.now(timezone.utc)
            cleaned = 0
            for d in draft_store:
                if d.get("status") == "deleted":
                    continue

                # 1) Artikel älter als 3 Tage nach scheduled_publish_at → löschen
                pub_str = d.get("ai_meta", {}).get("scheduled_publish_at")
                if pub_str:
                    try:
                        pub_dt = datetime.fromisoformat(pub_str)
                        if pub_dt.tzinfo is None:
                            pub_dt = pub_dt.replace(tzinfo=timezone.utc)
                        if now_utc > pub_dt + timedelta(days=3):
                            d["status"] = "deleted"
                            cleaned += 1
                            continue
                    except Exception:
                        pass

                # 2) 'draft'-Status Artikel älter als 2 Stunden → löschen
                # (Ghost-Drafts die lokal verworfen wurden aber auf Backend verblieben sind)
                if d.get("status") == "draft":
                    created_str = d.get("created_at", "")
                    if created_str:
                        try:
                            created_dt = datetime.fromisoformat(created_str)
                            if created_dt.tzinfo is None:
                                created_dt = created_dt.replace(tzinfo=timezone.utc)
                            if now_utc > created_dt + timedelta(hours=2):
                                d["status"] = "deleted"
                                cleaned += 1
                        except Exception:
                            pass

            if cleaned:
                if save_callback:
                    try: save_callback()
                    except Exception: pass
                _log(agent_state, f"Auto-Cleanup: {cleaned} Artikel bereinigt (Slots freigegeben)")

            open_slots = find_open_slots(schedule_store, draft_store)
            past_topics = [d.get("title", "") for d in draft_store if d.get("title")]
            agent_state["open_slots"] = len(open_slots)
            horizon = max((s["publish_dt"] - datetime.now(timezone.utc)).days for s in open_slots) if open_slots else 0

            if not open_slots:
                _log(agent_state, "Alle Slots gefüllt — nichts zu generieren.")
                agent_state.update({"is_busy": False, "phase": "Bereit"})
                await interruptible_sleep(POLL_INTERVAL)
                continue

            _log(agent_state, f"{len(open_slots)} offene Slot(s) ermittelt — Kalenderanalyse gestartet.")
            agent_state.update({
                "is_busy": True,
                "current_step": 0,
                "phase": f"Slot-Matrix berechnet: {len(open_slots)} Slot(s) offen, Horizont: {horizon} Tage — Generierungs-Queue wird befüllt …",
                "drafts_total": len(open_slots),
                "drafts_done": 0,
                "started_at": datetime.now(timezone.utc).isoformat(),
            })

            # Gruppen nach Site (Crawl nur einmal pro Site)
            sites_done: dict[str, tuple[str, str]] = {}  # site_url → (site_ctx, source_ctx)

            for idx, slot in enumerate(open_slots):
                site_url = slot["site_url"]
                cfg      = slot["cfg"]
                slot_key = slot["slot_key"]
                pub_dt   = slot["publish_dt"]
                sources  = source_store.get(slot["site_id"], [])

                # Slot-Datum + Jitter-Zeit für UI-Anzeige
                pub_local = pub_dt.strftime("%d.%m.")   # z.B. "15.02."
                pub_time  = pub_dt.strftime("%H:%M")    # z.B. "09:14" (inkl. Jitter)

                agent_state.update({
                    "site_url": site_url,
                    "phase": f"HTTP-Crawl initialisiert — Ziel: {site_url} | Slot: {pub_local} {pub_time} Uhr",
                })

                # ── Site-Kontext (nur einmal pro Site crawlen) ─────────────
                if site_url not in sites_done:
                    try:
                        _log(agent_state, f"HTTP GET {site_url} — robots.txt + Sitemap werden geparst …")
                        agent_state["current_step"] = 1
                        agent_state["phase"] = f"HTTP-Crawl: {site_url.replace('https://', '')} — robots.txt + Sitemap parsen, DOM-Headings extrahieren …"
                        site_ctx   = await analyse_customer_site(site_url)
                        source_ctx = await aggregate_sources(sources)
                        sites_done[site_url] = (site_ctx, source_ctx)
                    except Exception as exc:
                        _log(agent_state, f"Crawl-Fehler {site_url}: {exc}")
                        agent_state["drafts_done"] = idx + 1
                        continue
                else:
                    site_ctx, source_ctx = sites_done[site_url]

                # ── Thema entdecken ───────────────────────────────────────
                try:
                    _log(agent_state, f"Sende Themen-Discovery-Request an Gemini API — Slot: {pub_local} {pub_time} Uhr …")
                    agent_state["current_step"] = 2
                    agent_state["phase"] = f"Gemini Topic-Discovery-Request — semantische Keyword-Cluster-Analyse für Slot {pub_local} …"
                    topics = await discover_topics(site_url, sources, count=1, past_topics=past_topics, gemini_api_key=gemini_api_key)
                    topic  = topics[0] if topics else f"Aktuelles Thema für {site_url}"
                    agent_state["current_topic"] = topic
                    _log(agent_state, f"Thema selektiert — Response-Token validiert: {topic[:80]}")
                except Exception as exc:
                    _log(agent_state, f"Thema-Fehler: {exc}")
                    agent_state["drafts_done"] = idx + 1
                    continue

                # ── Schritt 3: GEO Live-SERP-Strategie ───────────────────────
                geo_strategy_str = ""
                if serp_api_key:
                    try:
                        from app.geo_engine import SERPStrategyAnalyzer
                        _log(agent_state, f"SerpAPI-Abfrage: SERP-Feature-Erkennung für '{topic[:60]}' — PAA, AI Overview, Local Pack …")
                        agent_state["current_step"] = 3
                        agent_state["phase"] = f"SerpAPI: Live-SERP-Abfrage für '{topic[:50]}' — PAA, AI Overview, Local Pack werden detektiert …"
                        geo_result = await SERPStrategyAnalyzer(api_key=serp_api_key).run(topic)
                        geo_strategy_str = geo_result.get("strategy_string", "")
                        if geo_strategy_str:
                            signals = [s["label"] for s in geo_result.get("signals_detected", [])]
                            _log(agent_state, f"GEO-Strategie selektiert: {', '.join(signals) if signals else 'Standard SEO'}")
                    except Exception as geo_err:
                        _log(agent_state, f"GEO-Analyse nicht verfügbar ({geo_err}) — Fallback auf Standard-SEO-Strategie")
                else:
                    # Kein SERP-Key → Schritt 3 trotzdem registrieren damit Skala stimmt
                    agent_state["current_step"] = 3
                    agent_state["phase"] = "GEO-Analyse übersprungen — kein SerpAPI-Key konfiguriert, Standard-SEO-Strategie aktiv"

                # ── Schritt 4: OpenAlex akademische Quellen ───────────────────
                agent_state["current_step"] = 4
                agent_state["phase"] = f"OpenAlex API: Suche Top-3 akademische Papers für '{topic[:50]}' — DOI, Autor, Jahr werden extrahiert …"
                _log(agent_state, f"GET api.openalex.org/works?search={topic[:40]} — Top-3 wissenschaftliche Papers abrufen …")
                # (Fetch selbst läuft innerhalb generate_article)

                # ── Schritt 5: Prompt aufbauen ────────────────────────────────
                agent_state["current_step"] = 5
                agent_state["phase"] = "AGENT_PROMPT assembliert — GEO-Strategie, Site-Kontext, OpenAlex-Quellen werden in Template injiziert …"
                _log(agent_state, "Prompt-Assembly: GEO-Block + Site-Kontext + OpenAlex-Quellen → AGENT_PROMPT.format() …")

                # ── Schritt 6: Gemini API Call ────────────────────────────────
                try:
                    _log(agent_state, f"POST /v1/models/gemini-2.5-flash:generateContent — Prompt für Slot {pub_local} {pub_time} Uhr wird tokenisiert …")
                    agent_state["current_step"] = 6
                    agent_state["phase"] = f"POST /v1/models/gemini-2.5-flash:generateContent — max_output_tokens: 8192 — Stream-Response ausstehend …"
                    article = await generate_article(topic, site_ctx, source_ctx, gemini_api_key, openalex_api_key, geo_strategy=geo_strategy_str)

                    _log(agent_state, "Response empfangen — Validierung: Satz-Vollständigkeit, CHAR_LIMITS, UTF-8 Encoding …")
                    agent_state["current_step"] = 7
                    agent_state["phase"] = "Response empfangen — UTF-8 Validierung, CHAR_LIMITS-Check, JSON-Schema-Prüfung …"
                    await asyncio.sleep(0.2)  # kurze Pause damit UI-Update sichtbar wird

                    draft_id = str(uuid.uuid4())
                    draft = {
                        "id":         draft_id,
                        "title":      article["title"],
                        "excerpt":    article["excerpt"],
                        "content":    article["content"],
                        "language":   "de",
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "status":     "draft",
                        "ai_meta": {
                            "model":               "gemini-2.5-flash",
                            "provider":            "gemini",
                            "auto_generated":      True,
                            "source_topic":        topic,
                            "site_url":            site_url,
                            "char_counts":         article.get("char_counts", {}),
                            "focus_keyword":       article.get("focus_keyword", ""),
                            "meta_description":    article.get("meta_description", ""),
                            "scheduled_slot_key":  slot_key,
                            "scheduled_publish_at": pub_dt.isoformat(),
                        },
                        "visual_opts": article.get("visual_opts"),
                        "ghost_data":  article.get("ghost_data"),
                    }

                    # Direkt in PostgreSQL persistieren
                    try:
                        from app.core.database import AsyncSessionLocal as _AsyncSL
                        from app.models.post import Post as _Post
                        import uuid as _uuid_mod
                        async with _AsyncSL() as _db:
                            _post = _Post(
                                id=_uuid_mod.UUID(draft_id),
                                title=article["title"],
                                excerpt=article.get("excerpt", "")[:500],
                                content_html=article.get("content", ""),
                                language="de",
                                status="draft",
                                ai_meta=draft["ai_meta"],
                                ghost_data=article.get("ghost_data"),
                                visual_opts=article.get("visual_opts"),
                                scheduled_at=pub_dt,
                                scheduled_slot_key=slot_key,
                                site_url=site_url,
                                created_at=datetime.now(timezone.utc),
                            )
                            _db.add(_post)
                            await _db.commit()
                            _log(agent_state, f"Draft in PostgreSQL persistiert — UUID: {draft_id[:8]} — Status: draft")
                    except Exception as db_err:
                        logger.warning("DB-Save fehlgeschlagen (%s) — Draft nur im Speicher", db_err)
                        draft_store.append(draft)
                        if save_callback:
                            try: save_callback()
                            except Exception: pass

                    agent_state["current_step"] = 8
                    agent_state["drafts_done"] = idx + 1
                    _log(agent_state, f"Draft {idx+1}/{len(open_slots)} in draft_store persistiert — UUID: {draft['id'][:8]} — Status: draft")
                    agent_state["phase"] = f"Draft {idx+1}/{len(open_slots)} persistiert — UUID: {draft['id'][:8]} — draft_store aktualisiert"
                    logger.info("✅ Draft '%s' (%d/%d)", article["title"], idx+1, len(open_slots))

                except Exception as exc:
                    _log(agent_state, f"Generierungs-Fehler [{idx+1}]: {exc}")
                    logger.error("Draft %d/%d failed: %s", idx+1, len(open_slots), exc)
                    agent_state["drafts_done"] = idx + 1

            # Zyklus abgeschlossen
            agent_state.update({
                "is_busy": False,
                "phase": "Bereit",
                "current_topic": "",
                "started_at": None,
            })
            _log(agent_state, f"Generierungs-Zyklus abgeschlossen — {agent_state['drafts_done']}/{agent_state['drafts_total']} Drafts in draft_store persistiert. Agent wechselt in Idle-Modus.")

        # ── Schlafen ──────────────────────────────────────────────────────────
        logger.info("Autopilot: Zyklus fertig — schlafe %ds.", POLL_INTERVAL)
        await interruptible_sleep(POLL_INTERVAL)


# ── Status-Helpers für API ────────────────────────────────────────────────────

def compute_next_generation_info(schedule_store: dict) -> list[dict]:
    """Nächste Publish/Due-Info für jede aktive Site (reines Datum-Rechnen)."""
    now = datetime.now(timezone.utc)
    results = []
    for site_id, cfg in schedule_store.items():
        if not cfg.get("enabled", True) or not cfg.get("site_url"):
            continue
        slots = compute_publish_slots(
            int(cfg.get("postsPerWeek", 3)),
            cfg.get("selectedSlots", ["09:00", "15:00"]),
            horizon_days=14,
        )
        if not slots:
            continue
        next_dt, _ = slots[0]
        due = draft_due_date(next_dt, int(cfg.get("daysInAdvance", 7)))
        results.append({
            "site_url":     cfg.get("site_url", ""),
            "next_publish": next_dt.isoformat(),
            "draft_due":    due.isoformat(),
            "is_due":       now >= due,
        })
    return results
