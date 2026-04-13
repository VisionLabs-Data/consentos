"""Dark pattern detection — CSS and DOM analysis of consent banners.

Detects manipulative UI patterns in cookie consent banners:
- Unequal button prominence (Accept bigger/brighter than Reject)
- Pre-ticked category checkboxes
- Missing first-layer Reject button (CNIL violation)
- Cookie walls (blocking page content)
- Dismiss-on-scroll (not valid consent under GDPR)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from playwright.async_api import Page

logger = logging.getLogger(__name__)


@dataclass
class DarkPatternIssue:
    """A detected dark pattern in the consent banner."""

    pattern: str
    severity: str  # critical, warning, info
    message: str
    recommendation: str
    details: dict = field(default_factory=dict)


@dataclass
class DarkPatternResult:
    """Result of dark pattern analysis."""

    url: str
    issues: list[DarkPatternIssue] = field(default_factory=list)
    banner_found: bool = False
    error: str | None = None


# Common selectors for consent banner elements
BANNER_SELECTORS = [
    "[id*='cookie']",
    "[id*='consent']",
    "[class*='cookie']",
    "[class*='consent']",
    "[id*='cmp']",
    "[class*='cmp']",
    "[role='dialog'][aria-label*='cookie' i]",
    "[role='dialog'][aria-label*='consent' i]",
]

ACCEPT_BUTTON_SELECTORS = [
    "button:has-text('Accept')",
    "button:has-text('Accept All')",
    "button:has-text('Allow')",
    "button:has-text('Allow All')",
    "button:has-text('I Agree')",
    "button:has-text('OK')",
    "button:has-text('Got it')",
    "[data-action='accept']",
    "[id*='accept']",
]

REJECT_BUTTON_SELECTORS = [
    "button:has-text('Reject')",
    "button:has-text('Reject All')",
    "button:has-text('Decline')",
    "button:has-text('Deny')",
    "button:has-text('Refuse')",
    "button:has-text('Tout refuser')",
    "[data-action='reject']",
    "[id*='reject']",
]


async def _find_banner(page: Page) -> bool:
    """Check if a consent banner is visible on the page."""
    for selector in BANNER_SELECTORS:
        try:
            elements = await page.query_selector_all(selector)
            for el in elements:
                if await el.is_visible():
                    return True
        except Exception:
            continue
    return False


async def _find_button(page: Page, selectors: list[str]) -> dict | None:
    """Find a visible button matching one of the selectors, return its computed styles."""
    for selector in selectors:
        try:
            elements = await page.query_selector_all(selector)
            for el in elements:
                if await el.is_visible():
                    styles = await el.evaluate("""(el) => {
                        const cs = window.getComputedStyle(el);
                        const rect = el.getBoundingClientRect();
                        return {
                            width: rect.width,
                            height: rect.height,
                            area: rect.width * rect.height,
                            backgroundColor: cs.backgroundColor,
                            color: cs.color,
                            fontSize: parseFloat(cs.fontSize),
                            fontWeight: cs.fontWeight,
                            padding: cs.padding,
                            text: el.textContent.trim(),
                            visible: true,
                        };
                    }""")
                    return styles
        except Exception:
            continue
    return None


async def check_button_prominence(page: Page) -> list[DarkPatternIssue]:
    """Compare Accept and Reject button sizes and visual weight."""
    issues: list[DarkPatternIssue] = []

    accept_btn = await _find_button(page, ACCEPT_BUTTON_SELECTORS)
    reject_btn = await _find_button(page, REJECT_BUTTON_SELECTORS)

    if not accept_btn:
        return issues  # No accept button found — nothing to compare

    if not reject_btn:
        issues.append(
            DarkPatternIssue(
                pattern="missing_reject_button",
                severity="critical",
                message="No visible Reject/Decline button found on the first layer.",
                recommendation=(
                    "Add a clearly visible 'Reject All' button on the first layer "
                    "of the consent banner, as required by GDPR and CNIL."
                ),
            )
        )
        return issues

    # Compare button areas
    accept_area = accept_btn.get("area", 0)
    reject_area = reject_btn.get("area", 0)

    if reject_area > 0 and accept_area > 0:
        ratio = accept_area / reject_area
        if ratio > 1.5:
            issues.append(
                DarkPatternIssue(
                    pattern="unequal_button_size",
                    severity="warning",
                    message=(
                        f"Accept button is {ratio:.1f}x larger than Reject button. "
                        "Buttons should have equal prominence."
                    ),
                    recommendation=(
                        "Make the Accept and Reject buttons the same size and visual weight."
                    ),
                    details={
                        "accept_area": accept_area,
                        "reject_area": reject_area,
                        "ratio": round(ratio, 2),
                    },
                )
            )

    # Compare font sizes
    accept_font = accept_btn.get("fontSize", 0)
    reject_font = reject_btn.get("fontSize", 0)

    if reject_font > 0 and accept_font > reject_font * 1.3:
        issues.append(
            DarkPatternIssue(
                pattern="unequal_font_size",
                severity="warning",
                message=(
                    f"Accept button font ({accept_font}px) is larger than "
                    f"Reject button font ({reject_font}px)."
                ),
                recommendation="Use the same font size for both Accept and Reject buttons.",
                details={
                    "accept_font_size": accept_font,
                    "reject_font_size": reject_font,
                },
            )
        )

    return issues


async def check_pre_ticked_boxes(page: Page) -> list[DarkPatternIssue]:
    """Check for pre-ticked non-essential category checkboxes."""
    issues: list[DarkPatternIssue] = []

    try:
        pre_ticked = await page.evaluate("""() => {
            const checkboxes = document.querySelectorAll(
                'input[type="checkbox"][checked], input[type="checkbox"]:checked'
            );
            const results = [];
            for (const cb of checkboxes) {
                // Skip if it looks like an "essential" checkbox (often disabled)
                if (cb.disabled) continue;
                const label = cb.closest('label')?.textContent?.trim()
                    || cb.getAttribute('aria-label')
                    || cb.name
                    || 'unknown';
                // Skip checkboxes that appear to be for essential/necessary
                const labelLower = label.toLowerCase();
                if (labelLower.includes('essential') || labelLower.includes('necessary')
                    || labelLower.includes('required') || labelLower.includes('strictly')) {
                    continue;
                }
                results.push({ name: cb.name || cb.id, label: label });
            }
            return results;
        }""")

        if pre_ticked:
            labels = [pt["label"][:50] for pt in pre_ticked]
            issues.append(
                DarkPatternIssue(
                    pattern="pre_ticked_checkboxes",
                    severity="critical",
                    message=(
                        f"{len(pre_ticked)} non-essential category checkbox(es) are pre-ticked: "
                        f"{', '.join(labels[:3])}"
                    ),
                    recommendation=(
                        "Non-essential category checkboxes must default to unchecked. "
                        "Pre-ticked boxes do not constitute valid consent under GDPR."
                    ),
                    details={"checkboxes": pre_ticked},
                )
            )
    except Exception as exc:
        logger.debug("Pre-ticked checkbox check failed: %s", exc)

    return issues


async def check_cookie_wall(page: Page) -> list[DarkPatternIssue]:
    """Check if a cookie wall blocks access to page content."""
    issues: list[DarkPatternIssue] = []

    try:
        is_wall = await page.evaluate("""() => {
            // Check for full-screen overlays blocking content
            const overlays = document.querySelectorAll(
                '[class*="overlay"], [class*="modal"], [class*="wall"]'
            );
            for (const overlay of overlays) {
                const cs = window.getComputedStyle(overlay);
                const rect = overlay.getBoundingClientRect();
                // Full-viewport overlay with high z-index suggests a cookie wall
                if (rect.width >= window.innerWidth * 0.9
                    && rect.height >= window.innerHeight * 0.9
                    && parseInt(cs.zIndex) > 100) {
                    return true;
                }
            }
            // Check if body/main is hidden or has overflow hidden
            const body = document.body;
            const bodyStyle = window.getComputedStyle(body);
            if (bodyStyle.overflow === 'hidden' && bodyStyle.position === 'fixed') {
                return true;
            }
            return false;
        }""")

        if is_wall:
            issues.append(
                DarkPatternIssue(
                    pattern="cookie_wall",
                    severity="critical",
                    message="Cookie wall detected — page content appears blocked until consent.",
                    recommendation=(
                        "Remove the cookie wall. Users must be able to access the site "
                        "without being forced to consent to non-essential cookies."
                    ),
                )
            )
    except Exception as exc:
        logger.debug("Cookie wall check failed: %s", exc)

    return issues


async def check_scroll_dismissal(page: Page) -> list[DarkPatternIssue]:
    """Check if scrolling dismisses the consent banner (not valid consent)."""
    issues: list[DarkPatternIssue] = []

    try:
        # Check if banner is visible before scroll
        banner_visible_before = await _find_banner(page)
        if not banner_visible_before:
            return issues

        # Scroll down
        await page.evaluate("window.scrollBy(0, 500)")
        await page.wait_for_timeout(1000)

        # Check if banner disappeared
        banner_visible_after = await _find_banner(page)

        if banner_visible_before and not banner_visible_after:
            issues.append(
                DarkPatternIssue(
                    pattern="scroll_dismissal",
                    severity="critical",
                    message="Consent banner dismissed on scroll — this is not valid consent.",
                    recommendation=(
                        "Disable dismiss-on-scroll. Under GDPR, scrolling does not "
                        "constitute valid consent. The banner must remain until the user "
                        "makes an explicit choice."
                    ),
                )
            )
    except Exception as exc:
        logger.debug("Scroll dismissal check failed: %s", exc)

    return issues


async def detect_dark_patterns(page: Page) -> DarkPatternResult:
    """Run all dark pattern checks on the current page."""
    url = page.url
    result = DarkPatternResult(url=url)

    try:
        result.banner_found = await _find_banner(page)
        if not result.banner_found:
            return result

        # Run all checks
        result.issues.extend(await check_button_prominence(page))
        result.issues.extend(await check_pre_ticked_boxes(page))
        result.issues.extend(await check_cookie_wall(page))
        result.issues.extend(await check_scroll_dismissal(page))

    except Exception as exc:
        result.error = str(exc)
        logger.warning("Dark pattern detection failed for %s: %s", url, exc)

    return result
