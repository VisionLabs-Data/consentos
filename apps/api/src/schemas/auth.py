import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class TokenPayload(BaseModel):
    sub: str  # user ID
    org_id: str  # organisation ID
    role: str  # user role
    exp: datetime
    iat: datetime
    type: str = "access"  # "access" or "refresh"


class CurrentUser(BaseModel):
    """Represents the authenticated user extracted from a JWT."""

    id: uuid.UUID
    organisation_id: uuid.UUID
    email: str
    role: str

    def has_role(self, *roles: str) -> bool:
        return self.role in roles

    @property
    def is_admin(self) -> bool:
        return self.role in ("owner", "admin")
