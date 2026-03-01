"""
Schedule SQLAlchemy model — ersetzt _schedule_store dict.
Eine Row pro Site (unique per site_url, unique per customer).
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Boolean, Integer, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class SiteSchedule(Base):
    __tablename__ = "site_schedules"

    # site_id = Frontend-generierte ID, z.B. "LF-5096-X2"
    site_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    site_url: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    customer_id: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)

    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    posts_per_week: Mapped[int] = mapped_column(Integer, default=3)
    days_in_advance: Mapped[int] = mapped_column(Integer, default=7)
    selected_slots: Mapped[list] = mapped_column(JSONB, default=lambda: ["09:00", "15:00"])
    sources: Mapped[list] = mapped_column(JSONB, default=lambda: [])

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self) -> dict:
        """Kompatibles Format wie bisheriger _schedule_store."""
        return {
            "site_id":       self.site_id,
            "site_url":      self.site_url,
            "enabled":       self.enabled,
            "postsPerWeek":  self.posts_per_week,
            "daysInAdvance": self.days_in_advance,
            "selectedSlots": self.selected_slots or [],
        }
