package com.consentos

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * The effective site configuration loaded from the CMP API.
 *
 * Maps to the response of `GET {apiBase}/api/v1/config/sites/{siteId}/effective`.
 * The configuration drives banner display, theming, blocking mode, and consent expiry.
 */
@Serializable
data class ConsentConfig(
    /** Unique identifier for the site. */
    @SerialName("site_id")
    val siteId: String,

    /** Human-readable name for the site. */
    @SerialName("site_name")
    val siteName: String,

    /** The blocking mode determining the default consent model. */
    @SerialName("blocking_mode")
    val blockingMode: BlockingMode,

    /** Consent validity in days. After expiry the banner is shown again. */
    @SerialName("consent_expiry_days")
    val consentExpiryDays: Int,

    /**
     * The current version of this configuration.
     * Stored alongside consent records to detect when re-consent is needed.
     */
    @SerialName("banner_version")
    val bannerVersion: String,

    /** Banner display and theming configuration. */
    @SerialName("banner_config")
    val bannerConfig: BannerConfig,

    /** Available categories for this site. */
    val categories: List<CategoryConfig> = emptyList(),
) {

    // -------------------------------------------------------------------------
    // Blocking Mode
    // -------------------------------------------------------------------------

    /**
     * The consent model applied to visitors.
     */
    @Serializable
    enum class BlockingMode(val value: String) {
        /** User must opt in before non-essential scripts run (GDPR default). */
        @SerialName("opt_in")
        OPT_IN("opt_in"),

        /** Non-essential scripts run by default; user may opt out (CCPA default). */
        @SerialName("opt_out")
        OPT_OUT("opt_out"),

        /** Informational notice only; no blocking. */
        @SerialName("informational")
        INFORMATIONAL("informational"),
    }

    // -------------------------------------------------------------------------
    // Banner Configuration
    // -------------------------------------------------------------------------

    /**
     * Visual and behavioural configuration for the consent banner.
     */
    @Serializable
    data class BannerConfig(
        /** Display mode controlling the banner layout. */
        @SerialName("display_mode")
        val displayMode: DisplayMode = DisplayMode.BOTTOM_BANNER,

        /** Primary background colour as a hex string (e.g. `"#FFFFFF"`). */
        @SerialName("background_color")
        val backgroundColor: String? = null,

        /** Primary text colour as a hex string. */
        @SerialName("text_color")
        val textColor: String? = null,

        /** Accent colour used for buttons and highlights. */
        @SerialName("accent_color")
        val accentColor: String? = null,

        /** Text for the "Accept all" button. */
        @SerialName("accept_button_text")
        val acceptButtonText: String? = null,

        /** Text for the "Reject all" button. */
        @SerialName("reject_button_text")
        val rejectButtonText: String? = null,

        /** Text for the "Manage preferences" button. */
        @SerialName("manage_button_text")
        val manageButtonText: String? = null,

        /** The banner title text. */
        val title: String? = null,

        /** The banner body copy. */
        val description: String? = null,

        /** URL for the site's privacy policy. */
        @SerialName("privacy_policy_url")
        val privacyPolicyUrl: String? = null,
    ) {
        /** Display mode options for the banner. */
        @Serializable
        enum class DisplayMode(val value: String) {
            @SerialName("overlay")
            OVERLAY("overlay"),

            @SerialName("bottom_banner")
            BOTTOM_BANNER("bottom_banner"),

            @SerialName("top_banner")
            TOP_BANNER("top_banner"),

            @SerialName("corner_popup")
            CORNER_POPUP("corner_popup"),

            @SerialName("inline")
            INLINE("inline"),
        }
    }

    // -------------------------------------------------------------------------
    // Category Configuration
    // -------------------------------------------------------------------------

    /**
     * Per-category configuration as returned by the API.
     */
    @Serializable
    data class CategoryConfig(
        /** Machine-readable category key (matches [ConsentCategory.value]). */
        val key: String,

        /** Whether this category is enabled for this site. */
        val enabled: Boolean,

        /** Overridden display name (falls back to [ConsentCategory.displayName] if absent). */
        @SerialName("display_name")
        val displayName: String? = null,

        /** Overridden description text. */
        val description: String? = null,
    ) {
        /** Resolves to the matching [ConsentCategory], if the key is recognised. */
        val category: ConsentCategory?
            get() = ConsentCategory.fromValue(key)
    }

    // -------------------------------------------------------------------------
    // Convenience
    // -------------------------------------------------------------------------

    /** Returns only the enabled [ConsentCategory] values for this config. */
    val enabledCategories: List<ConsentCategory>
        get() = categories.mapNotNull { cfg ->
            if (cfg.enabled) cfg.category else null
        }
}

// -------------------------------------------------------------------------
// Cached Config Wrapper
// -------------------------------------------------------------------------

/**
 * Wraps a [ConsentConfig] with metadata needed for cache invalidation.
 */
@Serializable
data class CachedConfig(
    val config: ConsentConfig,
    /** Epoch milliseconds at which the config was fetched. */
    val fetchedAtMs: Long,
) {
    companion object {
        /** The cache TTL in milliseconds (10 minutes). */
        const val TTL_MS: Long = 10 * 60 * 1_000L
    }

    /** Returns `true` if the cached entry has exceeded the TTL. */
    val isExpired: Boolean
        get() = System.currentTimeMillis() - fetchedAtMs > TTL_MS
}
