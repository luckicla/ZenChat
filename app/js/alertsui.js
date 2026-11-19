'use strict';
// Alertas → el editor: cada tipo con su texto, imagen/GIF/vídeo, sonido,
// animación, letra, colores, voz, variaciones por cantidad y (puntos) una
// alerta distinta para cada recompensa. A la derecha, la vista previa.
const AlertsUI = (() => {
  let A = null, sel = 'follow', saveT, rewards = null;
  const page = () => $('page-alerts');
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { Cfg.set('alerts', A); Events.paintPause(); }, 250); };
  const soundOpts = (cur) => `<option value="none"${cur === 'none' ? ' selected' : ''}>Sin sonido</option>` + ZenSounds.list().map(s => `<option value="${s.id}"${s.id === cur ? ' selected' : ''}>${esc(s.name)}</option>`).join('') + (cur && cur.startsWith('media/') ? `<option value="${esc(cur)}" selected>Tu archivo</option>` : '') + '<option value="__file">Elegir archivo…</option>';

  function open() {
    A = ZenAlerts.complete(Cfg.get('alerts'));
    const g = A.global;
    const p = page();
    p.innerHTML = `
      <div class="ph"><div><h2>Alertas</h2><p>Lo que sale en OBS con cada follow, sub, bits, raid, canje… Mete <span class="code-i">http://127.0.0.1:47830/alerts</span> en OBS (pestaña OBS).</p></div>
        <div style="display:flex;gap:8px"><button class="btn ghost" id="alAll">Probar todas</button><button class="btn" id="alTest">Probar esta</button></div></div>
      <div class="box">
        <div class="row"><div class="lb"><b>Volumen general</b><small>De todas las alertas (cada una tiene el suyo también)</small></div><input type="range" min="0" max="1" step="0.05" id="gVol" value="${g.volume}"></div>
        <div class="row"><div class="lb"><b>Dónde salen</b></div><div class="seg" id="gPos">${[['center', 'Centro'], ['top', 'Arriba'], ['bottom', 'Abajo'], ['left', 'Izquierda'], ['right', 'Derecha']].map(([k, n]) => `<button data-v="${k}" class="${g.pos === k ? 'sel' : ''}">${n}</button>`).join('')}</div></div>
        <div class="row"><div class="lb"><b>Tamaño</b></div><input type="range" min="0.5" max="2" step="0.05" id="gScale" value="${g.scale || 1}"></div>
        <div class="row"><div class="lb"><b>Pausa entre alertas</b><small>Si llegan varias a la vez, van en cola</small></div><input type="range" min="0" max="6" step="0.5" id="gGap" value="${g.gap}"><span id="gGapV">${g.gap}s</span></div>
        <div class="row"><div class="lb"><b>Voz (leer mensajes)</b><small>La voz la pone OBS: si no la tiene, usa la de por defecto</small></div><select class="inp" id="gVoice"></select><input type="range" min="0.6" max="1.6" step="0.05" id="gRate" value="${g.ttsRate}" title="Velocidad"></div>
      </div>
      <div class="aed"><div class="atypes" id="alTypes"></div><div id="alEd"></div></div>`;
    $('gVol').oninput = e => { g.volume = +e.target.value; save(); };
    $('gScale').oninput = e => { g.scale = +e.target.value; save(); };
    $('gGap').oninput = e => { g.gap = +e.target.value; $('gGapV').textContent = g.gap + 's'; save(); };
    $('gRate').oninput = e => { g.ttsRate = +e.target.value; save(); };
    $('gPos').onclick = e => { const b = e.target.closest('button'); if (!b) return; g.pos = b.dataset.v; $('gPos').querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b)); save(); };
    const voices = () => { const v = speechSynthesis.getVoices(); $('gVoice').innerHTML = '<option value="">La de por defecto</option>' + v.map(x => `<option${x.name === g.ttsVoice ? ' selected' : ''}>${esc(x.name)}</option>`).join(''); };
    voices(); speechSynthesis.onvoiceschanged = voices;
    $('gVoice').onchange = e => { g.ttsVoice = e.target.value; save(); };
    $('alTest').onclick = () => Events.test(sel);
    $('alAll').onclick = () => { for (const t of ZenAlerts.TYPES) if (A.types[t.id].on) Events.test(t.id); };
    paintTypes();
    paintEd();
  }
  function paintTypes() {
    $('alTypes').innerHTML = ZenAlerts.TYPES.map(t => `<button data-t="${t.id}" class="${t.id === sel ? 'sel' : ''}"><i>${t.icon}</i>${esc(t.name)}<span class="dot${A.types[t.id].on ? '' : ' off'}"></span></button>`).join('');
    $('alTypes').onclick = e => { const b = e.target.closest('button'); if (!b) return; sel = b.dataset.t; paintTypes(); paintEd(); };
  }
  function mediaRow(obj, key, label, accept) {
    const v = obj[key] || '';
    const isV = /\.(webm|mp4)$/i.test(v);
    return `<div class="row"><div class="lb"><b>${label}</b><small>PNG, GIF, WEBP o vídeo WEBM/MP4 (con transparencia, WEBM). O pega un enlace.</small></div>
      <div class="mediapick" data-k="${key}">${v ? (isV ? `<video class="thumb" src="${esc(mediaUrl(v))}" muted autoplay loop></video>` : `<img class="thumb" src="${esc(mediaUrl(v))}">`) : ''}
      <button class="btn sm ghost" data-pick="${accept}">Elegir archivo</button><input class="inp" placeholder="o https://…gif" value="${/^https?:/.test(v) ? esc(v) : ''}" data-url>${v ? '<button class="btn sm ghost" data-clear>Quitar</button>' : ''}</div></div>`;
  }
  function bindMedia(root, obj, rerender) {
    root.querySelectorAll('.mediapick').forEach(mp => {
      const k = mp.dataset.k;
      mp.querySelector('[data-pick]').onclick = async () => { const p = await pickFile(mp.querySelector('[data-pick]').dataset.pick); if (p) { obj[k] = p; save(); rerender(); } };
      mp.querySelector('[data-url]').onchange = e => { obj[k] = e.target.value.trim(); save(); rerender(); };
      const c = mp.querySelector('[data-clear]'); if (c) c.onclick = () => { obj[k] = ''; save(); rerender(); };
    });
  }
  function bindSound(sel, obj, key, rerender, volKey = 'vol') {
    sel.onchange = async () => {
      if (sel.value === '__file') { const p = await pickFile('audio/*'); if (p) obj[key] = p; save(); rerender(); return; }
      obj[key] = sel.value; save(); ZenSounds.play(mediaUrl(obj[key]) || obj[key], (obj[volKey] ?? 0.8) * A.global.volume);
    };
  }

  function paintEd() {
    const t = ZenAlerts.TYPES.find(x => x.id === sel), c = A.types[sel];
    const ed = $('alEd');
    const chips = t.vars.split(' ').map(v => `<code>${v}</code>`).join('');
    ed.innerHTML = `
      <div class="preview" id="alPrev"><iframe src="http://127.0.0.1:47830/alerts?w=preview" tabindex="-1"></iframe><span class="pv-tag">vista previa · 1920×1080</span></div>
      <div class="box">
        <div class="row"><div class="lb"><b>${t.icon} ${esc(t.name)}</b><small>${c.on ? 'Activada' : 'Desactivada: no sale en OBS (sí en Actividad)'}</small></div><button class="sw" id="eOn"></button><button class="btn sm ghost" id="ePrev">▶ Ver aquí</button></div>
        <div class="row"><div class="lb"><b>Texto</b><small class="chips">Variables: ${chips}</small></div><input class="inp w" id="eText" value="${esc(c.text)}"></div>
        <div class="row"><div class="lb"><b>Segunda línea</b></div><input class="inp w" id="eSub" value="${esc(c.sub)}"></div>
        ${mediaRow(c, 'img', 'Imagen / GIF / vídeo', 'image/*,video/webm,video/mp4')}
        <div class="row"><div class="lb"><b>Tamaño de la imagen</b></div><input type="range" min="80" max="700" step="10" id="eImgS" value="${c.imgSize}"></div>
        <div class="row"><div class="lb"><b>Sonido</b><small>De serie, o el tuyo (MP3, WAV, OGG)</small></div><select class="inp" id="eSnd">${soundOpts(c.sound)}</select><button class="btn sm ghost" id="ePlay">▶</button><input type="range" min="0" max="1" step="0.05" id="eVol" value="${c.vol}" title="Volumen"></div>
        <div class="row"><div class="lb"><b>Duración</b></div><input type="range" min="2" max="30" step="0.5" id="eDur" value="${c.dur}"><span id="eDurV">${c.dur}s</span></div>
      </div>
      <div class="sec">Aspecto</div>
      <div class="box">
        <div class="row"><div class="lb"><b>Estilo</b></div><div class="seg" id="eStyle">${[['card', 'Tarjeta'], ['clean', 'Limpio'], ['cut', 'Recorte']].map(([k, n]) => `<button data-v="${k}" class="${c.style === k ? 'sel' : ''}">${n}</button>`).join('')}</div></div>
        <div class="row"><div class="lb"><b>Distribución</b></div><div class="seg" id="eLay">${[['stack', 'Imagen arriba'], ['side', 'Al lado'], ['over', 'Texto encima']].map(([k, n]) => `<button data-v="${k}" class="${c.layout === k ? 'sel' : ''}">${n}</button>`).join('')}</div></div>
        <div class="row"><div class="lb"><b>Animación</b></div><select class="inp" id="eAnim">${Object.entries(ZenAlerts.ANIMS).map(([k, n]) => `<option value="${k}"${c.anim === k ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="row"><div class="lb"><b>Letra</b></div><select class="inp" id="eFont">${Object.entries(ZenAlerts.FONT_NAMES).map(([k, n]) => `<option value="${k}"${c.font === k ? ' selected' : ''}>${n}</option>`).join('')}</select><input type="range" min="20" max="110" id="eSize" value="${c.size}"></div>
        <div class="row"><div class="lb"><b>Colores</b><small>Acento (nombres), segundo acento y texto</small></div><input type="color" id="eC1" value="${c.color}"><input type="color" id="eC2" value="${c.color2}"><input type="color" id="eC3" value="${c.textColor}"></div>
      </div>
      ${t.amount ? `<div class="sec">Cantidad</div><div class="box">
        <div class="row"><div class="lb"><b>Mínimo para que salga</b><small>${t.id === 'cheer' ? 'bits' : t.id === 'raid' ? 'personas' : t.id === 'resub' ? 'meses' : 'cantidad'} (0 = siempre)</small></div><input class="inp s" type="number" min="0" id="eMin" value="${c.min || 0}"></div>
        <div class="row"><div class="lb"><b>Variaciones</b><small>Otra imagen, sonido o texto a partir de una cantidad (p. ej. 1000 bits con otro sonido). Gana la más alta que se cumpla.</small></div><button class="btn sm ghost" id="eVarAdd">+ Variación</button></div>
        <div class="vars" id="eVars"></div></div>` : ''}
      ${['resub', 'cheer', 'points', 'firstchat', 'charity', 'streak'].includes(t.id) ? `<div class="sec">Voz</div><div class="box">
        <div class="row"><div class="lb"><b>Leer el mensaje en voz alta</b><small>Después del sonido. ${t.amount ? 'Solo a partir de:' : ''}</small></div><button class="sw" id="eTts"></button>${t.amount ? `<input class="inp s" type="number" min="0" id="eTtsMin" value="${c.ttsMin || 0}">` : ''}</div></div>` : ''}
      ${t.id === 'points' ? `<div class="sec">Por recompensa</div><div class="box"><div class="row"><div class="lb"><b>Cada recompensa con su alerta</b><small>Sonido, imagen o texto propios, o que no salga.</small></div><button class="btn sm ghost" id="eRw">Cargar mis recompensas</button></div><div class="vars" id="eRws"></div></div>` : ''}`;
    const iframe = ed.querySelector('iframe');
    const fit = () => { if (!$('alPrev')) return; const w = $('alPrev').clientWidth; iframe.style.transform = `scale(${w / 1920})`; $('alPrev').style.height = (w * 1080 / 1920) + 'px'; };
    fit(); new ResizeObserver(fit).observe($('alPrev'));
    const prev = () => zen.overlay('alert', ZenAlerts.sample(sel, Me.name || 'ZenTester'), 'preview');
    $('ePrev').onclick = prev;
    sw($('eOn'), c.on, v => { c.on = v; save(); paintTypes(); });
    const inp = (id, k, num) => { const el = $(id); if (el) el.oninput = () => { c[k] = num ? +el.value : el.value; save(); }; };
    inp('eText', 'text'); inp('eSub', 'sub'); inp('eImgS', 'imgSize', 1); inp('eVol', 'vol', 1); inp('eSize', 'size', 1); inp('eMin', 'min', 1); inp('eTtsMin', 'ttsMin', 1);
    inp('eC1', 'color'); inp('eC2', 'color2'); inp('eC3', 'textColor');
    $('eDur').oninput = e => { c.dur = +e.target.value; $('eDurV').textContent = c.dur + 's'; save(); };
    $('eAnim').onchange = e => { c.anim = e.target.value; save(); setTimeout(prev, 300); };
    $('eFont').onchange = e => { c.font = e.target.value; save(); };
    for (const [id, k] of [['eStyle', 'style'], ['eLay', 'layout']]) $(id).onclick = e => { const b = e.target.closest('button'); if (!b) return; c[k] = b.dataset.v; $(id).querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b)); save(); setTimeout(prev, 300); };
    bindSound($('eSnd'), c, 'sound', paintEd);
    $('ePlay').onclick = () => ZenSounds.play(mediaUrl(c.sound) || c.sound, c.vol * A.global.volume);
    if ($('eTts')) sw($('eTts'), c.tts, v => { c.tts = v; save(); });
    ed.querySelectorAll('.chips code').forEach(x => x.onclick = () => { const i = $('eText'); i.value += ' ' + x.textContent; i.dispatchEvent(new Event('input')); });
    bindMedia(ed, c, paintEd);
    if (t.amount) paintVars(c);
    if ($('eVarAdd')) $('eVarAdd').onclick = () => { c.vars = [...(c.vars || []), { min: (c.vars || []).length ? 1000 : 100, text: '', sound: '', img: '' }]; save(); paintVars(c); };
    if (t.id === 'points') { $('eRw').onclick = loadRewards; paintRewards(c); }
  }
  function paintVars(c) {
    const box = $('eVars'); if (!box) return;
    box.innerHTML = (c.vars || []).map((v, i) => `<div class="var" data-i="${i}">desde <input class="inp s" type="number" min="1" data-k="min" value="${v.min}">
      <input class="inp" style="flex:1;min-width:160px" data-k="text" placeholder="Texto (vacío = el normal)" value="${esc(v.text || '')}">
      <select class="inp" data-snd>${'<option value="">Sonido normal</option>' + soundOpts(v.sound || '').replace('<option value="none">', '<option value="none">')}</select>
      <div class="mediapick" data-k="img"><button class="btn sm ghost" data-pick="image/*,video/webm,video/mp4">${v.img ? 'Imagen ✓' : 'Imagen…'}</button><input data-url hidden></div>
      <button class="btn sm ghost" data-test>▶</button><button class="btn sm danger" data-del>✕</button></div>`).join('');
    box.querySelectorAll('.var').forEach(row => {
      const v = c.vars[+row.dataset.i];
      row.querySelectorAll('input[data-k]').forEach(i => i.oninput = () => { v[i.dataset.k] = i.type === 'number' ? +i.value : i.value; save(); });
      bindSound(row.querySelector('[data-snd]'), v, 'sound', () => paintVars(c));
      bindMedia(row, v, () => paintVars(c));
      row.querySelector('[data-del]').onclick = () => { c.vars.splice(+row.dataset.i, 1); save(); paintVars(c); };
      row.querySelector('[data-test]').onclick = () => { const ev = ZenAlerts.sample(sel, Me.name); ev.amountValue = v.min; ev.amount = v.min; zen.overlay('alert', ev, 'preview'); };
    });
  }
  async function loadRewards() {
    if (!Me.ok) { toast('Entra con tu cuenta primero', true); return; }
    const d = await Tw.get(`channel_points/custom_rewards?broadcaster_id=${Me.id}`);
    rewards = d.map(r => ({ title: r.title, cost: r.cost, img: r.image ? r.image.url_2x : (r.default_image && r.default_image.url_2x), color: r.background_color }));
    if (!rewards.length) toast('No encuentro recompensas (¿eres afiliado/partner?)', true);
    paintRewards(A.types.points);
  }
  function paintRewards(c) {
    const box = $('eRws'); if (!box) return;
    const names = new Set([...(rewards || []).map(r => r.title), ...Object.keys(c.rewards || {})]);
    box.innerHTML = [...names].map(n => {
      const r = (c.rewards || {})[n] || {};
      const info = (rewards || []).find(x => x.title === n);
      return `<div class="var" data-n="${esc(n)}">${info && info.img ? `<img src="${esc(info.img)}" style="width:26px;height:26px;background:${esc(info.color || '#333')}">` : ''}<b style="min-width:140px">${esc(n)}</b>${info ? `<small style="color:var(--muted)">${info.cost}</small>` : ''}
        <button class="sw" data-on></button>
        <select class="inp" data-snd><option value="">Sonido normal</option>${soundOpts(r.sound || '')}</select>
        <div class="mediapick" data-k="img"><button class="btn sm ghost" data-pick="image/*,video/webm,video/mp4">${r.img ? 'Imagen ✓' : 'Imagen…'}</button><input data-url hidden></div>
        <input class="inp" style="flex:1;min-width:140px" data-text placeholder="Texto (vacío = el normal)" value="${esc(r.text || '')}"><button class="btn sm ghost" data-test>▶</button></div>`;
    }).join('') || '<p style="color:var(--muted);font-size:12px;margin:6px 0">Dale a «Cargar mis recompensas».</p>';
    box.querySelectorAll('.var').forEach(row => {
      const n = row.dataset.n;
      c.rewards = c.rewards || {};
      const r = c.rewards[n] || (c.rewards[n] = { on: true });
      sw(row.querySelector('[data-on]'), r.on !== false, v => { r.on = v; save(); });
      bindSound(row.querySelector('[data-snd]'), r, 'sound', () => paintRewards(c));
      bindMedia(row, r, () => paintRewards(c));
      row.querySelector('[data-text]').oninput = e => { r.text = e.target.value; save(); };
      row.querySelector('[data-test]').onclick = () => { const ev = ZenAlerts.sample('points', Me.name); ev.reward = n; zen.overlay('alert', ev, 'preview'); };
    });
  }
  return { open };
})();
