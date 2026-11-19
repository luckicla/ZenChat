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
  async function addBrowser(name, url, w, hgt) {
    const sc = await req('GetCurrentProgramScene');
    const sceneName = sc.currentProgramSceneName || sc.sceneName;
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
  return { connect, req, addBrowser, reset() { try { ws && ws.close(); } catch {} ready = null; } };
})();

const OverlaysUI = (() => {
  const BASE = 'http://127.0.0.1:47830';
  let clients = {};
  zen.onClients(c => { clients = c; const p = $('page-overlays'); if (p && !p.hidden) paintStatus(); });
  const save = (k, v) => Cfg.set(k, v);
  const chatDefaults = { fs: 20, font: 'inter', fade: 0, max: 30, style: 'shadow', bga: 0.62, badges: true, hideCmds: true, hideBots: 'nightbot,streamelements,streamlabs,moobot,fossabot,wizebot', dir: 'bottom', textColor: '#ffffff', gap: 4, channel: '' };

  function card(id, title, desc, url, w, hgt, extra = '') {
    return `<div class="ovc" data-w="${id}"><h3>${title}<span class="on no" data-st="${id}">● sin abrir</span></h3><p>${desc}</p>
      <div class="url"><input class="inp" readonly value="${esc(url)}"><button class="btn sm ghost" data-copy="${esc(url)}">Copiar</button></div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><button class="btn sm" data-obs="${esc(title)}|${esc(url)}|${w}|${hgt}">Añadir a OBS</button><span style="color:var(--muted);font-size:11px">${w}×${hgt}</span>${extra}</div></div>`;
  }
  function open() {
    const cb = { ...chatDefaults, ...(Cfg.get('chatbox') || {}) };
    const o = Cfg.get('obs', {}) || {};
    const p = $('page-overlays');
    p.innerHTML = `
      <div class="ph"><div><h2>OBS</h2><p>Cada cosa es una fuente <b>Navegador</b> en OBS. Con «Añadir a OBS» se mete sola en la escena que tengas puesta.</p></div></div>
      <div class="ovl">
        ${card('alerts', 'ZenChat · Alertas', 'Follows, subs, bits, raids, puntos… con su sonido. Ponla encima de todo. Marca «Controlar audio mediante OBS» si quieres su volumen en el mezclador.', BASE + '/alerts', 1920, 1080)}
        ${card('chat', 'ZenChat · Chat', 'Tu chat en pantalla con emotes de 7TV, BTTV y FFZ. Lo de abajo cambia cómo se ve.', BASE + '/chat', 420, 720)}
        ${card('feed', 'ZenChat · Eventos', 'Los últimos follows, subs, bits… en lista. <span class="code-i">?max=5&t=follow,sub</span> para elegir.', BASE + '/feed?max=5', 360, 300)}
        ${card('label', 'ZenChat · Último follow', 'Un texto con el último follow. Cambia <span class="code-i">t=</span> a sub, gift, cheer, raid o points.', BASE + '/label?t=follow&p=' + encodeURIComponent('Último follow:'), 600, 60)}
      </div>
      <div class="sec">Objetivos</div>
      <div class="box"><div class="row"><div class="lb"><b>Barras de objetivo</b><small>Seguidores, subs, bits, canjes o a mano. Suben solas con los eventos del directo.</small></div><button class="btn sm ghost" id="gAdd">+ Objetivo</button></div><div class="vars" id="gList" style="padding-bottom:10px"></div></div>
      <div class="sec">Chat en pantalla</div>
      <div class="box">
        <div class="row"><div class="lb"><b>Canal</b><small>Vacío = el tuyo</small></div><input class="inp" id="cbCh" value="${esc(cb.channel || '')}" placeholder="${esc(Me.login || 'tu canal')}"></div>
        <div class="row"><div class="lb"><b>Estilo</b></div><div class="seg" id="cbStyle">${[['shadow', 'Texto con sombra'], ['boxes', 'Cajas'], ['glass', 'Cristal']].map(([k, n]) => `<button data-v="${k}" class="${cb.style === k ? 'sel' : ''}">${n}</button>`).join('')}</div></div>
        <div class="row"><div class="lb"><b>Letra</b></div><select class="inp" id="cbFont">${Object.entries(ZenAlerts.FONT_NAMES).map(([k, n]) => `<option value="${k}"${cb.font === k ? ' selected' : ''}>${n}</option>`).join('')}</select><input type="range" min="12" max="48" id="cbFs" value="${cb.fs}"><span id="cbFsV">${cb.fs}px</span></div>
        <div class="row"><div class="lb"><b>Desaparecer</b><small>Segundos que se queda cada mensaje (0 = no se van)</small></div><input type="range" min="0" max="120" step="5" id="cbFade" value="${cb.fade}"><span id="cbFadeV">${cb.fade || 'nunca'}${cb.fade ? 's' : ''}</span></div>
        <div class="row"><div class="lb"><b>Opacidad de las cajas</b></div><input type="range" min="0" max="1" step="0.05" id="cbBga" value="${cb.bga}"></div>
        <div class="row"><div class="lb"><b>Color del texto</b></div><input type="color" id="cbTc" value="${cb.textColor}"></div>
        <div class="row"><div class="lb"><b>Insignias</b></div><button class="sw" id="cbBadges"></button></div>
        <div class="row"><div class="lb"><b>Esconder comandos</b><small>Los mensajes que empiezan por !</small></div><button class="sw" id="cbCmds"></button></div>
        <div class="row"><div class="lb"><b>Esconder bots</b></div><input class="inp w" id="cbBots" value="${esc(cb.hideBots)}"></div>
        <div class="row"><div class="lb"><b>Los nuevos</b></div><div class="seg" id="cbDir"><button data-v="bottom" class="${cb.dir !== 'top' ? 'sel' : ''}">Abajo</button><button data-v="top" class="${cb.dir === 'top' ? 'sel' : ''}">Arriba</button></div><button class="btn sm ghost" id="cbTest">Mensaje de prueba</button></div>
      </div>
      <div class="sec">Conexión con OBS</div>
      <div class="box">
        <div class="hint">En OBS: <b>Herramientas → Ajustes del servidor WebSocket</b> → marca «Habilitar servidor WebSocket». Copia aquí la contraseña («Mostrar información de conexión»).</div>
        <div class="row"><div class="lb"><b>Dirección y puerto</b></div><input class="inp" id="oHost" value="${esc(o.host || '127.0.0.1')}"><input class="inp s" id="oPort" value="${esc(o.port || 4455)}"></div>
        <div class="row"><div class="lb"><b>Contraseña</b></div><input class="inp" type="password" id="oPass" value="${esc(o.password || '')}"><button class="btn sm ghost" id="oTest">Probar</button><span id="oRes" style="font-size:12px;color:var(--muted)"></span></div>
      </div>`;
    p.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { zen.copy(b.dataset.copy); toast('Enlace copiado'); });
    p.querySelectorAll('[data-obs]').forEach(b => b.onclick = async () => {
      const [name, url, w, hgt] = b.dataset.obs.split('|');
      b.disabled = true;
      try { toast(await OBS.addBrowser(name, url, +w, +hgt)); } catch (e) { toast(e.message, true); }
      b.disabled = false;
    });
    // chat
    const setCb = (k, v) => { const c = { ...chatDefaults, ...(Cfg.get('chatbox') || {}), [k]: v }; save('chatbox', c); };
    $('cbCh').onchange = e => setCb('channel', e.target.value.trim().toLowerCase());
    for (const [id, k] of [['cbStyle', 'style'], ['cbDir', 'dir']]) $(id).onclick = e => { const b = e.target.closest('button'); if (!b) return; setCb(k, b.dataset.v); $(id).querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b)); };
    $('cbFont').onchange = e => setCb('font', e.target.value);
    $('cbFs').oninput = e => { setCb('fs', +e.target.value); $('cbFsV').textContent = e.target.value + 'px'; };
    $('cbFade').oninput = e => { setCb('fade', +e.target.value); $('cbFadeV').textContent = +e.target.value ? e.target.value + 's' : 'nunca'; };
    $('cbBga').oninput = e => setCb('bga', +e.target.value);
    $('cbTc').oninput = e => setCb('textColor', e.target.value);
    $('cbBots').onchange = e => setCb('hideBots', e.target.value);
    sw($('cbBadges'), cb.badges, v => setCb('badges', v));
    sw($('cbCmds'), cb.hideCmds, v => setCb('hideCmds', v));
    $('cbTest').onclick = () => zen.overlay('chat', { id: 't' + Date.now(), login: 'zentester', name: 'ZenTester', color: '#a99bff', badges: [], parts: [{ t: 'text', v: 'Hola chat, esto es una prueba de ZenChat ' }, { t: 'emote', v: 'Kappa', url: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0' }], text: 'prueba' }, 'chat');
    // OBS
    const setO = () => { save('obs', { host: $('oHost').value.trim(), port: +$('oPort').value || 4455, password: $('oPass').value }); OBS.reset(); };
    ['oHost', 'oPort', 'oPass'].forEach(id => $(id).onchange = setO);
    $('oTest').onclick = async () => { setO(); $('oRes').textContent = 'conectando…'; try { await OBS.connect(); const v = await OBS.req('GetVersion'); $('oRes').innerHTML = `<span style="color:#6ff0c0">✓ OBS ${esc(v.obsVersion)}</span>`; } catch (e) { $('oRes').innerHTML = `<span style="color:#ff8f8f">${esc(e.message)}</span>`; } };
    $('gAdd').onclick = () => { const g = Cfg.get('goals', []).slice(); g.push({ id: 'g' + Date.now().toString(36), title: 'Objetivo de follows', type: 'follows', target: 50, start: 0, a1: '#a99bff', a2: '#5cc8ff', font: 'inter' }); save('goals', g); paintGoals(); };
    paintGoals();
    paintStatus();
  }
  function paintGoals() {
    const goals = Cfg.get('goals', []), counts = Cfg.get('goalCounts', {});
    const T = [['follows', 'Follows'], ['subs', 'Subs'], ['bits', 'Bits'], ['points', 'Canjes'], ['raiders', 'Gente de raids'], ['custom', 'A mano']];
    $('gList').innerHTML = goals.map((g, i) => {
      const cur = (+g.start || 0) + (+counts[g.id] || 0);
      const url = BASE + '/goal?id=' + g.id;
      return `<div class="var" data-i="${i}"><input class="inp" style="flex:1;min-width:150px" data-k="title" value="${esc(g.title)}">
        <select class="inp" data-k="type">${T.map(([k, n]) => `<option value="${k}"${g.type === k ? ' selected' : ''}>${n}</option>`).join('')}</select>
        <span style="font-family:var(--mono);font-size:12px">${cur} /</span><input class="inp s" type="number" data-k="target" value="${g.target}">
        <small style="color:var(--muted)">empieza en</small><input class="inp s" type="number" data-k="start" value="${g.start || 0}">
        <input type="color" data-k="a1" value="${g.a1}"><input type="color" data-k="a2" value="${g.a2}">
        <button class="btn sm ghost" data-plus="1">+1</button><button class="btn sm ghost" data-plus="-1">−1</button><button class="btn sm ghost" data-reset>Reiniciar</button>
        <button class="btn sm ghost" data-copy="${esc(url)}">Copiar enlace</button><button class="btn sm" data-obs="${esc('ZenChat · ' + g.title)}|${esc(url)}|800|90">OBS</button><button class="btn sm danger" data-del>✕</button></div>`;
    }).join('') || '<p style="color:var(--muted);font-size:12px;margin:4px 0 8px">Aún no hay ninguno.</p>';
    $('gList').querySelectorAll('.var').forEach(row => {
      const i = +row.dataset.i;
      const upd = (k, v) => { const g = Cfg.get('goals', []).slice(); g[i] = { ...g[i], [k]: v }; save('goals', g); };
      row.querySelectorAll('[data-k]').forEach(el => el.onchange = () => upd(el.dataset.k, el.type === 'number' ? +el.value : el.value));
      row.querySelectorAll('[data-plus]').forEach(b => b.onclick = () => { const c = { ...Cfg.get('goalCounts', {}) }; const id = Cfg.get('goals')[i].id; c[id] = (+c[id] || 0) + +b.dataset.plus; save('goalCounts', c); Events.overlayState(); paintGoals(); });
      row.querySelector('[data-reset]').onclick = () => { const c = { ...Cfg.get('goalCounts', {}) }; delete c[Cfg.get('goals')[i].id]; save('goalCounts', c); Events.overlayState(); paintGoals(); };
      row.querySelector('[data-del]').onclick = () => { const g = Cfg.get('goals', []).slice(); g.splice(i, 1); save('goals', g); paintGoals(); };
      row.querySelector('[data-copy]').onclick = e => { zen.copy(e.target.dataset.copy); toast('Enlace copiado'); };
      row.querySelector('[data-obs]').onclick = async e => { const [n, u, w, hh] = e.target.dataset.obs.split('|'); try { toast(await OBS.addBrowser(n, u, +w, +hh)); } catch (er) { toast(er.message, true); } };
    });
  }
  function paintStatus() {
    document.querySelectorAll('[data-st]').forEach(el => {
      const n = clients[el.dataset.st] || 0;
      el.className = 'on' + (n ? '' : ' no');
      el.textContent = n ? `● en OBS${n > 1 ? ' ×' + n : ''}` : '● sin abrir';
    });
  }
  return { open };
})();
