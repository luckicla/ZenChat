'use strict';
// Lo que la ventana de ZenChat puede pedirle a la app (main.js)
const { contextBridge, ipcRenderer } = require('electron');
const call = (...a) => ipcRenderer.invoke('zen', ...a);
const on = ch => cb => { const f = (_e, s) => cb(s); ipcRenderer.on(ch, f); return () => ipcRenderer.removeListener(ch, f); };
contextBridge.exposeInMainWorld('zen', {
  info: () => call('info'),
  cfg: () => call('cfg'),
  set: (k, v) => call('set', k, v),
  token: () => call('token'),
  login: () => call('login'),
  loginPoll: dc => call('loginPoll', dc),
  loginCancel: () => call('loginCancel'),
  logout: () => call('logout'),
  helix: (m, p, body) => call('helix', m, p, body),
  get: url => call('get', url),
  mediaAdd: (name, buf) => call('mediaAdd', name, buf),
  mediaList: () => call('mediaList'),
  overlay: (kind, data, only) => call('overlay', kind, data, only),
  overlayState: s => call('overlayState', s),
  clients: () => call('clients'),
  open: url => call('open', url),
  openData: () => call('openData'),
  copy: t => call('copy', t),
  notify: (t, b) => call('notify', t, b),
  flash: () => call('flash'),
  win: (what, v) => call('win', what, v),
  update: what => call('update', what),
  obsLocal: () => call('obsLocal'),
  updState: () => call('updState'),
  onWin: on('zen-win'),
  onClients: on('zen-clients'),
  onOverlay: on('zen-overlay'),
  onUpdate: on('zen-update'),
});
