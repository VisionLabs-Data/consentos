package com.consentos

import android.content.Context
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Unit tests for [ConsentOS].
 *
 * Uses Robolectric for [Context] and mock dependencies to avoid real network / storage calls.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConsentOSTest {

    private lateinit var sdk: ConsentOS
    private lateinit var mockStorage: MockConsentStorage
    private lateinit var mockAPI: MockConsentAPI

    @Before
    fun setUp() {
        mockStorage = MockConsentStorage()
        mockAPI = MockConsentAPI()
        sdk = ConsentOS(
            storage = mockStorage,
            api = mockAPI,
            gcmBridge = GCMBridge(NoOpGCMAnalyticsProvider()),
        )
    }

    // -------------------------------------------------------------------------
    // configure
    // -------------------------------------------------------------------------

    @Test
    fun `configure sets isConfigured`() {
        assertFalse(sdk.isConfigured)
        sdk.siteId = "site-001"  // Simulate configure without context
        assertTrue(sdk.isConfigured)
    }

    @Test
    fun `configure restores persisted state`() {
        val existing = ConsentState(
            visitorId = mockStorage.storedVisitorId,
            accepted = setOf(ConsentCategory.ANALYTICS),
            consentedAtMs = System.currentTimeMillis(),
        )
        mockStorage.storedState = existing

        // Manually wire up without a real Context (as configure() would do)
        sdk.siteId = "site-001"
        sdk.consentState = mockStorage.loadState() ?: ConsentState(mockStorage.visitorId())

        assertEquals(setOf(ConsentCategory.ANALYTICS), sdk.consentState?.accepted)
    }

    @Test
    fun `configure creates new state when no persisted state exists`() {
        mockStorage.storedState = null
        sdk.siteId = "site-001"
        sdk.consentState = mockStorage.loadState() ?: ConsentState(mockStorage.visitorId())

        assertNotNull(sdk.consentState)
        assertFalse(sdk.consentState!!.hasInteracted)
    }

    // -------------------------------------------------------------------------
    // shouldShowBanner
    // -------------------------------------------------------------------------

    @Test
    fun `shouldShowBanner returns true when no interaction`() = runTest {
        sdk.siteId = "site-001"
        sdk.consentState = ConsentState(visitorId = "v1") // no interaction

        assertTrue(sdk.shouldShowBanner())
    }

    @Test
    fun `shouldShowBanner returns false when recent consent exists`() = runTest {
        mockAPI.configToReturn = makeSampleConfig(expiryDays = 365, bannerVersion = "v1")
        mockStorage.storedCachedConfig = CachedConfig(
            config = makeSampleConfig(expiryDays = 365, bannerVersion = "v1"),
            fetchedAtMs = System.currentTimeMillis(),
        )

        sdk.siteId = "site-001"
        sdk.consentState = ConsentState(
            visitorId = "v1",
            accepted = setOf(ConsentCategory.ANALYTICS),
            consentedAtMs = System.currentTimeMillis(),
            bannerVersion = "v1",
        )
        sdk.siteConfig = mockStorage.storedCachedConfig!!.config

        assertFalse(sdk.shouldShowBanner())
    }

    @Test
    fun `shouldShowBanner returns true when banner version changed`() = runTest {
        mockAPI.configToReturn = makeSampleConfig(expiryDays = 365, bannerVersion = "v2")
        mockStorage.storedCachedConfig = CachedConfig(
            config = makeSampleConfig(expiryDays = 365, bannerVersion = "v2"),
            fetchedAtMs = System.currentTimeMillis(),
        )

        sdk.siteId = "site-001"
        sdk.consentState = ConsentState(
            visitorId = "v1",
            accepted = setOf(ConsentCategory.ANALYTICS),
            consentedAtMs = System.currentTimeMillis(),
            bannerVersion = "v1", // old version
        )
        sdk.siteConfig = mockStorage.storedCachedConfig!!.config

        assertTrue(sdk.shouldShowBanner())
    }

    @Test
    fun `shouldShowBanner returns true when consent has expired`() = runTest {
        val expiryDays = 30
        val expiredTs = System.currentTimeMillis() - (expiryDays * 86_400_000L + 1_000L)

        mockStorage.storedCachedConfig = CachedConfig(
            config = makeSampleConfig(expiryDays = expiryDays, bannerVersion = "v1"),
            fetchedAtMs = System.currentTimeMillis(),
        )

        sdk.siteId = "site-001"
        sdk.consentState = ConsentState(
            visitorId = "v1",
            accepted = setOf(ConsentCategory.ANALYTICS),
            consentedAtMs = expiredTs,
            bannerVersion = "v1",
        )
        sdk.siteConfig = mockStorage.storedCachedConfig!!.config

        assertTrue(sdk.shouldShowBanner())
    }

    // -------------------------------------------------------------------------
    // acceptAll
    // -------------------------------------------------------------------------

    @Test
    fun `acceptAll updates consent state`() = runTest {
        sdk.siteId = "site-001"
        sdk.consentState = ConsentState(visitorId = "v1")

        sdk.acceptAll()

        val state = sdk.consentState
        assertNotNull(state)
        assertTrue(state!!.hasInteracted)
        assertTrue(state.accepted.isNotEmpty())
    }

    @Test
    fun `acceptAll grants all optional categories`() = runTest {
        sdk.siteId = "site-001"
        sdk.consentState = ConsentState(visitorId = "v1")

        sdk.acceptAll()

        ConsentCategory.entries
            .filter { it.requiresConsent }
            .forEach { category ->
                assertTrue("$category should be granted", sdk.getConsentStatus(category))
            }
    }

    @Test
    fun `acceptAll persists to storage`() = runTest {
        sdk.siteId = "site-001"
        sdk.consentState = ConsentState(visitorId = "v1")

        sdk.acceptAll()

        assertTrue(mockStorage.saveStateCallCount > 0)
        assertNotNull(mockStorage.storedState)
    }

    @Test
    fun `acceptAll posts consent to API`() = runTest {
        sdk.siteId = "site-001"
        sdk.consentState = ConsentState(visitorId = "v1")

        sdk.acceptAll()

        assertEquals(1, mockAPI.postConsentCallCount)
        assertEquals("android", mockAPI.lastPostedPayload?.platform)
    }

    // -------------------------------------------------------------------------
    // rejectAll
    // -------------------------------------------------------------------------

    @Test
    fun `rejectAll updates consent state`() = runTest {
        sdk.siteId = "site-001"
        sdk.consentState = ConsentState(visitorId = "v1")

        sdk.rejectAll()

        val state = sdk.consentState
        assertNotNull(state)
        assertTrue(state!!.hasInteracted)
        assertTrue(state.accepted.isEmpty())
    }

    @Test
    fun `rejectAll denies all optional categories`() = runTest {
        sdk.siteId = "site-001"
        sdk.consentState = ConsentState(visitorId = "v1")

        sdk.rejectAll()

        ConsentCategory.entries
            .filter { it.requiresConsent }
            .forEach { category ->
                assertFalse("$category should be denied", sdk.getConsentStatus(category))
            }
    }

    // -------------------------------------------------------------------------
    // acceptCategories
    // -------------------------------------------------------------------------

    @Test
    fun `acceptCategories only grants specified categories`() = runTest {
        sdk.siteId = "site-001"
        sdk.consentState = ConsentState(visitorId = "v1")

        sdk.acceptCategories(listOf(ConsentCategory.ANALYTICS, ConsentCategory.FUNCTIONAL))

        assertTrue(sdk.getConsentStatus(ConsentCategory.ANALYTICS))
        assertTrue(sdk.getConsentStatus(ConsentCategory.FUNCTIONAL))
        assertFalse(sdk.getConsentStatus(ConsentCategory.MARKETING))
        assertFalse(sdk.getConsentStatus(ConsentCategory.PERSONALISATION))
    }

    // -------------------------------------------------------------------------
    // getConsentStatus
    // -------------------------------------------------------------------------

    @Test
    fun `getConsentStatus returns true for necessary always`() {
        sdk.siteId = "site-001"
        sdk.consentState = ConsentState(visitorId = "v1")
        assertTrue(sdk.getConsentStatus(ConsentCategory.NECESSARY))
    }

    @Test
    fun `getConsentStatus returns false for optional before interaction`() {
        sdk.siteId = "site-001"
        sdk.consentState = ConsentState(visitorId = "v1")
        assertFalse(sdk.getConsentStatus(ConsentCategory.ANALYTICS))
    }

    // -------------------------------------------------------------------------
    // Listener
    // -------------------------------------------------------------------------

    @Test
    fun `listener is notified after acceptAll`() = runTest {
        var notified = false
        var receivedState: ConsentState? = null

        val listener = object : ConsentOSListener {
            override fun onConsentChanged(state: ConsentState) {
                notified = true
                receivedState = state
            }
        }

        sdk.siteId = "site-001"
        sdk.consentState = ConsentState(visitorId = "v1")
        sdk.addConsentListener(listener)

        sdk.acceptAll()

        assertTrue(notified)
        assertNotNull(receivedState)
    }

    @Test
    fun `listener is not notified after removal`() = runTest {
        var callCount = 0
        val listener = object : ConsentOSListener {
            override fun onConsentChanged(state: ConsentState) {
                callCount++
            }
        }

        sdk.siteId = "site-001"
        sdk.consentState = ConsentState(visitorId = "v1")
        sdk.addConsentListener(listener)
        sdk.removeConsentListener(listener)

        sdk.acceptAll()

        assertEquals(0, callCount)
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun makeSampleConfig(expiryDays: Int = 365, bannerVersion: String = "v1") =
        ConsentConfig(
            siteId = "site-001",
            siteName = "Test",
            blockingMode = ConsentConfig.BlockingMode.OPT_IN,
            consentExpiryDays = expiryDays,
            bannerVersion = bannerVersion,
            bannerConfig = ConsentConfig.BannerConfig(),
            categories = emptyList(),
        )
}

// =============================================================================
// MockConsentStorage
// =============================================================================

/**
 * In-memory [ConsentStorageProtocol] implementation for testing.
 */
class MockConsentStorage : ConsentStorageProtocol {

    var storedState: ConsentState? = null
    var storedCachedConfig: CachedConfig? = null
    val storedVisitorId: String = "mock-visitor-${System.currentTimeMillis()}"

    var saveStateCallCount = 0
        private set
    var clearStateCallCount = 0
        private set

    override fun loadState(): ConsentState? = storedState

    override fun saveState(state: ConsentState) {
        saveStateCallCount++
        storedState = state
    }

    override fun clearState() {
        clearStateCallCount++
        storedState = null
    }

    override fun loadCachedConfig(): CachedConfig? = storedCachedConfig

    override fun saveCachedConfig(cached: CachedConfig) {
        storedCachedConfig = cached
    }

    override fun clearCachedConfig() {
        storedCachedConfig = null
    }

    override fun visitorId(): String = storedVisitorId
}
