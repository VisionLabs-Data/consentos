"""Tests for consent signal validation — mocks Playwright."""

from unittest.mock import AsyncMock

import pytest

from src.consent_validator import (
    _is_tracker_request,
    validate_post_reject,
    validate_pre_consent,
)


class TestIsTrackerRequest:
    def test_known_tracker(self) -> None:
        assert _is_tracker_request("https://www.google-analytics.com/collect") is True

    def test_facebook_tracker(self) -> None:
        assert _is_tracker_request("https://connect.facebook.net/en_US/fbevents.js") is True

    def test_non_tracker(self) -> None:
        assert _is_tracker_request("https://example.com/style.css") is False

    def test_empty_url(self) -> None:
        assert _is_tracker_request("") is False

    def test_doubleclick(self) -> None:
        assert _is_tracker_request("https://ad.doubleclick.net/pixel") is True

    def test_hotjar(self) -> None:
        assert _is_tracker_request("https://static.hotjar.com/c/hotjar.js") is True


class TestValidatePreConsent:
    @pytest.mark.asyncio
    async def test_no_issues_with_only_essential_cookies(self) -> None:
        page = AsyncMock()
        page.evaluate = AsyncMock(return_value={"available": False})

        context = AsyncMock()
        context.cookies = AsyncMock(return_value=[{"name": "session_id", "domain": "example.com"}])

        issues = await validate_pre_consent(page, context, {"session_id"}, [])
        assert len(issues) == 0

    @pytest.mark.asyncio
    async def test_non_essential_cookies_flagged(self) -> None:
        page = AsyncMock()
        page.evaluate = AsyncMock(return_value={"available": False})

        context = AsyncMock()
        context.cookies = AsyncMock(
            return_value=[
                {"name": "session_id", "domain": "example.com"},
                {"name": "_ga", "domain": ".google-analytics.com"},
                {"name": "_fbp", "domain": ".facebook.com"},
            ]
        )

        issues = await validate_pre_consent(page, context, {"session_id"}, [])
        assert len(issues) >= 1
        cookie_issue = next(i for i in issues if i.check == "pre_consent_cookies")
        assert cookie_issue.severity == "critical"
        assert "_ga" in cookie_issue.message

    @pytest.mark.asyncio
    async def test_tracker_requests_flagged(self) -> None:
        page = AsyncMock()
        page.evaluate = AsyncMock(return_value={"available": False})

        context = AsyncMock()
        context.cookies = AsyncMock(return_value=[])

        tracker_urls = ["https://www.google-analytics.com/collect?v=1"]
        issues = await validate_pre_consent(page, context, set(), tracker_urls)
        assert len(issues) >= 1
        tracker_issue = next(i for i in issues if i.check == "pre_consent_trackers")
        assert tracker_issue.severity == "critical"


class TestValidatePostReject:
    @pytest.mark.asyncio
    async def test_clean_rejection(self) -> None:
        page = AsyncMock()
        context = AsyncMock()
        context.cookies = AsyncMock(return_value=[])

        issues = await validate_post_reject(page, context, set(), [])
        assert len(issues) == 0

    @pytest.mark.asyncio
    async def test_cookies_after_reject_flagged(self) -> None:
        page = AsyncMock()
        context = AsyncMock()
        context.cookies = AsyncMock(
            return_value=[{"name": "_ga", "domain": ".google-analytics.com"}]
        )

        issues = await validate_post_reject(page, context, set(), [])
        assert len(issues) >= 1
        assert issues[0].check == "post_reject_cookies"

    @pytest.mark.asyncio
    async def test_trackers_after_reject_flagged(self) -> None:
        page = AsyncMock()
        context = AsyncMock()
        context.cookies = AsyncMock(return_value=[])

        tracker_urls = ["https://www.google-analytics.com/collect"]
        issues = await validate_post_reject(page, context, set(), tracker_urls)
        assert len(issues) >= 1
        assert issues[0].check == "post_reject_trackers"
