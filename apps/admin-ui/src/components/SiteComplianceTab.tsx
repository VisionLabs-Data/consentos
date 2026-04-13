import { useMemo, useState } from 'react';

import type {
  BannerConfig,
  ComplianceFramework,
  ComplianceIssue,
  ComplianceSeverity,
  ComplianceStatus,
  FrameworkResult,
  SiteConfig,
} from '../types/api';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { EmptyState } from './ui/empty-state';

// ── Types ───────────────────────────────────────────────────────────

interface Props {
  siteId: string;
  config: SiteConfig | null;
}

interface ComplianceRule {
  ruleId: string;
  description: string;
  check: (ctx: SiteContext) => ComplianceIssue[];
}

interface SiteContext {
  blockingMode: string;
  regionalModes: Record<string, string> | null;
  tcfEnabled: boolean;
  gcmEnabled: boolean;
  consentExpiryDays: number;
  privacyPolicyUrl: string | null;
  bannerConfig: BannerConfig | null;
  hasRejectButton: boolean;
  hasGranularChoices: boolean;
  hasCookieWall: boolean;
  preTicked: boolean;
}

// ── Rule helpers ────────────────────────────────────────────────────

function issue(
  ruleId: string,
  severity: ComplianceSeverity,
  message: string,
  recommendation: string,
): ComplianceIssue {
  return { rule_id: ruleId, severity, message, recommendation };
}

// ── GDPR rules ──────────────────────────────────────────────────────

const GDPR_RULES: ComplianceRule[] = [
  {
    ruleId: 'gdpr_opt_in',
    description: 'Opt-in consent required',
    check: (ctx) =>
      ctx.blockingMode !== 'opt_in'
        ? [issue('gdpr_opt_in', 'critical', 'GDPR requires opt-in consent before setting non-essential cookies.', "Set blocking mode to 'opt_in'.")]
        : [],
  },
  {
    ruleId: 'gdpr_reject_button',
    description: 'Reject as prominent as accept',
    check: (ctx) =>
      !ctx.hasRejectButton
        ? [issue('gdpr_reject_button', 'critical', 'The reject option must be as prominent as the accept option.', "Add a clearly visible 'Reject all' button to the first layer.")]
        : [],
  },
  {
    ruleId: 'gdpr_granular',
    description: 'Granular category consent',
    check: (ctx) =>
      !ctx.hasGranularChoices
        ? [issue('gdpr_granular', 'critical', 'Users must be able to consent to individual cookie categories.', 'Provide granular category toggles in the consent banner.')]
        : [],
  },
  {
    ruleId: 'gdpr_cookie_wall',
    description: 'No cookie walls',
    check: (ctx) =>
      ctx.hasCookieWall
        ? [issue('gdpr_cookie_wall', 'critical', 'Cookie walls (blocking access unless consent is given) are not permitted.', 'Remove the cookie wall and allow access without consent.')]
        : [],
  },
  {
    ruleId: 'gdpr_pre_ticked',
    description: 'No pre-ticked boxes',
    check: (ctx) =>
      ctx.preTicked
        ? [issue('gdpr_pre_ticked', 'critical', 'Pre-ticked consent boxes do not constitute valid consent.', 'Ensure all non-essential category checkboxes default to unchecked.')]
        : [],
  },
  {
    ruleId: 'gdpr_privacy_policy',
    description: 'Privacy policy link',
    check: (ctx) =>
      !ctx.privacyPolicyUrl
        ? [issue('gdpr_privacy_policy', 'warning', 'A link to the privacy policy should be accessible from the banner.', 'Configure a privacy policy URL in the site settings.')]
        : [],
  },
];

// ── CNIL rules (GDPR + French-specific) ─────────────────────────────

const CNIL_EXTRA_RULES: ComplianceRule[] = [
  {
    ruleId: 'cnil_reconsent',
    description: 'Re-consent every 6 months',
    check: (ctx) =>
      ctx.consentExpiryDays > 182
        ? [issue('cnil_reconsent', 'critical', 'CNIL requires re-consent at least every 6 months.', 'Set consent expiry to 182 days or fewer.')]
        : [],
  },
  {
    ruleId: 'cnil_cookie_lifetime',
    description: '13-month cookie lifetime',
    check: (ctx) =>
      ctx.consentExpiryDays > 395
        ? [issue('cnil_cookie_lifetime', 'critical', 'CNIL limits consent cookie lifetime to 13 months.', 'Set consent expiry to 395 days or fewer.')]
        : [],
  },
  {
    ruleId: 'cnil_reject_first_layer',
    description: 'Reject on first layer',
    check: (ctx) =>
      !ctx.hasRejectButton
        ? [issue('cnil_reject_first_layer', 'critical', "CNIL requires a 'Reject all' button on the first layer of the banner.", "Ensure the 'Reject all' button is visible on the first banner view.")]
        : [],
  },
];

const CNIL_RULES: ComplianceRule[] = [...GDPR_RULES, ...CNIL_EXTRA_RULES];

// ── CCPA/CPRA rules ─────────────────────────────────────────────────

const CCPA_RULES: ComplianceRule[] = [
  {
    ruleId: 'ccpa_opt_out',
    description: 'Opt-out mechanism',
    check: (ctx) =>
      ctx.blockingMode === 'informational'
        ? [issue('ccpa_opt_out', 'critical', 'CCPA requires at minimum an opt-out mechanism for data sale.', "Set blocking mode to 'opt_out' or 'opt_in'.")]
        : [],
  },
  {
    ruleId: 'ccpa_do_not_sell',
    description: 'Do Not Sell link',
    check: () => {
      // Banner config doesn't have a DNS toggle yet — always flag as advisory
      return [issue('ccpa_do_not_sell', 'warning', "CCPA requires a 'Do Not Sell My Personal Information' link on your site.", 'Add a Do Not Sell link to your website footer or privacy centre.')];
    },
  },
  {
    ruleId: 'ccpa_privacy_policy',
    description: 'Privacy policy required',
    check: (ctx) =>
      !ctx.privacyPolicyUrl
        ? [issue('ccpa_privacy_policy', 'warning', 'A privacy policy is required under CCPA.', 'Configure a privacy policy URL in the site settings.')]
        : [],
  },
];

// ── ePrivacy rules ──────────────────────────────────────────────────

const EPRIVACY_RULES: ComplianceRule[] = [
  {
    ruleId: 'eprivacy_consent',
    description: 'Consent for non-essential',
    check: (ctx) =>
      ctx.blockingMode === 'informational'
        ? [issue('eprivacy_consent', 'critical', 'ePrivacy Directive requires consent for non-essential cookies.', "Set blocking mode to 'opt_in' or 'opt_out'.")]
        : [],
  },
  {
    ruleId: 'eprivacy_necessary_exempt',
    description: 'Necessary cookies exempt',
    check: () => [],
  },
];

// ── LGPD rules (Brazil) ─────────────────────────────────────────────

const LGPD_RULES: ComplianceRule[] = [
  {
    ruleId: 'lgpd_consent_basis',
    description: 'Legal basis for processing',
    check: (ctx) =>
      ctx.blockingMode === 'informational'
        ? [issue('lgpd_consent_basis', 'critical', 'LGPD requires a legal basis (consent or legitimate interest) for data processing.', "Set blocking mode to 'opt_in' or 'opt_out'.")]
        : [],
  },
  {
    ruleId: 'lgpd_data_controller',
    description: 'Identify data controller',
    check: (ctx) =>
      !ctx.privacyPolicyUrl
        ? [issue('lgpd_data_controller', 'warning', 'LGPD requires identification of the data controller.', 'Link to a privacy policy that identifies the data controller.')]
        : [],
  },
  {
    ruleId: 'lgpd_granular',
    description: 'Granular consent choices',
    check: (ctx) =>
      !ctx.hasGranularChoices
        ? [issue('lgpd_granular', 'warning', 'LGPD recommends granular consent choices.', 'Provide individual category toggles in the consent banner.')]
        : [],
  },
];

// ── Framework registry ──────────────────────────────────────────────

const FRAMEWORK_RULES: Record<ComplianceFramework, ComplianceRule[]> = {
  gdpr: GDPR_RULES,
  cnil: CNIL_RULES,
  ccpa: CCPA_RULES,
  eprivacy: EPRIVACY_RULES,
  lgpd: LGPD_RULES,
};

const FRAMEWORKS: { id: ComplianceFramework; label: string }[] = [
  { id: 'gdpr', label: 'GDPR' },
  { id: 'cnil', label: 'CNIL' },
  { id: 'ccpa', label: 'CCPA/CPRA' },
  { id: 'eprivacy', label: 'ePrivacy' },
  { id: 'lgpd', label: 'LGPD' },
];

// ── Compliance engine ───────────────────────────────────────────────

function buildContext(config: SiteConfig | null): SiteContext {
  const bc = config?.banner_config ?? null;
  return {
    blockingMode: config?.blocking_mode ?? 'opt_in',
    regionalModes: config?.regional_modes ?? null,
    tcfEnabled: config?.tcf_enabled ?? false,
    gcmEnabled: config?.gcm_enabled ?? true,
    consentExpiryDays: config?.consent_expiry_days ?? 365,
    privacyPolicyUrl: config?.privacy_policy_url ?? null,
    bannerConfig: bc,
    hasRejectButton: bc?.showRejectAll !== false,
    hasGranularChoices: bc?.showManagePreferences !== false,
    hasCookieWall: false, // Not a config option — always false
    preTicked: false, // Banner never pre-ticks — always false
  };
}

function runFrameworkCheck(framework: ComplianceFramework, ctx: SiteContext): FrameworkResult {
  const rules = FRAMEWORK_RULES[framework];
  const allIssues: ComplianceIssue[] = [];
  let rulesPassed = 0;

  for (const rule of rules) {
    const issues = rule.check(ctx);
    if (issues.length > 0) {
      allIssues.push(...issues);
    } else {
      rulesPassed++;
    }
  }

  const rulesChecked = rules.length;
  const score = calculateScore(allIssues);
  const hasCritical = allIssues.some((i) => i.severity === 'critical');
  const status: ComplianceStatus = hasCritical ? 'non_compliant' : score >= 100 ? 'compliant' : 'partial';

  return { framework, score, status, issues: allIssues, rules_checked: rulesChecked, rules_passed: rulesPassed };
}

function calculateScore(issues: ComplianceIssue[]): number {
  let deductions = 0;
  for (const i of issues) {
    if (i.severity === 'critical') deductions += 20;
    else if (i.severity === 'warning') deductions += 5;
  }
  return Math.max(0, 100 - deductions);
}

// ── UI Components ───────────────────────────────────────────────────

function ComplianceStatusBadge({ status }: { status: ComplianceStatus }) {
  const variantMap: Record<ComplianceStatus, 'success' | 'warning' | 'error'> = {
    compliant: 'success',
    partial: 'warning',
    non_compliant: 'error',
  };
  const labels: Record<ComplianceStatus, string> = {
    compliant: 'Compliant',
    partial: 'Partial',
    non_compliant: 'Non-compliant',
  };

  return (
    <Badge variant={variantMap[status]} className="text-xs font-semibold">
      {labels[status]}
    </Badge>
  );
}

function SeverityIcon({ severity }: { severity: ComplianceSeverity }) {
  const icons: Record<ComplianceSeverity, { symbol: string; colour: string }> = {
    critical: { symbol: '!', colour: 'bg-status-error-fg text-white' },
    warning: { symbol: '!', colour: 'bg-status-warning-fg text-white' },
    info: { symbol: 'i', colour: 'bg-status-info-bg text-status-info-fg' },
  };
  const { symbol, colour } = icons[severity];

  return (
    <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${colour}`}>
      {symbol}
    </span>
  );
}

function ScoreRing({ score }: { score: number }) {
  const colour = score >= 80 ? 'text-status-success-fg' : score >= 50 ? 'text-status-warning-fg' : 'text-status-error-fg';

  return (
    <div className={`text-3xl font-bold ${colour}`}>
      {score}
      <span className="text-base font-normal text-text-tertiary">/100</span>
    </div>
  );
}

function IssueRow({ issueData }: { issueData: ComplianceIssue }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-mist"
      >
        <SeverityIcon severity={issueData.severity} />
        <span className="flex-1 text-sm text-foreground">{issueData.message}</span>
        <span className="text-xs text-text-tertiary">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="bg-background px-4 pb-3 pl-12">
          <p className="text-sm text-text-secondary">{issueData.recommendation}</p>
          <p className="mt-1 font-mono text-xs text-text-tertiary">{issueData.rule_id}</p>
        </div>
      )}
    </div>
  );
}

function FrameworkCard({ result }: { result: FrameworkResult }) {
  const [expanded, setExpanded] = useState(result.issues.length > 0);
  const label = FRAMEWORKS.find((f) => f.id === result.framework)?.label ?? result.framework;

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-4 text-left hover:bg-mist sm:px-5"
      >
        <div className="flex items-center gap-3 sm:gap-4">
          <ScoreRing score={result.score} />
          <div>
            <h3 className="font-heading text-sm font-semibold text-foreground sm:text-base">{label}</h3>
            <p className="text-xs text-text-secondary">
              {result.rules_passed}/{result.rules_checked} rules passed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <ComplianceStatusBadge status={result.status} />
          {result.issues.length > 0 && (
            <span className="hidden text-xs text-text-tertiary sm:inline">
              {result.issues.length} issue{result.issues.length !== 1 ? 's' : ''} {expanded ? '▲' : '▼'}
            </span>
          )}
        </div>
      </button>

      {expanded && result.issues.length > 0 && (
        <div className="border-t border-border">
          {result.issues.map((issueData) => (
            <IssueRow key={issueData.rule_id} issueData={issueData} />
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Main component ──────────────────────────────────────────────────

export default function SiteComplianceTab({ siteId: _siteId, config }: Props) {
  const [selectedFrameworks, setSelectedFrameworks] = useState<Set<ComplianceFramework>>(
    new Set(FRAMEWORKS.map((f) => f.id)),
  );

  // Run compliance checks purely on the frontend
  const { results, overallScore } = useMemo(() => {
    const ctx = buildContext(config);
    const frameworkResults = [...selectedFrameworks].map((fw) => runFrameworkCheck(fw, ctx));
    const overall = frameworkResults.length > 0
      ? Math.round(frameworkResults.reduce((sum, r) => sum + r.score, 0) / frameworkResults.length)
      : 100;
    return { results: frameworkResults, overallScore: overall };
  }, [config, selectedFrameworks]);

  const toggleFramework = (id: ComplianceFramework) => {
    setSelectedFrameworks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id); // Keep at least one selected
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (!config) {
    return (
      <EmptyState message="No site configuration found. Configure your site first." />
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">Compliance Checker</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Your site configuration is checked against regulatory frameworks in real time.
        </p>
      </div>

      {/* Framework selector */}
      <div className="mb-4 flex flex-wrap gap-2 sm:mb-6">
        {FRAMEWORKS.map((fw) => (
          <button
            key={fw.id}
            onClick={() => toggleFramework(fw.id)}
            className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
              selectedFrameworks.has(fw.id)
                ? 'border-copper bg-copper/10 text-copper'
                : 'border-border bg-card text-text-secondary hover:border-border'
            }`}
          >
            {fw.label}
          </button>
        ))}
      </div>

      {/* Overall score */}
      <Card className="mb-4 p-4 sm:mb-6 sm:p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-heading text-sm font-medium text-text-secondary">Overall Compliance Score</h3>
            <div className="mt-1">
              <ScoreRing score={overallScore} />
            </div>
          </div>
          <div className="text-right text-sm text-text-secondary">
            {results.length} framework{results.length !== 1 ? 's' : ''} checked
          </div>
        </div>
      </Card>

      {/* Per-framework results */}
      <div className="space-y-3 sm:space-y-4">
        {results.map((result) => (
          <FrameworkCard key={result.framework} result={result} />
        ))}
      </div>
    </div>
  );
}
