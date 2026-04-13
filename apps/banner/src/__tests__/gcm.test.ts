import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildDeniedDefaults,
  buildGcmStateFromCategories,
  setGcmDefaults,
  updateGcm,
} from '../gcm';

describe('gcm', () => {
  beforeEach(() => {
    // Reset dataLayer and gtag before each test
    window.dataLayer = [];
    // @ts-expect-error — resetting gtag for test isolation
    window.gtag = undefined;
  });

  describe('buildDeniedDefaults', () => {
    it('should deny all except security_storage', () => {
      const defaults = buildDeniedDefaults();
      expect(defaults.ad_storage).toBe('denied');
      expect(defaults.ad_user_data).toBe('denied');
      expect(defaults.ad_personalization).toBe('denied');
      expect(defaults.analytics_storage).toBe('denied');
      expect(defaults.functionality_storage).toBe('denied');
      expect(defaults.personalization_storage).toBe('denied');
      expect(defaults.security_storage).toBe('granted');
    });

    it('should return all 7 consent types', () => {
      const defaults = buildDeniedDefaults();
      const keys = Object.keys(defaults);
      expect(keys).toHaveLength(7);
    });
  });

  describe('buildGcmStateFromCategories', () => {
    it('should grant analytics_storage for analytics category', () => {
      const state = buildGcmStateFromCategories(['necessary', 'analytics']);
      expect(state.analytics_storage).toBe('granted');
      expect(state.ad_storage).toBe('denied');
    });

    it('should grant ad types for marketing category', () => {
      const state = buildGcmStateFromCategories(['necessary', 'marketing']);
      expect(state.ad_storage).toBe('granted');
      expect(state.ad_user_data).toBe('granted');
      expect(state.ad_personalization).toBe('granted');
      expect(state.analytics_storage).toBe('denied');
    });

    it('should grant functionality for functional category', () => {
      const state = buildGcmStateFromCategories(['necessary', 'functional']);
      expect(state.functionality_storage).toBe('granted');
      expect(state.personalization_storage).toBe('granted');
    });

    it('should grant personalization_storage for personalisation category', () => {
      const state = buildGcmStateFromCategories(['necessary', 'personalisation']);
      expect(state.personalization_storage).toBe('granted');
      expect(state.functionality_storage).toBe('denied');
    });

    it('should grant all for all categories', () => {
      const state = buildGcmStateFromCategories([
        'necessary', 'functional', 'analytics', 'marketing', 'personalisation',
      ]);
      expect(state.analytics_storage).toBe('granted');
      expect(state.ad_storage).toBe('granted');
      expect(state.ad_user_data).toBe('granted');
      expect(state.ad_personalization).toBe('granted');
      expect(state.functionality_storage).toBe('granted');
      expect(state.personalization_storage).toBe('granted');
      expect(state.security_storage).toBe('granted');
    });

    it('should deny all for only necessary', () => {
      const state = buildGcmStateFromCategories(['necessary']);
      expect(state.analytics_storage).toBe('denied');
      expect(state.ad_storage).toBe('denied');
      expect(state.functionality_storage).toBe('denied');
      expect(state.security_storage).toBe('granted');
    });

    it('should handle empty array', () => {
      const state = buildGcmStateFromCategories([]);
      expect(state.analytics_storage).toBe('denied');
      expect(state.ad_storage).toBe('denied');
      expect(state.security_storage).toBe('granted');
    });
  });

  describe('setGcmDefaults', () => {
    it('should create dataLayer if it does not exist', () => {
      // @ts-expect-error — simulating no dataLayer
      delete window.dataLayer;
      setGcmDefaults(buildDeniedDefaults());
      expect(window.dataLayer).toBeDefined();
      expect(Array.isArray(window.dataLayer)).toBe(true);
    });

    it('should push consent default command to dataLayer', () => {
      setGcmDefaults(buildDeniedDefaults());
      // The gtag function pushes arguments objects to dataLayer
      expect(window.dataLayer.length).toBeGreaterThan(0);
    });

    it('should create gtag function if not present', () => {
      setGcmDefaults(buildDeniedDefaults());
      expect(typeof window.gtag).toBe('function');
    });

    it('should include wait_for_update parameter', () => {
      setGcmDefaults(buildDeniedDefaults());
      // The first entry should be the consent default call
      // gtag pushes `arguments` objects; check the dataLayer
      const entry = window.dataLayer[0] as { [key: number]: unknown };
      // Arguments object: [0]='consent', [1]='default', [2]={...}
      expect(entry[0]).toBe('consent');
      expect(entry[1]).toBe('default');
      const consentObj = entry[2] as Record<string, unknown>;
      expect(consentObj.wait_for_update).toBe(500);
    });
  });

  describe('updateGcm', () => {
    it('should push consent update command to dataLayer', () => {
      // Initialise gtag first
      setGcmDefaults(buildDeniedDefaults());
      const lengthBefore = window.dataLayer.length;

      updateGcm({ analytics_storage: 'granted' });

      expect(window.dataLayer.length).toBe(lengthBefore + 1);
      const entry = window.dataLayer[window.dataLayer.length - 1] as { [key: number]: unknown };
      expect(entry[0]).toBe('consent');
      expect(entry[1]).toBe('update');
    });

    it('should work without prior setGcmDefaults call', () => {
      updateGcm({ ad_storage: 'granted' });
      expect(window.dataLayer.length).toBeGreaterThan(0);
    });

    it('should pass the state object correctly', () => {
      setGcmDefaults(buildDeniedDefaults());
      const state = { analytics_storage: 'granted' as const, ad_storage: 'denied' as const };
      updateGcm(state);

      const entry = window.dataLayer[window.dataLayer.length - 1] as { [key: number]: unknown };
      const consentObj = entry[2] as Record<string, string>;
      expect(consentObj.analytics_storage).toBe('granted');
      expect(consentObj.ad_storage).toBe('denied');
    });
  });
});
