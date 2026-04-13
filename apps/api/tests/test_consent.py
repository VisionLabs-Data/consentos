"""Tests for consent recording API schemas and routes."""

import uuid

import pytest
from pydantic import ValidationError

from src.schemas.consent import (
    ConsentAction,
    ConsentRecordCreate,
    ConsentRecordResponse,
    ConsentVerifyResponse,
)


class TestConsentSchemas:
    def test_create_accept_all(self):
        record = ConsentRecordCreate(
            site_id=uuid.uuid4(),
            visitor_id="visitor-abc-123",
            action=ConsentAction.ACCEPT_ALL,
            categories_accepted=["necessary", "analytics", "marketing"],
        )
        assert record.action == "accept_all"
        assert len(record.categories_accepted) == 3
        assert record.categories_rejected is None

    def test_create_custom(self):
        record = ConsentRecordCreate(
            site_id=uuid.uuid4(),
            visitor_id="visitor-xyz",
            action=ConsentAction.CUSTOM,
            categories_accepted=["necessary", "functional"],
            categories_rejected=["analytics", "marketing"],
            tc_string="COwQHgAAAAA",
            gcm_state={"analytics_storage": "denied", "ad_storage": "denied"},
            page_url="https://example.com/page",
            country_code="GB",
            region_code="GB-ENG",
        )
        assert record.action == "custom"
        assert record.tc_string == "COwQHgAAAAA"
        assert record.gcm_state["analytics_storage"] == "denied"

    def test_create_reject_all(self):
        record = ConsentRecordCreate(
            site_id=uuid.uuid4(),
            visitor_id="v-1",
            action=ConsentAction.REJECT_ALL,
            categories_accepted=["necessary"],
            categories_rejected=["analytics", "marketing", "functional"],
        )
        assert record.action == "reject_all"

    def test_empty_visitor_id_rejected(self):
        with pytest.raises(ValidationError):
            ConsentRecordCreate(
                site_id=uuid.uuid4(),
                visitor_id="",
                action=ConsentAction.ACCEPT_ALL,
                categories_accepted=["necessary"],
            )

    def test_invalid_action_rejected(self):
        with pytest.raises(ValidationError):
            ConsentRecordCreate(
                site_id=uuid.uuid4(),
                visitor_id="v-1",
                action="invalid_action",
                categories_accepted=[],
            )

    def test_response_from_attributes(self):
        resp = ConsentRecordResponse(
            id=uuid.uuid4(),
            site_id=uuid.uuid4(),
            visitor_id="v-1",
            action="accept_all",
            categories_accepted=["necessary"],
            categories_rejected=None,
            tc_string=None,
            gcm_state=None,
            page_url=None,
            country_code=None,
            region_code=None,
            consented_at="2026-01-01T00:00:00Z",
        )
        assert resp.action == "accept_all"

    def test_verify_response(self):
        resp = ConsentVerifyResponse(
            id=uuid.uuid4(),
            site_id=uuid.uuid4(),
            visitor_id="v-1",
            action="accept_all",
            categories_accepted=["necessary"],
            consented_at="2026-01-01T00:00:00Z",
        )
        assert resp.valid is True


class TestConsentActions:
    def test_action_values(self):
        assert ConsentAction.ACCEPT_ALL == "accept_all"
        assert ConsentAction.REJECT_ALL == "reject_all"
        assert ConsentAction.CUSTOM == "custom"
        assert ConsentAction.WITHDRAW == "withdraw"


@pytest.mark.asyncio
class TestConsentRoutesRegistered:
    async def test_consent_routes_exist(self, client):
        response = await client.get("/openapi.json")
        paths = response.json()["paths"]
        assert "/api/v1/consent/" in paths
        assert "/api/v1/consent/{consent_id}" in paths
        assert "/api/v1/consent/verify/{consent_id}" in paths

    async def test_consent_post_validates_body(self, client):
        """POST /consent rejects invalid payloads."""
        response = await client.post(
            "/api/v1/consent/",
            json={"invalid": "body"},
        )
        assert response.status_code == 422

    async def test_config_public_endpoint_exists(self, client):
        response = await client.get("/openapi.json")
        paths = response.json()["paths"]
        assert "/api/v1/config/sites/{site_id}" in paths
