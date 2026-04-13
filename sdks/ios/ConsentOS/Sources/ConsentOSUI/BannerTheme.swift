#if canImport(SwiftUI)
import SwiftUI
import ConsentOSCore

// MARK: - Banner Theme

/// Resolved colour and typography theme for the consent banner.
///
/// Derived from ``ConsentConfig/BannerConfig`` values, falling back to sensible defaults.
public struct BannerTheme: Sendable {

    // MARK: - Colours

    public let backgroundColor: Color
    public let textColor: Color
    public let accentColor: Color
    public let secondaryTextColor: Color
    public let dividerColor: Color
    public let acceptButtonBackground: Color
    public let acceptButtonTextColor: Color
    public let rejectButtonBackground: Color
    public let rejectButtonTextColor: Color

    // MARK: - Typography

    public let titleFont: Font
    public let bodyFont: Font
    public let buttonFont: Font
    public let captionFont: Font

    // MARK: - Layout

    public let cornerRadius: CGFloat
    public let horizontalPadding: CGFloat
    public let verticalPadding: CGFloat
    public let buttonHeight: CGFloat

    // MARK: - Button Labels

    public let acceptButtonText: String
    public let rejectButtonText: String
    public let manageButtonText: String
    public let title: String
    public let description: String

    // MARK: - Defaults

    static let defaultAccentHex = "#1A73E8"  // Google-blue — overridden by brand config
    static let defaultBackgroundHex = "#FFFFFF"
    static let defaultTextHex = "#1A1A1A"

    // MARK: - Factory

    /// Creates a ``BannerTheme`` from the banner configuration returned by the API.
    ///
    /// Hex values not present in the config fall back to neutral defaults.
    public static func from(config: ConsentConfig.BannerConfig) -> BannerTheme {
        let background = Color(hex: config.backgroundColor) ?? Color(.systemBackground)
        let text       = Color(hex: config.textColor)       ?? Color(.label)
        let accent     = Color(hex: config.accentColor)     ?? Color(hex: defaultAccentHex)!

        return BannerTheme(
            backgroundColor: background,
            textColor: text,
            accentColor: accent,
            secondaryTextColor: text.opacity(0.6),
            dividerColor: text.opacity(0.12),
            acceptButtonBackground: accent,
            acceptButtonTextColor: .white,
            rejectButtonBackground: Color(.secondarySystemBackground),
            rejectButtonTextColor: text,
            titleFont: .headline,
            bodyFont: .subheadline,
            buttonFont: .subheadline.weight(.semibold),
            captionFont: .caption,
            cornerRadius: 12,
            horizontalPadding: 16,
            verticalPadding: 16,
            buttonHeight: 44,
            acceptButtonText: config.acceptButtonText ?? "Accept All",
            rejectButtonText: config.rejectButtonText ?? "Reject All",
            manageButtonText: config.manageButtonText ?? "Manage Preferences",
            title: config.title ?? "We value your privacy",
            description: config.description ?? "We use cookies to improve your experience and for analytics."
        )
    }

    /// Default theme used when no configuration has been loaded yet.
    public static var defaultTheme: BannerTheme {
        from(config: ConsentConfig.BannerConfig())
    }
}

// MARK: - Colour Hex Extension

extension Color {
    /// Initialises a `Color` from a hex string such as `"#1A73E8"` or `"1A73E8"`.
    init?(hex: String?) {
        guard let hex else { return nil }
        let sanitised = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard sanitised.count == 6,
              let value = UInt64(sanitised, radix: 16) else {
            return nil
        }
        let r = Double((value >> 16) & 0xFF) / 255
        let g = Double((value >>  8) & 0xFF) / 255
        let b = Double((value      ) & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
#endif
