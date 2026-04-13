import XCTest
@testable import ConsentOSCore

final class ConsentStateTests: XCTestCase {

    private let visitorId = "test-visitor-123"

    // MARK: - Initial State

    func test_newState_hasNoInteraction() {
        let state = ConsentState(visitorId: visitorId)
        XCTAssertFalse(state.hasInteracted)
        XCTAssertNil(state.consentedAt)
        XCTAssertTrue(state.accepted.isEmpty)
        XCTAssertTrue(state.rejected.isEmpty)
    }

    func test_newState_preservesVisitorId() {
        let state = ConsentState(visitorId: visitorId)
        XCTAssertEqual(state.visitorId, visitorId)
    }

    // MARK: - isGranted

    func test_necessary_isAlwaysGranted() {
        let state = ConsentState(visitorId: visitorId) // no interaction
        XCTAssertTrue(state.isGranted(.necessary))
    }

    func test_optional_isNotGranted_whenNoInteraction() {
        let state = ConsentState(visitorId: visitorId)
        for category in ConsentCategory.allCases where category != .necessary {
            XCTAssertFalse(state.isGranted(category), "\(category) should not be granted by default")
        }
    }

    func test_accepted_category_isGranted() {
        let state = ConsentState(
            visitorId: visitorId,
            accepted: [.analytics],
            rejected: [],
            consentedAt: Date(),
            bannerVersion: nil
        )
        XCTAssertTrue(state.isGranted(.analytics))
    }

    func test_rejected_category_isNotGranted() {
        let state = ConsentState(
            visitorId: visitorId,
            accepted: [],
            rejected: [.analytics],
            consentedAt: Date(),
            bannerVersion: nil
        )
        XCTAssertFalse(state.isGranted(.analytics))
    }

    // MARK: - isDenied

    func test_necessary_isNeverDenied() {
        let state = ConsentState(
            visitorId: visitorId,
            accepted: [],
            rejected: [.analytics],
            consentedAt: Date(),
            bannerVersion: nil
        )
        XCTAssertFalse(state.isDenied(.necessary))
    }

    func test_rejected_category_isDenied() {
        let state = ConsentState(
            visitorId: visitorId,
            accepted: [],
            rejected: [.marketing],
            consentedAt: Date(),
            bannerVersion: nil
        )
        XCTAssertTrue(state.isDenied(.marketing))
    }

    // MARK: - acceptingAll()

    func test_acceptingAll_grantsAllOptionalCategories() {
        let state = ConsentState(visitorId: visitorId)
        let accepted = state.acceptingAll()

        let expected = Set(ConsentCategory.allCases.filter { $0.requiresConsent })
        XCTAssertEqual(accepted.accepted, expected)
        XCTAssertTrue(accepted.rejected.isEmpty)
    }

    func test_acceptingAll_setsConsentedAt() {
        let before = Date()
        let state = ConsentState(visitorId: visitorId).acceptingAll()
        XCTAssertNotNil(state.consentedAt)
        XCTAssertGreaterThanOrEqual(state.consentedAt!, before)
    }

    func test_acceptingAll_preservesVisitorId() {
        let state = ConsentState(visitorId: visitorId).acceptingAll()
        XCTAssertEqual(state.visitorId, visitorId)
    }

    func test_acceptingAll_hasInteracted() {
        let state = ConsentState(visitorId: visitorId).acceptingAll()
        XCTAssertTrue(state.hasInteracted)
    }

    // MARK: - rejectingAll()

    func test_rejectingAll_emptiesAccepted() {
        let state = ConsentState(visitorId: visitorId)
        let rejected = state.rejectingAll()
        XCTAssertTrue(rejected.accepted.isEmpty)
    }

    func test_rejectingAll_rejectsAllOptionalCategories() {
        let state = ConsentState(visitorId: visitorId).rejectingAll()
        let expected = Set(ConsentCategory.allCases.filter { $0.requiresConsent })
        XCTAssertEqual(state.rejected, expected)
    }

    func test_rejectingAll_setsConsentedAt() {
        let state = ConsentState(visitorId: visitorId).rejectingAll()
        XCTAssertNotNil(state.consentedAt)
    }

    // MARK: - accepting(categories:)

    func test_acceptingCategories_onlyAcceptsSpecified() {
        let state = ConsentState(visitorId: visitorId)
        let result = state.accepting(categories: [.analytics, .functional])

        XCTAssertTrue(result.accepted.contains(.analytics))
        XCTAssertTrue(result.accepted.contains(.functional))
        XCTAssertFalse(result.accepted.contains(.marketing))
        XCTAssertFalse(result.accepted.contains(.personalisation))
    }

    func test_acceptingCategories_rejectsRemainder() {
        let state = ConsentState(visitorId: visitorId)
        let result = state.accepting(categories: [.analytics])

        XCTAssertTrue(result.rejected.contains(.marketing))
        XCTAssertTrue(result.rejected.contains(.functional))
        XCTAssertTrue(result.rejected.contains(.personalisation))
    }

    func test_acceptingCategories_ignoresNecessary() {
        let state = ConsentState(visitorId: visitorId)
        // Passing .necessary should not land in accepted/rejected sets
        let result = state.accepting(categories: [.necessary])
        XCTAssertFalse(result.accepted.contains(.necessary))
    }

    func test_acceptingEmptySet_rejectsAll() {
        let state = ConsentState(visitorId: visitorId)
        let result = state.accepting(categories: [])
        XCTAssertTrue(result.accepted.isEmpty)
        let expectedRejected = Set(ConsentCategory.allCases.filter { $0.requiresConsent })
        XCTAssertEqual(result.rejected, expectedRejected)
    }

    // MARK: - Codable

    func test_state_roundTripsViaJSON() throws {
        let original = ConsentState(
            visitorId: visitorId,
            accepted: [.analytics, .functional],
            rejected: [.marketing],
            consentedAt: Date(timeIntervalSince1970: 1_700_000_000),
            bannerVersion: "v2"
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let data = try encoder.encode(original)
        let decoded = try decoder.decode(ConsentState.self, from: data)

        XCTAssertEqual(decoded.visitorId, original.visitorId)
        XCTAssertEqual(decoded.accepted, original.accepted)
        XCTAssertEqual(decoded.rejected, original.rejected)
        XCTAssertEqual(decoded.bannerVersion, original.bannerVersion)
        // Date round-trip: allow 1-second tolerance for ISO8601 sub-second truncation
        XCTAssertEqual(
            decoded.consentedAt!.timeIntervalSince1970,
            original.consentedAt!.timeIntervalSince1970,
            accuracy: 1.0
        )
    }

    // MARK: - Equatable

    func test_twoStatesWithSameValues_areEqual() {
        let date = Date(timeIntervalSince1970: 1_000_000)
        let a = ConsentState(visitorId: visitorId, accepted: [.analytics], rejected: [], consentedAt: date, bannerVersion: "v1")
        let b = ConsentState(visitorId: visitorId, accepted: [.analytics], rejected: [], consentedAt: date, bannerVersion: "v1")
        XCTAssertEqual(a, b)
    }

    func test_twoStatesWithDifferentAccepted_areNotEqual() {
        let date = Date(timeIntervalSince1970: 1_000_000)
        let a = ConsentState(visitorId: visitorId, accepted: [.analytics], rejected: [], consentedAt: date, bannerVersion: nil)
        let b = ConsentState(visitorId: visitorId, accepted: [.marketing], rejected: [], consentedAt: date, bannerVersion: nil)
        XCTAssertNotEqual(a, b)
    }
}
