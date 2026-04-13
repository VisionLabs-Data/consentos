import Foundation

/// Represents the complete consent state for a visitor.
///
/// This model mirrors the web consent cookie structure for cross-platform consistency.
/// It is persisted locally via ``ConsentStorage`` and synced to the server.
public struct ConsentState: Codable, Equatable, Sendable {

    // MARK: - Properties

    /// A stable, anonymous identifier for this device/visitor.
    /// Generated once and persisted across sessions.
    public let visitorId: String

    /// The set of categories the visitor has explicitly accepted.
    public var accepted: Set<ConsentCategory>

    /// The set of categories the visitor has explicitly rejected.
    public var rejected: Set<ConsentCategory>

    /// The timestamp at which consent was last recorded.
    public var consentedAt: Date?

    /// The banner configuration version active when consent was collected.
    /// Used to detect when consent must be re-collected after a config change.
    public var bannerVersion: String?

    /// Whether the user has interacted with the banner (accepted or rejected).
    ///
    /// Returns `false` when the state represents the pre-consent default.
    public var hasInteracted: Bool {
        consentedAt != nil
    }

    // MARK: - Derived State

    /// Returns `true` if the user has granted consent for the given category.
    ///
    /// `necessary` is always considered granted regardless of the stored state.
    public func isGranted(_ category: ConsentCategory) -> Bool {
        guard category != .necessary else { return true }
        return accepted.contains(category)
    }

    /// Returns `true` if the user has explicitly denied consent for the given category.
    public func isDenied(_ category: ConsentCategory) -> Bool {
        guard category != .necessary else { return false }
        return rejected.contains(category)
    }

    // MARK: - Initialisers

    /// Creates a new, blank consent state for the given visitor.
    ///
    /// No categories are accepted or rejected; `consentedAt` is `nil`.
    public init(visitorId: String) {
        self.visitorId = visitorId
        self.accepted = []
        self.rejected = []
        self.consentedAt = nil
        self.bannerVersion = nil
    }

    /// Creates a fully populated consent state.
    public init(
        visitorId: String,
        accepted: Set<ConsentCategory>,
        rejected: Set<ConsentCategory>,
        consentedAt: Date?,
        bannerVersion: String?
    ) {
        self.visitorId = visitorId
        self.accepted = accepted
        self.rejected = rejected
        self.consentedAt = consentedAt
        self.bannerVersion = bannerVersion
    }

    // MARK: - Mutations

    /// Returns a new state with all non-necessary categories accepted.
    public func acceptingAll() -> ConsentState {
        let allOptional = ConsentCategory.allCases.filter { $0.requiresConsent }
        return ConsentState(
            visitorId: visitorId,
            accepted: Set(allOptional),
            rejected: [],
            consentedAt: Date(),
            bannerVersion: bannerVersion
        )
    }

    /// Returns a new state with all non-necessary categories rejected.
    public func rejectingAll() -> ConsentState {
        let allOptional = ConsentCategory.allCases.filter { $0.requiresConsent }
        return ConsentState(
            visitorId: visitorId,
            accepted: [],
            rejected: Set(allOptional),
            consentedAt: Date(),
            bannerVersion: bannerVersion
        )
    }

    /// Returns a new state accepting only the specified categories (and rejecting the rest).
    public func accepting(categories: Set<ConsentCategory>) -> ConsentState {
        let allOptional = Set(ConsentCategory.allCases.filter { $0.requiresConsent })
        let toAccept = categories.filter { $0.requiresConsent }
        let toReject = allOptional.subtracting(toAccept)
        return ConsentState(
            visitorId: visitorId,
            accepted: toAccept,
            rejected: toReject,
            consentedAt: Date(),
            bannerVersion: bannerVersion
        )
    }
}
