import { Card } from './ui/card';
import { MetricCard } from './ui/metric-card';
import type { Site, SiteConfig } from '../types/api';

interface Props {
  site: Site;
  config: SiteConfig | null;
}

export default function SiteOverviewTab({ site, config }: Props) {
  const scriptTag = `<script src="${window.location.origin}/consent-loader.js" data-site-id="${site.id}" data-api-base="${window.location.origin}" async></script>`;

  return (
    <div className="space-y-6">
      {/* Status cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Status"
          value={site.is_active ? 'Active' : 'Inactive'}
          className={site.is_active ? 'text-status-success-fg' : ''}
        />
        <MetricCard
          label="Blocking mode"
          value={config?.blocking_mode?.replace('_', ' ') ?? 'Not configured'}
          className="capitalize"
        />
        <MetricCard
          label="Consent expiry"
          value={`${config?.consent_expiry_days ?? 365} days`}
        />
      </div>

      {/* Integration snippet */}
      <Card className="p-6">
        <h3 className="font-heading mb-3 text-sm font-semibold text-foreground">Integration snippet</h3>
        <p className="mb-3 text-sm text-text-secondary">
          Add this script tag to the {'<head>'} of your website, before any other scripts.
        </p>
        <div className="relative">
          <pre className="overflow-x-auto rounded-lg bg-foreground p-4 text-sm text-status-success-fg">
            {scriptTag}
          </pre>
          <button
            onClick={() => navigator.clipboard.writeText(scriptTag)}
            className="absolute right-3 top-3 rounded bg-foreground/80 px-2 py-1 text-xs text-card hover:bg-foreground/70"
          >
            Copy
          </button>
        </div>
      </Card>

      {/* Features */}
      <Card className="p-6">
        <h3 className="font-heading mb-4 text-sm font-semibold text-foreground">Features</h3>
        <div className="grid grid-cols-2 gap-3">
          <FeatureItem label="TCF v2.2" enabled={config?.tcf_enabled ?? false} />
          <FeatureItem label="Google Consent Mode" enabled={config?.gcm_enabled ?? false} />
          <FeatureItem label="Auto-blocking" enabled={config?.blocking_mode !== 'informational'} />
          <FeatureItem label="Custom banner" enabled={!!config?.banner_config} />
        </div>
      </Card>
    </div>
  );
}

function FeatureItem({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
      <span
        className={`h-2 w-2 rounded-full ${enabled ? 'bg-status-success-fg' : 'bg-text-tertiary'}`}
      />
      <span className="text-sm text-text-secondary">{label}</span>
    </div>
  );
}
