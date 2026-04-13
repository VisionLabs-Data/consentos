"""Tests for OpenAPI schema generation and documentation."""

import pytest
from httpx import ASGITransport, AsyncClient

from src.main import create_app


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


class TestOpenAPISchema:
    @pytest.mark.asyncio
    async def test_openapi_endpoint_accessible(self, client):
        resp = await client.get("/openapi.json")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_schema_has_info(self, client):
        resp = await client.get("/openapi.json")
        schema = resp.json()
        assert schema["info"]["title"] == "ConsentOS API"
        assert "version" in schema["info"]
        assert "description" in schema["info"]
        assert "consent" in schema["info"]["description"].lower()

    @pytest.mark.asyncio
    async def test_schema_has_tags(self, client):
        resp = await client.get("/openapi.json")
        schema = resp.json()
        tag_names = {t["name"] for t in schema.get("tags", [])}
        expected_tags = {
            "auth",
            "config",
            "consent",
            "sites",
            "cookies",
            "scanner",
            "compliance",
            "organisations",
            "users",
        }
        assert expected_tags.issubset(tag_names)

    @pytest.mark.asyncio
    async def test_all_tags_have_descriptions(self, client):
        resp = await client.get("/openapi.json")
        schema = resp.json()
        for tag in schema.get("tags", []):
            assert "description" in tag, f"Tag '{tag['name']}' missing description"
            assert len(tag["description"]) > 10, f"Tag '{tag['name']}' has weak description"

    @pytest.mark.asyncio
    async def test_health_endpoint_in_schema(self, client):
        resp = await client.get("/openapi.json")
        schema = resp.json()
        assert "/health" in schema["paths"]

    @pytest.mark.asyncio
    async def test_key_endpoints_present(self, client):
        resp = await client.get("/openapi.json")
        paths = resp.json()["paths"]
        assert "/api/v1/auth/login" in paths
        assert "/api/v1/consent/" in paths
        assert "/api/v1/sites/" in paths
        assert "/api/v1/config/geo" in paths

    @pytest.mark.asyncio
    async def test_docs_endpoint_accessible(self, client):
        resp = await client.get("/docs")
        assert resp.status_code == 200


class TestOpenAPIEndpoints:
    @pytest.mark.asyncio
    async def test_config_endpoints_documented(self, client):
        resp = await client.get("/openapi.json")
        paths = resp.json()["paths"]
        config_paths = [p for p in paths if "/config/" in p]
        assert len(config_paths) >= 4  # public, resolved, geo-resolved, publish, geo

    @pytest.mark.asyncio
    async def test_consent_endpoints_documented(self, client):
        resp = await client.get("/openapi.json")
        paths = resp.json()["paths"]
        consent_paths = [p for p in paths if "/consent" in p]
        assert len(consent_paths) >= 1
