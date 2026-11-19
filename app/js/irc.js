'use strict';
// El chat de Twitch (IRC por WebSocket): leer y escribir en los canales abiertos.
const IRC = (() => {
  let ws = null, want = new Set(), joined = new Set(), handlers = [], retry = 1000, pingT = null, alive = 0;
  let state = 'off';
  const userstate = new Map(); // canal → tags de USERSTATE (tus insignias y color ahí)

  function unescapeTag(v) { return v.replace(/\\s/g, ' ').replace(/\\:/g, ';').replace(/\\\\/g, '\\').replace(/\\r/g, '\r').replace(/\\n/g, '\n'); }
  // «@a=b;c=d :nick!nick@nick.tmi.twitch.tv PRIVMSG #canal :hola» → objeto
  function parse(line) {
    const m = { tags: {}, prefix: '', command: '', params: [], raw: line };
    let i = 0;
    if (line[0] === '@') {
      const sp = line.indexOf(' ');
      for (const kv of line.slice(1, sp).split(';')) { const eq = kv.indexOf('='); m.tags[eq < 0 ? kv : kv.slice(0, eq)] = eq < 0 ? '' : unescapeTag(kv.slice(eq + 1)); }
      i = sp + 1;
    }
    if (line[i] === ':') { const sp = line.indexOf(' ', i); m.prefix = line.slice(i + 1, sp); i = sp + 1; }
    const rest = line.slice(i);
    const ci = rest.indexOf(' :');
    const head = ci >= 0 ? rest.slice(0, ci) : rest;
    const parts = head.split(' ').filter(Boolean);
    m.command = parts.shift() || '';
    m.params = parts;
    if (ci >= 0) m.params.push(rest.slice(ci + 2));
    m.channel = (m.params[0] || '').startsWith('#') ? m.params[0].slice(1) : '';
    m.nick = m.prefix.split('!')[0];
    m.text = m.params.length > 1 ? m.params[m.params.length - 1] : '';
    if (m.command === 'PRIVMSG' && /^\x01ACTION (.*)\x01$/.test(m.text)) { m.action = true; m.text = m.text.replace(/^\x01ACTION (.*)\x01$/, '$1'); }
    return m;
  }

  function setState(s) { state = s; emit({ command: 'ZEN_STATE', state: s }); }
  function emit(m) { for (const f of handlers) { try { f(m); } catch (e) { console.error(e); } } }

  async function connect() {
    try { ws && ws.close(); } catch {}
    const token = await zen.token();
    setState('connecting');
    ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    ws.onopen = () => {
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership');
      if (token && Me.login) { ws.send('PASS oauth:' + token); ws.send('NICK ' + Me.login); }
      else ws.send('NICK justinfan' + Math.floor(10000 + Math.random() * 80000)); // sin sesión: solo leer
      joined.clear();
      for (const c of want) join(c, true);
      alive = Date.now();
    };
    ws.onmessage = e => {
      alive = Date.now();
      for (const line of String(e.data).split('\r\n')) {
        if (!line) continue;
        if (line.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv'); continue; }
        const m = parse(line);
        if (m.command === '001') { retry = 1000; setState('on'); }
        if (m.command === 'RECONNECT') { ws.close(); continue; }
        if (m.command === 'NOTICE' && /Login authentication failed|Improperly formatted auth/i.test(m.text)) { setState('auth'); }
        if (m.command === 'USERSTATE' || m.command === 'GLOBALUSERSTATE') { if (m.channel) userstate.set(m.channel, m.tags); }
        if (m.command === 'JOIN' && m.nick === Me.login) joined.add(m.channel);
        emit(m);
      }
    };
    ws.onclose = () => {
      if (state !== 'auth') setState('off');
      clearTimeout(pingT);
      pingT = setTimeout(connect, retry);
      retry = Math.min(retry * 2, 30000);
    };
  }
  // si no llega nada en 6 min, la conexión está muerta: otra
  setInterval(() => { if (ws && ws.readyState === 1) { try { ws.send('PING :zen'); } catch {} if (Date.now() - alive > 6 * 60e3) ws.close(); } }, 60e3);

  function join(ch, now) {
    ch = ch.toLowerCase();
    want.add(ch);
    if (ws && ws.readyState === 1 && (now || !joined.has(ch))) ws.send('JOIN #' + ch);
  }
  function part(ch) {
    ch = ch.toLowerCase();
    want.delete(ch);
    joined.delete(ch);
    if (ws && ws.readyState === 1) ws.send('PART #' + ch);
  }
  function say(ch, text, replyTo) {
    if (!ws || ws.readyState !== 1 || state !== 'on') return false;
    const tag = replyTo ? `@reply-parent-msg-id=${replyTo} ` : '';
    ws.send(`${tag}PRIVMSG #${ch.toLowerCase()} :${text.replace(/[\r\n]+/g, ' ')}`);
    return true;
  }
  return {
    parse, connect, join, part, say,
    on: f => handlers.push(f),
    state: () => state,
    me: ch => userstate.get(ch) || {},
    reconnect: () => { retry = 1000; connect(); },
  };
})();
