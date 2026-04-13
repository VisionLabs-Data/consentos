"""Integration tests for organisation and user endpoints (requires database)."""

import uuid

import pytest

from tests.conftest import requires_db

_BOOTSTRAP_TOKEN = "test-bootstrap-token-xyz"
_BOOTSTRAP_HEADERS = {"X-Admin-Bootstrap-Token": _BOOTSTRAP_TOKEN}


@pytest.fixture
def _bootstrap_enabled(monkeypatch):
    """Configure ``admin_bootstrap_token`` on the cached settings object."""
    from src.config.settings import get_settings

    monkeypatch.setattr(get_settings(), "admin_bootstrap_token", _BOOTSTRAP_TOKEN)
    yield


@requires_db
class TestOrganisationEndpoints:
    async def test_create_org(self, db_client, _bootstrap_enabled):
        slug = f"new-org-{uuid.uuid4().hex[:8]}"
        resp = await db_client.post(
            "/api/v1/organisations/",
            json={"name": "New Org", "slug": slug},
            headers=_BOOTSTRAP_HEADERS,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "New Org"
        assert data["slug"] == slug
        assert "id" in data

    async def test_create_org_duplicate_slug(self, db_client, _bootstrap_enabled):
        slug = f"dup-org-{uuid.uuid4().hex[:8]}"
        await db_client.post(
            "/api/v1/organisations/",
            json={"name": "Dup Org", "slug": slug},
            headers=_BOOTSTRAP_HEADERS,
        )
        resp = await db_client.post(
            "/api/v1/organisations/",
            json={"name": "Dup Org 2", "slug": slug},
            headers=_BOOTSTRAP_HEADERS,
        )
        assert resp.status_code == 409

    async def test_get_my_org(self, db_client, auth_headers, test_org):
        resp = await db_client.get("/api/v1/organisations/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["slug"] == test_org.slug

    async def test_update_my_org(self, db_client, auth_headers):
        resp = await db_client.patch(
            "/api/v1/organisations/me",
            json={"name": "Updated Org Name"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Org Name"


@requires_db
class TestUserEndpoints:
    async def test_list_users(self, db_client, auth_headers):
        resp = await db_client.get("/api/v1/users/", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
        assert len(resp.json()) >= 1  # At least the test user

    async def test_create_user(self, db_client, auth_headers):
        resp = await db_client.post(
            "/api/v1/users/",
            json={
                "email": f"new-{uuid.uuid4().hex[:8]}@test.com",
                "password": "SecurePass123",
                "full_name": "New User",
                "role": "editor",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["role"] == "editor"

    async def test_create_user_duplicate_email(self, db_client, auth_headers):
        email = f"dup-{uuid.uuid4().hex[:8]}@test.com"
        await db_client.post(
            "/api/v1/users/",
            json={
                "email": email,
                "password": "SecurePass123",
                "full_name": "Dup User",
                "role": "viewer",
            },
            headers=auth_headers,
        )
        resp = await db_client.post(
            "/api/v1/users/",
            json={
                "email": email,
                "password": "SecurePass123",
                "full_name": "Dup User",
                "role": "viewer",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 409

    async def test_get_user(self, db_client, auth_headers, test_user):
        resp = await db_client.get(
            f"/api/v1/users/{test_user.id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["email"] == test_user.email

    async def test_get_user_not_found(self, db_client, auth_headers):
        resp = await db_client.get(
            f"/api/v1/users/{uuid.uuid4()}",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    async def test_update_user(self, db_client, auth_headers):
        # Create a user to update
        create_resp = await db_client.post(
            "/api/v1/users/",
            json={
                "email": f"upd-{uuid.uuid4().hex[:8]}@test.com",
                "password": "SecurePass123",
                "full_name": "Update User",
                "role": "viewer",
            },
            headers=auth_headers,
        )
        user_id = create_resp.json()["id"]

        resp = await db_client.patch(
            f"/api/v1/users/{user_id}",
            json={
                "full_name": "Updated Name",
                "role": "editor",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["full_name"] == "Updated Name"
        assert resp.json()["role"] == "editor"

    async def test_delete_user(self, db_client, auth_headers):
        create_resp = await db_client.post(
            "/api/v1/users/",
            json={
                "email": f"del-{uuid.uuid4().hex[:8]}@test.com",
                "password": "SecurePass123",
                "full_name": "Delete User",
                "role": "viewer",
            },
            headers=auth_headers,
        )
        user_id = create_resp.json()["id"]

        resp = await db_client.delete(f"/api/v1/users/{user_id}", headers=auth_headers)
        assert resp.status_code == 204

    async def test_users_require_auth(self, db_client):
        resp = await db_client.get("/api/v1/users/")
        assert resp.status_code == 401
