"""Unit tests for the CDN publisher service."""

import contextlib
import json
import os
from pathlib import Path
from unittest.mock import patch

import pytest

from src.services.publisher import PublishResult, _publish_local, publish_site_config


class TestPublishResult:
    def test_success_result(self):
        result = PublishResult(success=True, path="/cdn/config.json")
        assert result.success is True
        assert result.path == "/cdn/config.json"
        assert result.published_at is not None
        assert result.error is None

    def test_failure_result(self):
        result = PublishResult(success=False, path="", error="Something went wrong")
        assert result.success is False
        assert result.published_at is None
        assert result.error == "Something went wrong"


class TestPublishLocal:
    @pytest.mark.asyncio
    async def test_publish_creates_files(self):
        config = {"site_id": "abc-123", "blocking_mode": "opt_in"}
        path = await _publish_local("abc-123", config, "https://cdn.example.com")
        assert os.path.exists(path)
        with open(path) as f:
            data = json.load(f)
        assert data["site_id"] == "abc-123"

    @pytest.mark.asyncio
    async def test_publish_creates_versioned_copy(self):
        config = {"site_id": "def-456", "blocking_mode": "opt_out"}
        path = await _publish_local("def-456", config, "https://cdn.example.com")
        publish_dir = Path(path).parent
        versioned = list(publish_dir.glob("site-config-def-456-*.json"))
        assert len(versioned) >= 1


class TestPublishSiteConfig:
    @pytest.mark.asyncio
    async def test_publish_success(self):
        site_config = {
            "blocking_mode": "opt_in",
            "tcf_enabled": False,
            "gcm_enabled": True,
            "consent_expiry_days": 365,
        }
        result = await publish_site_config("site-123", site_config)
        assert result.success is True
        assert result.path != ""
        assert result.published_at is not None

    @pytest.mark.asyncio
    async def test_publish_with_org_defaults(self):
        site_config = {"blocking_mode": "opt_in"}
        org_defaults = {"consent_expiry_days": 180}
        result = await publish_site_config("site-456", site_config, org_defaults)
        assert result.success is True

    @pytest.mark.asyncio
    async def test_publish_failure_returns_error(self):
        with patch(
            "src.services.publisher._publish_local",
            side_effect=OSError("Permission denied"),
        ):
            result = await publish_site_config("site-789", {"blocking_mode": "opt_in"})
        assert result.success is False
        assert "Permission denied" in result.error


@pytest.fixture(autouse=True)
def _cleanup_cdn():
    yield
    cdn_dir = Path("cdn-publish")
    if cdn_dir.exists():
        for f in cdn_dir.glob("site-config-*.json"):
            f.unlink(missing_ok=True)
        with contextlib.suppress(OSError):
            cdn_dir.rmdir()
