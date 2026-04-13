/**
 * Tests for GPC signal detection and jurisdiction-aware auto-opt-out.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  type GpcConfig,
  type GpcResult,
  isGpcEnabled,
  shouldHonourGpc,
  evaluateGpc,
  DEFAULT_GPC_JURISDICTIONS,
  GPC_OPTOUT_CATEGORIES,
  GPC_ACCEPTED_CATEGORIES,
} from '../gpc';

// ── Helpers ───────────────────────────────────────────────────────────

function makeGpcConfig(overrides: Partial<GpcConfig> = {}): GpcConfig {
  return {
    gpc_enabled: true,
    gpc_jurisdictions: [],
    gpc_global_honour: false,
    ...overrides,
  };
}

/** Set or clear the GPC signal on navigator. */
function setGpc(value: boolean | undefined): void {
  if (value === undefined) {
    delete (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl;
  } else {
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      value,
      writable: true,
      configurable: true,
    });
  }
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('GPC Signal Detection', () => {
  afterEach(() => {
    setGpc(undefined);
  });

  // ── isGpcEnabled ──────────────────────────────────────────────────

  describe('isGpcEnabled', () => {
    it('returns true when navigator.globalPrivacyControl is true', () => {
      setGpc(true);
      expect(isGpcEnabled()).toBe(true);
    });

    it('returns false when navigator.globalPrivacyControl is false', () => {
      setGpc(false);
      expect(isGpcEnabled()).toBe(false);
    });

    it('returns false when navigator.globalPrivacyControl is undefined', () => {
      setGpc(undefined);
      expect(isGpcEnabled()).toBe(false);
    });
  });

  // ── shouldHonourGpc ───────────────────────────────────────────────

  describe('shouldHonourGpc', () => {
    it('returns false when gpc_enabled is false', () => {
      const config = makeGpcConfig({ gpc_enabled: false });
      expect(shouldHonourGpc('US-CA', config)).toBe(false);
    });

    it('returns true when gpc_global_honour is true regardless of region', () => {
      const config = makeGpcConfig({ gpc_global_honour: true });
      expect(shouldHonourGpc('DE', config)).toBe(true);
      expect(shouldHonourGpc(null, config)).toBe(true);
    });

    it('returns true for default jurisdiction US-CA', () => {
      const config = makeGpcConfig();
      expect(shouldHonourGpc('US-CA', config)).toBe(true);
    });

    it('returns true for default jurisdiction US-CO', () => {
      const config = makeGpcConfig();
      expect(shouldHonourGpc('US-CO', config)).toBe(true);
    });

    it('returns true for default jurisdiction US-CT', () => {
      const config = makeGpcConfig();
      expect(shouldHonourGpc('US-CT', config)).toBe(true);
    });

    it('returns true for default jurisdiction US-TX', () => {
      const config = makeGpcConfig();
      expect(shouldHonourGpc('US-TX', config)).toBe(true);
    });

    it('returns true for default jurisdiction US-MT', () => {
      const config = makeGpcConfig();
      expect(shouldHonourGpc('US-MT', config)).toBe(true);
    });

    it('returns false for non-GPC jurisdiction', () => {
      const config = makeGpcConfig();
      expect(shouldHonourGpc('US-NY', config)).toBe(false);
    });

    it('returns false for null region', () => {
      const config = makeGpcConfig();
      expect(shouldHonourGpc(null, config)).toBe(false);
    });

    it('uses custom jurisdictions when provided', () => {
      const config = makeGpcConfig({
        gpc_jurisdictions: ['GB', 'DE'],
      });
      expect(shouldHonourGpc('GB', config)).toBe(true);
      expect(shouldHonourGpc('DE', config)).toBe(true);
      expect(shouldHonourGpc('US-CA', config)).toBe(false);
    });
  });

  // ── evaluateGpc ───────────────────────────────────────────────────

  describe('evaluateGpc', () => {
    it('returns detected=false when GPC is not set', () => {
      setGpc(undefined);
      const config = makeGpcConfig();
      const result = evaluateGpc(config, 'US-CA');

      expect(result.detected).toBe(false);
      expect(result.honoured).toBe(false);
    });

    it('returns detected=true, honoured=true in California', () => {
      setGpc(true);
      const config = makeGpcConfig();
      const result = evaluateGpc(config, 'US-CA');

      expect(result.detected).toBe(true);
      expect(result.honoured).toBe(true);
      expect(result.region).toBe('US-CA');
    });

    it('returns detected=true, honoured=false in non-GPC state', () => {
      setGpc(true);
      const config = makeGpcConfig();
      const result = evaluateGpc(config, 'US-NY');

      expect(result.detected).toBe(true);
      expect(result.honoured).toBe(false);
    });

    it('returns detected=true, honoured=false when gpc_enabled is false', () => {
      setGpc(true);
      const config = makeGpcConfig({ gpc_enabled: false });
      const result = evaluateGpc(config, 'US-CA');

      expect(result.detected).toBe(true);
      expect(result.honoured).toBe(false);
    });

    it('returns honoured=true with gpc_global_honour regardless of region', () => {
      setGpc(true);
      const config = makeGpcConfig({ gpc_global_honour: true });
      const result = evaluateGpc(config, 'FR');

      expect(result.detected).toBe(true);
      expect(result.honoured).toBe(true);
    });

    it('passes null region through', () => {
      setGpc(true);
      const config = makeGpcConfig();
      const result = evaluateGpc(config, null);

      expect(result.region).toBeNull();
      expect(result.honoured).toBe(false);
    });

    it('defaults region to null when not provided', () => {
      setGpc(true);
      const config = makeGpcConfig({ gpc_global_honour: true });
      const result = evaluateGpc(config);

      expect(result.region).toBeNull();
      expect(result.honoured).toBe(true);
    });
  });

  // ── Constants ─────────────────────────────────────────────────────

  describe('constants', () => {
    it('DEFAULT_GPC_JURISDICTIONS includes all five required states', () => {
      expect(DEFAULT_GPC_JURISDICTIONS).toContain('US-CA');
      expect(DEFAULT_GPC_JURISDICTIONS).toContain('US-CO');
      expect(DEFAULT_GPC_JURISDICTIONS).toContain('US-CT');
      expect(DEFAULT_GPC_JURISDICTIONS).toContain('US-TX');
      expect(DEFAULT_GPC_JURISDICTIONS).toContain('US-MT');
      expect(DEFAULT_GPC_JURISDICTIONS).toHaveLength(5);
    });

    it('GPC_OPTOUT_CATEGORIES includes marketing and personalisation', () => {
      expect(GPC_OPTOUT_CATEGORIES).toContain('marketing');
      expect(GPC_OPTOUT_CATEGORIES).toContain('personalisation');
    });

    it('GPC_ACCEPTED_CATEGORIES includes necessary, functional, analytics', () => {
      expect(GPC_ACCEPTED_CATEGORIES).toContain('necessary');
      expect(GPC_ACCEPTED_CATEGORIES).toContain('functional');
      expect(GPC_ACCEPTED_CATEGORIES).toContain('analytics');
    });

    it('GPC opt-out and accepted categories cover all categories', () => {
      const all = [...GPC_ACCEPTED_CATEGORIES, ...GPC_OPTOUT_CATEGORIES];
      expect(all).toContain('necessary');
      expect(all).toContain('functional');
      expect(all).toContain('analytics');
      expect(all).toContain('marketing');
      expect(all).toContain('personalisation');
    });
  });
});
