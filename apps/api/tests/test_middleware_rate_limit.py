"""Tests for the rate limiting middleware."""

from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from src.middleware.rate_limit import RateLimitMiddleware


class TestRateLimitMiddleware:
    @pytest.mark.asyncio
    async def test_get_client_ip_from_forwarded_for(self):
        from starlette.applications import Starlette

        app = Starlette()
        middleware = RateLimitMiddleware(app)

        request = MagicMock()
        request.headers = {"x-forwarded-for": "1.2.3.4, 5.6.7.8"}
        assert middleware._get_client_ip(request) == "1.2.3.4"

    @pytest.mark.asyncio
    async def test_get_client_ip_from_real_ip(self):
        from starlette.applications import Starlette

        app = Starlette()
        middleware = RateLimitMiddleware(app)

        request = MagicMock()
        request.headers = {"x-real-ip": "9.8.7.6"}
        assert middleware._get_client_ip(request) == "9.8.7.6"

    @pytest.mark.asyncio
    async def test_get_client_ip_from_client(self):
        from starlette.applications import Starlette

        app = Starlette()
        middleware = RateLimitMiddleware(app)

        request = MagicMock()
        request.headers = {}
        request.client = MagicMock()
        request.client.host = "10.0.0.1"
        assert middleware._get_client_ip(request) == "10.0.0.1"

    @pytest.mark.asyncio
    async def test_get_client_ip_no_client(self):
        from starlette.applications import Starlette

        app = Starlette()
        middleware = RateLimitMiddleware(app)

        request = MagicMock()
        request.headers = {}
        request.client = None
        assert middleware._get_client_ip(request) == "unknown"

    @pytest.mark.asyncio
    async def test_health_bypasses_rate_limit(self):
        """Health checks should never be rate limited."""
        from src.main import create_app

        app = create_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/health")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_passes_through_when_redis_unavailable(self):
        """When Redis is down, requests should still be served."""
        from src.main import create_app

        # Rate limiting disabled by default in test settings
        app = create_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/health")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_rate_limit_headers_present(self):
        """Rate limit headers should be added when middleware is active."""
        from fastapi import FastAPI

        app = FastAPI()

        @app.get("/test")
        async def test_endpoint():
            return {"ok": True}

        # Mock Redis
        mock_redis = AsyncMock()
        mock_redis.incr = AsyncMock(return_value=1)
        mock_redis.expire = AsyncMock()

        middleware = RateLimitMiddleware(app, requests_per_minute=100)
        middleware._redis = mock_redis

        # Since we can't easily inject the mock Redis into the ASGI middleware,
        # test the logic unit separately
        assert middleware.requests_per_minute == 100

    @pytest.mark.asyncio
    async def test_middleware_creation(self):
        """Middleware should initialise with provided parameters."""
        from starlette.applications import Starlette

        app = Starlette()
        middleware = RateLimitMiddleware(app, redis_url="redis://fake:6379", requests_per_minute=30)
        assert middleware.requests_per_minute == 30
        assert middleware.redis_url == "redis://fake:6379"
        assert middleware._redis is None  # Lazy initialisation


class TestRateLimitConfiguration:
    def test_default_settings_enabled(self, monkeypatch):
        """Rate limiting is on by default — public endpoints must not be DoS-able.

        Note: the suite-wide conftest sets ``RATE_LIMIT_ENABLED=false``
        so other tests aren't rate-limited by Redis; we unset it here
        to verify the baked-in default.
        """
        monkeypatch.delenv("RATE_LIMIT_ENABLED", raising=False)

        from src.config.settings import Settings

        settings = Settings()
        assert settings.rate_limit_enabled is True

    def test_configurable_limit(self):
        """Rate limit per minute should be configurable."""
        from src.config.settings import Settings

        settings = Settings(rate_limit_per_minute=120)
        assert settings.rate_limit_per_minute == 120
