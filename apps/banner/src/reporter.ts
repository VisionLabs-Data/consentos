/**
 * Client-side cookie reporter.
 *
 * Runs on a configurable sampling basis (e.g. 10% of page loads).
 * Enumerates document.cookie, localStorage, and sessionStorage keys.
 * Batches reports and POSTs to the scanner/report API endpoint.
 *
 * @module reporter
 */

/** A single discovered storage item from the client. */
export interface DiscoveredCookie {
  name: string;
  domain: string;
  storage_type: 'cookie' | 'local_storage' | 'session_storage';
  /** Raw value length (not the value itself, for privacy). */
  value_length: number;
  /** HTTP cookie attributes if available. */
  path?: string;
  is_secure?: boolean;
  same_site?: string;
  /** Script URL that likely set this cookie (from PerformanceObserver). */
  script_source?: string;
}

/** Report payload sent to the API. */
export interface CookieReport {
  site_id: string;
  page_url: string;
  cookies: DiscoveredCookie[];
  /** ISO 8601 timestamp of when the report was collected. */
  collected_at: string;
  /** User agent string for classification context. */
  user_agent: string;
}

/** Reporter configuration. */
export interface ReporterConfig {
  /** Site ID for this report. */
  siteId: string;
  /** Base URL for the API (e.g. https://api.example.com/api/v1). */
  apiBase: string;
  /** Sampling rate: 0.0 to 1.0 (e.g. 0.1 = 10% of page loads). */
  sampleRate: number;
  /** Delay in ms before collecting cookies (allows page to load). */
  collectDelay: number;
  /** Whether to include localStorage keys. */
  includeLocalStorage: boolean;
  /** Whether to include sessionStorage keys. */
  includeSessionStorage: boolean;
}

const DEFAULT_CONFIG: Omit<ReporterConfig, 'siteId' | 'apiBase'> = {
  sampleRate: 0.1,
  collectDelay: 3000,
  includeLocalStorage: true,
  includeSessionStorage: true,
};

/** Track loaded scripts for attribution via PerformanceObserver. */
let observedScripts: string[] = [];
let observer: PerformanceObserver | null = null;

/**
 * Install a PerformanceObserver to track script loads for attribution.
 * Must be called early (ideally in the loader) to capture all scripts.
 */
export function installScriptObserver(): void {
  if (typeof PerformanceObserver === 'undefined') return;

  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'resource') {
          const resourceEntry = entry as PerformanceResourceTiming;
          if (resourceEntry.initiatorType === 'script') {
            observedScripts.push(resourceEntry.name);
          }
        }
      }
    });
    observer.observe({ type: 'resource', buffered: true });
  } catch {
    // PerformanceObserver not supported — degrade gracefully
  }
}

/**
 * Remove the script observer. Used for testing and cleanup.
 */
export function removeScriptObserver(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  observedScripts = [];
}

/**
 * Get all scripts observed since the observer was installed.
 */
export function getObservedScripts(): string[] {
  return [...observedScripts];
}

/**
 * Parse document.cookie into individual cookies.
 */
export function parseCookies(): DiscoveredCookie[] {
  const cookies: DiscoveredCookie[] = [];

  if (typeof document === 'undefined' || !document.cookie) return cookies;

  const cookieStr = document.cookie;
  const pairs = cookieStr.split(';');

  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (!trimmed) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex < 0) continue;

    const name = trimmed.substring(0, eqIndex).trim();
    const value = trimmed.substring(eqIndex + 1);

    if (!name) continue;

    cookies.push({
      name,
      domain: window.location.hostname,
      storage_type: 'cookie',
      value_length: value.length,
    });
  }

  return cookies;
}

/**
 * Enumerate localStorage keys.
 */
export function enumerateLocalStorage(): DiscoveredCookie[] {
  const items: DiscoveredCookie[] = [];

  try {
    if (typeof localStorage === 'undefined') return items;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      const value = localStorage.getItem(key) ?? '';
      items.push({
        name: key,
        domain: window.location.hostname,
        storage_type: 'local_storage',
        value_length: value.length,
      });
    }
  } catch {
    // localStorage may be blocked in some browsers/contexts
  }

  return items;
}

/**
 * Enumerate sessionStorage keys.
 */
export function enumerateSessionStorage(): DiscoveredCookie[] {
  const items: DiscoveredCookie[] = [];

  try {
    if (typeof sessionStorage === 'undefined') return items;

    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key) continue;

      const value = sessionStorage.getItem(key) ?? '';
      items.push({
        name: key,
        domain: window.location.hostname,
        storage_type: 'session_storage',
        value_length: value.length,
      });
    }
  } catch {
    // sessionStorage may be blocked in some browsers/contexts
  }

  return items;
}

/**
 * Collect all storage items from the current page.
 */
export function collectAll(config: ReporterConfig): DiscoveredCookie[] {
  const items: DiscoveredCookie[] = [];

  items.push(...parseCookies());

  if (config.includeLocalStorage) {
    items.push(...enumerateLocalStorage());
  }

  if (config.includeSessionStorage) {
    items.push(...enumerateSessionStorage());
  }

  return items;
}

/**
 * Build the report payload.
 */
export function buildReport(
  config: ReporterConfig,
  cookies: DiscoveredCookie[],
): CookieReport {
  return {
    site_id: config.siteId,
    page_url: typeof window !== 'undefined' ? window.location.href : '',
    cookies,
    collected_at: new Date().toISOString(),
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  };
}

/**
 * Send a cookie report to the API.
 * Uses navigator.sendBeacon for reliability, falling back to fetch.
 */
export async function sendReport(
  apiBase: string,
  report: CookieReport,
): Promise<boolean> {
  const url = `${apiBase}/scanner/report`;
  const body = JSON.stringify(report);

  // Prefer sendBeacon — fires even if page is closing
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    return navigator.sendBeacon(url, blob);
  }

  // Fallback to fetch
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Determine if this page load should be sampled for reporting.
 */
export function shouldSample(sampleRate: number): boolean {
  return Math.random() < sampleRate;
}

/**
 * Start the reporter. Call once per page load.
 *
 * The reporter will:
 * 1. Check the sampling rate — skip if not sampled
 * 2. Wait for the configured delay (to allow scripts to run)
 * 3. Enumerate all cookies and storage keys
 * 4. POST the report to the scanner API
 */
export function startReporter(config: Partial<ReporterConfig> & { siteId: string; apiBase: string }): void {
  const fullConfig: ReporterConfig = { ...DEFAULT_CONFIG, ...config };

  if (!shouldSample(fullConfig.sampleRate)) return;

  // Install script observer for attribution
  installScriptObserver();

  // Delay collection to allow page to finish loading
  setTimeout(() => {
    const cookies = collectAll(fullConfig);
    if (cookies.length === 0) return;

    const report = buildReport(fullConfig, cookies);
    sendReport(fullConfig.apiBase, report);
  }, fullConfig.collectDelay);
}

/**
 * Collect and report immediately (for testing or manual triggers).
 */
export async function reportNow(
  config: Partial<ReporterConfig> & { siteId: string; apiBase: string },
): Promise<CookieReport | null> {
  const fullConfig: ReporterConfig = { ...DEFAULT_CONFIG, ...config };
  const cookies = collectAll(fullConfig);

  if (cookies.length === 0) return null;

  const report = buildReport(fullConfig, cookies);
  await sendReport(fullConfig.apiBase, report);
  return report;
}
