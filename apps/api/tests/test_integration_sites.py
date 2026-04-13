"""Integration tests for site and site config endpoints (requires database)."""

import uuid

from tests.conftest import requires_db


@requires_db
class TestSiteCRUD:
    async def test_create_site(self, db_client, auth_headers):
        domain = f"example-{uuid.uuid4().hex[:8]}.com"
        resp = await db_client.post(
            "/api/v1/sites/",
            json={
                "domain": domain,
                "display_name": "Example Site",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["domain"] == domain
        assert data["display_name"] == "Example Site"
        assert data["is_active"] is True
        assert "id" in data

    async def test_create_site_duplicate_domain(self, db_client, auth_headers):
        domain = f"dup-{uuid.uuid4().hex[:8]}.com"
        # Create first
        await db_client.post(
            "/api/v1/sites/",
            json={
                "domain": domain,
                "display_name": "Dup Test",
            },
            headers=auth_headers,
        )
        # Duplicate should fail
        resp = await db_client.post(
            "/api/v1/sites/",
            json={
                "domain": domain,
                "display_name": "Dup Test",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 409

    async def test_list_sites(self, db_client, auth_headers):
        resp = await db_client.get("/api/v1/sites/", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_get_site(self, db_client, auth_headers):
        # Create a site first
        domain = f"get-{uuid.uuid4().hex[:8]}.com"
        create_resp = await db_client.post(
            "/api/v1/sites/",
            json={
                "domain": domain,
                "display_name": "Get Test",
            },
            headers=auth_headers,
        )
        site_id = create_resp.json()["id"]

        resp = await db_client.get(f"/api/v1/sites/{site_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["domain"] == domain

    async def test_get_site_not_found(self, db_client, auth_headers):
        resp = await db_client.get(
            f"/api/v1/sites/{uuid.uuid4()}",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    async def test_update_site(self, db_client, auth_headers):
        domain = f"update-{uuid.uuid4().hex[:8]}.com"
        create_resp = await db_client.post(
            "/api/v1/sites/",
            json={
                "domain": domain,
                "display_name": "Update Test",
            },
            headers=auth_headers,
        )
        site_id = create_resp.json()["id"]

        resp = await db_client.patch(
            f"/api/v1/sites/{site_id}",
            json={"display_name": "Updated Name"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["display_name"] == "Updated Name"

    async def test_delete_site_soft_deletes(self, db_client, auth_headers):
        domain = f"delete-{uuid.uuid4().hex[:8]}.com"
        create_resp = await db_client.post(
            "/api/v1/sites/",
            json={
                "domain": domain,
                "display_name": "Delete Test",
            },
            headers=auth_headers,
        )
        site_id = create_resp.json()["id"]

        resp = await db_client.delete(f"/api/v1/sites/{site_id}", headers=auth_headers)
        assert resp.status_code == 204

        # Should no longer be findable
        get_resp = await db_client.get(f"/api/v1/sites/{site_id}", headers=auth_headers)
        assert get_resp.status_code == 404

    async def test_create_site_requires_auth(self, db_client):
        resp = await db_client.post(
            "/api/v1/sites/",
            json={
                "domain": "noauth.com",
                "display_name": "No Auth",
            },
        )
        assert resp.status_code == 401


@requires_db
class TestSiteConfig:
    async def test_get_config_creates_default(self, db_client, auth_headers):
        domain = f"config-{uuid.uuid4().hex[:8]}.com"
        create_resp = await db_client.post(
            "/api/v1/sites/",
            json={
                "domain": domain,
                "display_name": "Config Test",
            },
            headers=auth_headers,
        )
        site_id = create_resp.json()["id"]

        # PUT config to create it
        put_resp = await db_client.put(
            f"/api/v1/sites/{site_id}/config",
            json={"blocking_mode": "opt_in"},
            headers=auth_headers,
        )
        assert put_resp.status_code in (200, 201)

        # GET config
        resp = await db_client.get(
            f"/api/v1/sites/{site_id}/config",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["blocking_mode"] == "opt_in"

    async def test_update_config(self, db_client, auth_headers):
        domain = f"config-upd-{uuid.uuid4().hex[:8]}.com"
        create_resp = await db_client.post(
            "/api/v1/sites/",
            json={
                "domain": domain,
                "display_name": "Config Update",
            },
            headers=auth_headers,
        )
        site_id = create_resp.json()["id"]

        # Create config
        await db_client.put(
            f"/api/v1/sites/{site_id}/config",
            json={"blocking_mode": "opt_in"},
            headers=auth_headers,
        )

        # Patch config
        resp = await db_client.patch(
            f"/api/v1/sites/{site_id}/config",
            json={
                "blocking_mode": "opt_out",
                "gcm_enabled": False,
                "consent_expiry_days": 180,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["blocking_mode"] == "opt_out"
        assert data["gcm_enabled"] is False
        assert data["consent_expiry_days"] == 180
