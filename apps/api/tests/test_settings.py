"""Tests for application settings parsing."""

from src.config.settings import Settings


class TestAllowedOrigins:
    """Tests for the allowed_origins_list property."""

    def test_comma_separated_string(self) -> None:
        """Comma-separated string is parsed into a list."""
        settings = Settings(allowed_origins="https://a.com,https://b.com")
        assert settings.allowed_origins_list == ["https://a.com", "https://b.com"]

    def test_comma_separated_with_spaces(self) -> None:
        """Whitespace around commas is stripped."""
        settings = Settings(allowed_origins="https://a.com , https://b.com")
        assert settings.allowed_origins_list == ["https://a.com", "https://b.com"]

    def test_single_origin_string(self) -> None:
        """A single origin string (no comma) is a single-element list."""
        settings = Settings(allowed_origins="https://a.com")
        assert settings.allowed_origins_list == ["https://a.com"]

    def test_empty_string(self) -> None:
        """An empty string results in an empty list."""
        settings = Settings(allowed_origins="")
        assert settings.allowed_origins_list == []

    def test_trailing_comma_ignored(self) -> None:
        """Trailing commas don't produce empty entries."""
        settings = Settings(allowed_origins="https://a.com,")
        assert settings.allowed_origins_list == ["https://a.com"]

    def test_default_value(self) -> None:
        """Default value is localhost:5173."""
        settings = Settings()
        assert settings.allowed_origins_list == ["http://localhost:5173"]
