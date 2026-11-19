'use strict';
// ZenChat: el chat de Twitch al estilo Chatterino, las alertas para OBS y lo
// demás que hace falta para hacer directo, en una sola app.
//
//  - La ventana (app/) es el chat, el editor de alertas y los ajustes.
//  - El servidor de overlays (src/server.js) sirve en 127.0.0.1:47830 las
//    páginas que se meten en OBS como «Navegador»: /alerts, /chat, /goal…
//  - Instalada: se actualiza sola desde la release «pc-latest» del repo.
//    Portable: los datos van en «ZenChat-datos» al lado del .exe.
const { app, BrowserWindow, Menu, shell, ipcMain, clipboard, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { Store } = require('./src/store');
const { Twitch, getJSON } = require('./src/twitch');
const { createServer } = require('./src/server');

const portableDir = process.env.PORTABLE_EXECUTABLE_DIR || '';
const portable = !!portableDir;
if (portable) {
  try { app.setPath('userData', path.join(portableDir, 'ZenChat-datos')); } catch {}
}
app.setAppUserModelId('com.luckicla.zenchat');
// los sonidos de las alertas y de las menciones suenan sin tocar antes la ventana
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-features', 'Translate');

const first = app.requestSingleInstanceLock();
if (!first) app.quit();

let win = null, store = null, tw = null, srv = null, updState = null;

function log(m) {
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'zenchat.log'), `${new Date().toISOString()} ${m}\n`); } catch {}
}

function clientId() {
  // el Client ID puede venir metido al compilar (client.json) o puesto a mano en Ajustes
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'client.json'), 'utf8')).clientId || ''; } catch { return ''; }
}

function iconPath() {
  const p = path.join(process.resourcesPath || '', 'icon.ico');
  if (fs.existsSync(p)) return p;
  const dev = path.join(__dirname, 'build', 'icon.ico');
  return fs.existsSync(dev) ? dev : undefined;
}

function createWindow() {
  const ui = store.get('ui') || {};
  const b = store.get('bounds') || {};
  const acrylic = ui.acrylic === true && process.platform === 'win32';
  win = new BrowserWindow({
    width: b.width || 1180, height: b.height || 760, x: b.x, y: b.y,
    minWidth: 380, minHeight: 420,
    backgroundColor: acrylic ? '#00000000' : '#0e0f13',
    ...(acrylic ? { backgroundMaterial: 'acrylic' } : {}),
    title: 'ZenChat',
    icon: iconPath(),
    frame: false,
    alwaysOnTop: !!ui.onTop,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      backgroundThrottling: false, // el chat y las alertas siguen igual con la ventana minimizada
      spellcheck: true,
    },
  });
  if (b.max) win.maximize();
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } });
  const saveBounds = () => {
    if (!win || win.isMinimized()) return;
    store.set('bounds', { ...(win.isMaximized() ? (store.get('bounds') || {}) : win.getBounds()), max: win.isMaximized() });
  };
  win.on('resize', saveBounds); win.on('move', saveBounds);
  const maxState = () => { if (win) win.webContents.send('zen-win', { max: win.isMaximized(), top: win.isAlwaysOnTop() }); };
  win.on('maximize', maxState); win.on('unmaximize', maxState);
  win.on('closed', () => { win = null; });
}

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
});

app.whenReady().then(async () => {
  if (!first) return;
  store = new Store(app.getPath('userData'));
  const baked = clientId();
  if (baked && !store.get('clientIdManual')) store.set('clientId', baked);
  tw = new Twitch(store, log);
  srv = createServer({
    store, root: __dirname,
    onClients: c => { if (win) win.webContents.send('zen-clients', c); },
    onAction: a => { if (win) win.webContents.send('zen-overlay', a); },
  });
  const ok = await srv.listen();
  if (!ok) log('el puerto 47830 está ocupado (¿otro ZenChat abierto?)');
  createWindow();
  setTimeout(checkUpdates, 20000);
  setInterval(checkUpdates, 6 * 3600e3);
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { try { store && store.flush(); } catch {} try { srv && srv.close(); } catch {} });

/* ---------- lo que la ventana puede pedir (preload.js → window.zen) ---------- */

const OVERLAY_KEYS = ['alerts', 'chatbox', 'goals', 'feedbox', 'labels', 'widgets'];
let pollCancel = false;

function safeConfig() {
  const d = { ...store.get() };
  if (d.auth) { const { access, refresh, ...rest } = d.auth; d.auth = { ...rest, ok: !!access }; }
  delete d.overlayState; delete d.bounds;
  return d;
}

ipcMain.handle('zen', async (_e, what, a, b, c) => {
  switch (what) {
    case 'info': return { version: app.getVersion(), portable, port: srv.port, dataDir: app.getPath('userData'), platform: process.platform };
    case 'cfg': return safeConfig();
    case 'set':
      if (a === 'auth' || a === 'overlayState') return false;
      if (a === 'clientId') store.set('clientIdManual', true);
      store.set(a, b);
      if (OVERLAY_KEYS.includes(a)) srv.pushConfig();
      return true;
    case 'token': return tw.token();
    case 'login': pollCancel = false; return tw.deviceStart();
    case 'loginPoll': { const r = await tw.devicePoll(a, () => pollCancel); return { login: r.login, id: r.id, name: r.name, avatar: r.avatar }; }
    case 'loginCancel': pollCancel = true; return true;
    case 'logout': tw.logout(); return true;
    case 'helix': return tw.helix(a, b, c);
    case 'get': return getJSON(String(a || ''));
    case 'mediaAdd': return store.addMedia(a, b);
    case 'mediaList': return store.listMedia();
    case 'overlay': srv.broadcast(a, b, c); return true;
    case 'overlayState': store.set('overlayState', a); srv.pushState(); return true;
    case 'clients': return srv.clients();
    case 'open': if (/^https?:\/\//.test(String(a))) shell.openExternal(String(a)); return true;
    case 'openData': shell.openPath(app.getPath('userData')); return true;
    case 'copy': clipboard.writeText(String(a || '')); return true;
    case 'notify':
      try { if (Notification.isSupported()) new Notification({ title: String(a || 'ZenChat'), body: String(b || ''), icon: iconPath(), silent: true }).show(); } catch {}
      return true;
    case 'flash': if (win && !win.isFocused()) win.flashFrame(true); return true;
    case 'win':
      if (!win) return null;
      if (a === 'min') win.minimize();
      else if (a === 'max') win.isMaximized() ? win.unmaximize() : win.maximize();
      else if (a === 'close') win.close();
      else if (a === 'top') win.setAlwaysOnTop(!!b);
      else if (a === 'acrylic' && process.platform === 'win32') {
        try { win.setBackgroundMaterial(b ? 'acrylic' : 'none'); win.setBackgroundColor(b ? '#00000000' : '#0e0f13'); } catch {}
      } else if (a === 'opacity') { try { win.setOpacity(Math.min(1, Math.max(0.3, +b || 1))); } catch {} }
      return { max: win.isMaximized(), top: win.isAlwaysOnTop() };
    case 'obsLocal': {
      // OBS en este mismo PC: su puerto y contraseña del WebSocket salen de su
      // configuración, así ZenChat se conecta solo sin copiar nada
      const base = path.join(app.getPath('appData'), 'obs-studio', 'plugin_config', 'obs-websocket');
      for (const f of ['config.json', path.join('..', '..', 'global.ini')]) {
        try {
          const t = fs.readFileSync(path.join(base, f), 'utf8');
          if (f === 'config.json') {
            const j = JSON.parse(t);
            return { found: true, enabled: j.server_enabled !== false, port: j.server_port || 4455, auth: j.auth_required !== false, password: j.server_password || '' };
          }
          const sec = (t.split(/\[OBSWebSocket\]/)[1] || '').split(/\n\[/)[0];
          const g = k => ((sec.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '').trim();
          if (sec) return { found: true, enabled: g('ServerEnabled') !== 'false', port: +g('ServerPort') || 4455, auth: g('AuthRequired') !== 'false', password: g('ServerPassword') };
        } catch {}
      }
      return { found: false };
    }
    case 'update': if (a === 'install') return installUpdate(); checkUpdates(true); return updState;
    case 'updState': return updState;
  }
  return null;
});

/* ---------- actualizaciones ---------- */
const UPDATES = 'https://github.com/luckicla/ZenChat/releases/download/pc-latest/';
function tell(s) { updState = s; if (win) win.webContents.send('zen-update', s); }
let au = null;
async function checkUpdates(manual) {
  if (!app.isPackaged) { if (manual) tell({ state: 'none', msg: 'versión de pruebas' }); return; }
  if (portable) {
    // la portable no se cambia sola: se mira si hay una nueva y se avisa
    try {
      const r = await fetch(UPDATES + 'latest.yml', { cache: 'no-store' });
      const v = ((await r.text()).match(/^version:\s*(\S+)/m) || [])[1];
      if (v && newer(v, app.getVersion())) tell({ state: 'portable', version: v, url: 'https://github.com/luckicla/ZenChat/releases/download/pc-latest/ZenChat-Portable.exe' });
      else if (manual) tell({ state: 'none' });
    } catch (e) { if (manual) tell({ state: 'error', msg: e.message }); }
    return;
  }
  try {
    if (!au) {
      au = require('electron-updater').autoUpdater;
      au.setFeedURL({ provider: 'generic', url: UPDATES });
      au.autoDownload = true;
      au.autoInstallOnAppQuit = true;
      au.on('checking-for-update', () => tell({ state: 'checking' }));
      au.on('update-available', i => tell({ state: 'downloading', version: i.version, pct: 0 }));
      au.on('update-not-available', () => tell({ state: 'none' }));
      au.on('download-progress', p => tell({ state: 'downloading', version: updState && updState.version, pct: Math.round(p.percent) }));
      au.on('update-downloaded', i => tell({ state: 'ready', version: i.version }));
      au.on('error', e => { log('update: ' + (e && e.message)); tell({ state: 'error', msg: String(e && e.message || e).slice(0, 200) }); });
    }
    await au.checkForUpdates();
  } catch (e) { log('update: ' + e.message); }
}
function installUpdate() {
  if (portable && updState && updState.url) { shell.openExternal(updState.url); return true; }
  try { store.flush(); au && au.quitAndInstall(true, true); return true; } catch { return false; }
}
function newer(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}
