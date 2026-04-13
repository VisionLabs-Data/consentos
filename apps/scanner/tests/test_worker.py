"""Tests for the scanner HTTP service."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from src.worker import create_app


@pytest.fixture
def client():
    """Create a test client for the scanner app."""
    app = create_app()
    return TestClient(app)


def test_health_endpoint(client):
    """Health endpoint returns ok."""
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@patch("src.sitemap.discover_urls", new_callable=AsyncMock)
@patch("src.crawler.CookieCrawler.crawl_site", new_callable=AsyncMock)
def test_scan_endpoint_with_domain(mock_crawl, mock_discover, client):
    """POST /scan with just a domain discovers URLs and crawls."""
    from src.crawler import CrawlResult, DiscoveredCookie, SiteCrawlResult

    mock_discover.return_value = ["https://example.com/"]
    mock_crawl.return_value = SiteCrawlResult(
        domain="example.com",
        pages=[
            CrawlResult(
                url="https://example.com/",
                cookies=[
                    DiscoveredCookie(
                        name="_ga",
                        domain=".example.com",
                        storage_type="cookie",
                        page_url="https://example.com/",
                        value_length=30,
                    ),
                    DiscoveredCookie(
                        name="session_id",
                        domain="example.com",
                        storage_type="cookie",
                        page_url="https://example.com/",
                        value_length=36,
                        http_only=True,
                        secure=True,
                    ),
                ],
            ),
        ],
        total_cookies_found=2,
    )

    resp = client.post("/scan", json={"domain": "example.com", "max_pages": 5})
    assert resp.status_code == 200
    data = resp.json()

    assert data["domain"] == "example.com"
    assert data["pages_crawled"] == 1
    assert data["total_cookies"] == 2
    assert len(data["cookies"]) == 2
    assert data["cookies"][0]["name"] == "_ga"
    assert data["cookies"][1]["name"] == "session_id"
    assert data["cookies"][1]["secure"] is True


@patch("src.crawler.CookieCrawler.crawl_site", new_callable=AsyncMock)
def test_scan_endpoint_with_urls(mock_crawl, client):
    """POST /scan with explicit URLs skips URL discovery."""
    from src.crawler import CrawlResult, SiteCrawlResult

    mock_crawl.return_value = SiteCrawlResult(
        domain="example.com",
        pages=[CrawlResult(url="https://example.com/about", cookies=[])],
        total_cookies_found=0,
    )

    resp = client.post(
        "/scan",
        json={
            "domain": "example.com",
            "urls": ["https://example.com/about"],
            "max_pages": 1,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["pages_crawled"] == 1
    assert data["cookies"] == []


@patch("src.sitemap.discover_urls", new_callable=AsyncMock)
@patch("src.crawler.CookieCrawler.crawl_site", new_callable=AsyncMock)
def test_scan_endpoint_with_errors(mock_crawl, mock_discover, client):
    """Scan results include page errors."""
    from src.crawler import CrawlResult, SiteCrawlResult

    mock_discover.return_value = ["https://example.com/"]
    mock_crawl.return_value = SiteCrawlResult(
        domain="example.com",
        pages=[
            CrawlResult(url="https://example.com/", cookies=[], error="Timeout"),
        ],
        total_cookies_found=0,
    )

    resp = client.post("/scan", json={"domain": "example.com"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["errors"] == ["Timeout"]


def test_scan_request_validation(client):
    """Missing domain returns 422."""
    resp = client.post("/scan", json={})
    assert resp.status_code == 422
