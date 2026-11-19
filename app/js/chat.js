'use strict';
// El chat, como Chatterino: pestañas arriba, cada pestaña con uno o varios
// canales lado a lado (splits), líneas compactas con hora, insignias, emotes,
// botones de moderación, respuestas, menciones y autocompletar.
const Chat = (() => {
  const chans = new Map(); // login → canal
  let tabIdx = 0;
  const MAX = 1200;
  const ICON = {
    del: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    to: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg>',
    ban: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>',
    shield: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>',
    plus: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M12 5v14M5 12h14"/></svg>',
    dots: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
    smile: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>',
  };

  /* ---------- canales ---------- */
  function chan(login) {
    login = login.toLowerCase().replace(/^#/, '');
    let c = chans.get(login);
    if (!c) {
      c = { login, id: '', name: login, avatar: '', info: {}, modes: {}, msgs: [], users: new Map(), mod: false, splits: new Set(), histDone: false };
      chans.set(login, c);
      IRC.join(login);
      loadChannel(c);
    }
    return c;
  }
  async function loadChannel(c) {
    const u = await Tw.user(c.login);
    if (u) { c.id = u.id; c.name = u.display_name; c.avatar = u.profile_image_url; }
    paintHeads(c);
    if (c.id) Emotes.loadRoom(c.id).then(() => paintHeads(c));
    refreshInfo(c.login);
    if (!c.histDone && Cfg.ui('history', true)) loadHistory(c);
  }
  async function loadHistory(c) {
    c.histDone = true;
    const r = await zen.get(`https://recent-messages.robotty.de/api/v2/recent-messages/${c.login}?limit=${Cfg.ui('historyN', 100)}`);
    const lines = (r && r.json && r.json.messages) || [];
    for (const l of lines) { try { onIrc(IRC.parse(l), true); } catch {} }
    if (lines.length) sys(c, '— mensajes de antes —', 'sepline');
  }
  async function refreshInfo(login) {
    const c = chans.get((login || '').toLowerCase());
    if (!c || !Me.ok) return;
    const [s] = await Tw.get('streams?user_login=' + c.login);
    c.info.live = !!s;
    if (s) { c.info.viewers = s.viewer_count; c.info.title = s.title; c.info.game = s.game_name; c.info.started = s.started_at; }
    else if (c.id) {
      const [ch] = await Tw.get('channels?broadcaster_id=' + c.id);
      if (ch) { c.info.title = ch.title; c.info.game = ch.game_name; }
    }
    paintHeads(c);
    if (c.login === Me.login) App.setLive(c.info);
  }
  setInterval(() => { for (const c of chans.values()) if (c.splits.size) refreshInfo(c.login); }, 60e3);

  /* ---------- pestañas y splits ---------- */
  const tabs = () => { let t = Cfg.ui('tabs'); if (!Array.isArray(t) || !t.length) t = [{ splits: [Me.login || 'luckicla'] }]; return t; };
  function saveTabs(t) { Cfg.setUi('tabs', t); }
  function paintTabs() {
    const t = tabs();
    if (tabIdx >= t.length) tabIdx = t.length - 1;
    $('tabs').innerHTML = t.map((x, i) => `<button class="tab${i === tabIdx ? ' sel' : ''}" data-i="${i}" title="${esc(x.splits.join(', '))}">${esc(x.name || x.splits.join(' · '))}<span class="x" data-x="${i}">×</span></button>`).join('');
  }
  function showTab(i) {
    tabIdx = i;
    Cfg.setUi('tab', i);
    paintTabs();
    const t = tabs()[i];
    for (const c of chans.values()) c.splits.clear();
    $('splits').innerHTML = '';
    t.splits.forEach((login, k) => $('splits').appendChild(makeSplit(login, k)));
    App.view('chat');
    const first = $('splits').querySelector('textarea');
    if (first) first.focus();
  }
  function addTab(login) {
    login = String(login || '').trim().toLowerCase().replace(/^.*twitch\.tv\//, '').replace(/[^a-z0-9_]/g, '');
    if (!login) return;
    const t = tabs(); t.push({ splits: [login] }); saveTabs(t); showTab(t.length - 1);
  }
  function closeTab(i) {
    const t = tabs(); if (t.length <= 1) { toast('Tiene que quedar al menos una pestaña'); return; }
    const gone = t.splice(i, 1)[0]; saveTabs(t);
    if (tabIdx >= t.length) tabIdx = t.length - 1;
    showTab(Math.min(tabIdx, t.length - 1));
    cleanup(gone.splits);
  }
  function cleanup(logins) {
    const used = new Set(tabs().flatMap(x => x.splits));
    used.add(Me.login);
    for (const l of logins || []) if (!used.has(l)) { IRC.part(l); chans.delete(l); }
  }
  function addSplit(login, after) {
    login = String(login || '').trim().toLowerCase().replace(/^.*twitch\.tv\//, '').replace(/[^a-z0-9_]/g, '');
    if (!login) return;
    const t = tabs(); t[tabIdx].splits.splice(after + 1, 0, login); saveTabs(t); showTab(tabIdx);
  }
  function closeSplit(k) {
    const t = tabs(); const s = t[tabIdx].splits;
    if (s.length <= 1) return closeTab(tabIdx);
    const gone = s.splice(k, 1); saveTabs(t); showTab(tabIdx); cleanup(gone);
  }
  function askChannel(title, cb) {
    const b = Modal.open(`<h2>${esc(title)} <button class="sbtn" data-close>✕</button></h2><p>Nombre del canal de Twitch (o su enlace).</p><input class="inp w" id="askCh" placeholder="ibai" autofocus><div class="btns"><button class="btn ghost" data-close>Cancelar</button><button class="btn" id="askOk">Abrir</button></div>`);
    const i = b.querySelector('#askCh'); setTimeout(() => i.focus(), 30);
    const ok = () => { const v = i.value; Modal.close(); cb(v); };
    b.querySelector('#askOk').onclick = ok;
    i.onkeydown = e => { if (e.key === 'Enter') ok(); };
    b.querySelectorAll('[data-close]').forEach(x => x.onclick = () => Modal.close());
  }

  function makeSplit(login, k) {
    const c = chan(login);
    const el = h(`<section class="split" data-ch="${esc(c.login)}">
      <div class="shead"><span class="ch"></span><span class="info"></span><span class="modes"></span>
        <button class="sbtn clipb" title="Clip rápido de este canal">✂</button>
        <button class="sbtn modb" title="Modo moderador: botones de borrar, timeout y ban en cada línea">${ICON.shield}</button>
        <button class="sbtn addb" title="Abrir otro canal al lado">${ICON.plus}</button>
        <button class="sbtn menub" title="Más">${ICON.dots}</button></div>
      <div class="msgs"></div>
      <div class="paused-bar" hidden><button>Chat en pausa · ver lo nuevo ↓</button></div>
      <div class="input"><div class="replying" hidden></div><div class="irow"><textarea rows="1" maxlength="500" placeholder="Enviar mensaje…" spellcheck="true" aria-label="Escribe un mensaje"></textarea><button class="sbtn emob" title="Emotes" aria-label="Emotes">${ICON.smile}</button><span class="cnt"></span><button class="send" aria-label="Enviar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></div></div>
    </section>`);
    const sp = { el, c, k, msgs: el.querySelector('.msgs'), ta: el.querySelector('textarea'), paused: false, hover: false, reply: null, pending: 0 };
    el._sp = sp;
    c.splits.add(sp);
    // modo mod: por canal, se recuerda
    const modOn = !!(Cfg.ui('modMode', {})[c.login] ?? (c.login === Me.login));
    el.classList.toggle('mod', modOn);
    el.querySelector('.modb').classList.toggle('on', modOn);
    el.querySelector('.modb').onclick = () => {
      const m = { ...Cfg.ui('modMode', {}) }; m[c.login] = !el.classList.contains('mod'); Cfg.setUi('modMode', m);
      el.classList.toggle('mod', m[c.login]); el.querySelector('.modb').classList.toggle('on', m[c.login]);
    };
    el.querySelector('.clipb').onclick = () => Clip.make(c.login);
    el.querySelector('.addb').onclick = () => askChannel('Abrir canal al lado', v => addSplit(v, k));
    el.querySelector('.menub').onclick = e => {
      const r = e.currentTarget.getBoundingClientRect();
      ctxMenu(r.right - 200, r.bottom + 4, [
        { label: 'Ver en Twitch', fn: () => zen.open('https://twitch.tv/' + c.login) },
        { label: 'Abrir el chat de Twitch (popout)', fn: () => zen.open(`https://www.twitch.tv/popout/${c.login}/chat`) },
        { label: 'Tarjeta del canal', fn: () => UserCard.open(c.login, c.login, r.left - 200, r.bottom) },
        { label: 'Recargar emotes', fn: async () => { await Emotes.loadRoom(c.id, true); const n = Emotes.counts(c.id); toast(`Emotes: ${n.seven} de 7TV, ${n.bttv} de BTTV, ${n.ffz} de FFZ`); } },
        { label: 'Limpiar (solo aquí)', fn: () => { sp.msgs.innerHTML = ''; } },
        '-',
        { label: 'Cerrar este canal', danger: true, fn: () => closeSplit(k) },
      ]);
    };
    el.addEventListener('mousedown', () => focusSplit(sp));
    // pausa: al subir con la rueda, o al pasar el ratón por encima (opción)
    sp.msgs.addEventListener('scroll', () => {
      const atBottom = sp.msgs.scrollHeight - sp.msgs.scrollTop - sp.msgs.clientHeight < 30;
      setPaused(sp, !atBottom || (sp.hover && Cfg.ui('pauseHover', true)));
    });
    sp.msgs.addEventListener('mouseenter', () => { sp.hover = true; });
    sp.msgs.addEventListener('mouseleave', () => {
      sp.hover = false;
      const atBottom = sp.msgs.scrollHeight - sp.msgs.scrollTop - sp.msgs.clientHeight < 30;
      if (atBottom || sp.paused) { setPaused(sp, false); toBottom(sp); }
    });
    sp.msgs.addEventListener('mousemove', () => { if (Cfg.ui('pauseHover', true) && !sp.paused) setPaused(sp, true); });
    el.querySelector('.paused-bar button').onclick = () => { setPaused(sp, false); toBottom(sp); };
    sp.msgs.addEventListener('click', e => onMsgClick(e, sp));
    sp.msgs.addEventListener('contextmenu', e => onMsgMenu(e, sp));
    Input.bind(sp);
    paintHeads(c);
    // lo que ya había en el canal (o un aviso si aún no hay nada)
    const empty = h(`<div class="empty-ch"><b>#${esc(c.login)}</b><span>${Me.ok ? 'Aún no ha escrito nadie. Los mensajes saldrán aquí.' : 'Estás mirando sin cuenta: entra con Twitch para escribir y moderar.'}</span></div>`);
    sp.msgs.appendChild(empty);
    // mantener pulsado un mensaje (móvil): el menú de responder, copiar, moderar…
    let lp = null, lx = 0, ly = 0;
    sp.msgs.addEventListener('touchstart', e => {
      const t = e.touches[0]; lx = t.clientX; ly = t.clientY;
      const target = e.target;
      clearTimeout(lp);
      lp = setTimeout(() => { zen.flash(); onMsgMenu({ target, clientX: lx, clientY: ly, preventDefault() {} }, sp); }, 450);
    }, { passive: true });
    sp.msgs.addEventListener('touchmove', e => { const t = e.touches[0]; if (Math.abs(t.clientX - lx) > 10 || Math.abs(t.clientY - ly) > 10) clearTimeout(lp); }, { passive: true });
    sp.msgs.addEventListener('touchend', () => clearTimeout(lp));
    const frag = document.createDocumentFragment();
    for (const m of c.msgs.slice(-400)) frag.appendChild(render(m));
    sp.msgs.appendChild(frag);
    requestAnimationFrame(() => toBottom(sp));
    return el;
  }
  let focused = null;
  function focusSplit(sp) { if (focused) focused.el.classList.remove('focus'); focused = sp; sp.el.classList.add('focus'); }
  function setPaused(sp, p) {
    if (sp.paused === p) return;
    sp.paused = p;
    if (!p) sp.pending = 0;
    sp.el.querySelector('.paused-bar').hidden = !p || !sp.pending;
  }
  function toBottom(sp) { sp.msgs.scrollTop = sp.msgs.scrollHeight; }
  function paintHeads(c) {
    for (const sp of c.splits) {
      const hd = sp.el.querySelector('.shead');
      const ch = hd.querySelector('.ch');
      ch.className = 'ch' + (c.info.live ? ' onair' : '');
      ch.innerHTML = `${c.avatar ? `<img src="${esc(c.avatar)}" alt="">` : ''}<b>${esc(c.name)}</b>`;
      const i = c.info;
      hd.querySelector('.info').innerHTML = i.live
        ? `<b>${fmtNum(i.viewers)}</b> · ${esc(uptime(i.started))} · ${esc(i.game || '')} · ${esc(i.title || '')}`
        : esc([i.game, i.title].filter(Boolean).join(' · ') || 'desconectado');
      hd.querySelector('.info').title = (i.title || '') + (i.game ? '\n' + i.game : '');
      const m = c.modes, tags = [];
      if (m.emoteOnly) tags.push('EMOTES'); if (m.subs) tags.push('SUBS'); if (m.r9k) tags.push('R9K');
      if (m.slow) tags.push('LENTO ' + m.slow + 's'); if (m.followers >= 0 && m.followers !== undefined) tags.push('FOLLOW' + (m.followers ? ' ' + m.followers + 'm' : ''));
      hd.querySelector('.modes').textContent = tags.join(' · ');
    }
    if (tabs()[tabIdx] && tabs()[tabIdx].splits.includes(c.login)) paintTabs();
  }
  function uptime(t) { if (!t) return ''; const s = (Date.now() - new Date(t)) / 1000; return Math.floor(s / 3600) + 'h ' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + 'm'; }

  /* ---------- mensajes ---------- */
  function add(c, m) {
    c.msgs.push(m);
    if (c.msgs.length > MAX) c.msgs.splice(0, c.msgs.length - MAX);
    if (m.login) {
      const u = c.users.get(m.login) || { msgs: [] };
      u.name = m.name; u.color = m.color; u.t = m.t; u.msgs.push(m);
      if (u.msgs.length > 200) u.msgs.shift();
      c.users.set(m.login, u);
    }
    for (const sp of c.splits) {
      const em = sp.msgs.querySelector('.empty-ch'); if (em && m.cls !== 'sepline') em.remove();
      sp.msgs.appendChild(render(m));
      while (sp.msgs.childElementCount > 600) sp.msgs.firstElementChild.remove();
      if (!sp.paused) toBottom(sp);
      else { sp.pending++; sp.el.querySelector('.paused-bar').hidden = false; }
    }
    UserCard.newMsg(c.login, m);
    if (!m.hist && !m.sys && m.login !== Me.login) markTab(c.login, m.hl);
  }
  function markTab(login, mention) {
    tabs().forEach((t, i) => {
      if (i === tabIdx || !t.splits.includes(login)) return;
      const el = $('tabs').querySelector(`.tab[data-i="${i}"]`);
      if (el) { el.classList.add('unread'); if (mention) el.classList.add('mention'); }
    });
  }
  function sys(c, text, cls = '') {
    add(c, { id: 's' + Date.now() + Math.random(), sys: true, cls, text, parts: [{ t: 'text', v: text }], t: Date.now() });
  }
  function partsHtml(parts) {
    return parts.map(p => {
      if (p.t === 'emote') return `<img class="em${p.zw ? ' zw' : ''}" src="${esc(p.url)}" alt="${esc(p.v)}" title="${esc(p.v)}${p.src ? ' · ' + p.src : ''}" loading="lazy">`;
      if (p.t === 'mention') { const u = findUser(p.login); return `<span class="mn" data-user="${esc(p.login)}" style="color:${esc(u ? u.color : 'inherit')}">${esc(p.v)}</span>`; }
      if (p.t === 'link') return `<a href="${esc(p.url)}" target="_blank" rel="noreferrer">${esc(p.v)}</a>`;
      return esc(p.v);
    }).join('');
  }
  function findUser(login) { for (const c of chans.values()) { const u = c.users.get(login); if (u) return u; } return null; }
  function render(m) {
    if (m.cls === 'sepline') { const d = document.createElement('div'); d.className = 'sepline'; d.textContent = m.text; return d; }
    const d = document.createElement('div');
    d.className = 'm' + (m.sys ? ' sys' : '') + (m.action ? ' act' : '') + (m.hl ? ' hl' : '') + (m.first ? ' first' : '') + (m.kind ? ' ' + m.kind : '') + (m.deleted ? ' del' : '') + (m.hist ? ' hist' : '') + (m.login === Me.login && !m.sys ? ' self' : '') + (m.timed ? ' timed' : '');
    if (m.id) d.dataset.id = m.id;
    if (m.login) d.dataset.user = m.login;
    const ts = Cfg.ui('timestamps', true) ? `<span class="ts">${fmtTime(m.t)}</span>` : '';
    if (m.sys) { d.innerHTML = `${ts}<span class="tx">${partsHtml(m.parts)}</span>`; return d; }
    const reply = m.reply ? `<span class="reply" data-reply="${esc(m.reply.id)}">↪ @${esc(m.reply.name)}: ${esc(m.reply.text)}</span>` : '';
    const ev = m.evText ? `<span class="ev">${esc(m.evText)}</span>` : '';
    const mod = `<span class="mod"><button data-a="del" title="Borrar mensaje">${ICON.del}</button><button class="t" data-a="to" title="Timeout ${dur(Cfg.ui('quickTo', 600))}">${ICON.to}</button><button data-a="ban" title="Ban">${ICON.ban}</button></span>`;
    const badges = Cfg.ui('badges', true) ? m.badges.map(b => `<img class="bd" src="${esc(b.url)}" title="${esc(b.title)}" alt="">`).join('') : '';
    const body = m.parts.length || !ev ? `${mod}${badges}<span class="nm" style="color:${esc(m.color)}">${esc(m.name)}${m.name.toLowerCase() !== m.login ? ` <small style="opacity:.7">(${esc(m.login)})</small>` : ''}</span>${m.action ? ' ' : ': '}<span class="tx">${partsHtml(m.parts)}</span>` : '';
    d.innerHTML = `${ev}${reply}${ts}${body}`;
    return d;
  }
  // los mensajes que ya están pintados (borrar, timeout)
  function mark(c, sel, cls) { for (const sp of c.splits) sp.msgs.querySelectorAll(sel).forEach(el => el.classList.add(cls)); }

  function isHighlight(text, login) {
    if (login === Me.login) return false;
    if ((Cfg.ui('noHl', []) || []).includes(login)) return false;
    const t = text.toLowerCase();
    if (Me.login && new RegExp('(^|[^a-z0-9_])@?' + Me.login + '([^a-z0-9_]|$)').test(t)) return true;
    for (const w of Cfg.ui('hlWords', []) || []) if (w && t.includes(w.toLowerCase())) return true;
    return false;
  }

  /* ---------- lo que llega del IRC ---------- */
  function onIrc(m, hist) {
    if (m.command === 'ZEN_STATE') {
      Events.stat();
      if (m.state === 'auth') for (const c of chans.values()) sys(c, 'Twitch no aceptó la sesión: entra otra vez en Ajustes → Cuenta');
      return;
    }
    const c = m.channel ? chans.get(m.channel) : null;
    if (!c) return;
    const tg = m.tags;
    const t = +tg['tmi-sent-ts'] || Date.now();
    if (tg['room-id'] && !c.id) { c.id = tg['room-id']; Emotes.loadRoom(c.id); }
    switch (m.command) {
      case 'PRIVMSG': {
        const login = m.nick;
        if ((Cfg.ui('ignored', []) || []).includes(login)) return;
        if (Cfg.ui('ignorePhrases', []).some(p => p && m.text.toLowerCase().includes(p.toLowerCase()))) return;
        const msg = mkMsg(c, m, t, hist);
        if (tg['custom-reward-id']) { msg.kind = 'redeem'; msg.evText = 'Canjeó una recompensa'; }
        if (tg.bits) { msg.kind = 'cheer'; msg.evText = tg.bits + ' bits'; }
        if (tg['msg-id'] === 'highlighted-message') { msg.kind = 'redeem'; msg.evText = 'Mensaje destacado'; }
        add(c, msg);
        if (!hist) {
          if (msg.hl) mention(c, msg);
          if (msg.first && c.login === Me.login) Events.emit({ type: 'firstchat', user: msg.name, login, message: m.text });
          toOverlay(c, msg);
        }
        return;
      }
      case 'USERNOTICE': {
        const id = tg['msg-id'];
        const msg = mkMsg(c, m, t, hist);
        msg.evText = tg['system-msg'] || '';
        msg.kind = id === 'announcement' ? 'ann' : 'sub';
        if (id === 'raid' || id === 'unraid') msg.kind = 'redeem';
        if (id === 'viewermilestone') { msg.kind = 'redeem'; if (!hist && c.login === Me.login && tg['msg-param-category'] === 'watch-streak') Events.emit({ type: 'streak', user: msg.name, login: msg.login, amount: +tg['msg-param-value'] || 0, message: m.text || '' }); }
        if (!m.text) { msg.parts = []; }
        add(c, msg);
        if (!hist) toOverlay(c, { ...msg, sys: true, parts: [{ t: 'text', v: msg.evText }, ...(m.text ? [{ t: 'text', v: ' — ' }, ...msg.parts] : [])] });
        return;
      }
      case 'CLEARCHAT': {
        const target = m.params[1];
        if (target) {
          const secs = tg['ban-duration'];
          c.msgs.forEach(x => { if (x.login === target) x.timed = true; });
          mark(c, `.m[data-user="${CSS.escape(target)}"]`, 'timed');
          sys(c, secs ? `${target} ha sido silenciado ${dur(+secs)}.` : `${target} ha sido baneado.`);
          if (!hist) { zen.overlay('clearchat', { user: target }, 'chat'); UserCard.refresh(target); }
        } else { sys(c, 'Un moderador ha borrado el chat.'); if (!hist) zen.overlay('clearchat', {}, 'chat'); }
        return;
      }
      case 'CLEARMSG': {
        const id = tg['target-msg-id'];
        const x = c.msgs.find(x => x.id === id); if (x) x.deleted = true;
        mark(c, `.m[data-id="${CSS.escape(id)}"]`, 'del');
        if (!hist) zen.overlay('delete', { id }, 'chat');
        return;
      }
      case 'NOTICE': if (!hist) sys(c, m.text, 'notice'); return;
      case 'ROOMSTATE': {
        if (!c.joinedOnce && !hist) { c.joinedOnce = true; sys(c, `Conectado a #${c.login}`); }
        if ('slow' in tg) c.modes.slow = +tg.slow;
        if ('followers-only' in tg) c.modes.followers = +tg['followers-only'];
        if ('subs-only' in tg) c.modes.subs = tg['subs-only'] === '1';
        if ('emote-only' in tg) c.modes.emoteOnly = tg['emote-only'] === '1';
        if ('r9k' in tg) c.modes.r9k = tg.r9k === '1';
        paintHeads(c);
        return;
      }
      case 'USERSTATE': c.mod = /(^|,)(moderator|broadcaster)\//.test(tg.badges || '') || c.login === Me.login; return;
      case 'JOIN': if (m.nick === Me.login || m.nick.startsWith('justinfan')) { if (!c.joinedOnce) { c.joinedOnce = true; sys(c, `Conectado a #${c.login}`); } } return;
    }
  }
  function mkMsg(c, m, t, hist) {
    const tg = m.tags;
    const login = tg.login || m.nick;
    const msg = {
      id: tg.id || ('x' + t + Math.random()), login, name: tg['display-name'] || login, t, hist,
      color: nameColor(login, tg.color), badges: Emotes.badges(c.id || tg['room-id'], tg.badges), action: !!m.action,
      text: m.text, parts: Emotes.parse(m.text, tg.emotes, c.id || tg['room-id']),
      first: tg['first-msg'] === '1' && !hist, deleted: false,
    };
    if (tg['reply-parent-msg-id']) {
      msg.reply = { id: tg['reply-parent-msg-id'], name: tg['reply-parent-display-name'] || tg['reply-parent-user-login'], text: tg['reply-parent-msg-body'] || '' };
      // (Twitch mete «@nombre » delante: fuera, ya se ve arriba)
      if (msg.parts[0] && msg.parts[0].t === 'mention') { msg.parts.shift(); if (msg.parts[0] && msg.parts[0].t === 'text') msg.parts[0].v = msg.parts[0].v.replace(/^\s+/, ''); }
    }
    msg.hl = !hist && isHighlight(m.text, login);
    return msg;
  }
  function mention(c, msg) {
    const snd = Cfg.ui('mentionSound', 'synth:blip');
    if (snd && snd !== 'none') ZenSounds.play(mediaUrl(snd), Cfg.ui('mentionVol', 0.6));
    zen.flash();
    if (Cfg.ui('notifyMention', true) && !document.hasFocus()) zen.notify(`${msg.name} en #${c.login}`, msg.text);
  }
  // el chat de OBS: el canal propio (o el elegido)
  function toOverlay(c, msg) {
    // los recuadros de chat de OBS: cada uno enseña su canal (por defecto, el tuyo)
    const wanted = new Set([(Cfg.get('chatbox') || {}).channel || Me.login, ...(Cfg.get('widgets', []) || []).filter(w => w.type === 'chat').map(w => (w.channel || Me.login || '').toLowerCase())]);
    if (!wanted.has(c.login)) return;
    zen.overlay('chat', { ch: c.login, id: msg.id, login: msg.login, name: msg.name, color: msg.color, badges: msg.badges, parts: msg.parts, text: msg.text, action: msg.action, hl: msg.hl, sys: msg.sys }, 'chat');
  }
  // los eventos (follow, sub…) también como una línea en tu chat
  function eventLine(ev) {
    if (!Cfg.ui('eventLines', true) || !Me.login) return;
    const c = chans.get(Me.login);
    if (!c) return;
    const t = ZenAlerts.TYPES.find(x => x.id === ev.type);
    const txt = ZenAlerts.fill(ZenAlerts.complete(Cfg.get('alerts')).types[ev.type]?.text || (t && t.text) || ev.type, ev);
    add(c, { id: 'ev' + ev.id, sys: true, kind: ev.type === 'points' ? 'redeem' : 'sub', text: txt, parts: [{ t: 'text', v: (t ? t.icon + ' ' : '') + txt + (ev.test ? ' (prueba)' : '') }], t: Date.now() });
  }

  /* ---------- clics ---------- */
  function msgOf(el, sp) { const d = el.closest('.m'); if (!d) return null; return sp.c.msgs.find(x => x.id === d.dataset.id) || null; }
  function onMsgClick(e, sp) {
    const a = e.target.closest('.mod button');
    if (a) {
      const m = msgOf(a, sp); if (!m) return;
      if (a.dataset.a === 'del') Mod.del(sp.c, m.id);
      if (a.dataset.a === 'to') Mod.timeout(sp.c, m.login, Cfg.ui('quickTo', 600));
      if (a.dataset.a === 'ban') Mod.ban(sp.c, m.login);
      return;
    }
    const n = e.target.closest('.nm,.mn');
    if (n) {
      const login = n.dataset.user || n.closest('.m').dataset.user;
      if (e.ctrlKey || e.button === 1) { insert(sp, '@' + login + ' '); return; }
      UserCard.open(login, sp.c.login, e.clientX, e.clientY);
      return;
    }
    const r = e.target.closest('.reply');
    if (r) { const el = sp.msgs.querySelector(`.m[data-id="${CSS.escape(r.dataset.reply)}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.animate([{ background: 'rgba(30,200,255,.35)' }, { background: 'transparent' }], 1200); } }
  }
  function onMsgMenu(e, sp) {
    const m = msgOf(e.target, sp);
    if (!m || m.sys) return;
    e.preventDefault();
    const sel = String(getSelection());
    ctxMenu(e.clientX, e.clientY, [
      sel ? { label: 'Copiar selección', fn: () => zen.copy(sel) } : null,
      { label: 'Responder', fn: () => setReply(sp, m) },
      { label: 'Mencionar a @' + m.name, fn: () => insert(sp, '@' + m.name + ' ') },
      { label: 'Copiar mensaje', fn: () => zen.copy(m.text) },
      { label: 'Copiar nombre', fn: () => zen.copy(m.login) },
      { label: 'Ver tarjeta de ' + m.name, fn: () => UserCard.open(m.login, sp.c.login, e.clientX, e.clientY) },
      '-',
      { label: 'Borrar mensaje', fn: () => Mod.del(sp.c, m.id) },
      { label: 'Timeout 1 min', fn: () => Mod.timeout(sp.c, m.login, 60) },
      { label: 'Timeout 10 min', fn: () => Mod.timeout(sp.c, m.login, 600) },
      { label: 'Timeout 1 hora', fn: () => Mod.timeout(sp.c, m.login, 3600) },
      { label: 'Ban', danger: true, fn: () => Mod.ban(sp.c, m.login) },
    ]);
  }
  function setReply(sp, m) {
    sp.reply = m;
    const r = sp.el.querySelector('.replying');
    r.hidden = !m;
    if (m) { r.innerHTML = `Respondiendo a <b>@${esc(m.name)}</b>: ${esc(m.text.slice(0, 80))}<button title="Cancelar">✕</button>`; r.querySelector('button').onclick = () => setReply(sp, null); sp.ta.focus(); }
  }
  function insert(sp, s) { const ta = sp.ta; const p = ta.selectionStart; ta.value = ta.value.slice(0, p) + s + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = p + s.length; ta.focus(); ta.dispatchEvent(new Event('input')); }

  /* ---------- enviar ---------- */
  async function send(sp, text) {
    text = text.trim();
    if (!text) return;
    if (!Me.ok) { toast('Para escribir, entra con tu cuenta de Twitch (Ajustes → Cuenta)', true); App.view('settings'); return; }
    if (text.startsWith('/') && !text.startsWith('//')) { await Commands.run(sp, text); return; }
    if (text.startsWith('//')) text = text.slice(1);
    const c = sp.c;
    const ok = IRC.say(c.login, text, sp.reply && sp.reply.id);
    if (!ok) { toast('Sin conexión con el chat, reconectando…', true); IRC.reconnect(); return; }
    const us = IRC.me(c.login);
    const action = /^\/me /.test(text);
    add(c, {
      id: 'own' + Date.now(), login: Me.login, name: us['display-name'] || Me.name, t: Date.now(), color: nameColor(Me.login, us.color),
      badges: Emotes.badges(c.id, us.badges), text, parts: Emotes.parseOwn(text, c.id), action,
      reply: sp.reply ? { id: sp.reply.id, name: sp.reply.name, text: sp.reply.text } : null,
    });
    toOverlay(c, { id: 'own' + Date.now(), login: Me.login, name: us['display-name'] || Me.name, color: nameColor(Me.login, us.color), badges: Emotes.badges(c.id, us.badges), parts: Emotes.parseOwn(text, c.id), text });
    setReply(sp, null);
  }

  /* ---------- escribir: autocompletar, historial, emotes ---------- */
  const Input = {
    bind(sp) {
      const ta = sp.ta, cnt = sp.el.querySelector('.cnt');
      const hist = []; let hi = -1;
      let comp = null; // { list, i, start, end, el }
      const grow = () => { ta.style.height = '30px'; ta.style.height = Math.min(120, ta.scrollHeight + 2) + 'px'; const n = [...ta.value].length; cnt.textContent = n > 350 ? 500 - n : ''; cnt.classList.toggle('over', n > 500); };
      const closeComp = () => { if (comp && comp.el) comp.el.remove(); comp = null; };
      const candidates = (word) => {
        const w = word.toLowerCase();
        const out = [];
        const user = w.startsWith('@') ? w.slice(1) : w;
        if (!w.startsWith(':')) {
          const users = [...sp.c.users.entries()].sort((a, b) => b[1].t - a[1].t);
          for (const [login, u] of users) if (login.startsWith(user)) out.push({ text: (w.startsWith('@') ? '@' : '') + u.name, label: u.name, color: u.color, kind: 'usuario' });
        }
        if (!w.startsWith('@')) {
          const q = w.replace(/^:/, '');
          if (q.length >= (w.startsWith(':') ? 2 : 1)) {
            for (const e of Emotes.all(sp.c.id)) if (e.name.toLowerCase().startsWith(q)) out.push({ text: e.name, label: e.name, img: e.url, kind: e.src });
            if (out.length < 30) for (const e of Emotes.all(sp.c.id)) if (!e.name.toLowerCase().startsWith(q) && e.name.toLowerCase().includes(q)) out.push({ text: e.name, label: e.name, img: e.url, kind: e.src });
          }
        }
        return out.slice(0, 40);
      };
      const wordAt = () => { const p = ta.selectionStart; const before = ta.value.slice(0, p); const m = before.match(/(\S+)$/); return m ? { word: m[1], start: p - m[1].length, end: p } : null; };
      const showComp = (list, start, end, i = 0) => {
        closeComp();
        if (!list.length) return;
        const el = document.createElement('div');
        el.className = 'complete';
        el.innerHTML = list.map((x, k) => `<button data-k="${k}" class="${k === i ? 'sel' : ''}">${x.img ? `<img src="${esc(x.img)}" alt="">` : ''}<span style="${x.color ? 'color:' + esc(x.color) : ''}">${esc(x.label)}</span><small>${esc(x.kind)}</small></button>`).join('');
        el.onmousedown = e => { e.preventDefault(); const b = e.target.closest('button'); if (b) { comp.i = +b.dataset.k; accept(); } };
        sp.el.appendChild(el);
        comp = { list, i, start, end, el };
      };
      const moveComp = d => { comp.i = (comp.i + d + comp.list.length) % comp.list.length; comp.el.querySelectorAll('button').forEach((b, k) => b.classList.toggle('sel', k === comp.i)); comp.el.children[comp.i].scrollIntoView({ block: 'nearest' }); };
      const accept = () => {
        const x = comp.list[comp.i];
        const v = ta.value;
        const add = x.text + ' ';
        ta.value = v.slice(0, comp.start) + add + v.slice(comp.end).replace(/^ /, '');
        ta.selectionStart = ta.selectionEnd = comp.start + add.length;
        closeComp(); grow();
      };
      ta.addEventListener('input', () => {
        grow();
        const w = wordAt();
        if (w && ((w.word.startsWith(':') && w.word.length >= 3) || (w.word.startsWith('@') && w.word.length >= 2))) showComp(candidates(w.word), w.start, w.end);
        else closeComp();
      });
      ta.addEventListener('keydown', e => {
        if (comp) {
          if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); moveComp(1); return; }
          if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) { e.preventDefault(); moveComp(-1); return; }
          if (e.key === 'Enter') { e.preventDefault(); accept(); return; }
          if (e.key === 'Escape') { e.preventDefault(); closeComp(); return; }
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          const w = wordAt();
          if (w) showComp(candidates(w.word), w.start, w.end);
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const v = ta.value;
          if (v.trim()) { hist.unshift(v); if (hist.length > 50) hist.pop(); }
          hi = -1;
          send(sp, v);
          // (con Ctrl+Enter se queda el texto, para repetirlo)
          if (!e.ctrlKey) ta.value = '';
          grow();
          return;
        }
        if (e.key === 'ArrowUp' && !ta.value.slice(0, ta.selectionStart).includes('\n') && hist.length) { e.preventDefault(); hi = Math.min(hist.length - 1, hi + 1); ta.value = hist[hi]; grow(); }
        if (e.key === 'ArrowDown' && hi >= 0) { e.preventDefault(); hi--; ta.value = hi >= 0 ? hist[hi] : ''; grow(); }
        if (e.key === 'Escape') { setReply(sp, null); }
      });
      ta.addEventListener('blur', () => setTimeout(closeComp, 150));
      ta.addEventListener('focus', () => focusSplit(sp));
      sp.el.querySelector('.emob').onclick = () => Picker.toggle(sp);
      sp.el.querySelector('.send').onclick = () => { const v = ta.value; if (!v.trim()) return; hist.unshift(v); send(sp, v); ta.value = ''; grow(); ta.focus(); };
    },
  };
  const Picker = {
    toggle(sp) {
      const old = sp.el.querySelector('.picker');
      if (old) { old.remove(); return; }
      const el = h(`<div class="picker"><input placeholder="Buscar emote…"><div class="pk"></div></div>`);
      const pk = el.querySelector('.pk'), q = el.querySelector('input');
      const paint = () => {
        const s = q.value.toLowerCase();
        const all = Emotes.all(sp.c.id).filter(e => !s || e.name.toLowerCase().includes(s));
        const groups = [['Del canal', all.filter(e => e.ch)], ['Tuyos de Twitch', all.filter(e => e.src === 'Twitch')], ['7TV globales', all.filter(e => !e.ch && e.src === '7TV')], ['BTTV globales', all.filter(e => !e.ch && e.src === 'BTTV')], ['FFZ globales', all.filter(e => !e.ch && e.src === 'FFZ')]];
        pk.innerHTML = groups.filter(g => g[1].length).map(([n, l]) => `<h4>${n} · ${l.length}</h4><div class="grid">${l.slice(0, 400).map(e => `<button data-n="${esc(e.name)}" title="${esc(e.name)}"><img src="${esc(e.url)}" alt="" loading="lazy"></button>`).join('')}</div>`).join('') || '<p style="color:var(--muted);padding:10px">Nada</p>';
      };
      pk.onclick = e => { const b = e.target.closest('button'); if (b) insert(sp, (sp.ta.value && !/\s$/.test(sp.ta.value) ? ' ' : '') + b.dataset.n + ' '); };
      q.oninput = paint;
      sp.el.appendChild(el);
      paint(); q.focus();
      const off = e => { if (!el.contains(e.target) && !e.target.closest('.emob')) { el.remove(); document.removeEventListener('mousedown', off); } };
      setTimeout(() => document.addEventListener('mousedown', off));
    },
  };

  function init() {
    IRC.on(m => onIrc(m, false));
    tabIdx = Math.min(Cfg.ui('tab', 0), tabs().length - 1);
    $('tabs').addEventListener('click', e => {
      const x = e.target.closest('[data-x]');
      if (x) { e.stopPropagation(); closeTab(+x.dataset.x); return; }
      const b = e.target.closest('.tab');
      if (b) { b.classList.remove('unread', 'mention'); showTab(+b.dataset.i); }
    });
    $('tabs').addEventListener('auxclick', e => { const b = e.target.closest('.tab'); if (b && e.button === 1) closeTab(+b.dataset.i); });
    $('tabs').addEventListener('contextmenu', e => {
      const b = e.target.closest('.tab'); if (!b) return;
      e.preventDefault();
      const i = +b.dataset.i;
      ctxMenu(e.clientX, e.clientY, [
        { label: 'Cambiar nombre', fn: () => { const t = tabs(); const n = prompt('Nombre de la pestaña', t[i].name || ''); if (n !== null) { t[i].name = n.trim(); saveTabs(t); paintTabs(); } } },
        { label: 'Añadir canal a esta pestaña', fn: () => { showTab(i); askChannel('Añadir canal', v => addSplit(v, tabs()[i].splits.length - 1)); } },
        { label: 'Cerrar pestaña', danger: true, fn: () => closeTab(i) },
      ]);
    });
    $('tabAdd').onclick = () => askChannel('Nueva pestaña', addTab);
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && e.key.toLowerCase() === 't') { e.preventDefault(); askChannel('Nueva pestaña', addTab); }
      if (e.ctrlKey && e.key.toLowerCase() === 'w') { e.preventDefault(); closeTab(tabIdx); }
      if (e.ctrlKey && /^[1-9]$/.test(e.key)) { const i = +e.key - 1; if (i < tabs().length) { e.preventDefault(); showTab(i); } }
      if (e.ctrlKey && e.key === 'Tab') { e.preventDefault(); showTab((tabIdx + (e.shiftKey ? -1 : 1) + tabs().length) % tabs().length); }
    });
    // el canal propio siempre conectado (alertas de primer mensaje, chat de OBS)
    if (Me.login) chan(Me.login);
    paintTabs();
    showTab(tabIdx);
  }
  function rerender() {
    for (const c of chans.values()) for (const sp of c.splits) { sp.msgs.innerHTML = ''; const f = document.createDocumentFragment(); for (const m of c.msgs.slice(-400)) f.appendChild(render(m)); sp.msgs.appendChild(f); toBottom(sp); }
  }

  return { init, chan, chans, sys, refreshInfo, eventLine, rerender, showTab, addTab, render, partsHtml, paintTabs, askChannel, current: () => tabs()[tabIdx], focused: () => focused };
})();

/* ---------- moderación (con la API de Twitch) ---------- */
const Mod = {
  async uid(c, login) { if (/^\d+$/.test(login)) return login; const u = await Tw.user(login); if (!u) throw new Error('No existe ' + login); return u.id; },
  bid(c) { return c.id; },
  async call(c, method, path, body, okMsg) {
    if (!c.id) { toast('Aún no sé el id del canal, espera un segundo', true); return false; }
    const r = await Tw.helix(method, path, body);
    if (r.status >= 200 && r.status < 300) { if (okMsg) toast(okMsg); return true; }
    toast(Tw.why(r), true);
    return false;
  },
  async del(c, msgId) { return this.call(c, 'DELETE', `moderation/chat?broadcaster_id=${c.id}&moderator_id=${Me.id}&message_id=${encodeURIComponent(msgId)}`, null, 'Mensaje borrado'); },
  async timeout(c, login, secs, reason) {
    try { const id = await this.uid(c, login); return this.call(c, 'POST', `moderation/bans?broadcaster_id=${c.id}&moderator_id=${Me.id}`, { data: { user_id: id, duration: Math.max(1, Math.min(1209600, secs)), reason: reason || '' } }, `${login}: timeout de ${dur(secs)}`); } catch (e) { toast(e.message, true); }
  },
  async ban(c, login, reason) {
    try { const id = await this.uid(c, login); return this.call(c, 'POST', `moderation/bans?broadcaster_id=${c.id}&moderator_id=${Me.id}`, { data: { user_id: id, reason: reason || '' } }, `${login} baneado`); } catch (e) { toast(e.message, true); }
  },
  async unban(c, login) {
    try { const id = await this.uid(c, login); return this.call(c, 'DELETE', `moderation/bans?broadcaster_id=${c.id}&moderator_id=${Me.id}&user_id=${id}`, null, `${login} desbaneado`); } catch (e) { toast(e.message, true); }
  },
  async warn(c, login, reason) {
    try { const id = await this.uid(c, login); return this.call(c, 'POST', `moderation/warnings?broadcaster_id=${c.id}&moderator_id=${Me.id}`, { data: { user_id: id, reason: reason || 'Aviso' } }, `Aviso enviado a ${login}`); } catch (e) { toast(e.message, true); }
  },
  async role(c, login, kind, on) {
    try {
      const id = await this.uid(c, login);
      const p = kind === 'mod' ? `moderation/moderators?broadcaster_id=${c.id}&user_id=${id}` : `channels/vips?broadcaster_id=${c.id}&user_id=${id}`;
      return this.call(c, on ? 'POST' : 'DELETE', p, null, `${login}: ${on ? 'ahora es' : 'ya no es'} ${kind === 'mod' ? 'mod' : 'VIP'}`);
    } catch (e) { toast(e.message, true); }
  },
  async shoutout(c, login) {
    try { const id = await this.uid(c, login); return this.call(c, 'POST', `chat/shoutouts?from_broadcaster_id=${c.id}&to_broadcaster_id=${id}&moderator_id=${Me.id}`, null, `Shoutout a ${login}`); } catch (e) { toast(e.message, true); }
  },
  async settings(c, body, msg) { return this.call(c, 'PATCH', `chat/settings?broadcaster_id=${c.id}&moderator_id=${Me.id}`, body, msg); },
  async block(login, on) {
    const u = await Tw.user(login); if (!u) return;
    const r = await Tw.helix(on ? 'PUT' : 'DELETE', `users/blocks?target_user_id=${u.id}`);
    toast(r.status < 300 ? (on ? `${login} bloqueado` : `${login} desbloqueado`) : Tw.why(r), r.status >= 300);
  },
};

/* ---------- comandos (/ban, /timeout, /title…) ---------- */
const Commands = {
  list: {
    '/me': 'texto · mensaje de acción', '/ban': 'usuario [motivo]', '/unban': 'usuario', '/timeout': 'usuario [10m] [motivo]', '/untimeout': 'usuario',
    '/warn': 'usuario motivo', '/clear': 'borrar el chat', '/slow': '[segundos] · /slowoff', '/followers': '[10m] · /followersoff', '/subscribers': '· /subscribersoff',
    '/emoteonly': '· /emoteonlyoff', '/uniquechat': '· /uniquechatoff', '/mod': 'usuario · /unmod', '/vip': 'usuario · /unvip', '/so': 'canal · shoutout',
    '/announce': 'texto (también /announceblue, green, orange, purple)', '/raid': 'canal · /unraid', '/commercial': '[30|60|90|120|180]', '/title': 'nuevo título',
    '/game': 'categoría', '/marker': '[descripción]', '/user': 'usuario · abre su tarjeta', '/block': 'usuario · /unblock', '/poll': 'pregunta | opción 1 | opción 2 [| …]',
    '/endpoll': 'acaba la encuesta', '/clip': 'clip rápido', '/w': 'usuario mensaje · susurro', '/help': 'esta lista',
  },
  async run(sp, text) {
    const c = sp.c;
    const [cmd0, ...args] = text.split(/\s+/);
    const cmd = cmd0.toLowerCase();
    const rest = text.slice(cmd0.length).trim();
    const a0 = (args[0] || '').replace(/^@/, '').toLowerCase();
    switch (cmd) {
      case '/me': IRC.say(c.login, '\x01ACTION ' + rest + '\x01'); Chat.sys(c, `* ${Me.name} ${rest}`); return;
      case '/ban': return Mod.ban(c, a0, args.slice(1).join(' '));
      case '/unban': case '/untimeout': return Mod.unban(c, a0);
      case '/timeout': { const s = parseDur(args[1]) || 600; return Mod.timeout(c, a0, s, args.slice(parseDur(args[1]) ? 2 : 1).join(' ')); }
      case '/warn': return Mod.warn(c, a0, args.slice(1).join(' '));
      case '/clear': return Mod.call(c, 'DELETE', `moderation/chat?broadcaster_id=${c.id}&moderator_id=${Me.id}`, null, 'Chat borrado');
      case '/slow': return Mod.settings(c, { slow_mode: true, slow_mode_wait_time: +args[0] || 30 }, 'Modo lento');
      case '/slowoff': return Mod.settings(c, { slow_mode: false }, 'Sin modo lento');
      case '/followers': return Mod.settings(c, { follower_mode: true, follower_mode_duration: Math.round((parseDur(args[0] || '0') || 0) / 60) }, 'Solo seguidores');
      case '/followersoff': return Mod.settings(c, { follower_mode: false }, 'Ya no es solo seguidores');
      case '/subscribers': return Mod.settings(c, { subscriber_mode: true }, 'Solo subs');
      case '/subscribersoff': return Mod.settings(c, { subscriber_mode: false }, 'Ya no es solo subs');
      case '/emoteonly': return Mod.settings(c, { emote_mode: true }, 'Solo emotes');
      case '/emoteonlyoff': return Mod.settings(c, { emote_mode: false }, 'Ya no es solo emotes');
      case '/uniquechat': case '/r9kbeta': return Mod.settings(c, { unique_chat_mode: true }, 'Chat único');
      case '/uniquechatoff': case '/r9kbetaoff': return Mod.settings(c, { unique_chat_mode: false }, 'Sin chat único');
      case '/mod': return Mod.role(c, a0, 'mod', true);
      case '/unmod': return Mod.role(c, a0, 'mod', false);
      case '/vip': return Mod.role(c, a0, 'vip', true);
      case '/unvip': return Mod.role(c, a0, 'vip', false);
      case '/so': case '/shoutout': return Mod.shoutout(c, a0);
      case '/announce': case '/announceblue': case '/announcegreen': case '/announceorange': case '/announcepurple':
        return Mod.call(c, 'POST', `chat/announcements?broadcaster_id=${c.id}&moderator_id=${Me.id}`, { message: rest, color: cmd.replace('/announce', '') || 'primary' }, 'Anuncio enviado');
      case '/raid': { const u = await Tw.user(a0); if (!u) return toast('No existe ' + a0, true); return Mod.call(c, 'POST', `raids?from_broadcaster_id=${c.id}&to_broadcaster_id=${u.id}`, null, 'Raid preparado: dale a «Raid ya» en Twitch o espera'); }
      case '/unraid': return Mod.call(c, 'DELETE', `raids?broadcaster_id=${c.id}`, null, 'Raid cancelado');
      case '/commercial': case '/ad': return Mod.call(c, 'POST', 'channels/commercial', { broadcaster_id: c.id, length: +args[0] || 60 }, 'Anuncios puestos');
      case '/title': return Mod.call(c, 'PATCH', `channels?broadcaster_id=${c.id}`, { title: rest }, 'Título cambiado').then(() => Chat.refreshInfo(c.login));
      case '/game': {
        const [g] = await Tw.get('search/categories?first=1&query=' + encodeURIComponent(rest));
        if (!g) return toast('No encuentro esa categoría', true);
        await Mod.call(c, 'PATCH', `channels?broadcaster_id=${c.id}`, { game_id: g.id }, 'Categoría: ' + g.name);
        return Chat.refreshInfo(c.login);
      }
      case '/marker': return Mod.call(c, 'POST', 'streams/markers', { user_id: c.id, description: rest.slice(0, 140) }, 'Marcador puesto');
      case '/clip': return Clip.make(c.login);
      case '/user': case '/usercard': return UserCard.open(a0, c.login, innerWidth / 2 - 190, 80);
      case '/block': return Mod.block(a0, true);
      case '/unblock': return Mod.block(a0, false);
      case '/poll': {
        const p = rest.split('|').map(s => s.trim()).filter(Boolean);
        if (p.length < 3) return toast('Así: /poll pregunta | opción 1 | opción 2', true);
        return Mod.call(c, 'POST', 'polls', { broadcaster_id: c.id, title: p[0].slice(0, 60), choices: p.slice(1, 6).map(t => ({ title: t.slice(0, 25) })), duration: 120 }, 'Encuesta abierta (2 min)');
      }
      case '/endpoll': {
        const [p] = await Tw.get(`polls?broadcaster_id=${c.id}&first=1`);
        if (!p || p.status !== 'ACTIVE') return toast('No hay encuesta abierta', true);
        return Mod.call(c, 'PATCH', 'polls', { broadcaster_id: c.id, id: p.id, status: 'TERMINATED' }, 'Encuesta acabada');
      }
      case '/w': case '/whisper': {
        const u = await Tw.user(a0); if (!u) return toast('No existe ' + a0, true);
        const r = await Tw.helix('POST', `whispers?from_user_id=${Me.id}&to_user_id=${u.id}`, { message: args.slice(1).join(' ') });
        return toast(r.status < 300 ? 'Susurro enviado' : Tw.why(r), r.status >= 300);
      }
      case '/help': case '/?':
        Chat.sys(c, 'Comandos: ' + Object.entries(this.list).map(([k, v]) => `${k} ${v}`).join(' · '));
        return;
    }
    toast('No conozco ' + cmd + ' (/help para la lista)', true);
  },
};
