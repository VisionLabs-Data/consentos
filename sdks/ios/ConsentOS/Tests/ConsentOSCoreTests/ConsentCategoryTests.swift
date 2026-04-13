import XCTest
@testable import ConsentOSCore

final class ConsentCategoryTests: XCTestCase {

    // MARK: - requiresConsent

    func test_necessary_doesNotRequireConsent() {
        XCTAssertFalse(ConsentCategory.necessary.requiresConsent)
    }

    func test_allOtherCategories_requireConsent() {
        let optionalCategories = ConsentCategory.allCases.filter { $0 != .necessary }
        for category in optionalCategories {
            XCTAssertTrue(category.requiresConsent, "\(category) should require consent")
        }
    }

    // MARK: - GCM Mappings

    func test_necessary_hasNoGCMType() {
        XCTAssertNil(ConsentCategory.necessary.gcmConsentType)
    }

    func test_functional_mapsToFunctionalityStorage() {
        XCTAssertEqual(ConsentCategory.functional.gcmConsentType, "functionality_storage")
    }

    func test_analytics_mapsToAnalyticsStorage() {
        XCTAssertEqual(ConsentCategory.analytics.gcmConsentType, "analytics_storage")
    }

    func test_marketing_mapsToAdStorage() {
        XCTAssertEqual(ConsentCategory.marketing.gcmConsentType, "ad_storage")
    }

    func test_personalisation_mapsToPersonalizationStorage() {
        XCTAssertEqual(ConsentCategory.personalisation.gcmConsentType, "personalization_storage")
    }

    // MARK: - TCF Purpose IDs

    func test_necessary_hasNoTCFPurposes() {
        XCTAssertTrue(ConsentCategory.necessary.tcfPurposeIds.isEmpty)
    }

    func test_functional_hasExpectedTCFPurposes() {
        XCTAssertEqual(ConsentCategory.functional.tcfPurposeIds, [1])
    }

    func test_analytics_hasExpectedTCFPurposes() {
        XCTAssertEqual(ConsentCategory.analytics.tcfPurposeIds, [7, 8, 9, 10])
    }

    func test_marketing_hasExpectedTCFPurposes() {
        XCTAssertEqual(ConsentCategory.marketing.tcfPurposeIds, [2, 3, 4])
    }

    func test_personalisation_hasExpectedTCFPurposes() {
        XCTAssertEqual(ConsentCategory.personalisation.tcfPurposeIds, [5, 6])
    }

    // MARK: - Display Names

    func test_allCategories_haveNonEmptyDisplayNames() {
        for category in ConsentCategory.allCases {
            XCTAssertFalse(category.displayName.isEmpty, "\(category) missing display name")
            XCTAssertFalse(category.displayDescription.isEmpty, "\(category) missing description")
        }
    }

    // MARK: - Codable

    func test_category_roundTripsViaJSON() throws {
        for category in ConsentCategory.allCases {
            let encoded = try JSONEncoder().encode(category)
            let decoded = try JSONDecoder().decode(ConsentCategory.self, from: encoded)
            XCTAssertEqual(decoded, category)
        }
    }

    func test_category_decodesFromRawValue() throws {
        let json = #""analytics""#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(ConsentCategory.self, from: json)
        XCTAssertEqual(decoded, .analytics)
    }

    // MARK: - CaseIterable

    func test_allCases_containsFiveCategories() {
        XCTAssertEqual(ConsentCategory.allCases.count, 5)
    }

    func test_allCases_containsExpectedMembers() {
        let expected: Set<ConsentCategory> = [
            .necessary, .functional, .analytics, .marketing, .personalisation
        ]
        XCTAssertEqual(Set(ConsentCategory.allCases), expected)
    }
}
