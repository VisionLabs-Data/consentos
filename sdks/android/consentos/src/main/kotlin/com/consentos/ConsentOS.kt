package com.consentos

import android.content.Context
import android.content.Intent
import androidx.fragment.app.FragmentManager
import com.consentos.ui.ConsentBottomSheet
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

// =============================================================================
// Listener Interface
// =============================================================================

/**
 * Receives notifications when the user's consent choices change.
 *
 * Methods are invoked on the main thread.
 */
interface ConsentOSListener {
    /**
     * Called after consent has been updated.
     *
     * @param state The new consent state.
     */
    fun onConsentChanged(state: ConsentState)
}

// =============================================================================
// Broadcast Actions
// =============================================================================

/**
 * Intent action broadcast when consent state changes.
 *
 * The updated [ConsentState] is not included in the broadcast — call
 * [ConsentOS.getConsentStatus] to read the current state.
 */
const val ACTION_CONSENT_CHANGED = "com.consentos.ACTION_CONSENT_CHANGED"

// =============================================================================
// ConsentOS Singleton
// =============================================================================

/**
 * The main entry point for the CMP Android SDK.
 *
 * Use the singleton [instance] to configure the SDK, display the consent banner,
 * and query consent status. All public methods are coroutine-safe.
 *
 * ```kotlin
 * // In Application.onCreate()
 * ConsentOS.instance.configure(
 *     context = applicationContext,
 *     siteId = "my-site-id",
 *     apiBase = "https://api.example.com",
 * )
 *
 * // In your Activity / Fragment
 * lifecycleScope.launch {
 *     if (ConsentOS.instance.shouldShowBanner()) {
 *         ConsentOS.instance.showBanner(supportFragmentManager)
 *     }
 * }
 * ```
 */
class ConsentOS internal constructor(
    private var storage: ConsentStorageProtocol? = null,
    private var api: ConsentAPIProtocol? = null,
    private var gcmBridge: GCMBridge = GCMBridge(),
) {

    // -------------------------------------------------------------------------
    // Singleton
    // -------------------------------------------------------------------------

    companion object {
        /** The shared SDK instance. Configure this before use. */
        @JvmField
        val instance: ConsentOS = ConsentOS()
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /** The site ID set during [configure]. */
    @Volatile
    var siteId: String? = null
        @androidx.annotation.VisibleForTesting internal set

    /** Whether the SDK has been configured. */
    val isConfigured: Boolean get() = siteId != null

    /** The current consent state. `null` until [configure] has been called. */
    @Volatile
    var consentState: ConsentState? = null
        @androidx.annotation.VisibleForTesting internal set

    /** The currently loaded site configuration. `null` until fetched. */
    @Volatile
    var siteConfig: ConsentConfig? = null
        @androidx.annotation.VisibleForTesting internal set

    private val listeners = mutableListOf<ConsentOSListener>()
    private val listenerLock = Any()

    // Mutex guards mutations to consentState and siteConfig across coroutines.
    private val stateMutex = Mutex()

    // Application context used for broadcasting intents.
    @Volatile
    private var appContext: Context? = null

    // Background scope for config refresh and consent sync operations.
    private val sdkScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    // -------------------------------------------------------------------------
    // Configuration
    // -------------------------------------------------------------------------

    /**
     * Configures the SDK with a site ID and API base URL.
     *
     * Must be called before any other method. Loads the persisted consent state
     * and fetches the site configuration in the background.
     *
     * @param context   Application context (used for encrypted storage and broadcasts).
     * @param siteId    The unique identifier for the site (from the CMP dashboard).
     * @param apiBase   Base URL of the CMP API (e.g. `https://api.example.com`).
     * @param gcmProvider Optional GCM analytics provider. Defaults to no-op.
     */
    fun configure(
        context: Context,
        siteId: String,
        apiBase: String,
        gcmProvider: GCMAnalyticsProvider? = null,
    ) {
        this.appContext = context.applicationContext
        this.siteId = siteId

        if (storage == null) {
            storage = ConsentStorage(context.applicationContext)
        }
        if (api == null) {
            api = ConsentAPI(apiBase)
        }
        if (gcmProvider != null) {
            gcmBridge = GCMBridge(gcmProvider)
        }

        // Restore persisted state synchronously so it is immediately available.
        val store = storage!!
        val visitorId = store.visitorId()
        consentState = store.loadState() ?: ConsentState(visitorId = visitorId)

        // Fetch config in the background; apply GCM defaults once available.
        sdkScope.launch { refreshConfigIfNeeded() }
    }

    /**
     * Replaces the API client. Useful for testing or custom transports.
     */
    fun setAPI(api: ConsentAPIProtocol) {
        this.api = api
    }

    // -------------------------------------------------------------------------
    // Banner Display
    // -------------------------------------------------------------------------

    /**
     * Returns `true` if the consent banner should be shown to this visitor.
     *
     * The banner is required when:
     * - The user has not yet interacted (no [ConsentState.consentedAtMs]), or
     * - The stored banner version differs from the current config version, or
     * - The stored consent is older than the site's configured expiry.
     */
    suspend fun shouldShowBanner(): Boolean {
        refreshConfigIfNeeded()

        val state = consentState
        val config = siteConfig

        if (state == null || !state.hasInteracted) return true

        if (config != null && state.consentedAtMs != null) {
            // Check banner version mismatch — re-consent required after config change.
            if (state.bannerVersion != config.bannerVersion) return true

            // Check consent expiry.
            val expiryMs = config.consentExpiryDays * 86_400_000L
            if (System.currentTimeMillis() - state.consentedAtMs > expiryMs) return true
        }

        return false
    }

    /**
     * Presents the consent banner as a [ConsentBottomSheet] attached to the given
     * [FragmentManager].
     *
     * Safe to call from the main thread. The bottom sheet is shown immediately if the
     * fragment manager is in a valid state.
     *
     * @param fragmentManager The [FragmentManager] from the calling Activity or Fragment.
     * @param tag             Optional back-stack tag. Defaults to `"cmp_consent_banner"`.
     */
    fun showBanner(
        fragmentManager: FragmentManager,
        tag: String = "cmp_consent_banner",
    ) {
        val config = siteConfig
        val sheet = ConsentBottomSheet.newInstance(config)
        sheet.show(fragmentManager, tag)
    }

    // -------------------------------------------------------------------------
    // Consent Actions
    // -------------------------------------------------------------------------

    /**
     * Accepts all non-necessary consent categories.
     *
     * Updates local state, syncs to the server, and fires GCM signals.
     */
    suspend fun acceptAll() {
        applyConsent { it.acceptingAll() }
    }

    /**
     * Rejects all non-necessary consent categories.
     */
    suspend fun rejectAll() {
        applyConsent { it.rejectingAll() }
    }

    /**
     * Accepts only the specified [categories] (and rejects all others).
     *
     * @param categories The set of categories to accept.
     */
    suspend fun acceptCategories(categories: List<ConsentCategory>) {
        applyConsent { it.accepting(categories.toSet()) }
    }

    // -------------------------------------------------------------------------
    // Query
    // -------------------------------------------------------------------------

    /**
     * Returns the consent status for a specific [category].
     *
     * @return `true` if consent has been granted, `false` if denied or not yet given.
     */
    fun getConsentStatus(category: ConsentCategory): Boolean =
        consentState?.isGranted(category) ?: (category == ConsentCategory.NECESSARY)

    // -------------------------------------------------------------------------
    // User Identity
    // -------------------------------------------------------------------------

    /**
     * Associates the current visitor with a verified user identity.
     *
     * The JWT is sent alongside subsequent consent records for server-side correlation
     * with authenticated users.
     *
     * @param jwt A signed JWT issued by the host application's auth system.
     */
    fun identifyUser(jwt: String) {
        // Store JWT in plaintext preferences for inclusion in future consent payloads.
        // In a production implementation this would also trigger a re-sync of the consent record.
        appContext?.getSharedPreferences("com_cmp_consent_identity", Context.MODE_PRIVATE)
            ?.edit()
            ?.putString("user_jwt", jwt)
            ?.apply()
    }

    // -------------------------------------------------------------------------
    // Listener Registration
    // -------------------------------------------------------------------------

    /**
     * Registers a [ConsentOSListener] to be notified of consent changes.
     *
     * Listeners are held strongly; call [removeConsentListener] to avoid leaks.
     */
    fun addConsentListener(listener: ConsentOSListener) {
        synchronized(listenerLock) { listeners.add(listener) }
    }

    /**
     * Removes a previously registered [ConsentOSListener].
     */
    fun removeConsentListener(listener: ConsentOSListener) {
        synchronized(listenerLock) { listeners.remove(listener) }
    }

    // -------------------------------------------------------------------------
    // Internal: Config Refresh
    // -------------------------------------------------------------------------

    internal suspend fun refreshConfigIfNeeded(): ConsentConfig? {
        // Return cached config if it is still valid.
        storage?.loadCachedConfig()?.takeUnless { it.isExpired }?.let { cached ->
            stateMutex.withLock { siteConfig = cached.config }
            return cached.config
        }

        val currentSiteId = siteId ?: return null
        val currentApi = api ?: return null

        return runCatching {
            val config = currentApi.fetchConfig(currentSiteId)
            val cached = CachedConfig(config = config, fetchedAtMs = System.currentTimeMillis())
            storage?.saveCachedConfig(cached)

            stateMutex.withLock {
                siteConfig = config
                // Stamp the banner version onto the current state.
                consentState = consentState?.copy(bannerVersion = config.bannerVersion)
            }

            // Apply GCM defaults for new visitors.
            gcmBridge.applyDefaults(config)
            config
        }.getOrNull()
        // Non-fatal — the SDK can operate with cached or default config.
    }

    // -------------------------------------------------------------------------
    // Internal: Apply Consent
    // -------------------------------------------------------------------------

    private suspend fun applyConsent(transform: (ConsentState) -> ConsentState) {
        val newState = stateMutex.withLock {
            val current = consentState ?: return
            val transformed = transform(current)
            // Stamp the current banner version.
            val stamped = transformed.copy(
                bannerVersion = siteConfig?.bannerVersion ?: current.bannerVersion,
            )
            consentState = stamped
            stamped
        }

        // Persist locally.
        storage?.saveState(newState)

        // Signal GCM.
        gcmBridge.applyConsent(newState)

        // Generate TC string.
        val tcString = siteConfig?.let { TCFStringEncoder.encode(newState, it) }

        // Sync to server (best-effort; failures are non-fatal).
        syncConsent(newState, tcString)

        // Notify listeners and broadcast on the main thread.
        withContext(Dispatchers.Main) {
            notifyListeners(newState)
            broadcastConsentChanged()
        }
    }

    private suspend fun syncConsent(state: ConsentState, tcString: String?) {
        val currentSiteId = siteId ?: return
        val currentApi = api ?: return

        val payload = ConsentPayload.from(
            siteId = currentSiteId,
            state = state,
            tcString = tcString,
        ) ?: return

        runCatching { currentApi.postConsent(payload) }
        // Consent is stored locally; server sync failure is non-fatal.
        // In production, implement a retry queue backed by WorkManager.
    }

    private fun notifyListeners(state: ConsentState) {
        val snapshot = synchronized(listenerLock) { listeners.toList() }
        snapshot.forEach { it.onConsentChanged(state) }
    }

    private fun broadcastConsentChanged() {
        appContext?.sendBroadcast(Intent(ACTION_CONSENT_CHANGED))
    }
}
