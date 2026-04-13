package com.consentos

import kotlinx.serialization.Serializable

/**
 * Represents the complete consent state for a visitor.
 *
 * This model mirrors the web consent cookie structure for cross-platform consistency.
 * It is persisted locally via [ConsentStorage] and synced to the server.
 */
@Serializable
data class ConsentState(
    /**
     * A stable, anonymous identifier for this device/visitor.
     * Generated once and persisted across sessions.
     */
    val visitorId: String,

    /** The set of categories the visitor has explicitly accepted. */
    val accepted: Set<ConsentCategory> = emptySet(),

    /** The set of categories the visitor has explicitly rejected. */
    val rejected: Set<ConsentCategory> = emptySet(),

    /**
     * The timestamp (epoch milliseconds) at which consent was last recorded.
     * `null` until the user interacts with the banner.
     */
    val consentedAtMs: Long? = null,

    /**
     * The banner configuration version active when consent was collected.
     * Used to detect when consent must be re-collected after a config change.
     */
    val bannerVersion: String? = null,
) {

    // -------------------------------------------------------------------------
    // Derived State
    // -------------------------------------------------------------------------

    /**
     * Whether the user has interacted with the banner (accepted or rejected).
     *
     * Returns `false` when the state represents the pre-consent default.
     */
    val hasInteracted: Boolean
        get() = consentedAtMs != null

    /**
     * Returns `true` if the user has granted consent for the given [category].
     *
     * [ConsentCategory.NECESSARY] is always considered granted regardless of the stored state.
     */
    fun isGranted(category: ConsentCategory): Boolean {
        if (category == ConsentCategory.NECESSARY) return true
        return category in accepted
    }

    /**
     * Returns `true` if the user has explicitly denied consent for the given [category].
     */
    fun isDenied(category: ConsentCategory): Boolean {
        if (category == ConsentCategory.NECESSARY) return false
        return category in rejected
    }

    // -------------------------------------------------------------------------
    // Mutations — returns new instances (immutable pattern)
    // -------------------------------------------------------------------------

    /**
     * Returns a new state with all non-necessary categories accepted.
     */
    fun acceptingAll(): ConsentState {
        val allOptional = ConsentCategory.entries.filter { it.requiresConsent }.toSet()
        return copy(
            accepted = allOptional,
            rejected = emptySet(),
            consentedAtMs = System.currentTimeMillis(),
        )
    }

    /**
     * Returns a new state with all non-necessary categories rejected.
     */
    fun rejectingAll(): ConsentState {
        val allOptional = ConsentCategory.entries.filter { it.requiresConsent }.toSet()
        return copy(
            accepted = emptySet(),
            rejected = allOptional,
            consentedAtMs = System.currentTimeMillis(),
        )
    }

    /**
     * Returns a new state accepting only the specified [categories] (and rejecting all others).
     *
     * Passing [ConsentCategory.NECESSARY] in the set is a no-op — it will not appear in
     * either [accepted] or [rejected].
     */
    fun accepting(categories: Set<ConsentCategory>): ConsentState {
        val allOptional = ConsentCategory.entries.filter { it.requiresConsent }.toSet()
        val toAccept = categories.filter { it.requiresConsent }.toSet()
        val toReject = allOptional - toAccept
        return copy(
            accepted = toAccept,
            rejected = toReject,
            consentedAtMs = System.currentTimeMillis(),
        )
    }
}
