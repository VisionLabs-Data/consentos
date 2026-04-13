"""Tests for crawler proxy configuration.

Mocks Playwright to avoid requiring an actual browser installation.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.crawler import CookieCrawler, ProxyConfig


class TestProxyConfig:
    """Tests for ProxyConfig dataclass."""

    def test_proxy_config_creation(self) -> None:
        proxy = ProxyConfig(server="http://proxy.example.com:8080")
        assert proxy.server == "http://proxy.example.com:8080"
        assert proxy.username is None
        assert proxy.password is None

    def test_proxy_config_with_auth(self) -> None:
        proxy = ProxyConfig(
            server="http://proxy.example.com:8080",
            username="user",
            password="pass",
        )
        assert proxy.username == "user"
        assert proxy.password == "pass"


class TestCookieCrawlerProxy:
    """Tests for CookieCrawler proxy support."""

    def test_crawler_without_proxy(self) -> None:
        crawler = CookieCrawler(headless=True)
        assert crawler._proxy is None

    def test_crawler_with_proxy(self) -> None:
        proxy = ProxyConfig(server="http://proxy.example.com:8080")
        crawler = CookieCrawler(headless=True, proxy=proxy)
        assert crawler._proxy is not None
        assert crawler._proxy.server == "http://proxy.example.com:8080"

    def test_crawler_with_socks5_proxy(self) -> None:
        proxy = ProxyConfig(server="socks5://proxy.example.com:1080")
        crawler = CookieCrawler(headless=True, proxy=proxy)
        assert crawler._proxy.server == "socks5://proxy.example.com:1080"

    @pytest.mark.asyncio
    async def test_crawl_passes_proxy_to_browser(self) -> None:
        """Verify that proxy config is passed to Playwright launch."""
        proxy = ProxyConfig(
            server="http://proxy.example.com:8080",
            username="user",
            password="pass",
        )
        crawler = CookieCrawler(headless=True, proxy=proxy)

        mock_browser = AsyncMock()
        mock_browser.close = AsyncMock()

        mock_pw = MagicMock()
        mock_pw.chromium.launch = AsyncMock(return_value=mock_browser)

        mock_context_manager = AsyncMock()
        mock_context_manager.__aenter__ = AsyncMock(return_value=mock_pw)
        mock_context_manager.__aexit__ = AsyncMock(return_value=False)

        with patch("src.crawler.async_playwright", return_value=mock_context_manager):
            await crawler.crawl_site(["https://example.com/"], max_pages=1)

        # Verify proxy was passed to browser launch
        mock_pw.chromium.launch.assert_called_once()
        call_kwargs = mock_pw.chromium.launch.call_args[1]
        assert "proxy" in call_kwargs
        assert call_kwargs["proxy"]["server"] == "http://proxy.example.com:8080"
        assert call_kwargs["proxy"]["username"] == "user"
        assert call_kwargs["proxy"]["password"] == "pass"

    @pytest.mark.asyncio
    async def test_crawl_without_proxy_omits_proxy_kwarg(self) -> None:
        """Verify that no proxy is passed when none is configured."""
        crawler = CookieCrawler(headless=True)

        mock_browser = AsyncMock()
        mock_browser.close = AsyncMock()

        mock_pw = MagicMock()
        mock_pw.chromium.launch = AsyncMock(return_value=mock_browser)

        mock_context_manager = AsyncMock()
        mock_context_manager.__aenter__ = AsyncMock(return_value=mock_pw)
        mock_context_manager.__aexit__ = AsyncMock(return_value=False)

        with patch("src.crawler.async_playwright", return_value=mock_context_manager):
            await crawler.crawl_site(["https://example.com/"], max_pages=1)

        call_kwargs = mock_pw.chromium.launch.call_args[1]
        assert "proxy" not in call_kwargs
