package com.luckicla.zenchat

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.webkit.JavascriptInterface
import android.widget.Toast
import org.json.JSONObject
import java.io.File
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit
import java.util.concurrent.Executors

// window.ZenAndroid: lo que app/js/platform.js usa en el móvil
class Bridge(private val act: MainActivity) {
    private val pool = Executors.newFixedThreadPool(6)
    private val cfgFile = File(act.filesDir, "config.json")
    private val clipper = Clipper(act)
    private val client = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(25, TimeUnit.SECONDS).build()

    @JavascriptInterface fun version(): String {
        val p = act.packageManager.getPackageInfo(act.packageName, 0)
        val code = if (Build.VERSION.SDK_INT >= 28) p.longVersionCode else @Suppress("DEPRECATION") p.versionCode.toLong()
        return JSONObject().put("name", p.versionName).put("code", code).toString()
    }

    @JavascriptInterface fun load(): String = try { cfgFile.readText() } catch (_: Exception) { "{}" }

    @JavascriptInterface fun save(json: String) {
        pool.execute {
            try { val t = File(act.filesDir, "config.tmp"); t.writeText(json); t.renameTo(cfgFile) } catch (_: Exception) {}
        }
    }

    // una petición HTTP (Twitch, 7TV, BTTV, FFZ, ivr…): contesta con window.__zenCb(id, status, texto)
    @JavascriptInterface fun http(id: String, method: String, url: String, headers: String, body: String) {
        pool.execute {
            var status = 0
            var text = ""
            try {
                val h = JSONObject(headers.ifBlank { "{}" })
                val rb = Request.Builder().url(url).header("User-Agent", "ZenChat-Android (github.com/luckicla/ZenChat)")
                var ct = "application/json"
                for (k in h.keys()) { rb.header(k, h.getString(k)); if (k.equals("Content-Type", true)) ct = h.getString(k) }
                val reqBody = if (method == "GET" || method == "HEAD") null
                    else body.toRequestBody(ct.toMediaTypeOrNull())
                rb.method(method, if (reqBody == null && method in listOf("POST", "PUT", "PATCH")) ByteArray(0).toRequestBody(null) else reqBody)
                client.newCall(rb.build()).execute().use { r -> status = r.code; text = r.body?.string() ?: "" }
            } catch (e: Exception) { text = ""; status = 0 }
            act.js("window.__zenCb && window.__zenCb(${JSONObject.quote(id)}, $status, ${JSONObject.quote(text)})")
        }
    }

    @JavascriptInterface fun open(url: String) { act.runOnUiThread { MainActivity.openUrl(act, url) } }

    @JavascriptInterface fun copy(text: String) {
        act.runOnUiThread {
            (act.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("ZenChat", text))
        }
    }

    @JavascriptInterface fun vibrate(ms: Int) {
        try {
            val v = act.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(ms.toLong().coerceIn(5, 600), VibrationEffect.DEFAULT_AMPLITUDE))
        } catch (_: Exception) {}
    }

    @JavascriptInterface fun toast(text: String) { act.runOnUiThread { Toast.makeText(act, text, Toast.LENGTH_SHORT).show() } }

    // clip: { id, url, pos: left|center|right, portrait } → baja, recorta a 9:16 y guarda en la galería
    @JavascriptInterface fun clip(json: String) { clipper.start(JSONObject(json)) }

    @JavascriptInterface fun share(uri: String, tiktok: Boolean) {
        act.runOnUiThread {
            val i = Intent(Intent.ACTION_SEND).apply {
                type = "video/mp4"
                putExtra(Intent.EXTRA_STREAM, Uri.parse(uri))
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            if (tiktok) {
                for (pkg in listOf("com.zhiliaoapp.musically", "com.ss.android.ugc.trill")) {
                    try { act.startActivity(Intent(i).setPackage(pkg)); return@runOnUiThread } catch (_: Exception) {}
                }
                Toast.makeText(act, "No encuentro TikTok: elige dónde compartirlo", Toast.LENGTH_SHORT).show()
            }
            act.startActivity(Intent.createChooser(i, "Compartir clip"))
        }
    }

    @JavascriptInterface fun view(uri: String) {
        act.runOnUiThread {
            try {
                act.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse(uri), "video/mp4").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
            } catch (_: Exception) {}
        }
    }
}
