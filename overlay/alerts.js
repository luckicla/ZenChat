'use strict';
// Overlay de alertas: en OBS, «Navegador» → http://127.0.0.1:47830/alerts
// (1920×1080, y marca «Controlar audio mediante OBS» si quieres el sonido en
// su propio fader). Hace cola: una alerta detrás de otra.
(() => {
  const stage = document.getElementById('stage');
  document.getElementById('fonts').href = ZenAlerts.FONTS_URL;
  let cfg = ZenAlerts.complete(null);
  const queue = [];
  let busy = false, paused = false, skipNow = null;

  let wd = null;
  Zen.on('config', c => {
    cfg = ZenAlerts.complete(c.alerts);
    wd = Zen.widget(c);
    paused = !!cfg.global.paused;
    document.body.dataset.pos = (wd && wd.pos) || cfg.global.pos || 'center';
    document.body.style.setProperty('--scale', (wd && wd.scale) || cfg.global.scale || 1);
    if (!paused) next();
  });
  Zen.on('alert', ev => {
    // un recuadro de alertas puede enseñar solo algunos tipos
    if (wd && Array.isArray(wd.types) && wd.types.length && !wd.types.includes(ev.type)) return;
    queue.push(ev); next();
  });
  Zen.on('control', c => {
    if (c.do === 'skip' && skipNow) skipNow();
    if (c.do === 'clear') { queue.length = 0; if (skipNow) skipNow(); }
    if (c.do === 'pause') paused = true;
    if (c.do === 'resume') { paused = false; next(); }
  });
  Zen.start(Zen.q.get('w') || 'alerts');

  const wait = ms => new Promise(r => { const t = setTimeout(r, ms); skipNow = () => { clearTimeout(t); try { speechSynthesis.cancel(); } catch {} ZenSounds.stopAll(); r(); }; });
  const isVideo = p => /\.(webm|mp4)$/i.test(p || '');

  async function next() {
    if (busy || paused || !queue.length) return;
    busy = true;
    const ev = queue.shift();
    try { await show(ev); } catch (e) { console.error(e); }
    Zen.done({ id: ev.id, type: ev.type });
    skipNow = null;
    await new Promise(r => setTimeout(r, (cfg.global.gap || 0) * 1000));
    busy = false;
    next();
  }

  async function show(ev) {
    const c = ZenAlerts.resolve(cfg, ev);
    if (!c) return;
    const el = document.createElement('div');
    el.className = `alert st-${c.style} ly-${c.layout} an-${c.anim}`;
    el.style.setProperty('--a1', c.color);
    el.style.setProperty('--a2', c.color2);
    el.style.setProperty('--fg', c.textColor);
    el.style.setProperty('--font', ZenAlerts.FONTS[c.font] || ZenAlerts.FONTS.grotesk);
    el.style.setProperty('--size', (c.size || 42) + 'px');
    el.style.setProperty('--img', (c.imgSize || 240) + 'px');
    const src = Zen.media(c.img);
    const media = !src ? '' : isVideo(src)
      ? `<video class="media" src="${src}" autoplay muted playsinline loop></video>`
      : `<img class="media" src="${src}" alt="">`;
    const sub = ZenAlerts.fill(c.sub, ev, true);
    el.innerHTML = `${media}<div class="txt"><div class="t1">${ZenAlerts.fill(c.text, ev, true)}</div>${sub ? `<div class="t2">${sub}</div>` : ''}</div>`;
    if (src && !isVideo(src)) await new Promise(r => { const i = el.querySelector('img'); i.onload = i.onerror = r; setTimeout(r, 1500); });
    stage.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    const vol = (c.vol ?? 0.8) * (cfg.global.volume ?? 0.8);
    const sound = ZenSounds.play(Zen.media(c.sound) || c.sound, vol);
    // leer el mensaje en voz alta (cuando acaba el sonido)
    let speech = Promise.resolve();
    const msg = ev.message;
    if (c.tts && msg && (+ev.amountValue || 0) >= (+c.ttsMin || 0) && 'speechSynthesis' in window) {
      speech = sound.then(() => new Promise(r => {
        const u = new SpeechSynthesisUtterance(String(msg).slice(0, 300));
        u.lang = 'es-ES'; u.rate = cfg.global.ttsRate || 1; u.volume = cfg.global.ttsVol ?? 0.9;
        const v = speechSynthesis.getVoices().find(v => v.name === cfg.global.ttsVoice);
        if (v) u.voice = v;
        u.onend = u.onerror = r;
        speechSynthesis.speak(u);
        setTimeout(r, 30000);
      }));
    }
    await Promise.all([wait((c.dur || 7) * 1000), speech]);
    try { speechSynthesis.cancel(); } catch {}
    el.classList.remove('in'); el.classList.add('out');
    await new Promise(r => setTimeout(r, 600));
    el.remove();
  }
})();
