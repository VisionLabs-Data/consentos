package com.consentos

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Unit tests for the [ConsentAPIProtocol] contract using a mock implementation.
 *
 * These tests verify the API contract and [ConsentPayload] serialisation logic
 * without making real network calls.
 */
class ConsentAPITest {

    private lateinit var mockAPI: MockConsentAPI
    private val siteId = "test-site-001"

    @Before
    fun setUp() {
        mockAPI = MockConsentAPI()
    }

    // -------------------------------------------------------------------------
    // fetchConfig
    // -------------------------------------------------------------------------

    @Test
    fun `fetchConfig returns config when successful`() = runTest {
        mockAPI.configToReturn = makeSampleConfig()

        val result = mockAPI.fetchConfig(siteId)

        assertEquals(siteId, result.siteId)
        assertEquals(1, mockAPI.fetchConfigCallCount)
        assertEquals(siteId, mockAPI.lastFetchedSiteId)
    }

    @Test(expected = ConsentAPIException.NetworkFailure::class)
    fun `fetchConfig throws NetworkFailure on network error`() = runTest {
        mockAPI.errorToThrow = ConsentAPIException.NetworkFailure(RuntimeException("No connectivity"))
        mockAPI.fetchConfig(siteId)
    }

    @Test(expected = ConsentAPIException.UnexpectedStatusCode::class)
    fun `fetchConfig throws UnexpectedStatusCode on 404`() = runTest {
        mockAPI.errorToThrow = ConsentAPIException.UnexpectedStatusCode(404)
        mockAPI.fetchConfig(siteId)
    }

    @Test
    fun `fetchConfig throws exception with correct status code`() = runTest {
        mockAPI.errorToThrow = ConsentAPIException.UnexpectedStatusCode(503)
        try {
            mockAPI.fetchConfig(siteId)
        } catch (e: ConsentAPIException.UnexpectedStatusCode) {
            assertEquals(503, e.code)
        }
    }

    // -------------------------------------------------------------------------
    // postConsent
    // -------------------------------------------------------------------------

    @Test
    fun `postConsent sends correct payload`() = runTest {
        val state = ConsentState(
            visitorId = "visitor-xyz",
            accepted = setOf(ConsentCategory.ANALYTICS, ConsentCategory.FUNCTIONAL),
            rejected = setOf(ConsentCategory.MARKETING),
            consentedAtMs = 1_700_000_000_000L,
            bannerVersion = "v2",
        )
        val payload = ConsentPayload.from(
            siteId = siteId,
            state = state,
            tcString = "test-tc-string",
        )!!

        mockAPI.postConsent(payload)

        assertEquals(1, mockAPI.postConsentCallCount)
        val sent = mockAPI.lastPostedPayload!!
        assertEquals(siteId, sent.siteId)
        assertEquals("visitor-xyz", sent.visitorId)
        assertEquals("android", sent.platform)
        assertTrue(sent.accepted.contains("analytics"))
        assertTrue(sent.accepted.contains("functional"))
        assertTrue(sent.rejected.contains("marketing"))
        assertEquals("v2", sent.bannerVersion)
        assertEquals("test-tc-string", sent.tcString)
    }

    @Test
    fun `postConsent platform is always android`() = runTest {
        val state = ConsentState(visitorId = "v", consentedAtMs = System.currentTimeMillis())
        val payload = ConsentPayload.from(siteId = siteId, state = state)!!

        mockAPI.postConsent(payload)

        assertEquals("android", mockAPI.lastPostedPayload?.platform)
    }

    @Test(expected = ConsentAPIException.UnexpectedStatusCode::class)
    fun `postConsent throws on server error`() = runTest {
        mockAPI.postConsentError = ConsentAPIException.UnexpectedStatusCode(500)
        val payload = ConsentPayload.from(
            siteId = siteId,
            state = ConsentState(visitorId = "v", consentedAtMs = System.currentTimeMillis()),
        )!!
        mockAPI.postConsent(payload)
    }

    // -------------------------------------------------------------------------
    // ConsentPayload construction
    // -------------------------------------------------------------------------

    @Test
    fun `ConsentPayload from encodes categories to raw values`() {
        val state = ConsentState(
            visitorId = "v1",
            accepted = setOf(ConsentCategory.ANALYTICS, ConsentCategory.MARKETING),
            rejected = setOf(ConsentCategory.FUNCTIONAL),
            consentedAtMs = System.currentTimeMillis(),
        )

        val payload = ConsentPayload.from(siteId = "s1", state = state)!!

        assertTrue(payload.accepted.contains("analytics"))
        assertTrue(payload.accepted.contains("marketing"))
        assertTrue(payload.rejected.contains("functional"))
        assertFalse(payload.accepted.contains("necessary"))
    }

    @Test
    fun `ConsentPayload from returns null when no consentedAtMs`() {
        val state = ConsentState(visitorId = "v1") // no interaction
        val payload = ConsentPayload.from(siteId = "s1", state = state)
        assertTrue(payload == null)
    }

    @Test
    fun `ConsentPayload consentedAt is formatted as ISO-8601 UTC`() {
        val ts = 1_700_000_000_000L
        val state = ConsentState(visitorId = "v1", consentedAtMs = ts)
        val payload = ConsentPayload.from(siteId = "s1", state = state)!!

        // Should be in the format "2023-11-14T22:13:20Z" (approximately)
        assertTrue(
            "consentedAt should match ISO-8601 UTC pattern",
            payload.consentedAt.matches(Regex("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z")),
        )
    }

    // -------------------------------------------------------------------------
    // Error messages
    // -------------------------------------------------------------------------

    @Test
    fun `UnexpectedStatusCode includes code in message`() {
        val error = ConsentAPIException.UnexpectedStatusCode(503)
        assertTrue(error.message?.contains("503") == true)
    }

    @Test
    fun `InvalidURL has non-empty message`() {
        val error = ConsentAPIException.InvalidURL("not-a-url")
        assertNotNull(error.message)
        assertFalse(error.message!!.isEmpty())
    }

    @Test
    fun `NetworkFailure wraps original cause`() {
        val cause = RuntimeException("timeout")
        val error = ConsentAPIException.NetworkFailure(cause)
        assertEquals(cause, error.cause)
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun makeSampleConfig() = ConsentConfig(
        siteId = siteId,
        siteName = "Test Site",
        blockingMode = ConsentConfig.BlockingMode.OPT_IN,
        consentExpiryDays = 365,
        bannerVersion = "v1",
        bannerConfig = ConsentConfig.BannerConfig(),
        categories = emptyList(),
    )
}

// =============================================================================
// Mock API Implementation
// =============================================================================

/**
 * In-memory [ConsentAPIProtocol] implementation for testing without network calls.
 */
class MockConsentAPI : ConsentAPIProtocol {

    // -------------------------------------------------------------------------
    // Configurable behaviour
    // -------------------------------------------------------------------------

    var configToReturn: ConsentConfig? = null
    var errorToThrow: Throwable? = null
    var postConsentError: Throwable? = null

    // -------------------------------------------------------------------------
    // Call tracking
    // -------------------------------------------------------------------------

    var fetchConfigCallCount = 0
        private set
    var postConsentCallCount = 0
        private set
    var lastPostedPayload: ConsentPayload? = null
        private set
    var lastFetchedSiteId: String? = null
        private set

    // -------------------------------------------------------------------------
    // ConsentAPIProtocol
    // -------------------------------------------------------------------------

    override suspend fun fetchConfig(siteId: String): ConsentConfig {
        fetchConfigCallCount++
        lastFetchedSiteId = siteId
        errorToThrow?.let { throw it }
        return configToReturn ?: throw ConsentAPIException.UnexpectedStatusCode(404)
    }

    override suspend fun postConsent(payload: ConsentPayload) {
        postConsentCallCount++
        lastPostedPayload = payload
        postConsentError?.let { throw it }
    }
}
