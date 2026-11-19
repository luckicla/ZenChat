'use strict';
// La configuración de ZenChat (un JSON) y los archivos de las alertas (imágenes,
// GIF, vídeos y sonidos que subes). Todo va en la carpeta de datos de la app;
// en la portable, en una carpeta «ZenChat-datos» al lado del .exe.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'config.json');
    this.mediaDir = path.join(dir, 'media');
    fs.mkdirSync(this.mediaDir, { recursive: true });
    this.data = {};
    try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch {
      // (si se rompió a medias, la copia de antes)
      try { this.data = JSON.parse(fs.readFileSync(this.file + '.bak', 'utf8')); } catch {}
    }
    this.t = null;
  }
  get(k) { return k ? this.data[k] : this.data; }
  set(k, v) { this.data[k] = v; this.save(); }
  patch(obj) { Object.assign(this.data, obj || {}); this.save(); }
  save() {
    clearTimeout(this.t);
    this.t = setTimeout(() => this.flush(), 300);
  }
  flush() {
    clearTimeout(this.t);
    try {
      const s = JSON.stringify(this.data, null, 1);
      if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.file + '.bak');
      fs.writeFileSync(this.file + '.tmp', s);
      fs.renameSync(this.file + '.tmp', this.file);
    } catch (e) { console.error('config:', e.message); }
  }
  // un archivo subido desde el editor de alertas → «media/<hash>.<ext>»
  addMedia(name, buf) {
    const ext = (path.extname(String(name || '')).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.bin').slice(0, 6);
    const ok = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.webm', '.mp4', '.mp3', '.wav', '.ogg', '.m4a', '.opus', '.flac', '.apng', '.svg'];
    if (!ok.includes(ext)) throw new Error('Ese tipo de archivo no vale: ' + ext);
    const b = Buffer.from(buf);
    const id = crypto.createHash('sha1').update(b).digest('hex').slice(0, 16) + ext;
    const f = path.join(this.mediaDir, id);
    if (!fs.existsSync(f)) fs.writeFileSync(f, b);
    return 'media/' + id;
  }
  listMedia() {
    try {
      return fs.readdirSync(this.mediaDir).map(n => {
        const st = fs.statSync(path.join(this.mediaDir, n));
        return { path: 'media/' + n, size: st.size, t: st.mtimeMs };
      }).sort((a, b) => b.t - a.t);
    } catch { return []; }
  }
}

module.exports = { Store };
