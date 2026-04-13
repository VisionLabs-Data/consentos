package com.consentos

import android.util.Base64

/**
 * Encodes a TC string (Transparency & Consent Framework v2.2) from consent state.
 *
 * The TC string is a Base64url-encoded bit field described in the IAB TCF v2.2 specification.
 * This implementation encodes the core consent section (segment type 0), which is sufficient
 * for signalling purpose consent to downstream vendors.
 *
 * Reference:
 * https://github.com/InteractiveAdvertisingBureau/GDPR-Transparency-and-Consent-Framework
 */
object TCFStringEncoder {

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /** TCF specification version. */
    private const val SPEC_VERSION = 2

    /** A fixed CMP ID — replace with your registered IAB CMP ID in production. */
    private const val CMP_ID = 0

    /** CMP SDK version number. */
    private const val CMP_VERSION = 1

    /** IAB consent language (EN). */
    private const val CONSENT_LANGUAGE = "EN"

    /** Vendor list version. In production, fetch from the GVL. */
    private const val VENDOR_LIST_VERSION = 1

    /** Number of TCF purposes defined in the specification. */
    private const val TCF_PURPOSE_COUNT = 24

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Encodes a TC string for the given consent state and site configuration.
     *
     * @param state  The resolved consent state containing accepted/rejected categories.
     * @param config The site configuration (used for CMP metadata).
     * @return A Base64url-encoded TC string, or `null` if the state has no interaction.
     */
    fun encode(state: ConsentState, config: ConsentConfig): String? {
        if (!state.hasInteracted) return null
        val consentedAtMs = state.consentedAtMs ?: return null

        // Derive the set of consented TCF purpose IDs from accepted categories.
        val consentedPurposeIds: Set<Int> = state.accepted
            .flatMap { it.tcfPurposeIds }
            .toSet()

        return buildCoreString(consentedAtMs, consentedPurposeIds)
    }

    // -------------------------------------------------------------------------
    // Core String Construction
    // -------------------------------------------------------------------------

    private fun buildCoreString(
        consentedAtMs: Long,
        consentedPurposeIds: Set<Int>,
    ): String {
        val bits = BitWriter()

        // --- Core segment fields (IAB TCF v2.2 spec, Table 1) ---

        // Version (6 bits)
        bits.write(SPEC_VERSION, 6)

        // Created — deciseconds since epoch (36 bits)
        val deciseconds = (consentedAtMs / 100).toInt()
        bits.write(deciseconds, 36)

        // LastUpdated — deciseconds since epoch (36 bits)
        bits.write(deciseconds, 36)

        // CmpId (12 bits)
        bits.write(CMP_ID, 12)

        // CmpVersion (12 bits)
        bits.write(CMP_VERSION, 12)

        // ConsentScreen (6 bits) — screen number within the CMP UI
        bits.write(1, 6)

        // ConsentLanguage (12 bits) — two 6-bit characters, A=0 … Z=25
        val (langFirst, langSecond) = encodeTwoLetterCode(CONSENT_LANGUAGE)
        bits.write(langFirst, 6)
        bits.write(langSecond, 6)

        // VendorListVersion (12 bits)
        bits.write(VENDOR_LIST_VERSION, 12)

        // TcfPolicyVersion (6 bits) — must be 4 for TCF v2.2
        bits.write(4, 6)

        // IsServiceSpecific (1 bit)
        bits.write(0, 1)

        // UseNonStandardTexts (1 bit)
        bits.write(0, 1)

        // SpecialFeatureOptIns (12 bits) — none opted in
        bits.write(0, 12)

        // PurposesConsent (24 bits) — one bit per purpose, purpose 1 first
        for (purposeId in 1..TCF_PURPOSE_COUNT) {
            bits.write(if (purposeId in consentedPurposeIds) 1 else 0, 1)
        }

        // PurposesLITransparency (24 bits) — legitimate interest; none asserted
        bits.write(0, 24)

        // PurposeOneTreatment (1 bit)
        bits.write(0, 1)

        // PublisherCC (12 bits) — "GB"
        val (ccFirst, ccSecond) = encodeTwoLetterCode("GB")
        bits.write(ccFirst, 6)
        bits.write(ccSecond, 6)

        // Vendor Consents — BitRange encoding with MaxVendorId = 0 (no vendors)
        bits.write(0, 16)  // MaxVendorId
        bits.write(0, 1)   // IsRangeEncoding = false

        // Vendor Legitimate Interests — MaxVendorId = 0
        bits.write(0, 16)
        bits.write(0, 1)

        // Publisher Restrictions count = 0
        bits.write(0, 12)

        return base64UrlEncode(bits.toByteArray())
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Encodes a two-letter language/country code into two 6-bit integers (A=0, Z=25).
     */
    private fun encodeTwoLetterCode(code: String): Pair<Int, Int> {
        val upper = code.uppercase()
        return if (upper.length >= 2) {
            val first = upper[0].code - 'A'.code
            val second = upper[1].code - 'A'.code
            Pair(first.coerceIn(0, 25), second.coerceIn(0, 25))
        } else {
            Pair(4, 13) // "EN" fallback (E=4, N=13)
        }
    }

    /**
     * Converts a [ByteArray] to a Base64url string (RFC 4648, no padding).
     */
    private fun base64UrlEncode(data: ByteArray): String =
        Base64.encodeToString(data, Base64.NO_PADDING or Base64.NO_WRAP or Base64.URL_SAFE)
}

// =============================================================================
// Bit Writer
// =============================================================================

/**
 * A utility class for packing integers into a bit-level byte buffer.
 *
 * Bits are written from the most-significant bit of each byte first (big-endian).
 */
private class BitWriter {

    private val bytes = mutableListOf<Byte>()
    private var currentByte: Int = 0
    private var bitPosition: Int = 0  // 0 = MSB of current byte

    /**
     * Writes [bitCount] bits from [value], starting from the most-significant bit.
     */
    fun write(value: Int, bitCount: Int) {
        for (i in bitCount - 1 downTo 0) {
            val bit = (value shr i) and 1
            currentByte = currentByte or (bit shl (7 - bitPosition))
            bitPosition++
            if (bitPosition == 8) {
                bytes.add(currentByte.toByte())
                currentByte = 0
                bitPosition = 0
            }
        }
    }

    /**
     * Flushes any remaining partial byte and returns the accumulated bytes.
     */
    fun toByteArray(): ByteArray {
        val result = bytes.toMutableList()
        if (bitPosition > 0) result.add(currentByte.toByte())
        return result.toByteArray()
    }
}
