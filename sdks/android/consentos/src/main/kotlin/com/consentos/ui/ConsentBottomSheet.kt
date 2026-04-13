package com.consentos.ui

import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.CompoundButton
import android.widget.LinearLayout
import android.widget.Switch
import android.widget.TextView
import com.consentos.ConsentOS
import com.consentos.ConsentCategory
import com.consentos.ConsentConfig
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json

/**
 * Displays the consent banner as a Material [BottomSheetDialogFragment].
 *
 * The sheet is themed from the [ConsentConfig.BannerConfig] passed at construction
 * (or from defaults if no config is available). It provides three primary actions:
 *
 * - **Accept All** — grants all non-necessary categories.
 * - **Reject All** — denies all non-necessary categories.
 * - **Manage Preferences** — reveals per-category toggles.
 *
 * Use [newInstance] to create an instance and [show] to display it:
 *
 * ```kotlin
 * val sheet = ConsentBottomSheet.newInstance(config)
 * sheet.show(supportFragmentManager, "cmp_consent_banner")
 * ```
 */
class ConsentBottomSheet : BottomSheetDialogFragment() {

    // -------------------------------------------------------------------------
    // Factory
    // -------------------------------------------------------------------------

    companion object {
        private const val ARG_CONFIG_JSON = "config_json"

        /**
         * Creates a [ConsentBottomSheet] with the given site configuration.
         *
         * @param config The effective site configuration, or `null` to use defaults.
         */
        fun newInstance(config: ConsentConfig?): ConsentBottomSheet {
            val sheet = ConsentBottomSheet()
            if (config != null) {
                val bundle = Bundle()
                bundle.putString(ARG_CONFIG_JSON, serializeConfig(config))
                sheet.arguments = bundle
            }
            return sheet
        }

        private fun serializeConfig(config: ConsentConfig): String =
            // Simple serialisation — uses the default Json instance for round-tripping.
            runCatching {
                Json.encodeToString(ConsentConfig.serializer(), config)
            }.getOrDefault("")
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    private var theme: BannerTheme = BannerTheme.default
    private var config: ConsentConfig? = null

    /** Coroutine scope tied to the fragment's lifecycle. */
    private val sheetScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val configJson = arguments?.getString(ARG_CONFIG_JSON)
        if (!configJson.isNullOrEmpty()) {
            config = runCatching {
                Json {
                    ignoreUnknownKeys = true
                }.decodeFromString(ConsentConfig.serializer(), configJson)
            }.getOrNull()
        }

        // Fall back to the config cached in the singleton if none was passed.
        if (config == null) {
            config = ConsentOS.instance.siteConfig
        }

        theme = config?.bannerConfig?.let { BannerTheme.from(it) } ?: BannerTheme.default
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ): View = buildBannerView()

    override fun onDestroyView() {
        super.onDestroyView()
        sheetScope.cancel()
    }

    // -------------------------------------------------------------------------
    // View Construction (programmatic — no XML layout dependency)
    // -------------------------------------------------------------------------

    /**
     * Builds the banner view programmatically to keep the SDK self-contained
     * and avoid requiring host apps to merge resource files.
     */
    private fun buildBannerView(): View {
        val ctx = requireContext()

        // Root container
        val root = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(theme.backgroundColor)
            val dp16 = dpToPx(theme.horizontalPaddingDp).toInt()
            setPadding(dp16, dp16, dp16, dp16)
            background = GradientDrawable().apply {
                setColor(theme.backgroundColor)
                cornerRadii = floatArrayOf(
                    dpToPx(theme.cornerRadiusDp), dpToPx(theme.cornerRadiusDp),
                    dpToPx(theme.cornerRadiusDp), dpToPx(theme.cornerRadiusDp),
                    0f, 0f,
                    0f, 0f,
                )
            }
        }

        // Title
        val titleView = TextView(ctx).apply {
            text = theme.title
            textSize = 18f
            setTextColor(theme.textColor)
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            )
            lp.bottomMargin = dpToPx(8f).toInt()
            layoutParams = lp
        }
        root.addView(titleView)

        // Description
        val descriptionView = TextView(ctx).apply {
            text = theme.description
            textSize = 14f
            setTextColor(theme.secondaryTextColor)
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            )
            lp.bottomMargin = dpToPx(16f).toInt()
            layoutParams = lp
        }
        root.addView(descriptionView)

        // Accept All button
        val acceptButton = buildPrimaryButton(theme.acceptButtonText).apply {
            setBackgroundColor(theme.acceptButtonBackground)
            setTextColor(theme.acceptButtonTextColor)
            setOnClickListener {
                sheetScope.launch {
                    ConsentOS.instance.acceptAll()
                    dismissAllowingStateLoss()
                }
            }
        }
        root.addView(acceptButton)

        val spacer1 = View(ctx).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dpToPx(8f).toInt(),
            )
        }
        root.addView(spacer1)

        // Reject All button
        val rejectButton = buildSecondaryButton(theme.rejectButtonText).apply {
            setBackgroundColor(theme.rejectButtonBackground)
            setTextColor(theme.rejectButtonTextColor)
            setOnClickListener {
                sheetScope.launch {
                    ConsentOS.instance.rejectAll()
                    dismissAllowingStateLoss()
                }
            }
        }
        root.addView(rejectButton)

        val spacer2 = View(ctx).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dpToPx(8f).toInt(),
            )
        }
        root.addView(spacer2)

        // Manage Preferences button
        val manageButton = buildSecondaryButton(theme.manageButtonText).apply {
            setBackgroundColor(theme.rejectButtonBackground)
            setTextColor(theme.accentColor)  // Use accent colour for the manage button text
            setOnClickListener { showPreferencesPanel(root) }
        }
        root.addView(manageButton)

        return root
    }

    /**
     * Appends a per-category preferences panel below the action buttons.
     *
     * This is a simplified in-line expansion; a production implementation would open
     * a separate screen or expand via a RecyclerView with toggle switches.
     */
    private fun showPreferencesPanel(root: LinearLayout) {
        val ctx = root.context
        val categories = config?.enabledCategories
            ?: ConsentCategory.entries.filter { it.requiresConsent }

        val panelTitle = TextView(ctx).apply {
            text = "Manage Preferences"
            textSize = 16f
            setTextColor(theme.textColor)
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            )
            lp.topMargin = dpToPx(16f).toInt()
            lp.bottomMargin = dpToPx(8f).toInt()
            layoutParams = lp
        }
        root.addView(panelTitle)

        // Track which categories the user has toggled (start from current state).
        val selectedCategories = ConsentOS.instance.consentState?.accepted?.toMutableSet()
            ?: mutableSetOf()

        categories.filter { it.requiresConsent }.forEach { category ->
            val row = LinearLayout(ctx).apply {
                orientation = LinearLayout.HORIZONTAL
                val lp = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                )
                lp.bottomMargin = dpToPx(8f).toInt()
                layoutParams = lp
            }

            val label = TextView(ctx).apply {
                text = category.displayName
                textSize = 14f
                setTextColor(theme.textColor)
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            row.addView(label)

            @Suppress("DEPRECATION")  // Switch is deprecated in API 29+ but works on API 26+
            val toggle = Switch(ctx).apply {
                isChecked = category in selectedCategories
                setOnCheckedChangeListener { _: CompoundButton, checked: Boolean ->
                    if (checked) selectedCategories.add(category)
                    else selectedCategories.remove(category)
                }
            }
            row.addView(toggle)

            root.addView(row)
        }

        // Save preferences button
        val saveButton = buildPrimaryButton("Save Preferences").apply {
            setBackgroundColor(theme.acceptButtonBackground)
            setTextColor(theme.acceptButtonTextColor)
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dpToPx(theme.buttonHeightDp).toInt(),
            )
            lp.topMargin = dpToPx(8f).toInt()
            layoutParams = lp
            setOnClickListener {
                sheetScope.launch {
                    ConsentOS.instance.acceptCategories(selectedCategories.toList())
                    dismissAllowingStateLoss()
                }
            }
        }
        root.addView(saveButton)
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun buildPrimaryButton(label: String) = Button(requireContext()).apply {
        text = label
        isAllCaps = false
        textSize = 14f
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            dpToPx(theme.buttonHeightDp).toInt(),
        )
    }

    private fun buildSecondaryButton(label: String) = Button(requireContext()).apply {
        text = label
        isAllCaps = false
        textSize = 14f
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            dpToPx(theme.buttonHeightDp).toInt(),
        )
    }

    /** Converts dp to pixels using the current display density. */
    private fun dpToPx(dp: Float): Float =
        dp * (requireContext().resources.displayMetrics.density)
}
