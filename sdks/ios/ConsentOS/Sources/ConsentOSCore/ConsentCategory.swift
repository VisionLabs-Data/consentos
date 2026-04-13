/// Consent categories matching the platform's taxonomy.
///
/// Each category maps to IAB TCF v2.2 purposes and Google Consent Mode consent types.
/// The `necessary` category is always granted and cannot be revoked by the user.
public enum ConsentCategory: String, CaseIterable, Codable, Sendable {
    /// Strictly necessary cookies — always allowed, no consent required.
    case necessary

    /// Functional / preference cookies (e.g. language, saved settings).
    case functional

    /// Analytics / statistics cookies (e.g. page views, session data).
    case analytics

    /// Marketing / advertising cookies (e.g. retargeting, personalised ads).
    case marketing

    /// Personalisation cookies (e.g. content recommendations).
    case personalisation

    // MARK: - TCF Mappings

    /// IAB TCF v2.2 purpose IDs associated with this category.
    ///
    /// Returns an empty array for `necessary`, which does not require consent purposes.
    public var tcfPurposeIds: [Int] {
        switch self {
        case .necessary:
            return []
        case .functional:
            return [1]          // Store and/or access information on a device
        case .analytics:
            return [7, 8, 9, 10] // Measurement, market research, product development
        case .marketing:
            return [2, 3, 4]    // Select basic/personalised ads, create ad profile
        case .personalisation:
            return [5, 6]       // Create content profile, select personalised content
        }
    }

    // MARK: - Google Consent Mode Mappings

    /// Google Consent Mode v2 consent type string for this category.
    ///
    /// Returns `nil` for categories that do not have a direct GCM mapping.
    public var gcmConsentType: String? {
        switch self {
        case .necessary:
            return nil
        case .functional:
            return "functionality_storage"
        case .analytics:
            return "analytics_storage"
        case .marketing:
            return "ad_storage"
        case .personalisation:
            return "personalization_storage"
        }
    }

    // MARK: - Display

    /// Human-readable display name for the category (British English).
    public var displayName: String {
        switch self {
        case .necessary:
            return "Strictly Necessary"
        case .functional:
            return "Functional"
        case .analytics:
            return "Analytics"
        case .marketing:
            return "Marketing"
        case .personalisation:
            return "Personalisation"
        }
    }

    /// Brief description of the category for banner display.
    public var displayDescription: String {
        switch self {
        case .necessary:
            return "Essential for the website to function. These cannot be disabled."
        case .functional:
            return "Enable enhanced functionality such as remembering your preferences."
        case .analytics:
            return "Help us understand how visitors interact with the website."
        case .marketing:
            return "Used to deliver relevant advertisements and track ad campaign performance."
        case .personalisation:
            return "Allow us to personalise content based on your interests."
        }
    }

    /// Whether consent for this category is required before storing data.
    ///
    /// `necessary` is exempt from consent requirements under ePrivacy regulations.
    public var requiresConsent: Bool {
        self != .necessary
    }
}
