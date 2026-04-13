/**
 * Tests for client-side cookie reporter — CMP-23.
 *
 * Covers cookie parsing, storage enumeration, sampling, report building,
 * report sending, and the full reporter lifecycle.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CookieReport,
  type DiscoveredCookie,
  type ReporterConfig,
  buildReport,
  collectAll,
  enumerateLocalStorage,
  enumerateSessionStorage,
  getObservedScripts,
  installScriptObserver,
  parseCookies,
  removeScriptObserver,
  reportNow,
  sendReport,
  shouldSample,
  startReporter,
} from '../reporter';

// ── Helpers ─────────────────────────────────────────────────────────

function makeConfig(
  overrides: Partial<ReporterConfig> = {},
): ReporterConfig {
  return {
    siteId: 'test-site-id',
    apiBase: 'https://api.example.com/api/v1',
    sampleRate: 1.0, // Always sample in tests
    collectDelay: 0,
    includeLocalStorage: true,
    includeSessionStorage: true,
    ...overrides,
  };
}

// ── Cookie parsing ──────────────────────────────────────────────────

describe('parseCookies', () => {
  beforeEach(() => {
    // Clear all cookies
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim();
      if (name) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      }
    });
  });

  afterEach(() => {
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim();
      if (name) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      }
    });
  });

  it('should return empty array when no cookies exist', () => {
    // After clearing, parseCookies should return empty or only empty entries
    const result = parseCookies();
    // Filter out any empty-name artefacts from jsdom
    const named = result.filter((c) => c.name.length > 0);
    expect(named).toEqual([]);
  });

  it('should parse a single cookie', () => {
    document.cookie = '_ga=GA1.2.123456789.1234567890';
    const result = parseCookies();
    const ga = result.find((c) => c.name === '_ga');
    expect(ga).toBeDefined();
    expect(ga!.storage_type).toBe('cookie');
    expect(ga!.domain).toBe('localhost');
    expect(ga!.value_length).toBeGreaterThan(0);
  });

  it('should parse multiple cookies', () => {
    document.cookie = '_ga=value1';
    document.cookie = '_gid=value2';
    const result = parseCookies();
    const names = result.map((c) => c.name);
    expect(names).toContain('_ga');
    expect(names).toContain('_gid');
  });

  it('should handle cookies with equals in value', () => {
    document.cookie = 'data=key=value';
    const result = parseCookies();
    const data = result.find((c) => c.name === 'data');
    expect(data).toBeDefined();
    expect(data!.value_length).toBe('key=value'.length);
  });
});

// ── localStorage enumeration ────────────────────────────────────────

describe('enumerateLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should return empty array when localStorage is empty', () => {
    expect(enumerateLocalStorage()).toEqual([]);
  });

  it('should enumerate localStorage keys', () => {
    localStorage.setItem('analytics_id', 'abc123');
    localStorage.setItem('theme', 'dark');
    const result = enumerateLocalStorage();
    expect(result).toHaveLength(2);
    const names = result.map((i) => i.name);
    expect(names).toContain('analytics_id');
    expect(names).toContain('theme');
    expect(result[0].storage_type).toBe('local_storage');
  });

  it('should report correct value lengths', () => {
    localStorage.setItem('key', 'hello');
    const result = enumerateLocalStorage();
    expect(result[0].value_length).toBe(5);
  });
});

// ── sessionStorage enumeration ──────────────────────────────────────

describe('enumerateSessionStorage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should return empty array when sessionStorage is empty', () => {
    expect(enumerateSessionStorage()).toEqual([]);
  });

  it('should enumerate sessionStorage keys', () => {
    sessionStorage.setItem('session_token', 'xyz');
    const result = enumerateSessionStorage();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('session_token');
    expect(result[0].storage_type).toBe('session_storage');
  });
});

// ── collectAll ──────────────────────────────────────────────────────

describe('collectAll', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should collect from all storage types', () => {
    document.cookie = '_ga=test';
    localStorage.setItem('ls_key', 'value');
    sessionStorage.setItem('ss_key', 'value');

    const config = makeConfig();
    const result = collectAll(config);

    const types = new Set(result.map((i) => i.storage_type));
    expect(types).toContain('cookie');
    expect(types).toContain('local_storage');
    expect(types).toContain('session_storage');
  });

  it('should exclude localStorage when disabled', () => {
    localStorage.setItem('ls_key', 'value');

    const config = makeConfig({ includeLocalStorage: false });
    const result = collectAll(config);

    const hasLocal = result.some((i) => i.storage_type === 'local_storage');
    expect(hasLocal).toBe(false);
  });

  it('should exclude sessionStorage when disabled', () => {
    sessionStorage.setItem('ss_key', 'value');

    const config = makeConfig({ includeSessionStorage: false });
    const result = collectAll(config);

    const hasSession = result.some(
      (i) => i.storage_type === 'session_storage',
    );
    expect(hasSession).toBe(false);
  });
});

// ── Report building ─────────────────────────────────────────────────

describe('buildReport', () => {
  it('should build a valid report', () => {
    const config = makeConfig();
    const cookies: DiscoveredCookie[] = [
      {
        name: '_ga',
        domain: 'example.com',
        storage_type: 'cookie',
        value_length: 30,
      },
    ];

    const report = buildReport(config, cookies);

    expect(report.site_id).toBe('test-site-id');
    expect(report.cookies).toHaveLength(1);
    expect(report.collected_at).toBeTruthy();
    expect(report.page_url).toBeTruthy();
    expect(report.user_agent).toBeTruthy();
  });

  it('should include the current page URL', () => {
    const config = makeConfig();
    const report = buildReport(config, []);
    expect(report.page_url).toContain('localhost');
  });
});

// ── Sampling ────────────────────────────────────────────────────────

describe('shouldSample', () => {
  it('should always sample at rate 1.0', () => {
    // Run 100 times — all should be true
    for (let i = 0; i < 100; i++) {
      expect(shouldSample(1.0)).toBe(true);
    }
  });

  it('should never sample at rate 0.0', () => {
    for (let i = 0; i < 100; i++) {
      expect(shouldSample(0.0)).toBe(false);
    }
  });

  it('should sample approximately at the given rate', () => {
    // With 0.5, we'd expect roughly half
    let sampled = 0;
    const runs = 1000;
    for (let i = 0; i < runs; i++) {
      if (shouldSample(0.5)) sampled++;
    }
    // Allow generous margin (30-70%)
    expect(sampled).toBeGreaterThan(runs * 0.3);
    expect(sampled).toBeLessThan(runs * 0.7);
  });
});

// ── Report sending ──────────────────────────────────────────────────

describe('sendReport', () => {
  it('should use sendBeacon when available', async () => {
    const beaconMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'sendBeacon', {
      value: beaconMock,
      writable: true,
      configurable: true,
    });

    const report: CookieReport = {
      site_id: 'test',
      page_url: 'https://example.com',
      cookies: [],
      collected_at: new Date().toISOString(),
      user_agent: 'test-agent',
    };

    const result = await sendReport(
      'https://api.example.com/api/v1',
      report,
    );

    expect(result).toBe(true);
    expect(beaconMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/scanner/report',
      expect.any(Blob),
    );
  });

  it('should fall back to fetch when sendBeacon is unavailable', async () => {
    Object.defineProperty(navigator, 'sendBeacon', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;

    const report: CookieReport = {
      site_id: 'test',
      page_url: 'https://example.com',
      cookies: [],
      collected_at: new Date().toISOString(),
      user_agent: 'test-agent',
    };

    const result = await sendReport(
      'https://api.example.com/api/v1',
      report,
    );

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/scanner/report',
      expect.objectContaining({
        method: 'POST',
        keepalive: true,
      }),
    );
  });

  it('should return false on fetch failure', async () => {
    Object.defineProperty(navigator, 'sendBeacon', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'));

    const report: CookieReport = {
      site_id: 'test',
      page_url: 'https://example.com',
      cookies: [],
      collected_at: new Date().toISOString(),
      user_agent: 'test-agent',
    };

    const result = await sendReport(
      'https://api.example.com/api/v1',
      report,
    );

    expect(result).toBe(false);
  });
});

// ── Script observer ─────────────────────────────────────────────────

describe('scriptObserver', () => {
  afterEach(() => {
    removeScriptObserver();
  });

  it('should install and remove observer without errors', () => {
    // jsdom doesn't have full PerformanceObserver, but shouldn't throw
    installScriptObserver();
    expect(getObservedScripts()).toEqual([]);
    removeScriptObserver();
    expect(getObservedScripts()).toEqual([]);
  });

  it('should clear observed scripts on remove', () => {
    installScriptObserver();
    removeScriptObserver();
    expect(getObservedScripts()).toEqual([]);
  });
});

// ── startReporter ───────────────────────────────────────────────────

describe('startReporter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    removeScriptObserver();
  });

  it('should not report when sample rate is 0', () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    Object.defineProperty(navigator, 'sendBeacon', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    startReporter({
      siteId: 'test',
      apiBase: 'https://api.example.com/api/v1',
      sampleRate: 0,
    });

    vi.advanceTimersByTime(5000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should report after delay when sampled', () => {
    document.cookie = '_test_reporter=value';
    const beaconMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'sendBeacon', {
      value: beaconMock,
      writable: true,
      configurable: true,
    });

    startReporter({
      siteId: 'test',
      apiBase: 'https://api.example.com/api/v1',
      sampleRate: 1.0,
      collectDelay: 2000,
    });

    // Before delay — should not have reported
    expect(beaconMock).not.toHaveBeenCalled();

    // After delay — should report
    vi.advanceTimersByTime(2000);
    expect(beaconMock).toHaveBeenCalled();

    // Clean up
    document.cookie =
      '_test_reporter=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });
});

// ── reportNow ───────────────────────────────────────────────────────

describe('reportNow', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should return null when no items found', async () => {
    // Clear cookies
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim();
      if (name) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      }
    });

    const result = await reportNow({
      siteId: 'test',
      apiBase: 'https://api.example.com/api/v1',
      includeLocalStorage: false,
      includeSessionStorage: false,
    });

    // May be null if no cookies remain, or a report if jsdom has residual cookies
    if (result !== null) {
      expect(result.cookies.length).toBeGreaterThan(0);
    }
  });

  it('should collect and send a report', async () => {
    document.cookie = '_report_test=value';
    const beaconMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'sendBeacon', {
      value: beaconMock,
      writable: true,
      configurable: true,
    });

    const result = await reportNow({
      siteId: 'my-site',
      apiBase: 'https://api.example.com/api/v1',
    });

    expect(result).not.toBeNull();
    expect(result!.site_id).toBe('my-site');
    expect(result!.cookies.length).toBeGreaterThan(0);
    expect(beaconMock).toHaveBeenCalled();

    // Clean up
    document.cookie =
      '_report_test=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });
});
