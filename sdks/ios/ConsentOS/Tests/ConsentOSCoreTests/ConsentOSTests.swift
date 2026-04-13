import XCTest
@testable import ConsentOSCore

// MARK: - Mock Storage

final class MockConsentStorage: ConsentStorageProtocol, @unchecked Sendable {

    var storedState: ConsentState?
    var storedCachedConfig: CachedConfig?
    var storedVisitorId: String = UUID().uuidString

    private(set) var saveStateCallCount = 0
    private(set) var clearStateCallCount = 0

    func loadState() -> ConsentState? { storedState }

    func saveState(_ state: ConsentState) {
        saveStateCallCount += 1
        storedState = state
    }

    func clearState() {
        clearStateCallCount += 1
        storedState = nil
    }

    func loadCachedConfig() -> CachedConfig? { storedCachedConfig }

    func saveCachedConfig(_ cached: CachedConfig) {
        storedCachedConfig = cached
    }

    func clearCachedConfig() {
        storedCachedConfig = nil
    }

    func visitorId() -> String { storedVisitorId }
}

// MARK: - Tests

final class ConsentOSTests: XCTestCase {

    private var sdk: ConsentOS!
    private var mockStorage: MockConsentStorage!
    private var mockAPI: MockConsentAPI!

    override func setUp() {
        super.setUp()
        mockStorage = MockConsentStorage()
        mockAPI = MockConsentAPI()
        sdk = ConsentOS(storage: mockStorage, api: mockAPI)
    }

    // MARK: - Configuration

    func test_configure_setsIsConfigured() {
        XCTAssertFalse(sdk.isConfigured)
        sdk.configure(
            siteId: "site-001",
            apiBase: URL(string: "https://api.example.com")!
        )
        XCTAssertTrue(sdk.isConfigured)
    }

    func test_configure_setsSiteId() {
        sdk.configure(siteId: "my-site", apiBase: URL(string: "https://api.example.com")!)
        XCTAssertEqual(sdk.siteId, "my-site")
    }

    func test_configure_restoresPersistedState() {
        let existing = ConsentState(
            visitorId: mockStorage.storedVisitorId,
            accepted: [.analytics],
            rejected: [],
            consentedAt: Date(),
            bannerVersion: "v1"
        )
        mockStorage.storedState = existing

        sdk.configure(siteId: "site-001", apiBase: URL(string: "https://api.example.com")!)

        XCTAssertEqual(sdk.consentState?.accepted, [.analytics])
    }

    func test_configure_createsNewState_whenNoPersistedState() {
        mockStorage.storedState = nil
        sdk.configure(siteId: "site-001", apiBase: URL(string: "https://api.example.com")!)

        XCTAssertNotNil(sdk.consentState)
        XCTAssertFalse(sdk.consentState!.hasInteracted)
    }

    // MARK: - shouldShowBanner

    func test_shouldShowBanner_returnsTrue_whenNoInteraction() async {
        sdk.configure(siteId: "site-001", apiBase: URL(string: "https://api.example.com")!)
        // State has no interaction (consentedAt is nil)
        let shouldShow = await sdk.shouldShowBanner()
        XCTAssertTrue(shouldShow)
    }

    func test_shouldShowBanner_returnsFalse_whenRecentConsentExists() async {
        mockAPI.configToReturn = makeSampleConfig(expiryDays: 365, bannerVersion: "v1")

        let recent = ConsentState(
            visitorId: "v1",
            accepted: [.analytics],
            rejected: [.marketing, .functional, .personalisation],
            consentedAt: Date(), // just now
            bannerVersion: "v1"
        )
        mockStorage.storedState = recent
        // Pre-load cached config so shouldShowBanner sees it
        mockStorage.storedCachedConfig = CachedConfig(
            config: makeSampleConfig(expiryDays: 365, bannerVersion: "v1"),
            fetchedAt: Date()
        )

        sdk.configure(siteId: "site-001", apiBase: URL(string: "https://api.example.com")!)

        let shouldShow = await sdk.shouldShowBanner()
        XCTAssertFalse(shouldShow)
    }

    func test_shouldShowBanner_returnsTrue_whenBannerVersionChanged() async {
        mockAPI.configToReturn = makeSampleConfig(expiryDays: 365, bannerVersion: "v2")

        let state = ConsentState(
            visitorId: "v1",
            accepted: [.analytics],
            rejected: [],
            consentedAt: Date(),
            bannerVersion: "v1" // old version
        )
        mockStorage.storedState = state
        mockStorage.storedCachedConfig = CachedConfig(
            config: makeSampleConfig(expiryDays: 365, bannerVersion: "v2"),
            fetchedAt: Date()
        )

        sdk.configure(siteId: "site-001", apiBase: URL(string: "https://api.example.com")!)

        let shouldShow = await sdk.shouldShowBanner()
        XCTAssertTrue(shouldShow)
    }

    func test_shouldShowBanner_returnsTrue_whenConsentExpired() async {
        let expiryDays = 30
        let consentedAt = Date(timeIntervalSinceNow: -Double(expiryDays * 86_400 + 1))

        let state = ConsentState(
            visitorId: "v1",
            accepted: [.analytics],
            rejected: [],
            consentedAt: consentedAt,
            bannerVersion: "v1"
        )
        mockStorage.storedState = state
        mockStorage.storedCachedConfig = CachedConfig(
            config: makeSampleConfig(expiryDays: expiryDays, bannerVersion: "v1"),
            fetchedAt: Date()
        )

        sdk.configure(siteId: "site-001", apiBase: URL(string: "https://api.example.com")!)

        let shouldShow = await sdk.shouldShowBanner()
        XCTAssertTrue(shouldShow)
    }

    // MARK: - acceptAll

    func test_acceptAll_updatesConsentState() async {
        sdk.configure(siteId: "site-001", apiBase: URL(string: "https://api.example.com")!)
        await sdk.acceptAll()

        let state = sdk.consentState
        XCTAssertNotNil(state)
        XCTAssertTrue(state!.hasInteracted)
        XCTAssertFalse(state!.accepted.isEmpty)
    }

    func test_acceptAll_grantsAllOptionalCategories() async {
        sdk.configure(siteId: "site-001", apiBase: URL(string: "https://api.example.com")!)
        await sdk.acceptAll()

        for category in ConsentCategory.allCases where category.requiresConsent {
            XCTAssertTrue(sdk.getConsentStatus(for: category), "\(category) should be granted")
        }
    }

    func test_acceptAll_persistsToStorage() async {
        sdk.configure(siteId: "site-001", apiBase: URL(string: "https://api.example.com")!)
        await sdk.acceptAll()

        XCTAssertGreaterThan(mockStorage.saveStateCallCount, 0)
        XCTAssertNotNil(mockStorage.storedState)
    }

    func test_acceptAll_postsConsentToAPI() async {
        sdk.configure(siteId: "site-001", apiBase: URL(string: "https://api.example.com")!)
        await sdk.acceptAll()

        XCTAssertEqual(mockAPI.postConsentCallCount, 1)
        XCTAssertEqual(mockAPI.lastPostedPayload?.platform, "ios")
    }

    // MARK: - rejectAll

    func test_rejectAll_updatesConsentState() async {
        sdk.configure(siteId: "site-001", apiBase: URL(string: "https://api.example.com")!)
        await sdk.rejectAll()

        let state = sdk.consentState
        XCTAssertNotNil(state)
        XCTAssertTrue(state!.hasInteracted)
        XCTAssertTrue(state!.accepted.isEmpty)
    }

    func test_rejectAll_deniesAllOptionalCategories() async {
        sdk.configure(siteId: "site-001", apiBase: URL(string: "https://api.example.com")!)
        await sdk.rejectAll()

        for category in ConsentCategory.allCases where category.requiresConsent {
            XCTAssertFalse(sdk.getConsentStatus(for: category), "\(category) should be denied")
        }
    }

    // MARK: - acceptCategories

    func test_acceptCategories_onlyGrantsSpecifiedCategories() async {
        sdk.configure(siteId: "site-001", apiBase: URL(string: "https://api.example.com")!)
        await sdk.acceptCategories([.analytics, .functional])

        XCTAssertTrue(sdk.getConsentStatus(for: .analytics))
        XCTAssertTrue(sdk.getConsentStatus(for: .functional))
        XCTAssertFalse(sdk.getConsentStatus(for: .marketing))
        XCTAssertFalse(sdk.getConsentStatus(for: .personalisation))
    }

    // MARK: - getConsentStatus

    func test_getConsentStatus_returnsTrue_forNecessary_always() {
        sdk.configure(siteId: "site-001", apiBase: URL(string: "https://api.example.com")!)
        XCTAssertTrue(sdk.getConsentStatus(for: .necessary))
    }

    func test_getConsentStatus_returnsFalse_forOptional_beforeInteraction() {
        sdk.configure(siteId: "site-001", apiBase: URL(string: "https://api.example.com")!)
        XCTAssertFalse(sdk.getConsentStatus(for: .analytics))
    }

    // MARK: - Delegate

    func test_delegate_isNotifiedAfterAcceptAll() async {
        class MockDelegate: ConsentOSDelegate {
            var didChangeCalled = false
            var receivedState: ConsentState?

            func consentDidChange(_ state: ConsentState) {
                didChangeCalled = true
                receivedState = state
            }
        }

        let delegate = MockDelegate()
        sdk.delegate = delegate
        sdk.configure(siteId: "site-001", apiBase: URL(string: "https://api.example.com")!)
        await sdk.acceptAll()

        // Allow the MainActor dispatch to complete
        await Task.yield()
        await Task.yield()

        XCTAssertTrue(delegate.didChangeCalled)
        XCTAssertNotNil(delegate.receivedState)
    }

    // MARK: - Helpers

    private func makeSampleConfig(expiryDays: Int = 365, bannerVersion: String = "v1") -> ConsentConfig {
        ConsentConfig(
            siteId: "site-001",
            siteName: "Test",
            blockingMode: .optIn,
            consentExpiryDays: expiryDays,
            bannerVersion: bannerVersion,
            bannerConfig: ConsentConfig.BannerConfig(),
            categories: []
        )
    }
}
