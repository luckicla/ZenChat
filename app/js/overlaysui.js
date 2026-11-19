'use strict';
// OBS: los overlays (alertas, chat, objetivos, últimos eventos, textos), con
// su enlace y un botón que los mete solos en OBS (por obs-websocket).
const OBS = (() => {
  let ws = null, ready = null, reqN = 0;
  const pend = new Map();
  async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return btoa(String.fromCharCode(...new Uint8Array(b))); }
  function connect() {
    const o = Cfg.get('obs', {}) || {};
    if (ready) return ready;
    ready = new Promise((ok, fail) => {
      try { ws = new WebSocket(`ws://${o.host || '127.0.0.1'}:${o.port || 4455}`); } catch (e) { ready = null; fail(e); return; }
      const t = setTimeout(() => { fail(new Error('OBS no contesta: ¿está abierto y con el servidor WebSocket activado?')); try { ws.close(); } catch {} }, 5000);
      ws.onmessage = async e => {
        const m = JSON.parse(e.data);
        if (m.op === 0) {
          const d = { rpcVersion: 1 };
          if (m.d.authentication) {
            if (!o.password) { clearTimeout(t); fail(new Error('OBS pide contraseña: ponla aquí abajo')); return; }
            d.authentication = await sha((await sha(o.password + m.d.authentication.salt)) + m.d.authentication.challenge);
          }
          ws.send(JSON.stringify({ op: 1, d }));
        } else if (m.op === 2) { clearTimeout(t); ok(true); }
        else if (m.op === 7) { const p = pend.get(m.d.requestId); if (p) { pend.delete(m.d.requestId); m.d.requestStatus.result ? p.ok(m.d.responseData || {}) : p.fail(Object.assign(new Error(m.d.requestStatus.comment || 'OBS dijo que no'), { code: m.d.requestStatus.code })); } }
      };
      ws.onclose = e => { clearTimeout(t); ready = null; if (e.code === 4009) fail(new Error('La contraseña de OBS no es esa')); else fail(new Error('No se pudo conectar con OBS')); };
      ws.onerror = () => {};
    });
    ready.catch(() => { ready = null; });
    return ready;
  }
  async function req(type, data) {
    await connect();
    const id = 'z' + (++reqN);
    return new Promise((ok, fail) => { pend.set(id, { ok, fail }); ws.send(JSON.stringify({ op: 6, d: { requestType: type, requestId: id, requestData: data || {} } })); setTimeout(() => { if (pend.has(id)) { pend.delete(id); fail(new Error('OBS no contesta')); } }, 8000); });
  }
  // mete (o actualiza) una fuente de navegador en la escena que se ve
  async function addBrowser(name, url, w, hgt, scene) {
    let sceneName = scene;
    if (!sceneName) { const sc = await req('GetCurrentProgramScene'); sceneName = sc.currentProgramSceneName || sc.sceneName; }
    const inputSettings = { url, width: w, height: hgt, reroute_audio: true, shutdown: false, restart_when_active: false, css: 'body { background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; }' };
    try {
      await req('CreateInput', { sceneName, inputName: name, inputKind: 'browser_source', inputSettings, sceneItemEnabled: true });
      return `«${name}» añadida a la escena «${sceneName}»`;
    } catch (e) {
      if (e.code !== 601) throw e; // ya existía: se le pone el enlace bueno
      await req('SetInputSettings', { inputName: name, inputSettings });
      try { await req('CreateSceneItem', { sceneName, sourceName: name }); } catch {}
      return `«${name}» ya estaba: actualizada${sceneName ? ' (escena «' + sceneName + '»)' : ''}`;
    }
  }
  async function scenes() { const r = await req('GetSceneList'); return { list: (r.scenes || []).map(x => x.sceneName).reverse(), current: r.currentProgramSceneName }; }
  async function inputs() { const r = await req('GetInputList', { inputKind: 'browser_source' }); return r.inputs || []; }
  async function remove(name) { await req('RemoveInput', { inputName: name }); }
  const connected = () => !!ready;
  return { connect, req, addBrowser, scenes, inputs, remove, connected, reset() { try { ws && ws.close(); } catch {} ready = null; } };
})();

const OverlaysUI = (() => {
  const BASE = 'http://127.0.0.1:47830';
  let clients = {}, obsInfo = null, editing = null;
  zen.onClients(c => { clients = c; if (!$('page-overlays').hidden) paintStatus(); });
  const BOTS = 'nightbot,streamelements,streamlabs,moobot,fossabot,wizebot';
  const KIND = {
    chat: { name: 'Chat', icon: '💬', w: 420, h: 720, desc: 'Un recuadro con el chat de un canal' },
    alerts: { name: 'Alertas', icon: '🔔', w: 1920, h: 1080, desc: 'Las alertas (todas o solo algunas)' },
    feed: { name: 'Últimos eventos', icon: '☰', w: 360, h: 300, desc: 'Lista de follows, subs, bits…' },
    label: { name: 'Texto', icon: 'T', w: 600, h: 60, desc: 'El último follow, sub, bits…' },
  };
  const def = type => ({
    chat: { channel: '', fs: 20, font: 'inter', fade: 0, max: 30, style: 'glass', bga: 0.55, badges: true, hideCmds: true, hideBots: BOTS, dir: 'bottom', textColor: '#ffffff', gap: 4 },
    alerts: { types: [], pos: 'center', scale: 1 },
    feed: { max: 5, types: [], fs: 18 },
    label: { t: 'follow', prefix: 'Último follow:', fs: 28 },
  }[type]);
  const list = () => Cfg.get('widgets', []) || [];
  const save = l => Cfg.set('widgets', l);
  function seed() {
    if (list().length) return;
    const cb = Cfg.get('chatbox') || {};
    save([
      { id: 'alertas', type: 'alerts', name: 'Alertas', ...def('alerts') },
      { id: 'chat', type: 'chat', name: 'Chat', ...def('chat'), ...cb },
    ]);
  }
  function url(w, preview) {
    const q = new URLSearchParams({ id: w.id });
    if (w.type === 'feed') { q.set('max', w.max || 5); if (w.types && w.types.length) q.set('t', w.types.join(',')); if (w.fs) q.set('fs', w.fs); }
    if (w.type === 'label') { q.set('t', w.t || 'follow'); q.set('p', w.prefix || ''); if (w.fs) q.set('fs', w.fs); }
    if (preview) { q.set('preview', '1'); if (w.type === 'alerts') q.set('w', 'preview-' + w.id); }
    return `${BASE}/${w.type === 'alerts' ? 'alerts' : w.type}?${q}`;
  }
  const obsName = w => 'ZenChat · ' + w.name;

  function open() {
    seed();
    const p = $('page-overlays');
    p.innerHTML = `
      <div class="ph"><div><h2>OBS</h2><p>Crea recuadros (chat, alertas, eventos…) y mételos en OBS. Cada uno es una fuente <b>Navegador</b> aparte que puedes mover y escalar.</p></div>
        <div style="display:flex;gap:8px"><button class="btn" id="wNew">+ Nuevo recuadro</button></div></div>
      <div class="obsbar" id="obsBar"></div>
      <div class="wgrid" id="wGrid"></div>
      <div class="sec">Objetivos</div>
      <div class="box"><div class="row"><div class="lb"><b>Barras de objetivo</b><small>Follows, subs, bits, canjes o a mano. Suben solas con los eventos del directo.</small></div><button class="btn sm ghost" id="gAdd">+ Objetivo</button></div><div class="vars" id="gList" style="padding-bottom:10px"></div></div>`;
    $('wNew').onclick = e => {
      const r = e.currentTarget.getBoundingClientRect();
      ctxMenu(r.left, r.bottom + 4, Object.entries(KIND).map(([k, v]) => ({ label: `${v.icon}  ${v.name} — ${v.desc}`, fn: () => create(k) })));
    };
    $('gAdd').onclick = () => { const g = Cfg.get('goals', []).slice(); g.push({ id: 'g' + Date.now().toString(36), title: 'Objetivo de follows', type: 'follows', target: 50, start: 0, a1: '#a99bff', a2: '#5cc8ff', font: 'inter' }); Cfg.set('goals', g); paintGoals(); };
    paintObs();
    paintGrid();
    paintGoals();
    tryObs();
  }
  function create(type) {
    const n = list().filter(w => w.type === type).length;
    const w = { id: type + '-' + Date.now().toString(36), type, name: KIND[type].name + (n ? ' ' + (n + 1) : ''), ...def(type) };
    save([...list(), w]);
    editing = w.id;
    paintGrid();
  }

  /* --- OBS --- */
  async function tryObs(manual) {
    const o = Cfg.get('obs', {}) || {};
    if (!manual && !o.password && !o.tried) { paintObs(); return; }
    obsInfo = { state: 'connecting' }; paintObs();
    try {
      await OBS.connect();
      const v = await OBS.req('GetVersion');
      const sc = await OBS.scenes();
      const ins = await OBS.inputs();
      obsInfo = { state: 'on', version: v.obsVersion, scenes: sc.list, current: sc.current, inputs: ins.map(x => x.inputName) };
      Cfg.set('obs', { ...o, tried: true });
    } catch (e) { obsInfo = { state: 'off', msg: e.message }; }
    paintObs(); paintGrid();
  }
  function paintObs() {
    const o = Cfg.get('obs', {}) || {};
    const st = obsInfo ? obsInfo.state : 'off';
    const scene = Cfg.ui('obsScene', '');
    $('obsBar').innerHTML = `
      <div class="ob-st ${st}"><i></i><div><b>${st === 'on' ? 'Conectado a OBS ' + esc(obsInfo.version || '') : st === 'connecting' ? 'Conectando con OBS…' : 'OBS sin conectar'}</b>
        <small>${st === 'on' ? 'Los recuadros se añaden a la escena elegida' : esc((obsInfo && obsInfo.msg) || 'Conecta ZenChat con OBS para meter y quitar los recuadros con un clic')}</small></div></div>
      ${st === 'on' ? `<label class="ob-sc">Escena <select class="inp" id="obScene"><option value="">La que esté en directo${obsInfo.current ? ' (' + esc(obsInfo.current) + ')' : ''}</option>${obsInfo.scenes.map(x => `<option${x === scene ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>` : ''}
      <button class="btn sm ${st === 'on' ? 'ghost' : ''}" id="obGo">${st === 'on' ? 'Volver a conectar' : 'Conectar'}</button>
      <button class="btn sm ghost" id="obCfg">Ajustes</button>
      <div class="ob-cfg" id="obForm" ${st === 'on' ? 'hidden' : ''}>
        <div class="hint">En OBS: <b>Herramientas → Ajustes del servidor WebSocket</b> → marca «Habilitar servidor WebSocket» y copia la contraseña de «Mostrar información de conexión».</div>
        <div class="row"><div class="lb"><b>Dirección y puerto</b></div><input class="inp" id="oHost" value="${esc(o.host || '127.0.0.1')}"><input class="inp s" id="oPort" value="${esc(o.port || 4455)}"></div>
        <div class="row"><div class="lb"><b>Contraseña</b></div><input class="inp" type="password" id="oPass" value="${esc(o.password || '')}" placeholder="la de OBS"></div>
      </div>`;
    const setO = () => { Cfg.set('obs', { ...o, host: $('oHost').value.trim(), port: +$('oPort').value || 4455, password: $('oPass').value }); OBS.reset(); };
    ['oHost', 'oPort', 'oPass'].forEach(id => { const el = $(id); if (el) el.onchange = setO; });
    $('obGo').onclick = () => { if ($('oHost')) setO(); OBS.reset(); tryObs(true); };
    $('obCfg').onclick = () => { $('obForm').hidden = !$('obForm').hidden; };
    if ($('obScene')) $('obScene').onchange = e => Cfg.setUi('obsScene', e.target.value);
  }

  /* --- recuadros --- */
  function paintGrid() {
    const g = $('wGrid'); if (!g) return;
    g.innerHTML = list().map(w => {
      const k = KIND[w.type];
      const inObs = obsInfo && obsInfo.state === 'on' && obsInfo.inputs.includes(obsName(w));
      const pv = w.type === 'chat' ? `<iframe src="${esc(url(w, true))}" tabindex="-1" style="width:100%;height:100%"></iframe>`
        : w.type === 'alerts' ? `<iframe class="scale" src="${esc(url(w, true))}" tabindex="-1"></iframe>`
        : `<iframe src="${esc(url(w, true))}" tabindex="-1" style="width:100%;height:100%"></iframe>`;
      return `<div class="wc${editing === w.id ? ' open' : ''}" data-id="${esc(w.id)}">
        <div class="wpv wpv-${w.type}">${pv}<span class="wtag">${k.icon} ${k.name}</span></div>
        <div class="wbody">
          <div class="wtop"><input class="wname" value="${esc(w.name)}" aria-label="Nombre del recuadro"><span class="won" data-st="${esc(w.type === 'alerts' ? 'alerts' : w.type)}:${esc(w.id)}">● sin abrir</span></div>
          <div class="wurl"><input class="inp" readonly value="${esc(url(w))}"><button class="btn sm ghost" data-a="copy">Copiar</button></div>
          <div class="wbtns">
            ${inObs ? `<button class="btn sm ghost" data-a="obs">Actualizar en OBS</button><button class="btn sm ghost" data-a="unobs">Quitar de OBS</button>` : `<button class="btn sm" data-a="obs">Añadir a OBS</button>`}
            ${w.type === 'alerts' ? '<button class="btn sm ghost" data-a="test">Probar</button>' : w.type === 'chat' ? '<button class="btn sm ghost" data-a="test">Mensaje de prueba</button>' : ''}
            <button class="btn sm ghost" data-a="edit">${editing === w.id ? 'Cerrar' : 'Editar'}</button>
            <button class="btn sm ghost danger-t" data-a="del" title="Borrar el recuadro">✕</button>
          </div>
          ${editing === w.id ? `<div class="wed">${editor(w)}</div>` : ''}
        </div></div>`;
    }).join('') + `<button class="wadd" id="wAdd2"><b>+</b>Nuevo recuadro<small>Chat, alertas, eventos o texto</small></button>`;
    $('wAdd2').onclick = e => $('wNew').click();
    g.querySelectorAll('iframe.scale').forEach(f => { const box = f.parentElement; const fit = () => { if (!box.isConnected) return; f.style.transform = `scale(${box.clientWidth / 1920})`; }; fit(); new ResizeObserver(fit).observe(box); });
    g.querySelectorAll('.wc').forEach(card => bindCard(card));
    paintStatus();
  }
  const upd = (id, patch, repaint) => { save(list().map(w => w.id === id ? { ...w, ...patch } : w)); if (repaint) paintGrid(); };
  function bindCard(card) {
    const id = card.dataset.id;
    const w = () => list().find(x => x.id === id);
    card.querySelector('.wname').onchange = e => upd(id, { name: e.target.value.trim() || KIND[w().type].name }, true);
    card.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
      const a = b.dataset.a, x = w();
      if (a === 'copy') { zen.copy(url(x)); toast('Enlace copiado'); }
      if (a === 'edit') { editing = editing === id ? null : id; paintGrid(); }
      if (a === 'del') { if (confirm(`¿Borrar «${x.name}»?`)) { save(list().filter(y => y.id !== id)); paintGrid(); } }
      if (a === 'test') {
        if (x.type === 'alerts') { const types = x.types && x.types.length ? x.types : ['follow', 'sub', 'cheer', 'raid']; zen.overlay('alert', ZenAlerts.sample(types[Math.floor(Math.random() * types.length)], Me.name || 'ZenTester'), 'preview-' + id); }
        else zen.overlay('chat', { ch: (x.channel || Me.login || '').toLowerCase(), id: 't' + Date.now(), login: 'zentester', name: 'ZenTester', color: '#a99bff', badges: [], parts: [{ t: 'text', v: 'Hola chat, esto es una prueba de ZenChat ' }, { t: 'emote', v: 'Kappa', url: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0' }], text: 'prueba' }, 'chat');
      }
      if (a === 'obs' || a === 'unobs') {
        b.disabled = true;
        try {
          if (!OBS.connected()) await tryObs(true);
          if (a === 'obs') toast(await OBS.addBrowser(obsName(x), url(x), x.wpx || KIND[x.type].w, x.hpx || KIND[x.type].h, Cfg.ui('obsScene', '')));
          else { await OBS.remove(obsName(x)); toast(`«${obsName(x)}» quitada de OBS`); }
          const ins = await OBS.inputs(); if (obsInfo) obsInfo.inputs = ins.map(i => i.inputName);
          paintGrid();
        } catch (e) { toast(e.message, true); b.disabled = false; }
      }
    });
    const ed = card.querySelector('.wed');
    if (!ed) return;
    ed.querySelectorAll('[data-go]').forEach(b => b.onclick = () => App.view(b.dataset.go));
    ed.querySelectorAll('[data-k]').forEach(el => {
      const k = el.dataset.k;
      const ev = el.tagName === 'SELECT' || el.type === 'color' || el.type === 'text' || el.type === 'number' ? 'change' : 'input';
      el.addEventListener(el.type === 'range' || el.type === 'color' ? 'input' : ev, () => {
        let v = el.type === 'range' || el.type === 'number' ? +el.value : el.value;
        if (k === 'channel') v = String(v).trim().toLowerCase().replace(/^.*twitch\.tv\//, '');
        upd(id, { [k]: v });
        const o = el.parentElement.querySelector('output'); if (o) o.textContent = el.dataset.u ? v + el.dataset.u : v;
        if (['wpx', 'hpx', 'channel', 't', 'prefix', 'max', 'fs'].includes(k) && el.type !== 'range') paintGrid();
      });
    });
    ed.querySelectorAll('.seg[data-k]').forEach(sg => sg.onclick = e => { const b = e.target.closest('button'); if (!b) return; sg.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b)); upd(id, { [sg.dataset.k]: b.dataset.v }); });
    ed.querySelectorAll('.sw[data-k]').forEach(el => sw(el, !!w()[el.dataset.k], v => upd(id, { [el.dataset.k]: v })));
    const tl = ed.querySelector('.tlist');
    if (tl) tl.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      let t = (w().types || []).slice();
      if (b.dataset.t === '*') t = []; else { t = t.includes(b.dataset.t) ? t.filter(x => x !== b.dataset.t) : [...t, b.dataset.t]; }
      upd(id, { types: t }); tl.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x.dataset.t === '*' ? !t.length : t.includes(x.dataset.t)));
      if (w().type === 'feed') paintGrid();
    };
  }
  function editor(w) {
    const r = (label, ctl, small) => `<div class="row"><div class="lb"><b>${label}</b>${small ? `<small>${small}</small>` : ''}</div>${ctl}</div>`;
    const rng = (k, min, max, step, u = '') => `<input type="range" data-k="${k}" ${u ? `data-u="${u}"` : ''} min="${min}" max="${max}" step="${step}" value="${w[k]}"><output>${w[k]}${u}</output>`;
    const seg = (k, opts) => `<div class="seg" data-k="${k}">${opts.map(([v, n]) => `<button data-v="${v}" class="${String(w[k]) === String(v) ? 'sel' : ''}">${n}</button>`).join('')}</div>`;
    const types = (sel, only) => `<div class="tlist chips2"><button data-t="*" class="${!(sel || []).length ? 'sel' : ''}">Todas</button>${ZenAlerts.TYPES.filter(t => !only || only.includes(t.id)).map(t => `<button data-t="${t.id}" class="${(sel || []).includes(t.id) ? 'sel' : ''}">${t.icon} ${esc(t.name)}</button>`).join('')}</div>`;
    const size = r('Tamaño en OBS', `<input class="inp s" type="number" data-k="wpx" value="${w.wpx || KIND[w.type].w}"> × <input class="inp s" type="number" data-k="hpx" value="${w.hpx || KIND[w.type].h}">`, 'Ancho × alto de la fuente (luego la puedes escalar en OBS)');
    if (w.type === 'chat') return [
      r('Canal', `<input class="inp" type="text" data-k="channel" value="${esc(w.channel || '')}" placeholder="${esc(Me.login || 'tu canal')}">`, 'Vacío = el tuyo'),
      r('Estilo', seg('style', [['glass', 'Cristal'], ['boxes', 'Cajas'], ['shadow', 'Solo texto']])),
      r('Letra', `<select class="inp" data-k="font">${Object.entries(ZenAlerts.FONT_NAMES).map(([k, n]) => `<option value="${k}"${w.font === k ? ' selected' : ''}>${n}</option>`).join('')}</select>${rng('fs', 12, 48, 1, 'px')}`),
      r('Opacidad del fondo', rng('bga', 0, 1, 0.05)),
      r('Color del texto', `<input type="color" data-k="textColor" value="${esc(w.textColor || '#ffffff')}">`),
      r('Desaparecer', rng('fade', 0, 120, 5, 's'), 'Segundos que se queda cada mensaje (0 = no se van)'),
      r('Máximo de mensajes', rng('max', 5, 60, 1)),
      r('Los nuevos', seg('dir', [['bottom', 'Abajo'], ['top', 'Arriba']])),
      r('Insignias', '<button class="sw" data-k="badges"></button>'),
      r('Esconder comandos', '<button class="sw" data-k="hideCmds"></button>', 'Los mensajes que empiezan por !'),
      r('Esconder bots', `<input class="inp w" type="text" data-k="hideBots" value="${esc(w.hideBots || '')}">`),
      size].join('');
    if (w.type === 'alerts') return [
      r('Qué alertas enseña', '', 'Todas, o solo las que marques: así puedes tener, por ejemplo, un recuadro para subs y otro para los canjes'),
      `<div style="padding:0 0 10px">${types(w.types)}</div>`,
      r('Dónde salen', seg('pos', [['center', 'Centro'], ['top', 'Arriba'], ['bottom', 'Abajo'], ['left', 'Izquierda'], ['right', 'Derecha']])),
      r('Tamaño', rng('scale', 0.4, 2, 0.05, '×')),
      r('Cómo se ven', '<button class="btn sm ghost" data-go="alerts">Editar las alertas</button>', 'Texto, imagen, sonido y animación de cada tipo'),
      size].join('');
    if (w.type === 'feed') return [
      r('Cuántos', rng('max', 1, 15, 1)),
      r('Tamaño de letra', rng('fs', 12, 40, 1, 'px')),
      r('Qué eventos', '', ''), `<div style="padding:0 0 10px">${types(w.types, ['follow', 'sub', 'resub', 'gift', 'cheer', 'raid', 'points', 'charity'])}</div>`,
      size].join('');
    if (w.type === 'label') return [
      r('Qué enseña', `<select class="inp" data-k="t">${[['follow', 'Último follow'], ['sub', 'Última sub'], ['gift', 'Último regalo de subs'], ['cheer', 'Últimos bits'], ['raid', 'Último raid'], ['points', 'Último canje']].map(([k, n]) => `<option value="${k}"${w.t === k ? ' selected' : ''}>${n}</option>`).join('')}</select>`),
      r('Texto delante', `<input class="inp" type="text" data-k="prefix" value="${esc(w.prefix || '')}">`),
      r('Tamaño de letra', `<input class="inp s" type="number" data-k="fs" value="${w.fs || 28}">`),
      size].join('');
    return '';
  }
  function paintStatus() {
    document.querySelectorAll('[data-st]').forEach(el => {
      const n = clients[el.dataset.st] || 0;
      el.className = 'won' + (n ? ' on' : '');
      el.textContent = n ? `● en OBS${n > 1 ? ' ×' + n : ''}` : '● sin abrir';
    });
  }
  function paintGoals() {
    const goals = Cfg.get('goals', []), counts = Cfg.get('goalCounts', {});
    const T = [['follows', 'Follows'], ['subs', 'Subs'], ['bits', 'Bits'], ['points', 'Canjes'], ['raiders', 'Gente de raids'], ['custom', 'A mano']];
    $('gList').innerHTML = goals.map((g, i) => {
      const cur = (+g.start || 0) + (+counts[g.id] || 0);
      const u = BASE + '/goal?id=' + g.id;
      return `<div class="var" data-i="${i}"><input class="inp" style="flex:1;min-width:150px" data-k="title" value="${esc(g.title)}">
        <select class="inp" data-k="type">${T.map(([k, n]) => `<option value="${k}"${g.type === k ? ' selected' : ''}>${n}</option>`).join('')}</select>
        <span style="font-size:12px">${cur} /</span><input class="inp s" type="number" data-k="target" value="${g.target}">
        <small style="color:var(--muted)">empieza en</small><input class="inp s" type="number" data-k="start" value="${g.start || 0}">
        <input type="color" data-k="a1" value="${g.a1}"><input type="color" data-k="a2" value="${g.a2}">
        <button class="btn sm ghost" data-plus="1">+1</button><button class="btn sm ghost" data-plus="-1">−1</button><button class="btn sm ghost" data-reset>Reiniciar</button>
        <button class="btn sm ghost" data-copy="${esc(u)}">Copiar enlace</button><button class="btn sm" data-obs="${esc('ZenChat · ' + g.title)}|${esc(u)}|800|90">Añadir a OBS</button><button class="btn sm danger" data-del>✕</button></div>`;
    }).join('') || '<p style="color:var(--muted);font-size:12px;margin:4px 0 8px">Aún no hay ninguno.</p>';
    $('gList').querySelectorAll('.var').forEach(row => {
      const i = +row.dataset.i;
      const updG = (k, v) => { const g = Cfg.get('goals', []).slice(); g[i] = { ...g[i], [k]: v }; Cfg.set('goals', g); };
      row.querySelectorAll('[data-k]').forEach(el => el.onchange = () => updG(el.dataset.k, el.type === 'number' ? +el.value : el.value));
      row.querySelectorAll('[data-plus]').forEach(b => b.onclick = () => { const c = { ...Cfg.get('goalCounts', {}) }; const id = Cfg.get('goals')[i].id; c[id] = (+c[id] || 0) + +b.dataset.plus; Cfg.set('goalCounts', c); Events.overlayState(); paintGoals(); });
      row.querySelector('[data-reset]').onclick = () => { const c = { ...Cfg.get('goalCounts', {}) }; delete c[Cfg.get('goals')[i].id]; Cfg.set('goalCounts', c); Events.overlayState(); paintGoals(); };
      row.querySelector('[data-del]').onclick = () => { const g = Cfg.get('goals', []).slice(); g.splice(i, 1); Cfg.set('goals', g); paintGoals(); };
      row.querySelector('[data-copy]').onclick = e => { zen.copy(e.target.dataset.copy); toast('Enlace copiado'); };
      row.querySelector('[data-obs]').onclick = async e => { const [n, u2, w2, h2] = e.target.dataset.obs.split('|'); try { if (!OBS.connected()) await tryObs(true); toast(await OBS.addBrowser(n, u2, +w2, +h2, Cfg.ui('obsScene', ''))); } catch (er) { toast(er.message, true); } };
    });
  }
  return { open };
})();
