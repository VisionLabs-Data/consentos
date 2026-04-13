import uuid

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Translation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Internationalisation strings per site per locale."""

    __tablename__ = "translations"
    __table_args__ = (UniqueConstraint("site_id", "locale", name="uq_translations_site_locale"),)

    site_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sites.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    locale: Mapped[str] = mapped_column(String(10), nullable=False)
    strings: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # Relationships
    site: Mapped["Site"] = relationship(back_populates="translations")  # noqa: F821
