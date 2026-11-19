'use strict';
// Lo que pasa en el directo (follows, subs, bits, raids, puntos…): a la lista
// de Actividad, a las alertas de OBS, a los objetivos y a los overlays.
const Events = (() => {
  const CAT = { follow: 'follow', sub: 'sub', resub: 'sub', gift: 'sub', cheer: 'bits', raid: 'raid', points: 'points', powerup: 'points' };
  const COLORS = { follow: '#ff6fd8', sub: '#1ec8ff', resub: '#1ec8ff', gift: '#ffa62b', cheer: '#b98cff', raid: '#ff5a5a', points: '#6ff0c0', powerup: '#6ff0c0', hypetrain: '#ffd166', charity: '#ffd166', firstchat: '#6ff0c0', streak: '#ff9a3c', shoutout: '#1ec8ff' };
  const FILTERS = [['all', 'Todo'], ['follow', 'Follows'], ['sub', 'Subs'], ['bits', 'Bits'], ['raid', 'Raids'], ['points', 'Puntos'], ['other', 'Otros']];
  let list = [], filter = 'all', clients = {}, esState = 'off';

  function init() {
    list = Cfg.get('activity', []) || [];
    $('aFilter').innerHTML = FILTERS.map(([k, n]) => `<button data-f="${k}" class="${k === filter ? 'sel' : ''}">${n}</button>`).join('');
    $('aFilter').onclick = e => { const b = e.target.closest('button'); if (!b) return; filter = b.dataset.f; $('aFilter').querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b)); paint(); };
    $('aList').onclick = e => {
      const rp = e.target.closest('.rp');
      if (rp) { const ev = list.find(x => x.id === rp.dataset.id); if (ev) { zen.overlay('alert', { ...ev, id: ev.id + '-r' + Date.now() }, 'alerts'); toast('Repitiendo la alerta'); } return; }
      const u = e.target.closest('[data-user]');
      if (u) UserCard.open(u.dataset.user, App.mainChannel(), e.clientX, e.clientY);
    };
    $('aPause').onclick = () => setPaused(!alerts().global.paused);
    $('aSkip').onclick = () => zen.overlay('control', { do: 'skip' }, 'alerts');
    $('aTest').onclick = e => {
      const r = e.target.getBoundingClientRect();
      ctxMenu(r.left - 120, r.bottom + 4, ZenAlerts.TYPES.map(t => ({ label: t.icon + '  ' + t.name, fn: () => test(t.id) })));
    };
    zen.onClients(c => { clients = c; stat(); });
    zen.clients().then(c => { clients = c || {}; stat(); });
    paintPause();
    paint();
  }
  const alerts = () => ZenAlerts.complete(Cfg.get('alerts'));
  function setPaused(p) {
    const a = alerts(); a.global.paused = p;
    Cfg.set('alerts', a);
    zen.overlay('control', { do: p ? 'pause' : 'resume' }, 'alerts');
    paintPause();
    toast(p ? 'Alertas en pausa: se guardan en cola' : 'Alertas activadas');
  }
  function paintPause() { const p = alerts().global.paused; $('aPause').classList.toggle('on', p); $('aPause').textContent = p ? '▶' : '❚❚'; $('aPause').title = p ? 'Reanudar las alertas' : 'Pausar las alertas'; }

  function text(ev) {
    const u = `<b data-user="${esc(ev.login || ev.user || '')}">${esc(ev.user || '')}</b>`;
    switch (ev.type) {
      case 'follow': return [`${u} te sigue`, ''];
      case 'sub': return [`${u} se ha suscrito${ev.tier && ev.tier !== '1' ? ' (nivel ' + esc(ev.tier) + ')' : ''}${ev.prime ? ' con Prime' : ''}`, ''];
      case 'resub': return [`${u} lleva ${esc(ev.months)} meses${ev.streak ? ' · racha ' + esc(ev.streak) : ''}`, ev.message];
      case 'gift': return [`${u} regala ${esc(ev.amount)} sub${ev.amount > 1 ? 's' : ''}`, ev.total ? `${ev.total} regaladas en total` : ''];
      case 'cheer': return [`${u} · <b>${esc(ev.amount)} bits</b>`, ev.message];
      case 'raid': return [`Raid de ${u} con <b>${esc(ev.amount)}</b>`, ''];
      case 'points': return [`${u} canjeó <b>${esc(ev.reward)}</b>`, ev.message];
      case 'powerup': return [`${u} usó <b>${esc(ev.reward)}</b>`, ev.message];
      case 'hypetrain': return [`Hype Train · nivel <b>${esc(ev.level)}</b>`, ev.phase];
      case 'firstchat': return [`${u} escribe por primera vez`, ev.message];
      case 'streak': return [`${u} · ${esc(ev.amount)} directos seguidos`, ev.message];
      case 'shoutout': return [`${u} te ha dado un shoutout`, ev.amount ? ev.amount + ' viendo' : ''];
      case 'poll': case 'prediction': return [`${esc(ev.phase)}: ${esc(ev.title)}`, ev.winner];
      case 'adbreak': return [`Anuncios: ${esc(ev.amount)} s`, ''];
      case 'charity': return [`${u} dona ${esc(ev.amount)} ${esc(ev.currency || '')}`, ''];
      case 'goal': return [`Objetivo cumplido: ${esc(ev.title)}`, ''];
    }
    return [esc(ev.type), ''];
  }
  function item(ev) {
    const t = ZenAlerts.TYPES.find(x => x.id === ev.type);
    const [a, b] = text(ev);
    return `<div class="ai${ev.test ? ' test' : ''}" style="--c:${COLORS[ev.type] || 'var(--a1)'}"><div class="ic">${t ? t.icon : '•'}</div><div class="bx"><div class="t">${a}</div>${b ? `<div class="s">${esc(b)}</div>` : ''}<div class="w">${fmtTime(ev.t)}${ev.test ? ' · prueba' : ''}</div></div><button class="rp" data-id="${esc(ev.id)}" title="Repetir la alerta">↻</button></div>`;
  }
  function match(ev) {
    if (filter === 'all') return true;
    const c = CAT[ev.type] || 'other';
    return c === filter;
  }
  function paint() {
    const ev = list.filter(match);
    $('aList').innerHTML = ev.length ? ev.slice(0, 150).map(item).join('') : '<div class="aempty">Aquí salen los follows, subs, bits, raids, canjes de puntos… de tu directo. Con <b>↻</b> se repite la alerta.</div>';
  }
  function stat() {
    const dot = (ok, n) => `<span class="${ok ? 'ok' : 'no'}">● ${n}</span>`;
    $('aStat').innerHTML = dot(esState === 'on', 'Eventos') + dot(IRC.state() === 'on', 'Chat') + dot(clients.alerts > 0, 'OBS alertas') + (clients.chat ? dot(true, 'OBS chat') : '');
  }
  function setES(s) { esState = s; stat(); }

  function overlayState() {
    const last = {};
    for (const e of list) if (!e.test && !last[e.type]) last[e.type] = { user: e.user, amount: e.amount || e.months || e.reward || '' };
    if (last.resub && !last.sub) last.sub = last.resub;
    zen.overlayState({ events: list.slice(0, 50), last, goals: Cfg.get('goalCounts', {}) });
  }
  function goalsAdd(ev) {
    const goals = Cfg.get('goals', []);
    if (!goals.length || ev.test) return;
    const c = { ...Cfg.get('goalCounts', {}) };
    let changed = false;
    for (const g of goals) {
      let n = 0;
      if (g.type === 'follows' && ev.type === 'follow') n = 1;
      if (g.type === 'subs' && (ev.type === 'sub' || ev.type === 'resub')) n = 1;
      if (g.type === 'subs' && ev.type === 'gift') n = +ev.amount || 1;
      if (g.type === 'bits' && ev.type === 'cheer') n = +ev.amount || 0;
      if (g.type === 'points' && ev.type === 'points') n = 1;
      if (g.type === 'raiders' && ev.type === 'raid') n = +ev.amount || 0;
      if (!n) continue;
      const before = (+g.start || 0) + (+c[g.id] || 0);
      c[g.id] = (+c[g.id] || 0) + n;
      changed = true;
      if (before < +g.target && before + n >= +g.target) setTimeout(() => emit({ type: 'goal', title: g.title, amount: g.target, amountValue: +g.target }), 1500);
    }
    if (changed) Cfg.set('goalCounts', c);
  }

  // un evento nuevo. ev: { type, user, login, amount, … }
  function emit(ev, opts = {}) {
    ev = { id: ev.id || (ev.type + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)), t: Date.now(), ...ev };
    if (ev.amountValue === undefined) { const t = ZenAlerts.TYPES.find(x => x.id === ev.type); if (t && t.amount) ev.amountValue = +ev[t.amount] || 0; }
    if (list.some(x => x.id === ev.id)) return; // repetido (EventSub a veces manda dos)
    list.unshift(ev);
    if (list.length > 300) list.length = 300;
    Cfg.set('activity', list.slice(0, 300));
    if (match(ev)) { $('aList').querySelector('.aempty')?.remove(); $('aList').insertAdjacentHTML('afterbegin', item(ev)); }
    if (opts.alert !== false) zen.overlay('alert', ev, 'alerts');
    goalsAdd(ev);
    overlayState();
    if (!ev.test && Cfg.ui('notifyEvents', false)) zen.notify('ZenChat', text(ev)[0].replace(/<[^>]+>/g, ''));
    Chat.eventLine(ev);
  }
  function test(type) {
    const ev = ZenAlerts.sample(type, Me.name || 'ZenTester');
    emit(ev);
  }
  function clear() { list = []; Cfg.set('activity', []); paint(); overlayState(); }

  return { init, emit, test, setES, stat, clear, paintPause, overlayState, COLORS };
})();
