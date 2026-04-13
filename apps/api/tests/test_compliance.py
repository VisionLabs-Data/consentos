"""Tests for the compliance rule engine and router."""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from src.schemas.compliance import (
    ComplianceCheckResponse,
    ComplianceIssue,
    Framework,
    FrameworkResult,
    Severity,
)
from src.services.compliance import (
    CCPA_RULES,
    CNIL_RULES,
    EPRIVACY_RULES,
    FRAMEWORK_RULES,
    GDPR_RULES,
    LGPD_RULES,
    SiteContext,
    calculate_overall_score,
    run_compliance_check,
    run_framework_check,
)

# ── SiteContext defaults ──────────────────────────────────────────────


class TestSiteContext:
    def test_default_values(self):
        ctx = SiteContext()
        assert ctx.blocking_mode == "opt_in"
        assert ctx.tcf_enabled is False
        assert ctx.gcm_enabled is True
        assert ctx.consent_expiry_days == 365
        assert ctx.has_reject_button is True
        assert ctx.has_granular_choices is True
        assert ctx.has_cookie_wall is False
        assert ctx.pre_ticked_boxes is False

    def test_custom_values(self):
        ctx = SiteContext(
            blocking_mode="opt_out",
            consent_expiry_days=180,
            privacy_policy_url="https://example.com/privacy",
        )
        assert ctx.blocking_mode == "opt_out"
        assert ctx.consent_expiry_days == 180
        assert ctx.privacy_policy_url == "https://example.com/privacy"


# ── GDPR rules ────────────────────────────────────────────────────────


class TestGDPRRules:
    def test_compliant_site(self):
        ctx = SiteContext(
            blocking_mode="opt_in",
            has_reject_button=True,
            has_granular_choices=True,
            has_cookie_wall=False,
            pre_ticked_boxes=False,
            privacy_policy_url="https://example.com/privacy",
            uncategorised_cookies=0,
        )
        result = run_framework_check(Framework.GDPR, ctx)
        assert result.score == 100
        assert result.status == "compliant"
        assert len(result.issues) == 0
        assert result.rules_passed == result.rules_checked

    def test_opt_out_mode_fails(self):
        ctx = SiteContext(
            blocking_mode="opt_out",
            privacy_policy_url="https://example.com/privacy",
        )
        result = run_framework_check(Framework.GDPR, ctx)
        assert any(i.rule_id == "gdpr_opt_in" for i in result.issues)
        assert result.status == "non_compliant"

    def test_informational_mode_fails(self):
        ctx = SiteContext(
            blocking_mode="informational",
            privacy_policy_url="https://example.com/privacy",
        )
        result = run_framework_check(Framework.GDPR, ctx)
        assert any(i.rule_id == "gdpr_opt_in" for i in result.issues)

    def test_no_reject_button_fails(self):
        ctx = SiteContext(
            has_reject_button=False,
            privacy_policy_url="https://example.com/privacy",
        )
        result = run_framework_check(Framework.GDPR, ctx)
        assert any(i.rule_id == "gdpr_reject_button" for i in result.issues)

    def test_no_granular_consent_fails(self):
        ctx = SiteContext(
            has_granular_choices=False,
            privacy_policy_url="https://example.com/privacy",
        )
        result = run_framework_check(Framework.GDPR, ctx)
        assert any(i.rule_id == "gdpr_granular" for i in result.issues)

    def test_cookie_wall_fails(self):
        ctx = SiteContext(
            has_cookie_wall=True,
            privacy_policy_url="https://example.com/privacy",
        )
        result = run_framework_check(Framework.GDPR, ctx)
        assert any(i.rule_id == "gdpr_cookie_wall" for i in result.issues)

    def test_pre_ticked_fails(self):
        ctx = SiteContext(
            pre_ticked_boxes=True,
            privacy_policy_url="https://example.com/privacy",
        )
        result = run_framework_check(Framework.GDPR, ctx)
        assert any(i.rule_id == "gdpr_pre_ticked" for i in result.issues)

    def test_no_privacy_policy_warns(self):
        ctx = SiteContext(privacy_policy_url=None)
        result = run_framework_check(Framework.GDPR, ctx)
        policy_issues = [i for i in result.issues if i.rule_id == "gdpr_privacy_policy"]
        assert len(policy_issues) == 1
        assert policy_issues[0].severity == Severity.WARNING

    def test_uncategorised_cookies_warns(self):
        ctx = SiteContext(
            uncategorised_cookies=5,
            privacy_policy_url="https://example.com/privacy",
        )
        result = run_framework_check(Framework.GDPR, ctx)
        uncat_issues = [i for i in result.issues if i.rule_id == "gdpr_uncategorised"]
        assert len(uncat_issues) == 1
        assert "5" in uncat_issues[0].message

    def test_multiple_failures_accumulate(self):
        ctx = SiteContext(
            blocking_mode="opt_out",
            has_reject_button=False,
            has_granular_choices=False,
            has_cookie_wall=True,
            pre_ticked_boxes=True,
            privacy_policy_url=None,
            uncategorised_cookies=3,
        )
        result = run_framework_check(Framework.GDPR, ctx)
        assert result.score == 0  # Capped at 0
        assert result.status == "non_compliant"
        assert len(result.issues) >= 5


# ── CNIL rules ────────────────────────────────────────────────────────


class TestCNILRules:
    def test_compliant_site(self):
        ctx = SiteContext(
            blocking_mode="opt_in",
            has_reject_button=True,
            has_granular_choices=True,
            privacy_policy_url="https://example.com/privacy",
            consent_expiry_days=180,
        )
        result = run_framework_check(Framework.CNIL, ctx)
        assert result.score == 100
        assert result.status == "compliant"

    def test_consent_expiry_too_long(self):
        ctx = SiteContext(
            consent_expiry_days=365,
            privacy_policy_url="https://example.com/privacy",
        )
        result = run_framework_check(Framework.CNIL, ctx)
        assert any(i.rule_id == "cnil_reconsent" for i in result.issues)

    def test_consent_expiry_at_limit(self):
        ctx = SiteContext(
            consent_expiry_days=182,
            privacy_policy_url="https://example.com/privacy",
        )
        result = run_framework_check(Framework.CNIL, ctx)
        assert not any(i.rule_id == "cnil_reconsent" for i in result.issues)

    def test_cookie_lifetime_too_long(self):
        ctx = SiteContext(
            consent_expiry_days=400,
            privacy_policy_url="https://example.com/privacy",
        )
        result = run_framework_check(Framework.CNIL, ctx)
        assert any(i.rule_id == "cnil_cookie_lifetime" for i in result.issues)

    def test_cookie_lifetime_at_limit(self):
        ctx = SiteContext(
            consent_expiry_days=395,
            privacy_policy_url="https://example.com/privacy",
        )
        result = run_framework_check(Framework.CNIL, ctx)
        assert not any(i.rule_id == "cnil_cookie_lifetime" for i in result.issues)

    def test_inherits_gdpr_rules(self):
        """CNIL should check all GDPR rules plus CNIL-specific ones."""
        assert len(CNIL_RULES) > len(GDPR_RULES)

    def test_reject_first_layer(self):
        ctx = SiteContext(
            has_reject_button=False,
            consent_expiry_days=180,
            privacy_policy_url="https://example.com/privacy",
        )
        result = run_framework_check(Framework.CNIL, ctx)
        assert any(i.rule_id == "cnil_reject_first_layer" for i in result.issues)


# ── CCPA rules ────────────────────────────────────────────────────────


class TestCCPARules:
    def test_compliant_site(self):
        ctx = SiteContext(
            blocking_mode="opt_out",
            privacy_policy_url="https://example.com/privacy",
            banner_config={"show_do_not_sell_link": True},
        )
        result = run_framework_check(Framework.CCPA, ctx)
        assert result.score == 100
        assert result.status == "compliant"

    def test_opt_in_also_acceptable(self):
        ctx = SiteContext(
            blocking_mode="opt_in",
            privacy_policy_url="https://example.com/privacy",
            banner_config={"show_do_not_sell_link": True},
        )
        result = run_framework_check(Framework.CCPA, ctx)
        assert not any(i.rule_id == "ccpa_opt_out" for i in result.issues)

    def test_informational_mode_passes_ccpa(self):
        """CCPA opt-out check passes for informational (it's not 'informational')."""
        ctx = SiteContext(
            blocking_mode="informational",
            privacy_policy_url="https://example.com/privacy",
            banner_config={"show_do_not_sell_link": True},
        )
        result = run_framework_check(Framework.CCPA, ctx)
        # informational is not in ("opt_out", "opt_in"), so it fails
        assert any(i.rule_id == "ccpa_opt_out" for i in result.issues)

    def test_no_do_not_sell_link(self):
        ctx = SiteContext(
            blocking_mode="opt_out",
            privacy_policy_url="https://example.com/privacy",
            banner_config={},
        )
        result = run_framework_check(Framework.CCPA, ctx)
        assert any(i.rule_id == "ccpa_do_not_sell" for i in result.issues)

    def test_no_banner_config_fails_dns(self):
        ctx = SiteContext(
            blocking_mode="opt_out",
            privacy_policy_url="https://example.com/privacy",
            banner_config=None,
        )
        result = run_framework_check(Framework.CCPA, ctx)
        assert any(i.rule_id == "ccpa_do_not_sell" for i in result.issues)

    def test_no_privacy_policy_warns(self):
        ctx = SiteContext(
            blocking_mode="opt_out",
            privacy_policy_url=None,
            banner_config={"show_do_not_sell_link": True},
        )
        result = run_framework_check(Framework.CCPA, ctx)
        assert any(i.rule_id == "ccpa_privacy_policy" for i in result.issues)


# ── ePrivacy rules ────────────────────────────────────────────────────


class TestEPrivacyRules:
    def test_compliant_site(self):
        ctx = SiteContext(blocking_mode="opt_in")
        result = run_framework_check(Framework.EPRIVACY, ctx)
        assert result.score == 100
        assert result.status == "compliant"

    def test_opt_out_passes(self):
        ctx = SiteContext(blocking_mode="opt_out")
        result = run_framework_check(Framework.EPRIVACY, ctx)
        assert not any(i.rule_id == "eprivacy_consent" for i in result.issues)

    def test_informational_fails(self):
        ctx = SiteContext(blocking_mode="informational")
        result = run_framework_check(Framework.EPRIVACY, ctx)
        assert any(i.rule_id == "eprivacy_consent" for i in result.issues)


# ── LGPD rules ────────────────────────────────────────────────────────


class TestLGPDRules:
    def test_compliant_site(self):
        ctx = SiteContext(
            blocking_mode="opt_in",
            privacy_policy_url="https://example.com/privacy",
            has_granular_choices=True,
        )
        result = run_framework_check(Framework.LGPD, ctx)
        assert result.score == 100
        assert result.status == "compliant"

    def test_informational_fails(self):
        ctx = SiteContext(
            blocking_mode="informational",
            privacy_policy_url="https://example.com/privacy",
        )
        result = run_framework_check(Framework.LGPD, ctx)
        assert any(i.rule_id == "lgpd_consent_basis" for i in result.issues)

    def test_no_privacy_policy_warns(self):
        ctx = SiteContext(privacy_policy_url=None)
        result = run_framework_check(Framework.LGPD, ctx)
        assert any(i.rule_id == "lgpd_data_controller" for i in result.issues)

    def test_no_granular_warns(self):
        ctx = SiteContext(
            has_granular_choices=False,
            privacy_policy_url="https://example.com/privacy",
        )
        result = run_framework_check(Framework.LGPD, ctx)
        assert any(i.rule_id == "lgpd_granular" for i in result.issues)

    def test_opt_out_passes(self):
        ctx = SiteContext(
            blocking_mode="opt_out",
            privacy_policy_url="https://example.com/privacy",
        )
        result = run_framework_check(Framework.LGPD, ctx)
        assert not any(i.rule_id == "lgpd_consent_basis" for i in result.issues)


# ── Engine orchestration ──────────────────────────────────────────────


class TestComplianceEngine:
    def test_run_all_frameworks(self):
        ctx = SiteContext(
            blocking_mode="opt_in",
            privacy_policy_url="https://example.com/privacy",
            has_reject_button=True,
            has_granular_choices=True,
            consent_expiry_days=180,
        )
        results = run_compliance_check(ctx)
        assert len(results) == 5
        frameworks = {r.framework for r in results}
        assert frameworks == {
            Framework.GDPR,
            Framework.CNIL,
            Framework.CCPA,
            Framework.EPRIVACY,
            Framework.LGPD,
        }

    def test_run_specific_frameworks(self):
        ctx = SiteContext()
        results = run_compliance_check(ctx, [Framework.GDPR, Framework.CCPA])
        assert len(results) == 2
        assert results[0].framework == Framework.GDPR
        assert results[1].framework == Framework.CCPA

    def test_run_single_framework(self):
        ctx = SiteContext()
        results = run_compliance_check(ctx, [Framework.EPRIVACY])
        assert len(results) == 1
        assert results[0].framework == Framework.EPRIVACY

    def test_empty_frameworks_list_runs_all(self):
        ctx = SiteContext(
            privacy_policy_url="https://example.com/privacy",
            consent_expiry_days=180,
        )
        results = run_compliance_check(ctx, None)
        assert len(results) == 5


class TestScoring:
    def test_perfect_score(self):
        result = FrameworkResult(
            framework=Framework.GDPR,
            score=100,
            status="compliant",
            rules_checked=7,
            rules_passed=7,
        )
        assert calculate_overall_score([result]) == 100

    def test_zero_score(self):
        result = FrameworkResult(
            framework=Framework.GDPR,
            score=0,
            status="non_compliant",
            rules_checked=7,
            rules_passed=0,
        )
        assert calculate_overall_score([result]) == 0

    def test_average_across_frameworks(self):
        results = [
            FrameworkResult(
                framework=Framework.GDPR,
                score=100,
                status="compliant",
                rules_checked=7,
                rules_passed=7,
            ),
            FrameworkResult(
                framework=Framework.CCPA,
                score=50,
                status="partial",
                rules_checked=3,
                rules_passed=1,
            ),
        ]
        assert calculate_overall_score(results) == 75

    def test_empty_results(self):
        assert calculate_overall_score([]) == 100

    def test_critical_issues_deduct_20(self):
        ctx = SiteContext(
            blocking_mode="opt_out",
            privacy_policy_url="https://example.com/privacy",
        )
        result = run_framework_check(Framework.GDPR, ctx)
        # opt_out causes one critical issue (gdpr_opt_in) → -20 points
        assert result.score == 80

    def test_warning_issues_deduct_5(self):
        ctx = SiteContext(
            blocking_mode="opt_in",
            privacy_policy_url=None,
            uncategorised_cookies=0,
        )
        result = run_framework_check(Framework.GDPR, ctx)
        # Missing privacy policy is a warning → -5 points
        assert result.score == 95

    def test_score_floors_at_zero(self):
        ctx = SiteContext(
            blocking_mode="opt_out",
            has_reject_button=False,
            has_granular_choices=False,
            has_cookie_wall=True,
            pre_ticked_boxes=True,
            privacy_policy_url=None,
            uncategorised_cookies=10,
        )
        result = run_framework_check(Framework.GDPR, ctx)
        assert result.score == 0

    def test_status_non_compliant_with_critical(self):
        ctx = SiteContext(blocking_mode="opt_out")
        result = run_framework_check(Framework.GDPR, ctx)
        assert result.status == "non_compliant"

    def test_status_partial_with_warnings_only(self):
        ctx = SiteContext(
            blocking_mode="opt_in",
            privacy_policy_url=None,
        )
        result = run_framework_check(Framework.GDPR, ctx)
        assert result.status == "partial"

    def test_status_compliant_with_no_issues(self):
        ctx = SiteContext(
            blocking_mode="opt_in",
            privacy_policy_url="https://example.com/privacy",
        )
        result = run_framework_check(Framework.GDPR, ctx)
        assert result.status == "compliant"


# ── Framework registry ────────────────────────────────────────────────


class TestFrameworkRegistry:
    def test_all_frameworks_registered(self):
        assert Framework.GDPR in FRAMEWORK_RULES
        assert Framework.CNIL in FRAMEWORK_RULES
        assert Framework.CCPA in FRAMEWORK_RULES
        assert Framework.EPRIVACY in FRAMEWORK_RULES
        assert Framework.LGPD in FRAMEWORK_RULES

    def test_each_framework_has_rules(self):
        for fw, rules in FRAMEWORK_RULES.items():
            assert len(rules) > 0, f"{fw} has no rules"

    def test_rule_ids_are_unique_per_framework(self):
        for fw, rules in FRAMEWORK_RULES.items():
            ids = [r.rule_id for r in rules]
            assert len(ids) == len(set(ids)), f"Duplicate rule IDs in {fw}"

    def test_gdpr_rule_count(self):
        assert len(GDPR_RULES) == 7

    def test_cnil_includes_gdpr_rules(self):
        gdpr_ids = {r.rule_id for r in GDPR_RULES}
        cnil_ids = {r.rule_id for r in CNIL_RULES}
        assert gdpr_ids.issubset(cnil_ids)

    def test_ccpa_rule_count(self):
        assert len(CCPA_RULES) == 3

    def test_eprivacy_rule_count(self):
        assert len(EPRIVACY_RULES) == 2

    def test_lgpd_rule_count(self):
        assert len(LGPD_RULES) == 3


# ── Router tests ──────────────────────────────────────────────────────


class TestComplianceRouter:
    @pytest.fixture
    def app(self):
        from src.main import create_app

        return create_app()

    @pytest.fixture
    async def client(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac

    async def test_list_frameworks(self, client):
        resp = await client.get("/api/v1/compliance/frameworks")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 5
        ids = {fw["id"] for fw in data}
        assert ids == {"gdpr", "cnil", "ccpa", "eprivacy", "lgpd"}

    async def test_check_requires_auth(self, client):
        resp = await client.post(f"/api/v1/compliance/check/{uuid.uuid4()}")
        assert resp.status_code == 401


# ── Schema tests ──────────────────────────────────────────────────────


class TestSchemas:
    def test_compliance_issue_schema(self):
        issue = ComplianceIssue(
            rule_id="test_rule",
            severity=Severity.CRITICAL,
            message="Test message",
            recommendation="Test recommendation",
        )
        assert issue.rule_id == "test_rule"
        assert issue.severity == Severity.CRITICAL

    def test_framework_result_schema(self):
        result = FrameworkResult(
            framework=Framework.GDPR,
            score=85,
            status="partial",
            rules_checked=7,
            rules_passed=5,
        )
        assert result.framework == Framework.GDPR
        assert result.score == 85

    def test_compliance_check_response_schema(self):
        response = ComplianceCheckResponse(
            site_id="test-id",
            results=[],
            overall_score=100,
        )
        assert response.overall_score == 100

    def test_severity_values(self):
        assert Severity.CRITICAL == "critical"
        assert Severity.WARNING == "warning"
        assert Severity.INFO == "info"

    def test_framework_values(self):
        assert Framework.GDPR == "gdpr"
        assert Framework.CNIL == "cnil"
        assert Framework.CCPA == "ccpa"
        assert Framework.EPRIVACY == "eprivacy"
        assert Framework.LGPD == "lgpd"
