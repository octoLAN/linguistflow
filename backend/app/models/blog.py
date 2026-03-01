import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.core.database import Base

class Blog(Base):
    __tablename__ = "blogs"

    # Core Identifiers
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"), nullable=False)
    
    # Public Ingestion ID (The "XYZ123" token used by the Widget Script)
    widget_id: Mapped[str] = mapped_column(String, unique=True, index=True, default=lambda: uuid.uuid4().hex[:12])
    
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    language: Mapped[str] = mapped_column(String(10), default="de")
    
    # --- Universal Engine Schema Configuration ---
    # Stores the Elementor-style nested tree (e.g. [{"type": "hero", "id": "b1"}, {"type": "text"}])
    layout_schema: Mapped[dict] = mapped_column(JSONB, nullable=True, default={})
    
    # Stores global UI tokens altered via the Builder's sidebar (e.g. spacing multipliers, custom fonts)
    design_tokens: Mapped[dict] = mapped_column(JSONB, nullable=True, default={})

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    posts = relationship("Post", back_populates="blog", cascade="all, delete-orphan")
    sources = relationship("ContentSource", back_populates="blog", cascade="all, delete-orphan")
    schedule = relationship("Schedule", uselist=False, back_populates="blog", cascade="all, delete-orphan")


class ContentSource(Base):
    __tablename__ = "content_sources"

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    blog_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("blogs.id"), nullable=False)
    
    source_type: Mapped[str] = mapped_column(String(50)) # 'rss', 'url', 'keyword'
    url: Mapped[str] = mapped_column(Text, nullable=True)
    keyword: Mapped[str] = mapped_column(String(255), nullable=True)
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    blog = relationship("Blog", back_populates="sources")


class Schedule(Base):
    __tablename__ = "schedules"

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    blog_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("blogs.id"), nullable=False, unique=True)
    
    posts_per_week: Mapped[int] = mapped_column(default=3)
    
    # JSON array of strings e.g. ["09:00", "15:00"]
    preferred_time_slots: Mapped[list] = mapped_column(JSON, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    blog = relationship("Blog", back_populates="schedule")
