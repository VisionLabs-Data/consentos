import type { GcmConsentType } from './types';

type GcmState = Partial<Record<GcmConsentType, 'granted' | 'denied'>>;

declare global {
  interface Window {
    dataLayer: unknown[];
  }
  function gtag(...args: unknown[]): void;
}

/** Ensure dataLayer and gtag function exist. */
function ensureGtag(): void {
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer.push(arguments);
    };
  }
}

/** Set Google Consent Mode defaults (called before any tags fire). */
export function setGcmDefaults(defaults: GcmState): void {
  ensureGtag();
  gtag('consent', 'default', {
    ...defaults,
    wait_for_update: 500,
  });
}

/** Update Google Consent Mode after user makes a choice. */
export function updateGcm(state: GcmState): void {
  ensureGtag();
  gtag('consent', 'update', state);
}

/** Build the default denied state for all consent types. */
export function buildDeniedDefaults(): GcmState {
  return {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'denied',
    personalization_storage: 'denied',
    security_storage: 'granted', // Always granted
  };
}

/** Build GCM state from accepted categories. */
export function buildGcmStateFromCategories(
  accepted: string[]
): GcmState {
  const state = buildDeniedDefaults();

  if (accepted.includes('functional')) {
    state.functionality_storage = 'granted';
    state.personalization_storage = 'granted';
  }
  if (accepted.includes('analytics')) {
    state.analytics_storage = 'granted';
  }
  if (accepted.includes('marketing')) {
    state.ad_storage = 'granted';
    state.ad_user_data = 'granted';
    state.ad_personalization = 'granted';
  }
  if (accepted.includes('personalisation')) {
    state.personalization_storage = 'granted';
  }

  return state;
}
