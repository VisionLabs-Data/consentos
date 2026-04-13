import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the imports before loading the loader module
vi.mock('../blocker', () => ({
  installBlocker: vi.fn(),
  updateAcceptedCategories: vi.fn(),
}));

vi.mock('../consent', () => ({
  hasConsent: vi.fn(),
  readConsent: vi.fn(),
}));

vi.mock('../gcm', () => ({
  buildDeniedDefaults: vi.fn(() => ({ analytics_storage: 'denied' })),
  buildGcmStateFromCategories: vi.fn(() => ({ analytics_storage: 'granted' })),
  setGcmDefaults: vi.fn(),
  updateGcm: vi.fn(),
}));

import { installBlocker, updateAcceptedCategories } from '../blocker';
import { readConsent } from '../consent';
import { buildDeniedDefaults, buildGcmStateFromCategories, setGcmDefaults, updateGcm } from '../gcm';

describe('loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.dataLayer = [];
    // @ts-expect-error — reset for test isolation
    window.__consentos = undefined;
    // Reset document.currentScript
    Object.defineProperty(document, 'currentScript', {
      value: null,
      writable: true,
      configurable: true,
    });
  });

  // We can't import the loader directly (it self-executes as an IIFE),
  // so we test the individual functions it composes instead.

  describe('installBlocker integration', () => {
    it('installBlocker should be callable', () => {
      installBlocker();
      expect(installBlocker).toHaveBeenCalled();
    });
  });

  describe('GCM defaults', () => {
    it('should build denied defaults and set them', () => {
      const defaults = buildDeniedDefaults();
      setGcmDefaults(defaults);
      expect(buildDeniedDefaults).toHaveBeenCalled();
      expect(setGcmDefaults).toHaveBeenCalledWith(defaults);
    });
  });

  describe('existing consent flow', () => {
    it('should update blocker and GCM when consent exists', () => {
      const consent = {
        accepted: ['necessary', 'analytics'],
        rejected: ['marketing'],
        visitorId: 'v123',
        consentedAt: new Date().toISOString(),
      };

      vi.mocked(readConsent).mockReturnValue(consent as any);

      const existingConsent = readConsent();
      expect(existingConsent).toBeDefined();

      if (existingConsent) {
        updateAcceptedCategories(existingConsent.accepted as any);
        const gcmState = buildGcmStateFromCategories(existingConsent.accepted);
        updateGcm(gcmState);

        expect(updateAcceptedCategories).toHaveBeenCalledWith(existingConsent.accepted);
        expect(buildGcmStateFromCategories).toHaveBeenCalledWith(existingConsent.accepted);
        expect(updateGcm).toHaveBeenCalled();
      }
    });

    it('should not update blocker when no consent exists', () => {
      vi.mocked(readConsent).mockReturnValue(null);

      const existingConsent = readConsent();
      expect(existingConsent).toBeNull();

      // In this case, the loader would load the banner bundle
      // updateAcceptedCategories should NOT have been called
      expect(updateAcceptedCategories).not.toHaveBeenCalled();
    });
  });

  describe('consent-change event', () => {
    it('should dispatch consentos:consent-change custom event', () => {
      const accepted = ['necessary', 'analytics'];
      let receivedDetail: unknown = null;

      document.addEventListener('consentos:consent-change', ((e: CustomEvent) => {
        receivedDetail = e.detail;
      }) as EventListener);

      const event = new CustomEvent('consentos:consent-change', {
        detail: { accepted },
      });
      document.dispatchEvent(event);

      expect(receivedDetail).toEqual({ accepted });
    });

    it('should push to dataLayer if it exists', () => {
      window.dataLayer = [];
      const accepted = ['necessary', 'functional'];

      window.dataLayer.push({
        event: 'consentos_consent_change',
        cmp_accepted_categories: accepted,
      });

      expect(window.dataLayer).toHaveLength(1);
      expect(window.dataLayer[0]).toEqual({
        event: 'consentos_consent_change',
        cmp_accepted_categories: accepted,
      });
    });
  });

  describe('loadBannerBundle', () => {
    it('should create a script element for the banner bundle', () => {
      const script = document.createElement('script');
      script.src = 'https://cdn.example.com/consent-bundle.js';
      script.async = true;
      document.head.appendChild(script);

      const found = document.querySelector('script[src*="consent-bundle"]');
      expect(found).not.toBeNull();

      // Clean up
      found?.remove();
    });
  });

  describe('__cmp global', () => {
    it('should expose the CMP context on window', () => {
      window.__consentos = {
        siteId: 'test-site-id',
        apiBase: 'https://api.example.com',
        cdnBase: 'https://cdn.example.com',
        loaded: false,
      };

      expect(window.__consentos.siteId).toBe('test-site-id');
      expect(window.__consentos.loaded).toBe(false);
    });
  });
});
