// Para probar los overlays sin Electron: node tools/serve.js
// Overlays en http://127.0.0.1:47830 y, para las pruebas, un control en :47831
// (POST /b {kind,data,only} manda algo a los overlays; POST /set {k,v} cambia la config).
const http = require('http');
const path = require('path');
const os = require('os');
const { Store } = require('../src/store');
const { createServer } = require('../src/server');

const dir = path.join(os.tmpdir(), 'zenchat-prueba');
const store = new Store(dir);
const srv = createServer({ store, root: path.join(__dirname, '..') });
srv.listen().then(ok => console.log(ok ? 'overlays en http://127.0.0.1:47830' : 'puerto ocupado'));

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.end(); return; }
  let b = '';
  req.on('data', d => { b += d; });
  req.on('end', () => {
    const j = b ? JSON.parse(b) : {};
    if (req.url === '/b') srv.broadcast(j.kind, j.data, j.only);
    if (req.url === '/set') { store.set(j.k, j.v); if (j.k === 'overlayState') srv.pushState(); else srv.pushConfig(); }
    if (req.url === '/media') { const p = store.addMedia(j.name, Buffer.from(j.b64, 'base64')); res.end(JSON.stringify(p)); return; }
    res.end('{}');
  });
}).listen(47831, '127.0.0.1');
