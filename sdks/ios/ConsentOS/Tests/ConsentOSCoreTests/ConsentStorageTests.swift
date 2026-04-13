import XCTest
@testable import ConsentOSCore

final class ConsentStorageTests: XCTestCase {

    // Use a unique suite per test run to avoid state bleed
    private var storage: ConsentStorage!
    private let suiteName = "com.cmp.tests.\(UUID().uuidString)"

    override func setUp() {
        super.setUp()
        storage = ConsentStorage(suiteName: suiteName)
    }

    override func tearDown() {
        // Clean up the UserDefaults suite after each test
        UserDefaults(suiteName: suiteName)?.removePersistentDomain(forName: suiteName)
        super.tearDown()
    }

    // MARK: - Consent State

    func test_loadState_returnsNil_whenNothingStored() {
        XCTAssertNil(storage.loadState())
    }

    func test_saveAndLoadState_roundTrips() {
        let state = ConsentState(
            visitorId: "visitor-abc",
            accepted: [.analytics, .functional],
            rejected: [.marketing],
            consentedAt: Date(timeIntervalSince1970: 1_700_000_000),
            bannerVersion: "v3"
        )

        storage.saveState(state)
        let loaded = storage.loadState()

        XCTAssertNotNil(loaded)
        XCTAssertEqual(loaded?.visitorId, state.visitorId)
        XCTAssertEqual(loaded?.accepted, state.accepted)
        XCTAssertEqual(loaded?.rejected, state.rejected)
        XCTAssertEqual(loaded?.bannerVersion, state.bannerVersion)
    }

    func test_clearState_removesStoredState() {
        let state = ConsentState(visitorId: "test-visitor")
        storage.saveState(state)
        storage.clearState()
        XCTAssertNil(storage.loadState())
    }

    func test_saveState_overwritesPreviousState() {
        let state1 = ConsentState(visitorId: "visitor-1")
        let state2 = ConsentState(
            visitorId: "visitor-1",
            accepted: [.analytics],
            rejected: [],
            consentedAt: Date(),
            bannerVersion: "v2"
        )

        storage.saveState(state1)
        storage.saveState(state2)

        let loaded = storage.loadState()
        XCTAssertEqual(loaded?.accepted, [.analytics])
    }

    // MARK: - Cached Config

    func test_loadCachedConfig_returnsNil_whenNothingStored() {
        XCTAssertNil(storage.loadCachedConfig())
    }

    func test_saveAndLoadCachedConfig_roundTrips() {
        let config = makeSampleConfig()
        let cached = CachedConfig(config: config, fetchedAt: Date())

        storage.saveCachedConfig(cached)
        let loaded = storage.loadCachedConfig()

        XCTAssertNotNil(loaded)
        XCTAssertEqual(loaded?.config.siteId, config.siteId)
        XCTAssertEqual(loaded?.config.bannerVersion, config.bannerVersion)
    }

    func test_clearCachedConfig_removesStoredConfig() {
        let config = makeSampleConfig()
        let cached = CachedConfig(config: config, fetchedAt: Date())
        storage.saveCachedConfig(cached)
        storage.clearCachedConfig()
        XCTAssertNil(storage.loadCachedConfig())
    }

    // MARK: - Cache TTL

    func test_cachedConfig_isNotExpired_whenFetchedJustNow() {
        let cached = CachedConfig(config: makeSampleConfig(), fetchedAt: Date())
        XCTAssertFalse(cached.isExpired)
    }

    func test_cachedConfig_isExpired_whenFetchedOverTTLAgo() {
        let pastDate = Date(timeIntervalSinceNow: -(CachedConfig.ttl + 1))
        let cached = CachedConfig(config: makeSampleConfig(), fetchedAt: pastDate)
        XCTAssertTrue(cached.isExpired)
    }

    func test_cachedConfig_isNotExpired_whenFetchedJustBeforeTTL() {
        let almostExpired = Date(timeIntervalSinceNow: -(CachedConfig.ttl - 1))
        let cached = CachedConfig(config: makeSampleConfig(), fetchedAt: almostExpired)
        XCTAssertFalse(cached.isExpired)
    }

    // MARK: - Visitor ID

    func test_visitorId_isGeneratedAndPersisted() {
        let id1 = storage.visitorId()
        let id2 = storage.visitorId()
        XCTAssertEqual(id1, id2)
        XCTAssertFalse(id1.isEmpty)
    }

    func test_visitorId_isAValidUUID() {
        let id = storage.visitorId()
        XCTAssertNotNil(UUID(uuidString: id), "Visitor ID should be a valid UUID")
    }

    func test_visitorId_isDifferentAcrossFreshInstances() {
        let suite2 = "com.cmp.tests.\(UUID().uuidString)"
        let storage2 = ConsentStorage(suiteName: suite2)
        defer {
            UserDefaults(suiteName: suite2)?.removePersistentDomain(forName: suite2)
        }

        let id1 = storage.visitorId()
        let id2 = storage2.visitorId()
        XCTAssertNotEqual(id1, id2)
    }

    // MARK: - Helpers

    private func makeSampleConfig() -> ConsentConfig {
        ConsentConfig(
            siteId: "site-test-001",
            siteName: "Test Site",
            blockingMode: .optIn,
            consentExpiryDays: 365,
            bannerVersion: "v1",
            bannerConfig: ConsentConfig.BannerConfig(),
            categories: [
                ConsentConfig.CategoryConfig(
                    key: "necessary",
                    enabled: true,
                    displayName: nil,
                    description: nil
                ),
                ConsentConfig.CategoryConfig(
                    key: "analytics",
                    enabled: true,
                    displayName: nil,
                    description: nil
                )
            ]
        )
    }
}
