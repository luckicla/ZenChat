'use strict';
// Clip rápido: un botón y Twitch hace el clip de lo último que ha pasado.
// Luego se le pide a Twitch su versión vertical (la que monta él solo con la
// cámara arriba y el juego abajo, o a pantalla completa) y se baja lista para
// TikTok: en el PC a Vídeos/ZenChat y en el móvil a la galería. Si Twitch no
// la da (no es tu canal, o aún no la tiene), en el móvil se recorta a 9:16 a
// mano como antes y en el PC queda el enlace y el editor de Twitch.
const Clip = (() => {
  let busy = false;
  const isAndroid = () => document.documentElement.classList.contains('android');

  function box(html) {
    return Modal.open(`<h2>Clip <button class="sbtn" data-close>✕</button></h2>${html}`);
  }
  function step(txt, pct) {
    const b = $('mbox');
    let s = b.querySelector('#clSt');
    if (!s) return;
    s.innerHTML = `${esc(txt)}${pct !== undefined ? `<div style="height:6px;margin-top:8px;background:rgba(var(--paper-rgb),.12)"><i style="display:block;height:100%;width:${Math.max(3, Math.min(100, pct))}%;background:var(--a1);transition:width .3s"></i></div>` : ''}`;
  }

  // Get Clips Download: { landscape_download_url, portrait_download_url }.
  // La vertical tarda un poco más que el clip; se espera hasta ~1 minuto.
  // Twitch solo la da en tu canal (o si eres editor): si dice que no, null.
  async function downloads(c, id, wait) {
    const tries = wait ? 16 : 1;
    let last = null;
    for (let i = 0; i < tries; i++) {
      const r = await Tw.helix('GET', `clips/downloads?editor_id=${Me.id}&broadcaster_id=${c.id}&clip_id=${id}`);
      if (r.status === 401 || r.status === 403) return null;
      const d = r.json && r.json.data && r.json.data[0];
      if (d) last = d;
      if (d && d.portrait_download_url) return d;
      if (i < tries - 1) {
        step('Twitch está montando la versión vertical (cámara arriba, juego abajo)…', 50 + i * 3);
        await sleep(4000);
      }
    }
    return last;
  }

  async function make(chLogin) {
    if (busy) return;
    if (!Me.ok) { toast('Entra con tu cuenta de Twitch para hacer clips', true); return; }
    const c = Chat.chans.get(chLogin || Me.login) || Chat.chan(chLogin || Me.login);
    if (!c.id) { const u = await Tw.user(c.login); if (u) c.id = u.id; }
    if (!c.id) { toast(`No encuentro el canal «${c.login}» en Twitch`, true); return; }
    busy = true;
    zen.flash();
    box(`<p id="clSt">Haciendo el clip de <b>${esc(c.name)}</b>…</p>`);
    try {
      const len = Cfg.ui('clipLen', 30);
      let r = await Tw.helix('POST', `clips?broadcaster_id=${c.id}${len && len !== 30 ? '&duration=' + len : ''}`);
      if (r.status === 400 && len !== 30) r = await Tw.helix('POST', `clips?broadcaster_id=${c.id}`);
      if (r.status === 404) throw new Error(`${c.name} no está en directo (o no deja clips)`);
      if (r.status >= 300 || !r.json || !r.json.data) throw new Error(Tw.why(r));
      const id = r.json.data[0].id, edit = r.json.data[0].edit_url;
      step('Twitch está preparando el clip (unos 15 segundos)…', 5);
      let clip = null;
      for (let i = 0; i < 20 && !clip; i++) {
        await sleep(i < 3 ? 5000 : 2500);
        const [x] = await Tw.get('clips?id=' + id);
        if (x) clip = x;
        step('Twitch está preparando el clip…', 5 + i * 2);
      }
      const url = clip ? clip.url : 'https://clips.twitch.tv/' + id;
      const info = { id, url, edit, title: (clip && clip.title) || c.name, c };
      const d = clip ? await downloads(c, id, true) : null;

      if (isAndroid()) {
        const src = d && (d.portrait_download_url || d.landscape_download_url);
        if (!src) throw new Error('Twitch no da el vídeo de este clip (solo en tu canal o si eres editor; si es el tuyo, vuelve a entrar en Ajustes → Cuenta). El clip está en ' + url);
        step('Bajando el clip…', 0);
        await new Promise((ok, fail) => {
          window.__zenClip = s => {
            if (s.state === 'download') step('Bajando el clip…', s.pct * 0.4);
            if (s.state === 'crop') step('Pasándolo a vertical…', 40 + s.pct * 0.55);
            if (s.state === 'save') step('Guardando en la galería…', 98);
            if (s.state === 'done') { ok(); doneAndroid(s.uri, info, !!d.portrait_download_url); }
            if (s.state === 'error') fail(new Error(s.msg));
          };
          ZenAndroid.clip(JSON.stringify({ id, url: src, pos: Cfg.ui('clipPos', 'center'), portrait: !!d.portrait_download_url }));
        });
      } else if (d && d.portrait_download_url) {
        await savePc(d.portrait_download_url, info);
      } else {
        linkOnly(info, clip, !!d);
      }
    } catch (e) {
      const b = $('mbox');
      if (b.querySelector('#clSt')) { b.querySelector('#clSt').style.color = '#ff8f8f'; b.querySelector('#clSt').textContent = e.message; }
      else toast(e.message, true);
    }
    busy = false;
  }

  async function savePc(src, info) {
    step('Bajando la versión vertical…', 0);
    const off = zen.onClip ? zen.onClip(s => step('Bajando la versión vertical…', s.pct)) : null;
    let file;
    try { file = await zen.clipSave(src, info.title); } finally { if (off) off(); }
    donePc(file, info);
  }

  function donePc(file, info) {
    $('mbox').innerHTML = `<h2>¡Clip para TikTok! <button class="sbtn" data-close>✕</button></h2>
      <p>La versión vertical de Twitch, guardada en <b>Vídeos/ZenChat</b>.</p>
      <p style="font-size:12px">¿Quieres cambiar el diseño (cámara arriba y juego abajo, o completo) o ponerle subtítulos? Hazlo en el editor de Twitch y luego dale a «Volver a bajar».</p>
      <div class="btns" style="justify-content:stretch;flex-direction:column">
        <button class="btn" id="clDir" style="height:40px">Abrir la carpeta</button>
        <button class="btn ghost" id="clTk" style="height:38px">Subir a TikTok</button>
        <button class="btn ghost" id="clEdit" style="height:38px">Editar en Twitch (diseño y subtítulos)</button>
        <button class="btn ghost" id="clAgain" style="height:38px">Volver a bajar</button>
        <button class="btn ghost" id="clLn" style="height:38px">Copiar el enlace de Twitch</button></div>`;
    $('mbox').querySelector('[data-close]').onclick = () => Modal.close();
    $('clDir').onclick = () => zen.clipShow(file);
    $('clTk').onclick = () => { zen.clipShow(file); zen.open('https://www.tiktok.com/tiktokstudio/upload'); };
    $('clEdit').onclick = () => zen.open(info.edit);
    $('clLn').onclick = () => { zen.copy(info.url); toast('Enlace copiado'); };
    $('clAgain').onclick = () => redownload(info);
  }

  async function redownload(info) {
    if (busy) return;
    busy = true;
    $('mbox').innerHTML = `<h2>Clip <button class="sbtn" data-close>✕</button></h2><p id="clSt">Pidiendo a Twitch la versión nueva…</p>`;
    $('mbox').querySelector('[data-close]').onclick = () => Modal.close();
    try {
      const d = await downloads(info.c, info.id, true);
      if (!d || !d.portrait_download_url) throw new Error('Twitch aún no tiene la versión vertical: prueba en un minuto');
      await savePc(d.portrait_download_url, info);
    } catch (e) { const s = $('mbox').querySelector('#clSt'); if (s) { s.style.color = '#ff8f8f'; s.textContent = e.message; } }
    busy = false;
  }

  function linkOnly(info, clip, own) {
    $('mbox').innerHTML = `<h2>Clip listo <button class="sbtn" data-close>✕</button></h2>
      <p>${clip ? esc(clip.title || '') : 'Twitch aún lo está procesando, en un momento estará.'}</p>
      <div class="url" style="display:flex;gap:6px"><input class="inp" style="flex:1" readonly value="${esc(info.url)}"><button class="btn sm ghost" id="clCp">Copiar</button></div>
      <p style="font-size:12px">${own
        ? 'Twitch todavía no ha montado la versión vertical. Ábrela en el editor (diseño cámara arriba y juego abajo, y subtítulos) o vuelve a probar en un minuto.'
        : 'Twitch solo deja bajar el vídeo de los clips de tu canal (o si eres editor). En el editor de Twitch puedes pasarlo a vertical y compartirlo a TikTok.'}</p>
      <div class="btns"><button class="btn ghost" id="clOpen">Ver</button>${own ? '<button class="btn ghost" id="clAgain">Volver a probar</button>' : ''}<button class="btn" id="clEdit">Abrir el editor</button></div>`;
    $('mbox').querySelector('[data-close]').onclick = () => Modal.close();
    $('clCp').onclick = () => { zen.copy(info.url); toast('Enlace copiado'); };
    $('clOpen').onclick = () => zen.open(info.url);
    $('clEdit').onclick = () => zen.open(info.edit);
    if (own) $('clAgain').onclick = () => redownload(info);
    zen.copy(info.url);
  }

  function doneAndroid(uri, info, twitchLayout) {
    $('mbox').innerHTML = `<h2>¡Clip en vertical! <button class="sbtn" data-close>✕</button></h2>
      <p>Guardado en la galería (Películas/ZenChat), en 1080×1920${twitchLayout ? ', con el diseño de Twitch (cámara arriba y juego abajo)' : ''}.</p>
      <div class="btns" style="justify-content:stretch;flex-direction:column">
        <button class="btn" id="clTk" style="height:44px">Compartir en TikTok</button>
        <button class="btn ghost" id="clSh" style="height:40px">Compartir en otra app…</button>
        <button class="btn ghost" id="clVw" style="height:40px">Verlo</button>
        <button class="btn ghost" id="clLn" style="height:40px">Copiar el enlace de Twitch</button></div>`;
    $('mbox').querySelector('[data-close]').onclick = () => Modal.close();
    $('clTk').onclick = () => ZenAndroid.share(uri, true);
    $('clSh').onclick = () => ZenAndroid.share(uri, false);
    $('clVw').onclick = () => ZenAndroid.view(uri);
    $('clLn').onclick = () => { zen.copy(info.url); toast('Enlace copiado'); };
  }
  return { make };
})();
