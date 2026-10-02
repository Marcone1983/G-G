import java.net.URI
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val keystoreProperties = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

fun envUrl(name: String): String = System.getenv(name)?.trim().orEmpty().replace("\"", "")

val productionApi = envUrl("PRODUCTION_API_BASE_URL").ifBlank { "https://g-g-growverse420-4304.vercel.app" }

fun publicHttpsProblem(url: String): String? {
    if (!url.startsWith("https://")) return "not https"
    val host = try {
        URI(url).host?.lowercase().orEmpty()
    } catch (_: Exception) {
        ""
    }
    if (host.isEmpty() || host == "localhost" || host == "127.0.0.1" || host == "0.0.0.0" || host == "10.0.2.2" || host.endsWith(".local")) {
        return "local or empty host"
    }
    if (host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("169.254.")) return "private network"
    if (host.startsWith("172.")) {
        val second = host.split(".").getOrNull(1)?.toIntOrNull() ?: return "private network"
        if (second in 16..31) return "private network"
    }
    return null
}

android {
    namespace = "science.gg.breeding"
    compileSdk = 36

    defaultConfig {
        applicationId = "science.gg.breeding"
        minSdk = 26
        targetSdk = 36
        versionCode = 9
        versionName = "1.5.3"
    }

    flavorDimensions += "track"
    productFlavors {
        create("emulator") {
            dimension = "track"
            buildConfigField("String", "API_ENDPOINT_CLASS", "\"DEBUG_EMULATOR\"")
            buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:8080\"")
            buildConfigField("String", "EXPECTED_API_MAJOR", "\"1\"")
        }
        create("staging") {
            dimension = "track"
            buildConfigField("String", "API_ENDPOINT_CLASS", "\"STAGING\"")
            buildConfigField("String", "API_BASE_URL", "\"${envUrl("STAGING_API_BASE_URL")}\"")
            buildConfigField("String", "EXPECTED_API_MAJOR", "\"1\"")
        }
        create("production") {
            dimension = "track"
            buildConfigField("String", "API_ENDPOINT_CLASS", "\"PRODUCTION\"")
            buildConfigField("String", "API_BASE_URL", "\"$productionApi\"")
            buildConfigField("String", "EXPECTED_API_MAJOR", "\"1\"")
        }
    }

    signingConfigs {
        create("release") {
            storeFile = rootProject.file(keystoreProperties.getProperty("storeFile", "keystore/gg-upload.jks"))
            storePassword = keystoreProperties.getProperty("storePassword", "")
            keyAlias = keystoreProperties.getProperty("keyAlias", "ggupload")
            keyPassword = keystoreProperties.getProperty("keyPassword", "")
        }
    }

    buildTypes {
        debug {
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    lint {
        checkReleaseBuilds = false
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

tasks.configureEach {
    val releaseLike = name.contains("Release") || name.startsWith("bundle")
    if (!releaseLike) return@configureEach
    doFirst {
        if (name.contains("Emulator", ignoreCase = true)) {
            throw GradleException("The emulator endpoint cannot be packaged for release.")
        }
        if (name.contains("Staging", ignoreCase = true)) {
            val problem = publicHttpsProblem(envUrl("STAGING_API_BASE_URL"))
            if (problem != null) throw GradleException("STAGING_API_BASE_URL is not a public https URL ($problem).")
        }
        if (name.contains("Production", ignoreCase = true) || name == "assembleRelease" || name == "bundleRelease" || name == "packageRelease") {
            val problem = publicHttpsProblem(productionApi)
            if (problem != null) {
                throw GradleException("PRODUCTION_API_BASE_URL must be a public https URL before a release build. No localhost and no empty URL. ($problem)")
            }
        }
    }
}

dependencies {
    val bom = platform("androidx.compose:compose-bom:2025.12.01")
    implementation(bom)
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.navigation:navigation-compose:2.8.9")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.browser:browser:1.8.0")
}
