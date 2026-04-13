package com.consentos.ui

import android.graphics.Color
import androidx.annotation.ColorInt
import com.consentos.ConsentConfig

/**
 * Resolved colour and dimension theme for the consent banner.
 *
 * Derived from [ConsentConfig.BannerConfig] values, falling back to sensible defaults
 * when the API config is absent.
 */
data class BannerTheme(

    // -------------------------------------------------------------------------
    // Colours (as ARGB packed ints)
    // -------------------------------------------------------------------------

    @ColorInt val backgroundColor: Int,
    @ColorInt val textColor: Int,
    @ColorInt val accentColor: Int,
    @ColorInt val secondaryTextColor: Int,
    @ColorInt val dividerColor: Int,
    @ColorInt val acceptButtonBackground: Int,
    @ColorInt val acceptButtonTextColor: Int,
    @ColorInt val rejectButtonBackground: Int,
    @ColorInt val rejectButtonTextColor: Int,

    // -------------------------------------------------------------------------
    // Dimensions (dp)
    // -------------------------------------------------------------------------

    val cornerRadiusDp: Float,
    val horizontalPaddingDp: Float,
    val verticalPaddingDp: Float,
    val buttonHeightDp: Float,

    // -------------------------------------------------------------------------
    // Button / Copy Labels
    // -------------------------------------------------------------------------

    val acceptButtonText: String,
    val rejectButtonText: String,
    val manageButtonText: String,
    val title: String,
    val description: String,
) {

    companion object {

        // Default colour constants (matches iOS SDK defaults for consistency).
        private const val DEFAULT_ACCENT_HEX     = "#1A73E8"
        private const val DEFAULT_BACKGROUND_HEX = "#FFFFFF"
        private const val DEFAULT_TEXT_HEX        = "#1A1A1A"
        private const val DEFAULT_SECONDARY_ALPHA = 0x99  // ~60% opacity

        /**
         * Creates a [BannerTheme] from the banner configuration returned by the API.
         *
         * Hex values not present in the config fall back to neutral defaults.
         *
         * @param config The [ConsentConfig.BannerConfig] from the API response.
         */
        fun from(config: ConsentConfig.BannerConfig): BannerTheme {
            val background = parseHex(config.backgroundColor, DEFAULT_BACKGROUND_HEX)
            val text       = parseHex(config.textColor, DEFAULT_TEXT_HEX)
            val accent     = parseHex(config.accentColor, DEFAULT_ACCENT_HEX)

            // Secondary text: same hue as primary but with reduced opacity.
            val secondaryText = Color.argb(
                DEFAULT_SECONDARY_ALPHA,
                Color.red(text),
                Color.green(text),
                Color.blue(text),
            )

            // Divider: very low opacity version of the text colour.
            val divider = Color.argb(
                0x1F, // ~12% opacity
                Color.red(text),
                Color.green(text),
                Color.blue(text),
            )

            // Reject button: light grey background.
            val rejectBackground = Color.argb(0xFF, 0xF2, 0xF2, 0xF2)

            return BannerTheme(
                backgroundColor          = background,
                textColor                = text,
                accentColor              = accent,
                secondaryTextColor       = secondaryText,
                dividerColor             = divider,
                acceptButtonBackground   = accent,
                acceptButtonTextColor    = Color.WHITE,
                rejectButtonBackground   = rejectBackground,
                rejectButtonTextColor    = text,
                cornerRadiusDp           = 16f,
                horizontalPaddingDp      = 16f,
                verticalPaddingDp        = 16f,
                buttonHeightDp           = 48f,
                acceptButtonText  = config.acceptButtonText  ?: "Accept All",
                rejectButtonText  = config.rejectButtonText  ?: "Reject All",
                manageButtonText  = config.manageButtonText  ?: "Manage Preferences",
                title             = config.title             ?: "We value your privacy",
                description       = config.description
                    ?: "We use cookies to improve your experience and for analytics.",
            )
        }

        /**
         * Default theme used when no configuration has been loaded yet.
         */
        val default: BannerTheme by lazy {
            from(ConsentConfig.BannerConfig())
        }

        // -------------------------------------------------------------------------
        // Helpers
        // -------------------------------------------------------------------------

        /**
         * Parses a hex colour string such as `"#1A73E8"` or `"1A73E8"`.
         *
         * Returns the [fallback] colour if the string is null or malformed.
         */
        @ColorInt
        private fun parseHex(hex: String?, fallbackHex: String): Int {
            val input = hex?.trimStart('#') ?: return Color.parseColor(fallbackHex)
            return runCatching { Color.parseColor("#$input") }
                .getOrDefault(Color.parseColor(fallbackHex))
        }
    }
}
