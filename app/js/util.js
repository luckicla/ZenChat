'use strict';
// Cosas pequeñas que usa todo: $, escapar, avisos, la configuración y Twitch.

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

let toastT;
function toast(msg, err) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('err', !!err);
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), err ? 4200 : 2400);
}

// tiempo: «hace 3 min», «2 años, 4 meses», 14:42
const fmtTime = (d) => { d = new Date(d); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
function ago(t) {
  const s = Math.max(0, (Date.now() - new Date(t)) / 1000);
  if (s < 60) return 'ahora';
  if (s < 3600) return Math.floor(s / 60) + ' min';
  if (s < 86400) return Math.floor(s / 3600) + ' h';
  return Math.floor(s / 86400) + ' d';
}
function since(t) {
  const d = new Date(t), n = new Date();
  let y = n.getFullYear() - d.getFullYear(), m = n.getMonth() - d.getMonth();
  if (n.getDate() < d.getDate()) m--;
  if (m < 0) { y--; m += 12; }
  const parts = [];
  if (y > 0) parts.push(y + (y === 1 ? ' año' : ' años'));
  if (m > 0) parts.push(m + (m === 1 ? ' mes' : ' meses'));
  if (!parts.length) { const days = Math.floor((n - d) / 864e5); parts.push(days + (days === 1 ? ' día' : ' días')); }
  return parts.join(', ');
}
const dateStr = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
function dur(sec) {
  sec = Math.round(sec);
  if (sec < 60) return sec + 's';
  if (sec < 3600) return Math.round(sec / 60) + 'm';
  if (sec < 86400) return +(sec / 3600).toFixed(1) + 'h';
  return +(sec / 86400).toFixed(1) + 'd';
}
// «10m», «1h», «2d», «90» → segundos
function parseDur(s) {
  const m = String(s || '').trim().match(/^(\d+(?:\.\d+)?)\s*(s|m|h|d|w)?$/i);
  if (!m) return 0;
  return Math.round(+m[1] * ({ s: 1, m: 60, h: 3600, d: 86400, w: 604800 }[(m[2] || 's').toLowerCase()]));
}
const fmtNum = n => (+n || 0).toLocaleString('es-ES');

// --- la configuración (guardada por la app en config.json) ---
const Cfg = {
  data: {},
  listeners: [],
  async load() { this.data = await zen.cfg(); return this.data; },
  get(k, def) { const v = this.data[k]; return v === undefined || v === null ? def : v; },
  set(k, v) { this.data[k] = v; zen.set(k, v); this.listeners.forEach(f => { try { f(k, v); } catch (e) { console.error(e); } }); },
  // ui.algo: los ajustes de la ventana
  ui(k, def) { const u = this.data.ui || {}; return u[k] === undefined ? def : u[k]; },
  setUi(k, v) { const u = { ...(this.data.ui || {}), [k]: v }; this.set('ui', u); },
  on(f) { this.listeners.push(f); },
};

// --- Twitch ---
const Me = { id: '', login: '', name: '', avatar: '', ok: false };
const Tw = {
  async helix(method, path, body) {
    const r = await zen.helix(method, path, body);
    if (r.status === 401 && Me.ok) { Me.ok = false; App.authChanged(); }
    return r;
  },
  async get(path) { const r = await this.helix('GET', path); return r.json && r.json.data ? r.json.data : []; },
  // un error de Twitch, en cristiano
  why(r) {
    const m = (r && r.json && r.json.message) || '';
    if (r.status === 403 || /scope|permission|authoriz/i.test(m)) return 'Twitch no deja: falta permiso (vuelve a entrar en Ajustes → Cuenta) o no eres mod ahí';
    if (r.status === 429) return 'Demasiadas peticiones, espera un momento';
    return m || ('Error ' + r.status);
  },
  users: new Map(), // login → usuario de Helix (caché)
  async user(login) {
    login = String(login || '').toLowerCase();
    if (!login) return null;
    if (this.users.has(login)) return this.users.get(login);
    const d = await this.get('users?login=' + encodeURIComponent(login));
    const u = d[0] || null;
    if (u) this.users.set(login, u);
    return u;
  },
  async userById(id) {
    for (const u of this.users.values()) if (u.id === id) return u;
    const d = await this.get('users?id=' + encodeURIComponent(id));
    const u = d[0] || null;
    if (u) this.users.set(u.login, u);
    return u;
  },
};

// colores de nombre: los de Twitch para quien no eligió (como Chatterino)
const DEFAULT_COLORS = ['#FF0000', '#0000FF', '#00FF00', '#B22222', '#FF7F50', '#9ACD32', '#FF4500', '#2E8B57', '#DAA520', '#D2691E', '#5F9EA0', '#1E90FF', '#FF69B4', '#8A2BE2', '#00FF7F'];
function nameColor(login, color) {
  let c = color;
  if (!c) { let n = 0; for (const ch of String(login)) n = (n * 31 + ch.charCodeAt(0)) >>> 0; c = DEFAULT_COLORS[n % DEFAULT_COLORS.length]; }
  return readable(c);
}
// que se lea sobre fondo oscuro (o claro): se aclara/oscurece si hace falta
function readable(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  let [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  const light = document.documentElement.classList.contains('light');
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (!light && lum < 0.5) { const k = (0.5 - lum) * 1.4; r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  if (light && lum > 0.55) { const k = (lum - 0.55) * 1.6; r *= 1 - k; g *= 1 - k; b *= 1 - k; }
  return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

// menú contextual
function ctxMenu(x, y, items) {
  const m = $('ctx');
  m.innerHTML = '';
  for (const it of items) {
    if (it === '-') { m.appendChild(document.createElement('hr')); continue; }
    if (!it) continue;
    const b = document.createElement('button');
    b.textContent = it.label;
    if (it.danger) b.className = 'danger';
    b.onclick = () => { m.hidden = true; it.fn(); };
    m.appendChild(b);
  }
  m.hidden = false;
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 6) + 'px';
  m.style.top = Math.min(y, innerHeight - r.height - 6) + 'px';
}
document.addEventListener('mousedown', e => { if (!e.target.closest('#ctx')) $('ctx').hidden = true; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('ctx').hidden = true; });

// ventana modal sencilla
const Modal = {
  open(html, onClose) {
    $('mbox').innerHTML = html;
    $('modal').hidden = false;
    this.onClose = onClose;
    const x = $('mbox').querySelector('[data-close]');
    if (x) x.onclick = () => this.close();
    return $('mbox');
  },
  close() { $('modal').hidden = true; $('mbox').innerHTML = ''; const f = this.onClose; this.onClose = null; if (f) f(); },
};
$('modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') Modal.close(); });

// interruptor (.sw) ↔ valor
function sw(el, on, cb) {
  el.setAttribute('role', 'switch');
  el.setAttribute('aria-checked', on ? 'true' : 'false');
  el.onclick = () => { const v = el.getAttribute('aria-checked') !== 'true'; el.setAttribute('aria-checked', v); cb(v); };
}
// leer un archivo elegido → lo guarda la app y devuelve «media/…»
function pickFile(accept) {
  return new Promise(ok => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept;
    i.onchange = async () => {
      const f = i.files[0];
      if (!f) return ok('');
      if (f.size > 60e6) { toast('Ese archivo es muy grande (máx. 60 MB)', true); return ok(''); }
      try { ok(await zen.mediaAdd(f.name, await f.arrayBuffer())); } catch (e) { toast(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true); ok(''); }
    };
    i.click();
  });
}
const mediaUrl = p => !p ? '' : /^(https?:|data:|synth:)/.test(p) ? p : 'http://127.0.0.1:47830/' + p;
