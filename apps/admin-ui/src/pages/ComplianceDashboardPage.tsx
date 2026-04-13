import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { getComplianceScoreSummary, getComplianceScoreTrend } from '../api/compliance-scores';
import { listSites } from '../api/sites';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { LoadingState } from '../components/ui/loading-state';
import { Select } from '../components/ui/select';
import { TabGroup } from '../components/ui/tab-group';
import type {
  ComplianceScoreSummary,
  ComplianceScoreTrendPoint,
  ComplianceScoreTrendResponse,
  ComplianceStatus,
  Site,
} from '../types/api';

// ── Constants ────────────────────────────────────────────────────────

type DateRange = '7d' | '30d' | '90d' | '12m';

const DATE_RANGE_OPTIONS: { value: DateRange; label: string; days: number }[] = [
  { value: '7d', label: '7 days', days: 7 },
  { value: '30d', label: '30 days', days: 30 },
  { value: '90d', label: '90 days', days: 90 },
  { value: '12m', label: '12 months', days: 365 },
];

const FRAMEWORK_COLOURS: Record<string, string> = {
  gdpr: '#3b82f6',
  cnil: '#8b5cf6',
  ccpa: '#f59e0b',
  eprivacy: '#10b981',
  lgpd: '#ef4444',
};

const FRAMEWORK_LABELS: Record<string, string> = {
  gdpr: 'GDPR',
  cnil: 'CNIL',
  ccpa: 'CCPA/CPRA',
  eprivacy: 'ePrivacy',
  lgpd: 'LGPD',
};

type SeverityFilter = 'all' | 'critical' | 'warning' | 'info';

// ── Score change indicator ───────────────────────────────────────────

function ScoreChange({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) return <span className="text-xs text-text-tertiary">No prior data</span>;
  const diff = current - previous;
  if (diff === 0) return <span className="text-xs text-text-tertiary">No change</span>;
  const isPositive = diff > 0;
  return (
    <span className={`text-xs font-medium ${isPositive ? 'text-status-success-fg' : 'text-status-error-fg'}`}>
      {isPositive ? '+' : ''}{diff} vs yesterday
    </span>
  );
}

// ── Overview panel ───────────────────────────────────────────────────

function OverviewPanel({
  summary,
  trendData,
}: {
  summary: ComplianceScoreSummary;
  trendData: ComplianceScoreTrendResponse | undefined;
}) {
  // Calculate previous day scores for each framework from trend data
  const previousScores = useMemo(() => {
    if (!trendData?.data_points) return new Map<string, number>();
    const map = new Map<string, number>();
    const byFramework = new Map<string, ComplianceScoreTrendPoint[]>();
    for (const dp of trendData.data_points) {
      const list = byFramework.get(dp.framework) ?? [];
      list.push(dp);
      byFramework.set(dp.framework, list);
    }
    for (const [fw, points] of byFramework) {
      // Sort by date descending, take second entry as "previous"
      const sorted = [...points].sort(
        (a, b) => new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime(),
      );
      if (sorted.length > 1) {
        map.set(fw, sorted[1].score);
      }
    }
    return map;
  }, [trendData]);

  const scoreBadgeVariant = (score: number): 'success' | 'warning' | 'error' =>
    score > 90 ? 'success' : score >= 70 ? 'warning' : 'error';

  const statusBadgeVariant = (status: ComplianceStatus): 'success' | 'warning' | 'error' => {
    const map: Record<ComplianceStatus, 'success' | 'warning' | 'error'> = {
      compliant: 'success',
      partial: 'warning',
      non_compliant: 'error',
    };
    return map[status];
  };

  const statusLabels: Record<ComplianceStatus, string> = {
    compliant: 'Compliant',
    partial: 'Partial',
    non_compliant: 'Non-compliant',
  };

  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-heading text-sm font-semibold text-foreground">Overall Compliance</h3>
        <Badge variant={scoreBadgeVariant(summary.overall_score)} className="text-lg font-bold px-3 py-1">
          {summary.overall_score}
        </Badge>
      </div>
      {summary.frameworks.length === 0 ? (
        <p className="text-sm text-text-secondary">No compliance scores recorded yet. Scores are computed daily.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summary.frameworks.map((fw) => (
            <div key={fw.framework} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {FRAMEWORK_LABELS[fw.framework] ?? fw.framework}
                </span>
                <Badge variant={scoreBadgeVariant(fw.score)} className="text-lg font-bold px-3 py-1">
                  {fw.score}
                </Badge>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <Badge variant={statusBadgeVariant(fw.status)}>
                  {statusLabels[fw.status]}
                </Badge>
                <ScoreChange
                  current={fw.score}
                  previous={previousScores.get(fw.framework) ?? null}
                />
              </div>
              <div className="mt-2 text-xs text-text-secondary">
                {fw.critical_count > 0 && (
                  <span className="mr-2 text-status-error-fg">{fw.critical_count} critical</span>
                )}
                {fw.warning_count > 0 && (
                  <span className="mr-2 text-status-warning-fg">{fw.warning_count} warning</span>
                )}
                {fw.info_count > 0 && (
                  <span className="text-status-info-fg">{fw.info_count} info</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Trend chart ──────────────────────────────────────────────────────

interface ChartDataPoint {
  date: string;
  [framework: string]: string | number;
}

function TrendChart({
  trendData,
  dateRange,
  onDateRangeChange,
}: {
  trendData: ComplianceScoreTrendResponse | undefined;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
}) {
  const chartData = useMemo(() => {
    if (!trendData?.data_points || trendData.data_points.length === 0) return [];

    // Group by date, with one key per framework
    const byDate = new Map<string, ChartDataPoint>();
    for (const dp of trendData.data_points) {
      const dateKey = new Date(dp.scanned_at).toISOString().split('T')[0];
      const existing = byDate.get(dateKey) ?? { date: dateKey };
      existing[dp.framework] = dp.score;
      byDate.set(dateKey, existing);
    }

    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [trendData]);

  const frameworks = useMemo(() => {
    if (!trendData?.data_points) return [];
    return [...new Set(trendData.data_points.map((dp) => dp.framework))];
  }, [trendData]);

  const tabOptions = DATE_RANGE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }));

  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-heading text-sm font-semibold text-foreground">Score Trends</h3>
        <TabGroup
          options={tabOptions}
          value={dateRange}
          onChange={(v) => onDateRangeChange(v as DateRange)}
        />
      </div>

      {chartData.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-secondary">
          No trend data available for this period.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: string) => {
                const d = new Date(v);
                return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
              }}
            />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
            <Tooltip
              labelFormatter={(v) => new Date(String(v)).toLocaleDateString('en-GB')}
              formatter={(value: unknown, name: unknown) => [
                `${String(value)}/100`,
                FRAMEWORK_LABELS[String(name)] ?? String(name),
              ]}
            />
            <Legend
              formatter={(value: string) => FRAMEWORK_LABELS[value] ?? value}
            />
            {frameworks.map((fw) => (
              <Line
                key={fw}
                type="monotone"
                dataKey={fw}
                stroke={FRAMEWORK_COLOURS[fw] ?? '#6b7280'}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// ── Issues table ─────────────────────────────────────────────────────

interface FlatIssue {
  framework: string;
  rule_id: string;
  severity: string;
  message: string;
  recommendation: string;
  scanned_at: string;
}

function IssuesTable({ summary }: { summary: ComplianceScoreSummary }) {
  const [frameworkFilter, setFrameworkFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [sortField, setSortField] = useState<'framework' | 'severity' | 'scanned_at'>('severity');
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Flatten issues from all frameworks
  const allIssues = useMemo(() => {
    const issues: FlatIssue[] = [];
    for (const fw of summary.frameworks) {
      if (!fw.issues) continue;
      const issueList = Array.isArray(fw.issues) ? fw.issues : Object.values(fw.issues);
      for (const issue of issueList as Array<{
        rule_id?: string;
        severity?: string;
        message?: string;
        recommendation?: string;
      }>) {
        issues.push({
          framework: fw.framework,
          rule_id: issue.rule_id ?? 'unknown',
          severity: issue.severity ?? 'info',
          message: issue.message ?? '',
          recommendation: issue.recommendation ?? '',
          scanned_at: fw.scanned_at,
        });
      }
    }
    return issues;
  }, [summary]);

  const filteredIssues = useMemo(() => {
    let result = allIssues;
    if (frameworkFilter !== 'all') {
      result = result.filter((i) => i.framework === frameworkFilter);
    }
    if (severityFilter !== 'all') {
      result = result.filter((i) => i.severity === severityFilter);
    }

    const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    result.sort((a, b) => {
      let cmp: number;
      if (sortField === 'severity') {
        cmp = (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
      } else if (sortField === 'framework') {
        cmp = a.framework.localeCompare(b.framework);
      } else {
        cmp = new Date(a.scanned_at).getTime() - new Date(b.scanned_at).getTime();
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [allIssues, frameworkFilter, severityFilter, sortField, sortAsc]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const frameworks = useMemo(
    () => [...new Set(allIssues.map((i) => i.framework))],
    [allIssues],
  );

  const severityVariant: Record<string, 'error' | 'warning' | 'info' | 'neutral'> = {
    critical: 'error',
    warning: 'warning',
    info: 'info',
  };

  if (allIssues.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="font-heading text-sm font-semibold text-foreground mb-2">Issues</h3>
        <p className="text-sm text-text-secondary">No compliance issues detected. Well done!</p>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading text-sm font-semibold text-foreground">
          Issues ({filteredIssues.length})
        </h3>
        <div className="flex gap-2">
          <Select
            value={frameworkFilter}
            onChange={(e) => setFrameworkFilter(e.target.value)}
            className="h-8 px-2 py-1 text-xs"
          >
            <option value="all">All frameworks</option>
            {frameworks.map((fw) => (
              <option key={fw} value={fw}>
                {FRAMEWORK_LABELS[fw] ?? fw}
              </option>
            ))}
          </Select>
          <Select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
            className="h-8 px-2 py-1 text-xs"
          >
            <option value="all">All severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-mist">
            <tr>
              <th
                className="cursor-pointer px-3 py-2 text-left font-medium text-text-secondary hover:text-foreground"
                onClick={() => handleSort('framework')}
              >
                Framework {sortField === 'framework' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th
                className="cursor-pointer px-3 py-2 text-left font-medium text-text-secondary hover:text-foreground"
                onClick={() => handleSort('severity')}
              >
                Severity {sortField === 'severity' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th className="px-3 py-2 text-left font-medium text-text-secondary">Description</th>
              <th
                className="cursor-pointer px-3 py-2 text-left font-medium text-text-secondary hover:text-foreground"
                onClick={() => handleSort('scanned_at')}
              >
                Detected {sortField === 'scanned_at' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredIssues.map((issue, idx) => {
              const rowKey = `${issue.framework}-${issue.rule_id}-${idx}`;
              const isExpanded = expandedRow === rowKey;
              return (
                <tr
                  key={rowKey}
                  className="cursor-pointer hover:bg-mist"
                  onClick={() => setExpandedRow(isExpanded ? null : rowKey)}
                >
                  <td className="px-3 py-2 font-medium text-foreground">
                    {FRAMEWORK_LABELS[issue.framework] ?? issue.framework}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={severityVariant[issue.severity] ?? 'neutral'} className="text-xs font-semibold">
                      {issue.severity}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-text-secondary">
                    <div>{issue.message}</div>
                    {isExpanded && (
                      <div className="mt-2 rounded bg-mist p-2 text-xs text-text-secondary">
                        <p className="font-medium text-foreground">Recommendation:</p>
                        <p>{issue.recommendation}</p>
                        <p className="mt-1 font-mono text-text-tertiary">{issue.rule_id}</p>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">
                    {new Date(issue.scanned_at).toLocaleDateString('en-GB')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Export functions ──────────────────────────────────────────────────

function exportAsJson(summary: ComplianceScoreSummary): void {
  const report = {
    exported_at: new Date().toISOString(),
    site_id: summary.site_id,
    overall_score: summary.overall_score,
    frameworks: summary.frameworks.map((fw) => ({
      framework: fw.framework,
      score: fw.score,
      status: fw.status,
      critical_count: fw.critical_count,
      warning_count: fw.warning_count,
      info_count: fw.info_count,
      issues: fw.issues,
      scanned_at: fw.scanned_at,
    })),
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `compliance-report-${summary.site_id}-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportAsCsv(summary: ComplianceScoreSummary): void {
  const rows: string[] = [
    'Framework,Score,Status,Critical,Warning,Info,Scanned At',
  ];

  for (const fw of summary.frameworks) {
    rows.push(
      [
        FRAMEWORK_LABELS[fw.framework] ?? fw.framework,
        fw.score,
        fw.status,
        fw.critical_count,
        fw.warning_count,
        fw.info_count,
        fw.scanned_at,
      ].join(','),
    );
  }

  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `compliance-report-${summary.site_id}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main page component ──────────────────────────────────────────────

export default function ComplianceDashboardPage() {
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('90d');

  const days = DATE_RANGE_OPTIONS.find((opt) => opt.value === dateRange)?.days ?? 90;

  // Fetch sites for the selector
  const { data: sites, isLoading: sitesLoading } = useQuery<Site[]>({
    queryKey: ['sites'],
    queryFn: listSites,
  });

  // Auto-select the first site when sites load
  const effectiveSiteId = selectedSiteId ?? sites?.[0]?.id ?? null;

  const { data: summary, isLoading: summaryLoading } = useQuery<ComplianceScoreSummary>({
    queryKey: ['compliance-scores', effectiveSiteId],
    queryFn: () => getComplianceScoreSummary(effectiveSiteId!),
    enabled: !!effectiveSiteId,
  });

  const { data: trendData } = useQuery<ComplianceScoreTrendResponse>({
    queryKey: ['compliance-scores', 'trend', effectiveSiteId, days],
    queryFn: () => getComplianceScoreTrend(effectiveSiteId!, { days }),
    enabled: !!effectiveSiteId,
  });

  const handleSiteChange = useCallback((siteId: string) => {
    setSelectedSiteId(siteId);
  }, []);

  if (sitesLoading) {
    return <LoadingState />;
  }

  if (!sites || sites.length === 0) {
    return (
      <EmptyState message="No sites configured. Add a site first." />
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-foreground">Compliance Dashboard</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Continuous compliance monitoring with daily score tracking.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Site selector */}
          <Select
            value={effectiveSiteId ?? ''}
            onChange={(e) => handleSiteChange(e.target.value)}
          >
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.display_name || site.domain}
              </option>
            ))}
          </Select>

          {/* Export buttons */}
          {summary && (
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportAsJson(summary)}
              >
                Export JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportAsCsv(summary)}
              >
                Export CSV
              </Button>
            </div>
          )}
        </div>
      </div>

      {summaryLoading ? (
        <LoadingState message="Loading compliance data..." />
      ) : !summary ? (
        <EmptyState message="No compliance data available for this site. Scores are computed daily at 04:00 UTC." />
      ) : (
        <div className="space-y-6">
          {/* Overview panel */}
          <OverviewPanel summary={summary} trendData={trendData} />

          {/* Score trend chart */}
          <TrendChart
            trendData={trendData}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
          />

          {/* Issues table */}
          <IssuesTable summary={summary} />
        </div>
      )}
    </div>
  );
}
