'use strict';
// El servidor de los overlays de OBS: http://127.0.0.1:47830/
//   /alerts  las alertas (follow, subs, bits, raids, puntos…)
//   /chat    el chat en pantalla
//   /goal    barra de objetivo (follows, subs, bits…)
//   /feed    lista de los últimos eventos
//   /label   texto con el último follow / sub / donación…
// La app le manda lo que pasa y los overlays lo reciben al momento (SSE).
// No depende de Electron: se puede probar con «node tools/serve.js».
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 47830;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.apng': 'image/apng', '.svg': 'image/svg+xml', '.webm': 'video/webm', '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.m4a': 'audio/mp4', '.flac': 'audio/flac',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const PAGES = { '/alerts': 'alerts.html', '/chat': 'chat.html', '/goal': 'goal.html', '/feed': 'feed.html', '/label': 'label.html' };

function createServer({ store, root, onClients, onAction }) {
  const clients = new Set(); // { res, w }
  const overlayDir = path.join(root, 'overlay');
  const sharedDir = path.join(root, 'app', 'shared');

  const count = () => {
    const c = {};
    for (const k of clients) c[k.w] = (c[k.w] || 0) + 1;
    return c;
  };
  const changed = () => { try { onClients && onClients(count()); } catch {} };

  function send(res, kind, data) {
    try { res.write(`event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`); } catch {}
  }
  function broadcast(kind, data, only) {
    for (const c of clients) if (!only || c.w === only) send(c.res, kind, data);
  }
  function publicConfig() {
    const d = store.get();
    return { alerts: d.alerts || null, chatbox: d.chatbox || null, goals: d.goals || [], feed: d.feedbox || null, labels: d.labels || null };
  }
  function state() { return store.get('overlayState') || { events: [], goals: {} }; }

  function file(res, f, extra) {
    fs.stat(f, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); res.end('no está'); return; }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream',
        'Content-Length': st.size, 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*', ...extra,
      });
      fs.createReadStream(f).pipe(res);
    });
  }
  const inside = (base, rel) => {
    const f = path.normalize(path.join(base, rel));
    return f.startsWith(base) ? f : null;
  };

  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const p = decodeURIComponent(u.pathname);
    if (p === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
      const c = { res, w: (u.searchParams.get('w') || 'otro').slice(0, 20) };
      clients.add(c);
      send(res, 'config', publicConfig());
      send(res, 'state', state());
      const ka = setInterval(() => { try { res.write(':\n\n'); } catch {} }, 20000);
      req.on('close', () => { clearInterval(ka); clients.delete(c); changed(); });
      changed();
      return;
    }
    if (p === '/api/config') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(publicConfig())); return; }
    if (p === '/api/state') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(state())); return; }
    if (p === '/api/done' && req.method === 'POST') { // un overlay acabó una alerta
      let b = ''; req.on('data', d => { b += d; if (b.length > 1e5) req.destroy(); });
      req.on('end', () => { try { onAction && onAction(JSON.parse(b || '{}')); } catch {} res.writeHead(204); res.end(); });
      return;
    }
    if (p === '/' || p === '/index.html') return file(res, path.join(overlayDir, 'index.html'));
    if (PAGES[p]) return file(res, path.join(overlayDir, PAGES[p]));
    if (p.startsWith('/media/')) { const f = inside(store.mediaDir, p.slice(7)); return f ? file(res, f) : (res.writeHead(403), res.end()); }
    if (p.startsWith('/shared/')) { const f = inside(sharedDir, p.slice(8)); return f ? file(res, f) : (res.writeHead(403), res.end()); }
    if (p.startsWith('/o/')) { const f = inside(overlayDir, p.slice(3)); return f ? file(res, f) : (res.writeHead(403), res.end()); }
    res.writeHead(404); res.end('no está');
  });

  return {
    port: PORT,
    clients: count,
    broadcast,
    pushConfig() { broadcast('config', publicConfig()); },
    pushState() { broadcast('state', state()); },
    listen() {
      return new Promise(ok => {
        srv.once('error', e => { console.error('overlays:', e.message); ok(false); });
        srv.listen(PORT, '127.0.0.1', () => ok(true));
      });
    },
    close() { try { srv.close(); } catch {} for (const c of clients) { try { c.res.end(); } catch {} } },
  };
}

module.exports = { createServer, PORT };
