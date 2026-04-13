plugins {
    id("com.android.library") version "8.3.0"
    id("org.jetbrains.kotlin.android") version "1.9.23"
    id("org.jetbrains.kotlin.plugin.serialization") version "1.9.23"
}

android {
    namespace = "com.consentos"
    compileSdk = 34

    defaultConfig {
        minSdk = 26  // Android 8.0 (Oreo) — required for EncryptedSharedPreferences
        targetSdk = 34

        // Consumer ProGuard rules are included in the AAR and applied to the consuming app.
        consumerProguardFiles("proguard-rules.pro")

        // SDK version available at runtime for User-Agent and logging.
        buildConfigField("String", "SDK_VERSION", "\"${project.property("VERSION_NAME")}\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false  // Library modules are not minified; the consuming app handles this.
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
        freeCompilerArgs += listOf(
            "-opt-in=kotlinx.coroutines.ExperimentalCoroutinesApi",
        )
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            isReturnDefaultValues = true
        }
    }
}

dependencies {
    // Kotlin coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.0")

    // Kotlinx serialization (JSON)
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")

    // AndroidX — EncryptedSharedPreferences requires security-crypto
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // AndroidX annotations (@VisibleForTesting, @ColorInt, etc.)
    implementation("androidx.annotation:annotation:1.7.1")

    // Material Components — for BottomSheetDialogFragment and theming
    implementation("com.google.android.material:material:1.11.0")

    // AndroidX Fragment (BottomSheetDialogFragment)
    implementation("androidx.fragment:fragment-ktx:1.6.2")

    // AppCompat — for ConsentBannerActivity base class and translucent theme
    implementation("androidx.appcompat:appcompat:1.6.1")

    // Optional: Firebase / GCM bridge (compileOnly so apps without Firebase still compile)
    compileOnly("com.google.firebase:firebase-analytics-ktx:21.6.1")

    // Unit test dependencies — plain JVM, no instrumentation required
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.mockito:mockito-core:5.11.0")
    testImplementation("org.mockito.kotlin:mockito-kotlin:5.2.1")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.0")
    testImplementation("org.robolectric:robolectric:4.12.1")
    testImplementation("androidx.test:core:1.5.0")
}
