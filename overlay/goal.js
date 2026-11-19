'use strict';
// Barra de objetivo: http://127.0.0.1:47830/goal?id=<id> (sin id: el primero).
// Los objetivos se crean en ZenChat → Overlays → Objetivos.
(() => {
  const id = Zen.q.get('id');
  const el = document.createElement('div');
  el.className = 'goal';
  el.innerHTML = '<div class="gt"><span class="tt"></span><small class="pc"></small></div><div class="bar"><i class="fill"></i><div class="num"></div></div>';
  document.body.appendChild(el);
  let goals = [], st = {};
  function paint() {
    const g = goals.find(x => x.id === id) || goals[0];
    el.hidden = !g;
    if (!g) return;
    const cur = (+g.start || 0) + (+st[g.id] || 0);
    const pct = Math.max(0, Math.min(100, (cur / Math.max(1, +g.target || 1)) * 100));
    el.style.setProperty('--a1', g.a1 || '#ff6fd8');
    el.style.setProperty('--a2', g.a2 || '#1ec8ff');
    el.style.setProperty('--font', ZenAlerts.FONTS[g.font] || ZenAlerts.FONTS.grotesk);
    el.querySelector('.tt').textContent = g.title || 'Objetivo';
    el.querySelector('.pc').textContent = Math.floor(pct) + '%';
    el.querySelector('.fill').style.width = pct + '%';
    el.querySelector('.num').textContent = `${cur} / ${g.target}`;
  }
  Zen.on('config', c => { goals = c.goals || []; paint(); });
  Zen.on('state', s => { st = (s && s.goals) || {}; paint(); });
  Zen.start('goal');
})();
