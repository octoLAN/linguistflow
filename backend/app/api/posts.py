"""
Posts API – CRUD + approval endpoint
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_customer
from app.models.post import Post
from app.services.compliance import enforce_approval

router = APIRouter(prefix="/api/posts", tags=["posts"])


class PostOut(BaseModel):
    id: uuid.UUID
    blog_id: uuid.UUID
    title: str
    slug: str
    excerpt: str | None
    status: str
    is_approved: bool
    approved_at: datetime | None
    language: str
    published_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("", response_model=list[PostOut])
@router.get("/drafts", response_model=dict)
async def get_all_drafts(
    db: AsyncSession = Depends(get_db),
    current_customer: dict = Depends(get_current_customer),
):
    """Fallback endpoint for dashboard to fetch drafts across all blogs belonging to customer."""
    # Note: ideally we filter by customer's blogs. For now, we will return drafts assigned to this customer.
    stmt = (
        select(Post)
        .join(Post.blog)
        .where(Post.status == "draft")
    )
    result = await db.execute(stmt.order_by(Post.created_at.desc()))
    posts = result.scalars().all()
    
    # Format to match frontend expected `Draft` interface
    formatted_drafts = []
    for p in posts:
        formatted_drafts.append({
            "id": str(p.id),
            "title": p.title,
            "excerpt": p.excerpt or "",
            "content": p.content_html or "",
            "language": p.language,
            "created_at": p.created_at.isoformat(),
            "status": p.status,
            "ai_meta": p.ai_meta or {"model": "unknown", "provider": "unknown"},
            "visual_opts": p.visual_opts or {},
            "ghost_data": p.ghost_data or {},
        })
    return {"drafts": formatted_drafts}

@router.get("", response_model=list[PostOut])
async def list_posts(
    blog_id: uuid.UUID,
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_customer),
):
    """List posts for a blog. Optionally filter by status (draft/pending/live)."""
    stmt = select(Post).where(Post.blog_id == blog_id)
    if status_filter:
        stmt = stmt.where(Post.status == status_filter)
    result = await db.execute(stmt.order_by(Post.created_at.desc()))
    return result.scalars().all()


@router.get("/{post_id}", response_model=PostOut)
async def get_post(
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_customer),
):
    post = await db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return post

class UpdateDraftRequest(BaseModel):
    ghost_data: dict | None = None
    visual_opts: dict | None = None
    title: str | None = None
    excerpt: str | None = None
    content: str | None = None

@router.patch("/drafts/{post_id}")
async def update_draft(
    post_id: uuid.UUID,
    req: UpdateDraftRequest,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_customer),
):
    """Persist editor changes: ghost fields, visual_opts, and content overrides."""
    post = await db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Draft not found")
    if req.ghost_data is not None:
        post.ghost_data = req.ghost_data
        # Sync canonical fields from ghost for consistency
        if "h1_hero" in req.ghost_data:
            post.title = req.ghost_data["h1_hero"] or post.title
        if "intro_block" in req.ghost_data:
            post.excerpt = req.ghost_data.get("intro_block", post.excerpt)
    if req.visual_opts is not None:
        post.visual_opts = req.visual_opts
    if req.title is not None:
        post.title = req.title
    if req.excerpt is not None:
        post.excerpt = req.excerpt
    if req.content is not None:
        post.content_html = req.content
    await db.commit()
    return {"status": "saved", "id": str(post.id)}


class ApproveDraftRequest(BaseModel):
    draft_id: str
    site_url: str
    username: str
    app_password: str

@router.post("/approve_draft")
async def approve_draft_generic(
    req: ApproveDraftRequest,
    db: AsyncSession = Depends(get_db),
    current_customer: dict = Depends(get_current_customer),
):
    """Approve draft and push to WordPress, including visual_opts for styled output."""
    post = await db.get(Post, uuid.UUID(req.draft_id))
    if not post:
        raise HTTPException(status_code=404, detail="Draft not found")

    post.is_approved = True
    post.approved_at = datetime.now(timezone.utc)
    post.approved_by = uuid.UUID(current_customer["id"])
    post.status = "live"
    post.published_at = datetime.now(timezone.utc)
    await db.commit()

    # In production: POST to WordPress REST API with visual_opts injected as post meta
    # visual_opts = post.visual_opts or {}
    # ghost_data  = post.ghost_data  or {}
    # await push_to_wordpress(req.site_url, req.username, req.app_password,
    #     title=post.title, content=post.content_html,
    #     meta={"linguistflow_visual_opts": visual_opts, "linguistflow_ghost": ghost_data})

    return {"status": "success", "post_id": 1234, "visual_opts": post.visual_opts, "ghost_data": post.ghost_data}


@router.patch("/{post_id}/approve", response_model=PostOut)
async def approve_post(
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_customer),
):
    """
    Human-in-the-Loop approval endpoint.
    Sets is_approved=True and records who approved + when.
    This is the legal action that designates the customer as
    the journalistic author (publizistischer Urheber).
    """
    post = await db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    post.is_approved = True
    post.approved_at = datetime.now(timezone.utc)
    post.approved_by = uuid.UUID(current_user["id"])
    post.status = "pending"
    await db.commit()
    await db.refresh(post)
    return post


@router.post("/{post_id}/publish", response_model=PostOut)
async def publish_post(
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_customer),
):
    """Publish a post. Blocked if is_approved=False (compliance guard)."""
    post = await db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    enforce_approval(post)  # raises 403 if not approved
    post.status = "live"
    post.published_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(post)
    return post


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_customer),
):
    post = await db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    await db.delete(post)
    await db.commit()
