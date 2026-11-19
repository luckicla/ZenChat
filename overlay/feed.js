'use strict';
// Últimos eventos (follows, subs, bits, raids…): http://127.0.0.1:47830/feed
// ?max=5 cuántos, ?t=follow,sub solo esos tipos, ?fs=18 tamaño de letra
(() => {
  const max = +Zen.q.get('max') || 6;
  const only = (Zen.q.get('t') || '').split(',').filter(Boolean);
  const box = document.createElement('div');
  box.className = 'feed';
  if (Zen.q.get('fs')) box.style.setProperty('--fs', Zen.q.get('fs') + 'px');
  document.body.appendChild(box);
  const COL = { follow: '#a99bff', sub: '#5cc8ff', resub: '#5cc8ff', gift: '#ffb547', cheer: '#b98cff', raid: '#ff5a5a', points: '#6ff0c0', charity: '#ffd166' };
  const esc = ZenAlerts.esc;
  function line(e) {
    const t = ZenAlerts.TYPES.find(x => x.id === e.type);
    const amt = e.type === 'cheer' ? e.amount + ' bits' : e.type === 'gift' ? 'x' + e.amount : e.type === 'raid' ? e.amount + ' viewers'
      : e.type === 'resub' ? e.months + ' meses' : e.type === 'points' ? e.reward : e.type === 'charity' ? e.amount + ' ' + (e.currency || '') : (t ? t.name : '');
    return `<div class="fe" style="--c:${COL[e.type] || '#a99bff'}"><i>${t ? t.icon : '•'}</i><b>${esc(e.user || e.title || '')}</b><span>${esc(amt || '')}</span></div>`;
  }
  Zen.on('state', s => {
    const ev = ((s && s.events) || []).filter(e => !e.test && (!only.length || only.includes(e.type))).slice(0, max);
    box.innerHTML = ev.map(line).join('');
  });
  Zen.start('feed');
})();
