import XCTest
@testable import ConsentOSCore

// MARK: - Mock API

/// In-memory API implementation for testing without network calls.
final class MockConsentAPI: ConsentAPIProtocol, @unchecked Sendable {

    // MARK: - Configurable Behaviour

    var configToReturn: ConsentConfig?
    var errorToThrow: Error?
    var postConsentError: Error?

    // MARK: - Call Tracking

    private(set) var fetchConfigCallCount = 0
    private(set) var postConsentCallCount = 0
    private(set) var lastPostedPayload: ConsentPayload?
    private(set) var lastFetchedSiteId: String?

    func fetchConfig(siteId: String) async throws -> ConsentConfig {
        fetchConfigCallCount += 1
        lastFetchedSiteId = siteId
        if let error = errorToThrow { throw error }
        guard let config = configToReturn else {
            throw ConsentAPIError.unexpectedStatusCode(404)
        }
        return config
    }

    func postConsent(_ payload: ConsentPayload) async throws {
        postConsentCallCount += 1
        lastPostedPayload = payload
        if let error = postConsentError { throw error }
    }
}

// MARK: - Tests

final class ConsentAPITests: XCTestCase {

    private var mockAPI: MockConsentAPI!
    private let siteId = "test-site-001"

    override func setUp() {
        super.setUp()
        mockAPI = MockConsentAPI()
    }

    // MARK: - fetchConfig

    func test_fetchConfig_returnsConfig_whenSuccessful() async throws {
        mockAPI.configToReturn = makeSampleConfig()

        let result = try await mockAPI.fetchConfig(siteId: siteId)

        XCTAssertEqual(result.siteId, siteId)
        XCTAssertEqual(mockAPI.fetchConfigCallCount, 1)
        XCTAssertEqual(mockAPI.lastFetchedSiteId, siteId)
    }

    func test_fetchConfig_throwsError_onNetworkFailure() async {
        mockAPI.errorToThrow = ConsentAPIError.networkFailure(
            NSError(domain: "NSURLErrorDomain", code: -1009)
        )

        do {
            _ = try await mockAPI.fetchConfig(siteId: siteId)
            XCTFail("Expected an error to be thrown")
        } catch ConsentAPIError.networkFailure {
            // Expected
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func test_fetchConfig_throwsError_on404() async {
        mockAPI.errorToThrow = ConsentAPIError.unexpectedStatusCode(404)

        do {
            _ = try await mockAPI.fetchConfig(siteId: siteId)
            XCTFail("Expected an error to be thrown")
        } catch ConsentAPIError.unexpectedStatusCode(let code) {
            XCTAssertEqual(code, 404)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - postConsent

    func test_postConsent_sendsCorrectPayload() async throws {
        let consentedAt = Date(timeIntervalSince1970: 1_700_000_000)
        let payload = ConsentPayload(
            siteId: siteId,
            visitorId: "visitor-xyz",
            accepted: [.analytics, .functional],
            rejected: [.marketing],
            consentedAt: consentedAt,
            bannerVersion: "v2",
            tcString: "test-tc-string"
        )

        try await mockAPI.postConsent(payload)

        XCTAssertEqual(mockAPI.postConsentCallCount, 1)
        let sent = try XCTUnwrap(mockAPI.lastPostedPayload)
        XCTAssertEqual(sent.siteId, siteId)
        XCTAssertEqual(sent.visitorId, "visitor-xyz")
        XCTAssertEqual(sent.platform, "ios")
        XCTAssertTrue(sent.accepted.contains("analytics"))
        XCTAssertTrue(sent.accepted.contains("functional"))
        XCTAssertTrue(sent.rejected.contains("marketing"))
        XCTAssertEqual(sent.bannerVersion, "v2")
        XCTAssertEqual(sent.tcString, "test-tc-string")
    }

    func test_postConsent_platformAlwaysIOS() async throws {
        let payload = ConsentPayload(
            siteId: siteId,
            visitorId: "v",
            accepted: [],
            rejected: [],
            consentedAt: Date(),
            bannerVersion: nil
        )

        try await mockAPI.postConsent(payload)

        XCTAssertEqual(mockAPI.lastPostedPayload?.platform, "ios")
    }

    func test_postConsent_throwsError_onFailure() async {
        mockAPI.postConsentError = ConsentAPIError.unexpectedStatusCode(500)

        let payload = ConsentPayload(
            siteId: siteId,
            visitorId: "v",
            accepted: [],
            rejected: [],
            consentedAt: Date(),
            bannerVersion: nil
        )

        do {
            try await mockAPI.postConsent(payload)
            XCTFail("Expected error")
        } catch ConsentAPIError.unexpectedStatusCode(let code) {
            XCTAssertEqual(code, 500)
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    // MARK: - ConsentPayload Serialisation

    func test_consentPayload_encodesCategoriesToRawValues() throws {
        let payload = ConsentPayload(
            siteId: "s1",
            visitorId: "v1",
            accepted: [.analytics, .marketing],
            rejected: [.functional],
            consentedAt: Date(),
            bannerVersion: nil
        )

        XCTAssertTrue(payload.accepted.contains("analytics"))
        XCTAssertTrue(payload.accepted.contains("marketing"))
        XCTAssertTrue(payload.rejected.contains("functional"))
        XCTAssertFalse(payload.accepted.contains("necessary"))
    }

    // MARK: - Error Descriptions

    func test_invalidURL_hasDescription() {
        let error = ConsentAPIError.invalidURL
        XCTAssertNotNil(error.errorDescription)
        XCTAssertFalse(error.errorDescription!.isEmpty)
    }

    func test_unexpectedStatusCode_includesCodeInDescription() {
        let error = ConsentAPIError.unexpectedStatusCode(503)
        XCTAssertTrue(error.errorDescription?.contains("503") ?? false)
    }

    // MARK: - Helpers

    private func makeSampleConfig() -> ConsentConfig {
        ConsentConfig(
            siteId: siteId,
            siteName: "Test Site",
            blockingMode: .optIn,
            consentExpiryDays: 365,
            bannerVersion: "v1",
            bannerConfig: ConsentConfig.BannerConfig(),
            categories: []
        )
    }
}
