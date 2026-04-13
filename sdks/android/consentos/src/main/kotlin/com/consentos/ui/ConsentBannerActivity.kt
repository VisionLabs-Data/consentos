package com.consentos.ui

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.consentos.ConsentOS

/**
 * A transparent, trampoline [AppCompatActivity] that hosts the [ConsentBottomSheet].
 *
 * This activity is used when the host app cannot directly access a [FragmentManager]
 * (e.g. from a Service or Application context). Launch it with [launch]:
 *
 * ```kotlin
 * ConsentBannerActivity.launch(context)
 * ```
 *
 * The activity is declared as transparent (`Theme.AppCompat.Translucent`) so only
 * the bottom sheet is visible. It finishes automatically when the sheet is dismissed.
 */
class ConsentBannerActivity : AppCompatActivity() {

    companion object {
        /**
         * Launches the [ConsentBannerActivity] from any [Context].
         *
         * @param context The context from which to start the activity.
         */
        fun launch(context: Context) {
            val intent = Intent(context, ConsentBannerActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (savedInstanceState == null) {
            val config = ConsentOS.instance.siteConfig
            val sheet = ConsentBottomSheet.newInstance(config)

            sheet.show(supportFragmentManager, "cmp_consent_banner")

            // Finish the activity when the sheet is dismissed.
            supportFragmentManager.setFragmentResultListener(
                "cmp_consent_result",
                this,
            ) { _, _ -> finish() }
        }
    }

    override fun onBackPressed() {
        // Prevent dismissal via back press without explicit user choice.
        // The user must interact with the banner buttons.
    }
}
