package com.luckicla.zenchat

import android.content.ContentValues
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Crop
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

// Clip rápido para TikTok: baja el clip de Twitch, lo recorta a vertical
// (1080×1920, el trozo de la izquierda, el centro o la derecha) y lo guarda en
// la galería (Películas/ZenChat). Va contando a la página cómo va.
@OptIn(UnstableApi::class)
class Clipper(private val act: MainActivity) {
    private val main = Handler(Looper.getMainLooper())
    private val http = OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).build()

    private fun tell(state: String, pct: Int = 0, uri: String = "", msg: String = "") {
        val o = JSONObject().put("state", state).put("pct", pct).put("uri", uri).put("msg", msg)
        act.js("window.__zenClip && window.__zenClip($o)")
    }

    fun start(o: JSONObject) {
        val id = o.optString("id").ifBlank { "clip" }.replace(Regex("[^A-Za-z0-9_-]"), "")
        val url = o.getString("url")
        val pos = o.optString("pos", "center")
        val portrait = o.optBoolean("portrait", false)
        Thread {
            try {
                tell("download", 0)
                val src = File(act.cacheDir, "clip_$id.mp4")
                http.newCall(Request.Builder().url(url).build()).execute().use { r ->
                    if (!r.isSuccessful) throw Exception("Twitch no deja bajar el clip (${r.code})")
                    val body = r.body ?: throw Exception("Clip vacío")
                    val total = body.contentLength()
                    body.byteStream().use { input ->
                        src.outputStream().use { out ->
                            val buf = ByteArray(64 * 1024); var n: Int; var done = 0L; var last = -1
                            while (input.read(buf).also { n = it } >= 0) {
                                out.write(buf, 0, n); done += n
                                if (total > 0) { val p = (done * 100 / total).toInt(); if (p != last) { last = p; tell("download", p) } }
                            }
                        }
                    }
                }
                if (portrait) { save(src, id); return@Thread }
                val out = File(act.cacheDir, "clip_${id}_vertical.mp4")
                main.post { crop(src, out, pos, id) }
            } catch (e: Exception) { tell("error", msg = e.message ?: "Error") }
        }.start()
    }

    private fun crop(src: File, out: File, pos: String, id: String) {
        out.delete()
        // un 16:9 → 9:16: se queda un 31,6 % del ancho. En coordenadas de -1 a 1, 0,633 de ancho
        val w = 2f * (9f / 16f) / (16f / 9f)
        val effects = mutableListOf<androidx.media3.common.Effect>()
        when (pos) {
            "left" -> effects.add(Crop(-1f, -1f + w, -1f, 1f))
            "right" -> effects.add(Crop(1f - w, 1f, -1f, 1f))
        }
        effects.add(Presentation.createForWidthAndHeight(1080, 1920, Presentation.LAYOUT_SCALE_TO_FIT_WITH_CROP))
        val item = EditedMediaItem.Builder(MediaItem.fromUri(android.net.Uri.fromFile(src)))
            .setEffects(Effects(listOf(), effects))
            .build()
        val tr = Transformer.Builder(act)
            .setVideoMimeType(MimeTypes.VIDEO_H264)
            .addListener(object : Transformer.Listener {
                override fun onCompleted(composition: Composition, exportResult: ExportResult) {
                    Thread { try { save(out, id); src.delete() } catch (e: Exception) { tell("error", msg = e.message ?: "Error") } }.start()
                }
                override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
                    tell("error", msg = "No se pudo recortar: " + (exportException.message ?: ""))
                }
            })
            .build()
        tr.start(item, out.absolutePath)
        val ph = ProgressHolder()
        val tick = object : Runnable {
            override fun run() {
                val st = tr.getProgress(ph)
                if (st == Transformer.PROGRESS_STATE_NOT_STARTED) return
                if (st == Transformer.PROGRESS_STATE_AVAILABLE) tell("crop", ph.progress)
                main.postDelayed(this, 300)
            }
        }
        main.postDelayed(tick, 300)
    }

    private fun save(f: File, id: String) {
        tell("save", 100)
        val cv = ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, "ZenChat_${id}_${System.currentTimeMillis() / 1000}.mp4")
            put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
            put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/ZenChat")
            put(MediaStore.Video.Media.IS_PENDING, 1)
        }
        val r = act.contentResolver
        val uri = r.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, cv) ?: throw Exception("No se pudo guardar en la galería")
        r.openOutputStream(uri)?.use { o -> f.inputStream().use { it.copyTo(o) } }
        cv.clear(); cv.put(MediaStore.Video.Media.IS_PENDING, 0)
        r.update(uri, cv, null, null)
        f.delete()
        tell("done", 100, uri.toString())
    }
}
