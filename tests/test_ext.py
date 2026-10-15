import threading, http.server, socketserver, functools, zipfile, io, json, shutil, os, sys, tempfile, csv
from playwright.sync_api import sync_playwright
from PIL import Image
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address = True
def serve(port, d):
    s = socketserver.ThreadingTCPServer(('127.0.0.1', port), functools.partial(Q, directory=d)); threading.Thread(target=s.serve_forever, daemon=True).start(); return s
S1 = serve(8124, 'site'); S2 = serve(8125, 'cdn')
SRC = 'wp-image-grabber'
def variant(name, host_perms):
    d = f'/tmp/claude-0/var_{name}'; shutil.rmtree(d, ignore_errors=True); shutil.copytree(SRC, d)
    m = json.load(open(d+'/manifest.json')); m['host_permissions'] = host_perms; json.dump(m, open(d+'/manifest.json','w')); return d
EXE = '/opt/pw-browsers/chromium'
def launch(p, extdir):
    ud = tempfile.mkdtemp()
    ctx = p.chromium.launch_persistent_context(ud, executable_path=EXE, headless=False, accept_downloads=True, args=[
        '--headless=new','--no-sandbox', f'--disable-extensions-except={extdir}', f'--load-extension={extdir}',
        '--host-resolver-rules=MAP site.test 127.0.0.1, MAP cdn.test 127.0.0.1'])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker', timeout=15000)
    return ctx, sw
def open_panel(ctx, sw, url):
    for old in [x for x in ctx.pages if x.url.startswith('http://site.test')]: old.close()
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.goto(url)
    sw.evaluate("async (u)=>{const [t]=await chrome.tabs.query({url:u}); await inject(t);}", url)
    pg.wait_for_function("()=>!!window.__wpigGrab", timeout=8000)
    pg.wait_for_function("()=>window.__wpigGrab.bridge===true || true")
    pg.wait_for_timeout(1200)   # bridge ping/settings load
    return pg, errs
def R(pg, expr): return pg.evaluate("(e)=>{const r=window.__wpigGrab.root; return eval(e)}", expr)
def run_zip(pg, prefix=None, mode='auto', extra=''):
    R(pg, f"r.querySelector('#out').value='zip'; r.querySelector('#delay').value='0'; r.querySelector('#mode').value='{mode}'; {extra} 1")
    if prefix: R(pg, f"r.querySelector('#prefix').value='{prefix}'; 1")
    R(pg, "r.querySelector('#scan').click(); 1")
    pg.wait_for_function("()=>!window.__wpigGrab.root.querySelector('#scan').disabled", timeout=30000)
    info = pg.evaluate("({mode:window.__wpigGrab.mode, n:window.__wpigGrab.items.length, bridge:window.__wpigGrab.bridge, log:window.__wpigGrab.root.querySelector('#log').textContent})")
    return info
def download(pg):
    with pg.expect_download(timeout=90000) as dl: R(pg, "r.querySelector('#go').click(); 1")
    path = tempfile.mktemp(suffix='.zip'); dl.value.save_as(path); return zipfile.ZipFile(path)
def summarize(z):
    imgs=[n for n in z.namelist() if n.endswith('.webp')]
    sizes={Image.open(io.BytesIO(z.read(n))).size for n in imgs}
    rows=list(csv.reader(io.StringIO(z.read([n for n in z.namelist() if n.endswith('.csv')][0]).decode('utf-8-sig'))))
    return imgs, sizes, rows

with sync_playwright() as p:
    print('=== Variant A: host permission for all sites (CDN fallback allowed) ===')
    A = variant('A', ['http://*/*'])
    ctx, sw = launch(p, A)
    # 1. shop with CDN images
    pg, errs = open_panel(ctx, sw, 'http://site.test:8124/shop/')
    info = run_zip(pg); print('SHOP detected:', info['mode'], 'items:', info['n'], 'bridge:', info['bridge'])
    z = download(pg); imgs, sizes, rows = summarize(z)
    print(' files:', [os.path.basename(n) for n in imgs], sizes); print(' csv rows:', rows[1:3]); print(' log tail:', R(pg,"r.querySelector('#log').textContent").splitlines()[-2:]); print(' errors:', errs)
    # 2. blog archive, pagination + dedupe + non-square
    pg, errs = open_panel(ctx, sw, 'http://site.test:8124/blog/')
    info = run_zip(pg); print('BLOG detected:', info['mode'], 'items:', info['n'])
    z = download(pg); imgs, sizes, rows = summarize(z)
    print(' files:', len(imgs), sizes); print(' dup lines:', [l for l in R(pg,"r.querySelector('#log').textContent").splitlines() if 'DUPLICATE' in l])
    im = Image.open(io.BytesIO(z.read(imgs[0]))).convert('RGB'); print(' fitted (white bars top/bottom):', im.getpixel((350,3)), im.getpixel((350,696)), '| image rows from map:', [r[3].split('/')[-1] for r in rows[1:4]])
    # 3. gallery post: full-size from lightbox link + lazy data-src
    pg, errs = open_panel(ctx, sw, 'http://site.test:8124/gallery-post/')
    info = run_zip(pg); print('GALLERY detected:', info['mode'], 'items:', info['n'])
    z = download(pg); imgs, sizes, rows = summarize(z); print(' files:', len(imgs), sizes, '| source urls:', [r[3].split('/')[-1] for r in rows[1:]])
    # 4. settings persistence through the extension
    R(pg, "r.querySelector('#size').value='640'; r.querySelector('#size').dispatchEvent(new Event('change')); 1"); pg.wait_for_timeout(500)
    print('stored settings size:', sw.evaluate("async()=>(await chrome.storage.local.get('settings')).settings.size"))
    pg2, _ = open_panel(ctx, sw, 'http://site.test:8124/blog/'); print('size after reopening on another page:', R(pg2,"r.querySelector('#size').value"))
    ext_id = sw.url.split('/')[2]
    op = ctx.new_page(); op.set_viewport_size({'width':800,'height':900}); errs2=[]; op.on('pageerror', lambda e: errs2.append(str(e)))
    op.goto(f'chrome-extension://{ext_id}/options.html'); op.wait_for_timeout(500); op.screenshot(path='options.png'); print('options page status text:', op.inner_text('#state'), '| errors:', errs2)
    pg3, _ = open_panel(ctx, sw, 'http://site.test:8124/shop/'); run_zip(pg3); pg3.wait_for_timeout(800); pg3.set_viewport_size({'width':1000,'height':900}); pg3.screenshot(path='panel_ext.png')
    ctx.close()
    print('\n=== Variant B: no permission for other domains (CDN must be refused cleanly) ===')
    B = variant('B', ['http://site.test/*'])
    ctx, sw = launch(p, B)
    pg, errs = open_panel(ctx, sw, 'http://site.test:8124/shop/')
    info = run_zip(pg, extra="r.querySelector('#delay').value='0';"); print('SHOP detected:', info['mode'], info['n'])
    R(pg, "r.querySelector('#go').click(); 1"); pg.wait_for_function("()=>/Done:/.test(window.__wpigGrab.root.querySelector('#log').textContent)", timeout=60000)
    print(' log tail:', R(pg,"r.querySelector('#log').textContent").splitlines()[-3:]); print(' warning visible:', R(pg,"getComputedStyle(r.querySelector('#warn')).display"), '|', R(pg,"r.querySelector('#warn').textContent")[:110])
    ctx.close()
S1.shutdown(); S2.shutdown()
