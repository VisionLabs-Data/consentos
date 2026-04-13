import Foundation

// MARK: - Protocol

/// Abstracts the network layer for testability.
public protocol ConsentAPIProtocol: Sendable {
    /// Fetches the effective site configuration from the API.
    func fetchConfig(siteId: String) async throws -> ConsentConfig

    /// Posts a consent record to the server.
    func postConsent(_ payload: ConsentPayload) async throws
}

// MARK: - Errors

/// Errors that can be thrown by the CMP API client.
public enum ConsentAPIError: Error, LocalizedError {
    case invalidURL
    case unexpectedStatusCode(Int)
    case decodingFailure(Error)
    case networkFailure(Error)

    public var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "The constructed API URL is invalid."
        case .unexpectedStatusCode(let code):
            return "The server returned an unexpected HTTP status code: \(code)."
        case .decodingFailure(let underlying):
            return "Failed to decode the server response: \(underlying.localizedDescription)"
        case .networkFailure(let underlying):
            return "A network error occurred: \(underlying.localizedDescription)"
        }
    }
}

// MARK: - Consent Payload

/// The request body sent when recording a consent event.
public struct ConsentPayload: Codable, Sendable {
    public let siteId: String
    public let visitorId: String
    public let platform: String          // Always "ios"
    public let accepted: [String]        // ConsentCategory raw values
    public let rejected: [String]
    public let consentedAt: Date
    public let bannerVersion: String?
    public let userAgent: String?
    public let tcString: String?

    public init(
        siteId: String,
        visitorId: String,
        accepted: [ConsentCategory],
        rejected: [ConsentCategory],
        consentedAt: Date,
        bannerVersion: String?,
        userAgent: String? = nil,
        tcString: String? = nil
    ) {
        self.siteId = siteId
        self.visitorId = visitorId
        self.platform = "ios"
        self.accepted = accepted.map(\.rawValue)
        self.rejected = rejected.map(\.rawValue)
        self.consentedAt = consentedAt
        self.bannerVersion = bannerVersion
        self.userAgent = userAgent
        self.tcString = tcString
    }
}

// MARK: - Live Implementation

/// URLSession-backed API client that communicates with the CMP API.
public final class ConsentAPI: ConsentAPIProtocol, @unchecked Sendable {

    private let apiBase: URL
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    // MARK: - Initialiser

    /// - Parameters:
    ///   - apiBase: The base URL of the CMP API (e.g. `https://api.example.com`).
    ///   - session: Defaults to `URLSession.shared`; inject a custom session in tests.
    public init(apiBase: URL, session: URLSession = .shared) {
        self.apiBase = apiBase
        self.session = session

        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        dec.keyDecodingStrategy = .convertFromSnakeCase
        self.decoder = dec

        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        enc.keyEncodingStrategy = .convertToSnakeCase
        self.encoder = enc
    }

    // MARK: - ConsentAPIProtocol

    public func fetchConfig(siteId: String) async throws -> ConsentConfig {
        let url = apiBase
            .appendingPathComponent("api/v1/config/sites")
            .appendingPathComponent(siteId)
            .appendingPathComponent("effective")

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(sdkUserAgent, forHTTPHeaderField: "User-Agent")

        let (data, response) = try await performRequest(request)
        try validateResponse(response)

        do {
            return try decoder.decode(ConsentConfig.self, from: data)
        } catch {
            throw ConsentAPIError.decodingFailure(error)
        }
    }

    public func postConsent(_ payload: ConsentPayload) async throws {
        let url = apiBase.appendingPathComponent("api/v1/consent")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(sdkUserAgent, forHTTPHeaderField: "User-Agent")

        do {
            request.httpBody = try encoder.encode(payload)
        } catch {
            throw ConsentAPIError.decodingFailure(error)
        }

        let (_, response) = try await performRequest(request)
        try validateResponse(response)
    }

    // MARK: - Private Helpers

    private func performRequest(_ request: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await session.data(for: request)
        } catch {
            throw ConsentAPIError.networkFailure(error)
        }
    }

    private func validateResponse(_ response: URLResponse) throws {
        guard let httpResponse = response as? HTTPURLResponse else { return }
        guard (200..<300).contains(httpResponse.statusCode) else {
            throw ConsentAPIError.unexpectedStatusCode(httpResponse.statusCode)
        }
    }

    private var sdkUserAgent: String {
        "ConsentOS-iOS/1.0.0 (Swift)"
    }
}
