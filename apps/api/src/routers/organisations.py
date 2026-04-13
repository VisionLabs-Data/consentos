import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config.settings import get_settings
from src.db import get_db
from src.models.organisation import Organisation
from src.schemas.auth import CurrentUser
from src.schemas.organisation import (
    OrganisationCreate,
    OrganisationResponse,
    OrganisationUpdate,
)
from src.services.dependencies import require_role

router = APIRouter(prefix="/organisations", tags=["organisations"])


def _require_bootstrap_token(
    x_admin_bootstrap_token: str | None = Header(default=None),
) -> None:
    """Gate organisation creation behind a static bootstrap token.

    The token is configured via ``ADMIN_BOOTSTRAP_TOKEN``. When unset
    (the default), the endpoint is disabled entirely — operators must
    explicitly opt in and should rotate or unset the value after their
    initial org is provisioned.
    """
    expected = get_settings().admin_bootstrap_token
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Organisation creation is disabled. Set ADMIN_BOOTSTRAP_TOKEN "
                "in the environment to enable it."
            ),
        )
    if not x_admin_bootstrap_token or not hmac.compare_digest(
        x_admin_bootstrap_token,
        expected,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin bootstrap token",
        )


@router.post("/", response_model=OrganisationResponse, status_code=status.HTTP_201_CREATED)
async def create_organisation(
    body: OrganisationCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_bootstrap_token),
) -> Organisation:
    """Create a new organisation. Gated by ``X-Admin-Bootstrap-Token``.

    See :func:`_require_bootstrap_token` for the gating semantics. Once
    your initial organisation exists, rotate or unset
    ``ADMIN_BOOTSTRAP_TOKEN`` to disable further tenant creation.
    """
    # Check slug uniqueness
    existing = await db.execute(select(Organisation).where(Organisation.slug == body.slug))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Organisation with slug '{body.slug}' already exists",
        )

    org = Organisation(**body.model_dump())
    db.add(org)
    await db.flush()
    await db.refresh(org)
    return org


@router.get("/me", response_model=OrganisationResponse)
async def get_my_organisation(
    current_user: CurrentUser = Depends(require_role("owner", "admin", "editor", "viewer")),
    db: AsyncSession = Depends(get_db),
) -> Organisation:
    """Get the current user's organisation."""
    result = await db.execute(
        select(Organisation).where(
            Organisation.id == current_user.organisation_id,
            Organisation.deleted_at.is_(None),
        )
    )
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organisation not found")
    return org


@router.patch("/me", response_model=OrganisationResponse)
async def update_my_organisation(
    body: OrganisationUpdate,
    current_user: CurrentUser = Depends(require_role("owner", "admin")),
    db: AsyncSession = Depends(get_db),
) -> Organisation:
    """Update the current user's organisation. Requires owner or admin role."""
    result = await db.execute(
        select(Organisation).where(
            Organisation.id == current_user.organisation_id,
            Organisation.deleted_at.is_(None),
        )
    )
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organisation not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(org, field, value)

    await db.flush()
    await db.refresh(org)
    return org
