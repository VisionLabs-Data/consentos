import Foundation

/// The effective site configuration loaded from the CMP API.
///
/// Maps to the response of `GET {apiBase}/api/v1/config/sites/{siteId}/effective`.
/// The configuration drives banner display, theming, blocking mode, and consent expiry.
public struct ConsentConfig: Codable, Sendable {

    // MARK: - Top-level Fields

    /// Unique identifier for the site.
    public let siteId: String

    /// Human-readable name for the site.
    public let siteName: String

    /// The blocking mode determining the default consent model.
    public let blockingMode: BlockingMode

    /// Consent validity in days. After expiry the banner is shown again.
    public let consentExpiryDays: Int

    /// The current version of this configuration.
    /// Stored alongside consent records to detect when re-consent is needed.
    public let bannerVersion: String

    /// Banner display and theming configuration.
    public let bannerConfig: BannerConfig

    /// Available categories for this site.
    public let categories: [CategoryConfig]

    // MARK: - Initialiser

    public init(
        siteId: String,
        siteName: String,
        blockingMode: BlockingMode,
        consentExpiryDays: Int,
        bannerVersion: String,
        bannerConfig: BannerConfig,
        categories: [CategoryConfig]
    ) {
        self.siteId = siteId
        self.siteName = siteName
        self.blockingMode = blockingMode
        self.consentExpiryDays = consentExpiryDays
        self.bannerVersion = bannerVersion
        self.bannerConfig = bannerConfig
        self.categories = categories
    }

    // MARK: - Blocking Mode

    /// The consent model applied to visitors.
    public enum BlockingMode: String, Codable, Sendable {
        /// User must opt in before non-essential scripts run (GDPR default).
        case optIn = "opt_in"
        /// Non-essential scripts run by default; user may opt out (CCPA default).
        case optOut = "opt_out"
        /// Informational notice only; no blocking.
        case informational
    }

    // MARK: - Banner Configuration

    /// Visual and behavioural configuration for the consent banner.
    public struct BannerConfig: Codable, Sendable {
        /// Display mode controlling the banner layout.
        public let displayMode: DisplayMode

        /// Primary background colour as a hex string (e.g. `"#FFFFFF"`).
        public let backgroundColor: String?

        /// Primary text colour as a hex string.
        public let textColor: String?

        /// Accent colour used for buttons and highlights.
        public let accentColor: String?

        /// Text for the "Accept all" button.
        public let acceptButtonText: String?

        /// Text for the "Reject all" button.
        public let rejectButtonText: String?

        /// Text for the "Manage preferences" button.
        public let manageButtonText: String?

        /// The banner title text.
        public let title: String?

        /// The banner body copy.
        public let description: String?

        /// URL for the site's privacy policy.
        public let privacyPolicyUrl: String?

        public enum DisplayMode: String, Codable, Sendable {
            case overlay
            case bottomBanner = "bottom_banner"
            case topBanner = "top_banner"
            case cornerPopup = "corner_popup"
            case inline
        }

        // Default-value initialiser used in tests and previews
        public init(
            displayMode: DisplayMode = .bottomBanner,
            backgroundColor: String? = nil,
            textColor: String? = nil,
            accentColor: String? = nil,
            acceptButtonText: String? = nil,
            rejectButtonText: String? = nil,
            manageButtonText: String? = nil,
            title: String? = nil,
            description: String? = nil,
            privacyPolicyUrl: String? = nil
        ) {
            self.displayMode = displayMode
            self.backgroundColor = backgroundColor
            self.textColor = textColor
            self.accentColor = accentColor
            self.acceptButtonText = acceptButtonText
            self.rejectButtonText = rejectButtonText
            self.manageButtonText = manageButtonText
            self.title = title
            self.description = description
            self.privacyPolicyUrl = privacyPolicyUrl
        }
    }

    // MARK: - Category Configuration

    /// Per-category configuration as returned by the API.
    public struct CategoryConfig: Codable, Sendable {
        /// Machine-readable category key (matches ``ConsentCategory`` raw values).
        public let key: String
        /// Whether this category is enabled for this site.
        public let enabled: Bool
        /// Overridden display name (falls back to ``ConsentCategory/displayName`` if absent).
        public let displayName: String?
        /// Overridden description text.
        public let description: String?

        public init(key: String, enabled: Bool, displayName: String?, description: String?) {
            self.key = key
            self.enabled = enabled
            self.displayName = displayName
            self.description = description
        }

        /// Resolves to the matching ``ConsentCategory``, if the key is recognised.
        public var category: ConsentCategory? {
            ConsentCategory(rawValue: key)
        }
    }

    // MARK: - Convenience

    /// Returns only the enabled ``ConsentCategory`` values for this config.
    public var enabledCategories: [ConsentCategory] {
        categories.compactMap { cfg in
            guard cfg.enabled else { return nil }
            return cfg.category
        }
    }
}

// MARK: - Cached Config Wrapper

/// Wraps a ``ConsentConfig`` with metadata needed for cache invalidation.
public struct CachedConfig: Codable {
    public let config: ConsentConfig
    public let fetchedAt: Date

    /// The cache TTL in seconds (10 minutes by default).
    public static let ttl: TimeInterval = 600

    public var isExpired: Bool {
        Date().timeIntervalSince(fetchedAt) > CachedConfig.ttl
    }

    public init(config: ConsentConfig, fetchedAt: Date) {
        self.config = config
        self.fetchedAt = fetchedAt
    }
}
