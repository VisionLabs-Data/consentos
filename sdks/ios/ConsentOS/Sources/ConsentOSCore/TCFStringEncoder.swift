import Foundation

// MARK: - TCF String Encoder

/// Encodes a TC string (Transparency & Consent Framework v2.2) from consent state.
///
/// The TC string is a Base64url-encoded bit field described in the IAB TCF v2.2 specification.
/// This implementation encodes the core consent section (segment type 0) sufficient for
/// signalling purpose consent to downstream vendors.
///
/// Reference: https://github.com/InteractiveAdvertisingBureau/GDPR-Transparency-and-Consent-Framework
public final class TCFStringEncoder: Sendable {

    // MARK: - Constants

    /// TCF specification version.
    private static let specVersion: Int = 2

    /// A fixed CMP ID — replace with your registered IAB CMP ID in production.
    private static let cmpId: Int = 0

    /// CMP SDK version number.
    private static let cmpVersion: Int = 1

    /// IAB consent language (en).
    private static let consentLanguage: String = "EN"

    /// Vendor list version. In production, this should be fetched from the GVL.
    private static let vendorListVersion: Int = 1

    /// Number of TCF purposes defined in the specification.
    private static let tcfPurposeCount: Int = 24

    // MARK: - Public API

    /// Encodes a TC string for the given consent state and site configuration.
    ///
    /// - Parameters:
    ///   - state: The resolved consent state containing accepted/rejected categories.
    ///   - config: The site configuration (used for CMP metadata).
    /// - Returns: A Base64url-encoded TC string, or `nil` if encoding fails.
    public static func encode(state: ConsentState, config: ConsentConfig) -> String? {
        guard state.hasInteracted, let consentedAt = state.consentedAt else {
            return nil
        }

        // Derive the set of consented TCF purpose IDs from accepted categories.
        let consentedPurposeIds: Set<Int> = state.accepted.reduce(into: []) { result, category in
            category.tcfPurposeIds.forEach { result.insert($0) }
        }

        return buildCoreString(
            consentedAt: consentedAt,
            consentedPurposeIds: consentedPurposeIds
        )
    }

    // MARK: - Core String Construction

    private static func buildCoreString(
        consentedAt: Date,
        consentedPurposeIds: Set<Int>
    ) -> String? {
        var bits = BitWriter()

        // --- Core segment fields (IAB TCF v2.2 spec, Table 1) ---

        // Version (6 bits)
        bits.write(specVersion, bitCount: 6)

        // Created — deciseconds since epoch (36 bits)
        let deciseconds = Int(consentedAt.timeIntervalSince1970 * 10)
        bits.write(deciseconds, bitCount: 36)

        // LastUpdated — deciseconds since epoch (36 bits)
        bits.write(deciseconds, bitCount: 36)

        // CmpId (12 bits)
        bits.write(cmpId, bitCount: 12)

        // CmpVersion (12 bits)
        bits.write(cmpVersion, bitCount: 12)

        // ConsentScreen (6 bits) — screen number within the CMP UI
        bits.write(1, bitCount: 6)

        // ConsentLanguage (12 bits) — two 6-bit characters, A=0 … Z=25
        let langBits = encodeTwoLetterLanguage(consentLanguage)
        bits.write(langBits.0, bitCount: 6)
        bits.write(langBits.1, bitCount: 6)

        // VendorListVersion (12 bits)
        bits.write(vendorListVersion, bitCount: 12)

        // TcfPolicyVersion (6 bits) — must be 4 for TCF v2.2
        bits.write(4, bitCount: 6)

        // IsServiceSpecific (1 bit)
        bits.write(0, bitCount: 1)

        // UseNonStandardTexts (1 bit)
        bits.write(0, bitCount: 1)

        // SpecialFeatureOptIns (12 bits) — none opted in
        bits.write(0, bitCount: 12)

        // PurposesConsent (24 bits) — one bit per purpose, LSB = purpose 1
        for purposeId in 1 ... tcfPurposeCount {
            bits.write(consentedPurposeIds.contains(purposeId) ? 1 : 0, bitCount: 1)
        }

        // PurposesLITransparency (24 bits) — legitimate interest; none asserted
        bits.write(0, bitCount: 24)

        // PurposeOneTreatment (1 bit)
        bits.write(0, bitCount: 1)

        // PublisherCC (12 bits) — "GB"
        let ccBits = encodeTwoLetterLanguage("GB")
        bits.write(ccBits.0, bitCount: 6)
        bits.write(ccBits.1, bitCount: 6)

        // Vendor Consents — using BitRange encoding with MaxVendorId = 0 (no vendors)
        bits.write(0, bitCount: 16) // MaxVendorId
        bits.write(0, bitCount: 1)  // IsRangeEncoding = false
        // (no bits to write for an empty vendor list)

        // Vendor Legitimate Interests — MaxVendorId = 0
        bits.write(0, bitCount: 16)
        bits.write(0, bitCount: 1)

        // Publisher Restrictions count = 0
        bits.write(0, bitCount: 12)

        // Serialise and Base64url-encode
        let data = bits.toData()
        return base64UrlEncode(data)
    }

    // MARK: - Helpers

    /// Encodes a two-letter language/country code into two 6-bit integers (A=0, Z=25).
    private static func encodeTwoLetterLanguage(_ code: String) -> (Int, Int) {
        // ASCII value of 'A' is 65. Subtracting this gives 0-based index (A=0 … Z=25).
        let asciiA: Int = 65
        let upper = code.uppercased()
        let chars = Array(upper)
        guard chars.count == 2,
              let first = chars[0].asciiValue,
              let second = chars[1].asciiValue else {
            return (4, 13) // "EN" fallback (E=4, N=13)
        }
        return (Int(first) - asciiA, Int(second) - asciiA)
    }

    /// Converts a `Data` value to a Base64url string (RFC 4648, no padding).
    private static func base64UrlEncode(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .trimmingCharacters(in: CharacterSet(charactersIn: "="))
    }
}

// MARK: - Bit Writer

/// A utility type for packing integers into a bit-level byte buffer.
private struct BitWriter {

    private var bytes: [UInt8] = []
    private var currentByte: UInt8 = 0
    private var bitPosition: Int = 0  // 0 = MSB of current byte

    /// Writes `bitCount` bits from the MSB of `value`.
    mutating func write(_ value: Int, bitCount: Int) {
        for i in stride(from: bitCount - 1, through: 0, by: -1) {
            let bit: UInt8 = (value >> i) & 1 == 1 ? 1 : 0
            currentByte |= bit << (7 - bitPosition)
            bitPosition += 1
            if bitPosition == 8 {
                bytes.append(currentByte)
                currentByte = 0
                bitPosition = 0
            }
        }
    }

    /// Flushes any remaining partial byte and returns the accumulated data.
    func toData() -> Data {
        var result = bytes
        if bitPosition > 0 {
            result.append(currentByte)
        }
        return Data(result)
    }
}
