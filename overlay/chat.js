'use strict';
// El chat en pantalla: en OBS, «Navegador» → http://127.0.0.1:47830/chat
// (p. ej. 420×700). Los mensajes llegan ya montados desde ZenChat, con sus
// insignias y emotes (Twitch, 7TV, BTTV, FFZ).
(() => {
  const box = document.createElement('div');
  box.className = 'chatbox';
  document.body.appendChild(box);
  let c = {};
  const esc = ZenAlerts.esc;

  Zen.on('config', all => {
    c = { fs: 20, font: 'inter', fade: 0, max: 30, style: 'shadow', bga: 0.62, badges: true, hideCmds: true, hideBots: 'nightbot,streamelements,streamlabs,moobot,fossabot,wizebot', dir: 'bottom', textColor: '#ffffff', gap: 4, ...(all.chatbox || {}) };
    box.className = 'chatbox ' + (c.style === 'boxes' ? 'boxes' : c.style === 'glass' ? 'boxes glass' : 'shadow') + (c.dir === 'top' ? ' top' : '');
    box.style.setProperty('--fs', c.fs + 'px');
    box.style.setProperty('--font', ZenAlerts.FONTS[c.font] || ZenAlerts.FONTS.grotesk);
    box.style.setProperty('--fg', c.textColor);
    box.style.setProperty('--bga', c.bga);
    box.style.setProperty('--gap', c.gap + 'px');
  });
  Zen.on('chat', m => {
    if (c.hideCmds && /^!/.test(m.text || '')) return;
    const bots = String(c.hideBots || '').toLowerCase().split(/[\s,]+/).filter(Boolean);
    if (bots.includes(String(m.login || '').toLowerCase())) return;
    const d = document.createElement('div');
    d.className = 'cm' + (m.action ? ' act' : '') + (m.hl ? ' hl' : '') + (m.sys ? ' sys' : '');
    d.dataset.id = m.id || ''; d.dataset.user = m.login || '';
    d.style.setProperty('--nc', m.color || '#5cc8ff');
    const badges = c.badges && m.badges ? m.badges.map(b => `<img class="bd" src="${esc(b.url)}" alt="">`).join('') : '';
    const body = (m.parts || [{ t: 'text', v: m.text }]).map(p => p.t === 'emote' ? `<img class="em" src="${esc(p.url)}" alt="${esc(p.v)}">` : esc(p.v)).join('');
    d.innerHTML = m.sys ? `<span class="tx">${body}</span>` : `${badges}<span class="nm" style="color:${esc(m.color || '#5cc8ff')}">${esc(m.name)}</span>${m.action ? ' ' : ': '}<span class="tx">${body}</span>`;
    if (c.dir === 'top') box.prepend(d); else box.appendChild(d);
    while (box.children.length > (c.max || 30)) (c.dir === 'top' ? box.lastElementChild : box.firstElementChild).remove();
    if (c.fade > 0) setTimeout(() => { d.classList.add('gone'); setTimeout(() => d.remove(), 700); }, c.fade * 1000);
  });
  Zen.on('delete', x => { for (const el of box.querySelectorAll('.cm')) if (el.dataset.id === x.id) el.remove(); });
  Zen.on('clearchat', x => { for (const el of box.querySelectorAll('.cm')) if (!x.user || el.dataset.user === x.user) el.remove(); });
  Zen.start('chat');
})();
