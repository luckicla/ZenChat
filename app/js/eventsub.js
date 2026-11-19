'use strict';
// Los eventos de tu canal desde Twitch (EventSub por WebSocket): follows,
// subs, regalos, bits, raids, puntos, power-ups, hype train, encuestas…
const EventSub = (() => {
  let ws = null, session = '', kaT = null, kaSecs = 30, retry = 2000, gen = 0, failed = [];
  const TIER = t => ({ '1000': '1', '2000': '2', '3000': '3' }[t] || '1');
  const POWER = {
    gigantify_an_emote: 'Emote gigante', message_effect: 'Efecto de mensaje', celebration: 'Celebración',
    send_highlighted_message: 'Mensaje destacado', single_message_bypass_sub_mode: 'Saltarse el modo sub',
    random_sub_emote_unlock: 'Emote aleatorio', chosen_sub_emote_unlock: 'Emote elegido', chosen_modified_sub_emote_unlock: 'Emote modificado',
  };

  function subs() {
    const b = { broadcaster_user_id: Me.id }, bm = { broadcaster_user_id: Me.id, moderator_user_id: Me.id };
    return [
      ['channel.follow', '2', bm], ['channel.subscribe', '1', b], ['channel.subscription.message', '1', b], ['channel.subscription.gift', '1', b],
      ['channel.cheer', '1', b], ['channel.raid', '1', { to_broadcaster_user_id: Me.id }],
      ['channel.channel_points_custom_reward_redemption.add', '1', b], ['channel.channel_points_automatic_reward_redemption.add', '2', b],
      ['channel.hype_train.begin', '2', b], ['channel.hype_train.progress', '2', b], ['channel.hype_train.end', '2', b],
      ['channel.poll.begin', '1', b], ['channel.poll.end', '1', b], ['channel.prediction.begin', '1', b], ['channel.prediction.lock', '1', b], ['channel.prediction.end', '1', b],
      ['channel.shoutout.receive', '1', bm], ['channel.ad_break.begin', '1', b], ['channel.charity_campaign.donate', '1', b],
      ['stream.online', '1', b], ['stream.offline', '1', b], ['channel.update', '2', b],
    ];
  }

  function start() {
    if (!Me.ok || !Me.id) { stop(); return; }
    connect('wss://eventsub.wss.twitch.tv/ws');
  }
  function stop() { gen++; try { ws && ws.close(); } catch {} ws = null; session = ''; Events.setES('off'); }

  function connect(url, keepSubs) {
    const my = ++gen;
    const old = ws;
    const s = new WebSocket(url);
    s.onmessage = async e => {
      if (my !== gen) return;
      let m; try { m = JSON.parse(e.data); } catch { return; }
      const t = m.metadata && m.metadata.message_type;
      bump();
      if (t === 'session_welcome') {
        session = m.payload.session.id;
        kaSecs = m.payload.session.keepalive_timeout_seconds || 30;
        retry = 2000;
        ws = s;
        if (old && old !== s) { try { old.close(); } catch {} }
        if (!keepSubs) await subscribeAll();
        Events.setES('on');
      } else if (t === 'session_reconnect') {
        connect(m.payload.session.reconnect_url, true);
      } else if (t === 'notification') {
        handle(m.payload.subscription.type, m.payload.event, m.metadata.message_id);
      } else if (t === 'revocation') {
        console.warn('EventSub revocado', m.payload.subscription.type);
      }
    };
    s.onclose = () => {
      if (my !== gen) return;
      Events.setES('off');
      clearTimeout(kaT);
      setTimeout(() => { if (my === gen && Me.ok) connect('wss://eventsub.wss.twitch.tv/ws'); }, retry);
      retry = Math.min(retry * 2, 60000);
    };
  }
  function bump() {
    clearTimeout(kaT);
    kaT = setTimeout(() => { try { ws && ws.close(); } catch {} }, (kaSecs + 10) * 1000);
  }
  async function subscribeAll() {
    failed = [];
    for (const [type, version, condition] of subs()) {
      let r = await Tw.helix('POST', 'eventsub/subscriptions', { type, version, condition, transport: { method: 'websocket', session_id: session } });
      // (la v2 del hype train es nueva: si no va, la de antes)
      if (r.status >= 400 && type.startsWith('channel.hype_train')) r = await Tw.helix('POST', 'eventsub/subscriptions', { type, version: '1', condition, transport: { method: 'websocket', session_id: session } });
      if (r.status >= 400 && r.status !== 409) failed.push(type + ' (' + Tw.why(r) + ')');
    }
    if (failed.length) console.warn('EventSub sin:', failed);
  }

  const lastLevel = { n: 0 };
  function handle(type, e, mid) {
    const id = 'es-' + mid;
    const user = e.user_name || e.user_login || '', login = e.user_login || '';
    switch (type) {
      case 'channel.follow': return Events.emit({ id, type: 'follow', user, login });
      case 'channel.subscribe':
        if (e.is_gift) return; // ya va en «regala X subs»
        return Events.emit({ id, type: 'sub', user, login, tier: TIER(e.tier) });
      case 'channel.subscription.message':
        return Events.emit({ id, type: 'resub', user, login, tier: TIER(e.tier), months: e.cumulative_months, streak: e.streak_months || '', message: (e.message && e.message.text) || '' });
      case 'channel.subscription.gift':
        return Events.emit({ id, type: 'gift', user: e.is_anonymous ? 'Anónimo' : user, login: e.is_anonymous ? '' : login, amount: e.total, tier: TIER(e.tier), total: e.cumulative_total || '' });
      case 'channel.cheer':
        return Events.emit({ id, type: 'cheer', user: e.is_anonymous ? 'Anónimo' : user, login: e.is_anonymous ? '' : login, amount: e.bits, message: e.message || '' });
      case 'channel.raid':
        return Events.emit({ id, type: 'raid', user: e.from_broadcaster_user_name, login: e.from_broadcaster_user_login, amount: e.viewers });
      case 'channel.channel_points_custom_reward_redemption.add':
        return Events.emit({ id, type: 'points', user, login, reward: e.reward.title, cost: e.reward.cost, message: e.user_input || '' });
      case 'channel.channel_points_automatic_reward_redemption.add': {
        const r = e.reward || {};
        return Events.emit({ id, type: 'powerup', user, login, reward: POWER[r.type] || r.type, cost: r.channel_points || r.cost || '', message: (e.message && e.message.text) || '' });
      }
      case 'channel.hype_train.begin': lastLevel.n = e.level || 1; return Events.emit({ id, type: 'hypetrain', level: e.level || 1, total: e.total, phase: '¡Empieza el Hype Train!' });
      case 'channel.hype_train.progress':
        if ((e.level || 0) > lastLevel.n) { lastLevel.n = e.level; return Events.emit({ id, type: 'hypetrain', level: e.level, total: e.total, phase: '¡Sube de nivel!' }); }
        return;
      case 'channel.hype_train.end': lastLevel.n = 0; return Events.emit({ id, type: 'hypetrain', level: e.level, total: e.total, phase: 'Se acabó: ¡gracias!' });
      case 'channel.poll.begin': return Events.emit({ id, type: 'poll', title: e.title, phase: 'Encuesta', winner: (e.choices || []).map(c => c.title).join(' · ') });
      case 'channel.poll.end': {
        if (e.status === 'archived') return;
        const w = (e.choices || []).slice().sort((a, b) => (b.votes || 0) - (a.votes || 0))[0];
        return Events.emit({ id, type: 'poll', title: e.title, phase: 'Resultado', winner: w ? 'Gana: ' + w.title : '' });
      }
      case 'channel.prediction.begin': return Events.emit({ id, type: 'prediction', title: e.title, phase: 'Predicción', winner: (e.outcomes || []).map(o => o.title).join(' vs ') });
      case 'channel.prediction.lock': return Events.emit({ id, type: 'prediction', title: e.title, phase: 'Cerrada', winner: '' }, { alert: false });
      case 'channel.prediction.end': {
        const w = (e.outcomes || []).find(o => o.id === e.winning_outcome_id);
        return Events.emit({ id, type: 'prediction', title: e.title, phase: e.status === 'canceled' ? 'Cancelada' : 'Resultado', winner: w ? 'Gana: ' + w.title : '' });
      }
      case 'channel.shoutout.receive': return Events.emit({ id, type: 'shoutout', user: e.from_broadcaster_user_name, login: e.from_broadcaster_user_login, amount: e.viewer_count });
      case 'channel.ad_break.begin': return Events.emit({ id, type: 'adbreak', amount: e.duration_seconds });
      case 'channel.charity_campaign.donate': {
        const a = e.amount || {};
        return Events.emit({ id, type: 'charity', user, login, amount: ((a.value || 0) / Math.pow(10, a.decimal_places || 0)).toFixed(a.decimal_places || 0), currency: a.currency || '' });
      }
      case 'stream.online': case 'stream.offline': case 'channel.update': return Chat.refreshInfo(Me.login);
    }
  }
  return { start, stop, failed: () => failed };
})();
