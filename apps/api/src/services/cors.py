"""Dynamic CORS origin validation.

Provides an origin validator that checks incoming origins against
registered site domains (primary + additional) in addition to the
statically configured allowed_origins list.
"""

from __future__ import annotations

import logging
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.site import Site

logger = logging.getLogger(__name__)


def extract_domain_from_origin(origin: str) -> str | None:
    """Extract the hostname from an origin URL.

    e.g. 'https://example.com:443' → 'example.com'
    """
    try:
        parsed = urlparse(origin)
        return parsed.hostname
    except Exception:
        return None


async def get_allowed_domains(db: AsyncSession) -> set[str]:
    """Fetch all registered domains (primary + additional) from active sites."""
    result = await db.execute(
        select(Site.domain, Site.additional_domains).where(
            Site.is_active.is_(True),
            Site.deleted_at.is_(None),
        )
    )

    domains: set[str] = set()
    for row in result.all():
        domains.add(row.domain.lower())
        if row.additional_domains:
            for d in row.additional_domains:
                domains.add(d.lower())

    return domains


def is_origin_allowed(
    origin: str,
    static_origins: list[str],
    registered_domains: set[str],
) -> bool:
    """Check if an origin is allowed by either the static list or registered domains.

    Args:
        origin: The Origin header value (e.g. 'https://example.com').
        static_origins: Statically configured allowed origins from settings.
        registered_domains: Set of registered site domains from the database.

    Returns:
        True if the origin is allowed.
    """
    # Check static origins first (exact match)
    if origin in static_origins:
        return True

    # Wildcard — allow everything
    if "*" in static_origins:
        return True

    # Extract domain from origin and check against registered domains
    domain = extract_domain_from_origin(origin)
    return bool(domain and domain.lower() in registered_domains)
