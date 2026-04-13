import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildShopifyConsent, isShopifyPrivacyAvailable, updateShopifyConsent } from '../shopify';
import type { CategorySlug } from '../types';

describe('shopify', () => {
  const mockSetTrackingConsent = vi.fn();
  const mockCurrentVisitorConsent = vi.fn();

  beforeEach(() => {
    (window as any).Shopify = {
      customerPrivacy: {
        setTrackingConsent: mockSetTrackingConsent,
        currentVisitorConsent: mockCurrentVisitorConsent,
        analyticsProcessingAllowed: () => false,
        marketingAllowed: () => false,
        preferencesProcessingAllowed: () => false,
        saleOfDataAllowed: () => false,
        getRegion: () => 'CA',
      },
    };
  });

  afterEach(() => {
    delete (window as any).Shopify;
    vi.restoreAllMocks();
  });

  describe('isShopifyPrivacyAvailable', () => {
    it('returns true when Shopify API is present', () => {
      expect(isShopifyPrivacyAvailable()).toBe(true);
    });

    it('returns false when Shopify is not on window', () => {
      delete (window as any).Shopify;
      expect(isShopifyPrivacyAvailable()).toBe(false);
    });

    it('returns false when customerPrivacy is missing', () => {
      (window as any).Shopify = {};
      expect(isShopifyPrivacyAvailable()).toBe(false);
    });
  });

  describe('buildShopifyConsent', () => {
    it('maps accept all to all yes', () => {
      const accepted: CategorySlug[] = ['necessary', 'functional', 'analytics', 'marketing', 'personalisation'];
      const result = buildShopifyConsent(accepted);
      expect(result).toEqual({
        preferences: 'yes',
        analytics: 'yes',
        marketing: 'yes',
        sale_of_data: 'yes',
      });
    });

    it('maps reject all (necessary only) to all no', () => {
      const accepted: CategorySlug[] = ['necessary'];
      const result = buildShopifyConsent(accepted);
      expect(result).toEqual({
        preferences: 'no',
        analytics: 'no',
        marketing: 'no',
        sale_of_data: 'no',
      });
    });

    it('maps functional to preferences', () => {
      const accepted: CategorySlug[] = ['necessary', 'functional'];
      const result = buildShopifyConsent(accepted);
      expect(result.preferences).toBe('yes');
      expect(result.analytics).toBe('no');
      expect(result.marketing).toBe('no');
    });

    it('maps personalisation to sale_of_data', () => {
      const accepted: CategorySlug[] = ['necessary', 'personalisation'];
      const result = buildShopifyConsent(accepted);
      expect(result.sale_of_data).toBe('yes');
      expect(result.marketing).toBe('no');
    });

    it('maps marketing to both marketing and sale_of_data', () => {
      const accepted: CategorySlug[] = ['necessary', 'marketing'];
      const result = buildShopifyConsent(accepted);
      expect(result.marketing).toBe('yes');
      expect(result.sale_of_data).toBe('yes');
    });
  });

  describe('updateShopifyConsent', () => {
    it('calls setTrackingConsent with mapped values', () => {
      const accepted: CategorySlug[] = ['necessary', 'analytics', 'marketing'];
      updateShopifyConsent(accepted);

      expect(mockSetTrackingConsent).toHaveBeenCalledWith(
        {
          preferences: 'no',
          analytics: 'yes',
          marketing: 'yes',
          sale_of_data: 'yes',
        },
        expect.any(Function),
      );
    });

    it('does nothing when Shopify API is not available', () => {
      delete (window as any).Shopify;
      updateShopifyConsent(['necessary', 'analytics']);
      expect(mockSetTrackingConsent).not.toHaveBeenCalled();
    });
  });
});
