'use strict';
// Ajustes: la cuenta de Twitch, el aspecto (colores, cristal, fondo), el chat,
// las menciones, la ventana y las actualizaciones.
const THEMES = [
  { id: 'zen', name: 'Cristal', bg: '#0e0f13', a1: '#8b7bff', a2: '#5cc8ff', a3: '#ffb547' },
  { id: 'ocean', name: 'Océano', bg: '#0b1220', a1: '#3b82f6', a2: '#22d3ee', a3: '#f59e0b' },
  { id: 'rose', name: 'Rosa', bg: '#140d12', a1: '#f472b6', a2: '#a78bfa', a3: '#fbbf24' },
  { id: 'midnight', name: 'Medianoche', bg: '#070b14', a1: '#38e8ff', a2: '#a17bff', a3: '#ff4f7a' },
  { id: 'synth', name: 'Synthwave', bg: '#150a20', a1: '#ff9a3c', a2: '#ff3cac', a3: '#4de8ff' },
  { id: 'vapor', name: 'Vaporwave', bg: '#1b1035', a1: '#ff71ce', a2: '#01cdfe', a3: '#05ffa1' },
  { id: 'twitch', name: 'Morado', bg: '#0e0b16', a1: '#a970ff', a2: '#6ff0c0', a3: '#ffd166' },
  { id: 'terminal', name: 'Terminal', bg: '#050805', a1: '#39ff6a', a2: '#f5f53d', a3: '#39c5ff' },
  { id: 'blood', name: 'Sangre', bg: '#0d0606', a1: '#ff3b30', a2: '#ffd23f', a3: '#ff8a5c' },
  { id: 'mint', name: 'Menta', bg: '#0c1513', a1: '#6ff0c0', a2: '#ffb37a', a3: '#8fb6ff' },
  { id: 'mono', name: 'Grafito', bg: '#0e0e0e', a1: '#ffffff', a2: '#b5b5b5', a3: '#6f6f6f' },
  { id: 'paper', name: 'Papel (claro)', bg: '#efe9dc', a1: '#e0162b', a2: '#1b55e0', a3: '#16151a', light: true },
];

const Settings = (() => {
  const rgb = hx => { const m = /^#?([0-9a-f]{6})$/i.exec(hx || ''); if (!m) return '0,0,0'; return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)).join(','); };
  function apply() {
    const u = k => Cfg.ui(k, DEF[k]);
    const root = document.documentElement, st = root.style;
    const th = THEMES.find(t => t.id === u('theme')) || THEMES[0];
    const a1 = u('a1') || th.a1, a2 = u('a2') || th.a2, a3 = u('a3') || th.a3;
    root.classList.toggle('light', !!th.light);
    st.setProperty('--a1', a1); st.setProperty('--a1-rgb', rgb(a1));
    st.setProperty('--a2', a2); st.setProperty('--a2-rgb', rgb(a2));
    st.setProperty('--a3', a3); st.setProperty('--a3-rgb', rgb(a3));
    if (!th.light) { st.setProperty('--ink', th.bg); st.setProperty('--ink-rgb', rgb(th.bg)); } else { st.removeProperty('--ink'); st.removeProperty('--ink-rgb'); }
    st.setProperty('--glass', u('glass'));
    st.setProperty('--blur', u('blur') + 'px');
    st.setProperty('--fs', u('fs') + 'px');
    st.setProperty('--emote', u('emote') + 'px');
    st.setProperty('--badge', Math.round(u('fs') * 1.35) + 'px');
    st.setProperty('--r', u('round') ? '6px' : '2px');
    st.setProperty('--ui', { inter: "'Inter','Segoe UI',system-ui,sans-serif", system: "'Segoe UI',system-ui,sans-serif", mono: "'JetBrains Mono',Consolas,monospace" }[u('uiFont')] || "'Inter','Segoe UI',system-ui,sans-serif");
    st.setProperty('--bgblur', u('bgBlur') + 'px');
    st.setProperty('--bgop', u('bgOp'));
    $('bgImg').src = u('bgImg') ? mediaUrl(u('bgImg')) : '';
    if (!u('bgImg')) $('bgImg').removeAttribute('src');
    root.classList.toggle('acrylic', !!u('acrylic'));
    root.classList.toggle('nots', !u('timestamps'));
    root.classList.toggle('alt', !!u('altRows'));
    root.classList.toggle('sep', !!u('separators'));
    root.classList.toggle('modbtns', !!u('modButtons'));
    root.classList.toggle('hidedel', !!u('hideDeleted'));
    root.classList.toggle('noact', !u('activity'));
    root.classList.toggle('noclip', !u('clipFab'));
    $('actBtn').classList.toggle('on', !!u('activity'));
  }
  const DEF = {
    theme: 'zen', a1: '', a2: '', a3: '', glass: 0.72, blur: 18, fs: 13, emote: 28, round: false, uiFont: 'inter',
    bgImg: '', bgBlur: 30, bgOp: 0.5, acrylic: false, timestamps: true, badges: true, altRows: false, separators: true,
    modButtons: true, hideDeleted: false, activity: true, pauseHover: true, history: true, historyN: 100, eventLines: true,
    thirdParty: true, clipLen: 30, clipPos: 'center', clipFab: true,
    hlWords: [], mentionSound: 'synth:blip', mentionVol: 0.6, notifyMention: true, notifyEvents: false, quickTo: 600, onTop: false, opacity: 1,
  };

  function row(label, small, ctl) { return `<div class="row"><div class="lb"><b>${label}</b>${small ? `<small>${small}</small>` : ''}</div>${ctl}</div>`; }
  function open() {
    const u = k => Cfg.ui(k, DEF[k]);
    const p = $('page-settings');
    const a = Cfg.get('auth');
    p.innerHTML = `
      <div class="ph"><div><h2>Ajustes</h2><p id="sVer"></p></div></div>
      <div class="sec">Cuenta de Twitch</div>
      <div class="box" id="sAcc"></div>
      <div class="sec">Aspecto</div>
      <div class="box">
        <div class="row" style="display:block"><div class="lb" style="margin-bottom:8px"><b>Colores</b></div><div class="themes" id="sThemes"></div></div>
        ${row('Colores a tu gusto', 'Los tres acentos', `<input type="color" id="sA1" value="${u('a1') || (THEMES.find(t => t.id === u('theme')) || THEMES[0]).a1}"><input type="color" id="sA2" value="${u('a2') || (THEMES.find(t => t.id === u('theme')) || THEMES[0]).a2}"><input type="color" id="sA3" value="${u('a3') || (THEMES.find(t => t.id === u('theme')) || THEMES[0]).a3}"><button class="btn sm ghost" id="sAReset">Los del tema</button>`)}
        ${row('Cristal', 'Lo transparentes que son los paneles y cuánto desenfocan lo de detrás', `<input type="range" min="0.2" max="1" step="0.02" id="sGlass" value="${u('glass')}"><input type="range" min="0" max="40" id="sBlur" value="${u('blur')}">`)}
        ${row('Imagen de fondo', 'Se ve detrás del cristal, desenfocada', `<button class="btn sm ghost" id="sBg">Elegir…</button>${u('bgImg') ? '<button class="btn sm ghost" id="sBgX">Quitar</button>' : ''}<input type="range" min="0" max="80" id="sBgBlur" value="${u('bgBlur')}" title="Desenfoque"><input type="range" min="0.1" max="1" step="0.05" id="sBgOp" value="${u('bgOp')}" title="Intensidad">`)}
        ${row('Transparencia de Windows', 'Acrílico: se ve tu escritorio detrás de la ventana (Windows 11)', `<button class="sw" id="sAcr"></button>`)}
        ${row('Esquinas', '', `<div class="seg" id="sRound"><button data-v="0" class="${!u('round') ? 'sel' : ''}">Cuadradas</button><button data-v="1" class="${u('round') ? 'sel' : ''}">Un poco redondas</button></div>`)}
        ${row('Letra de la app', '', `<div class="seg" id="sUiFont">${[['inter', 'Inter'], ['system', 'Windows'], ['mono', 'Mono']].map(([k, n]) => `<button data-v="${k}" class="${u('uiFont') === k ? 'sel' : ''}">${n}</button>`).join('')}</div>`)}
      </div>
      <div class="sec">Chat</div>
      <div class="box">
        ${row('Tamaño de letra', '', `<input type="range" min="10" max="22" id="sFs" value="${u('fs')}"><span id="sFsV">${u('fs')}px</span>`)}
        ${row('Tamaño de los emotes', '', `<input type="range" min="18" max="56" id="sEm" value="${u('emote')}"><span id="sEmV">${u('emote')}px</span>`)}
        ${row('Emotes de 7TV, BTTV y FFZ', 'Además de los de Twitch, como en Chatterino. Apagado: solo los de Twitch', `<button class="sw" id="sTp"></button>`)}
        ${row('Hora en cada mensaje', '', `<button class="sw" id="sTs"></button>`)}
        ${row('Insignias', '', `<button class="sw" id="sBd"></button>`)}
        ${row('Líneas separadoras', '', `<button class="sw" id="sSep"></button>`)}
        ${row('Filas alternas', 'Una sí, una no, un poco más clara', `<button class="sw" id="sAlt"></button>`)}
        ${row('Botones de moderación', 'Borrar, timeout y ban al lado de cada mensaje (en los canales con el escudo activado)', `<button class="sw" id="sModB"></button>`)}
        ${row('Timeout rápido', 'El del botón ⏱ de cada línea', `<select class="inp" id="sQto">${[[60, '1 min'], [300, '5 min'], [600, '10 min'], [1800, '30 min'], [3600, '1 hora'], [86400, '1 día']].map(([s, n]) => `<option value="${s}"${+u('quickTo') === s ? ' selected' : ''}>${n}</option>`).join('')}</select>`)}
        ${row('Pausar al pasar el ratón', 'Como Chatterino: el chat se para mientras lo miras', `<button class="sw" id="sPH"></button>`)}
        ${row('Mensajes de antes', 'Al abrir un canal, carga los últimos (recent-messages)', `<button class="sw" id="sHist"></button>`)}
        ${row('Esconder los mensajes borrados', 'Si no, salen tachados', `<button class="sw" id="sDel"></button>`)}
        ${row('Eventos en el chat', 'Una línea en tu chat con cada follow, sub, bits…', `<button class="sw" id="sEvL"></button>`)}
        ${row('Ocultar mensajes con…', 'Palabras o frases, separadas por comas', `<input class="inp w" id="sIgnP" value="${esc((Cfg.ui('ignorePhrases', []) || []).join(', '))}">`)}
        ${row('Usuarios ocultos', 'Desde su tarjeta, «Ocultar»', `<input class="inp w" id="sIgn" value="${esc((Cfg.ui('ignored', []) || []).join(', '))}">`)}
      </div>
      <div class="sec">Menciones y avisos</div>
      <div class="box">
        ${row('Palabras que te avisan', 'Además de tu nombre. Separadas por comas', `<input class="inp w" id="sHl" value="${esc((u('hlWords') || []).join(', '))}">`)}
        ${row('Sonido de mención', '', `<select class="inp" id="sMs"><option value="none">Sin sonido</option>${ZenSounds.list().map(s => `<option value="${s.id}"${s.id === u('mentionSound') ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}${String(u('mentionSound')).startsWith('media/') ? `<option value="${esc(u('mentionSound'))}" selected>Tu archivo</option>` : ''}<option value="__file">Elegir archivo…</option></select><input type="range" min="0" max="1" step="0.05" id="sMv" value="${u('mentionVol')}">`)}
        ${row('Aviso de Windows al mencionarte', 'Con la ventana en segundo plano', `<button class="sw" id="sNm"></button>`)}
        ${row('Aviso de Windows con cada evento', 'Follows, subs, bits…', `<button class="sw" id="sNe"></button>`)}
      </div>
      <div class="sec">Clips</div>
      <div class="box">
        ${row('Duración del clip', 'Lo último que ha pasado en el directo', `<div class="seg" id="sClL">${[[15, '15 s'], [30, '30 s'], [60, '60 s']].map(([k, n]) => `<button data-v="${k}" class="${+u('clipLen') === k ? 'sel' : ''}">${n}</button>`).join('')}</div>`)}
        ${row('Vertical: qué trozo', 'En el móvil el clip se recorta a 9:16 para TikTok: el centro, o un lado (donde tengas la cámara)', `<div class="seg" id="sClP">${[['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']].map(([k, n]) => `<button data-v="${k}" class="${u('clipPos') === k ? 'sel' : ''}">${n}</button>`).join('')}</div>`)}
        ${row('Botón flotante de clip', 'El botón CLIP de abajo a la derecha', `<button class="sw" id="sClF"></button>`)}
      </div>
      <div class="sec">Ventana</div>
      <div class="box">
        ${row('Columna de Actividad', 'Ctrl+E', `<button class="sw" id="sAct"></button>`)}
        ${row('Siempre encima', 'Encima del juego y de OBS', `<button class="sw" id="sTop"></button>`)}
        ${row('Opacidad de la ventana', 'Toda la ventana, para verla encima del juego', `<input type="range" min="0.3" max="1" step="0.05" id="sOp" value="${u('opacity')}">`)}
      </div>
      <div class="sec">ZenChat</div>
      <div class="box">
        ${row('Actualizaciones', '<span id="sUpd">Se actualiza sola.</span>', `<button class="btn sm ghost" id="sUpB">Buscar ahora</button>`)}
        ${row('Tus datos', 'Configuración, alertas y archivos subidos', `<button class="btn sm ghost" id="sData">Abrir carpeta</button>`)}
        ${row('Actividad', 'Borra la lista de eventos (no las alertas)', `<button class="btn sm danger" id="sClr">Vaciar</button>`)}
        ${row('Código', 'github.com/luckicla/ZenChat', `<button class="btn sm ghost" id="sGh">Abrir</button>`)}
      </div>`;
    zen.info().then(i => { $('sVer').textContent = `ZenChat ${i.version}${i.portable ? ' · portable' : ''} · overlays en http://127.0.0.1:${i.port}`; });
    paintAccount();
    // aspecto
    $('sThemes').innerHTML = THEMES.map(t => `<button class="theme${t.id === u('theme') ? ' sel' : ''}" data-t="${t.id}"><i><b style="background:${t.bg}"></b><b style="background:${t.a1}"></b><b style="background:${t.a2}"></b><b style="background:${t.a3}"></b></i>${esc(t.name)}</button>`).join('');
    $('sThemes').onclick = e => { const b = e.target.closest('.theme'); if (!b) return; setMany({ theme: b.dataset.t, a1: '', a2: '', a3: '' }); open(); Chat.rerender(); };
    ['sA1', 'sA2', 'sA3'].forEach((id, i) => $(id).oninput = e => set('a' + (i + 1), e.target.value));
    $('sAReset').onclick = () => { setMany({ a1: '', a2: '', a3: '' }); open(); };
    rng('sGlass', 'glass'); rng('sBlur', 'blur'); rng('sBgBlur', 'bgBlur'); rng('sBgOp', 'bgOp'); rng('sMv', 'mentionVol'); rng('sOp', 'opacity', v => zen.win('opacity', v));
    $('sFs').oninput = e => { set('fs', +e.target.value); $('sFsV').textContent = e.target.value + 'px'; };
    $('sEm').oninput = e => { set('emote', +e.target.value); $('sEmV').textContent = e.target.value + 'px'; };
    $('sBg').onclick = async () => { const p = await pickFile('image/*'); if (p) { set('bgImg', p); open(); } };
    if ($('sBgX')) $('sBgX').onclick = () => { set('bgImg', ''); open(); };
    seg('sClL', v => set('clipLen', +v));
    seg('sClP', v => set('clipPos', v));
    tog('sClF', 'clipFab');
    seg('sRound', v => set('round', v === '1'));
    seg('sUiFont', v => set('uiFont', v));
    tog('sAcr', 'acrylic', v => zen.win('acrylic', v));
tog('sTs', 'timestamps', () => Chat.rerender()); tog('sTp', 'thirdParty', () => toast('Se nota en los mensajes nuevos')); tog('sBd', 'badges', () => Chat.rerender()); tog('sSep', 'separators'); tog('sAlt', 'altRows');
    tog('sModB', 'modButtons'); tog('sPH', 'pauseHover'); tog('sHist', 'history'); tog('sDel', 'hideDeleted'); tog('sEvL', 'eventLines');
    tog('sNm', 'notifyMention'); tog('sNe', 'notifyEvents'); tog('sAct', 'activity'); tog('sTop', 'onTop', v => { zen.win('top', v); $('wPin').classList.toggle('on', v); });
    $('sQto').onchange = e => { set('quickTo', +e.target.value); Chat.rerender(); };
    const list = s => s.split(',').map(x => x.trim()).filter(Boolean);
    $('sHl').onchange = e => set('hlWords', list(e.target.value));
    $('sIgnP').onchange = e => set('ignorePhrases', list(e.target.value));
    $('sIgn').onchange = e => set('ignored', list(e.target.value.toLowerCase()));
    $('sMs').onchange = async e => {
      let v = e.target.value;
      if (v === '__file') { v = await pickFile('audio/*'); if (!v) return open(); }
      set('mentionSound', v); ZenSounds.play(mediaUrl(v), u('mentionVol')); if (e.target.value === '__file') open();
    };
    $('sData').onclick = () => zen.openData();
    $('sClr').onclick = () => { if (confirm('¿Vaciar la lista de Actividad?')) Events.clear(); };
    $('sGh').onclick = () => zen.open('https://github.com/luckicla/ZenChat');
    $('sUpB').onclick = async () => { $('sUpd').textContent = 'Buscando…'; paintUpd(await zen.update('check')); };
    zen.updState().then(paintUpd);
    if (document.documentElement.classList.contains('android')) {
      for (const id of ['sAcr', 'sTop', 'sOp', 'sData', 'sAct', 'sClF', 'sModB', 'sPH', 'sNe']) { const r = $(id) && $(id).closest('.row'); if (r) r.remove(); }
      p.querySelectorAll('.sec').forEach(x => { if (x.textContent === 'Ventana') { x.nextElementSibling.remove(); x.remove(); } });
    }
  }
  function paintUpd(s) {
    const el = $('sUpd'); if (!el || !s) return;
    const m = { checking: 'Buscando…', none: 'Tienes la última versión', downloading: `Bajando la ${s.version || 'nueva'}… ${s.pct || 0}%`, ready: `La ${s.version} está lista: se pone al cerrar ZenChat`, portable: `Hay una nueva (${s.version}): bájala desde GitHub`, error: 'No se pudo mirar: ' + (s.msg || '') };
    el.textContent = m[s.state] || '';
    if (s.state === 'ready' || s.state === 'portable') { const b = $('sUpB'); b.textContent = s.state === 'ready' ? 'Reiniciar y actualizar' : 'Bajar'; b.onclick = () => zen.update('install'); }
  }
  zen.onUpdate(s => { paintUpd(s); if (s.state === 'ready') toast(`ZenChat ${s.version} lista: se pone sola al cerrar`); });

  function paintAccount() {
    const box = $('sAcc'); if (!box) return;
    const a = Cfg.get('auth');
    const cid = Cfg.get('clientId', '');
    box.innerHTML = `
      ${Me.ok ? `<div class="row"><img src="${esc(Me.avatar)}" style="width:44px;height:44px;border-radius:var(--r)"><div class="lb"><b>${esc(Me.name)}</b><small>Conectado: chat, alertas, moderación y todo lo demás</small></div><button class="btn sm ghost" id="sRe">Volver a entrar</button><button class="btn sm danger" id="sOut">Salir</button></div>`
        : `<div class="row"><div class="lb"><b>${a && a.dead ? 'La sesión caducó' : 'Sin entrar'}</b><small>Entra con tu cuenta para escribir, moderar y recibir las alertas. Sin entrar solo puedes leer chats.</small></div><button class="btn" id="sIn" ${cid ? '' : 'disabled'}>Entrar con Twitch</button></div>`}
      <div class="row"><div class="lb"><b>Client ID</b><small>El de tu aplicación de Twitch. ${cid ? 'Puesto.' : 'Hace falta una vez (abajo cómo).'}</small></div><input class="inp w" id="sCid" value="${esc(cid)}" placeholder="p. ej. abc123…" spellcheck="false"></div>
      ${cid ? '' : `<div class="hint"><b>Cómo sacar el Client ID (2 minutos, solo una vez):</b><br>1. Entra en <a href="#" id="sDev">dev.twitch.tv/console/apps</a> con tu cuenta (Twitch pide tener activada la verificación en dos pasos).<br>2. «Registrar tu aplicación»: nombre <code>ZenChat-${esc(Me.login || 'tunombre')}</code>, URL de redirección <code>http://localhost</code>, categoría «Chat Bot», tipo de cliente <b>Público</b>.<br>3. Copia el <b>ID de cliente</b> y pégalo aquí arriba.</div>`}`;
    const cidEl = $('sCid');
    cidEl.onchange = () => { Cfg.set('clientId', cidEl.value.trim()); paintAccount(); };
    if ($('sDev')) $('sDev').onclick = e => { e.preventDefault(); zen.open('https://dev.twitch.tv/console/apps/create'); };
    if ($('sIn')) $('sIn').onclick = login;
    if ($('sRe')) $('sRe').onclick = login;
    if ($('sOut')) $('sOut').onclick = async () => { await zen.logout(); await Cfg.load(); App.authChanged(); paintAccount(); };
  }
  async function login() {
    let dc;
    try { dc = await zen.login(); } catch (e) { toast(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true); return; }
    const b = Modal.open(`<h2>Entrar con Twitch <button class="sbtn" data-close>✕</button></h2>
      <p>Se ha abierto Twitch en tu navegador. Comprueba que sale este código y dale a <b>Autorizar</b>:</p>
      <div class="code">${esc(dc.user_code)}</div>
      <p style="font-size:12px">Si no se abrió: <a href="#" id="lOpen">${esc(dc.verification_uri)}</a></p>
      <p id="lSt" style="color:var(--a2)">Esperando a que lo aceptes…</p>`, () => zen.loginCancel());
    b.querySelector('#lOpen').onclick = e => { e.preventDefault(); zen.open(dc.verification_uri); };
    zen.open(dc.verification_uri);
    try {
      await zen.loginPoll(dc);
      $('modal').hidden = true; Modal.onClose = null;
      await Cfg.load();
      toast('¡Dentro!');
      App.authChanged();
      if (!$('page-settings').hidden) open();
    } catch (e) {
      const st = b.querySelector('#lSt');
      if (st && !$('modal').hidden) {
        st.style.color = '#ff8f8f'; st.textContent = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
        st.insertAdjacentHTML('afterend', '<div class="btns"><button class="btn" id="lRetry">Volver a intentarlo</button></div>');
        $('lRetry').onclick = () => { Modal.close(); login(); };
      }
    }
  }
  const set = (k, v) => { Cfg.setUi(k, v); apply(); };
  const setMany = o => { Cfg.set('ui', { ...(Cfg.get('ui') || {}), ...o }); apply(); };
  const rng = (id, k, cb) => { $(id).oninput = e => { set(k, +e.target.value); if (cb) cb(+e.target.value); }; };
  const tog = (id, k, cb) => sw($(id), !!Cfg.ui(k, DEF[k]), v => { set(k, v); if (cb) cb(v); });
  const seg = (id, cb) => { $(id).onclick = e => { const b = e.target.closest('button'); if (!b) return; $(id).querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b)); cb(b.dataset.v); }; };
  return { open, apply, login, paintAccount, DEF };
})();
