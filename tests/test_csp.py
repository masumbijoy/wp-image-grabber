exec(open('test_ext.py').read().split("with sync_playwright() as p:")[0])
class H(Q):
    def end_headers(self):
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; require-trusted-types-for 'script'; object-src 'none'")
        super().end_headers()
S3 = socketserver.ThreadingTCPServer(('127.0.0.1', 8126), functools.partial(H, directory='site')); threading.Thread(target=S3.serve_forever, daemon=True).start()
with sync_playwright() as p:
    ctx, sw = launch(p, variant('D', ['http://site.test/*']))
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append('C:'+m.text[:200]) if m.type=='error' else None)
    pg.goto('http://site.test:8126/store/')
    r = sw.evaluate("async (u)=>{const [t]=await chrome.tabs.query({url:u}); await inject(t); return await chrome.action.getBadgeText({tabId:t.id});}", 'http://site.test:8126/store/')
    pg.wait_for_timeout(1500)
    pg.set_viewport_size({'width':1000,'height':900}); pg.screenshot(path='csp.png'); print('badge:', repr(r), 'panel:', pg.evaluate("!!window.__wpigGrab"), errs)
    ctx.close()
