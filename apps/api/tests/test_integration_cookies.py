"""Integration tests for cookie and allow-list endpoints (requires database)."""

import uuid

import pytest

from tests.conftest import create_test_site, requires_db


@requires_db
class TestCookieCategoriesIntegration:
    async def test_list_categories_with_db(self, db_client):
        """Categories are seeded by migration; verify the endpoint."""
        resp = await db_client.get("/api/v1/cookies/categories")
        assert resp.status_code == 200
        categories = resp.json()
        assert isinstance(categories, list)
        # Should have at least the 5 seeded categories
        slugs = {c["slug"] for c in categories}
        assert "necessary" in slugs
        assert "analytics" in slugs

    async def test_get_category_by_id(self, db_client):
        cats_resp = await db_client.get("/api/v1/cookies/categories")
        if cats_resp.status_code == 200 and cats_resp.json():
            cat_id = cats_resp.json()[0]["id"]
            resp = await db_client.get(f"/api/v1/cookies/categories/{cat_id}")
            assert resp.status_code == 200

    async def test_get_category_not_found(self, db_client):
        resp = await db_client.get(f"/api/v1/cookies/categories/{uuid.uuid4()}")
        assert resp.status_code == 404


@requires_db
class TestCookieCRUDIntegration:
    async def test_list_cookies_empty(self, db_client, auth_headers):
        site_id = await create_test_site(db_client, auth_headers, domain_prefix="cookie-empty")
        resp = await db_client.get(
            f"/api/v1/cookies/sites/{site_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_create_and_list_cookie(self, db_client, auth_headers):
        site_id = await create_test_site(db_client, auth_headers, domain_prefix="cookie-create")
        create_resp = await db_client.post(
            f"/api/v1/cookies/sites/{site_id}",
            json={"name": "_ga", "domain": ".google.com"},
            headers=auth_headers,
        )
        assert create_resp.status_code == 201
        cookie = create_resp.json()
        assert cookie["name"] == "_ga"
        assert cookie["review_status"] == "pending"

        # Should now appear in list
        list_resp = await db_client.get(
            f"/api/v1/cookies/sites/{site_id}",
            headers=auth_headers,
        )
        assert len(list_resp.json()) >= 1

    async def test_update_cookie_review_status(self, db_client, auth_headers):
        site_id = await create_test_site(db_client, auth_headers, domain_prefix="cookie-upd")
        create_resp = await db_client.post(
            f"/api/v1/cookies/sites/{site_id}",
            json={"name": "_fbp", "domain": ".facebook.com"},
            headers=auth_headers,
        )
        cookie_id = create_resp.json()["id"]

        resp = await db_client.patch(
            f"/api/v1/cookies/sites/{site_id}/{cookie_id}",
            json={"review_status": "approved"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["review_status"] == "approved"

    async def test_delete_cookie(self, db_client, auth_headers):
        site_id = await create_test_site(db_client, auth_headers, domain_prefix="cookie-del")
        create_resp = await db_client.post(
            f"/api/v1/cookies/sites/{site_id}",
            json={"name": "_del_test", "domain": ".test.com"},
            headers=auth_headers,
        )
        cookie_id = create_resp.json()["id"]

        resp = await db_client.delete(
            f"/api/v1/cookies/sites/{site_id}/{cookie_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 204

    async def test_cookie_summary(self, db_client, auth_headers):
        site_id = await create_test_site(db_client, auth_headers, domain_prefix="cookie-sum")
        resp = await db_client.get(
            f"/api/v1/cookies/sites/{site_id}/summary",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "total" in data
        assert "by_status" in data
        assert "uncategorised" in data


@requires_db
class TestAllowListIntegration:
    async def _get_category_id(self, db_client):
        """Fetch the first available cookie category ID."""
        resp = await db_client.get("/api/v1/cookies/categories")
        categories = resp.json()
        if categories:
            return categories[0]["id"]
        return None

    async def test_create_allow_list_entry(self, db_client, auth_headers):
        site_id = await create_test_site(db_client, auth_headers, domain_prefix="allow-create")
        category_id = await self._get_category_id(db_client)
        if not category_id:
            pytest.skip("No categories seeded")

        resp = await db_client.post(
            f"/api/v1/cookies/sites/{site_id}/allow-list",
            json={
                "name_pattern": "_ga*",
                "domain_pattern": ".google.com",
                "category_id": category_id,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name_pattern"] == "_ga*"

    async def test_list_allow_list(self, db_client, auth_headers):
        site_id = await create_test_site(db_client, auth_headers, domain_prefix="allow-list")
        resp = await db_client.get(
            f"/api/v1/cookies/sites/{site_id}/allow-list",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_delete_allow_list_entry(self, db_client, auth_headers):
        site_id = await create_test_site(db_client, auth_headers, domain_prefix="allow-del")
        category_id = await self._get_category_id(db_client)
        if not category_id:
            pytest.skip("No categories seeded")

        create_resp = await db_client.post(
            f"/api/v1/cookies/sites/{site_id}/allow-list",
            json={
                "name_pattern": "_del_test*",
                "domain_pattern": ".test.com",
                "category_id": category_id,
            },
            headers=auth_headers,
        )
        entry_id = create_resp.json()["id"]

        resp = await db_client.delete(
            f"/api/v1/cookies/sites/{site_id}/allow-list/{entry_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 204
