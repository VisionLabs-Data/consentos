#if canImport(UIKit)
import UIKit
import SwiftUI
import ConsentOSCore

// MARK: - Consent Modal Controller

/// A UIKit view controller that presents the SwiftUI ``ConsentBannerView`` as a
/// bottom-sheet modal overlay.
///
/// Use this when your app is primarily UIKit-based.
///
/// ```swift
/// let modal = ConsentModalController()
/// modal.onDismiss = { [weak self] in
///     // Banner dismissed
/// }
/// present(modal, animated: true)
/// ```
public final class ConsentModalController: UIViewController {

    // MARK: - Properties

    /// Called when the banner is dismissed (after any consent action).
    public var onDismiss: (() -> Void)?

    /// The theme to apply to the banner. Defaults to ``BannerTheme/defaultTheme``.
    public var theme: BannerTheme = .defaultTheme

    // MARK: - Private

    private var hostingController: UIHostingController<AnyView>?

    // MARK: - Lifecycle

    public override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.black.withAlphaComponent(0.4)

        setupBannerView()
        setupBackgroundDismiss()
    }

    // MARK: - Setup

    private func setupBannerView() {
        let bannerView = ConsentBannerView(
            theme: theme,
            onAcceptAll: { [weak self] in
                await ConsentOS.shared.acceptAll()
                await MainActor.run { self?.dismiss(animated: true) }
            },
            onRejectAll: { [weak self] in
                await ConsentOS.shared.rejectAll()
                await MainActor.run { self?.dismiss(animated: true) }
            },
            onSave: { [weak self] categories in
                await ConsentOS.shared.acceptCategories(categories)
                await MainActor.run { self?.dismiss(animated: true) }
            }
        )

        let hosting = UIHostingController(rootView: AnyView(
            VStack {
                Spacer()
                bannerView
                    .padding(.bottom, 16)
            }
        ))
        hosting.view.backgroundColor = .clear

        addChild(hosting)
        view.addSubview(hosting.view)
        hosting.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            hosting.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hosting.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hosting.view.topAnchor.constraint(equalTo: view.topAnchor),
            hosting.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        hosting.didMove(toParent: self)
        self.hostingController = hosting
    }

    private func setupBackgroundDismiss() {
        // Tapping the dim overlay does not dismiss — users must interact with the banner.
        // Remove this behaviour if your design requires tap-to-dismiss.
    }

    // MARK: - Dismiss Override

    public override func dismiss(animated flag: Bool, completion: (() -> Void)? = nil) {
        super.dismiss(animated: flag) { [weak self] in
            self?.onDismiss?()
            completion?()
        }
    }

    // MARK: - Accessibility

    public override func accessibilityPerformEscape() -> Bool {
        // Do not allow VoiceOver escape gesture to dismiss the banner without a consent choice.
        return false
    }
}
#endif
