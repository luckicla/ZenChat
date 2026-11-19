plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Versión: el contador de ejecuciones de GitHub Actions (cada APK es mayor que la anterior)
val runNumber: String = System.getenv("GITHUB_RUN_NUMBER") ?: "1"

android {
    namespace = "com.luckicla.zenchat"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.luckicla.zenchat"
        minSdk = 29
        targetSdk = 35
        versionCode = Integer.parseInt(runNumber)
        versionName = "1.0.$runNumber"
    }

    // La interfaz es la misma que la de PC: la carpeta app/ del repo va dentro del APK
    sourceSets["main"].assets.srcDirs("../../app")

    signingConfigs {
        create("release") {
            // Siempre el MISMO keystore: si cambia, el móvil no deja instalar encima
            storeFile = file("release.keystore")
            storePassword = "zenchat"
            keyAlias = "app"
            keyPassword = "zenchat"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
        }
        debug { signingConfig = signingConfigs.getByName("release") }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // recortar los clips a vertical (9:16) en el propio móvil
    implementation("androidx.media3:media3-transformer:1.5.1")
    implementation("androidx.media3:media3-effect:1.5.1")
    implementation("androidx.media3:media3-common:1.5.1")
}
