// Solo para las capturas/pruebas en un navegador normal: hace de la app de
// escritorio (window.zen) y de Twitch (IRC y EventSub falsos, Helix inventado).
(() => {
  const CTL = 'http://127.0.0.1:47831';
  const svg = (bg, txt, w = 36, h = 36) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" rx="4" fill="${bg}"/><text x="50%" y="58%" font-family="Arial" font-weight="700" font-size="${h * 0.45}" fill="#111" text-anchor="middle" dominant-baseline="middle">${txt}</text></svg>`);
  const cfg = {
    clientId: 'demo', auth: { ok: true, id: '1', login: 'luckicla', name: 'luckicla', avatar: svg('#ff6fd8', 'L', 80, 80) },
    ui: { tabs: [{ splits: ['luckicla', 'juansguarnizo'] }, { splits: ['ibai'] }], tab: 0, modMode: { luckicla: true } },
    chatbox: {}, goals: [{ id: 'g1', title: 'Objetivo de follows', type: 'follows', target: 100, start: 64, a1: '#ff6fd8', a2: '#1ec8ff' }], goalCounts: { g1: 3 },
    activity: [],
  };
  const post = (u, b) => fetch(CTL + u, { method: 'POST', body: JSON.stringify(b) }).catch(() => {});
  const users = {
    adriisco: { id: '114728904', login: 'adriisco', display_name: 'adriisco', created_at: '2016-02-03T10:00:00Z', profile_image_url: svg('#1ec8ff', 'A', 120, 120), broadcaster_type: '' },
  };
  const user = l => users[l] || { id: String(1000 + l.length * 7), login: l, display_name: l, created_at: '2019-06-11T10:00:00Z', profile_image_url: svg('#ffa62b', l[0].toUpperCase(), 120, 120), broadcaster_type: l === 'juansguarnizo' || l === 'ibai' ? 'partner' : '' };
  const BADGES = [
    { set_id: 'broadcaster', versions: [{ id: '1', image_url_2x: svg('#e91916', '▶', 36, 36), title: 'Streamer' }] },
    { set_id: 'moderator', versions: [{ id: '1', image_url_2x: svg('#00ad03', '⚔', 36, 36), title: 'Moderador' }] },
    { set_id: 'vip', versions: [{ id: '1', image_url_2x: svg('#e005b9', '◆', 36, 36), title: 'VIP' }] },
    { set_id: 'subscriber', versions: [{ id: '12', image_url_2x: svg('#8205b4', '★', 36, 36), title: 'Sub 1 año' }, { id: '0', image_url_2x: svg('#8205b4', '★', 36, 36), title: 'Sub' }] },
    { set_id: 'premium', versions: [{ id: '1', image_url_2x: svg('#1e69ff', 'P', 36, 36), title: 'Prime' }] },
  ];
  window.zen = {
    info: async () => ({ version: '1.0.0', portable: false, port: 47830 }),
    cfg: async () => JSON.parse(JSON.stringify(cfg)),
    set: async (k, v) => { cfg[k] = v; if (['alerts', 'chatbox', 'goals', 'feedbox', 'labels'].includes(k)) post('/set', { k, v }); return true; },
    token: async () => 'tok', login: async () => ({ user_code: 'ZXCV-1234', verification_uri: 'https://www.twitch.tv/activate' }), loginPoll: () => new Promise(() => {}), loginCancel: async () => {}, logout: async () => {},
    helix: async (m, p) => {
      const q = new URLSearchParams(p.split('?')[1] || '');
      const ok = data => ({ status: 200, json: { data } });
      if (p.startsWith('users?')) { const l = q.get('login'); return ok(l ? [user(l)] : [user('luckicla')]); }
      if (p.startsWith('users/blocks')) return ok([]);
      if (p.startsWith('channels/followers')) return { status: 200, json: { data: [], total: q.get('broadcaster_id') === '114728904' ? 37 : 1520 } };
      if (p.startsWith('streams')) return ok(q.get('user_login') === 'luckicla' ? [{ viewer_count: 87, title: 'Primer directo con ZenChat · charlando y probando cosas', game_name: 'Just Chatting', started_at: new Date(Date.now() - 5420e3).toISOString() }] : q.get('user_login') === 'juansguarnizo' ? [{ viewer_count: 41230, title: 'MIERCOLES DE TODO', game_name: 'Minecraft', started_at: new Date(Date.now() - 9000e3).toISOString() }] : []);
      if (p.startsWith('channels?')) return ok([{ title: 'Viendo vídeos', game_name: 'Just Chatting' }]);
      if (p.startsWith('chat/badges/global')) return ok(BADGES);
      if (p.startsWith('chat/badges')) return ok([]);
      if (p.startsWith('channel_points/custom_rewards')) return ok([{ title: 'Hidratarse', cost: 500 }, { title: 'Elige la siguiente canción', cost: 2000 }, { title: 'Hacer 10 flexiones', cost: 5000 }]);
      if (p.startsWith('moderation/')) return ok([]);
      return { status: 204, json: null };
    },
    get: async url => {
      if (url.includes('7tv.io/v3/emote-sets/global')) return { status: 200, json: { emotes: ['EZ', 'Clap', 'catJAM', 'peepoHappy', 'OMEGALUL'].map(n => ({ name: n, flags: 0, data: { host: { url: '//cdn.7tv.app/emote/' + n, files: [{ name: '2x.webp' }] } } })) } };
      if (url.includes('api.ivr.fi/v2/twitch/subage')) return { status: 200, json: { followedAt: '2020-01-25T10:00:00Z', cumulative: { months: 14 }, streak: { months: 3 }, meta: { tier: '1', type: 'prime' } } };
      return { status: 404, json: null };
    },
    mediaAdd: async () => '', mediaList: async () => [],
    overlay: async (kind, data, only) => { post('/b', { kind, data, only }); return true; },
    overlayState: async s => post('/set', { k: 'overlayState', v: s }),
    clients: async () => ({ alerts: 1, chat: 1 }), open: async () => {}, openData: async () => {}, copy: async () => {}, notify: async () => {}, flash: async () => {},
    win: async () => ({}), update: async () => ({ state: 'none' }), updState: async () => ({ state: 'none' }),
    onWin: () => {}, onClients: () => {}, onOverlay: () => {}, onUpdate: () => {},
  };

  // IRC y EventSub falsos
  const RealWS = window.WebSocket;
  const now = Date.now();
  const L = (tags, rest) => '@' + Object.entries(tags).map(([k, v]) => k + '=' + String(v).replace(/ /g, '\\s')).join(';') + ' ' + rest;
  let n = 0;
  const msg = (login, text, extra = {}, ch = 'luckicla') => L({ 'badge-info': '', badges: extra.badges || '', color: extra.color || '', 'display-name': extra.name || login, emotes: extra.emotes || '', id: 'm' + (++n), 'room-id': ch === 'luckicla' ? '1' : '2', 'tmi-sent-ts': now - (40 - n) * 25e3, 'user-id': '9' + n, ...(extra.tags || {}) }, `:${login}!${login}@${login}.tmi.twitch.tv PRIVMSG #${ch} :${text}`);
  const SCRIPT = [
    msg('nightbot', '¡Bienvenidos al directo! Usad !discord para entrar al server', { badges: 'moderator/1', color: '#7C7CE1' }),
    msg('lisliismau', 'holaaa buenas tardes 👋', { color: '#FF69B4', badges: 'subscriber/12' }),
    msg('gitano_peludo', 'danirep es furro', { color: '#1E90FF' }),
    msg('carlos_9oc', 'y carraspear EZ', { color: '#9ACD32', badges: 'premium/1' }),
    msg('jvc_bonzao', 'cómo va el directo? catJAM catJAM', { color: '#FF4500' }),
    msg('adriisco', '14 meses en esta mierda', { color: '#00FF7F', badges: 'subscriber/12', tags: { 'msg-id': 'resub' } }),
    msg('mixtapenofreestyle', 'MIXTAPE ON FIRE Clap Clap', { color: '#DAA520', badges: 'vip/1' }),
    msg('igarrycl', 'Ladia mi perrita rika', { color: '#D2691E' }),
    msg('peepo_fan', 'primera vez que entro, qué buena pinta tiene esto peepoHappy', { color: '#5F9EA0', tags: { 'first-msg': '1' } }),
    msg('elsoto_', '@luckicla qué app es esa del chat??', { color: '#B22222' }),
    msg('luckicla', 'ZenChat, la he hecho yo 😎', { color: '#FF6FD8', badges: 'broadcaster/1' }),
    msg('spammer123', 'COMPRA SEGUIDORES BARATOS en bit.ly/xxxx', { color: '#2E8B57' }),
    L({ 'target-msg-id': 'm12', login: 'spammer123' }, ':tmi.twitch.tv CLEARMSG #luckicla :COMPRA'),
    msg('mixtapenofreestyle', 'jajajaja OMEGALUL', { color: '#DAA520', badges: 'vip/1', tags: { 'reply-parent-msg-id': 'm3', 'reply-parent-display-name': 'gitano_peludo', 'reply-parent-msg-body': 'danirep es furro' } }),
    L({ 'badge-info': '', badges: 'subscriber/0', color: '#8A2BE2', 'display-name': 'pepito_grillo', login: 'pepito_grillo', 'msg-id': 'resub', 'system-msg': 'pepito_grillo se ha suscrito con Prime. ¡Lleva 6 meses suscrito!', 'room-id': '1', 'tmi-sent-ts': now - 6e3, id: 'u1' }, ':tmi.twitch.tv USERNOTICE #luckicla :vamos que seguimos'),
    msg('lisliismau', 'Kappa jajaj', { color: '#FF69B4', badges: 'subscriber/12', emotes: '25:0-4' }),
    L({ 'ban-duration': '600', 'room-id': '1', 'target-user-id': '99', 'tmi-sent-ts': now }, ':tmi.twitch.tv CLEARCHAT #luckicla :spammer123'),
  ];
  const DEFAULT_COLORS_M = ['#FF0000', '#1E90FF', '#00FF7F', '#FF69B4', '#DAA520', '#9ACD32'];
  const OTHER = Array.from({ length: 16 }, (_, i) => msg(['xokas_fan', 'momo_93', 'la_ruina', 'pepe_ch', 'nanaa'][i % 5], ['JAJAJAJAJA', 'OMEGALUL OMEGALUL', 'juan crack', 'qué buen stream', 'EZ Clap', 'ese edificio está brutal', 'KEKW'][i % 7], { color: DEFAULT_COLORS_M[i % 6], badges: i % 3 ? 'subscriber/12' : '' }, 'juansguarnizo'));
  window.WebSocket = function (url) {
    if (!/twitch\.tv/.test(url)) return new RealWS(url);
    const ws = { readyState: 0, send(l) {
      if (/^NICK/.test(l)) setTimeout(() => this.onmessage && this.onmessage({ data: ':tmi.twitch.tv 001 luckicla :Welcome' }), 10);
      const j = /^JOIN #(\w+)/.exec(l);
      if (j) {
        const ch = j[1];
        setTimeout(() => {
          this.onmessage({ data: `:luckicla!luckicla@luckicla.tmi.twitch.tv JOIN #${ch}` });
          this.onmessage({ data: L({ 'room-id': ch === 'luckicla' ? '1' : '2', slow: ch === 'juansguarnizo' ? 3 : 0, 'followers-only': -1, 'subs-only': 0, 'emote-only': 0, r9k: 0 }, `:tmi.twitch.tv ROOMSTATE #${ch}`) });
          this.onmessage({ data: L({ badges: 'broadcaster/1', color: '#FF6FD8', 'display-name': 'luckicla' }, `:tmi.twitch.tv USERSTATE #${ch}`) });
          const s = ch === 'luckicla' ? SCRIPT : ch === 'juansguarnizo' ? OTHER : [];
          s.forEach((line, i) => setTimeout(() => this.onmessage({ data: line }), 30 + i * 15));
        }, 20);
      }
    }, close() {} };
    if (/eventsub/.test(url)) setTimeout(() => ws.onmessage && ws.onmessage({ data: JSON.stringify({ metadata: { message_type: 'session_welcome' }, payload: { session: { id: 's1', keepalive_timeout_seconds: 600 } } }) }), 30);
    setTimeout(() => { ws.readyState = 1; ws.onopen && ws.onopen(); }, 5);
    return ws;
  };
  window.WebSocket.OPEN = 1;
})();
