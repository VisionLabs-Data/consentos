package com.consentos

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit tests for [ConsentState].
 */
class ConsentStateTest {

    private val visitorId = "test-visitor-123"

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    // -------------------------------------------------------------------------
    // Initial State
    // -------------------------------------------------------------------------

    @Test
    fun `new state has no interaction`() {
        val state = ConsentState(visitorId = visitorId)
        assertFalse(state.hasInteracted)
        assertNull(state.consentedAtMs)
        assertTrue(state.accepted.isEmpty())
        assertTrue(state.rejected.isEmpty())
    }

    @Test
    fun `new state preserves visitor ID`() {
        val state = ConsentState(visitorId = visitorId)
        assertEquals(visitorId, state.visitorId)
    }

    // -------------------------------------------------------------------------
    // isGranted
    // -------------------------------------------------------------------------

    @Test
    fun `necessary is always granted`() {
        val state = ConsentState(visitorId = visitorId) // no interaction
        assertTrue(state.isGranted(ConsentCategory.NECESSARY))
    }

    @Test
    fun `optional categories are not granted when no interaction`() {
        val state = ConsentState(visitorId = visitorId)
        ConsentCategory.entries
            .filter { it != ConsentCategory.NECESSARY }
            .forEach { category ->
                assertFalse("$category should not be granted by default", state.isGranted(category))
            }
    }

    @Test
    fun `accepted category is granted`() {
        val state = ConsentState(
            visitorId = visitorId,
            accepted = setOf(ConsentCategory.ANALYTICS),
            consentedAtMs = System.currentTimeMillis(),
        )
        assertTrue(state.isGranted(ConsentCategory.ANALYTICS))
    }

    @Test
    fun `rejected category is not granted`() {
        val state = ConsentState(
            visitorId = visitorId,
            rejected = setOf(ConsentCategory.ANALYTICS),
            consentedAtMs = System.currentTimeMillis(),
        )
        assertFalse(state.isGranted(ConsentCategory.ANALYTICS))
    }

    // -------------------------------------------------------------------------
    // isDenied
    // -------------------------------------------------------------------------

    @Test
    fun `necessary is never denied`() {
        val state = ConsentState(
            visitorId = visitorId,
            rejected = setOf(ConsentCategory.ANALYTICS),
            consentedAtMs = System.currentTimeMillis(),
        )
        assertFalse(state.isDenied(ConsentCategory.NECESSARY))
    }

    @Test
    fun `rejected category is denied`() {
        val state = ConsentState(
            visitorId = visitorId,
            rejected = setOf(ConsentCategory.MARKETING),
            consentedAtMs = System.currentTimeMillis(),
        )
        assertTrue(state.isDenied(ConsentCategory.MARKETING))
    }

    @Test
    fun `non-rejected category is not denied`() {
        val state = ConsentState(
            visitorId = visitorId,
            accepted = setOf(ConsentCategory.ANALYTICS),
            consentedAtMs = System.currentTimeMillis(),
        )
        assertFalse(state.isDenied(ConsentCategory.ANALYTICS))
    }

    // -------------------------------------------------------------------------
    // acceptingAll()
    // -------------------------------------------------------------------------

    @Test
    fun `acceptingAll grants all optional categories`() {
        val state = ConsentState(visitorId = visitorId)
        val accepted = state.acceptingAll()

        val expected = ConsentCategory.entries.filter { it.requiresConsent }.toSet()
        assertEquals(expected, accepted.accepted)
        assertTrue(accepted.rejected.isEmpty())
    }

    @Test
    fun `acceptingAll sets consentedAtMs`() {
        val before = System.currentTimeMillis()
        val state = ConsentState(visitorId = visitorId).acceptingAll()
        assertNotNull(state.consentedAtMs)
        assertTrue(state.consentedAtMs!! >= before)
    }

    @Test
    fun `acceptingAll preserves visitor ID`() {
        val state = ConsentState(visitorId = visitorId).acceptingAll()
        assertEquals(visitorId, state.visitorId)
    }

    @Test
    fun `acceptingAll marks state as interacted`() {
        val state = ConsentState(visitorId = visitorId).acceptingAll()
        assertTrue(state.hasInteracted)
    }

    // -------------------------------------------------------------------------
    // rejectingAll()
    // -------------------------------------------------------------------------

    @Test
    fun `rejectingAll empties accepted set`() {
        val state = ConsentState(visitorId = visitorId)
        val rejected = state.rejectingAll()
        assertTrue(rejected.accepted.isEmpty())
    }

    @Test
    fun `rejectingAll rejects all optional categories`() {
        val state = ConsentState(visitorId = visitorId).rejectingAll()
        val expected = ConsentCategory.entries.filter { it.requiresConsent }.toSet()
        assertEquals(expected, state.rejected)
    }

    @Test
    fun `rejectingAll sets consentedAtMs`() {
        val state = ConsentState(visitorId = visitorId).rejectingAll()
        assertNotNull(state.consentedAtMs)
    }

    // -------------------------------------------------------------------------
    // accepting(categories)
    // -------------------------------------------------------------------------

    @Test
    fun `accepting only accepts specified categories`() {
        val state = ConsentState(visitorId = visitorId)
        val result = state.accepting(setOf(ConsentCategory.ANALYTICS, ConsentCategory.FUNCTIONAL))

        assertTrue(result.accepted.contains(ConsentCategory.ANALYTICS))
        assertTrue(result.accepted.contains(ConsentCategory.FUNCTIONAL))
        assertFalse(result.accepted.contains(ConsentCategory.MARKETING))
        assertFalse(result.accepted.contains(ConsentCategory.PERSONALISATION))
    }

    @Test
    fun `accepting rejects remainder`() {
        val state = ConsentState(visitorId = visitorId)
        val result = state.accepting(setOf(ConsentCategory.ANALYTICS))

        assertTrue(result.rejected.contains(ConsentCategory.MARKETING))
        assertTrue(result.rejected.contains(ConsentCategory.FUNCTIONAL))
        assertTrue(result.rejected.contains(ConsentCategory.PERSONALISATION))
    }

    @Test
    fun `accepting ignores necessary category`() {
        val state = ConsentState(visitorId = visitorId)
        val result = state.accepting(setOf(ConsentCategory.NECESSARY))
        assertFalse(result.accepted.contains(ConsentCategory.NECESSARY))
    }

    @Test
    fun `accepting empty set rejects all`() {
        val state = ConsentState(visitorId = visitorId)
        val result = state.accepting(emptySet())
        assertTrue(result.accepted.isEmpty())
        val expectedRejected = ConsentCategory.entries.filter { it.requiresConsent }.toSet()
        assertEquals(expectedRejected, result.rejected)
    }

    // -------------------------------------------------------------------------
    // Serialisation (kotlinx.serialization)
    // -------------------------------------------------------------------------

    @Test
    fun `state round-trips via JSON`() {
        val original = ConsentState(
            visitorId = visitorId,
            accepted = setOf(ConsentCategory.ANALYTICS, ConsentCategory.FUNCTIONAL),
            rejected = setOf(ConsentCategory.MARKETING),
            consentedAtMs = 1_700_000_000_000L,
            bannerVersion = "v2",
        )

        val encoded = json.encodeToString(original)
        val decoded = json.decodeFromString<ConsentState>(encoded)

        assertEquals(original.visitorId, decoded.visitorId)
        assertEquals(original.accepted, decoded.accepted)
        assertEquals(original.rejected, decoded.rejected)
        assertEquals(original.consentedAtMs, decoded.consentedAtMs)
        assertEquals(original.bannerVersion, decoded.bannerVersion)
    }

    @Test
    fun `empty state serialises without error`() {
        val state = ConsentState(visitorId = visitorId)
        val encoded = json.encodeToString(state)
        assertNotNull(encoded)
        assertTrue(encoded.isNotEmpty())
    }

    // -------------------------------------------------------------------------
    // Equality
    // -------------------------------------------------------------------------

    @Test
    fun `two states with same values are equal`() {
        val ts = 1_000_000L
        val a = ConsentState(visitorId, setOf(ConsentCategory.ANALYTICS), emptySet(), ts, "v1")
        val b = ConsentState(visitorId, setOf(ConsentCategory.ANALYTICS), emptySet(), ts, "v1")
        assertEquals(a, b)
    }

    @Test
    fun `two states with different accepted are not equal`() {
        val ts = 1_000_000L
        val a = ConsentState(visitorId, setOf(ConsentCategory.ANALYTICS), emptySet(), ts, null)
        val b = ConsentState(visitorId, setOf(ConsentCategory.MARKETING), emptySet(), ts, null)
        assertTrue(a != b)
    }
}
