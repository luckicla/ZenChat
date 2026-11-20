'use strict';
// Los tipos de alerta de ZenChat, cómo vienen de serie y cómo se rellena el
// texto. Lo usan la app (editor y prueba) y el overlay de OBS.
(function (g) {
  const TYPES = [
    { id: 'follow', name: 'Follow', icon: '♥', vars: '{user}', amount: null, text: '{user} te sigue', sub: '¡Bienvenid@ a la comunidad!', sound: 'synth:chime' },
    { id: 'sub', name: 'Sub nueva', icon: '★', vars: '{user} {tier}', amount: null, text: '{user} se ha suscrito', sub: 'Nivel {tier}', sound: 'synth:levelup' },
    { id: 'resub', name: 'Resub', icon: '★', vars: '{user} {months} {streak} {tier} {message}', amount: 'months', text: '{user} lleva {months} meses', sub: '{message}', sound: 'synth:levelup' },
    { id: 'gift', name: 'Subs regaladas', icon: '🎁', vars: '{user} {amount} {tier} {total}', amount: 'amount', text: '{user} regala {amount} subs', sub: 'Ya van {total} en total', sound: 'synth:tada' },
    { id: 'cheer', name: 'Bits', icon: '◆', vars: '{user} {amount} {message}', amount: 'amount', text: '{user} ha tirado {amount} bits', sub: '{message}', sound: 'synth:coin' },
    { id: 'raid', name: 'Raid', icon: '⚑', vars: '{user} {amount}', amount: 'amount', text: '¡RAID de {user}!', sub: 'con {amount} personas', sound: 'synth:raid' },
    { id: 'points', name: 'Puntos del canal', icon: '◎', vars: '{user} {reward} {cost} {message}', amount: 'cost', text: '{user} canjeó {reward}', sub: '{message}', sound: 'synth:magic' },
    { id: 'powerup', name: 'Power-ups', icon: '⚡', vars: '{user} {reward} {cost} {message}', amount: 'cost', text: '{user} usó {reward}', sub: '{message}', sound: 'synth:powerup' },
    { id: 'hypetrain', name: 'Hype Train', icon: '🚂', vars: '{level} {total} {phase}', amount: 'level', text: 'HYPE TRAIN · nivel {level}', sub: '{phase}', sound: 'synth:fanfare' },
    { id: 'firstchat', name: 'Primer mensaje', icon: '✎', vars: '{user} {message}', amount: null, text: '¡{user} escribe por primera vez!', sub: '{message}', sound: 'synth:sparkle', on: false },
    { id: 'streak', name: 'Racha de directos', icon: '🔥', vars: '{user} {amount}', amount: 'amount', text: '{user} lleva {amount} directos seguidos', sub: '', sound: 'synth:bubble', on: false },
    { id: 'shoutout', name: 'Shoutout recibido', icon: '📣', vars: '{user} {amount}', amount: 'amount', text: '{user} te ha dado un shoutout', sub: 'delante de {amount} personas', sound: 'synth:horn' },
    { id: 'poll', name: 'Encuestas', icon: '▤', vars: '{title} {winner} {phase}', amount: null, text: '{phase}: {title}', sub: '{winner}', sound: 'synth:ding', on: false },
    { id: 'prediction', name: 'Predicciones', icon: '◐', vars: '{title} {winner} {phase}', amount: null, text: '{phase}: {title}', sub: '{winner}', sound: 'synth:ding', on: false },
    { id: 'adbreak', name: 'Anuncios', icon: '⏸', vars: '{amount}', amount: 'amount', text: 'Anuncios de {amount} s', sub: 'Ahora volvemos, no os vayáis', sound: 'synth:knock', on: false },
    { id: 'charity', name: 'Donación benéfica', icon: '♡', vars: '{user} {amount} {currency}', amount: 'amount', text: '{user} dona {amount} {currency}', sub: 'para la causa', sound: 'synth:cash' },
    { id: 'goal', name: 'Objetivo cumplido', icon: '◉', vars: '{title} {amount}', amount: 'amount', text: '¡Objetivo cumplido!', sub: '{title}', sound: 'synth:fanfare', on: false },
  ];

  const DEFAULT_GLOBAL = { volume: 0.8, gap: 1.2, pos: 'center', paused: false, ttsVoice: '', ttsRate: 1, ttsVol: 0.9, scale: 1 };
  function defaultType(t) {
    return {
      on: t.on !== false, dur: 7, layout: 'stack', style: 'card', anim: 'pop',
      img: '', imgSize: 280, sound: t.sound, vol: 0.8,
      text: t.text, sub: t.sub, font: 'inter', size: 58, color: '#a99bff', color2: '#5cc8ff', textColor: '#ffffff',
      min: 0, tts: false, ttsMin: 0, vars: [], rewards: {},
    };
  }
  function defaults() {
    const types = {};
    for (const t of TYPES) types[t.id] = defaultType(t);
    return { global: { ...DEFAULT_GLOBAL }, types };
  }
  // la configuración guardada + lo que falte, de serie
  function complete(cfg) {
    const d = defaults();
    if (!cfg) return d;
    const out = { global: { ...d.global, ...(cfg.global || {}) }, types: {} };
    for (const t of TYPES) out.types[t.id] = { ...d.types[t.id], ...((cfg.types || {})[t.id] || {}) };
    return out;
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // «{user} lleva {months} meses» → con los datos del evento. html: los nombres
  // van en <b class="v"> para pintarlos del color de acento
  function fill(tpl, ev, html) {
    return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => {
      const v = ev[k];
      if (v === undefined || v === null || v === '') return '';
      return html ? `<b class="v v-${k}">${esc(v)}</b>` : String(v);
    }).replace(/\s+([,.!?])/g, '$1').trim();
  }
  // lo que toca para este evento: el tipo + la variación por cantidad (la más
  // alta que se cumpla) + la recompensa concreta (puntos)
  function resolve(all, ev) {
    const base = all.types[ev.type];
    if (!base) return null;
    let c = { ...base };
    const amt = +ev.amountValue || 0;
    if (c.min && amt && amt < c.min) return null;
    const vs = (c.vars || []).filter(v => v && v.on !== false && amt >= (+v.min || 0)).sort((a, b) => (+b.min || 0) - (+a.min || 0));
    if (vs[0]) c = merge(c, vs[0]);
    if ((ev.type === 'points' || ev.type === 'powerup') && ev.reward && c.rewards) {
      const r = c.rewards[ev.reward] || c.rewards[String(ev.reward).toLowerCase()];
      if (r) { if (r.on === false) return null; c = merge(c, r); }
    }
    if (!c.on) return null;
    return c;
  }
  function merge(a, b) {
    const o = { ...a };
    for (const k of ['img', 'sound', 'text', 'sub', 'color', 'color2', 'anim', 'dur', 'imgSize', 'vol', 'tts']) {
      if (b[k] !== undefined && b[k] !== '' && b[k] !== null) o[k] = b[k];
    }
    return o;
  }
  // un evento de prueba de cada tipo (botón «Probar»)
  function sample(type, user) {
    const u = user || 'ZenTester';
    const s = {
      follow: {}, sub: { tier: '1' }, resub: { months: 14, streak: 3, tier: '1', message: 'catorce meses en esta mierda', amountValue: 14 },
      gift: { amount: 5, tier: '1', total: 42, amountValue: 5 }, cheer: { amount: 500, message: 'Cheer500 ¡vamos!', amountValue: 500 },
      raid: { amount: 128, amountValue: 128 }, points: { reward: 'Hidratarse', cost: 500, message: 'bebe agua', amountValue: 500 },
      powerup: { reward: 'Emote gigante', cost: 300, message: '', amountValue: 300 },
      hypetrain: { level: 2, total: 2400, phase: '¡Sube de nivel!', amountValue: 2 }, firstchat: { message: 'holaaa primera vez por aquí' },
      streak: { amount: 10, amountValue: 10 }, shoutout: { amount: 340, amountValue: 340 },
      poll: { title: '¿Qué juego mañana?', winner: 'Gana: Minecraft', phase: 'Encuesta' },
      prediction: { title: '¿Pasa del jefe?', winner: 'Gana: Sí', phase: 'Predicción' },
      adbreak: { amount: 90, amountValue: 90 }, charity: { amount: '5.00', currency: 'EUR', amountValue: 5 }, goal: { title: '100 seguidores', amount: 100 },
    }[type] || {};
    return { id: 'test-' + Date.now(), type, user: u, test: true, ...s };
  }
  const FONTS = {
    segoe: "'Segoe UI',system-ui,sans-serif", inter: "'Inter','Segoe UI',system-ui,sans-serif", grotesk: "'Space Grotesk',system-ui,sans-serif", vt: "'VT323',monospace", display: "'Anton',Impact,sans-serif",
    black: "'Archivo Black','Arial Black',sans-serif", bungee: "'Bungee','Arial Black',sans-serif", marker: "'Permanent Marker',cursive",
    pixel: "'Silkscreen',monospace", retro: "'Righteous',sans-serif", play: "'Playfair Display',Georgia,serif", bebas: "'Bebas Neue',Impact,sans-serif",
    mono: "'Space Mono',Consolas,monospace", rubik: "'Rubik Mono One','Arial Black',sans-serif",
  };
  const FONT_NAMES = { segoe: 'Segoe UI', inter: 'Inter', grotesk: 'Grotesk', vt: 'VT323', display: 'Anton', black: 'Archivo Black', bungee: 'Bungee', marker: 'Rotulador', pixel: 'Píxel', retro: 'Righteous', play: 'Playfair', bebas: 'Bebas', mono: 'Mono', rubik: 'Rubik Mono' };
  const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Anton&family=Archivo+Black&family=Bungee&family=Permanent+Marker&family=Silkscreen&family=Righteous&family=Playfair+Display:ital,wght@1,900&family=Bebas+Neue&family=Space+Mono:wght@400;700&family=Rubik+Mono+One&family=VT323&family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&display=swap';
  const ANIMS = { pop: 'Pop', slide: 'Deslizar', drop: 'Caer', zoom: 'Zoom', bounce: 'Rebote', fade: 'Fundido', spin: 'Giro' };

  g.ZenAlerts = { TYPES, defaults, complete, fill, resolve, sample, esc, FONTS, FONT_NAMES, FONTS_URL, ANIMS };
})(typeof window !== 'undefined' ? window : globalThis);
