package com.consentos

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.Base64

/**
 * Unit tests for [TCFStringEncoder].
 *
 * Robolectric is used here because [TCFStringEncoder] uses [android.util.Base64].
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class TCFStringEncoderTest {

    // -------------------------------------------------------------------------
    // Returns null before interaction
    // -------------------------------------------------------------------------

    @Test
    fun `encode returns null when state has no interaction`() {
        val state = ConsentState(visitorId = "v1") // consentedAtMs is null
        val config = makeSampleConfig()
        assertNull(TCFStringEncoder.encode(state, config))
    }

    // -------------------------------------------------------------------------
    // Returns a non-empty string after interaction
    // -------------------------------------------------------------------------

    @Test
    fun `encode returns non-empty string after acceptAll`() {
        val state = ConsentState(visitorId = "v1").acceptingAll()
        val config = makeSampleConfig()
        val result = TCFStringEncoder.encode(state, config)
        assertNotNull(result)
        assertTrue(result!!.isNotEmpty())
    }

    @Test
    fun `encode returns non-empty string after rejectAll`() {
        val state = ConsentState(visitorId = "v1").rejectingAll()
        val config = makeSampleConfig()
        val result = TCFStringEncoder.encode(state, config)
        assertNotNull(result)
        assertTrue(result!!.isNotEmpty())
    }

    // -------------------------------------------------------------------------
    // Base64url format
    // -------------------------------------------------------------------------

    @Test
    fun `encode produces valid Base64url without plus signs`() {
        val state = ConsentState(visitorId = "v1").acceptingAll()
        val tcString = TCFStringEncoder.encode(state, makeSampleConfig())!!
        assertFalse("TC string must not contain '+'", tcString.contains('+'))
    }

    @Test
    fun `encode produces valid Base64url without forward slashes`() {
        val state = ConsentState(visitorId = "v1").acceptingAll()
        val tcString = TCFStringEncoder.encode(state, makeSampleConfig())!!
        assertFalse("TC string must not contain '/'", tcString.contains('/'))
    }

    @Test
    fun `encode produces valid Base64url without padding`() {
        val state = ConsentState(visitorId = "v1").acceptingAll()
        val tcString = TCFStringEncoder.encode(state, makeSampleConfig())!!
        assertFalse("TC string must not contain '='", tcString.contains('='))
    }

    @Test
    fun `encode produces decodable Base64`() {
        val state = ConsentState(visitorId = "v1").acceptingAll()
        val tcString = TCFStringEncoder.encode(state, makeSampleConfig())!!

        // Convert Base64url back to standard Base64 with padding for decoding.
        var standard = tcString
            .replace('-', '+')
            .replace('_', '/')
        val remainder = standard.length % 4
        if (remainder != 0) standard += "=".repeat(4 - remainder)

        val data = Base64.getDecoder().decode(standard)
        assertNotNull(data)
        assertTrue(data.isNotEmpty())
    }

    // -------------------------------------------------------------------------
    // Determinism
    // -------------------------------------------------------------------------

    @Test
    fun `encode produces identical output for identical input`() {
        val ts = 1_700_000_000_000L
        val state = ConsentState(
            visitorId = "v1",
            accepted = setOf(ConsentCategory.ANALYTICS, ConsentCategory.MARKETING),
            rejected = setOf(ConsentCategory.FUNCTIONAL, ConsentCategory.PERSONALISATION),
            consentedAtMs = ts,
            bannerVersion = "v1",
        )
        val config = makeSampleConfig()

        val result1 = TCFStringEncoder.encode(state, config)
        val result2 = TCFStringEncoder.encode(state, config)

        assertEquals(result1, result2)
    }

    // -------------------------------------------------------------------------
    // Different states produce different strings
    // -------------------------------------------------------------------------

    @Test
    fun `encode produces distinct strings for acceptAll vs rejectAll`() {
        val ts = 1_700_000_000_000L
        val config = makeSampleConfig()

        val acceptedState = ConsentState(
            visitorId = "v1",
            accepted = ConsentCategory.entries.filter { it.requiresConsent }.toSet(),
            consentedAtMs = ts,
        )
        val rejectedState = ConsentState(
            visitorId = "v1",
            rejected = ConsentCategory.entries.filter { it.requiresConsent }.toSet(),
            consentedAtMs = ts,
        )

        val tcAccepted = TCFStringEncoder.encode(acceptedState, config)
        val tcRejected = TCFStringEncoder.encode(rejectedState, config)

        assertNotEquals(tcAccepted, tcRejected)
    }

    // -------------------------------------------------------------------------
    // Minimum length
    // -------------------------------------------------------------------------

    @Test
    fun `encode produces string of reasonable length`() {
        val state = ConsentState(visitorId = "v1").acceptingAll()
        val tcString = TCFStringEncoder.encode(state, makeSampleConfig())!!

        // A valid core TC string serialises to at least ~20 bytes before Base64url encoding.
        // 28 chars is a conservative lower bound.
        assertTrue("TC string appears too short: ${tcString.length}", tcString.length > 28)
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun makeSampleConfig() = ConsentConfig(
        siteId = "site-001",
        siteName = "Test Site",
        blockingMode = ConsentConfig.BlockingMode.OPT_IN,
        consentExpiryDays = 365,
        bannerVersion = "v1",
        bannerConfig = ConsentConfig.BannerConfig(),
        categories = emptyList(),
    )
}
