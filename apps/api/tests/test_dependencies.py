"""Unit tests for auth dependencies."""

import uuid

from src.schemas.auth import CurrentUser
from src.services.auth import create_access_token, create_refresh_token, decode_token


class TestCurrentUser:
    def test_has_role_matching(self):
        user = CurrentUser(
            id=uuid.uuid4(),
            organisation_id=uuid.uuid4(),
            email="test@test.com",
            role="admin",
        )
        assert user.has_role("admin", "owner") is True

    def test_has_role_not_matching(self):
        user = CurrentUser(
            id=uuid.uuid4(),
            organisation_id=uuid.uuid4(),
            email="test@test.com",
            role="viewer",
        )
        assert user.has_role("admin", "owner") is False

    def test_is_admin_property(self):
        user = CurrentUser(
            id=uuid.uuid4(),
            organisation_id=uuid.uuid4(),
            email="test@test.com",
            role="admin",
        )
        assert user.is_admin is True

    def test_is_admin_owner(self):
        user = CurrentUser(
            id=uuid.uuid4(),
            organisation_id=uuid.uuid4(),
            email="test@test.com",
            role="owner",
        )
        assert user.is_admin is True

    def test_is_admin_viewer(self):
        user = CurrentUser(
            id=uuid.uuid4(),
            organisation_id=uuid.uuid4(),
            email="test@test.com",
            role="viewer",
        )
        assert user.is_admin is False


class TestTokenCreation:
    def test_access_token_roundtrip(self):
        user_id = uuid.uuid4()
        org_id = uuid.uuid4()
        token = create_access_token(
            user_id=user_id,
            organisation_id=org_id,
            role="editor",
            email="test@test.com",
        )
        payload = decode_token(token)
        assert payload["sub"] == str(user_id)
        assert payload["org_id"] == str(org_id)
        assert payload["role"] == "editor"
        assert payload["type"] == "access"

    def test_refresh_token_roundtrip(self):
        user_id = uuid.uuid4()
        org_id = uuid.uuid4()
        token = create_refresh_token(user_id=user_id, organisation_id=org_id)
        payload = decode_token(token)
        assert payload["sub"] == str(user_id)
        assert payload["type"] == "refresh"

    def test_access_token_is_not_refresh(self):
        token = create_access_token(
            user_id=uuid.uuid4(),
            organisation_id=uuid.uuid4(),
            role="viewer",
            email="test@test.com",
        )
        payload = decode_token(token)
        assert payload["type"] != "refresh"
