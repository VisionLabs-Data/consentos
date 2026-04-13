"""Integration tests for consent recording endpoints (requires database)."""

import uuid

from tests.conftest import create_test_site, requires_db


@requires_db
class TestConsentEndpoints:
    async def test_record_consent(self, db_client, auth_headers):
        """POST /consent/ is public (no auth) — used by the banner."""
        site_id = await create_test_site(db_client, auth_headers, domain_prefix="consent")
        resp = await db_client.post(
            "/api/v1/consent/",
            json={
                "site_id": site_id,
                "visitor_id": str(uuid.uuid4()),
                "action": "accept_all",
                "categories_accepted": [
                    "necessary",
                    "functional",
                    "analytics",
                    "marketing",
                    "personalisation",
                ],
                "categories_rejected": [],
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["action"] == "accept_all"
        assert "id" in data

    async def test_record_consent_reject_all(self, db_client, auth_headers):
        site_id = await create_test_site(db_client, auth_headers, domain_prefix="consent-rej")
        resp = await db_client.post(
            "/api/v1/consent/",
            json={
                "site_id": site_id,
                "visitor_id": str(uuid.uuid4()),
                "action": "reject_all",
                "categories_accepted": ["necessary"],
                "categories_rejected": [
                    "functional",
                    "analytics",
                    "marketing",
                    "personalisation",
                ],
            },
        )
        assert resp.status_code == 201
        assert resp.json()["action"] == "reject_all"

    async def test_record_consent_custom(self, db_client, auth_headers):
        site_id = await create_test_site(db_client, auth_headers, domain_prefix="consent-cust")
        resp = await db_client.post(
            "/api/v1/consent/",
            json={
                "site_id": site_id,
                "visitor_id": str(uuid.uuid4()),
                "action": "custom",
                "categories_accepted": [
                    "necessary",
                    "analytics",
                ],
                "categories_rejected": [
                    "functional",
                    "marketing",
                    "personalisation",
                ],
            },
        )
        assert resp.status_code == 201
        assert resp.json()["action"] == "custom"

    async def test_get_consent_record(self, db_client, auth_headers):
        site_id = await create_test_site(db_client, auth_headers, domain_prefix="consent-get")
        # Create a consent record
        create_resp = await db_client.post(
            "/api/v1/consent/",
            json={
                "site_id": site_id,
                "visitor_id": str(uuid.uuid4()),
                "action": "accept_all",
                "categories_accepted": ["necessary"],
                "categories_rejected": [],
            },
        )
        consent_id = create_resp.json()["id"]

        resp = await db_client.get(
            f"/api/v1/consent/{consent_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["id"] == consent_id

    async def test_get_consent_requires_auth(self, db_client):
        """Reading a consent record without auth must be rejected."""
        resp = await db_client.get(f"/api/v1/consent/{uuid.uuid4()}")
        assert resp.status_code == 401

    async def test_verify_consent(self, db_client, auth_headers):
        site_id = await create_test_site(db_client, auth_headers, domain_prefix="consent-ver")
        create_resp = await db_client.post(
            "/api/v1/consent/",
            json={
                "site_id": site_id,
                "visitor_id": str(uuid.uuid4()),
                "action": "accept_all",
                "categories_accepted": ["necessary"],
                "categories_rejected": [],
            },
        )
        consent_id = create_resp.json()["id"]

        resp = await db_client.get(
            f"/api/v1/consent/verify/{consent_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is True
        assert str(data["id"]) == consent_id

    async def test_get_consent_not_found(self, db_client, auth_headers):
        resp = await db_client.get(
            f"/api/v1/consent/{uuid.uuid4()}",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    async def test_verify_consent_not_found(self, db_client, auth_headers):
        resp = await db_client.get(
            f"/api/v1/consent/verify/{uuid.uuid4()}",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    async def test_record_consent_invalid_action(self, db_client, auth_headers):
        site_id = await create_test_site(db_client, auth_headers, domain_prefix="consent-inv")
        resp = await db_client.post(
            "/api/v1/consent/",
            json={
                "site_id": site_id,
                "visitor_id": str(uuid.uuid4()),
                "action": "invalid_action",
                "categories_accepted": ["necessary"],
                "categories_rejected": [],
            },
        )
        assert resp.status_code == 422
