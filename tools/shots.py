# Capturas de ZenChat con datos inventados: python3 tools/shots.py
# (antes: node tools/serve.js &  y  python3 -m http.server 8090 en la raíz)
import sys, time, os
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(__file__), 'shots')
os.makedirs(OUT, exist_ok=True)
MOCK = open(os.path.join(os.path.dirname(__file__), 'mock.js')).read()
COLORS = ['#ff6fd8', '#1ec8ff', '#ffa62b', '#6ff0c0', '#b98cff', '#ffd166']

def fake_img(route):
    u = route.request.url
    name = u.rstrip('/').split('/')[-2] if '7tv' in u else u.split('/')[-4] if 'jtvnw' in u else 'E'
    c = COLORS[sum(map(ord, name)) % len(COLORS)]
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><circle cx="28" cy="28" r="25" fill="{c}"/><circle cx="20" cy="22" r="4" fill="#111"/><circle cx="36" cy="22" r="4" fill="#111"/><path d="M16 34q12 12 24 0" stroke="#111" stroke-width="4" fill="none"/></svg>'
    route.fulfill(status=200, content_type='image/svg+xml', body=svg)

def block(route):
    route.fulfill(status=404, body='')

with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 860}, device_scale_factor=1.5)
    ctx.route('**/static-cdn.jtvnw.net/**', fake_img)
    ctx.route('**/cdn.7tv.app/**', fake_img)
    ctx.route('**/fonts.googleapis.com/**', block)
    ctx.add_init_script(MOCK)
    pg = ctx.new_page()
    pg.on('console', lambda m: print('console:', m.type, m.text) if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: print('PAGEERROR', e))
    pg.goto('http://127.0.0.1:8090/app/index.html')
    time.sleep(2.0)
    # unos eventos para la columna de Actividad
    for t in ['follow', 'sub', 'cheer', 'raid', 'points', 'gift', 'resub']:
        pg.evaluate(f"Events.emit(Object.assign(ZenAlerts.sample('{t}', ['moonlit_','pepito_grillo','kira_volt','LaRuinaTV','adriisco','nova_rae','adriisco'][{['follow','sub','cheer','raid','points','gift','resub'].index(t)}]), {{test:false, id:'d{t}'}}), {{alert:false}})")
    time.sleep(0.6)
    pg.screenshot(path=f'{OUT}/1-chat.png')
    # tarjeta de usuario
    el = pg.locator('.split[data-ch=luckicla] .m[data-user=adriisco] .nm').first
    box = el.bounding_box()
    pg.mouse.click(box['x'] + 10, box['y'] + 5)
    time.sleep(1.0)
    pg.screenshot(path=f'{OUT}/2-tarjeta.png')
    pg.keyboard.press('Escape')
    # autocompletar emotes
    ta = pg.locator('.split[data-ch=luckicla] textarea')
    ta.click(); ta.type('jajaja :pee')
    time.sleep(0.3)
    pg.screenshot(path=f'{OUT}/3-autocompletar.png', clip={'x': 0, 'y': 420, 'width': 760, 'height': 440})
    ta.fill('')
    # alertas
    pg.click('#views button[data-view=alerts]')
    time.sleep(1.2)
    pg.evaluate("zen.overlay('alert', Object.assign(ZenAlerts.sample('resub','adriisco')), 'preview')")
    time.sleep(1.6)
    pg.screenshot(path=f'{OUT}/4-alertas.png')
    pg.click('.atypes button[data-t=points]')
    time.sleep(0.5)
    pg.click('#eRw'); time.sleep(0.5)
    pg.evaluate("document.getElementById('page-alerts').scrollTop = 99999")
    time.sleep(0.3)
    pg.screenshot(path=f'{OUT}/5-puntos.png')
    # OBS
    pg.click('#views button[data-view=overlays]')
    time.sleep(0.8)
    pg.screenshot(path=f'{OUT}/6-obs.png')
    # ajustes
    pg.click('#views button[data-view=settings]')
    time.sleep(0.8)
    pg.screenshot(path=f'{OUT}/7-ajustes.png')
    pg.click('.theme[data-t=vapor]'); time.sleep(0.3)
    pg.click('#views button[data-view=chat]'); time.sleep(0.6)
    pg.screenshot(path=f'{OUT}/8-tema-vapor.png')
    pg.evaluate("Cfg.set('ui', Object.assign({}, Cfg.get('ui'), {theme:'zen'})); Settings.apply()")

    # overlays de OBS por separado
    o = ctx.new_page()
    o.on('pageerror', lambda e: print('OVERLAY ERROR', e))
    o.set_viewport_size({'width': 1920, 'height': 1080})
    o.goto('http://127.0.0.1:47830/alerts')
    o.add_style_tag(content='html,body{background:linear-gradient(135deg,#2d3a4a,#4a3550)!important}')
    time.sleep(0.8)
    o.evaluate("fetch('http://127.0.0.1:47831/b',{method:'POST',body:JSON.stringify({kind:'alert',data:ZenAlerts.sample('raid','LaRuinaTV'),only:'alerts'})})")
    time.sleep(1.4)
    o.screenshot(path=f'{OUT}/9-overlay-alerta.png')
    c = ctx.new_page()
    c.on('pageerror', lambda e: print('CHAT OVERLAY ERROR', e))
    c.set_viewport_size({'width': 440, 'height': 520})
    c.goto('http://127.0.0.1:47830/chat')
    c.add_style_tag(content='html,body{background:linear-gradient(135deg,#2d3a4a,#4a3550)!important}')
    time.sleep(0.6)
    # el chat de OBS recibe los mensajes desde la app: se mandan unos cuantos
    pg.evaluate("""(()=>{const ch=Chat.chans.get('luckicla');for(const m of ch.msgs.filter(x=>!x.sys&&!x.deleted).slice(-9)) zen.overlay('chat',{id:m.id,login:m.login,name:m.name,color:m.color,badges:m.badges,parts:m.parts,text:m.text},'chat');})()""")
    time.sleep(1.0)
    c.screenshot(path=f'{OUT}/10-overlay-chat.png', omit_background=False)
    g = ctx.new_page()
    g.set_viewport_size({'width': 820, 'height': 110})
    g.goto('http://127.0.0.1:47830/goal')
    g.add_style_tag(content='html,body{background:linear-gradient(135deg,#2d3a4a,#4a3550)!important}')
    time.sleep(1.6)
    g.screenshot(path=f'{OUT}/11-overlay-objetivo.png')
    # el móvil
    m = b.new_context(viewport={'width': 400, 'height': 860}, device_scale_factor=2.5, is_mobile=True, has_touch=True)
    m.route('**/static-cdn.jtvnw.net/**', fake_img); m.route('**/cdn.7tv.app/**', fake_img); m.route('**/fonts.googleapis.com/**', block)
    m.add_init_script(MOCK)
    m.add_init_script("const __o=new MutationObserver(()=>{if(document.documentElement){document.documentElement.classList.add('android');__o.disconnect()}});__o.observe(document,{childList:true,subtree:true})")
    mp = m.new_page(); mp.on('pageerror', lambda e: print('MOBILE ERROR', e))
    mp.goto('http://127.0.0.1:8090/app/index.html'); time.sleep(2)
    mp.screenshot(path=f'{OUT}/12-movil-chat.png')
    mp.evaluate("Clip.make('luckicla')"); time.sleep(0.4)
    mp.evaluate("$('mbox').innerHTML=''; (function(){ const f=document.createElement('div'); f.id='clSt'; $('mbox').innerHTML='<h2>Clip <button class=sbtn data-close>✕</button></h2><p id=clSt></p>'; })()")
    mp.evaluate("document.querySelector('#clSt').innerHTML='Pasándolo a vertical…<div style=\"height:6px;margin-top:8px;background:rgba(236,230,214,.12)\"><i style=\"display:block;height:100%;width:62%;background:var(--a1)\"></i></div>'")
    time.sleep(0.3)
    mp.screenshot(path=f'{OUT}/13-movil-clip.png')
    b.close()
print('ok')
