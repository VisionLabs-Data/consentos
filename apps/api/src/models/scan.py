import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ScanJob(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A cookie scanning job for a site."""

    __tablename__ = "scan_jobs"

    site_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sites.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    status: Mapped[str] = mapped_column(
        String(20), server_default="pending", nullable=False, index=True
    )
    trigger: Mapped[str] = mapped_column(String(20), server_default="manual", nullable=False)
    pages_scanned: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    pages_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cookies_found: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    site: Mapped["Site"] = relationship(back_populates="scan_jobs")  # noqa: F821
    results: Mapped[list["ScanResult"]] = relationship(back_populates="scan_job")


class ScanResult(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Individual result from a scan — a cookie found on a specific page."""

    __tablename__ = "scan_results"

    scan_job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scan_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    page_url: Mapped[str] = mapped_column(Text, nullable=False)
    cookie_name: Mapped[str] = mapped_column(String(255), nullable=False)
    cookie_domain: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_type: Mapped[str] = mapped_column(String(30), server_default="cookie", nullable=False)
    attributes: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    script_source: Mapped[str | None] = mapped_column(Text, nullable=True)
    auto_category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    initiator_chain: Mapped[list[str] | None] = mapped_column(
        ARRAY(Text), nullable=True, comment="Ordered script URLs from root initiator to leaf"
    )

    found_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    scan_job: Mapped["ScanJob"] = relationship(back_populates="results")
