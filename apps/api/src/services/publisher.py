"""CDN publishing pipeline.

Publishes resolved site configurations as static JSON files for the
banner script to fetch. Supports local filesystem (development) and
can be extended for S3/GCS/CloudFront.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from src.config.settings import get_settings

from .config_resolver import build_public_config, resolve_config

logger = logging.getLogger(__name__)


class PublishResult:
    """Result of a publish operation."""

    def __init__(self, success: bool, path: str, error: str | None = None) -> None:
        self.success = success
        self.path = path
        self.error = error
        self.published_at = datetime.now(UTC).isoformat() if success else None


async def publish_site_config(
    site_id: str,
    site_config: dict[str, Any],
    org_defaults: dict[str, Any] | None = None,
) -> PublishResult:
    """Resolve and publish a site configuration to CDN.

    Args:
        site_id: The site UUID as a string.
        site_config: Raw site configuration from the database.
        org_defaults: Organisation-level defaults (optional).

    Returns:
        PublishResult with success status and path.
    """
    try:
        # Resolve the full config hierarchy
        resolved = resolve_config(site_config, org_defaults)

        # Build the public-facing config
        public_config = build_public_config(site_id, resolved)

        # Publish to the configured backend
        settings = get_settings()
        path = await _publish_local(site_id, public_config, settings.cdn_base_url)

        logger.info("Published config for site %s to %s", site_id, path)
        return PublishResult(success=True, path=path)

    except Exception as exc:
        logger.exception("Failed to publish config for site %s", site_id)
        return PublishResult(success=False, path="", error=str(exc))


async def _publish_local(
    site_id: str,
    config: dict[str, Any],
    cdn_base: str,
) -> str:
    """Publish config to local filesystem (for development/Docker Compose).

    Writes to the CDN proxy's HTML directory so nginx can serve it.
    """
    # Default local publish directory
    publish_dir = Path("/app/cdn-publish") if Path("/app").exists() else Path("cdn-publish")
    publish_dir.mkdir(parents=True, exist_ok=True)

    # Write the config JSON
    config_path = publish_dir / f"site-config-{site_id}.json"
    config_path.write_text(json.dumps(config, indent=2, default=str))

    # Also write a versioned copy for cache-busting
    version = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    versioned_path = publish_dir / f"site-config-{site_id}-{version}.json"
    versioned_path.write_text(json.dumps(config, indent=2, default=str))

    return str(config_path)
