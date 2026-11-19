'use strict';
// En el móvil (APK) no hay app de escritorio: aquí se hace lo mismo que
// main.js/preload.js, con el puente nativo window.ZenAndroid.
// En el PC no hace nada (window.zen ya lo pone preload.js).
(() => {
  if (window.zen || !window.ZenAndroid) return;
  const A = window.ZenAndroid;
  document.documentElement.classList.add('android');
  let data = {};
  try { data = JSON.parse(A.load() || '{}'); } catch {}
  let saveT;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => A.save(JSON.stringify(data)), 300); };

  // HTTP por el puente (sin CORS)
  const pend = new Map(); let n = 0;
  window.__zenCb = (id, status, text) => { const p = pend.get(id); if (!p) return; pend.delete(id); let json = null; try { json = text ? JSON.parse(text) : null; } catch {} p({ status, json, text }); };
  const http = (method, url, headers = {}, body = '') => new Promise(ok => { const id = 'h' + (++n); pend.set(id, ok); A.http(id, method, url, JSON.stringify(headers), typeof body === 'string' ? body : JSON.stringify(body)); });
  const form = o => Object.entries(o).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
  const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' };

  // --- Twitch (lo mismo que src/twitch.js) ---
  const cid = () => (data.clientId || '').trim();
  let refreshing = null, cancelled = false;
  async function saveToken(t, fresh) {
    const prev = data.auth || {};
    const a = { ...prev, access: t.access_token, refresh: t.refresh_token || prev.refresh, expires: Date.now() + (t.expires_in || 3600) * 1000, dead: false };
    data.auth = a; save();
    if (fresh || !a.id) {
      const r = await helix('GET', 'users');
      const u = r.json && r.json.data && r.json.data[0];
      if (u) { Object.assign(a, { id: u.id, login: u.login, name: u.display_name, avatar: u.profile_image_url }); data.auth = a; save(); }
    }
    return a;
  }
  async function refresh() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const a = data.auth;
      if (!a || !a.refresh) throw new Error('sin sesión');
      const r = await http('POST', 'https://id.twitch.tv/oauth2/token', FORM, form({ client_id: cid(), grant_type: 'refresh_token', refresh_token: a.refresh }));
      if (r.status !== 200) { if (r.status === 400 || r.status === 401) { data.auth = { ...a, access: '', dead: true }; save(); } throw new Error('La sesión caducó'); }
      return saveToken(r.json);
    })().finally(() => { refreshing = null; });
    return refreshing;
  }
  async function helix(method, p, body, retried) {
    const a = data.auth;
    if (!a || !a.access) return { status: 401, json: { message: 'Sin sesión de Twitch' } };
    if (a.expires && a.expires - Date.now() < 60e3 && !retried) { try { await refresh(); } catch {} }
    const h = { 'Client-Id': cid(), Authorization: 'Bearer ' + data.auth.access };
    if (body) h['Content-Type'] = 'application/json';
    const r = await http(method, 'https://api.twitch.tv/helix/' + p.replace(/^\//, ''), h, body ? JSON.stringify(body) : '');
    if (r.status === 401 && !retried) { try { await refresh(); return helix(method, p, body, true); } catch {} }
    return { status: r.status, json: r.json };
  }
  // el Client ID metido al compilar (client.json), si no se puso a mano
  const baked = fetch('client.json').then(r => r.json()).then(j => { if (j.clientId && !data.clientIdManual) { data.clientId = j.clientId; save(); } }).catch(() => {});
  const noop = async () => true;

  window.zen = {
    info: async () => { const v = JSON.parse(A.version()); return { version: v.name, code: v.code, portable: false, port: 0, platform: 'android' }; },
    cfg: async () => { await baked; const d = JSON.parse(JSON.stringify(data)); if (d.auth) { const { access, refresh, ...rest } = d.auth; d.auth = { ...rest, ok: !!access }; } return d; },
    set: async (k, v) => { if (k === 'auth') return false; if (k === 'clientId') data.clientIdManual = true; data[k] = v; save(); return true; },
    token: async () => { const a = data.auth; if (!a || !a.access) return ''; if (a.expires - Date.now() < 5 * 60e3) { try { await refresh(); } catch { return ''; } } return data.auth.access; },
    login: async () => {
      cancelled = false;
      if (!cid()) throw new Error('Falta el Client ID de tu app de Twitch');
      const r = await http('POST', 'https://id.twitch.tv/oauth2/device', FORM, form({ client_id: cid(), scopes: ZEN_SCOPES.join(' ') }));
      if (r.status !== 200) throw new Error((r.json && r.json.message) || 'Twitch no dio el código');
      return r.json;
    },
    loginPoll: async dc => {
      let wait = (dc.interval || 5) * 1000, fails = 0;
      const until = Date.now() + (dc.expires_in || 1800) * 1000;
      while (Date.now() < until) {
        await new Promise(r => setTimeout(r, wait));
        if (cancelled) throw new Error('cancelado');
        const r = await http('POST', 'https://id.twitch.tv/oauth2/token', FORM, form({ client_id: cid(), scopes: ZEN_SCOPES.join(' '), device_code: dc.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }));
        if (r.status === 200 && r.json && r.json.access_token) { const a = await saveToken(r.json, true); return { login: a.login, id: a.id, name: a.name, avatar: a.avatar }; }
        const m = String((r.json && (r.json.message || r.json.error)) || '').toLowerCase();
        // (sin respuesta: el móvil estaba en Twitch o sin red; se sigue esperando)
        if (!r.status || r.status >= 500 || !m) { fails++; if (fails > 30) throw new Error('No hay conexión con Twitch'); continue; }
        fails = 0;
        if (m.includes('slow_down')) { wait += 2000; continue; }
        if (m.includes('authorization_pending')) continue;
        if (m.includes('denied')) throw new Error('En Twitch le diste a cancelar: vuelve a intentarlo');
        if (m.includes('invalid device code') || m.includes('expired')) throw new Error('El código caducó: vuelve a darle a Entrar');
        if (m.includes('client')) throw new Error('Twitch no acepta ese ID de cliente (¿la app es de tipo «Público»?): ' + m);
        throw new Error('Twitch: ' + m);
      }
      throw new Error('Se acabó el tiempo');
    },
    loginCancel: async () => { cancelled = true; },
    logout: async () => { data.auth = null; save(); },
    helix,
    get: async url => { const r = await http('GET', url); return { status: r.status, json: r.json }; },
    mediaAdd: async () => { throw new Error('Los archivos de las alertas se ponen desde el PC'); },
    mediaList: async () => [],
    overlay: noop, overlayState: noop, clients: async () => ({}),
    open: async url => A.open(url), openData: noop, copy: async t => A.copy(String(t)),
    notify: async () => A.vibrate(40), flash: async () => A.vibrate(25),
    win: async () => ({}),
    update: async what => {
      if (what === 'install') { A.installApk('https://github.com/luckicla/ZenChat/releases/download/android-latest/ZenChat.apk'); return { state: 'downloading', pct: 0 }; }
      const r = await http('GET', 'https://github.com/luckicla/ZenChat/releases/download/android-latest/version.txt');
      const v = JSON.parse(A.version());
      const latest = parseInt(String(r.text || '').trim(), 10);
      return latest > v.code ? { state: 'portable', version: '1.0.' + latest } : { state: r.status === 200 ? 'none' : 'error', msg: 'sin conexión' };
    },
    updState: async () => null,
    onWin: () => {}, onClients: () => {}, onOverlay: () => {},
    onUpdate: cb => { updCbs.push(cb); },
  };
  // cómo va la actualización de la APK (Bridge.installApk)
  const updCbs = [];
  window.__zenUpd = s => {
    const m = { bajando: { state: 'downloading', pct: s.pct }, listo: { state: 'apk' }, permiso: { state: 'perm' }, error: { state: 'error', msg: s.msg } }[s.state];
    if (m) updCbs.forEach(f => { try { f(m); } catch {} });
  };
  // el botón «atrás» de Android: cierra lo que haya abierto antes de salir
  window.zenBack = () => {
    const ctx = document.getElementById('ctx');
    if (ctx && !ctx.hidden) { ctx.hidden = true; return true; }
    const m = document.getElementById('modal');
    if (m && !m.hidden) { m.querySelector('[data-close]') ? m.querySelector('[data-close]').click() : (m.hidden = true); return true; }
    const card = document.querySelector('#cards .card');
    if (card) { card.querySelector('.x').click(); return true; }
    const pk = document.querySelector('.picker'); if (pk) { pk.remove(); return true; }
    if (document.documentElement.classList.contains('actopen')) { document.documentElement.classList.remove('actopen'); return true; }
    const sel = document.querySelector('#views button.sel');
    if (sel && sel.dataset.view !== 'chat') { document.querySelector('#views button[data-view=chat]').click(); return true; }
    return false;
  };
})();
