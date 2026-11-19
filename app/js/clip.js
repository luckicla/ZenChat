'use strict';
// Clip rápido: un botón y Twitch hace el clip de lo último que ha pasado.
// En el móvil además se baja, se recorta a vertical (9:16) y se comparte
// directo a TikTok o se guarda en la galería. En el PC, enlace y editor.
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
    s.innerHTML = `${esc(txt)}${pct !== undefined ? `<div style="height:6px;margin-top:8px;background:rgba(var(--paper-rgb),.12)"><i style="display:block;height:100%;width:${Math.max(3, pct)}%;background:var(--a1);transition:width .3s"></i></div>` : ''}`;
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
      step('Twitch está preparando el clip (unos 15 segundos)…', 10);
      let clip = null;
      for (let i = 0; i < 20 && !clip; i++) {
        await sleep(i < 3 ? 5000 : 2500);
        const [x] = await Tw.get('clips?id=' + id);
        if (x) clip = x;
        step('Twitch está preparando el clip…', 10 + i * 4);
      }
      const url = clip ? clip.url : 'https://clips.twitch.tv/' + id;
      const own = c.id === Me.id;
      if (isAndroid() && own) {
        const [d] = await Tw.get(`clips/downloads?editor_id=${Me.id}&broadcaster_id=${c.id}&clip_id=${id}`);
        const src = d && (d.portrait_download_url || d.landscape_download_url);
        if (!src) throw new Error('Twitch no da el vídeo del clip (vuelve a entrar en Ajustes → Cuenta para darle permiso). El clip está en ' + url);
        step('Bajando el clip…', 0);
        await new Promise((ok, fail) => {
          window.__zenClip = s => {
            if (s.state === 'download') step('Bajando el clip…', s.pct * 0.4);
            if (s.state === 'crop') step('Pasándolo a vertical…', 40 + s.pct * 0.55);
            if (s.state === 'save') step('Guardando en la galería…', 98);
            if (s.state === 'done') { ok(); done(s.uri, url, edit); }
            if (s.state === 'error') fail(new Error(s.msg));
          };
          ZenAndroid.clip(JSON.stringify({ id, url: src, pos: Cfg.ui('clipPos', 'center'), portrait: !!d.portrait_download_url }));
        });
      } else {
        $('mbox').innerHTML = `<h2>Clip listo <button class="sbtn" data-close>✕</button></h2>
          <p>${clip ? esc(clip.title || '') : 'Twitch aún lo está procesando, en un momento estará.'}</p>
          <div class="url" style="display:flex;gap:6px"><input class="inp" style="flex:1" readonly value="${esc(url)}"><button class="btn sm ghost" id="clCp">Copiar</button></div>
          <p style="font-size:12px">En el editor de Twitch puedes recortarlo, pasarlo a vertical y compartirlo a TikTok.</p>
          <div class="btns"><button class="btn ghost" id="clOpen">Ver</button><button class="btn" id="clEdit">Abrir el editor</button></div>`;
        $('mbox').querySelector('[data-close]').onclick = () => Modal.close();
        $('clCp').onclick = () => { zen.copy(url); toast('Enlace copiado'); };
        $('clOpen').onclick = () => zen.open(url);
        $('clEdit').onclick = () => zen.open(edit);
        zen.copy(url);
      }
    } catch (e) {
      const b = $('mbox');
      if (b.querySelector('#clSt')) { b.querySelector('#clSt').style.color = '#ff8f8f'; b.querySelector('#clSt').textContent = e.message; }
      else toast(e.message, true);
    }
    busy = false;
  }
  function done(uri, url, edit) {
    $('mbox').innerHTML = `<h2>¡Clip en vertical! <button class="sbtn" data-close>✕</button></h2>
      <p>Guardado en la galería (Películas/ZenChat), en 1080×1920.</p>
      <div class="btns" style="justify-content:stretch;flex-direction:column">
        <button class="btn" id="clTk" style="height:44px">Compartir en TikTok</button>
        <button class="btn ghost" id="clSh" style="height:40px">Compartir en otra app…</button>
        <button class="btn ghost" id="clVw" style="height:40px">Verlo</button>
        <button class="btn ghost" id="clLn" style="height:40px">Copiar el enlace de Twitch</button></div>`;
    $('mbox').querySelector('[data-close]').onclick = () => Modal.close();
    $('clTk').onclick = () => ZenAndroid.share(uri, true);
    $('clSh').onclick = () => ZenAndroid.share(uri, false);
    $('clVw').onclick = () => ZenAndroid.view(uri);
    $('clLn').onclick = () => { zen.copy(url); toast('Enlace copiado'); };
  }
  return { make };
})();
