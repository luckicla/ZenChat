'use strict';
// La tarjeta de usuario (como la de Chatterino): foto, seguidores, cuándo se
// creó la cuenta, desde cuándo te sigue, sub y meses, bloquear, timeouts,
// ban/unban, mod/VIP, shoutout, notas y sus mensajes en este canal.
const UserCard = (() => {
  const open_ = new Map(); // key → { el, login, ch, pinned }
  const TOS = [[1, '1s'], [30, '30s'], [60, '1m'], [300, '5m'], [1800, '30m'], [3600, '1h'], [86400, '1d'], [604800, '1w']];
  let z = 1;

  function close(key) { const c = open_.get(key); if (c) { c.el.remove(); open_.delete(key); } }
  function closeUnpinned(except) { for (const [k, c] of open_) if (!c.pinned && k !== except) close(k); }
  document.addEventListener('mousedown', e => {
    if (e.target.closest('.card') || e.target.closest('.nm,.mn,[data-user]') || e.target.closest('#ctx')) return;
    closeUnpinned();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { const last = [...open_.values()].pop(); if (last) close(last.key); } });

  async function open(login, chLogin, x, y) {
    login = String(login || '').toLowerCase().replace(/^@/, '');
    if (!login) return;
    const key = login + '@' + chLogin;
    if (open_.has(key)) { open_.get(key).el.style.zIndex = ++z; return; }
    closeUnpinned(key);
    const ch = Chat.chans.get(chLogin) || { login: chLogin, users: new Map(), id: '' };
    const el = h(`<div class="card" style="z-index:${++z}">
      <div class="cbar"><span class="cid"></span>
        <button class="sbtn pin" title="Fijar (no se cierra al hacer clic fuera)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9 3h6l-1 6 4 4H6l4-4zM12 13v8"/></svg></button>
        <button class="sbtn x" title="Cerrar (Esc)">✕</button></div>
      <div class="ctop"><img class="av" alt=""><div class="who"><div class="nm"></div><div class="wr fol">Seguidores: …</div><div class="wr cre">Creada: …</div><div class="wr fsince">…</div><div class="wr sub"></div><div class="wr badges"></div></div></div>
      <div class="opts"><label><input type="checkbox" class="blk"> Bloquear</label><label><input type="checkbox" class="nohl"> Ignorar menciones</label><label><input type="checkbox" class="ign"> Ocultar</label><span class="ln usercard">Usercard</span><span class="ln twitch">Twitch</span></div>
      <div class="modrow"><div class="grp"><small>Unban</small><div class="bts"><button class="unban" title="Quitar ban / timeout">✓</button></div></div>
        <div class="grp tos"><small>Timeouts</small><div class="bts">${TOS.map(([s, n]) => `<button data-to="${s}">${n}</button>`).join('')}</div></div>
        <div class="grp"><small>Ban</small><div class="bts"><button class="ban" title="Ban">⛔</button></div></div></div>
      <div class="acts"><button class="mod">Mod</button><button class="vip">VIP</button><button class="so">Shoutout</button><button class="warn">Aviso</button><button class="men">@ Mencionar</button><button class="cp">Copiar nombre</button></div>
      <textarea class="note" placeholder="Notas sobre esta persona (solo las ves tú)…"></textarea>
      <div class="htitle"><span>Mensajes en #${esc(chLogin)}</span><span class="hn"></span></div>
      <div class="hist"></div></div>`);
    $('cards').appendChild(el);
    const W = 390;
    el.style.left = Math.max(6, Math.min(x + 12, innerWidth - W - 10)) + 'px';
    el.style.top = Math.max(40, Math.min(y - 40, innerHeight - 480)) + 'px';
    const card = { key, el, login, ch: chLogin, pinned: false };
    open_.set(key, card);
    el.addEventListener('mousedown', () => { el.style.zIndex = ++z; });
    el.querySelector('.x').onclick = () => close(key);
    el.querySelector('.pin').onclick = e => { card.pinned = !card.pinned; e.currentTarget.classList.toggle('on', card.pinned); };
    drag(el, el.querySelector('.cbar'));

    // lo que ya sabemos sin preguntar
    const u0 = ch.users.get(login);
    paintHist(card);
    const nm = el.querySelector('.nm');
    nm.innerHTML = `<span style="color:${esc(u0 ? u0.color : 'var(--paper)')}">${esc(u0 ? u0.name : login)}</span>`;
    const lastMsg = u0 && u0.msgs[u0.msgs.length - 1];
    if (lastMsg) el.querySelector('.badges').innerHTML = lastMsg.badges.map(b => `<img src="${esc(b.url)}" title="${esc(b.title)}">`).join('');
    // opciones
    const ign = Cfg.ui('ignored', []), nohl = Cfg.ui('noHl', []);
    el.querySelector('.ign').checked = ign.includes(login);
    el.querySelector('.nohl').checked = nohl.includes(login);
    el.querySelector('.ign').onchange = e => { const l = Cfg.ui('ignored', []).filter(x => x !== login); if (e.target.checked) l.push(login); Cfg.setUi('ignored', l); toast(e.target.checked ? `No verás los mensajes de ${login}` : `Vuelves a ver a ${login}`); };
    el.querySelector('.nohl').onchange = e => { const l = Cfg.ui('noHl', []).filter(x => x !== login); if (e.target.checked) l.push(login); Cfg.setUi('noHl', l); };
    el.querySelector('.blk').onchange = e => Mod.block(login, e.target.checked);
    el.querySelector('.usercard').onclick = () => zen.open(`https://www.twitch.tv/popout/${chLogin}/viewercard/${login}`);
    el.querySelector('.twitch').onclick = () => zen.open('https://twitch.tv/' + login);
    nm.onclick = () => zen.open('https://twitch.tv/' + login);
    el.querySelectorAll('[data-to]').forEach(b => b.onclick = () => Mod.timeout(ch, login, +b.dataset.to));
    el.querySelector('.ban').onclick = () => Mod.ban(ch, login);
    el.querySelector('.unban').onclick = () => Mod.unban(ch, login);
    el.querySelector('.so').onclick = () => Mod.shoutout(ch, login);
    el.querySelector('.warn').onclick = () => { const r = prompt('Motivo del aviso para ' + login); if (r) Mod.warn(ch, login, r); };
    el.querySelector('.men').onclick = () => { const sp = Chat.focused(); if (sp) { sp.ta.value += (sp.ta.value && !/\s$/.test(sp.ta.value) ? ' ' : '') + '@' + login + ' '; sp.ta.focus(); } };
    el.querySelector('.cp').onclick = () => { zen.copy(login); toast('Copiado'); };
    const notes = Cfg.get('notes', {});
    const note = el.querySelector('.note');
    note.value = notes[login] || '';
    let nt; note.oninput = () => { clearTimeout(nt); nt = setTimeout(() => { const n = { ...Cfg.get('notes', {}) }; if (note.value.trim()) n[login] = note.value; else delete n[login]; Cfg.set('notes', n); }, 400); };
    if (!note.value) note.style.height = '28px'; else note.style.height = '52px';

    // lo de Twitch
    const u = await Tw.user(login);
    if (!open_.has(key)) return;
    if (!u) { el.querySelector('.fol').textContent = 'Esta cuenta no existe o está suspendida'; el.querySelector('.cre').textContent = ''; el.querySelector('.fsince').textContent = ''; return; }
    el.querySelector('.cid').textContent = 'ID: ' + u.id;
    el.querySelector('.av').src = u.profile_image_url;
    nm.innerHTML = `<span style="color:${esc(u0 ? u0.color : nameColor(login))}">${esc(u.display_name)}</span>${u.display_name.toLowerCase() !== login ? `<small>${esc(login)}</small>` : ''}${u.broadcaster_type === 'partner' ? '<small title="Partner">✔</small>' : ''}`;
    el.querySelector('.cre').innerHTML = `<em>Creada:</em> ${dateStr(u.created_at)} <em>(${since(u.created_at)})</em>`;
    Tw.helix('GET', `channels/followers?broadcaster_id=${u.id}&first=1`).then(r => {
      if (r.json && r.json.total !== undefined) el.querySelector('.fol').innerHTML = `<em>Seguidores:</em> ${fmtNum(r.json.total)}`;
      else el.querySelector('.fol').innerHTML = '<em>Seguidores:</em> ?';
    });
    if (login === chLogin) { el.querySelector('.fsince').textContent = 'Es el canal'; }
    else {
      // desde cuándo sigue y la sub: de ivr.fi (lo mismo que usa Chatterino)
      const r = await zen.get(`https://api.ivr.fi/v2/twitch/subage/${login}/${chLogin}`);
      const d = r && r.json;
      if (d && !d.error) {
        el.querySelector('.fsince').innerHTML = d.followedAt ? `<em>Te sigue desde</em> ${dateStr(d.followedAt)} <em>(${since(d.followedAt)})</em>` : '<em>No sigue el canal</em>';
        const cm = d.cumulative && d.cumulative.months, meta = d.meta;
        if (meta && meta.tier) {
          const how = meta.type === 'prime' ? 'Prime' : meta.type === 'gift' ? 'regalada' + (meta.giftMeta && meta.giftMeta.gifter ? ' por ' + meta.giftMeta.gifter.displayName : '') : 'pagada';
          el.querySelector('.sub').innerHTML = `★ Nivel ${esc(meta.tier)} · ${esc(how)} · <b>${cm || 1} meses</b>${d.streak && d.streak.months ? ` · racha ${d.streak.months}` : ''}`;
        } else if (cm) el.querySelector('.sub').innerHTML = `<em>Fue sub ${cm} meses</em>`;
        else if (d.statusHidden) el.querySelector('.sub').innerHTML = '<em>Sub oculta</em>';
      } else el.querySelector('.fsince').textContent = '';
    }
    // si eres mod/el canal: ¿está baneado? ¿es mod o VIP?
    if (ch.id && (ch.login === Me.login || ch.mod)) {
      Tw.get(`moderation/banned?broadcaster_id=${ch.id}&user_id=${u.id}`).then(([b]) => {
        if (b && open_.has(key)) el.querySelector('.sub').insertAdjacentHTML('beforeend', `<div style="color:#ff8f8f">${b.expires_at ? 'En timeout hasta ' + fmtTime(b.expires_at) : 'Baneado'}${b.reason ? ': ' + esc(b.reason) : ''}</div>`);
      });
      if (ch.login === Me.login) {
        Tw.get(`moderation/moderators?broadcaster_id=${ch.id}&user_id=${u.id}`).then(d => setRole(el, ch, login, 'mod', d.length > 0));
        Tw.get(`channels/vips?broadcaster_id=${ch.id}&user_id=${u.id}`).then(d => setRole(el, ch, login, 'vip', d.length > 0));
      }
    }
    Tw.get('users/blocks?broadcaster_id=' + Me.id + '&first=100').then(d => { if (open_.has(key)) el.querySelector('.blk').checked = d.some(x => x.user_login === login); });
  }
  function setRole(el, ch, login, kind, on) {
    const b = el.querySelector('.' + kind);
    b.classList.toggle('on', on);
    b.textContent = (on ? '✓ ' : '') + (kind === 'mod' ? 'Mod' : 'VIP');
    b.onclick = async () => { const now = !b.classList.contains('on'); if (await Mod.role(ch, login, kind, now)) setRole(el, ch, login, kind, now); };
  }
  function paintHist(card) {
    const ch = Chat.chans.get(card.ch);
    const u = ch && ch.users.get(card.login);
    const box = card.el.querySelector('.hist');
    const msgs = (u && u.msgs) || [];
    card.el.querySelector('.hn').textContent = msgs.length ? msgs.length + (msgs.length === 1 ? ' mensaje' : ' mensajes') : '';
    box.innerHTML = '';
    if (!msgs.length) { box.innerHTML = '<div class="none">No ha escrito nada desde que abriste el chat.</div>'; return; }
    for (const m of msgs) box.appendChild(Chat.render(m));
    box.scrollTop = box.scrollHeight;
  }
  function newMsg(chLogin, m) {
    const c = open_.get(m.login + '@' + chLogin);
    if (c) paintHist(c);
  }
  function refresh(login) { for (const c of open_.values()) if (c.login === login) paintHist(c); }
  function drag(el, handle) {
    handle.addEventListener('mousedown', e => {
      if (e.target.closest('button')) return;
      const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      const mv = ev => { el.style.left = Math.max(0, Math.min(innerWidth - 60, ev.clientX - dx)) + 'px'; el.style.top = Math.max(0, Math.min(innerHeight - 30, ev.clientY - dy)) + 'px'; };
      const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
      e.preventDefault();
    });
  }
  return { open, newMsg, refresh };
})();
