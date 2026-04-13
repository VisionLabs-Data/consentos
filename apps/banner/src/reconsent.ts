/**
 * Re-consent logic — determines whether the user needs to re-consent.
 *
 * Triggers re-consent when:
 *   1. Consent has expired (based on consent_expiry_days)
 *   2. The banner/config version has changed since last consent
 */

import type { ConsentState, SiteConfig } from './types';

/** Check whether the existing consent has expired based on consent_expiry_days. */
export function isConsentExpired(
  consent: ConsentState,
  config: SiteConfig,
): boolean {
  const consentedAt = new Date(consent.consentedAt).getTime();
  if (isNaN(consentedAt)) return true;

  const expiryMs = config.consent_expiry_days * 86_400_000;
  return Date.now() > consentedAt + expiryMs;
}

/** Check whether the config version has changed since consent was given. */
export function hasConfigVersionChanged(
  consent: ConsentState,
  config: SiteConfig,
): boolean {
  // If the consent doesn't record a config version, treat as needing re-consent
  // only if the config has a version set
  if (!consent.configVersion) {
    return config.id !== '';
  }

  return consent.configVersion !== config.id;
}

/**
 * Determine whether the user needs to re-consent.
 *
 * Returns an object with a boolean and the specific reason(s) so the
 * banner can log or report why re-consent was triggered.
 */
export function needsReconsent(
  consent: ConsentState,
  config: SiteConfig,
): ReconsentResult {
  const reasons: ReconsentReason[] = [];

  if (isConsentExpired(consent, config)) {
    reasons.push('expired');
  }

  if (hasConfigVersionChanged(consent, config)) {
    reasons.push('config_changed');
  }

  return {
    required: reasons.length > 0,
    reasons,
  };
}

export type ReconsentReason = 'expired' | 'config_changed';

export interface ReconsentResult {
  required: boolean;
  reasons: ReconsentReason[];
}
