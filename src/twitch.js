'use strict';
// Entrar con Twitch (flujo de «código de dispositivo»: la app enseña un código,
// se abre twitch.tv/activate, lo aceptas y listo; sin contraseñas en la app) y
// las llamadas a la API de Twitch (Helix) con el token renovándose solo.
const SCOPES = require('../app/shared/scopes.js');

class Twitch {
  constructor(store, log) {
    this.store = store;
    this.log = log || (() => {});
    this.refreshing = null;
  }
  get clientId() { return (this.store.get('clientId') || '').trim(); }
  get auth() { return this.store.get('auth') || null; }

  async post(url, form) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
    let j = {}; try { j = await r.json(); } catch {}
    return { status: r.status, json: j };
  }

  // 1) pide el código → { user_code, verification_uri, device_code, interval, expires_in }
  async deviceStart() {
    if (!this.clientId) throw new Error('Falta el Client ID de tu app de Twitch (Ajustes → Cuenta).');
    const r = await this.post('https://id.twitch.tv/oauth2/device', { client_id: this.clientId, scopes: SCOPES.join(' ') });
    if (r.status !== 200) throw new Error(r.json.message || 'Twitch no dio el código (' + r.status + ')');
    return r.json;
  }
  // 2) se espera a que lo aceptes en el navegador
  async devicePoll(dc, cancelled) {
    let wait = (dc.interval || 5) * 1000;
    const until = Date.now() + (dc.expires_in || 1800) * 1000;
    while (Date.now() < until) {
      await new Promise(r => setTimeout(r, wait));
      if (cancelled && cancelled()) throw new Error('cancelado');
      const r = await this.post('https://id.twitch.tv/oauth2/token', {
        client_id: this.clientId, scopes: SCOPES.join(' '), device_code: dc.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      });
      if (r.status === 200 && r.json.access_token) return this.saveToken(r.json, true);
      const m = String(r.json.message || '');
      if (m.includes('slow_down')) wait += 2000;
      else if (!m.includes('authorization_pending')) throw new Error(m || 'Twitch dijo que no');
    }
    throw new Error('Se acabó el tiempo para aceptar el código');
  }
  async saveToken(t, fresh) {
    const prev = this.auth || {};
    const a = { ...prev, access: t.access_token, refresh: t.refresh_token || prev.refresh, expires: Date.now() + (t.expires_in || 3600) * 1000, scopes: t.scope || prev.scopes };
    this.store.set('auth', a);
    if (fresh || !a.id) {
      const me = await this.helix('GET', 'users');
      const u = me.json && me.json.data && me.json.data[0];
      if (u) {
        a.id = u.id; a.login = u.login; a.name = u.display_name; a.avatar = u.profile_image_url;
        this.store.set('auth', a);
        const ch = this.store.get('channels');
        if (!Array.isArray(ch) || !ch.length) this.store.set('channels', [u.login]);
      }
    }
    return this.auth;
  }
  async refresh() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const a = this.auth;
      if (!a || !a.refresh) throw new Error('sin sesión');
      const r = await this.post('https://id.twitch.tv/oauth2/token', { client_id: this.clientId, grant_type: 'refresh_token', refresh_token: a.refresh });
      if (r.status !== 200) {
        this.log('refresh falló ' + r.status + ' ' + JSON.stringify(r.json));
        if (r.status === 400 || r.status === 401) this.store.set('auth', { ...a, access: '', dead: true });
        throw new Error('La sesión de Twitch caducó: vuelve a entrar');
      }
      return this.saveToken(r.json);
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  async token() {
    const a = this.auth;
    if (!a || !a.access) return '';
    if (a.expires && a.expires - Date.now() < 5 * 60e3) { try { await this.refresh(); } catch { return ''; } }
    return this.auth.access;
  }
  logout() {
    const a = this.auth;
    if (a && a.access) this.post('https://id.twitch.tv/oauth2/revoke', { client_id: this.clientId, token: a.access }).catch(() => {});
    this.store.set('auth', null);
  }

  // Helix: helix('GET', 'users?login=x') / helix('POST', 'chat/announcements?…', {…})
  async helix(method, p, body, retried) {
    const a = this.auth;
    if (!a || !a.access) return { status: 401, json: { message: 'Sin sesión de Twitch' } };
    if (a.expires && a.expires - Date.now() < 60e3 && !retried) { try { await this.refresh(); } catch {} }
    const r = await fetch('https://api.twitch.tv/helix/' + p.replace(/^\//, ''), {
      method,
      headers: { 'Client-Id': this.clientId, Authorization: 'Bearer ' + this.auth.access, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401 && !retried) {
      try { await this.refresh(); return this.helix(method, p, body, true); } catch {}
    }
    let j = null;
    if (r.status !== 204) { try { j = await r.json(); } catch {} }
    return { status: r.status, json: j };
  }
}

// Otras APIs públicas (emotes de 7TV/BTTV/FFZ, antigüedad de sub de ivr.fi,
// historial de chat): desde aquí, para no pelear con CORS
async function getJSON(url, opts = {}) {
  const ok = /^https:\/\/(7tv\.io|api\.7tv\.app|api\.betterttv\.net|api\.frankerfacez\.com|api\.ivr\.fi|recent-messages\.robotty\.de|decapi\.me|api\.github\.com|github\.com)\//.test(url);
  if (!ok) return { status: 403, json: null };
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), opts.timeout || 12000);
    const r = await fetch(url, { headers: { 'User-Agent': 'ZenChat (github.com/luckicla/ZenChat)' }, signal: ac.signal });
    clearTimeout(t);
    let j = null; try { j = await r.json(); } catch {}
    return { status: r.status, json: j };
  } catch (e) { return { status: 0, json: null, error: e.message }; }
}

module.exports = { Twitch, getJSON, SCOPES };
