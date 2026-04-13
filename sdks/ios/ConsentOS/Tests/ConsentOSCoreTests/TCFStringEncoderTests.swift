import XCTest
@testable import ConsentOSCore

final class TCFStringEncoderTests: XCTestCase {

    // MARK: - Encoding Returns nil Before Interaction

    func test_encode_returnsNil_whenStateHasNoInteraction() {
        let state = ConsentState(visitorId: "v1") // consentedAt is nil
        let config = makeSampleConfig()
        XCTAssertNil(TCFStringEncoder.encode(state: state, config: config))
    }

    // MARK: - Encoding Returns a Non-Empty String After Interaction

    func test_encode_returnsNonEmptyString_afterAcceptAll() {
        let state = ConsentState(visitorId: "v1").acceptingAll()
        let config = makeSampleConfig()
        let result = TCFStringEncoder.encode(state: state, config: config)
        XCTAssertNotNil(result)
        XCTAssertFalse(result!.isEmpty)
    }

    func test_encode_returnsNonEmptyString_afterRejectAll() {
        let state = ConsentState(visitorId: "v1").rejectingAll()
        let config = makeSampleConfig()
        let result = TCFStringEncoder.encode(state: state, config: config)
        XCTAssertNotNil(result)
        XCTAssertFalse(result!.isEmpty)
    }

    // MARK: - Base64url Format

    func test_encode_producesValidBase64url() {
        let state = ConsentState(visitorId: "v1").acceptingAll()
        let config = makeSampleConfig()
        let tcString = TCFStringEncoder.encode(state: state, config: config)!

        // Base64url must not contain standard Base64 characters that were replaced
        XCTAssertFalse(tcString.contains("+"), "TC string must not contain '+'")
        XCTAssertFalse(tcString.contains("/"), "TC string must not contain '/'")
        XCTAssertFalse(tcString.contains("="), "TC string must not contain padding '='")
    }

    func test_encode_producesDecodableBase64() {
        let state = ConsentState(visitorId: "v1").acceptingAll()
        let config = makeSampleConfig()
        let tcString = TCFStringEncoder.encode(state: state, config: config)!

        // Convert back to standard Base64 for decoding
        var base64 = tcString
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        // Pad to multiple of 4
        let remainder = base64.count % 4
        if remainder != 0 {
            base64 += String(repeating: "=", count: 4 - remainder)
        }

        let data = Data(base64Encoded: base64)
        XCTAssertNotNil(data, "TC string should be valid Base64")
        XCTAssertGreaterThan(data!.count, 0)
    }

    // MARK: - Determinism

    func test_encode_producesConsistentOutput_forSameInput() {
        // The encoder uses a fixed timestamp, so two calls with the same state
        // should produce strings of the same length (timestamps differ slightly).
        let consentDate = Date(timeIntervalSince1970: 1_700_000_000)
        let state = ConsentState(
            visitorId: "v1",
            accepted: [.analytics, .marketing],
            rejected: [.functional, .personalisation],
            consentedAt: consentDate,
            bannerVersion: "v1"
        )
        let config = makeSampleConfig()

        let result1 = TCFStringEncoder.encode(state: state, config: config)
        let result2 = TCFStringEncoder.encode(state: state, config: config)

        XCTAssertEqual(result1, result2)
    }

    // MARK: - Different States Produce Different Strings

    func test_encode_producesDistinctStrings_forAcceptAllVsRejectAll() {
        let consentDate = Date(timeIntervalSince1970: 1_700_000_000)
        let acceptedState = ConsentState(
            visitorId: "v1",
            accepted: Set(ConsentCategory.allCases.filter { $0.requiresConsent }),
            rejected: [],
            consentedAt: consentDate,
            bannerVersion: nil
        )
        let rejectedState = ConsentState(
            visitorId: "v1",
            accepted: [],
            rejected: Set(ConsentCategory.allCases.filter { $0.requiresConsent }),
            consentedAt: consentDate,
            bannerVersion: nil
        )
        let config = makeSampleConfig()

        let tcAccepted = TCFStringEncoder.encode(state: acceptedState, config: config)
        let tcRejected = TCFStringEncoder.encode(state: rejectedState, config: config)

        XCTAssertNotEqual(tcAccepted, tcRejected)
    }

    // MARK: - Minimum Length

    func test_encode_producesStringOfReasonableLength() {
        let state = ConsentState(visitorId: "v1").acceptingAll()
        let config = makeSampleConfig()
        let tcString = TCFStringEncoder.encode(state: state, config: config)!

        // A valid core TC string serialises to at least ~20 bytes before Base64url encoding
        // (the first 6 bits alone carry the version). 28 chars is a reasonable lower bound.
        XCTAssertGreaterThan(tcString.count, 28, "TC string appears too short")
    }

    // MARK: - Helpers

    private func makeSampleConfig() -> ConsentConfig {
        ConsentConfig(
            siteId: "site-001",
            siteName: "Test Site",
            blockingMode: .optIn,
            consentExpiryDays: 365,
            bannerVersion: "v1",
            bannerConfig: ConsentConfig.BannerConfig(),
            categories: []
        )
    }
}
