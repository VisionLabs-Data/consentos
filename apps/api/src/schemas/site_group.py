import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class SiteGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class SiteGroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None


class SiteGroupResponse(BaseModel):
    id: uuid.UUID
    organisation_id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    site_count: int = 0

    model_config = {"from_attributes": True}
