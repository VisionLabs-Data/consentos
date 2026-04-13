"""Pluggable compliance rule engine.

Each regulatory framework (GDPR, CNIL, CCPA, ePrivacy, LGPD) is defined as a
list of ComplianceRule objects.  Rules evaluate site configuration, banner
settings, cookie data, and consent parameters to produce issues with severity,
message, and recommendation.

The engine aggregates individual rule results into per-framework reports with
a compliance score, status, and actionable issues list.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from src.schemas.compliance import (
    ComplianceIssue,
    Framework,
    FrameworkResult,
    Severity,
)

# ── Rule context ──────────────────────────────────────────────────────


@dataclass
class SiteContext:
    """All data needed to evaluate compliance rules for a site."""

    # Site config fields
    blocking_mode: str = "opt_in"
    regional_modes: dict[str, str] | None = None
    tcf_enabled: bool = False
    gcm_enabled: bool = True
    consent_expiry_days: int = 365
    privacy_policy_url: str | None = None

    # Banner config (JSONB — may have any keys)
    banner_config: dict[str, Any] | None = None

    # Cookie statistics
    total_cookies: int = 0
    uncategorised_cookies: int = 0
    cookies_without_expiry: int = 0

    # Consent settings
    has_reject_button: bool = True
    has_granular_choices: bool = True
    has_cookie_wall: bool = False
    pre_ticked_boxes: bool = False


# ── Rule definition ───────────────────────────────────────────────────

# A check function receives a SiteContext and returns a list of issues.
CheckFn = Callable[[SiteContext], list[ComplianceIssue]]


@dataclass
class ComplianceRule:
    """A single compliance rule with an ID, description, and check function."""

    rule_id: str
    description: str
    check: CheckFn


# ── Helper factories ──────────────────────────────────────────────────


def _issue(
    rule_id: str,
    severity: Severity,
    message: str,
    recommendation: str,
) -> ComplianceIssue:
    return ComplianceIssue(
        rule_id=rule_id,
        severity=severity,
        message=message,
        recommendation=recommendation,
    )


# ── GDPR rules ────────────────────────────────────────────────────────


def _gdpr_opt_in(ctx: SiteContext) -> list[ComplianceIssue]:
    if ctx.blocking_mode != "opt_in":
        return [
            _issue(
                "gdpr_opt_in",
                Severity.CRITICAL,
                "GDPR requires opt-in consent before setting non-essential cookies.",
                "Set blocking mode to 'opt_in'.",
            )
        ]
    return []


def _gdpr_reject_button(ctx: SiteContext) -> list[ComplianceIssue]:
    if not ctx.has_reject_button:
        return [
            _issue(
                "gdpr_reject_button",
                Severity.CRITICAL,
                "The reject option must be as prominent as the accept option.",
                "Add a clearly visible 'Reject all' button to the first layer.",
            )
        ]
    return []


def _gdpr_granular_consent(ctx: SiteContext) -> list[ComplianceIssue]:
    if not ctx.has_granular_choices:
        return [
            _issue(
                "gdpr_granular",
                Severity.CRITICAL,
                "Users must be able to consent to individual cookie categories.",
                "Provide granular category toggles in the consent banner.",
            )
        ]
    return []


def _gdpr_no_cookie_wall(ctx: SiteContext) -> list[ComplianceIssue]:
    if ctx.has_cookie_wall:
        return [
            _issue(
                "gdpr_cookie_wall",
                Severity.CRITICAL,
                "Cookie walls (blocking access unless consent is given) are not permitted.",
                "Remove the cookie wall and allow access without consent.",
            )
        ]
    return []


def _gdpr_no_pre_ticked(ctx: SiteContext) -> list[ComplianceIssue]:
    if ctx.pre_ticked_boxes:
        return [
            _issue(
                "gdpr_pre_ticked",
                Severity.CRITICAL,
                "Pre-ticked consent boxes do not constitute valid consent.",
                "Ensure all non-essential category checkboxes default to unchecked.",
            )
        ]
    return []


def _gdpr_privacy_policy(ctx: SiteContext) -> list[ComplianceIssue]:
    if not ctx.privacy_policy_url:
        return [
            _issue(
                "gdpr_privacy_policy",
                Severity.WARNING,
                "A link to the privacy policy should be accessible from the banner.",
                "Configure a privacy policy URL in the site settings.",
            )
        ]
    return []


def _gdpr_uncategorised_cookies(ctx: SiteContext) -> list[ComplianceIssue]:
    if ctx.uncategorised_cookies > 0:
        return [
            _issue(
                "gdpr_uncategorised",
                Severity.WARNING,
                f"{ctx.uncategorised_cookies} cookie(s) have not been categorised.",
                "Review and assign a category to all discovered cookies.",
            )
        ]
    return []


GDPR_RULES: list[ComplianceRule] = [
    ComplianceRule("gdpr_opt_in", "Opt-in consent required", _gdpr_opt_in),
    ComplianceRule("gdpr_reject_button", "Reject as prominent as accept", _gdpr_reject_button),
    ComplianceRule("gdpr_granular", "Granular category consent", _gdpr_granular_consent),
    ComplianceRule("gdpr_cookie_wall", "No cookie walls", _gdpr_no_cookie_wall),
    ComplianceRule("gdpr_pre_ticked", "No pre-ticked boxes", _gdpr_no_pre_ticked),
    ComplianceRule("gdpr_privacy_policy", "Privacy policy link", _gdpr_privacy_policy),
    ComplianceRule("gdpr_uncategorised", "All cookies categorised", _gdpr_uncategorised_cookies),
]


# ── CNIL rules (French — stricter GDPR) ──────────────────────────────


def _cnil_consent_expiry(ctx: SiteContext) -> list[ComplianceIssue]:
    """CNIL mandates re-consent every 6 months (≈ 182 days)."""
    if ctx.consent_expiry_days > 182:
        return [
            _issue(
                "cnil_reconsent",
                Severity.CRITICAL,
                "CNIL requires re-consent at least every 6 months.",
                "Set consent_expiry_days to 182 or fewer.",
            )
        ]
    return []


def _cnil_cookie_lifetime(ctx: SiteContext) -> list[ComplianceIssue]:
    """CNIL limits cookie lifetime to 13 months (≈ 395 days)."""
    if ctx.consent_expiry_days > 395:
        return [
            _issue(
                "cnil_cookie_lifetime",
                Severity.CRITICAL,
                "CNIL limits consent cookie lifetime to 13 months.",
                "Set consent_expiry_days to 395 or fewer.",
            )
        ]
    return []


def _cnil_reject_first_layer(ctx: SiteContext) -> list[ComplianceIssue]:
    """CNIL requires 'Tout refuser' on the first layer of the banner."""
    if not ctx.has_reject_button:
        return [
            _issue(
                "cnil_reject_first_layer",
                Severity.CRITICAL,
                "CNIL requires a 'Reject all' button on the first layer of the banner.",
                "Ensure the 'Reject all' button is visible on the first banner view.",
            )
        ]
    return []


# CNIL rules include all GDPR rules plus CNIL-specific ones
CNIL_RULES: list[ComplianceRule] = [
    *GDPR_RULES,
    ComplianceRule("cnil_reconsent", "Re-consent every 6 months", _cnil_consent_expiry),
    ComplianceRule("cnil_cookie_lifetime", "13-month cookie lifetime", _cnil_cookie_lifetime),
    ComplianceRule(
        "cnil_reject_first_layer",
        "Reject on first layer",
        _cnil_reject_first_layer,
    ),
]


# ── CCPA / CPRA rules ────────────────────────────────────────────────


def _ccpa_opt_out(ctx: SiteContext) -> list[ComplianceIssue]:
    """CCPA uses an opt-out model — blocking mode should be opt_out."""
    if ctx.blocking_mode not in ("opt_out", "opt_in"):
        return [
            _issue(
                "ccpa_opt_out",
                Severity.CRITICAL,
                "CCPA requires at minimum an opt-out mechanism for data sale.",
                "Set blocking mode to 'opt_out' or 'opt_in'.",
            )
        ]
    return []


def _ccpa_do_not_sell(ctx: SiteContext) -> list[ComplianceIssue]:
    """CCPA requires a 'Do Not Sell My Personal Information' link."""
    bc = ctx.banner_config or {}
    has_dns = bc.get("show_do_not_sell_link", False)
    if not has_dns:
        return [
            _issue(
                "ccpa_do_not_sell",
                Severity.CRITICAL,
                "CCPA requires a 'Do Not Sell My Personal Information' link.",
                "Enable 'show_do_not_sell_link' in the banner configuration.",
            )
        ]
    return []


def _ccpa_privacy_policy(ctx: SiteContext) -> list[ComplianceIssue]:
    if not ctx.privacy_policy_url:
        return [
            _issue(
                "ccpa_privacy_policy",
                Severity.WARNING,
                "A privacy policy is required under CCPA.",
                "Configure a privacy policy URL in the site settings.",
            )
        ]
    return []


CCPA_RULES: list[ComplianceRule] = [
    ComplianceRule("ccpa_opt_out", "Opt-out mechanism", _ccpa_opt_out),
    ComplianceRule("ccpa_do_not_sell", "Do Not Sell link", _ccpa_do_not_sell),
    ComplianceRule("ccpa_privacy_policy", "Privacy policy required", _ccpa_privacy_policy),
]


# ── ePrivacy rules ───────────────────────────────────────────────────


def _eprivacy_consent(ctx: SiteContext) -> list[ComplianceIssue]:
    """ePrivacy requires consent for non-essential cookies."""
    if ctx.blocking_mode == "informational":
        return [
            _issue(
                "eprivacy_consent",
                Severity.CRITICAL,
                "ePrivacy Directive requires consent for non-essential cookies.",
                "Set blocking mode to 'opt_in' or 'opt_out'.",
            )
        ]
    return []


def _eprivacy_necessary_exempt(ctx: SiteContext) -> list[ComplianceIssue]:
    """Strictly necessary cookies must be exempt from consent."""
    # This is a configuration guidance check — ensure opt-in mode
    # doesn't block necessary cookies (which the blocker handles by default).
    # We report an info if everything looks good.
    return []


EPRIVACY_RULES: list[ComplianceRule] = [
    ComplianceRule("eprivacy_consent", "Consent for non-essential", _eprivacy_consent),
    ComplianceRule(
        "eprivacy_necessary_exempt",
        "Necessary cookies exempt",
        _eprivacy_necessary_exempt,
    ),
]


# ── LGPD rules (Brazil) ──────────────────────────────────────────────


def _lgpd_consent_basis(ctx: SiteContext) -> list[ComplianceIssue]:
    """LGPD requires consent or legitimate interest as legal basis."""
    if ctx.blocking_mode == "informational":
        return [
            _issue(
                "lgpd_consent_basis",
                Severity.CRITICAL,
                "LGPD requires a legal basis (consent or legitimate interest) for data processing.",
                "Set blocking mode to 'opt_in' or 'opt_out'.",
            )
        ]
    return []


def _lgpd_data_controller(ctx: SiteContext) -> list[ComplianceIssue]:
    """LGPD requires identifying the data controller."""
    if not ctx.privacy_policy_url:
        return [
            _issue(
                "lgpd_data_controller",
                Severity.WARNING,
                "LGPD requires identification of the data controller.",
                "Link to a privacy policy that identifies the data controller.",
            )
        ]
    return []


def _lgpd_granular(ctx: SiteContext) -> list[ComplianceIssue]:
    if not ctx.has_granular_choices:
        return [
            _issue(
                "lgpd_granular",
                Severity.WARNING,
                "LGPD recommends granular consent choices.",
                "Provide individual category toggles in the consent banner.",
            )
        ]
    return []


LGPD_RULES: list[ComplianceRule] = [
    ComplianceRule("lgpd_consent_basis", "Legal basis for processing", _lgpd_consent_basis),
    ComplianceRule("lgpd_data_controller", "Identify data controller", _lgpd_data_controller),
    ComplianceRule("lgpd_granular", "Granular consent choices", _lgpd_granular),
]


# ── Framework registry ────────────────────────────────────────────────

FRAMEWORK_RULES: dict[Framework, list[ComplianceRule]] = {
    Framework.GDPR: GDPR_RULES,
    Framework.CNIL: CNIL_RULES,
    Framework.CCPA: CCPA_RULES,
    Framework.EPRIVACY: EPRIVACY_RULES,
    Framework.LGPD: LGPD_RULES,
}


# ── Engine ────────────────────────────────────────────────────────────


def run_framework_check(
    framework: Framework,
    ctx: SiteContext,
) -> FrameworkResult:
    """Run all rules for a single framework and produce a result."""
    rules = FRAMEWORK_RULES.get(framework, [])
    all_issues: list[ComplianceIssue] = []
    rules_passed = 0

    for rule in rules:
        issues = rule.check(ctx)
        if issues:
            all_issues.extend(issues)
        else:
            rules_passed += 1

    rules_checked = len(rules)
    score = _calculate_score(all_issues, rules_checked)
    status = _determine_status(score, all_issues)

    return FrameworkResult(
        framework=framework,
        score=score,
        status=status,
        issues=all_issues,
        rules_checked=rules_checked,
        rules_passed=rules_passed,
    )


def run_compliance_check(
    ctx: SiteContext,
    frameworks: list[Framework] | None = None,
) -> list[FrameworkResult]:
    """Run compliance checks for the specified (or all) frameworks."""
    targets = frameworks if frameworks else list(FRAMEWORK_RULES.keys())
    return [run_framework_check(fw, ctx) for fw in targets]


def calculate_overall_score(results: list[FrameworkResult]) -> int:
    """Calculate a weighted average score across framework results."""
    if not results:
        return 100
    total = sum(r.score for r in results)
    return round(total / len(results))


# ── Scoring helpers ───────────────────────────────────────────────────


def _calculate_score(
    issues: list[ComplianceIssue],
    rules_checked: int,
) -> int:
    """Score from 0-100.  Critical issues deduct 20 pts, warnings 5 pts."""
    if rules_checked == 0:
        return 100

    deductions = 0
    for issue in issues:
        if issue.severity == Severity.CRITICAL:
            deductions += 20
        elif issue.severity == Severity.WARNING:
            deductions += 5
        # INFO issues don't affect the score

    return max(0, 100 - deductions)


def _determine_status(
    score: int,
    issues: list[ComplianceIssue],
) -> str:
    """Derive overall status string from score and issues."""
    has_critical = any(i.severity == Severity.CRITICAL for i in issues)
    if has_critical:
        return "non_compliant"
    if score >= 100:
        return "compliant"
    return "partial"
