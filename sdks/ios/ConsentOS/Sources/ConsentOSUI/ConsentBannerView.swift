#if canImport(SwiftUI)
import SwiftUI
import ConsentOSCore

// MARK: - Consent Banner View

/// A SwiftUI consent banner that respects the site's ``BannerTheme``.
///
/// The banner displays in a bottom-sheet style by default. It presents three
/// actions: accept all, reject all, and manage preferences (category-level toggles).
///
/// Usage:
/// ```swift
/// ConsentBannerView(theme: theme) {
///     await ConsentOS.shared.acceptAll()
/// } onRejectAll: {
///     await ConsentOS.shared.rejectAll()
/// } onSave: { categories in
///     await ConsentOS.shared.acceptCategories(categories)
/// }
/// ```
public struct ConsentBannerView: View {

    // MARK: - State

    @State private var showingManage: Bool = false
    @State private var categoryToggles: [ConsentCategory: Bool] = [:]

    // MARK: - Properties

    private let theme: BannerTheme
    private let onAcceptAll: () async -> Void
    private let onRejectAll: () async -> Void
    private let onSave: (Set<ConsentCategory>) async -> Void

    /// The categories available for granular control (excludes `necessary`).
    private let manageableCategories: [ConsentCategory] = ConsentCategory.allCases
        .filter { $0.requiresConsent }

    // MARK: - Initialisers

    public init(
        theme: BannerTheme = .defaultTheme,
        onAcceptAll: @escaping () async -> Void,
        onRejectAll: @escaping () async -> Void,
        onSave: @escaping (Set<ConsentCategory>) async -> Void
    ) {
        self.theme = theme
        self.onAcceptAll = onAcceptAll
        self.onRejectAll = onRejectAll
        self.onSave = onSave
    }

    // MARK: - Body

    public var body: some View {
        VStack(spacing: 0) {
            if showingManage {
                manageView
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            } else {
                mainBannerView
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .background(theme.backgroundColor)
        .clipShape(RoundedRectangle(cornerRadius: theme.cornerRadius, style: .continuous))
        .shadow(color: .black.opacity(0.1), radius: 12, x: 0, y: -4)
        .padding(.horizontal, theme.horizontalPadding)
        .onAppear {
            // Default all optional categories to off
            for category in manageableCategories {
                categoryToggles[category] = false
            }
        }
        .animation(.easeInOut(duration: 0.25), value: showingManage)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Cookie consent banner")
    }

    // MARK: - Main Banner

    private var mainBannerView: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(theme.title)
                .font(theme.titleFont)
                .foregroundColor(theme.textColor)
                .accessibilityAddTraits(.isHeader)

            Text(theme.description)
                .font(theme.bodyFont)
                .foregroundColor(theme.secondaryTextColor)
                .fixedSize(horizontal: false, vertical: true)

            Divider()
                .background(theme.dividerColor)

            // Action buttons
            VStack(spacing: 8) {
                acceptButton
                HStack(spacing: 8) {
                    rejectButton
                    manageButton
                }
            }
        }
        .padding(theme.verticalPadding)
    }

    // MARK: - Manage View

    private var manageView: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Button(action: { showingManage = false }) {
                    Image(systemName: "chevron.left")
                        .foregroundColor(theme.accentColor)
                }
                .accessibilityLabel("Back")

                Text(theme.manageButtonText)
                    .font(theme.titleFont)
                    .foregroundColor(theme.textColor)
                    .accessibilityAddTraits(.isHeader)

                Spacer()
            }
            .padding(theme.verticalPadding)

            Divider().background(theme.dividerColor)

            // Necessary category — always on
            categoryRow(
                name: ConsentCategory.necessary.displayName,
                description: ConsentCategory.necessary.displayDescription,
                isOn: .constant(true),
                isToggleable: false
            )

            Divider().background(theme.dividerColor)

            // Optional categories
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(manageableCategories, id: \.rawValue) { category in
                        categoryRow(
                            name: category.displayName,
                            description: category.displayDescription,
                            isOn: Binding(
                                get: { categoryToggles[category] ?? false },
                                set: { categoryToggles[category] = $0 }
                            ),
                            isToggleable: true
                        )
                        Divider().background(theme.dividerColor)
                    }
                }
            }

            // Save button
            Button(action: {
                Task {
                    let selected = Set(
                        manageableCategories.filter { categoryToggles[$0] == true }
                    )
                    await onSave(selected)
                }
            }) {
                Text("Save Preferences")
                    .font(theme.buttonFont)
                    .foregroundColor(theme.acceptButtonTextColor)
                    .frame(maxWidth: .infinity)
                    .frame(height: theme.buttonHeight)
                    .background(theme.accentColor)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .padding(theme.verticalPadding)
            .accessibilityLabel("Save your cookie preferences")
        }
    }

    // MARK: - Category Row

    private func categoryRow(
        name: String,
        description: String,
        isOn: Binding<Bool>,
        isToggleable: Bool
    ) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(name)
                    .font(theme.bodyFont.weight(.semibold))
                    .foregroundColor(theme.textColor)
                Text(description)
                    .font(theme.captionFont)
                    .foregroundColor(theme.secondaryTextColor)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            Toggle("", isOn: isOn)
                .labelsHidden()
                .toggleStyle(SwitchToggleStyle(tint: theme.accentColor))
                .disabled(!isToggleable)
                .accessibilityLabel(isToggleable ? "Toggle \(name)" : "\(name) always active")
        }
        .padding(.horizontal, theme.horizontalPadding)
        .padding(.vertical, 12)
    }

    // MARK: - Buttons

    private var acceptButton: some View {
        Button(action: {
            Task { await onAcceptAll() }
        }) {
            Text(theme.acceptButtonText)
                .font(theme.buttonFont)
                .foregroundColor(theme.acceptButtonTextColor)
                .frame(maxWidth: .infinity)
                .frame(height: theme.buttonHeight)
                .background(theme.acceptButtonBackground)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .accessibilityLabel("Accept all cookies")
    }

    private var rejectButton: some View {
        Button(action: {
            Task { await onRejectAll() }
        }) {
            Text(theme.rejectButtonText)
                .font(theme.buttonFont)
                .foregroundColor(theme.rejectButtonTextColor)
                .frame(maxWidth: .infinity)
                .frame(height: theme.buttonHeight)
                .background(theme.rejectButtonBackground)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .accessibilityLabel("Reject all non-essential cookies")
    }

    private var manageButton: some View {
        Button(action: { showingManage = true }) {
            Text(theme.manageButtonText)
                .font(theme.buttonFont)
                .foregroundColor(theme.accentColor)
                .frame(maxWidth: .infinity)
                .frame(height: theme.buttonHeight)
                .background(theme.accentColor.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .accessibilityLabel("Manage your cookie preferences")
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Main Banner") {
    VStack {
        Spacer()
        ConsentBannerView(
            theme: .defaultTheme,
            onAcceptAll: {},
            onRejectAll: {},
            onSave: { _ in }
        )
        .padding(.bottom, 8)
    }
    .background(Color(.systemGroupedBackground))
}
#endif
#endif
