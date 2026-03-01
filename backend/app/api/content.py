"""
Content generation / trigger API
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_customer
from app.models.blog import Blog, ContentSource
from app.services.scheduler import generate_post_task

router = APIRouter(prefix="/api/content", tags=["content"])


class GenerateRequest(BaseModel):
    blog_id: uuid.UUID
    topic: str


class GenerateResponse(BaseModel):
    task_id: str
    message: str


@router.post("/generate", response_model=GenerateResponse)
@router.post("/generate_draft", response_model=GenerateResponse)
async def trigger_generation(
    req: GenerateRequest,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_customer),
):
    """
    Enqueue an async post-generation task for the given blog + topic.
    The draft is created in the background (Celery) and stored with
    is_approved=False. The user then approves via the dashboard.
    """
    # Load blog + sources
    blog = await db.get(Blog, req.blog_id)
    if not blog:
        raise HTTPException(status_code=404, detail="Blog not found")

    result = await db.execute(
        select(ContentSource).where(
            ContentSource.blog_id == req.blog_id,
            ContentSource.is_active == True,  # noqa: E712
        )
    )
    sources = [
        {"source_type": s.source_type, "url": s.url, "keyword": s.keyword, "is_active": s.is_active}
        for s in result.scalars().all()
    ]

    # Dispatch Celery task
    task = generate_post_task.delay(
        blog_id=str(req.blog_id),
        topic=req.topic,
        sources=sources,
        style_profile=blog.style_profile,
        language="de",
    )
    return GenerateResponse(
        task_id=task.id,
        message=f"Generation task queued (task_id={task.id}). Check the dashboard for the draft.",
    )

# Since the frontend sends 'client_id' instead of 'blog_id', let's add an adapter
class FrontendGenerateRequest(BaseModel):
    client_id: str
    topic: str

@router.post("/api/generate_draft", response_model=GenerateResponse) # To match exactly what frontend expects if it didn't use the router prefix properly, but frontend uses API_BASE/generate_draft
async def frontend_trigger_generation(
    req: FrontendGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_customer: dict = Depends(get_current_customer),
):
    # Call the actual implementation
    gen_req = GenerateRequest(blog_id=uuid.UUID(req.client_id), topic=req.topic)
    return await trigger_generation(gen_req, db, current_customer)
