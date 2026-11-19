'use strict';
// Lo común de los overlays: conectarse a ZenChat y reconectarse solo si la app
// se cierra y se vuelve a abrir (OBS no tiene que recargar nada).
const Zen = (() => {
  const handlers = {};
  let es = null, retry = 1000;
  const q = new URLSearchParams(location.search);
  function connect(w) {
    try { es && es.close(); } catch {}
    es = new EventSource('/events?w=' + encodeURIComponent(w));
    es.onopen = () => { retry = 1000; document.documentElement.classList.remove('off'); };
    es.onerror = () => {
      document.documentElement.classList.add('off');
      es.close();
      setTimeout(() => connect(w), retry);
      retry = Math.min(retry * 2, 15000);
    };
    for (const k of Object.keys(handlers)) es.addEventListener(k, e => { try { handlers[k](JSON.parse(e.data)); } catch (err) { console.error(err); } });
  }
  return {
    q,
    on(kind, fn) { handlers[kind] = fn; return this; },
    start(w) { connect(w); },
    done(data) { fetch('/api/done', { method: 'POST', body: JSON.stringify(data) }).catch(() => {}); },
    media(p) { return !p ? '' : /^(https?:|data:)/.test(p) ? p : '/' + p.replace(/^\//, ''); },
  };
})();
