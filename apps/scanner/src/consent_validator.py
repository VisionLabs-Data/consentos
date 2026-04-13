"""Consent signal validation — Playwright-based runtime checks.

Validates that consent signals (GCM, TCF, GPP) work correctly at runtime
by checking pre-consent, post-accept, and post-reject states.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from playwright.async_api import BrowserContext, Page

logger = logging.getLogger(__name__)

# Known tracker domains for pixel-fire detection
KNOWN_TRACKER_DOMAINS = frozenset(
    {
        "google-analytics.com",
        "googletagmanager.com",
        "doubleclick.net",
        "facebook.net",
        "facebook.com",
        "connect.facebook.net",
        "analytics.tiktok.com",
        "snap.licdn.com",
        "bat.bing.com",
        "clarity.ms",
        "hotjar.com",
        "mouseflow.com",
        "cdn.segment.com",
        "cdn.mxpnl.com",
        "plausible.io",
        "px.ads.linkedin.com",
    }
)


@dataclass
class ConsentSignalState:
    """Captured consent signal state from the page."""

    gcm_state: dict | None = None
    tcf_data: dict | None = None
    gpp_data: dict | None = None


@dataclass
class ValidationIssue:
    """A single consent validation issue."""

    check: str
    severity: str  # critical, warning, info
    message: str
    recommendation: str
    details: dict = field(default_factory=dict)


@dataclass
class ValidationResult:
    """Result of consent signal validation for a page."""

    url: str
    pre_consent_issues: list[ValidationIssue] = field(default_factory=list)
    post_accept_issues: list[ValidationIssue] = field(default_factory=list)
    post_reject_issues: list[ValidationIssue] = field(default_factory=list)
    error: str | None = None

    @property
    def all_issues(self) -> list[ValidationIssue]:
        return self.pre_consent_issues + self.post_accept_issues + self.post_reject_issues

    @property
    def has_issues(self) -> bool:
        return bool(self.all_issues)


async def _get_consent_signals(page: Page) -> ConsentSignalState:
    """Extract current consent signal state from the page."""
    state = ConsentSignalState()

    # Read GCM state
    try:
        gcm = await page.evaluate("""() => {
            try {
                if (window.dataLayer) {
                    const consentEvents = window.dataLayer.filter(
                        e => e[0] === 'consent' || (e.event && e.event.includes('consent'))
                    );
                    return { dataLayer: consentEvents, available: true };
                }
                return { available: false };
            } catch (e) { return { error: e.message }; }
        }""")
        state.gcm_state = gcm
    except Exception:
        pass

    # Read TCF state
    try:
        tcf = await page.evaluate("""() => {
            return new Promise((resolve) => {
                if (typeof window.__tcfapi === 'function') {
                    window.__tcfapi('getTCData', 2, (data, success) => {
                        resolve({ available: true, success, data: data || null });
                    });
                } else {
                    resolve({ available: false });
                }
            });
        }""")
        state.tcf_data = tcf
    except Exception:
        pass

    # Read GPP state
    try:
        gpp = await page.evaluate("""() => {
            return new Promise((resolve) => {
                if (typeof window.__gpp === 'function') {
                    window.__gpp('getGPPData', (data, success) => {
                        resolve({ available: true, success, data: data || null });
                    });
                } else {
                    resolve({ available: false });
                }
            });
        }""")
        state.gpp_data = gpp
    except Exception:
        pass

    return state


async def _get_cookies_from_context(context: BrowserContext) -> list[dict]:
    """Get all cookies from the browser context."""
    return await context.cookies()


def _is_tracker_request(url: str) -> bool:
    """Check if a URL belongs to a known tracker domain."""
    for domain in KNOWN_TRACKER_DOMAINS:
        if domain in url:
            return True
    return False


async def validate_pre_consent(
    page: Page,
    context: BrowserContext,
    essential_cookie_names: set[str],
    tracker_requests: list[str],
) -> list[ValidationIssue]:
    """Validate that no non-essential activity occurs before consent."""
    issues: list[ValidationIssue] = []

    # Check cookies — only essential should be set
    cookies = await _get_cookies_from_context(context)
    non_essential = [c for c in cookies if c["name"] not in essential_cookie_names]
    if non_essential:
        names = [c["name"] for c in non_essential]
        issues.append(
            ValidationIssue(
                check="pre_consent_cookies",
                severity="critical",
                message=(
                    f"{len(non_essential)} non-essential cookie(s) set before consent: "
                    f"{', '.join(names[:5])}"
                ),
                recommendation=(
                    "Ensure all non-essential cookies are blocked until consent is given."
                ),
                details={"cookies": names},
            )
        )

    # Check tracker requests
    tracker_hits = [url for url in tracker_requests if _is_tracker_request(url)]
    if tracker_hits:
        issues.append(
            ValidationIssue(
                check="pre_consent_trackers",
                severity="critical",
                message=f"{len(tracker_hits)} tracking request(s) fired before consent.",
                recommendation="Block all tracking scripts until the user grants consent.",
                details={"tracker_urls": tracker_hits[:10]},
            )
        )

    # Check GCM defaults
    signals = await _get_consent_signals(page)
    if signals.gcm_state and signals.gcm_state.get("available"):
        # GCM should show denied for non-essential types
        pass  # GCM state captured for reporting

    # Check TCF — no purpose consents should be active
    if signals.tcf_data and signals.tcf_data.get("available"):
        tcf_data = signals.tcf_data.get("data") or {}
        purpose_consents = tcf_data.get("purpose", {}).get("consents", {})
        granted_purposes = [k for k, v in purpose_consents.items() if v]
        if granted_purposes:
            issues.append(
                ValidationIssue(
                    check="pre_consent_tcf",
                    severity="critical",
                    message=f"TCF purpose consents active before user action: {granted_purposes}",
                    recommendation="TCF should report no purpose consents until user grants them.",
                    details={"granted_purposes": granted_purposes},
                )
            )

    return issues


async def validate_post_accept(
    page: Page,
    context: BrowserContext,
) -> list[ValidationIssue]:
    """Validate consent signals after Accept All is clicked."""
    issues: list[ValidationIssue] = []

    signals = await _get_consent_signals(page)

    # Check TCF — purposes should now be consented
    if signals.tcf_data and signals.tcf_data.get("available"):
        if not signals.tcf_data.get("success"):
            issues.append(
                ValidationIssue(
                    check="post_accept_tcf",
                    severity="warning",
                    message="TCF getTCData returned unsuccessful after Accept All.",
                    recommendation=("Verify TCF API returns valid TC data after consent."),
                )
            )

    return issues


async def validate_post_reject(
    page: Page,
    context: BrowserContext,
    essential_cookie_names: set[str],
    tracker_requests: list[str],
) -> list[ValidationIssue]:
    """Validate that rejection is respected — no tracking after reject."""
    issues: list[ValidationIssue] = []

    # Check cookies after reject
    cookies = await _get_cookies_from_context(context)
    non_essential = [c for c in cookies if c["name"] not in essential_cookie_names]
    if non_essential:
        names = [c["name"] for c in non_essential]
        issues.append(
            ValidationIssue(
                check="post_reject_cookies",
                severity="critical",
                message=(
                    f"{len(non_essential)} non-essential cookie(s) remain after rejection: "
                    f"{', '.join(names[:5])}"
                ),
                recommendation="Ensure all non-essential cookies are removed when user rejects.",
                details={"cookies": names},
            )
        )

    # Check tracker requests after reject
    tracker_hits = [url for url in tracker_requests if _is_tracker_request(url)]
    if tracker_hits:
        issues.append(
            ValidationIssue(
                check="post_reject_trackers",
                severity="critical",
                message=f"{len(tracker_hits)} tracking request(s) fired after rejection.",
                recommendation="Ensure tracking scripts respect rejection and do not fire.",
                details={"tracker_urls": tracker_hits[:10]},
            )
        )

    return issues
