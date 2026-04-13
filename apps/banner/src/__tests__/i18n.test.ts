import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  DEFAULT_TRANSLATIONS,
  detectLocale,
  fetchTranslations,
  interpolate,
  loadTranslations,
  normaliseLocale,
} from '../i18n';

describe('i18n', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('DEFAULT_TRANSLATIONS', () => {
    it('should have all required keys', () => {
      expect(DEFAULT_TRANSLATIONS.title).toBe('We use cookies');
      expect(DEFAULT_TRANSLATIONS.acceptAll).toBe('Accept all');
      expect(DEFAULT_TRANSLATIONS.rejectAll).toBe('Reject all');
      expect(DEFAULT_TRANSLATIONS.managePreferences).toBe('Manage preferences');
      expect(DEFAULT_TRANSLATIONS.savePreferences).toBe('Save preferences');
      expect(DEFAULT_TRANSLATIONS.privacyPolicyLink).toBe('Privacy Policy');
      expect(DEFAULT_TRANSLATIONS.closeLabel).toBe('Close');
    });

    it('should have all category translations', () => {
      expect(DEFAULT_TRANSLATIONS.categoryNecessary).toBe('Necessary');
      expect(DEFAULT_TRANSLATIONS.categoryFunctional).toBe('Functional');
      expect(DEFAULT_TRANSLATIONS.categoryAnalytics).toBe('Analytics');
      expect(DEFAULT_TRANSLATIONS.categoryMarketing).toBe('Marketing');
      expect(DEFAULT_TRANSLATIONS.categoryPersonalisation).toBe('Personalisation');
    });

    it('should have category descriptions', () => {
      expect(DEFAULT_TRANSLATIONS.categoryNecessaryDesc).toBeTruthy();
      expect(DEFAULT_TRANSLATIONS.categoryFunctionalDesc).toBeTruthy();
      expect(DEFAULT_TRANSLATIONS.categoryAnalyticsDesc).toBeTruthy();
      expect(DEFAULT_TRANSLATIONS.categoryMarketingDesc).toBeTruthy();
      expect(DEFAULT_TRANSLATIONS.categoryPersonalisationDesc).toBeTruthy();
    });

    it('should have cookie count template with placeholder', () => {
      expect(DEFAULT_TRANSLATIONS.cookieCount).toContain('{{count}}');
    });
  });

  describe('normaliseLocale', () => {
    it('should extract language code from locale', () => {
      expect(normaliseLocale('en-GB')).toBe('en');
      expect(normaliseLocale('fr-FR')).toBe('fr');
      expect(normaliseLocale('de-DE')).toBe('de');
    });

    it('should handle simple language codes', () => {
      expect(normaliseLocale('en')).toBe('en');
      expect(normaliseLocale('fr')).toBe('fr');
    });

    it('should lowercase the result', () => {
      expect(normaliseLocale('EN-GB')).toBe('en');
      expect(normaliseLocale('FR')).toBe('fr');
    });
  });

  describe('detectLocale', () => {
    it('should use data-locale attribute when present', () => {
      const script = document.createElement('script');
      script.setAttribute('data-site-id', 'site-1');
      script.setAttribute('data-locale', 'fr-FR');
      document.head.appendChild(script);

      expect(detectLocale()).toBe('fr');

      script.remove();
    });

    it('should fall back to navigator.language', () => {
      vi.spyOn(navigator, 'language', 'get').mockReturnValue('de-DE');
      expect(detectLocale()).toBe('de');
    });

    it('should fall back to document lang', () => {
      vi.spyOn(navigator, 'language', 'get').mockReturnValue('');
      document.documentElement.lang = 'es';

      expect(detectLocale()).toBe('es');

      document.documentElement.lang = '';
    });

    it('should default to en', () => {
      vi.spyOn(navigator, 'language', 'get').mockReturnValue('');
      document.documentElement.lang = '';

      expect(detectLocale()).toBe('en');
    });
  });

  describe('fetchTranslations', () => {
    it('should fetch and parse translations', async () => {
      const mockTranslations = { title: 'Nous utilisons des cookies' };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTranslations),
      }));

      const result = await fetchTranslations('https://cdn.example.com', 'fr');

      expect(fetch).toHaveBeenCalledWith('https://cdn.example.com/translations-fr.json');
      expect(result).toEqual(mockTranslations);

      vi.unstubAllGlobals();
    });

    it('should return null on 404', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

      const result = await fetchTranslations('https://cdn.example.com', 'zz');
      expect(result).toBeNull();

      vi.unstubAllGlobals();
    });

    it('should return null on network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const result = await fetchTranslations('https://cdn.example.com', 'fr');
      expect(result).toBeNull();

      vi.unstubAllGlobals();
    });
  });

  describe('loadTranslations', () => {
    it('should return defaults for English locale', async () => {
      const t = await loadTranslations('https://cdn.example.com', 'en');
      expect(t.title).toBe(DEFAULT_TRANSLATIONS.title);
      expect(t.acceptAll).toBe(DEFAULT_TRANSLATIONS.acceptAll);
    });

    it('should merge remote translations over defaults', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ title: 'Wir verwenden Cookies', acceptAll: 'Alle akzeptieren' }),
      }));

      const t = await loadTranslations('https://cdn.example.com', 'de');

      expect(t.title).toBe('Wir verwenden Cookies');
      expect(t.acceptAll).toBe('Alle akzeptieren');
      // Missing keys should fall back to English
      expect(t.rejectAll).toBe(DEFAULT_TRANSLATIONS.rejectAll);

      vi.unstubAllGlobals();
    });

    it('should fall back to defaults when fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));

      const t = await loadTranslations('https://cdn.example.com', 'fr');
      expect(t.title).toBe(DEFAULT_TRANSLATIONS.title);

      vi.unstubAllGlobals();
    });
  });

  describe('interpolate', () => {
    it('should replace placeholders with values', () => {
      expect(interpolate('{{count}} cookies', { count: '12' })).toBe('12 cookies');
    });

    it('should handle multiple placeholders', () => {
      expect(interpolate('{{a}} and {{b}}', { a: 'X', b: 'Y' })).toBe('X and Y');
    });

    it('should replace missing keys with empty string', () => {
      expect(interpolate('Hello {{name}}', {})).toBe('Hello ');
    });

    it('should handle templates without placeholders', () => {
      expect(interpolate('No placeholders', { key: 'value' })).toBe('No placeholders');
    });

    it('should handle empty template', () => {
      expect(interpolate('', { key: 'value' })).toBe('');
    });
  });
});
