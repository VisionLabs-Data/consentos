/**
 * Shopify Customer Privacy API integration.
 *
 * Bridges CMP consent decisions to Shopify's Customer Privacy API
 * (`window.Shopify.customerPrivacy`). When enabled, the CMP calls
 * `setTrackingConsent()` with the mapped consent state whenever
 * the visitor makes a consent choice.
 *
 * @see https://shopify.dev/docs/api/customer-privacy
 */

import type { CategorySlug } from './types';

/** Shopify consent values: empty = unknown, 'yes' = granted, 'no' = denied. */
type ShopifyConsent = '' | 'yes' | 'no';

/** The consent object Shopify expects. */
export interface ShopifyTrackingConsent {
  analytics: ShopifyConsent;
  marketing: ShopifyConsent;
  preferences: ShopifyConsent;
  sale_of_data: ShopifyConsent;
}

/** Shape of window.Shopify.customerPrivacy when loaded. */
interface ShopifyCustomerPrivacy {
  setTrackingConsent: (consent: ShopifyTrackingConsent, callback?: () => void) => void;
  currentVisitorConsent: () => ShopifyTrackingConsent;
  analyticsProcessingAllowed: () => boolean;
  marketingAllowed: () => boolean;
  preferencesProcessingAllowed: () => boolean;
  saleOfDataAllowed: () => boolean;
  getRegion: () => string;
}

declare global {
  interface Window {
    Shopify?: {
      customerPrivacy?: ShopifyCustomerPrivacy;
      loadFeatures?: (
        features: Array<{ name: string; version: string }>,
        callback: (error?: Error) => void,
      ) => void;
    };
  }
}

/** Check whether the Shopify Customer Privacy API is available. */
export function isShopifyPrivacyAvailable(): boolean {
  return typeof window.Shopify?.customerPrivacy?.setTrackingConsent === 'function';
}

/**
 * Map CMP accepted categories to Shopify consent signals.
 *
 * Category mapping:
 *   functional    → preferences
 *   analytics     → analytics
 *   marketing     → marketing + sale_of_data
 *   personalisation → sale_of_data (if marketing not already accepted)
 */
export function buildShopifyConsent(accepted: CategorySlug[]): ShopifyTrackingConsent {
  return {
    preferences: accepted.includes('functional') ? 'yes' : 'no',
    analytics: accepted.includes('analytics') ? 'yes' : 'no',
    marketing: accepted.includes('marketing') ? 'yes' : 'no',
    sale_of_data:
      accepted.includes('marketing') || accepted.includes('personalisation') ? 'yes' : 'no',
  };
}

/**
 * Push consent state to the Shopify Customer Privacy API.
 *
 * This should be called after the user makes a consent choice, only
 * when `shopify_privacy_enabled` is true in the site config.
 *
 * If the API is not yet loaded, the call is silently skipped — Shopify's
 * own consent tracking will pick up the state on next page load.
 */
export function updateShopifyConsent(accepted: CategorySlug[]): void {
  if (!isShopifyPrivacyAvailable()) return;

  const consent = buildShopifyConsent(accepted);
  window.Shopify!.customerPrivacy!.setTrackingConsent(consent, () => {
    /* Consent registered with Shopify */
  });
}
