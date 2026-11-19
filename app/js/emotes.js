'use strict';
// Insignias y emotes: los de Twitch, y los de 7TV, BTTV y FFZ (los de fuera,
// como en Chatterino), globales y de cada canal.
const Emotes = (() => {
  const global = { badges: new Map(), third: new Map() };  // badges: "set/ver" → {url,title}; third: nombre → emote
  const rooms = new Map();   // roomId → { badges, third }
  let mine = new Map();      // emotes de Twitch que puedes usar tú (para escribir)
  const twitchSeen = new Map(); // nombre → url (los que han salido en el chat)

  const T_URL = id => `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`;
  const add = (map, name, url, src, zw) => { if (name && url && !map.has(name)) map.set(name, { name, url, src, zw: !!zw }); };

  async function j(url) { const r = await zen.get(url); return r && r.status === 200 ? r.json : null; }

  function badgeSets(data, map) {
    for (const s of data || []) for (const v of s.versions || []) map.set(s.set_id + '/' + v.id, { url: v.image_url_2x || v.image_url_1x, title: v.title || s.set_id });
  }
  function seven(set, map) {
    for (const e of (set && set.emotes) || []) {
      const host = e.data && e.data.host;
      if (!host) continue;
      const f = (host.files || []).find(f => f.name.startsWith('2x') && f.name.endsWith('.webp')) || (host.files || [])[0];
      add(map, e.name, 'https:' + host.url + '/' + (f ? f.name : '2x.webp'), '7TV', (e.flags & 1) === 1);
    }
  }
  function bttv(list, map) { for (const e of list || []) add(map, e.code, `https://cdn.betterttv.net/emote/${e.id}/2x`, 'BTTV'); }
  function ffz(sets, map) {
    for (const s of Object.values(sets || {})) for (const e of s.emoticons || []) {
      const u = e.urls || {};
      add(map, e.name, u['2'] || u['1'] || u['4'], 'FFZ');
    }
  }

  async function loadGlobal() {
    const tasks = [
      Tw.get('chat/badges/global').then(d => badgeSets(d, global.badges)),
      j('https://7tv.io/v3/emote-sets/global').then(d => seven(d, global.third)),
      j('https://api.betterttv.net/3/cached/emotes/global').then(d => bttv(d, global.third)),
      j('https://api.frankerfacez.com/v1/set/global').then(d => d && ffz(Object.fromEntries((d.default_sets || []).map(id => [id, d.sets[id]])), global.third)),
    ];
    await Promise.allSettled(tasks);
  }
  async function loadRoom(id, force) {
    if (!id) return;
    if (rooms.has(id) && !force) return rooms.get(id);
    const r = { badges: new Map(), third: new Map() };
    rooms.set(id, r);
    await Promise.allSettled([
      Tw.get('chat/badges?broadcaster_id=' + id).then(d => badgeSets(d, r.badges)),
      j('https://7tv.io/v3/users/twitch/' + id).then(d => d && seven(d.emote_set, r.third)),
      j('https://api.betterttv.net/3/cached/users/twitch/' + id).then(d => d && (bttv(d.channelEmotes, r.third), bttv(d.sharedEmotes, r.third))),
      j('https://api.frankerfacez.com/v1/room/id/' + id).then(d => d && ffz(d.sets, r.third)),
    ]);
    return r;
  }
  async function loadMine() {
    if (!Me.id) return;
    const m = new Map();
    let cursor = '';
    for (let i = 0; i < 20; i++) {
      const r = await Tw.helix('GET', `chat/emotes/user?user_id=${Me.id}${cursor ? '&after=' + cursor : ''}`);
      if (r.status !== 200 || !r.json) break;
      for (const e of r.json.data || []) add(m, e.name, T_URL(e.id).replace('/default/', e.format && e.format.includes('animated') ? '/animated/' : '/static/'), 'Twitch');
      cursor = r.json.pagination && r.json.pagination.cursor;
      if (!cursor) break;
    }
    mine = m;
  }

  function badges(roomId, tag) {
    if (!tag) return [];
    const r = rooms.get(roomId);
    return tag.split(',').filter(Boolean).map(b => {
      const x = (r && r.badges.get(b)) || global.badges.get(b);
      return x ? { id: b, url: x.url, title: x.title } : null;
    }).filter(Boolean);
  }
  function third(roomId, word) {
    if (!Cfg.ui('thirdParty', true)) return null;
    const r = rooms.get(roomId);
    return (r && r.third.get(word)) || global.third.get(word) || null;
  }

  const LINK = /^(?:https?:\/\/)?(?:[\w-]+\.)+[a-z]{2,}(?:\/[^\s]*)?$/i;
  // texto + tag «emotes» de Twitch → trozos para pintar
  function parse(text, emotesTag, roomId) {
    const chars = Array.from(text || ''); // Twitch cuenta en caracteres, no en UTF-16
    const marks = [];
    if (emotesTag) for (const part of emotesTag.split('/')) {
      const [id, pos] = part.split(':');
      if (!pos) continue;
      for (const p of pos.split(',')) { const [a, b] = p.split('-').map(Number); marks.push({ a, b, id }); }
    }
    marks.sort((x, y) => x.a - y.a);
    const parts = [];
    let i = 0;
    const pushText = s => {
      // las palabras: emotes de fuera, enlaces y menciones
      const words = s.split(/(\s+)/);
      for (const w of words) {
        if (!w) continue;
        if (/^\s+$/.test(w)) { pushRaw(w); continue; }
        const e = third(roomId, w);
        if (e) { parts.push({ t: 'emote', v: w, url: e.url, src: e.src, zw: e.zw }); continue; }
        if (/^@\w+/.test(w)) { const m = w.match(/^@(\w+)(.*)$/); parts.push({ t: 'mention', v: '@' + m[1], login: m[1].toLowerCase() }); if (m[2]) pushRaw(m[2]); continue; }
        if (LINK.test(w) && /\./.test(w)) { parts.push({ t: 'link', v: w, url: /^https?:/i.test(w) ? w : 'https://' + w }); continue; }
        pushRaw(w);
      }
    };
    const pushRaw = s => { const l = parts[parts.length - 1]; if (l && l.t === 'text') l.v += s; else parts.push({ t: 'text', v: s }); };
    for (const m of marks) {
      if (m.a < i) continue;
      if (m.a > i) pushText(chars.slice(i, m.a).join(''));
      const name = chars.slice(m.a, m.b + 1).join('');
      const url = T_URL(m.id);
      twitchSeen.set(name, url);
      parts.push({ t: 'emote', v: name, url, src: 'Twitch' });
      i = m.b + 1;
    }
    if (i < chars.length) pushText(chars.slice(i).join(''));
    return parts;
  }
  // para lo que escribes tú (Twitch no te devuelve el mensaje): tus emotes de Twitch por nombre
  function parseOwn(text, roomId) {
    const parts = parse(text, '', roomId);
    return parts.flatMap(p => {
      if (p.t !== 'text') return [p];
      return p.v.split(/(\s+)/).filter(Boolean).map(w => { const e = mine.get(w); return e ? { t: 'emote', v: w, url: e.url, src: 'Twitch' } : { t: 'text', v: w }; });
    });
  }
  // todos los que puedes usar en un canal (autocompletar y selector)
  function all(roomId) {
    const out = new Map();
    for (const [k, v] of mine) out.set(k, v);
    if (!Cfg.ui('thirdParty', true)) return [...out.values()];
    const r = rooms.get(roomId);
    if (r) for (const [k, v] of r.third) if (!out.has(k)) out.set(k, { ...v, ch: true });
    for (const [k, v] of global.third) if (!out.has(k)) out.set(k, v);
    return [...out.values()];
  }
  function counts(roomId) { const r = rooms.get(roomId); return { seven: r ? [...r.third.values()].filter(e => e.src === '7TV').length : 0, bttv: r ? [...r.third.values()].filter(e => e.src === 'BTTV').length : 0, ffz: r ? [...r.third.values()].filter(e => e.src === 'FFZ').length : 0 }; }

  return { loadGlobal, loadRoom, loadMine, badges, parse, parseOwn, all, counts, third };
})();
