import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import ComplianceDashboardPage from '../pages/ComplianceDashboardPage';
import type { ComplianceScoreSummary, ComplianceScoreTrendResponse, Site } from '../types/api';

// ── Mocks ────────────────────────────────────────────────────────────

const mockListSites = vi.fn<() => Promise<Site[]>>();
const mockGetSummary = vi.fn<() => Promise<ComplianceScoreSummary>>();
const mockGetTrend = vi.fn<() => Promise<ComplianceScoreTrendResponse>>();

vi.mock('../api/sites', () => ({
  listSites: (...args: unknown[]) => mockListSites(...(args as [])),
}));

vi.mock('../api/compliance-scores', () => ({
  getComplianceScoreSummary: (...args: unknown[]) => mockGetSummary(...(args as [])),
  getComplianceScoreTrend: (...args: unknown[]) => mockGetTrend(...(args as [])),
}));

// Mock Recharts to avoid canvas rendering issues in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => <div data-testid="line" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
}));

// ── Helpers ──────────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage() {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ComplianceDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const TEST_SITE: Site = {
  id: 'site-1',
  organisation_id: 'org-1',
  domain: 'example.com',
  name: 'Example',
  display_name: 'Example Site',
  is_active: true,
  site_group_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const TEST_SUMMARY: ComplianceScoreSummary = {
  site_id: 'site-1',
  overall_score: 85,
  frameworks: [
    {
      id: 'score-1',
      site_id: 'site-1',
      framework: 'gdpr',
      score: 80,
      status: 'partial',
      critical_count: 1,
      warning_count: 1,
      info_count: 0,
      issues: [
        {
          rule_id: 'gdpr_reject_button',
          severity: 'critical',
          message: 'Reject button not as prominent as accept.',
          recommendation: 'Add a clearly visible reject button.',
        },
        {
          rule_id: 'gdpr_privacy_policy',
          severity: 'warning',
          message: 'Privacy policy link missing.',
          recommendation: 'Add a privacy policy URL.',
        },
      ],
      scanned_at: '2026-03-10T04:00:00Z',
      created_at: '2026-03-10T04:00:00Z',
    },
    {
      id: 'score-2',
      site_id: 'site-1',
      framework: 'ccpa',
      score: 90,
      status: 'partial',
      critical_count: 0,
      warning_count: 2,
      info_count: 0,
      issues: [],
      scanned_at: '2026-03-10T04:00:00Z',
      created_at: '2026-03-10T04:00:00Z',
    },
  ],
};

const TEST_TREND: ComplianceScoreTrendResponse = {
  site_id: 'site-1',
  framework: null,
  data_points: [
    { framework: 'gdpr', score: 75, scanned_at: '2026-03-08T04:00:00Z' },
    { framework: 'gdpr', score: 80, scanned_at: '2026-03-09T04:00:00Z' },
    { framework: 'gdpr', score: 80, scanned_at: '2026-03-10T04:00:00Z' },
  ],
};

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ComplianceDashboardPage', () => {
  it('shows empty state when no sites exist', async () => {
    mockListSites.mockResolvedValue([]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('No sites configured. Add a site first.')).toBeInTheDocument();
    });
  });

  it('renders the dashboard heading', async () => {
    mockListSites.mockResolvedValue([TEST_SITE]);
    mockGetSummary.mockResolvedValue(TEST_SUMMARY);
    mockGetTrend.mockResolvedValue(TEST_TREND);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Compliance Dashboard')).toBeInTheDocument();
    });
  });

  it('shows the site selector with the site name', async () => {
    mockListSites.mockResolvedValue([TEST_SITE]);
    mockGetSummary.mockResolvedValue(TEST_SUMMARY);
    mockGetTrend.mockResolvedValue(TEST_TREND);
    renderPage();

    await waitFor(() => {
      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
      expect(screen.getByText('Example Site')).toBeInTheDocument();
    });
  });

  it('shows the overall compliance score', async () => {
    mockListSites.mockResolvedValue([TEST_SITE]);
    mockGetSummary.mockResolvedValue(TEST_SUMMARY);
    mockGetTrend.mockResolvedValue(TEST_TREND);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Overall Compliance')).toBeInTheDocument();
      // Score badge shows 85
      expect(screen.getByText('85')).toBeInTheDocument();
    });
  });

  it('shows per-framework scores', async () => {
    mockListSites.mockResolvedValue([TEST_SITE]);
    mockGetSummary.mockResolvedValue(TEST_SUMMARY);
    mockGetTrend.mockResolvedValue(TEST_TREND);
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('GDPR').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('CCPA/CPRA').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('80')).toBeInTheDocument();
      expect(screen.getByText('90')).toBeInTheDocument();
    });
  });

  it('shows the trend chart section', async () => {
    mockListSites.mockResolvedValue([TEST_SITE]);
    mockGetSummary.mockResolvedValue(TEST_SUMMARY);
    mockGetTrend.mockResolvedValue(TEST_TREND);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Score Trends')).toBeInTheDocument();
    });
  });

  it('shows date range selector buttons', async () => {
    mockListSites.mockResolvedValue([TEST_SITE]);
    mockGetSummary.mockResolvedValue(TEST_SUMMARY);
    mockGetTrend.mockResolvedValue(TEST_TREND);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('7 days')).toBeInTheDocument();
      expect(screen.getByText('30 days')).toBeInTheDocument();
      expect(screen.getByText('90 days')).toBeInTheDocument();
      expect(screen.getByText('12 months')).toBeInTheDocument();
    });
  });

  it('shows issues table with framework and severity filters', async () => {
    mockListSites.mockResolvedValue([TEST_SITE]);
    mockGetSummary.mockResolvedValue(TEST_SUMMARY);
    mockGetTrend.mockResolvedValue(TEST_TREND);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('All frameworks')).toBeInTheDocument();
      expect(screen.getByText('All severities')).toBeInTheDocument();
    });
  });

  it('shows issue details when issue row is present', async () => {
    mockListSites.mockResolvedValue([TEST_SITE]);
    mockGetSummary.mockResolvedValue(TEST_SUMMARY);
    mockGetTrend.mockResolvedValue(TEST_TREND);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Reject button not as prominent as accept.')).toBeInTheDocument();
    });
  });

  it('shows export buttons', async () => {
    mockListSites.mockResolvedValue([TEST_SITE]);
    mockGetSummary.mockResolvedValue(TEST_SUMMARY);
    mockGetTrend.mockResolvedValue(TEST_TREND);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Export JSON')).toBeInTheDocument();
      expect(screen.getByText('Export CSV')).toBeInTheDocument();
    });
  });

  it('shows empty compliance data message when no scores exist', async () => {
    mockListSites.mockResolvedValue([TEST_SITE]);
    mockGetSummary.mockResolvedValue({
      site_id: 'site-1',
      overall_score: 100,
      frameworks: [],
    });
    mockGetTrend.mockResolvedValue({ site_id: 'site-1', framework: null, data_points: [] });
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText('No compliance scores recorded yet. Scores are computed daily.'),
      ).toBeInTheDocument();
    });
  });

  it('expands issue recommendation on click', async () => {
    mockListSites.mockResolvedValue([TEST_SITE]);
    mockGetSummary.mockResolvedValue(TEST_SUMMARY);
    mockGetTrend.mockResolvedValue(TEST_TREND);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Reject button not as prominent as accept.')).toBeInTheDocument();
    });

    // Click the row to expand
    fireEvent.click(screen.getByText('Reject button not as prominent as accept.'));

    await waitFor(() => {
      expect(screen.getByText('Recommendation:')).toBeInTheDocument();
      expect(screen.getByText('Add a clearly visible reject button.')).toBeInTheDocument();
    });
  });

  it('shows critical/warning counts in overview', async () => {
    mockListSites.mockResolvedValue([TEST_SITE]);
    mockGetSummary.mockResolvedValue(TEST_SUMMARY);
    mockGetTrend.mockResolvedValue(TEST_TREND);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('1 critical')).toBeInTheDocument();
      expect(screen.getByText('1 warning')).toBeInTheDocument();
    });
  });
});
