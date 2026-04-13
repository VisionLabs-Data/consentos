/**
 * Tests for the GPP CMP API (__gpp() global function).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  installGppApi,
  removeGppApi,
  updateGppConsent,
  setGppDisplayStatus,
  setGppSignalStatus,
  getGppString,
  isGppApiInstalled,
  type GppPingReturn,
  type GppData,
  type GppEventData,
  type GppApiCallback,
} from '../gpp-api';
import {
  type GppString,
  createDefaultSectionData,
  US_NATIONAL,
  US_CALIFORNIA,
  SECTION_REGISTRY,
} from '../gpp';

// Section IDs (US_NATIONAL and US_CALIFORNIA are SectionDef objects, not numbers)
const US_NATIONAL_ID = US_NATIONAL.id; // 7
const US_CALIFORNIA_ID = US_CALIFORNIA.id; // 8

// ── Helpers ───────────────────────────────────────────────────────────

/** Call __gpp and return the callback args as a promise. */
function callGpp(
  command: string,
  parameter?: unknown,
): Promise<{ data: unknown; success: boolean }> {
  return new Promise((resolve) => {
    window.__gpp!(command, (data: unknown, success: boolean) => {
      resolve({ data, success });
    }, parameter);
  });
}

/** Build a minimal GppString for testing. */
function buildTestGpp(sectionIds: number[] = [US_NATIONAL_ID]): GppString {
  const sections = new Map<number, { data: Record<string, number | number[]> }>();
  for (const id of sectionIds) {
    const def = SECTION_REGISTRY.get(id);
    if (def) {
      const data = createDefaultSectionData(def);
      sections.set(id, { data });
    }
  }
  return {
    header: {
      version: 1,
      sectionIds,
      applicableSections: sectionIds,
    },
    sections,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('GPP CMP API', () => {
  beforeEach(() => {
    removeGppApi();
  });

  afterEach(() => {
    removeGppApi();
  });

  // ── Installation ──────────────────────────────────────────────────

  describe('installGppApi / removeGppApi', () => {
    it('installs __gpp on window', () => {
      expect(window.__gpp).toBeUndefined();
      installGppApi(42, ['usnat']);
      expect(typeof window.__gpp).toBe('function');
      expect(isGppApiInstalled()).toBe(true);
    });

    it('removes __gpp from window', () => {
      installGppApi(42);
      removeGppApi();
      expect(window.__gpp).toBeUndefined();
      expect(isGppApiInstalled()).toBe(false);
    });

    it('clears __gppQueue on remove', () => {
      (window as { __gppQueue?: unknown[] }).__gppQueue = [['ping', vi.fn()]];
      installGppApi(42);
      removeGppApi();
      expect((window as { __gppQueue?: unknown[] }).__gppQueue).toBeUndefined();
    });
  });

  // ── ping command ──────────────────────────────────────────────────

  describe('ping command', () => {
    it('returns CMP metadata', async () => {
      installGppApi(42, ['usnat', 'usca']);
      const { data, success } = await callGpp('ping');
      expect(success).toBe(true);

      const ping = data as GppPingReturn;
      expect(ping.gppVersion).toBe('1.1');
      expect(ping.cmpStatus).toBe('loaded');
      expect(ping.cmpDisplayStatus).toBe('hidden');
      expect(ping.signalStatus).toBe('not ready');
      expect(ping.supportedAPIs).toEqual(['usnat', 'usca']);
      expect(ping.cmpId).toBe(42);
      expect(ping.gppString).toBe('');
      expect(ping.applicableSections).toEqual([]);
    });

    it('reflects updated display status', async () => {
      installGppApi(1);
      setGppDisplayStatus('visible');
      const { data } = await callGpp('ping');
      expect((data as GppPingReturn).cmpDisplayStatus).toBe('visible');
    });

    it('reflects updated signal status', async () => {
      installGppApi(1);
      setGppSignalStatus('ready');
      const { data } = await callGpp('ping');
      expect((data as GppPingReturn).signalStatus).toBe('ready');
    });

    it('includes GPP string after consent update', async () => {
      installGppApi(1, ['usnat']);
      const gpp = buildTestGpp();
      const encoded = updateGppConsent(gpp);
      expect(encoded).toBeTruthy();

      const { data } = await callGpp('ping');
      expect((data as GppPingReturn).gppString).toBe(encoded);
      expect((data as GppPingReturn).applicableSections).toEqual([US_NATIONAL_ID]);
    });
  });

  // ── getGPPData command ────────────────────────────────────────────

  describe('getGPPData command', () => {
    it('returns empty data before consent', async () => {
      installGppApi(1);
      const { data, success } = await callGpp('getGPPData');
      expect(success).toBe(true);

      const gppData = data as GppData;
      expect(gppData.gppString).toBe('');
      expect(gppData.applicableSections).toEqual([]);
      expect(gppData.parsedSections).toEqual({});
    });

    it('returns populated data after consent update', async () => {
      installGppApi(1, ['usnat']);
      const gpp = buildTestGpp();
      updateGppConsent(gpp);

      const { data } = await callGpp('getGPPData');
      const gppData = data as GppData;
      expect(gppData.gppString).toBeTruthy();
      expect(gppData.applicableSections).toEqual([US_NATIONAL_ID]);
      expect(gppData.parsedSections[US_NATIONAL_ID]).toBeDefined();
    });
  });

  // ── getSection command ────────────────────────────────────────────

  describe('getSection command', () => {
    it('returns null for missing prefix', async () => {
      installGppApi(1);
      const { data, success } = await callGpp('getSection', 'usnat');
      expect(success).toBe(false);
      expect(data).toBeNull();
    });

    it('returns null when no parameter given', async () => {
      installGppApi(1);
      const { data, success } = await callGpp('getSection');
      expect(success).toBe(false);
      expect(data).toBeNull();
    });

    it('returns section data by API prefix', async () => {
      installGppApi(1, ['usnat']);
      const gpp = buildTestGpp();
      updateGppConsent(gpp);

      const { data, success } = await callGpp('getSection', 'usnat');
      expect(success).toBe(true);
      expect(data).toBeDefined();
      expect((data as Record<string, unknown>).Version).toBeDefined();
    });

    it('returns null for unregistered prefix', async () => {
      installGppApi(1);
      updateGppConsent(buildTestGpp());

      const { data, success } = await callGpp('getSection', 'nonexistent');
      expect(success).toBe(false);
      expect(data).toBeNull();
    });
  });

  // ── hasSection command ────────────────────────────────────────────

  describe('hasSection command', () => {
    it('returns false when section not present', async () => {
      installGppApi(1);
      const { data, success } = await callGpp('hasSection', 'usnat');
      expect(success).toBe(true);
      expect(data).toBe(false);
    });

    it('returns true when section present', async () => {
      installGppApi(1, ['usnat']);
      updateGppConsent(buildTestGpp());

      const { data, success } = await callGpp('hasSection', 'usnat');
      expect(success).toBe(true);
      expect(data).toBe(true);
    });

    it('returns false for empty parameter', async () => {
      installGppApi(1);
      const { data, success } = await callGpp('hasSection');
      expect(success).toBe(true);
      expect(data).toBe(false);
    });
  });

  // ── addEventListener / removeEventListener ────────────────────────

  describe('addEventListener', () => {
    it('registers a listener and fires immediately', async () => {
      installGppApi(1, ['usnat']);

      const { data, success } = await callGpp('addEventListener');
      expect(success).toBe(true);

      const event = data as GppEventData;
      expect(event.eventName).toBe('listenerRegistered');
      expect(event.listenerId).toBe(1);
      expect(event.pingData.cmpStatus).toBe('loaded');
    });

    it('assigns unique listener IDs', async () => {
      installGppApi(1);

      const { data: d1 } = await callGpp('addEventListener');
      const { data: d2 } = await callGpp('addEventListener');

      expect((d1 as GppEventData).listenerId).toBe(1);
      expect((d2 as GppEventData).listenerId).toBe(2);
    });

    it('notifies listeners on consent update', () => {
      installGppApi(1, ['usnat']);

      const events: GppEventData[] = [];
      window.__gpp!('addEventListener', (data: unknown) => {
        events.push(data as GppEventData);
      });

      // First event is listenerRegistered
      expect(events).toHaveLength(1);
      expect(events[0].eventName).toBe('listenerRegistered');

      // Update consent — should fire signalStatus event
      updateGppConsent(buildTestGpp());

      expect(events).toHaveLength(2);
      expect(events[1].eventName).toBe('signalStatus');
      expect(events[1].data).toBeDefined();
      expect((events[1].data as GppData).gppString).toBeTruthy();
    });

    it('swallows errors thrown by listeners', () => {
      installGppApi(1);

      const throwingCallback: GppApiCallback = () => {
        throw new Error('Listener error');
      };

      // Should not throw
      expect(() => {
        window.__gpp!('addEventListener', throwingCallback);
      }).not.toThrow();

      // Should not throw during consent update either
      expect(() => {
        updateGppConsent(buildTestGpp());
      }).not.toThrow();
    });
  });

  describe('removeEventListener', () => {
    it('removes an existing listener', async () => {
      installGppApi(1);

      // Add listener
      const { data } = await callGpp('addEventListener');
      const listenerId = (data as GppEventData).listenerId;

      // Remove it
      const { data: removed, success } = await callGpp('removeEventListener', listenerId);
      expect(success).toBe(true);
      expect(removed).toBe(true);
    });

    it('returns false for non-existent listener', async () => {
      installGppApi(1);
      const { data, success } = await callGpp('removeEventListener', 999);
      expect(success).toBe(false);
      expect(data).toBe(false);
    });

    it('stops notifications after removal', () => {
      installGppApi(1, ['usnat']);

      const events: GppEventData[] = [];
      let listenerId: number;

      window.__gpp!('addEventListener', (data: unknown) => {
        const event = data as GppEventData;
        events.push(event);
        listenerId = event.listenerId;
      });

      // Remove the listener
      window.__gpp!('removeEventListener', (_d: unknown, _s: boolean) => {}, listenerId!);

      // Update consent — should NOT fire to removed listener
      const eventsBefore = events.length;
      updateGppConsent(buildTestGpp());

      expect(events.length).toBe(eventsBefore);
    });
  });

  // ── Unknown commands ──────────────────────────────────────────────

  describe('unknown commands', () => {
    it('returns false for unknown commands', async () => {
      installGppApi(1);
      const { data, success } = await callGpp('unknownCommand');
      expect(success).toBe(false);
      expect(data).toBe(false);
    });
  });

  // ── Uninitialised state ───────────────────────────────────────────

  describe('uninitialised state', () => {
    it('returns false when API not installed', () => {
      // Manually set __gpp to the handler without initialising state
      // by calling removeGppApi first to clear state, then manually assigning
      removeGppApi();

      // Directly import and call the handler — simulate calling before install
      let callbackData: unknown;
      let callbackSuccess: boolean | undefined;

      // We can't call __gpp because it's removed, but we can test via getGppString
      expect(getGppString()).toBe('');
      expect(isGppApiInstalled()).toBe(false);
    });
  });

  // ── updateGppConsent ──────────────────────────────────────────────

  describe('updateGppConsent', () => {
    it('returns the encoded GPP string', () => {
      installGppApi(1, ['usnat']);
      const gpp = buildTestGpp();
      const result = updateGppConsent(gpp);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      // GPP strings start with 'D' (header prefix)
      expect(result.startsWith('D')).toBe(true);
    });

    it('updates the gppString accessible via getGppString', () => {
      installGppApi(1);
      expect(getGppString()).toBe('');

      updateGppConsent(buildTestGpp());
      expect(getGppString()).toBeTruthy();
    });

    it('sets signalStatus to ready', async () => {
      installGppApi(1);
      updateGppConsent(buildTestGpp());

      const { data } = await callGpp('ping');
      expect((data as GppPingReturn).signalStatus).toBe('ready');
    });

    it('works with multiple sections', () => {
      installGppApi(1, ['usnat', 'usca']);
      const gpp = buildTestGpp([US_NATIONAL_ID, US_CALIFORNIA_ID]);
      const result = updateGppConsent(gpp);
      expect(result).toBeTruthy();

      // Should contain ~ separator for sections
      expect(result).toContain('~');
    });
  });

  // ── Queue processing ──────────────────────────────────────────────

  describe('queue processing', () => {
    it('processes queued calls on install', () => {
      // Set up a queue before installing
      const results: Array<{ data: unknown; success: boolean }> = [];
      const cb = (data: unknown, success: boolean) => {
        results.push({ data, success });
      };

      (window as { __gppQueue?: unknown[] }).__gppQueue = [
        ['ping', cb],
      ];

      installGppApi(1, ['usnat']);

      // The queued ping should have been processed
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect((results[0].data as GppPingReturn).cmpStatus).toBe('loaded');
    });

    it('clears the queue after processing', () => {
      (window as { __gppQueue?: unknown[] }).__gppQueue = [
        ['ping', vi.fn()],
      ];

      installGppApi(1);

      expect((window as { __gppQueue?: unknown[] }).__gppQueue).toEqual([]);
    });
  });

  // ── Coexistence with __tcfapi ─────────────────────────────────────

  describe('coexistence', () => {
    it('does not interfere with other window globals', () => {
      // Set a mock __tcfapi
      const mockTcf = vi.fn();
      (window as { __tcfapi?: unknown }).__tcfapi = mockTcf;

      installGppApi(1);

      // __tcfapi should still be intact
      expect((window as { __tcfapi?: unknown }).__tcfapi).toBe(mockTcf);

      removeGppApi();

      // __tcfapi should still be intact after removal
      expect((window as { __tcfapi?: unknown }).__tcfapi).toBe(mockTcf);

      // Clean up
      delete (window as { __tcfapi?: unknown }).__tcfapi;
    });
  });

  // ── setGppDisplayStatus / setGppSignalStatus ──────────────────────

  describe('status setters', () => {
    it('setGppDisplayStatus updates display status', async () => {
      installGppApi(1);
      setGppDisplayStatus('visible');

      const { data } = await callGpp('ping');
      expect((data as GppPingReturn).cmpDisplayStatus).toBe('visible');

      setGppDisplayStatus('disabled');
      const { data: d2 } = await callGpp('ping');
      expect((d2 as GppPingReturn).cmpDisplayStatus).toBe('disabled');
    });

    it('setGppSignalStatus updates signal status', async () => {
      installGppApi(1);
      setGppSignalStatus('ready');

      const { data } = await callGpp('ping');
      expect((data as GppPingReturn).signalStatus).toBe('ready');
    });

    it('no-ops when API not installed', () => {
      // Should not throw
      expect(() => setGppDisplayStatus('visible')).not.toThrow();
      expect(() => setGppSignalStatus('ready')).not.toThrow();
    });
  });
});
