package com.consentos

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID

// =============================================================================
// Protocol (Interface)
// =============================================================================

/**
 * Abstracts local persistence so the storage layer can be swapped in tests.
 */
interface ConsentStorageProtocol {
    fun loadState(): ConsentState?
    fun saveState(state: ConsentState)
    fun clearState()

    fun loadCachedConfig(): CachedConfig?
    fun saveCachedConfig(cached: CachedConfig)
    fun clearCachedConfig()

    /** Loads or generates a stable visitor ID. */
    fun visitorId(): String
}

// =============================================================================
// EncryptedSharedPreferences Implementation
// =============================================================================

/**
 * Persists consent state and site configuration using [EncryptedSharedPreferences].
 *
 * All keys are namespaced under `com.cmp.consent` to avoid collisions.
 * Uses AES-256 encryption via the AndroidKeyStore.
 *
 * On API 26+ (Android 8.0), [EncryptedSharedPreferences] is the recommended approach
 * for storing sensitive data like consent records.
 */
class ConsentStorage(context: Context) : ConsentStorageProtocol {

    // -------------------------------------------------------------------------
    // Keys
    // -------------------------------------------------------------------------

    private object Keys {
        const val CONSENT_STATE  = "com.cmp.consent.state"
        const val CACHED_CONFIG  = "com.cmp.consent.config"
        const val VISITOR_ID     = "com.cmp.consent.visitorId"
    }

    // -------------------------------------------------------------------------
    // Dependencies
    // -------------------------------------------------------------------------

    private val prefs: SharedPreferences = buildEncryptedPrefs(context)

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    // -------------------------------------------------------------------------
    // ConsentState
    // -------------------------------------------------------------------------

    override fun loadState(): ConsentState? {
        val raw = prefs.getString(Keys.CONSENT_STATE, null) ?: return null
        return runCatching { json.decodeFromString<ConsentState>(raw) }.getOrNull()
    }

    override fun saveState(state: ConsentState) {
        val raw = runCatching { json.encodeToString(state) }.getOrNull() ?: return
        prefs.edit().putString(Keys.CONSENT_STATE, raw).apply()
    }

    override fun clearState() {
        prefs.edit().remove(Keys.CONSENT_STATE).apply()
    }

    // -------------------------------------------------------------------------
    // Cached Config
    // -------------------------------------------------------------------------

    override fun loadCachedConfig(): CachedConfig? {
        val raw = prefs.getString(Keys.CACHED_CONFIG, null) ?: return null
        return runCatching { json.decodeFromString<CachedConfig>(raw) }.getOrNull()
    }

    override fun saveCachedConfig(cached: CachedConfig) {
        val raw = runCatching { json.encodeToString(cached) }.getOrNull() ?: return
        prefs.edit().putString(Keys.CACHED_CONFIG, raw).apply()
    }

    override fun clearCachedConfig() {
        prefs.edit().remove(Keys.CACHED_CONFIG).apply()
    }

    // -------------------------------------------------------------------------
    // Visitor ID
    // -------------------------------------------------------------------------

    /**
     * Returns the persisted visitor ID, generating and saving a new UUID if absent.
     *
     * The visitor ID is stored in a separate, plaintext SharedPreferences file so it
     * persists even if the encrypted preferences are reset.
     */
    override fun visitorId(): String {
        val existing = prefs.getString(Keys.VISITOR_ID, null)
        if (existing != null) return existing
        val newId = UUID.randomUUID().toString()
        prefs.edit().putString(Keys.VISITOR_ID, newId).apply()
        return newId
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun buildEncryptedPrefs(context: Context): SharedPreferences {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        return EncryptedSharedPreferences.create(
            context,
            "com_cmp_consent_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }
}
