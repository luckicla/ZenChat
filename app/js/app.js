'use strict';
// Arranque de ZenChat y lo que une todo: la ventana, las vistas (Chat,
// Alertas, OBS, Ajustes), la sesión de Twitch y el «EN DIRECTO» de arriba.
const App = (() => {
  let view = 'chat';
  function setView(v) {
    view = v;
    $('views').querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.view === v));
    $('splits').hidden = v !== 'chat';
    for (const p of ['alerts', 'overlays', 'settings']) $('page-' + p).hidden = v !== p;
    if (v === 'alerts') AlertsUI.open();
    if (v === 'overlays') OverlaysUI.open();
    if (v === 'settings') Settings.open();
    if (v !== 'alerts' && $('page-alerts').innerHTML) $('page-alerts').innerHTML = ''; // (la vista previa no se queda conectada)
  }
  function syncMe() {
    const a = Cfg.get('auth') || {};
    Object.assign(Me, { id: a.id || '', login: a.login || '', name: a.name || a.login || '', avatar: a.avatar || '', ok: !!(a.ok && a.id) });
  }
  async function authChanged() {
    syncMe();
    IRC.reconnect();
    if (Me.ok) { EventSub.start(); Emotes.loadMine(); Emotes.loadGlobal().then(() => Chat.rerender()); if (Me.login) Chat.chan(Me.login); }
    else EventSub.stop();
    Events.stat();
    Settings.paintAccount();
  }
  function setLive(info) {
    $('live').hidden = !info.live;
    if (info.live) $('liveTxt').textContent = `EN DIRECTO · ${fmtNum(info.viewers)}`;
  }
  const mainChannel = () => Me.login || (Chat.current() && Chat.current().splits[0]) || '';

  async function boot() {
    await Cfg.load();
    Settings.apply();
    syncMe();
    // ventana
    $('wMin').onclick = () => zen.win('min');
    $('wMax').onclick = () => zen.win('max');
    $('wClose').onclick = () => zen.win('close');
    $('tbar').addEventListener('dblclick', e => { if (!e.target.closest('button')) zen.win('max'); });
    const top = !!Cfg.ui('onTop', false);
    $('wPin').classList.toggle('on', top);
    $('wPin').onclick = () => { const v = !$('wPin').classList.contains('on'); $('wPin').classList.toggle('on', v); Cfg.setUi('onTop', v); zen.win('top', v); toast(v ? 'Siempre encima' : 'Ya no está siempre encima'); };
    if (Cfg.ui('opacity', 1) < 1) zen.win('opacity', Cfg.ui('opacity', 1));
    $('views').onclick = e => { const b = e.target.closest('button'); if (b) setView(b.dataset.view); };
    $('actBtn').onclick = () => {
      if (document.documentElement.classList.contains('android') || innerWidth <= 820) { document.documentElement.classList.toggle('actopen'); return; }
      Cfg.setUi('activity', !Cfg.ui('activity', true)); Settings.apply();
    };
    $('clipFab').onclick = () => { const sp = Chat.focused(); Clip.make(sp ? sp.c.login : Me.login); };
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && e.key.toLowerCase() === 'e') { e.preventDefault(); $('actBtn').click(); }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); $('clipFab').click(); }
      if (e.ctrlKey && e.key === ',') { e.preventDefault(); setView('settings'); }
      if (e.ctrlKey && e.key.toLowerCase() === 'p') { e.preventDefault(); setView(view === 'chat' ? 'alerts' : 'chat'); }
    });
    Events.init();
    IRC.connect();
    Chat.init();
    if (Me.ok) {
      EventSub.start();
      Emotes.loadGlobal().then(() => Chat.rerender());
      Emotes.loadMine();
    } else {
      Emotes.loadGlobal();
      setTimeout(() => { setView('settings'); toast('Bienvenid@ a ZenChat: entra con tu cuenta de Twitch para empezar'); }, 400);
    }
    Events.overlayState();
  }
  return { boot, view: setView, authChanged, setLive, mainChannel, syncMe };
})();

App.boot().catch(e => { console.error(e); toast('Algo falló al arrancar: ' + e.message, true); });
