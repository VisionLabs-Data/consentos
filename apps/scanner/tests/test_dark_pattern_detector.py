"""Tests for dark pattern detection — mocks Playwright."""

from unittest.mock import AsyncMock

import pytest

from src.dark_pattern_detector import (
    check_button_prominence,
    check_cookie_wall,
    check_pre_ticked_boxes,
    detect_dark_patterns,
)


class TestCheckButtonProminence:
    @pytest.mark.asyncio
    async def test_no_accept_button_returns_empty(self) -> None:
        page = AsyncMock()
        page.query_selector_all = AsyncMock(return_value=[])
        issues = await check_button_prominence(page)
        assert issues == []

    @pytest.mark.asyncio
    async def test_missing_reject_button_flagged(self) -> None:
        # Accept button visible, reject not found
        accept_el = AsyncMock()
        accept_el.is_visible = AsyncMock(return_value=True)
        accept_el.evaluate = AsyncMock(
            return_value={
                "width": 200,
                "height": 40,
                "area": 8000,
                "backgroundColor": "rgb(37, 99, 235)",
                "color": "rgb(255, 255, 255)",
                "fontSize": 16,
                "fontWeight": "600",
                "padding": "8px 16px",
                "text": "Accept All",
                "visible": True,
            }
        )

        call_count = 0

        async def _mock_query(selector):
            nonlocal call_count
            call_count += 1
            # First batch of calls = accept selectors, return button
            # Remaining calls = reject selectors, return empty
            if "Accept" in selector or "Allow" in selector or "accept" in selector:
                return [accept_el]
            return []

        page = AsyncMock()
        page.query_selector_all = _mock_query

        issues = await check_button_prominence(page)
        assert any(i.pattern == "missing_reject_button" for i in issues)

    @pytest.mark.asyncio
    async def test_unequal_button_size_flagged(self) -> None:
        accept_el = AsyncMock()
        accept_el.is_visible = AsyncMock(return_value=True)
        accept_el.evaluate = AsyncMock(
            return_value={
                "width": 300,
                "height": 50,
                "area": 15000,
                "fontSize": 18,
                "fontWeight": "700",
                "text": "Accept All",
                "visible": True,
            }
        )

        reject_el = AsyncMock()
        reject_el.is_visible = AsyncMock(return_value=True)
        reject_el.evaluate = AsyncMock(
            return_value={
                "width": 100,
                "height": 30,
                "area": 3000,
                "fontSize": 12,
                "fontWeight": "400",
                "text": "Reject",
                "visible": True,
            }
        )

        async def _mock_query(selector):
            if "Accept" in selector or "Allow" in selector or "accept" in selector:
                return [accept_el]
            if "Reject" in selector or "Decline" in selector or "reject" in selector:
                return [reject_el]
            return []

        page = AsyncMock()
        page.query_selector_all = _mock_query

        issues = await check_button_prominence(page)
        assert any(i.pattern == "unequal_button_size" for i in issues)


class TestCheckPreTickedBoxes:
    @pytest.mark.asyncio
    async def test_no_pre_ticked_returns_empty(self) -> None:
        page = AsyncMock()
        page.evaluate = AsyncMock(return_value=[])
        issues = await check_pre_ticked_boxes(page)
        assert issues == []

    @pytest.mark.asyncio
    async def test_pre_ticked_non_essential_flagged(self) -> None:
        page = AsyncMock()
        page.evaluate = AsyncMock(
            return_value=[
                {"name": "analytics", "label": "Analytics Cookies"},
                {"name": "marketing", "label": "Marketing Cookies"},
            ]
        )
        issues = await check_pre_ticked_boxes(page)
        assert len(issues) == 1
        assert issues[0].pattern == "pre_ticked_checkboxes"
        assert issues[0].severity == "critical"


class TestCheckCookieWall:
    @pytest.mark.asyncio
    async def test_no_wall_returns_empty(self) -> None:
        page = AsyncMock()
        page.evaluate = AsyncMock(return_value=False)
        issues = await check_cookie_wall(page)
        assert issues == []

    @pytest.mark.asyncio
    async def test_wall_detected(self) -> None:
        page = AsyncMock()
        page.evaluate = AsyncMock(return_value=True)
        issues = await check_cookie_wall(page)
        assert len(issues) == 1
        assert issues[0].pattern == "cookie_wall"
        assert issues[0].severity == "critical"


class TestDetectDarkPatterns:
    @pytest.mark.asyncio
    async def test_no_banner_returns_empty(self) -> None:
        page = AsyncMock()
        page.url = "https://example.com/"
        page.query_selector_all = AsyncMock(return_value=[])
        result = await detect_dark_patterns(page)
        assert result.banner_found is False
        assert result.issues == []
