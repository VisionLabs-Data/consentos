#if canImport(UIKit)
import UIKit
import ConsentOSCore

// MARK: - UIKit Banner Presentation (ConsentOSUI extension)

public extension ConsentOS {
    /// Presents the consent banner modally on the given view controller.
    ///
    /// This extension is provided by the ConsentOSUI module.
    /// Ensure you import ConsentOSUI alongside ConsentOSCore to use this method.
    ///
    /// - Parameter viewController: The presenting view controller.
    @MainActor
    func showBanner(on viewController: UIViewController) {
        let modal = ConsentModalController()
        modal.modalPresentationStyle = .overFullScreen
        modal.modalTransitionStyle = .crossDissolve
        viewController.present(modal, animated: true)
    }
}
#endif
