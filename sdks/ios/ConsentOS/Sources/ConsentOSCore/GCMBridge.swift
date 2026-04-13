import Foundation

// MARK: - GCM Consent Types

/// The Google Consent Mode v2 consent type strings.
public enum GCMConsentType: String, CaseIterable, Sendable {
    case analyticsStorage     = "analytics_storage"
    case adStorage            = "ad_storage"
    case adUserData           = "ad_user_data"
    case adPersonalisation    = "ad_personalization"
    case functionalityStorage = "functionality_storage"
    case personalisationStorage = "personalization_storage"
    case securityStorage      = "security_storage"
}

/// The granted/denied status for a GCM consent type.
public enum GCMConsentStatus: String, Sendable {
    case granted = "granted"
    case denied  = "denied"
}

// MARK: - GCM Analytics Provider Protocol

/// Abstracts the Firebase Analytics / Google Tag Manager call surface.
///
/// Conforming types should call the underlying GCM API. The default no-op
/// implementation is used when Firebase is not present.
public protocol GCMAnalyticsProvider: AnyObject, Sendable {
    /// Sets the default consent state before any interaction.
    func setConsentDefaults(_ defaults: [String: String])

    /// Updates consent state after the user interacts with the banner.
    func updateConsent(_ updates: [String: String])
}

// MARK: - No-Op Provider

/// A no-op ``GCMAnalyticsProvider`` used when Firebase Analytics is not linked.
public final class NoOpGCMAnalyticsProvider: GCMAnalyticsProvider, @unchecked Sendable {
    public init() {}
    public func setConsentDefaults(_ defaults: [String: String]) {}
    public func updateConsent(_ updates: [String: String]) {}
}

// MARK: - GCM Bridge

/// Maps CMP consent state to Google Consent Mode v2 signals.
///
/// On app launch, call ``applyDefaults(config:)`` before the user interacts.
/// After consent is collected, call ``applyConsent(state:)`` to update GCM.
///
/// To integrate with Firebase Analytics, implement ``GCMAnalyticsProvider`` and
/// call the `Firebase.Analytics.setConsent(_:)` API inside it.
public final class GCMBridge: @unchecked Sendable {

    // MARK: - Dependencies

    private let provider: any GCMAnalyticsProvider

    // MARK: - Initialiser

    /// - Parameter provider: The analytics provider to forward consent signals to.
    ///                       Defaults to a no-op implementation.
    public init(provider: any GCMAnalyticsProvider = NoOpGCMAnalyticsProvider()) {
        self.provider = provider
    }

    // MARK: - Public API

    /// Sends default (pre-consent) consent signals to GCM based on the site's blocking mode.
    ///
    /// Call this as early as possible — ideally before any analytics events are sent.
    ///
    /// - Parameter config: The effective site configuration.
    public func applyDefaults(config: ConsentConfig) {
        let defaults = buildDefaults(for: config.blockingMode)
        provider.setConsentDefaults(defaults)
    }

    /// Updates GCM consent signals to reflect the user's explicit choices.
    ///
    /// - Parameter state: The resolved consent state after user interaction.
    public func applyConsent(state: ConsentState) {
        let updates = buildConsentMap(from: state)
        provider.updateConsent(updates)
    }

    // MARK: - Private Helpers

    /// Builds the default GCM consent map based on blocking mode.
    ///
    /// - `opt_in`: all types denied by default (GDPR).
    /// - `opt_out`: all types granted by default (CCPA).
    /// - `informational`: all types granted.
    private func buildDefaults(for mode: ConsentConfig.BlockingMode) -> [String: String] {
        let status: GCMConsentStatus = mode == .optIn ? .denied : .granted
        return Dictionary(
            uniqueKeysWithValues: GCMConsentType.allCases.map {
                ($0.rawValue, status.rawValue)
            }
        )
    }

    /// Maps the consent state's accepted/rejected categories to GCM consent type values.
    private func buildConsentMap(from state: ConsentState) -> [String: String] {
        var map: [String: String] = [:]

        // security_storage is always granted — it is necessary for security.
        map[GCMConsentType.securityStorage.rawValue] = GCMConsentStatus.granted.rawValue

        for category in ConsentCategory.allCases {
            guard let gcmType = category.gcmConsentType else { continue }
            let status: GCMConsentStatus = state.isGranted(category) ? .granted : .denied
            map[gcmType] = status.rawValue
        }

        // ad_user_data and ad_personalization follow the marketing category.
        let marketingGranted = state.isGranted(.marketing)
        map[GCMConsentType.adUserData.rawValue] = marketingGranted
            ? GCMConsentStatus.granted.rawValue
            : GCMConsentStatus.denied.rawValue
        map[GCMConsentType.adPersonalisation.rawValue] = marketingGranted
            ? GCMConsentStatus.granted.rawValue
            : GCMConsentStatus.denied.rawValue

        return map
    }
}
