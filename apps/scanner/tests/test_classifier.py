"""Tests for cookie classification — CMP-21."""

from src.classifier import (
    ClassificationResult,
    KnownPattern,
    _domain_matches,
    classify_cookie,
)

# ── Domain matching ──────────────────────────────────────────────────


class TestDomainMatching:
    def test_wildcard_matches_any(self):
        assert _domain_matches("example.com", "*") is True

    def test_exact_match(self):
        assert _domain_matches("example.com", "example.com") is True

    def test_exact_no_match(self):
        assert _domain_matches("other.com", "example.com") is False

    def test_subdomain_match(self):
        assert _domain_matches("sub.example.com", "example.com") is True

    def test_leading_dot_stripped(self):
        assert _domain_matches(".example.com", "example.com") is True

    def test_pattern_leading_dot(self):
        assert _domain_matches("example.com", ".example.com") is True

    def test_case_insensitive(self):
        assert _domain_matches("Example.COM", "example.com") is True

    def test_no_partial_match(self):
        # "notexample.com" should NOT match "example.com"
        assert _domain_matches("notexample.com", "example.com") is False


# ── Cookie classification ────────────────────────────────────────────


PATTERNS = [
    KnownPattern(name_pattern="_ga", domain_pattern="*", category="analytics", vendor="Google"),
    KnownPattern(name_pattern="_ga_*", domain_pattern="*", category="analytics", vendor="Google"),
    KnownPattern(name_pattern="_gid", domain_pattern="*", category="analytics", vendor="Google"),
    KnownPattern(
        name_pattern="_fbp", domain_pattern=".facebook.com", category="marketing", vendor="Meta"
    ),
    KnownPattern(
        name_pattern="__cf_bm",
        domain_pattern="*",
        category="necessary",
        vendor="Cloudflare",
    ),
    KnownPattern(
        name_pattern="_hj.*",
        domain_pattern="*",
        category="analytics",
        vendor="Hotjar",
        is_regex=True,
    ),
    KnownPattern(
        name_pattern="^_pk_id\\..*",
        domain_pattern="*",
        category="analytics",
        vendor="Matomo",
        is_regex=True,
    ),
]


class TestClassifyCookie:
    def test_exact_match(self):
        result = classify_cookie("_ga", "example.com", PATTERNS)
        assert result.category == "analytics"
        assert result.vendor == "Google"
        assert result.match_source == "exact"

    def test_wildcard_match(self):
        result = classify_cookie("_ga_ABC123", "example.com", PATTERNS)
        assert result.category == "analytics"
        assert result.match_source == "wildcard"

    def test_regex_match(self):
        result = classify_cookie("_hjSession_123", "example.com", PATTERNS)
        assert result.category == "analytics"
        assert result.vendor == "Hotjar"
        assert result.match_source == "regex"

    def test_regex_matomo(self):
        result = classify_cookie("_pk_id.1.abc1", "example.com", PATTERNS)
        assert result.category == "analytics"
        assert result.vendor == "Matomo"
        assert result.match_source == "regex"

    def test_domain_specific_match(self):
        result = classify_cookie("_fbp", "sub.facebook.com", PATTERNS)
        assert result.category == "marketing"
        assert result.vendor == "Meta"

    def test_domain_mismatch(self):
        result = classify_cookie("_fbp", "example.com", PATTERNS)
        assert result.category is None
        assert result.match_source == "unmatched"

    def test_unmatched_cookie(self):
        result = classify_cookie("unknown_cookie", "example.com", PATTERNS)
        assert result.category is None
        assert result.match_source == "unmatched"

    def test_necessary_cookie(self):
        result = classify_cookie("__cf_bm", "example.com", PATTERNS)
        assert result.category == "necessary"
        assert result.vendor == "Cloudflare"

    def test_empty_patterns(self):
        result = classify_cookie("_ga", "example.com", [])
        assert result.category is None

    def test_exact_takes_priority_over_wildcard(self):
        """Exact match should come before wildcard in pattern list."""
        patterns = [
            KnownPattern(name_pattern="_ga", domain_pattern="*", category="analytics"),
            KnownPattern(name_pattern="_ga*", domain_pattern="*", category="marketing"),
        ]
        result = classify_cookie("_ga", "example.com", patterns)
        assert result.category == "analytics"
        assert result.match_source == "exact"


# ── ClassificationResult ─────────────────────────────────────────────


class TestClassificationResult:
    def test_defaults(self):
        r = ClassificationResult(category=None)
        assert r.vendor is None
        assert r.match_source == "unmatched"

    def test_with_values(self):
        r = ClassificationResult(category="analytics", vendor="Google", match_source="exact")
        assert r.category == "analytics"
        assert r.vendor == "Google"
