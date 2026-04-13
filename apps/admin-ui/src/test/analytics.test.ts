import { describe, it, expect, beforeEach } from 'vitest';

import {
  initAnalytics,
  trackPageView,
  trackAuthEvent,
  trackConfigChange,
  trackFeatureUsage,
} from '../services/analytics';

describe('analytics service', () => {
  beforeEach(() => {
    window.dataLayer = [];
  });

  it('pushes user_identified event on initAnalytics', () => {
    initAnalytics({
      id: 'u1',
      email: 'test@example.com',
      role: 'admin',
      organisation_id: 'org1',
      full_name: 'Test User',
    });

    expect(window.dataLayer).toHaveLength(1);
    expect(window.dataLayer[0]).toMatchObject({
      event: 'user_identified',
      user_id: 'u1',
      user_email: 'test@example.com',
      user_role: 'admin',
      org_id: 'org1',
      user_name: 'Test User',
    });
  });

  it('pushes page_view event on trackPageView', () => {
    trackPageView('/sites', 'Sites');

    expect(window.dataLayer).toHaveLength(1);
    expect(window.dataLayer[0]).toMatchObject({
      event: 'page_view',
      page_path: '/sites',
      page_title: 'Sites',
    });
  });

  it('pushes auth_event on trackAuthEvent', () => {
    trackAuthEvent('login', 'u1');

    expect(window.dataLayer).toHaveLength(1);
    expect(window.dataLayer[0]).toMatchObject({
      event: 'auth_event',
      auth_action: 'login',
      user_id: 'u1',
    });
  });

  it('pushes config_change event on trackConfigChange', () => {
    trackConfigChange('site_config', { site_id: 's1' });

    expect(window.dataLayer).toHaveLength(1);
    expect(window.dataLayer[0]).toMatchObject({
      event: 'config_change',
      change_type: 'site_config',
      site_id: 's1',
    });
  });

  it('pushes feature_usage event on trackFeatureUsage', () => {
    trackFeatureUsage('scan', 'trigger', { site_id: 's1' });

    expect(window.dataLayer).toHaveLength(1);
    expect(window.dataLayer[0]).toMatchObject({
      event: 'feature_usage',
      feature: 'scan',
      feature_action: 'trigger',
      site_id: 's1',
    });
  });

  it('initialises dataLayer if not present', () => {
    // @ts-expect-error — testing uninitialised state
    delete window.dataLayer;

    trackPageView('/test');

    expect(window.dataLayer).toHaveLength(1);
    expect(window.dataLayer[0]).toMatchObject({ event: 'page_view' });
  });
});
