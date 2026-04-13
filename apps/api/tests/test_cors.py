"""Tests for the dynamic CORS origin validation service."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from src.services.cors import extract_domain_from_origin, get_allowed_domains, is_origin_allowed


class TestExtractDomainFromOrigin:
    def test_https_origin(self):
        assert extract_domain_from_origin("https://example.com") == "example.com"

    def test_http_origin(self):
        assert extract_domain_from_origin("http://example.com") == "example.com"

    def test_origin_with_port(self):
        assert extract_domain_from_origin("https://example.com:443") == "example.com"

    def test_origin_with_subdomain(self):
        assert extract_domain_from_origin("https://www.example.com") == "www.example.com"

    def test_localhost(self):
        assert extract_domain_from_origin("http://localhost:5173") == "localhost"

    def test_empty_string(self):
        assert extract_domain_from_origin("") is None

    def test_invalid_url(self):
        # urlparse is lenient, but hostname may be None for really bad input
        result = extract_domain_from_origin("not-a-url")
        # urlparse("not-a-url") sets hostname to None
        assert result is None


class TestIsOriginAllowed:
    def test_static_origin_exact_match(self):
        assert (
            is_origin_allowed(
                "http://localhost:5173",
                ["http://localhost:5173"],
                set(),
            )
            is True
        )

    def test_static_origin_no_match(self):
        assert (
            is_origin_allowed(
                "https://evil.com",
                ["http://localhost:5173"],
                set(),
            )
            is False
        )

    def test_wildcard_allows_everything(self):
        assert (
            is_origin_allowed(
                "https://anything.com",
                ["*"],
                set(),
            )
            is True
        )

    def test_registered_domain_match(self):
        assert (
            is_origin_allowed(
                "https://example.com",
                [],
                {"example.com", "other.com"},
            )
            is True
        )

    def test_registered_domain_case_insensitive(self):
        assert (
            is_origin_allowed(
                "https://Example.COM",
                [],
                {"example.com"},
            )
            is True
        )

    def test_registered_domain_no_match(self):
        assert (
            is_origin_allowed(
                "https://evil.com",
                [],
                {"example.com"},
            )
            is False
        )

    def test_static_takes_priority(self):
        assert (
            is_origin_allowed(
                "http://localhost:5173",
                ["http://localhost:5173"],
                {"example.com"},
            )
            is True
        )

    def test_origin_with_port_matches_domain(self):
        assert (
            is_origin_allowed(
                "https://example.com:8443",
                [],
                {"example.com"},
            )
            is True
        )

    def test_subdomain_matches_if_registered(self):
        # www.example.com only matches if explicitly registered
        assert (
            is_origin_allowed(
                "https://www.example.com",
                [],
                {"example.com"},
            )
            is False
        )

    def test_subdomain_matches_when_registered(self):
        assert (
            is_origin_allowed(
                "https://www.example.com",
                [],
                {"www.example.com"},
            )
            is True
        )

    def test_empty_origin(self):
        assert (
            is_origin_allowed(
                "",
                [],
                {"example.com"},
            )
            is False
        )

    def test_empty_lists(self):
        assert (
            is_origin_allowed(
                "https://example.com",
                [],
                set(),
            )
            is False
        )


class TestGetAllowedDomains:
    @pytest.mark.asyncio
    async def test_returns_primary_domains(self):
        row1 = MagicMock()
        row1.domain = "example.com"
        row1.additional_domains = None

        row2 = MagicMock()
        row2.domain = "other.com"
        row2.additional_domains = None

        mock_result = MagicMock()
        mock_result.all.return_value = [row1, row2]

        db = AsyncMock()
        db.execute = AsyncMock(return_value=mock_result)

        domains = await get_allowed_domains(db)
        assert "example.com" in domains
        assert "other.com" in domains

    @pytest.mark.asyncio
    async def test_includes_additional_domains(self):
        row = MagicMock()
        row.domain = "example.com"
        row.additional_domains = ["www.example.com", "app.example.com"]

        mock_result = MagicMock()
        mock_result.all.return_value = [row]

        db = AsyncMock()
        db.execute = AsyncMock(return_value=mock_result)

        domains = await get_allowed_domains(db)
        assert "example.com" in domains
        assert "www.example.com" in domains
        assert "app.example.com" in domains

    @pytest.mark.asyncio
    async def test_lowercases_domains(self):
        row = MagicMock()
        row.domain = "Example.COM"
        row.additional_domains = ["WWW.Example.COM"]

        mock_result = MagicMock()
        mock_result.all.return_value = [row]

        db = AsyncMock()
        db.execute = AsyncMock(return_value=mock_result)

        domains = await get_allowed_domains(db)
        assert "example.com" in domains
        assert "www.example.com" in domains

    @pytest.mark.asyncio
    async def test_empty_result(self):
        mock_result = MagicMock()
        mock_result.all.return_value = []

        db = AsyncMock()
        db.execute = AsyncMock(return_value=mock_result)

        domains = await get_allowed_domains(db)
        assert domains == set()
