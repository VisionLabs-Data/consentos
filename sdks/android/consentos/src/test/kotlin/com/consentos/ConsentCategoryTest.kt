package com.consentos

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit tests for [ConsentCategory].
 */
class ConsentCategoryTest {

    // -------------------------------------------------------------------------
    // Raw Values
    // -------------------------------------------------------------------------

    @Test
    fun `necessary has expected raw value`() {
        assertEquals("necessary", ConsentCategory.NECESSARY.value)
    }

    @Test
    fun `functional has expected raw value`() {
        assertEquals("functional", ConsentCategory.FUNCTIONAL.value)
    }

    @Test
    fun `analytics has expected raw value`() {
        assertEquals("analytics", ConsentCategory.ANALYTICS.value)
    }

    @Test
    fun `marketing has expected raw value`() {
        assertEquals("marketing", ConsentCategory.MARKETING.value)
    }

    @Test
    fun `personalisation has expected raw value`() {
        assertEquals("personalisation", ConsentCategory.PERSONALISATION.value)
    }

    // -------------------------------------------------------------------------
    // fromValue
    // -------------------------------------------------------------------------

    @Test
    fun `fromValue returns correct category for known values`() {
        assertEquals(ConsentCategory.NECESSARY,       ConsentCategory.fromValue("necessary"))
        assertEquals(ConsentCategory.FUNCTIONAL,      ConsentCategory.fromValue("functional"))
        assertEquals(ConsentCategory.ANALYTICS,       ConsentCategory.fromValue("analytics"))
        assertEquals(ConsentCategory.MARKETING,       ConsentCategory.fromValue("marketing"))
        assertEquals(ConsentCategory.PERSONALISATION, ConsentCategory.fromValue("personalisation"))
    }

    @Test
    fun `fromValue returns null for unknown value`() {
        assertNull(ConsentCategory.fromValue("unknown_category"))
    }

    @Test
    fun `fromValue returns null for empty string`() {
        assertNull(ConsentCategory.fromValue(""))
    }

    // -------------------------------------------------------------------------
    // requiresConsent
    // -------------------------------------------------------------------------

    @Test
    fun `necessary does not require consent`() {
        assertFalse(ConsentCategory.NECESSARY.requiresConsent)
    }

    @Test
    fun `all non-necessary categories require consent`() {
        val nonNecessary = ConsentCategory.entries.filter { it != ConsentCategory.NECESSARY }
        nonNecessary.forEach { category ->
            assertTrue("$category should require consent", category.requiresConsent)
        }
    }

    // -------------------------------------------------------------------------
    // TCF Purpose IDs
    // -------------------------------------------------------------------------

    @Test
    fun `necessary has no TCF purpose IDs`() {
        assertTrue(ConsentCategory.NECESSARY.tcfPurposeIds.isEmpty())
    }

    @Test
    fun `functional maps to TCF purpose 1`() {
        assertEquals(listOf(1), ConsentCategory.FUNCTIONAL.tcfPurposeIds)
    }

    @Test
    fun `analytics maps to TCF purposes 7 8 9 10`() {
        assertEquals(listOf(7, 8, 9, 10), ConsentCategory.ANALYTICS.tcfPurposeIds)
    }

    @Test
    fun `marketing maps to TCF purposes 2 3 4`() {
        assertEquals(listOf(2, 3, 4), ConsentCategory.MARKETING.tcfPurposeIds)
    }

    @Test
    fun `personalisation maps to TCF purposes 5 6`() {
        assertEquals(listOf(5, 6), ConsentCategory.PERSONALISATION.tcfPurposeIds)
    }

    @Test
    fun `all non-necessary categories have at least one TCF purpose ID`() {
        ConsentCategory.entries
            .filter { it.requiresConsent }
            .forEach { category ->
                assertTrue(
                    "$category should have at least one TCF purpose ID",
                    category.tcfPurposeIds.isNotEmpty(),
                )
            }
    }

    // -------------------------------------------------------------------------
    // GCM Consent Types
    // -------------------------------------------------------------------------

    @Test
    fun `necessary has no GCM consent type`() {
        assertNull(ConsentCategory.NECESSARY.gcmConsentType)
    }

    @Test
    fun `functional maps to functionality_storage`() {
        assertEquals("functionality_storage", ConsentCategory.FUNCTIONAL.gcmConsentType)
    }

    @Test
    fun `analytics maps to analytics_storage`() {
        assertEquals("analytics_storage", ConsentCategory.ANALYTICS.gcmConsentType)
    }

    @Test
    fun `marketing maps to ad_storage`() {
        assertEquals("ad_storage", ConsentCategory.MARKETING.gcmConsentType)
    }

    @Test
    fun `personalisation maps to personalization_storage`() {
        assertEquals("personalization_storage", ConsentCategory.PERSONALISATION.gcmConsentType)
    }

    @Test
    fun `all non-necessary categories have a GCM consent type`() {
        ConsentCategory.entries
            .filter { it.requiresConsent }
            .forEach { category ->
                assertNotNull("$category should have a GCM consent type", category.gcmConsentType)
            }
    }

    // -------------------------------------------------------------------------
    // Display
    // -------------------------------------------------------------------------

    @Test
    fun `all categories have non-empty display names`() {
        ConsentCategory.entries.forEach { category ->
            assertTrue(
                "$category displayName should not be empty",
                category.displayName.isNotEmpty(),
            )
        }
    }

    @Test
    fun `all categories have non-empty display descriptions`() {
        ConsentCategory.entries.forEach { category ->
            assertTrue(
                "$category displayDescription should not be empty",
                category.displayDescription.isNotEmpty(),
            )
        }
    }

    @Test
    fun `five categories are defined`() {
        assertEquals(5, ConsentCategory.entries.size)
    }
}
