"""Unit tests for translations router — mocked database."""

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from src.main import create_app
from src.services.auth import create_access_token

ORG_ID = uuid.uuid4()
USER_ID = uuid.uuid4()
SITE_ID = uuid.uuid4()


def _auth_headers(role="owner"):
    token = create_access_token(
        user_id=USER_ID, organisation_id=ORG_ID, role=role, email="admin@test.com"
    )
    return {"Authorization": f"Bearer {token}"}


def _mock_site(**overrides):
    site = MagicMock()
    site.id = overrides.get("id", SITE_ID)
    site.organisation_id = overrides.get("organisation_id", ORG_ID)
    site.domain = "example.com"
    site.display_name = "Example"
    site.is_active = True
    site.deleted_at = None
    site.additional_domains = None
    site.site_group_id = None
    site.created_at = datetime.now(UTC)
    site.updated_at = datetime.now(UTC)
    return site


def _mock_translation(**overrides):
    t = MagicMock()
    t.id = overrides.get("id", uuid.uuid4())
    t.site_id = overrides.get("site_id", SITE_ID)
    t.locale = overrides.get("locale", "fr")
    t.strings = overrides.get(
        "strings",
        {"title": "Nous utilisons des cookies", "acceptAll": "Tout accepter"},
    )
    t.created_at = datetime.now(UTC)
    t.updated_at = datetime.now(UTC)
    return t


@pytest.fixture
def mock_app():
    return create_app()


async def _client(app, mock_session):
    from src.db import get_db

    async def _override():
        yield mock_session

    app.dependency_overrides[get_db] = _override
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


def _mock_db_sequence(*results):
    """Create a mock session returning different results on successive execute() calls."""
    session = AsyncMock()
    mock_results = []
    for r in results:
        result = MagicMock()
        if isinstance(r, list):
            scalars_obj = MagicMock()
            scalars_obj.all.return_value = r
            result.scalars.return_value = scalars_obj
            result.scalar_one_or_none.return_value = r[0] if r else None
        else:
            result.scalar_one_or_none.return_value = r
        mock_results.append(result)
    session.execute = AsyncMock(side_effect=mock_results)

    _added = []

    def _fake_add(obj):
        _added.append(obj)

    session.add = MagicMock(side_effect=_fake_add)

    async def _fake_flush():
        for obj in _added:
            if getattr(obj, "id", None) is None:
                obj.id = uuid.uuid4()
            if hasattr(obj, "created_at") and getattr(obj, "created_at", None) is None:
                obj.created_at = datetime.now(UTC)
            if hasattr(obj, "updated_at") and getattr(obj, "updated_at", None) is None:
                obj.updated_at = datetime.now(UTC)

    session.flush = AsyncMock(side_effect=_fake_flush)
    session.refresh = AsyncMock()
    session.delete = AsyncMock()
    return session


class TestListTranslations:
    @pytest.mark.asyncio
    async def test_list_translations(self, mock_app):
        """GET /sites/{id}/translations/ returns all translations."""
        site = _mock_site()
        fr = _mock_translation(locale="fr")
        de = _mock_translation(locale="de")
        db = _mock_db_sequence(site, [fr, de])
        async with await _client(mock_app, db) as client:
            resp = await client.get(
                f"/api/v1/sites/{SITE_ID}/translations/",
                headers=_auth_headers(),
            )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2

    @pytest.mark.asyncio
    async def test_list_translations_empty(self, mock_app):
        """GET /sites/{id}/translations/ returns empty list when no translations."""
        site = _mock_site()
        db = _mock_db_sequence(site, [])
        async with await _client(mock_app, db) as client:
            resp = await client.get(
                f"/api/v1/sites/{SITE_ID}/translations/",
                headers=_auth_headers(),
            )
        assert resp.status_code == 200
        assert resp.json() == []


class TestGetTranslation:
    @pytest.mark.asyncio
    async def test_get_translation(self, mock_app):
        """GET /sites/{id}/translations/fr returns the French translation."""
        site = _mock_site()
        fr = _mock_translation(locale="fr")
        db = _mock_db_sequence(site, fr)
        async with await _client(mock_app, db) as client:
            resp = await client.get(
                f"/api/v1/sites/{SITE_ID}/translations/fr",
                headers=_auth_headers(),
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["locale"] == "fr"
        assert "title" in data["strings"]

    @pytest.mark.asyncio
    async def test_get_translation_not_found(self, mock_app):
        """GET /sites/{id}/translations/xx returns 404."""
        site = _mock_site()
        db = _mock_db_sequence(site, None)
        async with await _client(mock_app, db) as client:
            resp = await client.get(
                f"/api/v1/sites/{SITE_ID}/translations/xx",
                headers=_auth_headers(),
            )
        assert resp.status_code == 404


class TestCreateTranslation:
    @pytest.mark.asyncio
    async def test_create_translation(self, mock_app):
        """POST /sites/{id}/translations/ creates a new translation."""
        site = _mock_site()
        db = _mock_db_sequence(site, None)  # site lookup, duplicate check
        async with await _client(mock_app, db) as client:
            resp = await client.post(
                f"/api/v1/sites/{SITE_ID}/translations/",
                json={
                    "locale": "de",
                    "strings": {"title": "Wir verwenden Cookies"},
                },
                headers=_auth_headers(),
            )
        assert resp.status_code == 201
        data = resp.json()
        assert data["locale"] == "de"

    @pytest.mark.asyncio
    async def test_create_translation_conflict(self, mock_app):
        """POST returns 409 when locale already exists."""
        site = _mock_site()
        existing = _mock_translation(locale="fr")
        db = _mock_db_sequence(site, existing)
        async with await _client(mock_app, db) as client:
            resp = await client.post(
                f"/api/v1/sites/{SITE_ID}/translations/",
                json={"locale": "fr", "strings": {"title": "test"}},
                headers=_auth_headers(),
            )
        assert resp.status_code == 409


class TestUpdateTranslation:
    @pytest.mark.asyncio
    async def test_update_translation(self, mock_app):
        """PUT /sites/{id}/translations/fr updates the strings."""
        site = _mock_site()
        fr = _mock_translation(locale="fr")
        db = _mock_db_sequence(site, fr)
        async with await _client(mock_app, db) as client:
            resp = await client.put(
                f"/api/v1/sites/{SITE_ID}/translations/fr",
                json={"strings": {"title": "Updated title"}},
                headers=_auth_headers(),
            )
        assert resp.status_code == 200
        assert fr.strings == {"title": "Updated title"}

    @pytest.mark.asyncio
    async def test_update_translation_not_found(self, mock_app):
        """PUT returns 404 when locale does not exist."""
        site = _mock_site()
        db = _mock_db_sequence(site, None)
        async with await _client(mock_app, db) as client:
            resp = await client.put(
                f"/api/v1/sites/{SITE_ID}/translations/xx",
                json={"strings": {"title": "test"}},
                headers=_auth_headers(),
            )
        assert resp.status_code == 404


class TestDeleteTranslation:
    @pytest.mark.asyncio
    async def test_delete_translation(self, mock_app):
        """DELETE /sites/{id}/translations/fr removes the translation."""
        site = _mock_site()
        fr = _mock_translation(locale="fr")
        db = _mock_db_sequence(site, fr)
        async with await _client(mock_app, db) as client:
            resp = await client.delete(
                f"/api/v1/sites/{SITE_ID}/translations/fr",
                headers=_auth_headers(),
            )
        assert resp.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_requires_admin(self, mock_app):
        """DELETE returns 403 for editors."""
        db = _mock_db_sequence()
        async with await _client(mock_app, db) as client:
            resp = await client.delete(
                f"/api/v1/sites/{SITE_ID}/translations/fr",
                headers=_auth_headers(role="editor"),
            )
        assert resp.status_code == 403


class TestPublicTranslation:
    @pytest.mark.asyncio
    async def test_get_public_translation(self, mock_app):
        """GET /translations/{site_id}/fr returns raw strings (no auth)."""
        fr = _mock_translation(locale="fr")
        db = _mock_db_sequence(fr)
        async with await _client(mock_app, db) as client:
            resp = await client.get(f"/api/v1/translations/{SITE_ID}/fr")
        assert resp.status_code == 200
        data = resp.json()
        assert "title" in data

    @pytest.mark.asyncio
    async def test_get_public_translation_not_found(self, mock_app):
        """GET /translations/{site_id}/xx returns 404."""
        db = _mock_db_sequence(None)
        async with await _client(mock_app, db) as client:
            resp = await client.get(f"/api/v1/translations/{SITE_ID}/xx")
        assert resp.status_code == 404
