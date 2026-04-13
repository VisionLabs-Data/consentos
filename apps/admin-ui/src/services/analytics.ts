declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
  }
}

/** Push an event to the GTM dataLayer. */
function pushEvent(event: string, data?: Record<string, unknown>): void {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...data });
}

/** Initialise analytics with user and org context. Called once after auth. */
export function initAnalytics(user: {
  id: string;
  email: string;
  role: string;
  organisation_id: string;
  full_name: string | null;
}): void {
  pushEvent('user_identified', {
    user_id: user.id,
    user_email: user.email,
    user_role: user.role,
    org_id: user.organisation_id,
    user_name: user.full_name ?? undefined,
  });
}

/** Track a page view. */
export function trackPageView(path: string, title?: string): void {
  pushEvent('page_view', { page_path: path, page_title: title });
}

/** Track auth events (login, logout). */
export function trackAuthEvent(
  action: 'login' | 'logout',
  userId?: string,
): void {
  pushEvent('auth_event', { auth_action: action, user_id: userId });
}

/** Track config changes (site config saved, org config updated, etc.). */
export function trackConfigChange(
  changeType: string,
  details?: Record<string, unknown>,
): void {
  pushEvent('config_change', { change_type: changeType, ...details });
}

/** Track feature usage (banner preview, compliance check, scan triggered, etc.). */
export function trackFeatureUsage(
  feature: string,
  action: string,
  details?: Record<string, unknown>,
): void {
  pushEvent('feature_usage', { feature, feature_action: action, ...details });
}
