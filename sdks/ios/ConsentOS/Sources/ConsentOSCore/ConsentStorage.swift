import Foundation

// MARK: - Protocol

/// Abstracts local persistence so the storage layer can be swapped in tests.
public protocol ConsentStorageProtocol: Sendable {
    func loadState() -> ConsentState?
    func saveState(_ state: ConsentState)
    func clearState()

    func loadCachedConfig() -> CachedConfig?
    func saveCachedConfig(_ cached: CachedConfig)
    func clearCachedConfig()

    /// Loads or generates a stable visitor ID.
    func visitorId() -> String
}

// MARK: - UserDefaults Implementation

/// Persists consent state and site configuration in `UserDefaults`.
///
/// All keys are namespaced under `com.cmp.consent` to avoid collisions.
public final class ConsentStorage: ConsentStorageProtocol, @unchecked Sendable {

    // MARK: - Keys

    private enum Keys {
        static let consentState = "com.cmp.consent.state"
        static let cachedConfig = "com.cmp.consent.config"
        static let visitorId    = "com.cmp.consent.visitorId"
    }

    // MARK: - Dependencies

    private let defaults: UserDefaults
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    // MARK: - Initialiser

    /// Creates a storage instance backed by the given `UserDefaults` suite.
    ///
    /// - Parameter suiteName: Pass a custom suite name to isolate storage per app group.
    ///                        Defaults to `nil`, which uses `UserDefaults.standard`.
    public init(suiteName: String? = nil) {
        self.defaults = UserDefaults(suiteName: suiteName) ?? .standard

        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        self.encoder = enc

        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        self.decoder = dec
    }

    // MARK: - ConsentState

    public func loadState() -> ConsentState? {
        guard let data = defaults.data(forKey: Keys.consentState) else { return nil }
        return try? decoder.decode(ConsentState.self, from: data)
    }

    public func saveState(_ state: ConsentState) {
        guard let data = try? encoder.encode(state) else { return }
        defaults.set(data, forKey: Keys.consentState)
    }

    public func clearState() {
        defaults.removeObject(forKey: Keys.consentState)
    }

    // MARK: - Cached Config

    public func loadCachedConfig() -> CachedConfig? {
        guard let data = defaults.data(forKey: Keys.cachedConfig) else { return nil }
        return try? decoder.decode(CachedConfig.self, from: data)
    }

    public func saveCachedConfig(_ cached: CachedConfig) {
        guard let data = try? encoder.encode(cached) else { return }
        defaults.set(data, forKey: Keys.cachedConfig)
    }

    public func clearCachedConfig() {
        defaults.removeObject(forKey: Keys.cachedConfig)
    }

    // MARK: - Visitor ID

    /// Returns the persisted visitor ID, generating and saving a new UUID if absent.
    public func visitorId() -> String {
        if let existing = defaults.string(forKey: Keys.visitorId) {
            return existing
        }
        let newId = UUID().uuidString
        defaults.set(newId, forKey: Keys.visitorId)
        return newId
    }
}
