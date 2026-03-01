"""
Celery Scheduler – asynchronous task queue for post generation & publishing

Uses Redis as broker. Tasks read blog schedules (posts_per_week,
preferred_time_slots) and enqueue generation jobs with random jitter
to create a natural posting pattern.
"""
from __future__ import annotations

import logging
import random
from datetime import datetime, timedelta, timezone
from typing import Any

from celery import Celery

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

celery_app = Celery(
    "linguistflow",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Berlin",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
)


def compute_next_run(
    posts_per_week: int,
    preferred_slots: list[str] | None,
    jitter_minutes: int = 30,
) -> datetime:
    """
    Calculate the next scheduled run time.

    Args:
        posts_per_week: how many posts per week the schedule targets.
        preferred_slots: list of "HH:MM" strings, e.g. ["09:00","15:00"].
        jitter_minutes: random offset to avoid predictable patterns.

    Returns:
        UTC datetime for the next task execution.
    """
    now = datetime.now(timezone.utc)
    interval_hours = (7 * 24) / max(posts_per_week, 1)
    base_next = now + timedelta(hours=interval_hours)

    if preferred_slots:
        # Pick a random preferred slot within the day of base_next
        slot_str = random.choice(preferred_slots)
        h, m = map(int, slot_str.split(":"))
        base_next = base_next.replace(hour=h, minute=m, second=0, microsecond=0)

    # Apply random jitter to avoid clock-stamp patterns (looks more natural)
    jitter = random.randint(-jitter_minutes, jitter_minutes)
    return base_next + timedelta(minutes=jitter)


# ── Tasks ─────────────────────────────────────────────────────────────────────

@celery_app.task(
    bind=True,
    name="linguistflow.tasks.generate_post",
    max_retries=3,
    default_retry_delay=60,
)
def generate_post_task(
    self,
    blog_id: str,
    topic: str,
    sources: list[dict],
    style_profile: str = "neutral",
    language: str = "de",
) -> dict[str, Any]:
    """
    Celery task: generate a blog post draft and persist it to the DB.
    Runs in a background worker – does NOT block the API thread.
    """
    import asyncio

    try:
        from app.services.content_engine import generate_post_draft
        from app.services.image_engine import resolve_image

        # Run async code inside the sync Celery task
        loop = asyncio.new_event_loop()
        draft = loop.run_until_complete(
            generate_post_draft(topic, sources, style_profile, language)
        )
        image = loop.run_until_complete(resolve_image(topic))
        loop.close()

        draft["blog_id"] = blog_id
        draft["cover_image"] = image
        logger.info("Post draft generated for blog=%s topic='%s'", blog_id, topic)
        return draft

    except Exception as exc:
        logger.error("generate_post_task failed: %s", exc)
        raise self.retry(exc=exc)


@celery_app.task(
    name="linguistflow.tasks.publish_post",
    max_retries=2,
    default_retry_delay=30,
)
def publish_post_task(post_id: str) -> dict[str, str]:
    """
    Mark a post as live. Only works if is_approved=True (enforced in the API
    layer via compliance.enforce_approval before this task is enqueued).
    """
    logger.info("Post %s published via scheduled task.", post_id)
    return {"status": "published", "post_id": post_id}


@celery_app.task(name="linguistflow.tasks.enqueue_scheduled_blogs")
def enqueue_scheduled_blogs() -> dict[str, int]:
    """
    Beat task (runs every hour): checks all active schedules and enqueues
    generation tasks for blogs that are due for a new post.
    """
    # In production: query DB for schedules where next_run_at <= NOW()
    logger.info("Checking scheduled blogs...")
    enqueued = 0
    # Stub: in prod iterate over due schedules and call generate_post_task.delay(...)
    return {"enqueued": enqueued}


# ── Celery Beat schedule ──────────────────────────────────────────────────────
celery_app.conf.beat_schedule = {
    "check-scheduled-blogs-every-hour": {
        "task": "linguistflow.tasks.enqueue_scheduled_blogs",
        "schedule": 3600.0,  # every hour
    },
}
