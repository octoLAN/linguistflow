"""
LinguistFlow – FastAPI Application Entry Point
"""
import asyncio
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional, Any

from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import httpx
from pydantic import BaseModel

from app.core.config import get_settings
from app.services.compliance import NoIPLoggingMiddleware
from app.api.posts import router as posts_router
from app.api.blogs import router as blogs_router, widget_router
from app.api.content import router as content_router
from app.api.integrations import router as integrations_router
from app.api.auth import router as auth_router
from app.core.security import get_current_customer
from app.core.database import AsyncSessionLocal, init_db
from app.models.post import Post
from app.models.schedule import SiteSchedule
from sqlalchemy import select, update as sa_update

settings = get_settings()

# ── In-Memory Stores (nur für agent_state — ephemer, kein Persist nötig) ─────
# Draft- und Schedule-Daten jetzt in PostgreSQL (nicht mehr in JSON-Dateien)
# Backward-Compat: _draft_store + _schedule_store werden als DB-Proxy genutzt

_agent_state: dict = {             # live generation status — gestreamt via SSE
    "is_busy":       False,
    "phase":         "Bereit",
    "current_topic": "",
    "drafts_done":   0,
    "drafts_total":  0,
    "site_url":      "",
    "log_steps":     [],
    "open_slots":    0,
    "started_at":    None,
    "current_step":  0,
    "total_steps":   8,
}
_schedule_updated: asyncio.Event = asyncio.Event()

# ── DB helpers ────────────────────────────────────────────────────────────────

def post_to_dict(p: Post) -> dict:
    """Konvertiert Post-ORM-Objekt in kompatibles dict (wie bisheriger _draft_store)."""
    return {
        "id":         str(p.id),
        "title":      p.title,
        "excerpt":    p.excerpt or "",
        "content":    p.content_html or "",
        "language":   p.language,
        "status":     p.status,
        "template":   (p.ai_meta or {}).get("template", "default"),
        "created_at": p.created_at.isoformat() if p.created_at else "",
        "ai_meta":    p.ai_meta or {"model": "gemini", "provider": "gemini"},
        "visual_opts":    p.visual_opts,
        "visual_options": p.visual_opts,   # legacy alias
        "ghost_data":     p.ghost_data,
    }


async def _get_draft_store() -> list[dict]:
    """Lädt alle nicht-gelöschten Drafts aus der DB."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Post).where(Post.status != "deleted"))
        return [post_to_dict(p) for p in result.scalars().all()]


async def _get_schedule_store() -> dict:
    """Lädt alle Schedule-Configs aus der DB."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(SiteSchedule))
        return {s.site_id: s.to_dict() for s in result.scalars().all()}


async def _get_source_store() -> dict:
    """Lädt alle Sources aus der DB."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(SiteSchedule))
        return {s.site_id: s.sources or [] for s in result.scalars().all()}



# ── Lifespan: DB init + autonomous agent ─────────────────────────────────────
import logging as _logging
_log = _logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Datenbank-Tabellen erstellen (idempotent)
    try:
        await init_db()
        print("[LinguistFlow] PostgreSQL — Tabellen OK ✅")
    except Exception as db_err:
        print(f"[LinguistFlow] PostgreSQL nicht erreichbar — {db_err}")
        print("[LinguistFlow] WARNUNG: Fallback auf JSON-Dateien nicht mehr unterstützt.")
        print("[LinguistFlow] Bitte PostgreSQL starten oder Render/Railway DB konfigurieren.")

    # 2. Schedule-Event: Wecke Agent wenn DBSchedules vorhanden
    try:
        sched = await _get_schedule_store()
        if sched:
            print(f"[LinguistFlow] {len(sched)} Site-Schedule(s) in DB gefunden — Agent wird geweckt.")
            _schedule_updated.set()
    except Exception:
        pass

    # 3. Autonomen Agent starten
    gemini_key = settings.gemini_api_key
    print(f"[LinguistFlow] GEMINI_API_KEY: {'LOADED ✅' if gemini_key else 'MISSING ❌'}")
    if gemini_key:
        from app.services.autonomous_agent import run_autonomous_agent

        async def _draft_store_proxy():
            return await _get_draft_store()

        async def _schedule_store_proxy():
            return await _get_schedule_store()

        async def _source_store_proxy():
            return await _get_source_store()

        asyncio.create_task(
            _run_agent_with_db(
                gemini_key=gemini_key,
                agent_state=_agent_state,
                schedule_updated_event=_schedule_updated,
            )
        )
    yield


async def _run_agent_with_db(
    gemini_key: str,
    agent_state: dict,
    schedule_updated_event: asyncio.Event,
):
    """Startet den Agent-Loop mit DB-backed Stores."""
    from app.services.autonomous_agent import run_autonomous_agent

    # Wir übergeben direkt Referenzen auf DB-Abruf-Funktionen
    # Der Agent ruft save_callback() auf — wir nutzen das um die DB zu aktualisieren
    # Draft- und Schedule-Stores werden bei jedem Zyklus frisch aus der DB geladen
    while True:
        try:
            draft_store = await _get_draft_store()
            schedule_store = await _get_schedule_store()
            source_store = await _get_source_store()

            await run_autonomous_agent(
                draft_store=draft_store,
                schedule_store=schedule_store,
                source_store=source_store,
                gemini_api_key=gemini_key,
                agent_state=agent_state,
                schedule_updated_event=schedule_updated_event,
                check_interval_seconds=300,
                save_callback=lambda: None,   # DB-Save passiert inline im Agent
                openalex_api_key=getattr(settings, "openalex_api_key", ""),
                serp_api_key=getattr(settings, "serp_api_key", ""),
            )
        except Exception as agent_err:
            _log.exception("Agent Fehler: %s — Neustart in 30s", agent_err)
            await asyncio.sleep(30)


app = FastAPI(
    title="LinguistFlow API",
    version="0.1.0",
    description="GDPR-compliant AI blog SaaS – backend API",
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    lifespan=lifespan,
)

# ── Middleware ────────────────────────────────────────────────────────────────

# 1. GDPR – strip client IPs before any logging (MUST come before CORS)
app.add_middleware(NoIPLoggingMiddleware)

# 2. CORS – allow known frontend origins (dev: 5173 + 5174)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_origin,
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router)       # POST /api/auth/register, /api/auth/token
app.include_router(posts_router)
app.include_router(blogs_router)
app.include_router(content_router)
app.include_router(integrations_router)
app.include_router(widget_router)   # public widget feed – no auth


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "app": settings.app_name}

# ── Schedule config sync (called by frontend on every auto-save) ──────────────

class ScheduleConfigPayload(BaseModel):
    site_id:        str
    site_url:       str
    enabled:        bool        = True
    postsPerWeek:   int         = 3
    daysInAdvance:  int         = 7
    selectedSlots:  list[str]   = ["09:00", "15:00"]
    sources:        list[dict]  = []   # active source configs for this site


@app.post("/api/schedule_config", tags=["agent"])
async def push_schedule_config(payload: ScheduleConfigPayload):
    """Frontend calls this every time schedule settings change. Persisted in PostgreSQL.

    Deduplication by site_url: removes any existing entry for the same URL under a
    different site_id — prevents ghost configs from accumulating.
    """
    async with AsyncSessionLocal() as db:
        # Remove stale entries for same site_url under different site_id
        stale = await db.execute(
            select(SiteSchedule).where(
                SiteSchedule.site_url == payload.site_url,
                SiteSchedule.site_id != payload.site_id,
            )
        )
        for stale_entry in stale.scalars().all():
            print(f"[LinguistFlow] Removing stale config {stale_entry.site_id} for {payload.site_url}")
            await db.delete(stale_entry)

        # Upsert current config
        existing = await db.execute(
            select(SiteSchedule).where(SiteSchedule.site_id == payload.site_id)
        )
        entry = existing.scalar_one_or_none()
        if entry:
            entry.site_url      = payload.site_url
            entry.enabled       = payload.enabled
            entry.posts_per_week = payload.postsPerWeek
            entry.days_in_advance = payload.daysInAdvance
            entry.selected_slots = payload.selectedSlots
            entry.sources       = payload.sources
        else:
            entry = SiteSchedule(
                site_id        = payload.site_id,
                site_url       = payload.site_url,
                enabled        = payload.enabled,
                posts_per_week = payload.postsPerWeek,
                days_in_advance = payload.daysInAdvance,
                selected_slots = payload.selectedSlots,
                sources        = payload.sources,
            )
            db.add(entry)
        await db.commit()

    _schedule_updated.set()
    busy = _agent_state.get("is_busy", False)
    print(f"[LinguistFlow] Schedule saved for {payload.site_url} — {'agent busy, recheck queued' if busy else 'agent woken'}")
    return {"status": "ok", "site_id": payload.site_id}


@app.get("/api/schedule_config", tags=["agent"])
async def get_schedule_configs():
    """Returns all stored site schedule configs."""
    schedule_store = await _get_schedule_store()
    source_store = await _get_source_store()
    return {"configs": schedule_store, "sources": source_store}


@app.get("/api/agent_status", tags=["agent"])
async def get_agent_status():
    """Returns next planned auto-generation times for each active site."""
    from app.services.autonomous_agent import compute_next_generation_info
    schedule_store = await _get_schedule_store()
    return {
        "sites": compute_next_generation_info(schedule_store),
        "active_sites": len(schedule_store),
    }



@app.get("/api/agent_busy", tags=["agent"])
async def get_agent_busy():
    """Returns live generation status for the frontend animation banner."""
    return _agent_state


@app.get("/api/agent/stream", tags=["agent"])
async def agent_stream():
    """
    Server-Sent Events — streamt _agent_state alle 1.5s als JSON-Datenstrom.
    Das Frontend abonniert diesen Endpoint via EventSource und zeigt den
    globalen Fortschritt auf jeder Seite (Banner).
    """
    import json as _json_mod
    from fastapi.responses import StreamingResponse

    async def event_generator():
        while True:
            try:
                payload = _json_mod.dumps({
                    **_agent_state,
                    "log_steps": _agent_state.get("log_steps", [])[-20:],  # max 20 letzte Steps
                }, ensure_ascii=False)
                yield f"data: {payload}\n\n"
            except Exception:
                yield f"data: {{}}\n\n"
            await asyncio.sleep(3.0)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )



class AnalyzeSitePayload(BaseModel):
    siteUrl: str

@app.post("/api/analyze_site", tags=["shortcuts"])
async def analyze_site(payload: AnalyzeSitePayload):
    """
    Crawls a customer's website, extracts colors (60-30-10) and keywords using Gemini.
    """
    if not settings.gemini_api_key:
        raise HTTPException(status_code=500, detail="Gemini API Key missing")
        
    from app.services.topic_discovery import extract_site_branding
    
    branding_data = await extract_site_branding(
        site_url=payload.siteUrl,
        gemini_api_key=settings.gemini_api_key
    )
    return branding_data

# ── Draft shortcuts (no auth — uses in-memory _draft_store) ───────────────────

@app.get("/api/drafts", tags=["shortcuts"])
async def get_all_drafts_shortcut():
    """Return all non-deleted drafts from PostgreSQL."""
    drafts = await _get_draft_store()
    return {"drafts": drafts}


class DraftUpdatePayload(BaseModel):
    ghost_data:   Optional[dict] = None   # editor content fields
    visual_opts:  Optional[dict] = None   # color / font / layout settings


@app.patch("/api/drafts/{draft_id}", tags=["shortcuts"])
async def patch_draft(draft_id: str, payload: DraftUpdatePayload):
    """
    Persist editor changes (ghost_data + visual_opts) into PostgreSQL.
    Single source of truth for Editor → Preview → WordPress triple-sync.
    """
    import uuid as _uuid
    async with AsyncSessionLocal() as db:
        try:
            uid = _uuid.UUID(draft_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Ungültige Draft-ID.")
        result = await db.execute(select(Post).where(Post.id == uid))
        post = result.scalar_one_or_none()
        if not post:
            raise HTTPException(status_code=404, detail="Draft nicht gefunden.")
        if payload.ghost_data is not None:
            post.ghost_data = payload.ghost_data
        if payload.visual_opts is not None:
            post.visual_opts = payload.visual_opts
        await db.commit()
    return {"status": "ok", "id": draft_id}


@app.delete("/api/drafts/{draft_id}", tags=["shortcuts"])
async def delete_draft(draft_id: str):
    """
    Soft-delete a draft in PostgreSQL — sets status to 'deleted' and frees its slot.
    The agent will detect the freed slot on its next cycle and generate a replacement.
    """
    import uuid as _uuid
    async with AsyncSessionLocal() as db:
        try:
            uid = _uuid.UUID(draft_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Ungültige Draft-ID.")
        result = await db.execute(select(Post).where(Post.id == uid))
        post = result.scalar_one_or_none()
        if not post:
            raise HTTPException(status_code=404, detail="Draft nicht gefunden.")
        post.status = "deleted"
        await db.commit()
    _schedule_updated.set()
    return {"status": "deleted", "id": draft_id}

@app.post("/api/generate_draft", tags=["shortcuts"])
async def generate_draft_shortcut(payload: dict, background_tasks: BackgroundTasks):
    """Manually trigger a single draft generation for a given topic."""
    import uuid as _uuid, datetime as dt
    from app.models.post import Post as _Post
    topic    = payload.get("topic", "Unbekanntes Thema")
    site_url = payload.get("site_url", "")
    draft_id = str(_uuid.uuid4())
    async with AsyncSessionLocal() as db:
        post = _Post(
            id=_uuid.UUID(draft_id),
            title=topic,
            excerpt=f"KI-generierter Entwurf zu: {topic}",
            content_html=f"## {topic}\n\nLinguistFlow generiert diesen Text im Hintergrund.",
            language="de",
            status="draft",
            ai_meta={"model": "manual", "provider": "LinguistFlow", "site_url": site_url},
            site_url=site_url,
            created_at=dt.datetime.now(dt.timezone.utc),
        )
        db.add(post)
        await db.commit()
    background_tasks.add_task(_fill_manual_draft_bg, draft_id, topic, site_url, [])
    return {"status": "queued", "draft_id": draft_id}



@app.post("/api/auto_generate", tags=["shortcuts"])
async def auto_generate_shortcut(payload: dict, background_tasks: BackgroundTasks):
    """Trigger autonomous content generation for a site (no auth shortcut)."""
    import uuid as _uuid, datetime as dt
    from app.models.post import Post as _Post
    site_url = payload.get("site_url", "")
    sources  = payload.get("sources", [])
    count    = min(int(payload.get("count", 1)), 5)
    draft_ids, topics = [], []

    async with AsyncSessionLocal() as db:
        for i in range(count):
            topic = f"Auto-Thema {i+1} für {site_url}"
            topics.append(topic)
            draft_id = str(_uuid.uuid4())
            draft_ids.append(draft_id)
            db.add(_Post(
                id=_uuid.UUID(draft_id),
                title=topic,
                excerpt="Automatisch generierter Entwurf",
                content_html=f"## {topic}\n\nLinguistFlow generiert diesen Text im Hintergrund.",
                language="de",
                status="draft",
                ai_meta={"model": "auto", "provider": "LinguistFlow", "site_url": site_url},
                site_url=site_url,
                created_at=dt.datetime.now(dt.timezone.utc),
            ))
            background_tasks.add_task(_fill_manual_draft_bg, draft_id, topic, site_url, sources)
        await db.commit()

    return {"status": "generated", "topics": topics, "draft_ids": draft_ids, "count": count}

async def _fill_manual_draft_bg(draft_id: str, topic: str, site_url: str, sources: list):
    """Background task to fetch Gemini + OpenAlex for manual triggers."""
    try:
        from app.services.autonomous_agent import generate_article, _log
        from app.services.topic_discovery import analyse_customer_site, aggregate_sources
        import asyncio
        import datetime
        
        gemini_key = settings.gemini_api_key
        openalex_key = settings.openalex_api_key
        if not gemini_key:
            raise ValueError("Gemini API Key is missing.")
            
        _agent_state.update({
            "is_busy": True,
            "phase": "Starte manuellen Test...",
            "drafts_total": 1,
            "drafts_done": 0,
            "site_url": site_url,
            "current_topic": topic,
            "started_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        })
        _log(_agent_state, f"Manueller API-Test für: {site_url}")
            
        _agent_state["phase"] = "Analysiere Website & Quellen..."
        _log(_agent_state, "Lade Kontext...")
        site_ctx = await analyse_customer_site(site_url) if site_url else ""
        source_ctx = await aggregate_sources(sources) if sources else ""
        
        # Determine topic if missing
        if "Auto-Thema" in topic:
            _agent_state["phase"] = "Recherchiere passendes Thema..."
            _log(_agent_state, "🔎 Thema recherchieren...")
            from app.services.topic_discovery import discover_topics
            found = await discover_topics(site_url, sources, count=1, gemini_api_key=gemini_key)
            if found:
                topic = found[0]
                _agent_state["current_topic"] = topic
                _log(_agent_state, f"📌 Thema gefunden: {topic[:80]}")
        
        _agent_state["phase"] = "Gemini generiert Entwurf..."
        _log(_agent_state, "✍️  Gemini generiert Entwurf (inkl. OpenAlex)...")

        # ── GEO: Live SERP-Strategie für Information Gain abrufen ──────────
        geo_strategy_str = ""
        serp_key = settings.serp_api_key
        if serp_key:
            try:
                from app.geo_engine import SERPStrategyAnalyzer
                _log(_agent_state, "GEO: SERP-Strategie wird analysiert...")
                geo_result = await SERPStrategyAnalyzer(api_key=serp_key).run(topic)
                geo_strategy_str = geo_result.get("strategy_string", "")
                if geo_strategy_str:
                    signals = [s["label"] for s in geo_result.get("signals_detected", [])]
                    _log(_agent_state, f"📊 GEO-Strategie: {', '.join(signals)}")
            except Exception as geo_err:
                _log(_agent_state, f"⚠️  GEO-Analyse übersprungen: {geo_err}")
        # ────────────────────────────────────────────────────────────────────

        article = await generate_article(topic, site_ctx, source_ctx, gemini_key, openalex_key, geo_strategy=geo_strategy_str)
        
        # Update article fields in DB
        import uuid as _uuid
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Post).where(Post.id == _uuid.UUID(draft_id)))
            db_post = result.scalar_one_or_none()
            if db_post:
                db_post.title = article.get("title", topic)
                db_post.excerpt = article.get("excerpt", "")
                db_post.content_html = article.get("content", "Fehler bei der Generierung.")
                meta = db_post.ai_meta or {}
                meta.update({
                    "char_counts": article.get("char_counts", {}),
                    "meta_description": article.get("meta_description", ""),
                    "focus_keyword": article.get("focus_keyword", ""),
                    "source_topic": topic,
                })
                db_post.ai_meta = meta
                await db.commit()
                
        _log(_agent_state, "Manueller Test erfolgreich abgeschlossen.")
        _agent_state.update({"is_busy": False, "phase": "Bereit", "drafts_done": 1})
                
    except Exception as exc:
        import traceback
        import logging
        logging.getLogger(__name__).error(f"Manual generation failed: {exc}\n{traceback.format_exc()}")
        _log(_agent_state, f"Fehler beim manuellen Test: {exc}")
        _agent_state.update({"is_busy": False, "phase": "Bereit"})
        
        import uuid as _uuid
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Post).where(Post.id == _uuid.UUID(draft_id)))
            db_post = result.scalar_one_or_none()
            if db_post:
                db_post.content_html = f"## Generierungs-Fehler\n\n{str(exc)}"
                await db.commit()




# ── WordPress Publish ─────────────────────────────────────────────────────────

async def publish_to_wordpress(
    site_url: str,
    username: str,
    app_password: str,
    draft: dict,
) -> dict:
    """
    Publishes a draft article to WordPress as a Custom HTML block widget.
    - No WP title shown (title set to empty string)
    - Comments + pingbacks disabled
    - Status: publish (immediately live)
    - Full HTML is sent as raw Gutenberg block so WP shows exactly our template
    """
    from fastapi.responses import JSONResponse

    import json

    # ── build_wp_html gibt jetzt ein JSON-Dict zurück: {"css": ..., "html": ...}
    # Exakt wie in wcode.php: $css_content und $html_content getrennt behandelt
    raw = build_wp_html(draft)
    try:
        parts = json.loads(raw)
        css_content  = parts["css"]
        html_body    = parts["html"]
    except Exception:
        # Fallback für immersive/datahub die noch altes Format nutzen
        css_content  = ""
        html_body    = raw

    # ── wcode.php Zeile 244-245: json_encode für bombensicheres Escaping ────────
    # $js_html = json_encode('<div class="ds-master-wrapper">' . $html_content . '</div>');
    # $js_css  = json_encode($css_content);
    js_html = json.dumps(f'<div class="ds-master-wrapper">{html_body}</div>')
    js_css  = json.dumps(css_content)

    # ── wcode.php Zeile 329-335: Theme-Junk Killer in document.head ─────────────
    theme_killer = (
        ".entry-header, .entry-title, .page-title, .post-meta, .entry-meta, "
        ".author-bio, #comments, .sharedaddy, .sd-like, .post-navigation, "
        ".wp-block-post-date, .posted-on, .post-date, time.published, time.updated "
        "{ display: none !important; opacity: 0 !important; visibility: hidden !important; height: 0 !important; overflow: hidden !important; margin: 0 !important; padding: 0 !important; }"
        ".entry-content, .post-content, .article-content { margin-top: 0 !important; padding-top: 0 !important; }"
    )
    js_theme_killer = json.dumps(theme_killer)

    # Lade die Farbe für den Ladebalken
    col_primary = draft.get("visual_opts", {}).get("style", {}).get("brand_primary", "#007AFF")

    # ── wcode.php $payload_script — exakter Port ins Python ─────────────────────
    shadow_dom_payload = f"""<!-- wp:html -->
<!-- SKELETON LOADER (Wird angezeigt, solange das JS lädt) -->
<div id="ds-shadow-host" style="display: block !important; position: relative !important; left: 50% !important; right: 50% !important; margin-left: -50vw !important; margin-right: -50vw !important; width: 100vw !important; max-width: 100vw !important;">
    <style>@keyframes ds-pulse {{ 0% {{opacity:0.5;}} 50% {{opacity:1;}} 100% {{opacity:0.5;}} }}</style>
    <div style="width: 100%; max-width: 1400px; margin: 0 auto; background: #f5f5f7; height: 500px; display: flex; align-items: center; justify-content: center;">
        <div style="width: 60%; height: 20px; background: #e5e5e7; border-radius: 10px; animation: ds-pulse 1.5s infinite;"></div>
    </div>
</div>
<script>
document.addEventListener("DOMContentLoaded", function() {{
    const host = document.getElementById('ds-shadow-host');
    if (!host) return;

    // 1. Skeleton leeren & Shadow Root starten (Verhindert FOUC - styles from theme)
    host.innerHTML = '';
    const shadow = host.attachShadow({{ mode: 'open' }});

    // 2. CSS + HTML Injektion (Bombensicher via json)
    const style = document.createElement('style');
    style.textContent = {js_css};

    const container = document.createElement('div');
    container.innerHTML = {js_html};

    shadow.appendChild(style);
    shadow.appendChild(container);

    // 3. JS LOGIK (Scoped auf shadow. — NIEMALS document.querySelector für Inhalte!)
    const tocTarget  = shadow.querySelector("#toc-list");
    const sections   = shadow.querySelectorAll("#article-root h2");
    const progressBar = shadow.querySelector("#reading-progress");
    const activeLinks = [];

    // Dynamisches Inhaltsverzeichnis generieren
    if(tocTarget && sections.length > 0) {{
        sections.forEach((h2, index) => {{
            const id = h2.id || 'section-' + index;
            h2.id = id;

            const li = document.createElement("li");
            const a  = document.createElement("a");
            a.textContent = h2.textContent;
            a.href = '#' + id;
            a.setAttribute("data-anchor", id);

            // Smooth Scroll Fix für Shadow DOM
            a.addEventListener('click', function(e) {{
                e.preventDefault();
                h2.scrollIntoView({{behavior: 'smooth', block: 'start'}});
            }});

            li.appendChild(a);
            tocTarget.appendChild(li);
            activeLinks.push(a);
        }});
    }}

    // THEMEN-Navigation (linke Sidebar) aus denselben H2s befüllen
    const topicsTarget = shadow.querySelector("#ds-topics-list");
    if(topicsTarget && sections.length > 0) {{
        sections.forEach((h2, index) => {{
            const id = h2.id || 'section-' + index;
            const li = document.createElement("li");
            const a  = document.createElement("a");
            a.textContent = h2.textContent;
            a.href = '#' + id;
            a.addEventListener('click', function(e) {{
                e.preventDefault();
                h2.scrollIntoView({{behavior: 'smooth', block: 'start'}});
            }});
            li.appendChild(a);
            topicsTarget.appendChild(li);
        }});
    }}

    // Scroll-Fortschrittsbalken GLOBAL (außerhalb Shadow-DOM)
    let globalBar = document.getElementById('lf-reading-progress');
    if (!globalBar) {{
        globalBar = document.createElement('div');
        globalBar.id = 'lf-reading-progress';
        globalBar.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; width: 0% !important; height: 4px !important; background-color: var(--wp--preset--color--vivid-purple, {col_primary}) !important; z-index: 2147483647 !important; transition: width 0.1s ease-out !important; pointer-events: none !important;';
        document.body.appendChild(globalBar);
    }}

    window.addEventListener("scroll", function() {{
        let winScroll = document.body.scrollTop || document.documentElement.scrollTop;
        let height    = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        let scrolled  = (winScroll / height) * 100;
        if(globalBar) globalBar.style.width = scrolled + "%";
        if(progressBar) progressBar.style.width = scrolled + "%"; // Fallback im Shadow DOM
    }});

    // Intersection Observer (Aktives Kapitel aufleuchten lassen)
    if('IntersectionObserver' in window) {{
        const observerOptions = {{ rootMargin: "-15% 0px -75% 0px", threshold: 0 }};
        const observer = new IntersectionObserver((entries) => {{
            entries.forEach(entry => {{
                if (entry.isIntersecting) {{
                    activeLinks.forEach(link => link.classList.remove("active-chapter"));
                    const targetLink = shadow.querySelector('#toc-list a[data-anchor="' + entry.target.id + '"]');
                    if (targetLink) targetLink.classList.add("active-chapter");
                }}
            }});
        }}, observerOptions);
        sections.forEach(s => observer.observe(s));
    }}

    // 4. THEME-MÜLL VERSTECKEN (Wird ins normale Document Head geschrieben)
    const hideJunk = document.createElement('style');
    hideJunk.innerHTML = {js_theme_killer};
    document.head.appendChild(hideJunk);

    // 5. JAVASCRIPT SCANNER: Löscht Elemente, die Theme-Müll enthalten (hartnäckige Themes)
    function cleanupThemeGarbage() {{
        var terms = ['dilanhuetgens', 'Uncategorized', 'Nicht kategorisiert'];
        var elements = document.querySelectorAll('span, div, a, li, p');
        elements.forEach(function (el) {{
            terms.forEach(function (term) {{
                if (el.textContent && el.textContent.includes(term) && el.children.length === 0) {{
                    var parent = el.parentElement;
                    if (parent) parent.style.display = 'none';
                    el.style.display = 'none';
                }}
            }});
        }});
    }}
    cleanupThemeGarbage();
    setTimeout(cleanupThemeGarbage, 1000);
}});
</script>
<!-- /wp:html -->"""
    gutenberg_html = shadow_dom_payload


    payload = {
        "title":          "",
        "content":        gutenberg_html,
        "status":         "publish",
        "comment_status": "closed",
        "ping_status":    "closed",
        "format":         "standard",
        # Jetpack: disable sharing and likes on this specific post
        "meta": {
            "jetpack_sharing_enabled": False,
            "jetpack_likes_enabled":   False,
        },
    }

    # ── WordPress App Password Auth ────────────────────────────────────────────
    # CRITICAL RULE: WordPress App Passwords MUST be sent as:
    #   Authorization: Basic base64(username:app_password_without_spaces)
    # DO NOT use httpx auth=(user, pass) tuple — it can fail with special chars.
    # DO NOT use the app_password WITH spaces — WordPress requires them stripped.
    import base64 as _b64
    password = app_password.replace(" ", "")   # strip spaces from WP app password
    token    = _b64.b64encode(f"{username}:{password}".encode()).decode()
    headers  = {
        "Authorization": f"Basic {token}",
        "Content-Type":  "application/json",
        "User-Agent":    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    }
    url = site_url.rstrip("/") + "/wp-json/wp/v2/posts"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="WordPress antwortet nicht (Timeout). Bitte prüfe die URL und ob die WP-REST-API aktiviert ist."
        )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Verbindung zu WordPress fehlgeschlagen: {exc}"
        )

    if resp.status_code in (200, 201):
        data = resp.json()
        return {
            "wp_post_id":  data.get("id"),
            "wp_post_url": data.get("link"),
            "status":      "published",
        }

    # Build a readable error from WordPress response
    try:
        err_data = resp.json()
        wp_code  = err_data.get("code", "")
        wp_msg   = err_data.get("message", "") or err_data.get("error", "")
    except Exception:
        wp_code = ""
        wp_msg  = resp.text[:300]

    # ── Map WP error code + HTTP status to a human-readable hint ─────────────
    # PERMANENT RULE: 401 can be EITHER wrong credentials OR missing publish role.
    # Always surface the WP message so the real cause is visible.
    if resp.status_code == 401 and ("berechtigt" in wp_msg.lower() or "allowed to create" in wp_msg.lower()):
        hint = (
            "Authentifizierung blockiert (401): Dein WP-Server (z.B. Hostinger/IONOS) "
            "ignoriert das App-Passwort (Authorization Header wird gefiltert). "
            "Lösung: Füge in deiner .htaccess-Datei über '# BEGIN WordPress' "
            "folgende Zeile ein: RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]"
        )
    elif resp.status_code == 401:
        hint = "Zugangsdaten falsch (401) — Benutzername oder App-Passwort stimmt nicht. App-Passwort in WP unter Benutzer → Sicherheit erstellen."
    elif resp.status_code == 403:
        hint = "Keine Berechtigung (403) — Der WP-Benutzer braucht mindestens Redakteur-Rechte."
    elif resp.status_code == 404:
        hint = "WordPress REST API nicht erreichbar (404) — Bitte prüfe die Website-URL (muss /wp-json/wp/v2/ erreichbar sein)."
    else:
        hint = f"WordPress-Fehler {resp.status_code}"

    raise HTTPException(
        status_code=400,
        detail=f"{hint}{(' — ' + wp_msg) if wp_msg else ''}"
    )


class PublishDraftRequest(BaseModel):
    draft_id:     str
    site_url:     str
    username:     str
    app_password: str
    content_overrides: Optional[dict] = None
    visual_options: Optional[dict] = None
    ghost_data: Optional[dict] = None   # editor-edited content fields


@app.post("/api/approve_and_publish", tags=["shortcuts"])
async def approve_and_publish(req: PublishDraftRequest):
    """
    Approve a draft and publish it directly to WordPress as a clean HTML widget.
    Sends only our LinguistFlow HTML — no WP default title, no comments block.
    """
    try:
        import uuid as _uuid
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Post).where(Post.id == _uuid.UUID(req.draft_id)))
            post_obj = result.scalar_one_or_none()
        draft = post_to_dict(post_obj) if post_obj else None
        if not draft:
            raise HTTPException(status_code=404, detail="Draft nicht gefunden. Bitte Seite neu laden.")

        if req.content_overrides:
            draft.update(req.content_overrides)
        if req.visual_options is not None:
            draft["visual_options"] = req.visual_options
        if req.ghost_data is not None:
            draft["ghost_data"] = req.ghost_data

        result = await publish_to_wordpress(
            site_url=req.site_url,
            username=req.username,
            app_password=req.app_password,
            draft=draft,
        )

        draft["status"] = "live"
        draft["wp_post_id"]  = result.get("wp_post_id")
        draft["wp_post_url"] = result.get("wp_post_url")

        return {
            "status":      "published",
            "wp_post_id":  result.get("wp_post_id"),
            "wp_post_url": result.get("wp_post_url"),
            "draft_id":    req.draft_id,
        }
    except HTTPException:
        raise  # let FastAPI handle these normally
    except Exception as exc:
        # Catch-all: ensures CORS headers are always returned even on unexpected errors
        raise HTTPException(status_code=500, detail=f"Interner Fehler: {exc}")

# ── WordPress HTML Widget Builder ─────────────────────────────────────────────

def _shadow_wrap(inner_html: str) -> str:
    """
    Passthrough — Shadow DOM wrapping happens inside publish_to_wordpress()
    via the full wcode.php-compliant Shadow DOM payload (json.dumps injection).
    This function now simply returns the raw inner HTML for that pipeline.
    """
    return inner_html


def build_wp_html(draft: dict) -> str:
    """
    Dispatches to the correct WordPress HTML schema based on draft['template'].
    Schemas: 'authority' (default), 'immersive', 'datahub'
    All output is wrapped in a Shadow DOM custom element for CSS isolation.
    """
    import re

    template = draft.get("template", "authority")
    if template == "immersive":
        return _wp_immersive(draft, re)
    if template == "datahub":
        return _wp_datahub(draft, re)
    return _wp_authority(draft, re)


def _wp_authority(draft: dict, re) -> str:
    """
    Schema 1 – The Authority.
    CSS, HTML und JS sind ein 1:1 Port von wcode.php.
    Alle Variablen liegen auf :host (nicht :root/body).
    Breakout-Trick: width:100vw; margin-left:-50vw exakt wie wcode.php.
    """
    # ── Content aus ghost_data oder draft ─────────────────────────────────────
    ghost    = draft.get("ghost_data") or {}
    title    = ghost.get("h1_hero")       or draft.get("title",   "")
    excerpt  = ghost.get("intro_block")   or draft.get("excerpt", "")
    content  = ghost.get("ai_text_block") or draft.get("content", "")
    author   = ghost.get("author_name")   or "LinguistFlow KI"
    reviewer = ghost.get("reviewer_name") or "Experten-Team"
    keyword  = draft.get("ai_meta", {}).get("focus_keyword", "") or draft.get("focus_keyword", "") or ""
    created  = draft.get("created_at", "")
    provider = draft.get("ai_meta", {}).get("provider", "KI")
    model    = draft.get("ai_meta", {}).get("model", "")

    try:
        from datetime import datetime as _dt
        pub_date = _dt.fromisoformat(created.replace("Z", "+00:00")).strftime("%d. %B %Y")
    except Exception:
        pub_date = "Aktuell"

    word_count = len(content.split())
    read_min   = max(1, round(word_count / 200))
    read_time  = f"{read_min}–{read_min + 2} Minuten"

    # ── visualOpts → :host Variablen (wcode.php § 1) ─────────────────────────
    vo  = draft.get("visual_options", {})
    S   = vo.get("style", {})
    L   = vo.get("layout", {})
    ADV = vo.get("advanced", {})

    col_primary   = S.get("brand_primary", "#007AFF")
    col_bg_main   = S.get("bg_body",       "#ffffff")
    col_bg_sec    = S.get("bg_panel",      "#f5f5f7")
    col_bg_card   = vo.get("master_hero", {}).get("card_bg", "#ffffff")
    col_text_main = S.get("text_main",    "#1d1d1f")
    col_text_body = S.get("text_dimmed",  "#424245")
    col_text_muted= S.get("text_dimmed",  "#86868b")
    col_border    = S.get("border_color", "#d2d2d7")
    font_family   = S.get("font_family",  "'Inter', -apple-system, sans-serif")
    h1_size       = S.get("h1_size",      "3.5rem")
    h2_size       = S.get("h2_size",      "1.9rem")
    body_size     = S.get("body_size",    "1.1rem")
    radius_xl     = S.get("radius_ui",    "16px")
    container_w   = L.get("container_width",  "1440px")
    sidebar_left  = L.get("sidebar_width",    "280px")
    sidebar_right = L.get("action_width",     "240px")
    shadow_card   = S.get("shadow_elevation", "0 10px 30px rgba(0,0,0,0.05)")
    custom_css    = ADV.get("custom_css", "")

    # ── Markdown → HTML (ds- Klassen) ─────────────────────────────────────────
    def md_to_html(md: str) -> str:
        lines = md.split("\n"); out = []; in_ul = in_ol = in_table = False; thead_done = False
        def cl():
            nonlocal in_ul, in_ol
            if in_ul: out.append("</ul>"); in_ul = False
            if in_ol: out.append("</ol>"); in_ol = False
        def ct():
            nonlocal in_table, thead_done
            if in_table: out.append("</tbody></table></div>"); in_table = False; thead_done = False
        def inl(s):
            s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
            s = re.sub(r"\*(.+?)\*",     r"<em>\1</em>", s)
            return re.sub(r"`(.+?)`",    r'<code class="ds-code">\1</code>', s)
        for line in lines:
            hm = re.match(r"^(#{1,3})\s+(.+)$", line)
            if hm:
                cl(); ct(); d = len(hm.group(1)); t = hm.group(2).strip()
                a = re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")
                out.append(f'<h{d} id="{a}">{inl(t)}</h{d}>'); continue
            if line.startswith("> "):
                cl(); ct(); out.append(f'<blockquote><p>{inl(line[2:].strip())}</p></blockquote>'); continue
            if re.match(r"^---+\s*$", line):
                cl(); ct(); out.append('<hr class="ds-hr">'); continue
            if "|" in line:
                cells = [c.strip() for c in line.strip().strip("|").split("|")]
                if re.match(r"^[\s|:-]+$", line):
                    if in_table and not thead_done: out.append("</thead><tbody>"); thead_done = True
                    continue
                if not in_table: cl(); out.append('<div class="ds-table-wrap"><table class="ds-table"><thead>'); in_table = True; thead_done = False
                tag = "th" if not thead_done else "td"
                out.append("<tr>" + "".join(f"<{tag}>{inl(c)}</{tag}>" for c in cells) + "</tr>"); continue
            if in_table: ct()
            bm = re.match(r"^[-*]\s+(.+)$", line)
            if bm:
                if in_ol: out.append("</ol>"); in_ol = False
                if not in_ul: out.append('<ul class="ds-list">'); in_ul = True
                out.append(f"<li>{inl(bm.group(1))}</li>"); continue
            nm = re.match(r"^\d+\.\s+(.+)$", line)
            if nm:
                if in_ul: out.append("</ul>"); in_ul = False
                if not in_ol: out.append('<ol class="ds-list">'); in_ol = True
                out.append(f"<li>{inl(nm.group(1))}</li>"); continue
            if not line.strip(): cl(); continue
            cl(); out.append(f'<p>{inl(line.strip())}</p>')
        cl(); ct(); return "\n".join(out)

    body_html = md_to_html(content)

    # Hero-Karten aus H2-Überschriften (wie wcode.php preview-cards)
    h2_entries = re.findall(r"^##\s+(.+)$", content, re.MULTILINE)
    card_labels = ["Zusammenfassung", "Analyse", "Exkurs"]
    hero_cards_html = ""
    for i, heading in enumerate(h2_entries[:3]):
        anchor = re.sub(r"[^a-z0-9]+", "-", heading.lower()).strip("-")
        hero_cards_html += f"""<div class="ds-preview-card"><strong>{card_labels[i % 3]} &bull; 0{i+1}</strong><br><span>{heading}</span></div>\n"""
    if not hero_cards_html:
        for i, (label, text) in enumerate([("Zusammenfassung", "Kernargumente und Hintergründe im Überblick"),
                                            ("Analyse",         "Fundierte Einordnung mit Daten und Expertenmeinungen"),
                                            ("Fazit",           "Was Sie nach diesem Artikel wissen sollten")]):
            hero_cards_html += f"""<div class="ds-preview-card"><strong>{label} &bull; 0{i+1}</strong><br><span>{text}</span></div>\n"""

    # ══════════════════════════════════════════════════════════════════
    # CSS — Exakt aus lol.css (Variablen auf :host) + wlol.css (Komponenten)
    # lol.css :root → :host  (Shadow DOM Pflicht laut wcode-Regeln)
    # wlol.css body  → .ds-master-wrapper
    # ══════════════════════════════════════════════════════════════════
    css_content = f"""@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

/* ==========================================================================
   GLOBALES DESIGN SYSTEM (lol.css) — :host statt :root (Shadow DOM Pflicht)
   ========================================================================== */

:host {{
    /* STANDARD LAOYUT & BREAKOUT TRICK */
    display: block !important;
    position: relative !important;
    left: 50% !important;
    right: 50% !important;
    margin-left: -50vw !important;
    margin-right: -50vw !important;
    width: 100vw !important;
    max-width: 100vw !important;

    /* --- 1. FARBEN (60-30-10 Regel) --- */
    --ds-color-primary: {col_primary};
    --ds-color-primary-hover: #005bb5;

    --ds-color-bg-main: {col_bg_main};
    --ds-color-bg-sec: {col_bg_sec};
    --ds-color-bg-card: {col_bg_card};

    --ds-color-text-main: {col_text_main};
    --ds-color-text-body: {col_text_body};
    --ds-color-text-muted: {col_text_muted};

    --ds-color-border: {col_border};
    --ds-color-border-light: #e5e5e7;

    /* --- 2. TYPOGRAFIE --- */
    --ds-font-family: {font_family};
    --ds-text-h1: {h1_size};
    --ds-text-h2: {h2_size};
    --ds-text-body-large: 1.25rem;
    --ds-text-body: {body_size};
    --ds-text-small: 0.85rem;

    /* --- 3. BORDER RADIUS --- */
    --ds-radius-sm: 8px;
    --ds-radius-md: 12px;
    --ds-radius-lg: 14px;
    --ds-radius-xl: {radius_xl};

    /* --- 4. ABSTÄNDE --- */
    --ds-spacing-xs: 10px;
    --ds-spacing-sm: 20px;
    --ds-spacing-md: 30px;
    --ds-spacing-lg: 40px;
    --ds-spacing-xl: 60px;

    --ds-container-width: {container_w};
    --ds-sidebar-width-left: {sidebar_left};
    --ds-sidebar-width-right: {sidebar_right};

    /* --- 5. EFFEKTE & SCHATTEN --- */
    --ds-shadow-card: {shadow_card};
    --ds-transition-speed: 0.3s;
}}

/* Responsive Variablen */
@media (max-width: 1000px) {{
    :host {{
        --ds-text-h1: 2.5rem;
        --ds-text-h2: 1.5rem;
        --ds-text-body-large: 1.1rem;
    }}
}}

/* ==========================================================================
   BASIS & LAYOUT (wlol.css) — body → .ds-master-wrapper (Shadow DOM)
   ========================================================================== */
* {{ box-sizing: border-box; margin: 0; padding: 0; }}

.ds-master-wrapper {{
    font-family: var(--ds-font-family);
    color: var(--ds-color-text-body);
    background: var(--ds-color-bg-main);
    line-height: 1.6;
}}

/* Ladebalken */
#reading-progress {{
    position: fixed;
    top: 0;
    left: 0;
    width: 0%;
    height: 4px;
    background: var(--ds-color-primary);
    z-index: 10000;
    transition: width 0.1s ease-out;
}}

/* BLOCK 1: HERO SEKTION */
.ds-hero {{
    background-color: var(--ds-color-bg-sec);
    padding: var(--ds-spacing-xl) var(--ds-spacing-sm);
    border-bottom: 1px solid var(--ds-color-border);
}}
.ds-hero-container {{
    max-width: var(--ds-container-width);
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--ds-spacing-lg);
    align-items: center;
}}
.ds-breadcrumbs {{
    font-size: var(--ds-text-small);
    color: var(--ds-color-text-muted);
    margin-bottom: var(--ds-spacing-sm);
}}
.ds-breadcrumbs a {{ text-decoration: none; color: inherit; transition: var(--ds-transition-speed); }}
.ds-breadcrumbs a:hover {{ color: var(--ds-color-primary); }}
.ds-hero-content h1 {{
    font-size: var(--ds-text-h1);
    font-weight: 800;
    line-height: 1.1;
    margin-bottom: var(--ds-spacing-sm);
    color: var(--ds-color-text-main);
}}
.ds-hero-intro {{
    font-size: var(--ds-text-body-large);
    margin-bottom: var(--ds-spacing-md);
    max-width: 600px;
}}
.ds-hero-btns {{ display: flex; gap: 15px; flex-wrap: wrap; }}
.ds-btn-primary {{
    background: var(--ds-color-text-main);
    color: #fff;
    padding: 14px 28px;
    border-radius: var(--ds-radius-sm);
    text-decoration: none;
    font-weight: 600;
    transition: var(--ds-transition-speed);
}}
.ds-btn-primary:hover {{ transform: translateY(-2px); background: #000; }}
.ds-btn-text {{ padding: 14px 28px; color: var(--ds-color-text-main); font-weight: 600; text-decoration: none; }}

/* Rechte Seite: Gestapelte Karten */
.ds-hero-visual {{ display: flex; flex-direction: column; gap: 15px; perspective: 1000px; }}
.ds-preview-card {{
    background: var(--ds-color-bg-card);
    padding: var(--ds-spacing-sm);
    border-radius: var(--ds-radius-lg);
    box-shadow: var(--ds-shadow-card);
    border: 1px solid var(--ds-color-border-light);
    max-width: 400px;
}}
.ds-preview-card:nth-child(1) {{ transform: rotate(-2deg) translateX(20px); z-index: 3; }}
.ds-preview-card:nth-child(2) {{ transform: rotate(1deg) translateX(0px); z-index: 2; margin-top: -40px; opacity: 0.8; }}
.ds-preview-card:nth-child(3) {{ transform: rotate(3deg) translateX(-20px); z-index: 1; margin-top: -40px; opacity: 0.5; }}

/* BLOCK 2: HAUPT-LAYOUT */
.ds-grid-container {{
    display: grid;
    gap: 50px;
    max-width: var(--ds-container-width);
    margin: 0 auto;
    padding: var(--ds-spacing-lg) var(--ds-spacing-sm);
    align-items: start;
    grid-template-columns: var(--ds-sidebar-width-left) 1fr var(--ds-sidebar-width-right);
}}

/* SIDEBAR LINKS */
.ds-sidebar-left {{ position: sticky; top: var(--ds-spacing-lg); font-size: var(--ds-text-small); }}
.ds-cta-box {{ background: var(--ds-color-primary); color: white; padding: var(--ds-spacing-sm); border-radius: var(--ds-radius-md); margin-bottom: var(--ds-spacing-md); }}
.ds-cta-box a {{ color: white; font-weight: 700; }}
.ds-info-list {{ list-style: none; padding: 0; margin-bottom: var(--ds-spacing-md); border-bottom: 1px solid var(--ds-color-border); padding-bottom: var(--ds-spacing-sm); }}
.ds-info-list li {{ margin-bottom: 12px; }}
.ds-label {{ font-weight: 700; color: var(--ds-color-text-main); display: block; font-size: 0.7rem; text-transform: uppercase; }}

/* THEMEN: Dynamische Artikel-Navigation in linker Sidebar */
.ds-topics-nav {{ margin-top: var(--ds-spacing-sm); }}
.ds-topics-label {{ display: block; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ds-color-text-muted); margin-bottom: var(--ds-spacing-xs); }}
.ds-topics-list {{ list-style: none; padding: 0; margin: 0; }}
.ds-topics-list li {{ padding: 6px 0 6px 14px; border-left: 2px solid var(--ds-color-border); transition: border-color var(--ds-transition-speed); }}
.ds-topics-list li:hover {{ border-left-color: var(--ds-color-primary); }}
.ds-topics-list a {{ text-decoration: none; color: var(--ds-color-text-body); font-size: var(--ds-text-small); display: block; }}
.ds-topics-list a:hover {{ color: var(--ds-color-primary); }}

/* HAUPTINHALT */
.ds-main-content {{ max-width: 820px; }}
.ds-author-box {{
    display: flex;
    gap: var(--ds-spacing-lg);
    margin-bottom: var(--ds-spacing-lg);
    padding: 25px;
    background: var(--ds-color-bg-sec);
    border-radius: var(--ds-radius-xl);
}}
.ds-profile {{ display: flex; align-items: center; gap: 12px; }}
.ds-profile img {{ width: 48px; height: 48px; border-radius: 50%; }}

/* Inhaltsverzeichnis */
.ds-toc {{
    margin: var(--ds-spacing-lg) 0;
    padding: var(--ds-spacing-md);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-xl);
}}
.ds-toc h5 {{ margin-bottom: 15px; font-size: 1.1rem; color: var(--ds-color-text-main); }}
#toc-list {{ display: grid; grid-template-columns: 1fr 1fr; gap: 15px 30px; list-style: none; padding: 0; }}
#toc-list a {{ text-decoration: none; color: var(--ds-color-primary); transition: var(--ds-transition-speed); }}
#toc-list a.active-chapter {{
    color: var(--ds-color-text-main);
    font-weight: 800;
    border-left: 3px solid var(--ds-color-primary);
    padding-left: 12px;
}}

/* Typografie im Artikel */
.ds-article h1 {{ font-size: var(--ds-text-h1); color: var(--ds-color-text-main); }}
.ds-article h2 {{
    font-size: var(--ds-text-h2);
    margin-top: 4rem;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--ds-color-border);
    color: var(--ds-color-text-main);
    margin-bottom: 1rem;
}}
.ds-article p {{ font-size: var(--ds-text-body); margin-bottom: 1.8rem; }}
.ds-article blockquote {{
    margin: 45px 0;
    padding: 10px 0 10px 30px;
    border-left: 4px solid var(--ds-color-primary);
    font-style: italic;
    font-size: 1.3rem;
}}
.ds-article code, .ds-code {{ background: #eee; padding: 2px 6px; border-radius: 4px; font-size: 0.9rem; color: #d63384; }}
.ds-list {{ padding-left: 1.5rem; margin-bottom: 1.8rem; font-size: var(--ds-text-body); line-height: 1.8; }}
.ds-list li {{ margin-bottom: 0.4rem; }}
.ds-table-wrap {{ overflow-x: auto; margin: 2rem 0; border-radius: var(--ds-radius-md); box-shadow: 0 4px 20px rgba(0,0,0,0.06); }}
.ds-table {{ width: 100%; border-collapse: collapse; font-size: 0.95rem; }}
.ds-table th {{ background: var(--ds-color-bg-sec); font-weight: 700; padding: 12px 16px; text-align: left; border-bottom: 2px solid var(--ds-color-border); }}
.ds-table td {{ padding: 12px 16px; border-bottom: 1px solid var(--ds-color-border); }}
.ds-hr {{ border: none; border-top: 1px solid var(--ds-color-border); margin: 2.5rem 0; }}

/* IN CONTENT CTA (NEW) */
.ds-in-content-cta {{ background: var(--ds-color-bg-sec); border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-lg); padding: 35px; margin: 50px 0; display: flex; justify-content: space-between; align-items: center; gap: 30px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.03); }}
.ds-cta-text h4 {{ font-size: 1.4rem; color: var(--ds-color-text-main); margin-bottom: 8px; }}

/* SIDEBAR RECHTS */
.ds-sidebar-right {{ position: sticky; top: var(--ds-spacing-lg); }}
.ds-ad-box {{
    background: #fbfbfd;
    border: 1px dashed var(--ds-color-border);
    min-height: 500px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--ds-radius-md);
}}

/* RESPONSIVE (Tablet & Mobile) */
@media (max-width: 1200px) {{
    .ds-grid-container {{ grid-template-columns: var(--ds-sidebar-width-left) 1fr; }}
    .ds-sidebar-right {{ display: none; }}
}}
@media (max-width: 1000px) {{
    .ds-hero-container {{ grid-template-columns: 1fr; text-align: center; }}
    .ds-hero-visual {{ display: none; }}
    .ds-hero-intro {{ margin: 0 auto var(--ds-spacing-md) auto; }}
    .ds-hero-btns {{ justify-content: center; }}
}}
@media (max-width: 900px) {{
    .ds-grid-container {{ grid-template-columns: 1fr; }}
    .ds-sidebar-left {{ display: none; }}
    #toc-list {{ grid-template-columns: 1fr; }}
}}

{custom_css}"""

    # ══════════════════════════════════════════════════════════════════
    # HTML — Exakter Port aus lol.html mit dynamischen Inhalten
    # ══════════════════════════════════════════════════════════════════
    html_content = f"""<!-- Lese-Fortschrittsbalken -->
<div id="reading-progress"></div>
<div class="ds-hero">
    <div class="ds-hero-container">
        <div class="ds-hero-content">
            <nav class="ds-breadcrumbs"><a href="#">Magazin</a> / <span>Fachartikel</span></nav>
            <h1>{title}</h1>
            <p class="ds-hero-intro">{excerpt}</p>
        </div>
        <div class="ds-hero-visual">
            <div class="ds-preview-card"><strong>Zusammenfassung &bull; 01</strong><br><span>Kernargumente im Überblick</span></div>
            <div class="ds-preview-card"><strong>Analyse &bull; 02</strong><br><span>Fundierte Einordnung</span></div>
            <div class="ds-preview-card"><strong>Fazit &bull; 03</strong><br><span>Wichtige Erkenntnisse</span></div>
        </div>
    </div>
</div>

<div class="ds-grid-container">
    <aside class="ds-sidebar-left">
        <div class="ds-cta-box">
            <p>Erhalten Sie Zugriff auf weiterführende Ressourcen.</p>
            <a href="#">Jetzt registrieren</a>
        </div>
        <ul class="ds-info-list">
            <li><span class="ds-label">Prüfung</span> Verifizierter Artikel</li>
            <li><span class="ds-label">Update</span> Aktuell</li>
            <li><span class="ds-label">Lesezeit</span> ca. 5 Min.</li>
        </ul>
        <nav class="ds-topics-nav">
            <span class="ds-topics-label">Themen</span>
            <ul class="ds-topics-list" id="ds-topics-list"></ul>
        </nav>
    </aside>

    <main class="ds-main-content">
        <header class="ds-author-box">
            <div class="ds-profile">
                <img src="https://ui-avatars.com/api/?name={author.replace(' ', '+')}&background=007AFF&color=fff" alt="Autor" loading="lazy">
                <div><span style="color: var(--ds-color-text-muted); font-size: .75rem; display: block;">Publiziert von</span><strong style="color: var(--ds-color-text-main);">{author}</strong></div>
            </div>
            <div class="ds-profile">
                <img src="https://ui-avatars.com/api/?name={reviewer.replace(' ', '+')}&background=random&color=fff" alt="Experte" loading="lazy">
                <div><span style="color: var(--ds-color-text-muted); font-size: .75rem; display: block;">Geprüft von</span><strong style="color: var(--ds-color-text-main);">{reviewer}</strong></div>
            </div>
        </header>

        <nav class="ds-toc">
            <h5>Inhalt dieses Artikels</h5>
            <ul id="toc-list"></ul>
        </nav>

        <article class="ds-article" id="article-root">
            {body_html}
            
            <!-- IN CONTENT CTA GANZ UNTEN -->
            <div class="ds-in-content-cta">
                <div class="ds-cta-text">
                    <h4>Kostenloses Whitepaper</h4>
                    <p>Lade dir unseren exklusiven 40-seitigen PDF-Guide herunter.</p>
                </div>
                <a href="#" class="ds-btn-primary" style="color: white; border-radius: 8px; text-decoration: none; padding: 14px 28px; background: var(--ds-color-primary); font-weight: 600;">Download</a>
            </div>
        </article>
    </main>

    <aside class="ds-sidebar-right">
        <div class="ds-ad-box">
            <p style="font-size: .85rem; color: var(--ds-color-text-muted);">Anzeigen-Platzhalter</p>
        </div>
    </aside>
</div>"""

    import json as _json
    return _json.dumps({"css": css_content, "html": html_content})

def _wp_immersive(draft: dict, re) -> str:
    """Schema 2 – The Immersive: dark background, parallax hero, card grid, violet accents."""
    title   = draft.get("title", "")
    excerpt = draft.get("excerpt", "")
    content = draft.get("content", "")
    provider = draft.get("ai_meta", {}).get("provider", "KI")
    model    = draft.get("ai_meta", {}).get("model", "")

    # Parse card_grid (pipe-separated alternating title|body pairs)
    card_grid_raw = draft.get("card_grid", "")
    card_parts = card_grid_raw.split("|")
    cards_html = ""
    for i in range(0, len(card_parts) - 1, 2):
        t = card_parts[i].strip()
        b = card_parts[i+1].strip() if i+1 < len(card_parts) else ""
        if t:
            cards_html += f'<div class="ds-card"><h3>{t}</h3><p>{b}</p></div>\n'

    def md_body(md: str) -> str:
        lines = md.split('\n')
        out = []
        in_ul = False
        def close():
            nonlocal in_ul
            if in_ul: out.append('</ul>'); in_ul = False
        def inl(s):
            s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
            return re.sub(r'\*(.+?)\*', r'<em>\1</em>', s)
        for line in lines:
            m = re.match(r'^(#{1,3})\s+(.+)$', line)
            if m:
                close(); depth=len(m.group(1)); t=m.group(2).strip()
                a=re.sub(r'[^a-z0-9]+','-',t.lower()).strip('-')
                out.append(f'<h{depth} id="{a}" class="ds-h{depth}">{inl(t)}</h{depth}>'); continue
            if line.startswith('> '):
                close(); out.append(f'<blockquote class="ds-quote"><p>{inl(line[2:].strip())}</p></blockquote>'); continue
            bm = re.match(r'^[-*]\s+(.+)$', line)
            if bm:
                if not in_ul: out.append('<ul class="ds-list">'); in_ul=True
                out.append(f'<li>{inl(bm.group(1))}</li>'); continue
            if not line.strip(): close(); continue
            close(); out.append(f'<p class="ds-para">{inl(line.strip())}</p>')
        close()
        return '\n'.join(out)

    body_html = md_body(content)

    hero_img = draft.get("hero_image", "")
    parallax_text = draft.get("parallax_section", excerpt.split('\n')[0] if excerpt else "")
    parallax_style = f'background-image:url({hero_img});' if hero_img else 'background:linear-gradient(135deg,#4c1d95,#701a75);'

    inner = f"""<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
:host,.ds-root{{display:block;font-family:'Inter',-apple-system,sans-serif;}}
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0;}}
#ds-progress{{position:fixed;top:0;left:0;width:0%;height:3px;background:linear-gradient(90deg,#7c3aed,#ec4899);z-index:9999;transition:width .12s;}}
.ds-page{{background:#0d0d0d;color:#fff;min-height:100vh;-webkit-font-smoothing:antialiased;}}
.ds-inner{{max-width:860px;margin:0 auto;padding:3.5rem 1.5rem 6rem;}}
.ds-meta{{display:flex;gap:.5rem;margin-bottom:1.5rem;}}
.ds-badge{{font-size:.72rem;padding:.2rem .55rem;border-radius:.4rem;background:rgba(255,255,255,.08);color:rgba(255,255,255,.6);border:1px solid rgba(255,255,255,.1);}}
.ds-badge-primary{{background:rgba(124,58,237,.25);color:#c4b5fd;border:none;}}
.ds-h1{{font-size:clamp(2rem,5vw,2.8rem);font-weight:800;letter-spacing:-0.03em;line-height:1.15;margin-bottom:2rem;}}
.ds-parallax{{height:300px;{parallax_style}background-size:cover;background-position:center;border-radius:1.25rem;display:flex;align-items:center;justify-content:center;margin:0 0 3rem;position:relative;overflow:hidden;}}
.ds-parallax-overlay{{position:absolute;inset:0;background:rgba(0,0,0,.4);}}
.ds-parallax-text{{position:relative;font-size:1.5rem;font-weight:700;text-align:center;padding:0 2rem;text-shadow:0 2px 12px rgba(0,0,0,.6);}}
.ds-intro{{font-size:1.1rem;color:rgba(255,255,255,.7);line-height:1.8;margin-bottom:2.5rem;white-space:pre-line;}}
.ds-card-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:1rem;margin:2rem 0 3rem;}}
.ds-card{{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:1rem;padding:1.25rem;}}
.ds-card h3{{font-size:1rem;font-weight:700;color:#c4b5fd;margin-bottom:.4rem;}}
.ds-card p{{font-size:.9rem;color:rgba(255,255,255,.6);line-height:1.7;}}
.ds-h2{{font-size:1.5rem;font-weight:700;margin:2.5rem 0 .5rem;}}
.ds-h3{{font-size:1.2rem;font-weight:600;color:rgba(255,255,255,.7);margin:1.5rem 0 .3rem;}}
.ds-para{{font-size:1.05rem;line-height:1.8;color:rgba(255,255,255,.75);margin-bottom:1rem;}}
.ds-list{{padding-left:1.5rem;margin-bottom:1rem;font-size:1.05rem;line-height:1.8;color:rgba(255,255,255,.7);}}
.ds-quote{{border-left:4px solid #7c3aed;background:rgba(124,58,237,.12);padding:.75rem 1.25rem;border-radius:0 1rem 1rem 0;margin:1.5rem 0;font-style:italic;color:#c4b5fd;font-size:1.1rem;}}
</style>
<div id="ds-progress"></div>
<div class="ds-page"><div class="ds-inner">
  <div class="ds-meta">
    <span class="ds-badge ds-badge-primary">✨ KI-generiert</span>
    <span class="ds-badge">⚙ {provider} · {model}</span>
    <span class="ds-badge">🌐 de</span>
  </div>
  <h1 class="ds-h1">{title}</h1>
  <div class="ds-parallax"><div class="ds-parallax-overlay"></div><div class="ds-parallax-text">{parallax_text}</div></div>
  {f'<p class="ds-intro">{excerpt}</p>' if excerpt else ''}
  {f'<div class="ds-card-grid">{cards_html}</div>' if cards_html else ''}
  {body_html}
</div></div>
<script>
(function(){{
  var bar = document.currentScript.getRootNode().getElementById('ds-progress');
  window.addEventListener('scroll', function(){{
    var h = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    if(bar) bar.style.width = (h>0?window.scrollY/h*100:0)+'%';
  }}, {{passive:true}});
}})();
</script>"""
    return _shadow_wrap(inner)


def _wp_datahub(draft: dict, re) -> str:
    """Schema 3 – The Data Hub: info box, table, author note, blue #2196f3."""
    title    = draft.get("title", "")
    excerpt  = draft.get("excerpt", "")
    content  = draft.get("content", "")
    info_box = draft.get("info_box", "")
    author   = draft.get("author_note", "Reviewed von KI-Redaktion & Experten-Team")
    provider = draft.get("ai_meta", {}).get("provider", "KI")
    model    = draft.get("ai_meta", {}).get("model", "")

    def md_body(md: str) -> str:
        lines = md.split('\n'); out = []; in_ul = in_ol = in_table = False; thead_done = False
        def cl():
            nonlocal in_ul, in_ol
            if in_ul: out.append('</ul>'); in_ul=False
            if in_ol: out.append('</ol>'); in_ol=False
        def ct():
            nonlocal in_table, thead_done
            if in_table: out.append('</tbody></table></div>'); in_table=False; thead_done=False
        def inl(s):
            s=re.sub(r'\*\*(.+?)\*\*',r'<strong>\1</strong>',s)
            return re.sub(r'\*(.+?)\*',r'<em>\1</em>',s)
        for line in lines:
            m=re.match(r'^(#{1,3})\s+(.+)$',line)
            if m:
                cl(); ct(); d=len(m.group(1)); t=m.group(2).strip()
                a=re.sub(r'[^a-z0-9]+','-',t.lower()).strip('-')
                out.append(f'<h{d} id="{a}" class="ds-h{d}">{inl(t)}</h{d}>'); continue
            if line.startswith('> '):
                cl(); ct(); out.append(f'<blockquote class="ds-quote"><p>{inl(line[2:].strip())}</p></blockquote>'); continue
            if '|' in line:
                cells=[c.strip() for c in line.strip().strip('|').split('|')]
                if re.match(r'^[\s|:-]+$',line):
                    if in_table and not thead_done: out.append('</thead><tbody>'); thead_done=True
                    continue
                if not in_table: cl(); out.append('<div class="ds-table-wrap"><table class="ds-table"><thead>'); in_table=True; thead_done=False
                tag='th' if not thead_done else 'td'
                out.append('<tr>'+''.join(f'<{tag}>{inl(c)}</{tag}>' for c in cells)+'</tr>'); continue
            if in_table: ct()
            bm=re.match(r'^[-*]\s+(.+)$',line)
            if bm:
                if in_ol: out.append('</ol>'); in_ol=False
                if not in_ul: out.append('<ul class="ds-list">'); in_ul=True
                out.append(f'<li>{inl(bm.group(1))}</li>'); continue
            nm=re.match(r'^\d+\.\s+(.+)$',line)
            if nm:
                if in_ul: out.append('</ul>'); in_ul=False
                if not in_ol: out.append('<ol class="ds-list ds-ol">'); in_ol=True
                out.append(f'<li>{inl(nm.group(1))}</li>'); continue
            if not line.strip(): cl(); continue
            cl(); out.append(f'<p class="ds-para">{inl(line.strip())}</p>')
        cl(); ct(); return '\n'.join(out)

    body_html = md_body(content)
    info_html = f'<div class="ds-info-box"><strong>Quick-Summary:</strong><p>{info_box}</p></div>' if info_box else ''
    excerpt_html = f'<div class="ds-excerpt"><p>{excerpt}</p></div>' if excerpt else ''

    inner = f"""<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
:host,.ds-root{{display:block;font-family:'Inter',-apple-system,sans-serif;}}
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0;}}
#ds-progress{{position:fixed;top:0;left:0;width:0%;height:3px;background:#2196f3;z-index:9999;transition:width .12s;}}
.ds-page{{background:#fff;color:#1d1d1f;min-height:100vh;-webkit-font-smoothing:antialiased;}}
.ds-inner{{max-width:820px;margin:0 auto;padding:3rem 1.5rem 6rem;}}
.ds-meta{{display:flex;gap:.5rem;margin-bottom:1.5rem;flex-wrap:wrap;}}
.ds-badge{{font-size:.72rem;padding:.2rem .55rem;border-radius:.4rem;background:#f5f5f7;color:#888;border:1px solid rgba(0,0,0,.07);}}
.ds-badge-primary{{background:rgba(33,150,243,.12);color:#1565c0;border:none;}}
.ds-info-box{{background:#e3f2fd;border-left:5px solid #2196f3;padding:1.25rem 1.5rem;margin-bottom:2rem;border-radius:0 .75rem .75rem 0;}}
.ds-info-box strong{{display:block;color:#1565c0;font-size:.875rem;margin-bottom:.35rem;}}
.ds-info-box p{{color:#333;line-height:1.7;}}
.ds-excerpt{{background:#f5f5f7;border-left:4px solid #2196f3;padding:1rem 1.5rem;margin-bottom:2rem;border-radius:0 8px 8px 0;}}
.ds-excerpt p{{white-space:pre-line;line-height:1.7;color:#444;}}
.ds-h1{{font-size:clamp(1.75rem,4vw,2.2rem);font-weight:800;letter-spacing:-0.02em;line-height:1.2;margin-bottom:1.5rem;color:#1d1d1f;}}
.ds-h2{{font-size:1.4rem;font-weight:700;margin:2.5rem 0 .5rem;border-top:2px solid #e3f2fd;padding-top:1rem;color:#1d1d1f;}}
.ds-h3{{font-size:1.15rem;font-weight:600;margin:1.5rem 0 .35rem;color:#2196f3;}}
.ds-para{{font-size:1.05rem;line-height:1.8;color:#333;margin-bottom:1rem;}}
.ds-list{{padding-left:1.5rem;margin-bottom:1rem;font-size:1.05rem;line-height:1.8;color:#444;}}
.ds-ol{{list-style:decimal;}}
.ds-quote{{background:#e3f2fd;border-left:5px solid #2196f3;padding:.75rem 1.25rem;border-radius:0 .75rem .75rem 0;margin:1.5rem 0;font-style:italic;color:#1565c0;font-size:1.1rem;}}
.ds-table-wrap{{overflow-x:auto;margin:2rem 0;border-radius:.75rem;box-shadow:0 4px 12px rgba(0,0,0,.07);}}
.ds-table{{width:100%;border-collapse:collapse;font-size:.95rem;background:#fff;}}
.ds-table th{{background:#2196f3;color:#fff;padding:12px 16px;text-align:left;font-weight:700;}}
.ds-table td{{padding:12px 16px;border-bottom:1px solid #eee;color:#555;}}
.ds-table tr:last-child td{{border-bottom:none;}}
.ds-table tr:nth-child(even) td{{background:#f9f9f9;}}
.ds-author{{display:flex;align-items:center;gap:14px;background:#fafafa;border:1px solid #eee;padding:14px 20px;border-radius:50px;margin-top:3rem;}}
.ds-author img{{width:44px;height:44px;border-radius:50%;flex-shrink:0;}}
.ds-author span{{font-size:.9rem;color:#555;}}
</style>
<div id="ds-progress"></div>
<div class="ds-page"><div class="ds-inner">
  {info_html}
  <div class="ds-meta">
    <span class="ds-badge ds-badge-primary">✨ KI-generiert</span>
    <span class="ds-badge">⚙ {provider} · {model}</span>
    <span class="ds-badge">🌐 de</span>
  </div>
  <h1 class="ds-h1">{title}</h1>
  {excerpt_html}
  {body_html}
  <div class="ds-author">
    <img src="https://i.pravatar.cc/50" alt="Autor" loading="lazy">
    <span>{author}</span>
  </div>
</div></div>
<script>
(function(){{
  var bar = document.currentScript.getRootNode().getElementById('ds-progress');
  window.addEventListener('scroll', function(){{
    var h = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    if(bar) bar.style.width = (h>0?window.scrollY/h*100:0)+'%';
  }}, {{passive:true}});
}})();
</script>"""
    return _shadow_wrap(inner)



class ApproveDraftRequest(BaseModel):
    draft_id:     str
    site_url:     str
    username:     str
    app_password: str
    # Optional content overrides from the editor
    title:        Optional[str] = None
    excerpt:      Optional[str] = None
    content:      Optional[str] = None
    template:     Optional[str] = None   # 'authority' | 'immersive' | 'datahub'
    visual_options: Optional[dict] = None


@app.post("/api/approve_draft", tags=["shortcuts"])
async def approve_draft_shortcut(req: ApproveDraftRequest):
    """Post the approved draft to WordPress via REST API, then mark as live."""
    import uuid as _uuid, httpx
    from fastapi import HTTPException

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Post).where(Post.id == _uuid.UUID(req.draft_id)))
        post_obj = result.scalar_one_or_none()
    draft = post_to_dict(post_obj) if post_obj else None
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    # Merge any editor overrides (title/excerpt/content/template changed in VisualBuilderShell)
    merged_draft = {
        **draft,
        **({
            "title":    req.title,
            "excerpt":  req.excerpt,
            "content":  req.content,
        } if req.title or req.excerpt or req.content else {}),
    }
    if req.template:
        merged_draft["template"] = req.template
    if req.visual_options is not None:
        merged_draft["visual_options"] = req.visual_options

    # Build WordPress URL and credentials
    wp_url = req.site_url.rstrip("/") + "/wp-json/wp/v2/posts"
    password = req.app_password.replace(" ", "")

    # Build the full styled HTML for the chosen schema
    styled_content = build_wp_html(merged_draft)


# ════════════════════════════════════════════════════════════════════════════
# GEO SCORE — KI-Sichtbarkeits-Score Dashboard
# ════════════════════════════════════════════════════════════════════════════

from app.geo_engine import GEOScoreCalculator, SERPStrategyAnalyzer


class GEOScoreRequest(BaseModel):
    target_url: str
    keyword:    str


@app.post("/api/geo/score", tags=["geo"])
async def geo_score(req: GEOScoreRequest):
    """
    Berechnet den GEO-Score (0–100) für eine Kunden-URL:
      Citation Score  50% – Ist die URL in der AI-Overview zitiert?
      Semantic Match  30% – Vokabular-Überlappung mit KI-Text?
      FAQ Coverage    20% – Wie viele PAA-Fragen werden abgedeckt?
    """
    s = get_settings()
    calc = GEOScoreCalculator(api_key=s.serp_api_key)
    return await calc.score(req.target_url, req.keyword)
