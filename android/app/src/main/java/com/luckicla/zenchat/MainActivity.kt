package com.luckicla.zenchat

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import android.widget.FrameLayout
import androidx.webkit.WebViewAssetLoader

// ZenChat en el móvil: la misma interfaz que en el PC (la carpeta app/ del
// repo va dentro del APK) en un WebView, con un puente (Bridge) para lo que
// la página no puede hacer sola: pedir cosas a Twitch sin CORS, guardar la
// configuración, abrir enlaces, vibrar y los clips en vertical.
class MainActivity : ComponentActivity() {
    lateinit var web: WebView
    lateinit var bridge: Bridge
    var lastInsets = "24|16"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        web = WebView(this)
        web.setBackgroundColor(0xFF0E0F13.toInt())
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            textZoom = 100
        }
        bridge = Bridge(this)
        web.addJavascriptInterface(bridge, "ZenAndroid")
        web.webChromeClient = WebChromeClient()
        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                val (t, b) = lastInsets.split("|")
                view.evaluateJavascript("document.documentElement.style.setProperty('--sat','${t}px');document.documentElement.style.setProperty('--sab','${b}px')", null)
            }
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.host == "appassets.androidplatform.net") return false
                try { startActivity(Intent(Intent.ACTION_VIEW, u)) } catch (_: Exception) {}
                return true
            }
        }
        // De borde a borde: la página va detrás de las barras del sistema (el
        // cristal se ve bajo la hora y la batería) y sabe cuánto ocupan con
        // --sat/--sab; el teclado sí empuja el contenido hacia arriba.
        val root = FrameLayout(this)
        root.setBackgroundColor(0xFF0E0F13.toInt())
        root.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = 0x00000000
        window.navigationBarColor = 0x00000000
        WindowInsetsControllerCompat(window, root).isAppearanceLightStatusBars = false
        WindowInsetsControllerCompat(window, root).isAppearanceLightNavigationBars = false
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            v.setPadding(0, 0, 0, ime.bottom)
            val d = resources.displayMetrics.density
            val top = bars.top / d; val bottom = (if (ime.bottom > 0) 0 else bars.bottom) / d
            web.evaluateJavascript("document.documentElement.style.setProperty('--sat','${top}px');document.documentElement.style.setProperty('--sab','${bottom}px');document.documentElement.classList.toggle('kb',${ime.bottom > 0})", null)
            lastInsets = "$top|$bottom"
            insets
        }
        setContentView(root)
        web.loadUrl("https://appassets.androidplatform.net/assets/index.html")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // la página cierra lo que haya abierto (tarjeta, menú, Actividad…); si no había nada, se sale
                web.evaluateJavascript("(window.zenBack && window.zenBack()) ? 1 : 0") { r ->
                    if (r != "1") { isEnabled = false; onBackPressedDispatcher.onBackPressed(); isEnabled = true }
                }
            }
        })
    }

    fun js(code: String) { runOnUiThread { web.evaluateJavascript(code, null) } }

    override fun onDestroy() { web.destroy(); super.onDestroy() }

    companion object {
        fun openUrl(a: ComponentActivity, url: String) {
            try { a.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: Exception) {}
        }
        val isNew: Boolean get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
    }
}
