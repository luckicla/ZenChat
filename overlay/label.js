'use strict';
// Un texto: el último de algo. http://127.0.0.1:47830/label?t=follow&p=Último%20follow
// t = follow | sub | gift | cheer | raid | points | charity · p = lo que va delante
// También ?t=topcheer (el que más bits ha tirado en el directo)
(() => {
  const t = Zen.q.get('t') || 'follow';
  const pre = Zen.q.get('p') ?? '';
  const el = document.createElement('div');
  el.className = 'label';
  if (Zen.q.get('fs')) el.style.setProperty('--fs', Zen.q.get('fs') + 'px');
  if (Zen.q.get('c')) el.style.color = Zen.q.get('c');
  document.body.appendChild(el);
  const esc = ZenAlerts.esc;
  Zen.on('state', s => {
    const last = (s && s.last) || {};
    const e = last[t];
    let v = '';
    if (e) v = e.user + (e.amount && t !== 'follow' && t !== 'sub' ? ' · ' + e.amount : '');
    el.innerHTML = (pre ? `<em>${esc(pre)}</em>` : '') + esc(v || '—');
  });
  Zen.start('label');
})();
