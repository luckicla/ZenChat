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

  // «saltar» corta la alerta entera: la espera, el sonido y la voz
  let cur = null;
  const wait = ms => new Promise(r => {
    if (!cur || cur.dead) return r();
    const t = setTimeout(r, ms);
    cur.stops.push(() => { clearTimeout(t); r(); });
  });
  const isVideo = p => /\.(webm|mp4)$/i.test(p || '');

  async function next() {
    if (busy || paused || !queue.length) return;
    busy = true;
    const ev = queue.shift();
    cur = { dead: false, stops: [] };
    skipNow = () => { if (!cur) return; cur.dead = true; try { speechSynthesis.cancel(); } catch {} ZenSounds.stopAll(); cur.stops.splice(0).forEach(f => f()); };
    try { await show(ev); } catch (e) { console.error(e); }
    cur = null;
    Zen.done({ id: ev.id, type: ev.type });
    skipNow = null;
    await new Promise(r => setTimeout(r, (cfg.global.gap || 0) * 1000));
    busy = false;
    next();
  }

  // leer el mensaje en voz alta (cuando acaba el sonido)
  function voice(c, ev, after) {
    const msg = ev.message;
    if (!(c.tts && msg && (+ev.amountValue || 0) >= (+c.ttsMin || 0) && 'speechSynthesis' in window)) return Promise.resolve();
    return after.then(() => new Promise(r => {
      if (!cur || cur.dead) return r();
      const u = new SpeechSynthesisUtterance(String(msg).slice(0, 300));
      u.lang = 'es-ES'; u.rate = cfg.global.ttsRate || 1; u.volume = cfg.global.ttsVol ?? 0.9;
      const v = speechSynthesis.getVoices().find(v => v.name === cfg.global.ttsVoice);
      if (v) u.voice = v;
      u.onend = u.onerror = r;
      cur.stops.push(r);
      speechSynthesis.speak(u);
      setTimeout(r, 30000);
    }));
  }

  // parte el texto en letras (para «letra a letra» y «ola»), sin romper las palabras al saltar de línea
  function split(root) {
    if (!root) return;
    let i = 0;
    const walk = node => {
      for (const n of [...node.childNodes]) {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const w = document.createElement('span'); w.className = 'wd';
            for (const ch of part) { const s = document.createElement('span'); s.className = 'ch'; s.style.setProperty('--i', i++); s.textContent = ch; w.appendChild(s); }
            frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      }
    };
    walk(root);
  }

  // efectos al salir la alerta: confeti, corazones, monedas, chispas o temblor con flash
  function fx(kind, el, c) {
    if (!kind || kind === 'none') return;
    const r = el.querySelector('.txt').getBoundingClientRect();
    const layer = document.createElement('div');
    layer.className = 'fxl';
    layer.style.left = (r.left + r.width / 2) + 'px';
    layer.style.top = (r.top + r.height / 2) + 'px';
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 4500);
    const cols = [c.color, c.color2, '#ffffff', '#ffd166', '#ff6fa7', '#6ff0c0'];
    const rnd = (a, b) => a + Math.random() * (b - a);
    const spray = (n, make, spread = 1) => {
      for (let i = 0; i < n; i++) {
        const p = make(i);
        layer.appendChild(p);
        const ang = rnd(0, Math.PI * 2), dist = rnd(180, 520) * spread;
        const x = Math.cos(ang) * dist, y = Math.sin(ang) * dist * 0.7 - rnd(60, 200);
        p.animate([
          { transform: 'translate(-50%,-50%) scale(.3) rotate(0deg)', opacity: 1 },
          { transform: `translate(calc(-50% + ${x}px),calc(-50% + ${y}px)) scale(1) rotate(${rnd(-360, 360)}deg)`, opacity: 1, offset: 0.5 },
          { transform: `translate(calc(-50% + ${x * 1.15}px),calc(-50% + ${y + rnd(260, 480)}px)) scale(.8) rotate(${rnd(-720, 720)}deg)`, opacity: 0 },
        ], { duration: rnd(1600, 2800), easing: 'cubic-bezier(.12,.7,.4,1)', fill: 'forwards' });
      }
    };
    const piece = (cls, txt, col) => { const d = document.createElement('i'); d.className = 'p ' + cls; if (txt) d.textContent = txt; if (col) d.style.setProperty('--pc', col); return d; };
    if (kind === 'confetti') spray(90, i => piece(i % 4 ? 'cf' : 'cf rd', '', cols[i % cols.length]));
    if (kind === 'hearts') spray(26, i => piece('ht', '♥', i % 2 ? c.color : '#ff5d8f'), 0.8);
    if (kind === 'coins') spray(34, () => piece('cn', ''), 0.9);
    if (kind === 'sparks') spray(40, i => piece('sp', '✦', cols[i % 3]), 0.7);
    if (kind === 'shake') {
      const f = document.createElement('div'); f.className = 'flash'; f.style.setProperty('--pc', c.color);
      document.body.appendChild(f);
      f.animate([{ opacity: 0 }, { opacity: 0.85, offset: 0.15 }, { opacity: 0 }], { duration: 700, fill: 'forwards' }).onfinish = () => f.remove();
      stage.animate([0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => ({ translate: i === 8 ? '0 0' : `${rnd(-18, 18)}px ${rnd(-14, 14)}px` })), { duration: 520, easing: 'linear' });
      spray(30, i => piece('sp', '✦', cols[i % 3]), 1.1);
    }
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
    const dur = c.dur || 7, delay = Math.max(0, +c.textDelay || 0);
    const bar = c.bar !== false ? `<div class="tbar"><i style="animation-duration:${dur - delay}s;animation-delay:${delay}s"></i></div>` : '';
    el.innerHTML = `${media}<div class="txt"><div class="t1">${ZenAlerts.fill(c.text, ev, true)}</div>${sub ? `<div class="t2">${sub}</div>` : ''}${bar}</div>`;
    const ta = c.textAnim || 'none';
    el.classList.add('ta-' + ta);
    if (ta === 'letters') split(el.querySelector('.t1'));
    else if (ta === 'wave') el.querySelectorAll('.t1 .v').forEach(split);
    if (delay) el.classList.add('td');
    el.style.setProperty('--td', delay + 's');
    if (src && !isVideo(src)) await new Promise(r => { const i = el.querySelector('img'); i.onload = i.onerror = r; setTimeout(r, 1500); });
    stage.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    const showText = () => { el.classList.add('tshow'); setTimeout(() => { if (el.isConnected && !(cur && cur.dead)) fx(c.fx, el, c); }, 260); };
    if (delay) setTimeout(showText, delay * 1000); else showText();
    const vol = (c.vol ?? 0.8) * (cfg.global.volume ?? 0.8);
    const sound = ZenSounds.play(Zen.media(c.sound) || c.sound, vol);
    const speech = voice(c, ev, sound);
    await Promise.all([wait(dur * 1000), speech]);
    try { speechSynthesis.cancel(); } catch {}
    el.classList.remove('in'); el.classList.add('out');
    await new Promise(r => setTimeout(r, 600));
    el.remove();
  }
})();
