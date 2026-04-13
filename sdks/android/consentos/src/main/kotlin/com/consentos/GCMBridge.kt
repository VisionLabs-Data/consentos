package com.consentos

/**
 * Google Consent Mode v2 consent type strings.
 */
enum class GCMConsentType(val value: String) {
    ANALYTICS_STORAGE("analytics_storage"),
    AD_STORAGE("ad_storage"),
    AD_USER_DATA("ad_user_data"),
    AD_PERSONALISATION("ad_personalization"),
    FUNCTIONALITY_STORAGE("functionality_storage"),
    PERSONALISATION_STORAGE("personalization_storage"),
    SECURITY_STORAGE("security_storage"),
}

/**
 * The granted/denied status for a GCM consent type.
 */
enum class GCMConsentStatus(val value: String) {
    GRANTED("granted"),
    DENIED("denied"),
}

// =============================================================================
// GCM Analytics Provider Protocol
// =============================================================================

/**
 * Abstracts the Firebase Analytics / Google Tag Manager call surface.
 *
 * Implement this interface and pass an instance to [GCMBridge] to forward consent
 * signals to Firebase Analytics. A no-op implementation ([NoOpGCMAnalyticsProvider])
 * is used when Firebase is not present.
 *
 * Example with Firebase Analytics:
 * ```kotlin
 * class FirebaseGCMProvider : GCMAnalyticsProvider {
 *     override fun setConsentDefaults(defaults: Map<String, String>) {
 *         val consentMap = defaults.mapKeys { FirebaseAnalytics.ConsentType.valueOf(it.key.uppercase()) }
 *             .mapValues { FirebaseAnalytics.ConsentStatus.valueOf(it.value.uppercase()) }
 *         Firebase.analytics.setConsent(consentMap)
 *     }
 *
 *     override fun updateConsent(updates: Map<String, String>) {
 *         val consentMap = updates.mapKeys { FirebaseAnalytics.ConsentType.valueOf(it.key.uppercase()) }
 *             .mapValues { FirebaseAnalytics.ConsentStatus.valueOf(it.value.uppercase()) }
 *         Firebase.analytics.setConsent(consentMap)
 *     }
 * }
 * ```
 */
interface GCMAnalyticsProvider {
    /** Sets the default consent state before any user interaction. */
    fun setConsentDefaults(defaults: Map<String, String>)

    /** Updates consent state after the user interacts with the banner. */
    fun updateConsent(updates: Map<String, String>)
}

// =============================================================================
// No-Op Provider
// =============================================================================

/**
 * A no-op [GCMAnalyticsProvider] used when Firebase Analytics is not linked.
 *
 * This is the default provider; replace it with a Firebase implementation to
 * activate Google Consent Mode v2 signals.
 */
class NoOpGCMAnalyticsProvider : GCMAnalyticsProvider {
    override fun setConsentDefaults(defaults: Map<String, String>) = Unit
    override fun updateConsent(updates: Map<String, String>) = Unit
}

// =============================================================================
// GCM Bridge
// =============================================================================

/**
 * Maps CMP consent state to Google Consent Mode v2 signals.
 *
 * On app launch, call [applyDefaults] with the site config before the user interacts.
 * After consent is collected, call [applyConsent] to update GCM.
 *
 * @param provider The analytics provider to forward signals to. Defaults to a no-op.
 */
class GCMBridge(
    private val provider: GCMAnalyticsProvider = NoOpGCMAnalyticsProvider(),
) {

    /**
     * Sends default (pre-consent) consent signals to GCM based on the site's blocking mode.
     *
     * Call this as early as possible — ideally before any analytics events are sent.
     *
     * @param config The effective site configuration.
     */
    fun applyDefaults(config: ConsentConfig) {
        val defaults = buildDefaults(config.blockingMode)
        provider.setConsentDefaults(defaults)
    }

    /**
     * Updates GCM consent signals to reflect the user's explicit choices.
     *
     * @param state The resolved consent state after user interaction.
     */
    fun applyConsent(state: ConsentState) {
        val updates = buildConsentMap(state)
        provider.updateConsent(updates)
    }

    // -------------------------------------------------------------------------
    // Private Helpers
    // -------------------------------------------------------------------------

    /**
     * Builds the default GCM consent map based on blocking mode.
     *
     * - `opt_in`: all types denied by default (GDPR).
     * - `opt_out`: all types granted by default (CCPA).
     * - `informational`: all types granted.
     */
    private fun buildDefaults(mode: ConsentConfig.BlockingMode): Map<String, String> {
        val status = if (mode == ConsentConfig.BlockingMode.OPT_IN) {
            GCMConsentStatus.DENIED
        } else {
            GCMConsentStatus.GRANTED
        }
        return GCMConsentType.entries.associate { it.value to status.value }
    }

    /**
     * Maps the consent state's accepted/rejected categories to GCM consent type values.
     */
    private fun buildConsentMap(state: ConsentState): Map<String, String> {
        val map = mutableMapOf<String, String>()

        // security_storage is always granted — it is required for security functionality.
        map[GCMConsentType.SECURITY_STORAGE.value] = GCMConsentStatus.GRANTED.value

        for (category in ConsentCategory.entries) {
            val gcmType = category.gcmConsentType ?: continue
            val status = if (state.isGranted(category)) {
                GCMConsentStatus.GRANTED
            } else {
                GCMConsentStatus.DENIED
            }
            map[gcmType] = status.value
        }

        // ad_user_data and ad_personalization follow the marketing category.
        val marketingGranted = state.isGranted(ConsentCategory.MARKETING)
        val marketingStatus = if (marketingGranted) GCMConsentStatus.GRANTED else GCMConsentStatus.DENIED
        map[GCMConsentType.AD_USER_DATA.value] = marketingStatus.value
        map[GCMConsentType.AD_PERSONALISATION.value] = marketingStatus.value

        return map
    }
}
