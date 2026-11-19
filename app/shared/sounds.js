'use strict';
// Sonidos de serie de ZenChat, hechos con el sintetizador del navegador (sin
// archivos, sin copyright). Los usan las alertas (OBS) y la app (menciones).
//   ZenSounds.play('synth:coin', 0.8)   ZenSounds.play('media/abc.mp3', 0.5)
(function (g) {
  let ctx = null;
  const ac = () => {
    if (!ctx) ctx = new (g.AudioContext || g.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  const N = n => 440 * Math.pow(2, (n - 69) / 12); // nota MIDI → Hz

  // una nota: tipo de onda, frecuencia (o [de, a] para deslizar), cuándo, cuánto, volumen
  function tone(out, { type = 'sine', f, t = 0, d = 0.2, v = 0.3, a = 0.005, r = 0.08, det = 0 }) {
    const c = ac(), o = c.createOscillator(), gn = c.createGain(), t0 = c.currentTime + t;
    o.type = type; o.detune.value = det;
    if (Array.isArray(f)) { o.frequency.setValueAtTime(f[0], t0); o.frequency.exponentialRampToValueAtTime(f[1], t0 + d); }
    else o.frequency.setValueAtTime(f, t0);
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.exponentialRampToValueAtTime(v, t0 + a);
    gn.gain.setValueAtTime(v, t0 + Math.max(a, d - r));
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + d + r);
    o.connect(gn).connect(out);
    o.start(t0); o.stop(t0 + d + r + 0.05);
  }
  function noise(out, { t = 0, d = 0.3, v = 0.2, hp = 800, lp = 12000, decay = true }) {
    const c = ac(), len = Math.ceil(c.sampleRate * (d + 0.1)), buf = c.createBuffer(1, len, c.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = buf;
    const h = c.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp;
    const l = c.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp;
    const gn = c.createGain(), t0 = c.currentTime + t;
    gn.gain.setValueAtTime(v, t0);
    if (decay) gn.gain.exponentialRampToValueAtTime(0.0001, t0 + d); else gn.gain.setValueAtTime(0, t0 + d);
    s.connect(h).connect(l).connect(gn).connect(out);
    s.start(t0); s.stop(t0 + d + 0.1);
  }
  const arp = (out, notes, step, o) => notes.forEach((n, i) => tone(out, { f: N(n), t: i * step, ...o }));

  const PRESETS = {
    chime: { name: 'Campanita', len: 1.4, fn: o => { arp(o, [76, 83, 88], 0.11, { type: 'sine', d: 0.9, v: 0.25, r: 0.5 }); arp(o, [88, 95], 0.11, { type: 'triangle', d: 0.6, v: 0.06, r: 0.4, t: 0.05 }); } },
    coin: { name: 'Moneda', len: 0.6, fn: o => { tone(o, { type: 'square', f: N(83), d: 0.07, v: 0.12 }); tone(o, { type: 'square', f: N(88), t: 0.07, d: 0.35, v: 0.12, r: 0.2 }); } },
    levelup: { name: 'Subir de nivel', len: 1.2, fn: o => { arp(o, [60, 64, 67, 72, 76, 79, 84], 0.07, { type: 'square', d: 0.09, v: 0.09 }); tone(o, { type: 'square', f: N(84), t: 0.5, d: 0.5, v: 0.1, r: 0.3 }); } },
    tada: { name: 'Tachán', len: 1.6, fn: o => { noise(o, { d: 0.5, v: 0.12, hp: 300, lp: 2000 }); [0, 0.12].forEach((t, i) => [60, 64, 67, 72].forEach(n => tone(o, { type: 'sawtooth', f: N(n + (i ? 0 : -5)), t, d: i ? 1.0 : 0.1, v: 0.05, r: 0.5 }))); } },
    fanfare: { name: 'Fanfarria', len: 2.0, fn: o => { const s = [[67, 0, 0.15], [67, 0.16, 0.15], [67, 0.32, 0.15], [72, 0.5, 0.9]]; s.forEach(([n, t, d]) => { tone(o, { type: 'sawtooth', f: N(n), t, d, v: 0.08, r: 0.3 }); tone(o, { type: 'sawtooth', f: N(n - 12), t, d, v: 0.06, r: 0.3, det: 6 }); tone(o, { type: 'square', f: N(n + 4), t, d, v: 0.03, r: 0.3 }); }); } },
    horn: { name: 'Bocina', len: 1.6, fn: o => { [0, 0.28, 0.56].forEach((t, i) => [0, 7, 12].forEach(k => tone(o, { type: 'sawtooth', f: N(58 + k), t, d: i === 2 ? 0.8 : 0.22, v: 0.07, det: k * 3, r: 0.12 }))); } },
    laser: { name: 'Láser', len: 0.6, fn: o => { tone(o, { type: 'sawtooth', f: [2200, 160], d: 0.35, v: 0.15 }); tone(o, { type: 'square', f: [1600, 120], t: 0.05, d: 0.3, v: 0.06 }); } },
    pop: { name: 'Pop', len: 0.3, fn: o => { tone(o, { type: 'sine', f: [300, 900], d: 0.06, v: 0.4, r: 0.05 }); } },
    bubble: { name: 'Burbujas', len: 0.9, fn: o => { [0, 0.09, 0.17, 0.3].forEach((t, i) => tone(o, { type: 'sine', f: [250 + i * 120, 900 + i * 200], t, d: 0.08, v: 0.25, r: 0.05 })); } },
    magic: { name: 'Magia', len: 1.8, fn: o => { for (let i = 0; i < 14; i++) tone(o, { type: 'sine', f: N(84 + ((i * 5) % 14)), t: i * 0.06, d: 0.25, v: 0.07, r: 0.3 }); noise(o, { d: 1.2, v: 0.03, hp: 6000 }); } },
    powerup: { name: 'Power-up', len: 1.0, fn: o => { tone(o, { type: 'square', f: [200, 1400], d: 0.5, v: 0.08 }); tone(o, { type: 'triangle', f: [400, 2800], d: 0.5, v: 0.08 }); } },
    alarm: { name: 'Alarma', len: 1.4, fn: o => { for (let i = 0; i < 6; i++) tone(o, { type: 'square', f: i % 2 ? N(76) : N(81), t: i * 0.2, d: 0.18, v: 0.08, r: 0.02 }); } },
    drumroll: { name: 'Redoble', len: 2.2, fn: o => { for (let i = 0; i < 28; i++) noise(o, { t: i * 0.05, d: 0.05, v: 0.06 + i * 0.004, hp: 200, lp: 3000 }); noise(o, { t: 1.45, d: 0.7, v: 0.3, hp: 4000 }); tone(o, { type: 'sine', f: [120, 50], t: 1.45, d: 0.3, v: 0.5 }); } },
    raid: { name: 'Sirena de raid', len: 2.4, fn: o => { for (let i = 0; i < 3; i++) { tone(o, { type: 'sawtooth', f: [500, 1100], t: i * 0.7, d: 0.35, v: 0.07 }); tone(o, { type: 'sawtooth', f: [1100, 500], t: i * 0.7 + 0.35, d: 0.35, v: 0.07 }); } } },
    sparkle: { name: 'Destellos', len: 1.2, fn: o => { [96, 100, 103, 108, 103, 108].forEach((n, i) => tone(o, { type: 'triangle', f: N(n), t: i * 0.08 + Math.random() * 0.02, d: 0.12, v: 0.08, r: 0.25 })); } },
    ding: { name: 'Ding', len: 1.2, fn: o => { tone(o, { type: 'sine', f: N(88), d: 0.05, v: 0.35, r: 1.0 }); tone(o, { type: 'sine', f: N(88) * 2.76, d: 0.03, v: 0.06, r: 0.4 }); } },
    boing: { name: 'Boing', len: 0.8, fn: o => { tone(o, { type: 'sine', f: [120, 420], d: 0.15, v: 0.3 }); tone(o, { type: 'sine', f: [420, 200], t: 0.15, d: 0.4, v: 0.25 }); } },
    blip: { name: 'Blip (mención)', len: 0.3, fn: o => { tone(o, { type: 'square', f: N(84), d: 0.04, v: 0.08 }); tone(o, { type: 'square', f: N(91), t: 0.05, d: 0.06, v: 0.08 }); } },
    knock: { name: 'Toc toc', len: 0.6, fn: o => { [0, 0.16].forEach(t => { tone(o, { type: 'sine', f: [180, 90], t, d: 0.06, v: 0.6, r: 0.04 }); noise(o, { t, d: 0.03, v: 0.1, hp: 1000, lp: 4000 }); }); } },
    cash: { name: 'Caja registradora', len: 1.2, fn: o => { noise(o, { d: 0.12, v: 0.2, hp: 2000 }); tone(o, { type: 'sine', f: N(93), t: 0.12, d: 0.05, v: 0.3, r: 0.8 }); tone(o, { type: 'sine', f: N(100), t: 0.18, d: 0.05, v: 0.2, r: 0.8 }); } },
  };

  const playing = new Set();
  function play(src, vol = 0.8) {
    if (!src || src === 'none') return Promise.resolve();
    vol = Math.max(0, Math.min(1, +vol));
    if (src.startsWith('synth:')) {
      const p = PRESETS[src.slice(6)];
      if (!p) return Promise.resolve();
      const c = ac(), out = c.createGain();
      out.gain.value = vol * 1.4;
      out.connect(c.destination);
      p.fn(out);
      return new Promise(r => setTimeout(() => { try { out.disconnect(); } catch {} r(); }, p.len * 1000));
    }
    return new Promise(r => {
      const a = new Audio(src);
      a.volume = vol;
      playing.add(a);
      const done = () => { playing.delete(a); r(); };
      a.onended = done; a.onerror = done;
      a.play().catch(done);
    });
  }
  function stopAll() { for (const a of playing) { try { a.pause(); } catch {} } playing.clear(); }
  function list() { return Object.entries(PRESETS).map(([id, p]) => ({ id: 'synth:' + id, name: p.name })); }

  g.ZenSounds = { play, stopAll, list, unlock: ac };
})(typeof window !== 'undefined' ? window : globalThis);
