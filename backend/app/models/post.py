import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.core.database import Base


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    blog_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("blogs.id", ondelete="CASCADE"), nullable=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    slug: Mapped[str] = mapped_column(String(512), nullable=False)
    content_html: Mapped[str | None] = mapped_column(Text, nullable=True)
    excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)
    author_name: Mapped[str | None] = mapped_column(String(255), nullable=True)   # human author
    language: Mapped[str] = mapped_column(String(10), default="de")
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | pending | live | archived

    # ── COMPLIANCE: Human-in-the-Loop approval ───────────────────────────────
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True
    )

    # ── AI metadata (for EU AI Act transparency logging) ────────────────────
    ai_meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # e.g. {"model": "gpt-4o", "prompt_version": "1.2", "provider": "openai"}

    # ── Editor design settings (VisualOptions) ───────────────────────────────
    visual_opts: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # e.g. {"style": {"brand_primary": "#007AFF"}, "master_hero": {...}}

    # ── Ghost content fields (editable fields from Editor canvas) ────────────
    ghost_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # e.g. {"h1_hero": "...", "intro_block": "...", "author_name": "...", sections: [...]}

    # ── SEO ──────────────────────────────────────────────────────────────────
    seo_keywords: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    meta_description: Mapped[str | None] = mapped_column(Text, nullable=True)

    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ── Agent scheduling fields ──────────────────────────────────────────────
    scheduled_slot_key: Mapped[str | None] = mapped_column(String(30), nullable=True, index=True)
    site_url: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    blog: Mapped["Blog"] = relationship("Blog", back_populates="posts")
    assets: Mapped[list["Asset"]] = relationship("Asset", back_populates="post")


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"))
    url: Mapped[str] = mapped_column(Text, nullable=False)
    alt_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # ── COMPLIANCE: GDPR + EU AI Act ─────────────────────────────────────────
    is_ai_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_tag: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # e.g. "AI-Generated via DALL-E 3" or "AI-Generated via Stable Diffusion XL"
    license: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # "commercial-free" | "ai-generated" | "pexels-commercial"
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    post: Mapped["Post"] = relationship("Post", back_populates="assets")
