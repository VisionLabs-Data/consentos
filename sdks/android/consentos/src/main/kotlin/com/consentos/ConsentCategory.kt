package com.consentos

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

/**
 * Consent categories matching the CMP platform's taxonomy.
 *
 * Each category maps to IAB TCF v2.2 purposes and Google Consent Mode v2 consent types.
 * The [NECESSARY] category is always granted and cannot be revoked by the user.
 *
 * Serialised using the [value] string (e.g. `"analytics"`) rather than the enum name,
 * to remain consistent with the web platform's cookie structure.
 */
@Serializable(with = ConsentCategorySerializer::class)
enum class ConsentCategory(
    /** The raw string value used in API payloads and persistent storage. */
    val value: String,
) {
    /** Strictly necessary cookies — always allowed, no consent required. */
    NECESSARY("necessary"),

    /** Functional / preference cookies (e.g. language, saved settings). */
    FUNCTIONAL("functional"),

    /** Analytics / statistics cookies (e.g. page views, session data). */
    ANALYTICS("analytics"),

    /** Marketing / advertising cookies (e.g. retargeting, personalised ads). */
    MARKETING("marketing"),

    /** Personalisation cookies (e.g. content recommendations). */
    PERSONALISATION("personalisation");

    // -------------------------------------------------------------------------
    // TCF Purpose Mappings
    // -------------------------------------------------------------------------

    /**
     * IAB TCF v2.2 purpose IDs associated with this category.
     *
     * Returns an empty list for [NECESSARY], which does not require consent purposes.
     */
    val tcfPurposeIds: List<Int>
        get() = when (this) {
            NECESSARY       -> emptyList()
            FUNCTIONAL      -> listOf(1)           // Store and/or access information on a device
            ANALYTICS       -> listOf(7, 8, 9, 10) // Measurement, market research, product development
            MARKETING       -> listOf(2, 3, 4)     // Select basic/personalised ads, create ad profile
            PERSONALISATION -> listOf(5, 6)        // Create content profile, select personalised content
        }

    // -------------------------------------------------------------------------
    // Google Consent Mode v2 Mappings
    // -------------------------------------------------------------------------

    /**
     * Google Consent Mode v2 consent type string for this category.
     *
     * Returns `null` for categories that do not have a direct GCM mapping.
     */
    val gcmConsentType: String?
        get() = when (this) {
            NECESSARY       -> null
            FUNCTIONAL      -> "functionality_storage"
            ANALYTICS       -> "analytics_storage"
            MARKETING       -> "ad_storage"
            PERSONALISATION -> "personalization_storage"
        }

    // -------------------------------------------------------------------------
    // Display
    // -------------------------------------------------------------------------

    /** Human-readable display name for the category (British English). */
    val displayName: String
        get() = when (this) {
            NECESSARY       -> "Strictly Necessary"
            FUNCTIONAL      -> "Functional"
            ANALYTICS       -> "Analytics"
            MARKETING       -> "Marketing"
            PERSONALISATION -> "Personalisation"
        }

    /** Brief description of the category for banner display. */
    val displayDescription: String
        get() = when (this) {
            NECESSARY       -> "Essential for the application to function. These cannot be disabled."
            FUNCTIONAL      -> "Enable enhanced functionality such as remembering your preferences."
            ANALYTICS       -> "Help us understand how users interact with the application."
            MARKETING       -> "Used to deliver relevant advertisements and track ad campaign performance."
            PERSONALISATION -> "Allow us to personalise content based on your interests."
        }

    /**
     * Whether consent for this category is required before storing data.
     *
     * [NECESSARY] is exempt from consent requirements under ePrivacy regulations.
     */
    val requiresConsent: Boolean
        get() = this != NECESSARY

    companion object {
        /**
         * Returns the [ConsentCategory] matching [value], or `null` if unrecognised.
         */
        fun fromValue(value: String): ConsentCategory? =
            entries.firstOrNull { it.value == value }
    }
}

// =============================================================================
// Kotlinx Serializer
// =============================================================================

/**
 * Custom kotlinx.serialization serialiser for [ConsentCategory].
 *
 * Serialises using the [ConsentCategory.value] string (e.g. `"analytics"`) so that
 * JSON payloads are consistent with the web platform's cookie structure.
 */
object ConsentCategorySerializer : KSerializer<ConsentCategory> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("ConsentCategory", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: ConsentCategory) {
        encoder.encodeString(value.value)
    }

    override fun deserialize(decoder: Decoder): ConsentCategory {
        val raw = decoder.decodeString()
        return ConsentCategory.fromValue(raw)
            ?: throw kotlinx.serialization.SerializationException(
                "Unknown ConsentCategory value: $raw",
            )
    }
}
