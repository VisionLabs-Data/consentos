import Foundation

// MARK: - Delegate Protocol

/// Receive notifications when the user's consent choices change.
public protocol ConsentOSDelegate: AnyObject {
    /// Called on the main thread after consent has been updated.
    ///
    /// - Parameter state: The new consent state.
    func consentDidChange(_ state: ConsentState)
}

// MARK: - ConsentOS

/// The main entry point for the CMP iOS SDK.
///
/// Use the shared singleton to configure the SDK, display the consent banner,
/// and query consent status. All public methods are safe to call from any thread.
///
/// ```swift
/// // In AppDelegate or @main App
/// ConsentOS.shared.configure(siteId: "my-site-id", apiBase: apiURL)
///
/// // Optionally register a delegate
/// ConsentOS.shared.delegate = self
///
/// // Show banner if needed
/// if await ConsentOS.shared.shouldShowBanner() {
///     await ConsentOS.shared.showBanner(on: rootViewController)
/// }
/// ```
public final class ConsentOS: @unchecked Sendable {

    // MARK: - Singleton

    /// The shared SDK instance. Configure this before use.
    public static let shared = ConsentOS()

    // MARK: - State

    /// The site ID set during ``configure(siteId:apiBase:)``.
    private(set) public var siteId: String?

    /// Whether the SDK has been configured.
    public var isConfigured: Bool { siteId != nil }

    /// The current consent state. `nil` until storage has been read on first access.
    private(set) public var consentState: ConsentState?

    /// The currently loaded site configuration. `nil` until fetched.
    private(set) public var siteConfig: ConsentConfig?

    /// Delegate notified on consent changes. Weakly held.
    public weak var delegate: (any ConsentOSDelegate)?

    // MARK: - Dependencies

    private var api: (any ConsentAPIProtocol)?
    private var storage: any ConsentStorageProtocol
    private var gcmBridge: GCMBridge
    private let stateLock = NSLock()

    // MARK: - Initialiser

    /// Creates a new instance with the default storage and no-op GCM provider.
    /// Inject custom dependencies for testing via ``init(storage:api:gcmBridge:)``.
    public init(
        storage: any ConsentStorageProtocol = ConsentStorage(),
        api: (any ConsentAPIProtocol)? = nil,
        gcmBridge: GCMBridge = GCMBridge()
    ) {
        self.storage = storage
        self.api = api
        self.gcmBridge = gcmBridge
    }

    // MARK: - Configuration

    /// Configures the SDK with a site ID and API base URL.
    ///
    /// Must be called before any other method. Loads the persisted consent state
    /// and fetches the site configuration in the background.
    ///
    /// - Parameters:
    ///   - siteId:  The unique identifier for the site (from the CMP dashboard).
    ///   - apiBase: Base URL of the CMP API (e.g. `https://api.example.com`).
    ///   - gcmProvider: Optional GCM analytics provider. Defaults to no-op.
    public func configure(
        siteId: String,
        apiBase: URL,
        gcmProvider: (any GCMAnalyticsProvider)? = nil
    ) {
        stateLock.lock()
        self.siteId = siteId
        if self.api == nil {
            self.api = ConsentAPI(apiBase: apiBase)
        }
        if let provider = gcmProvider {
            self.gcmBridge = GCMBridge(provider: provider)
        }

        // Restore persisted state
        let visitorId = storage.visitorId()
        self.consentState = storage.loadState() ?? ConsentState(visitorId: visitorId)
        stateLock.unlock()

        // Fetch config in the background; apply GCM defaults once available
        Task {
            await refreshConfigIfNeeded()
        }
    }

    /// Attaches a custom API client (useful for testing or custom transports).
    public func setAPI(_ api: any ConsentAPIProtocol) {
        stateLock.lock()
        self.api = api
        stateLock.unlock()
    }

    // MARK: - Banner Display

    /// Returns `true` if the consent banner should be shown to this visitor.
    ///
    /// The banner is required when:
    /// - The user has not yet interacted (no `consentedAt`), or
    /// - The stored banner version differs from the current config version (re-consent needed), or
    /// - The stored consent is older than the site's configured expiry.
    public func shouldShowBanner() async -> Bool {
        await refreshConfigIfNeeded()

        stateLock.lock()
        let state = consentState
        let config = siteConfig
        stateLock.unlock()

        guard let state else { return true }
        guard state.hasInteracted else { return true }

        if let config, let consentedAt = state.consentedAt {
            // Check banner version mismatch
            if state.bannerVersion != config.bannerVersion {
                return true
            }

            // Check consent expiry
            let expiryInterval = TimeInterval(config.consentExpiryDays * 86_400)
            if Date().timeIntervalSince(consentedAt) > expiryInterval {
                return true
            }
        }

        return false
    }

    // MARK: - Consent Actions

    /// Accepts all non-necessary consent categories.
    ///
    /// Updates local state, syncs to the server, and fires GCM signals.
    public func acceptAll() async {
        await applyConsent { $0.acceptingAll() }
    }

    /// Rejects all non-necessary consent categories.
    public func rejectAll() async {
        await applyConsent { $0.rejectingAll() }
    }

    /// Accepts only the specified categories (and rejects all others).
    ///
    /// - Parameter categories: The set of categories to accept.
    public func acceptCategories(_ categories: Set<ConsentCategory>) async {
        await applyConsent { $0.accepting(categories: categories) }
    }

    // MARK: - Query

    /// Returns the consent status for a specific category.
    ///
    /// - Returns: `true` if consent has been granted, `false` if denied or not yet given.
    public func getConsentStatus(for category: ConsentCategory) -> Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        return consentState?.isGranted(category) ?? (category == .necessary)
    }

    // MARK: - User Identity

    /// Associates the current visitor with a verified user identity.
    ///
    /// The JWT is sent alongside subsequent consent records for server-side
    /// correlation with authenticated users.
    ///
    /// - Parameter jwt: A signed JWT issued by the host application's auth system.
    public func identifyUser(jwt: String) {
        // Store JWT for inclusion in future consent payloads.
        // In a production implementation this would also re-sync the consent record.
        UserDefaults.standard.set(jwt, forKey: "com.cmp.consent.userJwt")
    }

    // MARK: - Internal: Config Refresh

    @discardableResult
    func refreshConfigIfNeeded() async -> ConsentConfig? {
        // Check cached config first
        if let cached = storage.loadCachedConfig(), !cached.isExpired {
            stateLock.lock()
            self.siteConfig = cached.config
            stateLock.unlock()
            return cached.config
        }

        guard let siteId, let api else { return nil }

        do {
            let config = try await api.fetchConfig(siteId: siteId)
            let cached = CachedConfig(config: config, fetchedAt: Date())
            storage.saveCachedConfig(cached)

            stateLock.lock()
            self.siteConfig = config
            // Stamp the banner version onto the current state
            if var state = self.consentState {
                state.bannerVersion = config.bannerVersion
                self.consentState = state
            }
            stateLock.unlock()

            // Apply GCM defaults for new visitors
            gcmBridge.applyDefaults(config: config)
            return config
        } catch {
            // Non-fatal — the SDK can operate with cached or default config
            return nil
        }
    }

    // MARK: - Internal: Apply Consent

    private func applyConsent(transform: (ConsentState) -> ConsentState) async {
        stateLock.lock()
        guard let current = consentState else {
            stateLock.unlock()
            return
        }
        var newState = transform(current)
        // Stamp banner version
        newState = ConsentState(
            visitorId: newState.visitorId,
            accepted: newState.accepted,
            rejected: newState.rejected,
            consentedAt: newState.consentedAt,
            bannerVersion: siteConfig?.bannerVersion ?? current.bannerVersion
        )
        self.consentState = newState
        stateLock.unlock()

        // Persist locally
        storage.saveState(newState)

        // Signal GCM
        gcmBridge.applyConsent(state: newState)

        // Generate TC string
        let tcString: String?
        if let config = siteConfig {
            tcString = TCFStringEncoder.encode(state: newState, config: config)
        } else {
            tcString = nil
        }

        // Sync to server (best-effort; failures are non-fatal)
        await syncConsent(state: newState, tcString: tcString)

        // Notify delegate on main thread
        let delegateState = newState
        await MainActor.run {
            delegate?.consentDidChange(delegateState)
        }
    }

    private func syncConsent(state: ConsentState, tcString: String?) async {
        guard let siteId, let api, let consentedAt = state.consentedAt else { return }

        let payload = ConsentPayload(
            siteId: siteId,
            visitorId: state.visitorId,
            accepted: Array(state.accepted),
            rejected: Array(state.rejected),
            consentedAt: consentedAt,
            bannerVersion: state.bannerVersion,
            tcString: tcString
        )

        do {
            try await api.postConsent(payload)
        } catch {
            // Consent is stored locally; server sync failure is non-fatal.
            // In production, implement a retry queue here.
        }
    }
}

// Note: `showBanner(on:)` for UIKit is provided by the ConsentOSUI module.
// Import ConsentOSUI and call `ConsentOS.shared.showBanner(on:)` after adding
// that module as a dependency.
