"""Cookie classification based on known patterns.

Matches discovered cookies against a database of known cookie patterns
to auto-categorise them (analytics, marketing, functional, etc.).
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class KnownPattern:
    """A known cookie pattern for classification."""

    name_pattern: str
    domain_pattern: str
    category: str
    vendor: str | None = None
    is_regex: bool = False


@dataclass
class ClassificationResult:
    """Result of classifying a cookie."""

    category: str | None
    vendor: str | None = None
    match_source: str = "unmatched"  # exact | wildcard | regex | unmatched


def classify_cookie(
    name: str,
    domain: str,
    patterns: list[KnownPattern],
) -> ClassificationResult:
    """Classify a cookie by matching against known patterns.

    Matching priority:
    1. Exact name match
    2. Wildcard match (patterns containing *)
    3. Regex match (patterns flagged as regex)
    """
    for pattern in patterns:
        if pattern.is_regex:
            continue  # Skip regex in first pass

        if "*" in pattern.name_pattern:
            # Wildcard match
            regex = pattern.name_pattern.replace(".", r"\.").replace("*", ".*")
            if re.match(f"^{regex}$", name, re.IGNORECASE):
                if _domain_matches(domain, pattern.domain_pattern):
                    return ClassificationResult(
                        category=pattern.category,
                        vendor=pattern.vendor,
                        match_source="wildcard",
                    )
        elif pattern.name_pattern == name:
            # Exact match
            if _domain_matches(domain, pattern.domain_pattern):
                return ClassificationResult(
                    category=pattern.category,
                    vendor=pattern.vendor,
                    match_source="exact",
                )

    # Regex pass
    for pattern in patterns:
        if not pattern.is_regex:
            continue
        try:
            if re.match(pattern.name_pattern, name, re.IGNORECASE):
                if _domain_matches(domain, pattern.domain_pattern):
                    return ClassificationResult(
                        category=pattern.category,
                        vendor=pattern.vendor,
                        match_source="regex",
                    )
        except re.error:
            continue

    return ClassificationResult(category=None, match_source="unmatched")


def _domain_matches(actual: str, pattern: str) -> bool:
    """Check if a domain matches a pattern.

    Patterns can be:
    - "*" — matches any domain
    - ".example.com" — matches example.com and *.example.com
    - "example.com" — exact match
    """
    if pattern == "*":
        return True

    actual = actual.lower().lstrip(".")
    pattern = pattern.lower().lstrip(".")

    if actual == pattern:
        return True

    # Subdomain match: actual "sub.example.com" matches pattern "example.com"
    if actual.endswith(f".{pattern}"):
        return True

    return False
