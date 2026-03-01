"""
Blog & Content-Source CRUD + Widget feed endpoint
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_customer
from app.models.blog import Blog, ContentSource, Schedule
from app.models.post import Post

router = APIRouter(prefix="/api/blogs", tags=["blogs"])
widget_router = APIRouter(prefix="/widget", tags=["widget"])


# ── Blog CRUD ─────────────────────────────────────────────────────────────────

class BlogCreate(BaseModel):
    name: str
    slug: str
    style_profile: str = "neutral"


class BlogOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    style_profile: str
    is_active: bool

    class Config:
        from_attributes = True


@router.get("", response_model=list[BlogOut])
async def list_blogs(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_customer),
):
    result = await db.execute(
        select(Blog).where(Blog.customer_id == uuid.UUID(current_user["id"]))
    )
    return result.scalars().all()


@router.post("", response_model=BlogOut, status_code=201)
async def create_blog(
    data: BlogCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_customer),
):
    blog = Blog(
        customer_id=uuid.UUID(current_user["id"]),
        name=data.name,
        slug=data.slug,
        style_profile=data.style_profile,
    )
    db.add(blog)
    await db.commit()
    await db.refresh(blog)
    return blog


# ── Content Sources ───────────────────────────────────────────────────────────

class SourceCreate(BaseModel):
    source_type: str  # rss | url | keyword
    url: str | None = None
    keyword: str | None = None


class SourceOut(BaseModel):
    id: uuid.UUID
    source_type: str
    url: str | None
    keyword: str | None
    is_active: bool
    last_fetched_at: str | None = None

    class Config:
        from_attributes = True


@router.get("/{blog_id}/sources", response_model=list[SourceOut])
async def list_sources(
    blog_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_customer),
):
    result = await db.execute(
        select(ContentSource).where(ContentSource.blog_id == blog_id)
    )
    return result.scalars().all()


@router.post("/{blog_id}/sources", response_model=SourceOut, status_code=201)
async def add_source(
    blog_id: uuid.UUID,
    data: SourceCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_customer),
):
    source = ContentSource(blog_id=blog_id, **data.model_dump())
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return source


# ── Schedule ──────────────────────────────────────────────────────────────────

class ScheduleUpsert(BaseModel):
    posts_per_week: int = 3
    preferred_time_slots: list[str] | None = None
    enabled: bool = True


class ScheduleOut(BaseModel):
    id: uuid.UUID
    posts_per_week: int
    preferred_time_slots: list[str] | None
    enabled: bool
    next_run_at: str | None = None

    class Config:
        from_attributes = True


@router.put("/{blog_id}/schedule", response_model=ScheduleOut)
async def upsert_schedule(
    blog_id: uuid.UUID,
    data: ScheduleUpsert,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_customer),
):
    from app.services.scheduler import compute_next_run

    result = await db.execute(
        select(Schedule).where(Schedule.blog_id == blog_id)
    )
    schedule = result.scalar_one_or_none()
    next_run = compute_next_run(data.posts_per_week, data.preferred_time_slots)

    if schedule:
        schedule.posts_per_week = data.posts_per_week
        schedule.preferred_time_slots = data.preferred_time_slots
        schedule.enabled = data.enabled
        schedule.next_run_at = next_run
    else:
        schedule = Schedule(
            blog_id=blog_id,
            posts_per_week=data.posts_per_week,
            preferred_time_slots=data.preferred_time_slots,
            enabled=data.enabled,
            next_run_at=next_run,
        )
        db.add(schedule)
    await db.commit()
    await db.refresh(schedule)
    return schedule


# ── Widget feed (public, no auth, no IP logging) ──────────────────────────────

class WidgetPost(BaseModel):
    id: uuid.UUID
    title: str
    slug: str
    excerpt: str | None
    published_at: str | None
    language: str

    class Config:
        from_attributes = True


@widget_router.get("/posts", response_model=list[WidgetPost])
async def widget_posts(
    blog_id: uuid.UUID,
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
):
    """
    Public endpoint consumed by the JS widget.
    Returns only live + approved posts.
    No authentication required.
    No visitor data is collected (NoIPLoggingMiddleware handles this globally).
    """
    result = await db.execute(
        select(Post)
        .where(Post.blog_id == blog_id, Post.status == "live", Post.is_approved == True)  # noqa: E712
        .order_by(Post.published_at.desc())
        .limit(limit)
    )
    return result.scalars().all()
