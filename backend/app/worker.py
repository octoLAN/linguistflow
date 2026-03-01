"""
Celery Worker — LinguistFlow
Broker & Backend: Redis

Starte mit:
  celery -A app.worker worker --loglevel=info --concurrency=2
  celery -A app.worker beat --loglevel=info   (für periodischen Schedule-Check)
"""
import asyncio
import logging
from celery import Celery
from celery.schedules import crontab

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

# ── Celery App ────────────────────────────────────────────────────────────────
celery_app = Celery(
    "linguistflow",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.worker"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,   # fair dispatch: one task at a time per worker
    task_acks_late=True,            # ack only on success (retry on crash)
)

# ── Beat Schedule: Prüfe offene Slots alle 5 Minuten ─────────────────────────
celery_app.conf.beat_schedule = {
    "check-open-slots": {
        "task": "app.worker.check_and_generate",
        "schedule": 300.0,          # alle 5 Minuten
    },
}


# ── Helper: asyncio Loop für Celery (sync wrapper) ───────────────────────────
def run_async(coro):
    """Führt async Coroutine aus einem Celery-Task (synchron) aus."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ── Task: Offene Slots prüfen und Artikel generieren ─────────────────────────
@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def check_and_generate(self):
    """
    Haupttask: Liest Schedule-Config aus DB, findet offene Slots,
    dispatched generate_article_task für jeden offenen Slot.
    """
    from app.core.database import AsyncSessionLocal
    from app.models.schedule import SiteSchedule
    from app.models.post import Post
    from sqlalchemy import select as sa_select
    from app.services.autonomous_agent import find_open_slots

    async def _run():
        async with AsyncSessionLocal() as db:
            # Schedule-Config aus DB lesen
            sched_result = await db.execute(
                sa_select(SiteSchedule).where(SiteSchedule.enabled == True)  # noqa
            )
            schedules = sched_result.scalars().all()
            schedule_store = {s.site_id: s.to_dict() for s in schedules}

            if not schedule_store:
                logger.info("Celery: Keine Schedules konfiguriert — überspringe.")
                return 0

            # Drafts aus DB lesen (für Slot-Collision-Check)
            posts_result = await db.execute(
                sa_select(Post).where(Post.status.notin_(["deleted"]))
            )
            posts = posts_result.scalars().all()
            draft_store = [
                {
                    "id": str(p.id),
                    "status": p.status,
                    "title": p.title,
                    "ai_meta": p.ai_meta or {},
                }
                for p in posts
            ]

            open_slots = find_open_slots(schedule_store, draft_store)
            logger.info(f"Celery: {len(open_slots)} offene Slot(s) gefunden.")

            for slot in open_slots:
                generate_article_task.delay(
                    site_id=slot["site_id"],
                    site_url=slot["site_url"],
                    slot_key=slot["slot_key"],
                    publish_dt=slot["publish_dt"].isoformat(),
                    cfg=slot["cfg"],
                )

            return len(open_slots)

    try:
        return run_async(_run())
    except Exception as exc:
        logger.exception("check_and_generate fehlgeschlagen: %s", exc)
        raise self.retry(exc=exc)


# ── Task: Einzelnen Artikel generieren ───────────────────────────────────────
@celery_app.task(bind=True, max_retries=2, default_retry_delay=120, time_limit=600)
def generate_article_task(self, site_id: str, site_url: str, slot_key: str,
                           publish_dt: str, cfg: dict):
    """
    Generiert einen Artikel für einen bestimmten Slot und speichert ihn in der DB.
    """
    from app.core.database import AsyncSessionLocal
    from app.models.post import Post
    from app.core.config import get_settings
    from app.services.autonomous_agent import compute_publish_slots
    import uuid

    s = get_settings()

    async def _run():
        # Kurzes Site-Context Dummy (wird durch echten analyse_customer_site ersetzt)
        site_ctx = f"Site: {site_url}"
        source_ctx = ""

        from app.services.autonomous_agent import generate_article
        from datetime import datetime, timezone

        # Topic Discovery via Gemini
        topic = f"Artikel für {site_url}"  # TODO: echte Topic-Discovery

        # Article Generation
        article = await generate_article(
            topic=topic,
            site_ctx=site_ctx,
            source_ctx=source_ctx,
            gemini_api_key=s.gemini_api_key,
            openalex_api_key=getattr(s, "openalex_api_key", ""),
        )

        # In DB speichern
        pub_dt = datetime.fromisoformat(publish_dt)

        async with AsyncSessionLocal() as db:
            post = Post(
                id=uuid.uuid4(),
                title=article["title"],
                slug=article["title"].lower().replace(" ", "-")[:200],
                content_html=article.get("content", ""),
                excerpt=article.get("teaser", "")[:500],
                language="de",
                status="draft",
                ai_meta={
                    "model": "gemini-2.5-flash",
                    "provider": "gemini",
                    "scheduled_slot_key": slot_key,
                    "site_url": site_url,
                    "site_id": site_id,
                    "scheduled_publish_at": publish_dt,
                },
                ghost_data=article.get("ghost_data"),
                scheduled_at=pub_dt,
            )
            db.add(post)
            await db.commit()
            logger.info(f"Celery: Artikel gespeichert — {article['title'][:60]}")

    try:
        run_async(_run())
    except Exception as exc:
        logger.exception("generate_article_task fehlgeschlagen: %s", exc)
        raise self.retry(exc=exc)
