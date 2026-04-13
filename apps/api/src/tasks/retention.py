"""Consent record retention purge.

Deletes consent records older than each site's configured
``consent_retention_days``. Sites with no retention configured are
skipped — operators must explicitly opt in per site (or set it at the
org/system level and let the cascade resolve it).

Scheduled by ``celery beat`` daily at 01:00 UTC via the entry in
``src.celery_app.beat_schedule``.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from src.celery_app import app

logger = logging.getLogger(__name__)


async def _purge() -> dict[str, int]:
    """Delete expired consent records across all sites with retention set.

    Returns a summary ``{"sites_processed": N, "records_deleted": M}``.
    """
    from sqlalchemy import delete, select
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    from src.config.settings import get_settings
    from src.models.consent import ConsentRecord
    from src.models.site_config import SiteConfig

    settings = get_settings()
    engine = create_async_engine(settings.database_url, echo=False)

    sites_processed = 0
    records_deleted = 0

    async with AsyncSession(engine, expire_on_commit=False) as session:
        configs = (
            (
                await session.execute(
                    select(SiteConfig).where(SiteConfig.consent_retention_days.isnot(None)),
                )
            )
            .scalars()
            .all()
        )

        now = datetime.now(UTC)
        for cfg in configs:
            retention_days = cfg.consent_retention_days
            if not retention_days or retention_days <= 0:
                continue
            cutoff = now - timedelta(days=retention_days)
            result = await session.execute(
                delete(ConsentRecord).where(
                    ConsentRecord.site_id == cfg.site_id,
                    ConsentRecord.consented_at < cutoff,
                ),
            )
            deleted = result.rowcount or 0
            records_deleted += deleted
            sites_processed += 1
            if deleted:
                logger.info(
                    "retention.purged",
                    extra={
                        "site_id": str(cfg.site_id),
                        "retention_days": retention_days,
                        "deleted": deleted,
                        "cutoff": cutoff.isoformat(),
                    },
                )

        await session.commit()

    await engine.dispose()
    return {"sites_processed": sites_processed, "records_deleted": records_deleted}


@app.task(name="src.tasks.retention.purge_expired_consent_records")
def purge_expired_consent_records() -> dict[str, int]:
    """Celery entrypoint for the retention purge."""
    return asyncio.run(_purge())
