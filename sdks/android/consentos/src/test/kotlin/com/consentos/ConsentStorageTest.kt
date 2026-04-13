package com.consentos

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Unit tests for [ConsentStorage].
 *
 * Robolectric is used to provide an Android [Context] and emulate
 * [EncryptedSharedPreferences] without a device or emulator.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConsentStorageTest {

    private lateinit var storage: ConsentStorage

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        storage = ConsentStorage(context)
        // Wipe state between tests.
        storage.clearState()
        storage.clearCachedConfig()
    }

    // -------------------------------------------------------------------------
    // ConsentState
    // -------------------------------------------------------------------------

    @Test
    fun `loadState returns null when no state is stored`() {
        assertNull(storage.loadState())
    }

    @Test
    fun `saveState and loadState round-trip a ConsentState`() {
        val original = ConsentState(
            visitorId = "visitor-abc",
            accepted = setOf(ConsentCategory.ANALYTICS, ConsentCategory.FUNCTIONAL),
            rejected = setOf(ConsentCategory.MARKETING),
            consentedAtMs = 1_700_000_000_000L,
            bannerVersion = "v2",
        )

        storage.saveState(original)
        val loaded = storage.loadState()

        assertNotNull(loaded)
        assertEquals(original.visitorId, loaded!!.visitorId)
        assertEquals(original.accepted, loaded.accepted)
        assertEquals(original.rejected, loaded.rejected)
        assertEquals(original.consentedAtMs, loaded.consentedAtMs)
        assertEquals(original.bannerVersion, loaded.bannerVersion)
    }

    @Test
    fun `clearState removes stored state`() {
        val state = ConsentState(visitorId = "v1").acceptingAll()
        storage.saveState(state)
        storage.clearState()
        assertNull(storage.loadState())
    }

    @Test
    fun `saveState overwrites previous state`() {
        val first = ConsentState(visitorId = "v1").acceptingAll()
        val second = ConsentState(visitorId = "v1").rejectingAll()

        storage.saveState(first)
        storage.saveState(second)

        val loaded = storage.loadState()
        assertNotNull(loaded)
        assertTrue(loaded!!.accepted.isEmpty())
    }

    // -------------------------------------------------------------------------
    // CachedConfig
    // -------------------------------------------------------------------------

    @Test
    fun `loadCachedConfig returns null when nothing is stored`() {
        assertNull(storage.loadCachedConfig())
    }

    @Test
    fun `saveCachedConfig and loadCachedConfig round-trip a CachedConfig`() {
        val config = makeSampleConfig()
        val cached = CachedConfig(config = config, fetchedAtMs = 1_700_000_000_000L)

        storage.saveCachedConfig(cached)
        val loaded = storage.loadCachedConfig()

        assertNotNull(loaded)
        assertEquals(cached.config.siteId, loaded!!.config.siteId)
        assertEquals(cached.fetchedAtMs, loaded.fetchedAtMs)
    }

    @Test
    fun `clearCachedConfig removes stored config`() {
        val config = makeSampleConfig()
        storage.saveCachedConfig(CachedConfig(config = config, fetchedAtMs = System.currentTimeMillis()))
        storage.clearCachedConfig()
        assertNull(storage.loadCachedConfig())
    }

    // -------------------------------------------------------------------------
    // Visitor ID
    // -------------------------------------------------------------------------

    @Test
    fun `visitorId returns a non-empty UUID-like string`() {
        val id = storage.visitorId()
        assertNotNull(id)
        assertTrue(id.isNotEmpty())
        // UUIDs are 36 characters: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        assertEquals(36, id.length)
    }

    @Test
    fun `visitorId returns the same value on subsequent calls`() {
        val first = storage.visitorId()
        val second = storage.visitorId()
        assertEquals(first, second)
    }

    @Test
    fun `two distinct storage instances share the same visitor ID`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val storage2 = ConsentStorage(context)
        val id1 = storage.visitorId()
        val id2 = storage2.visitorId()
        assertEquals(id1, id2)
    }

    // -------------------------------------------------------------------------
    // CachedConfig Expiry
    // -------------------------------------------------------------------------

    @Test
    fun `CachedConfig is not expired when freshly created`() {
        val cached = CachedConfig(
            config = makeSampleConfig(),
            fetchedAtMs = System.currentTimeMillis(),
        )
        assertTrue(!cached.isExpired)
    }

    @Test
    fun `CachedConfig is expired when older than TTL`() {
        val tooOldMs = System.currentTimeMillis() - CachedConfig.TTL_MS - 1_000L
        val cached = CachedConfig(
            config = makeSampleConfig(),
            fetchedAtMs = tooOldMs,
        )
        assertTrue(cached.isExpired)
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
