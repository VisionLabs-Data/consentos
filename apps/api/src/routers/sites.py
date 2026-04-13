import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_db
from src.models.site import Site
from src.models.site_config import SiteConfig
from src.schemas.auth import CurrentUser
from src.schemas.site import (
    SiteConfigCreate,
    SiteConfigResponse,
    SiteConfigUpdate,
    SiteCreate,
    SiteResponse,
    SiteUpdate,
)
from src.services.dependencies import require_role

router = APIRouter(prefix="/sites", tags=["sites"])


# ── Site CRUD ────────────────────────────────────────────────────────


@router.post("/", response_model=SiteResponse, status_code=status.HTTP_201_CREATED)
async def create_site(
    body: SiteCreate,
    current_user: CurrentUser = Depends(require_role("owner", "admin")),
    db: AsyncSession = Depends(get_db),
) -> Site:
    """Create a new site within the current organisation."""
    # Check domain uniqueness within the org
    existing = await db.execute(
        select(Site).where(
            Site.organisation_id == current_user.organisation_id,
            Site.domain == body.domain,
            Site.deleted_at.is_(None),
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Site with domain '{body.domain}' already exists in this organisation",
        )

    site = Site(
        organisation_id=current_user.organisation_id,
        domain=body.domain,
        display_name=body.display_name,
        site_group_id=body.site_group_id,
    )
    db.add(site)
    await db.flush()

    # Auto-create a default site configuration
    default_config = SiteConfig(site_id=site.id)
    db.add(default_config)
    await db.flush()

    await db.refresh(site)
    return site


@router.get("/", response_model=list[SiteResponse])
async def list_sites(
    site_group_id: uuid.UUID | None = Query(default=None),
    current_user: CurrentUser = Depends(require_role("owner", "admin", "editor", "viewer")),
    db: AsyncSession = Depends(get_db),
) -> list[Site]:
    """List all active sites in the current organisation, optionally filtered by group."""
    query = select(Site).where(
        Site.organisation_id == current_user.organisation_id,
        Site.deleted_at.is_(None),
    )
    if site_group_id is not None:
        query = query.where(Site.site_group_id == site_group_id)
    result = await db.execute(query.order_by(Site.domain))
    return list(result.scalars().all())


@router.get("/{site_id}", response_model=SiteResponse)
async def get_site(
    site_id: uuid.UUID,
    current_user: CurrentUser = Depends(require_role("owner", "admin", "editor", "viewer")),
    db: AsyncSession = Depends(get_db),
) -> Site:
    """Get a specific site by ID."""
    site = await _get_org_site(site_id, current_user.organisation_id, db)
    return site


@router.patch("/{site_id}", response_model=SiteResponse)
async def update_site(
    site_id: uuid.UUID,
    body: SiteUpdate,
    current_user: CurrentUser = Depends(require_role("owner", "admin", "editor")),
    db: AsyncSession = Depends(get_db),
) -> Site:
    """Update a site's display name or active status."""
    site = await _get_org_site(site_id, current_user.organisation_id, db)

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(site, field, value)

    await db.flush()
    await db.refresh(site)
    return site


@router.delete("/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_site(
    site_id: uuid.UUID,
    current_user: CurrentUser = Depends(require_role("owner", "admin")),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft-delete a site."""
    site = await _get_org_site(site_id, current_user.organisation_id, db)
    site.deleted_at = datetime.now(UTC)
    await db.flush()


# ── Site config CRUD ─────────────────────────────────────────────────


@router.get("/{site_id}/config", response_model=SiteConfigResponse)
async def get_site_config(
    site_id: uuid.UUID,
    current_user: CurrentUser = Depends(require_role("owner", "admin", "editor", "viewer")),
    db: AsyncSession = Depends(get_db),
) -> SiteConfig:
    """Get the configuration for a site."""
    await _get_org_site(site_id, current_user.organisation_id, db)
    result = await db.execute(select(SiteConfig).where(SiteConfig.site_id == site_id))
    config = result.scalar_one_or_none()
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Site configuration not found. Create one first.",
        )
    return config


@router.put("/{site_id}/config", response_model=SiteConfigResponse)
async def create_or_replace_site_config(
    site_id: uuid.UUID,
    body: SiteConfigCreate,
    current_user: CurrentUser = Depends(require_role("owner", "admin", "editor")),
    db: AsyncSession = Depends(get_db),
) -> SiteConfig:
    """Create or replace the full configuration for a site."""
    await _get_org_site(site_id, current_user.organisation_id, db)

    result = await db.execute(select(SiteConfig).where(SiteConfig.site_id == site_id))
    existing = result.scalar_one_or_none()

    if existing is not None:
        for field, value in body.model_dump().items():
            setattr(existing, field, value)
        await db.flush()
        await db.refresh(existing)
        return existing

    config = SiteConfig(site_id=site_id, **body.model_dump())
    db.add(config)
    await db.flush()
    await db.refresh(config)
    return config


@router.patch("/{site_id}/config", response_model=SiteConfigResponse)
async def update_site_config(
    site_id: uuid.UUID,
    body: SiteConfigUpdate,
    current_user: CurrentUser = Depends(require_role("owner", "admin", "editor")),
    db: AsyncSession = Depends(get_db),
) -> SiteConfig:
    """Partially update the configuration for a site."""
    await _get_org_site(site_id, current_user.organisation_id, db)

    result = await db.execute(select(SiteConfig).where(SiteConfig.site_id == site_id))
    config = result.scalar_one_or_none()
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Site configuration not found. Create one first.",
        )

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(config, field, value)

    await db.flush()
    await db.refresh(config)
    return config


# ── Helpers ──────────────────────────────────────────────────────────


async def _get_org_site(
    site_id: uuid.UUID,
    organisation_id: uuid.UUID,
    db: AsyncSession,
) -> Site:
    """Fetch a site ensuring it belongs to the given organisation."""
    result = await db.execute(
        select(Site).where(
            Site.id == site_id,
            Site.organisation_id == organisation_id,
            Site.deleted_at.is_(None),
        )
    )
    site = result.scalar_one_or_none()
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    return site
