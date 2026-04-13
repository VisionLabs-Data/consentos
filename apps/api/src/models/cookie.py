import uuid

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class CookieCategory(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Cookie category taxonomy (necessary, functional, analytics, marketing, personalisation)."""

    __tablename__ = "cookie_categories"

    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_essential: Mapped[bool] = mapped_column(default=False, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)

    # TCF purpose mapping
    tcf_purpose_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Google Consent Mode consent type mapping
    gcm_consent_types: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Relationships
    cookies: Mapped[list["Cookie"]] = relationship(back_populates="category")
    allow_list_entries: Mapped[list["CookieAllowListEntry"]] = relationship(
        back_populates="category"
    )


class Cookie(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A cookie discovered on a site via scanning or client-side reporting."""

    __tablename__ = "cookies"
    __table_args__ = (
        UniqueConstraint(
            "site_id",
            "name",
            "domain",
            "storage_type",
            name="uq_cookies_site_name_domain_type",
        ),
    )

    site_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sites.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cookie_categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    domain: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_type: Mapped[str] = mapped_column(String(30), server_default="cookie", nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    vendor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    max_age_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_http_only: Mapped[bool | None] = mapped_column(nullable=True)
    is_secure: Mapped[bool | None] = mapped_column(nullable=True)
    same_site: Mapped[str | None] = mapped_column(String(10), nullable=True)
    review_status: Mapped[str] = mapped_column(String(20), server_default="pending", nullable=False)
    first_seen_at: Mapped[str | None] = mapped_column(String(50), nullable=True)
    last_seen_at: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Relationships
    site: Mapped["Site"] = relationship(back_populates="cookies")  # noqa: F821
    category: Mapped["CookieCategory | None"] = relationship(back_populates="cookies")


class CookieAllowListEntry(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Approved cookies per site with category assignment."""

    __tablename__ = "cookie_allow_list"
    __table_args__ = (
        UniqueConstraint(
            "site_id",
            "name_pattern",
            "domain_pattern",
            name="uq_allow_list_site_name_domain",
        ),
    )

    site_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sites.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cookie_categories.id", ondelete="RESTRICT"),
        nullable=False,
    )
    name_pattern: Mapped[str] = mapped_column(String(255), nullable=False)
    domain_pattern: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    site: Mapped["Site"] = relationship(back_populates="cookie_allow_list")  # noqa: F821
    category: Mapped["CookieCategory"] = relationship(back_populates="allow_list_entries")


class KnownCookie(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Shared knowledge base of known cookie patterns for auto-categorisation."""

    __tablename__ = "known_cookies"
    __table_args__ = (
        UniqueConstraint("name_pattern", "domain_pattern", name="uq_known_cookies_name_domain"),
    )

    name_pattern: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    domain_pattern: Mapped[str] = mapped_column(String(255), nullable=False)
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cookie_categories.id", ondelete="RESTRICT"),
        nullable=False,
    )
    vendor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_regex: Mapped[bool] = mapped_column(default=False, nullable=False)
