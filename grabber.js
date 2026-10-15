(() => {
  if (window.__wpigGrab) { window.__wpigGrab.show(); return; }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  const IMG_RE = /\.(jpe?g|png|webp|gif|avif|bmp)(\?.*)?$/i;
  const SIZE_RE = /-\d+x\d+(\.\w+)(\?.*)?$/;
  const uniq = a => a.filter((v, i) => v && a.indexOf(v) === i);

  /* ---------- extension bridge (optional; absent when used as a bookmarklet) ---------- */
  const pending = new Map();
  let rid = 0, bridgeOn = false;
  window.addEventListener('message', e => {
    const d = e.data;
    if (e.source !== window || !d || d.__wpig !== 'res') return;
    const f = pending.get(d.id);
    if (f) { pending.delete(d.id); f(d.result); }
  });
  const ext = (payload, timeout = 40000) => new Promise(res => {
    const id = ++rid;
    const t = setTimeout(() => { pending.delete(id); res(null); }, timeout);
    pending.set(id, r => { clearTimeout(t); res(r); });
    window.postMessage({ __wpig: 'req', id, payload }, '*');
  });

  /* ---------- zip (store-only) ---------- */
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = crcT[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function makeZip(files) {
    const enc = new TextEncoder(), parts = [], cd = [];
    let off = 0;
    const now = new Date();
    const dt = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const tm = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    for (const f of files) {
      const nm = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, tm, true); lh.setUint16(12, dt, true); lh.setUint32(14, crc, true); lh.setUint32(18, sz, true);
      lh.setUint32(22, sz, true); lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nm, f.data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, tm, true); ch.setUint16(14, dt, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, sz, true); ch.setUint32(24, sz, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
      cd.push(new Uint8Array(ch.buffer), nm);
      off += 30 + nm.length + sz;
    }
    const cdSize = cd.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...cd, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }

  /* ---------- panel ---------- */
  const host = document.createElement('div');
  host.id = '__wpig_host';
  host.style.cssText = 'all:initial;position:fixed;top:12px;right:12px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  /* pages with “Trusted Types” only accept HTML through a policy */
  let tt = s => s;
  try { if (window.trustedTypes && trustedTypes.createPolicy) { const pol = trustedTypes.createPolicy('wpig-' + Math.random().toString(36).slice(2, 8), { createHTML: x => x }); tt = x => pol.createHTML(x); } } catch (e) { /* no policy allowed */ }
  root.innerHTML = tt(`
<style>
  *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  .p{width:392px;max-height:92vh;overflow:auto;background:#fff;color:#1c1c1e;border:1px solid #d0d0d5;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.25);font-size:13px}
  .h{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #e6e6ea;position:sticky;top:0;background:#fff;z-index:1}
  .h b{font-size:14px}
  .v{font-weight:400;font-size:11px;color:#888;margin-left:4px}
  .x{border:0;background:none;font-size:18px;cursor:pointer;color:#666}
  .b{padding:12px 14px}
  .g{display:grid;grid-template-columns:1fr 1fr;gap:8px 10px}
  label{display:block;font-size:11px;color:#555;margin-bottom:2px}
  input[type=text],input[type=number],select{width:100%;padding:6px 8px;border:1px solid #c8c8ce;border-radius:6px;font-size:13px;background:#fff;color:#1c1c1e}
  .full{grid-column:1/-1}
  .chk{display:flex;gap:6px;align-items:center;font-size:12px;color:#333;margin:2px 0}
  .chk label{margin:0;font-size:12px;color:#333}
  button.btn{padding:8px 12px;border-radius:8px;border:1px solid #1a73e8;background:#1a73e8;color:#fff;font-size:13px;cursor:pointer}
  button.btn.sec{background:#fff;color:#1a73e8}
  button.btn:disabled{opacity:.45;cursor:default}
  .row{display:flex;gap:8px;margin-top:10px}
  .bar{height:6px;background:#e6e6ea;border-radius:3px;margin-top:10px;overflow:hidden}
  .bar i{display:block;height:100%;width:0;background:#1a73e8;transition:width .15s}
  .log{margin-top:10px;max-height:150px;overflow:auto;background:#f6f6f8;border-radius:6px;padding:6px 8px;font:11px/1.45 ui-monospace,Menlo,monospace;white-space:pre-wrap;color:#333}
  .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-top:10px;max-height:190px;overflow:auto}
  .grid div{position:relative;aspect-ratio:1;border:2px solid #1a73e8;border-radius:4px;overflow:hidden;cursor:pointer;background:#f0f0f0}
  .grid div.off{border-color:#ccc;opacity:.35}
  .grid img{width:100%;height:100%;object-fit:cover;display:block}
  .grid span{position:absolute;left:2px;top:2px;background:rgba(0,0,0,.6);color:#fff;font-size:9px;padding:0 3px;border-radius:3px}
  .muted{color:#777;font-size:11px;margin-top:6px}
  .warn{display:none;margin-top:8px;padding:8px;border-radius:6px;background:#fff4e5;color:#7a4b00;font-size:12px}
  .warn button{margin-top:6px}
  @media (prefers-color-scheme:dark){
    .p,.h{background:#1f1f23;color:#eee;border-color:#3a3a40}.h{border-color:#3a3a40}
    input[type=text],input[type=number],select{background:#2a2a2f;color:#eee;border-color:#44444a}
    label,.chk label{color:#bbb}.log{background:#2a2a2f;color:#ddd}.bar{background:#3a3a40}.muted{color:#999}.x{color:#aaa}
    button.btn.sec{background:#1f1f23}.warn{background:#3a2e1a;color:#ffd699}
  }
</style>
<div class="p">
  <div class="h"><b>WP Image Grabber <span class="v" id="ver"></span></b><button class="x" id="close" title="Close">×</button></div>
  <div class="b">
    <div class="g">
      <div class="full"><label>What to collect</label>
        <select id="mode">
          <option value="auto">Auto-detect (recommended)</option>
          <option value="products">Product grid (shop / WooCommerce)</option>
          <option value="posts">Blog posts – featured images</option>
          <option value="content">Galleries &amp; images inside content</option>
          <option value="all">Every image on the page (not header / footer)</option>
        </select></div>
      <div><label>Product image to take</label>
        <select id="src"><option value="page">Product page – main photo, full size</option><option value="hover">Hover image (2nd photo)</option><option value="main">Shop grid – main image (1st photo)</option></select></div>
      <div><label>No hover image?</label>
        <select id="nohover"><option value="main">Use main image</option><option value="skip">Skip product</option></select></div>
      <div><label>File name prefix</label><input type="text" id="prefix"></div>
      <div><label>Start number</label><input type="number" id="start" value="1" min="0"></div>
      <div><label>Size (px, square)</label><input type="number" id="size" value="700" min="16" max="4000"></div>
      <div><label>WebP quality (%)</label><input type="number" id="qual" value="92" min="1" max="100"></div>
      <div><label>Save as</label>
        <select id="out"><option value="folder">Folder on my computer</option><option value="zip">Single .zip file</option></select></div>
      <div><label>Pause between requests (ms)</label><input type="number" id="delay" value="400" min="0" step="100"></div>
      <div class="full">
        <div class="chk"><input type="checkbox" id="pages" checked><label for="pages">Also scan the following pages (pagination)</label></div>
        <div class="chk"><input type="checkbox" id="scroll"><label for="scroll">Scroll this page first (for “load more” / lazy loading)</label></div>
        <div class="chk"><input type="checkbox" id="dedupe" checked><label for="dedupe">Remove duplicate images</label></div>
        <div class="chk"><input type="checkbox" id="csv" checked><label for="csv">Add a _map.csv (file → title → page → image URL)</label></div>
      </div>
    </div>
    <div class="row"><button class="btn" id="scan">1. Scan page</button><button class="btn sec" id="go" disabled>2. Download</button></div>
    <div class="bar"><i id="prog"></i></div>
    <div class="warn" id="warn"></div>
    <div class="grid" id="grid"></div>
    <div class="muted" id="hint"></div>
    <div class="log" id="log">Ready. Open a page with images, then press “Scan page”.</div>
  </div>
</div>`);
  /* strict style-src policies block <style> tags, but allow constructed stylesheets */
  try {
    const st = root.querySelector('style');
    if (st && root.adoptedStyleSheets !== undefined) { const sh = new CSSStyleSheet(); sh.replaceSync(st.textContent); root.adoptedStyleSheets = [sh]; st.remove(); }
  } catch (e) { /* keep the <style> tag */ }
  document.documentElement.appendChild(host);
  const $ = s => root.querySelector(s);

  const log = m => { const l = $('#log'); l.textContent += '\n' + m; l.scrollTop = l.scrollHeight; };
  const progress = f => { $('#prog').style.width = Math.round(f * 100) + '%'; };

  const isWP = () => !!(document.querySelector('meta[name=generator][content*="WordPress" i]') ||
    document.querySelector('link[rel="https://api.w.org/"], link[href*="/wp-content/"], script[src*="/wp-content/"], script[src*="/wp-includes/"], img[src*="/wp-content/"]'));

  const defPrefix = (() => {
    const parts = location.pathname.split('/').filter(p => p && p !== 'page' && !/^\d+$/.test(p));
    const last = parts[parts.length - 1];
    const base = last || location.hostname.replace(/^www\./, '').split('.')[0] || 'images';
    return base.replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '') || 'images';
  })();
  $('#prefix').value = defPrefix;
  $('#ver').textContent = window.__wpigVersion ? 'v' + window.__wpigVersion : '(bookmarklet)';

  /* ---------- settings (saved by the extension; ignored as a bookmarklet) ---------- */
  const SAVED = ['mode', 'src', 'nohover', 'size', 'qual', 'out', 'delay'], SAVED_CHK = ['pages', 'scroll', 'dedupe', 'csv'];
  let bridgeChecked = false;
  async function ensureBridge() {
    if (bridgeOn) return true;
    if (bridgeChecked) return false;
    for (let i = 0; i < 3 && !bridgeOn; i++) {
      const r = await ext({ type: 'ping' }, i ? 2500 : 1500);
      if (r && r.ok) bridgeOn = true; else await sleep(300);
    }
    if (!bridgeOn) bridgeChecked = true;
    return bridgeOn;
  }
  async function loadSettings() {
    if (!(await ensureBridge())) return;
    const s = await ext({ type: 'getSettings' }, 1500);
    const v = s && s.settings; if (!v) return;
    SAVED.forEach(k => { if (v[k] != null && $('#' + k)) $('#' + k).value = v[k]; });
    SAVED_CHK.forEach(k => { if (v[k] != null && $('#' + k)) $('#' + k).checked = !!v[k]; });
  }
  function saveSettings() {
    if (!bridgeOn) return;
    const s = {};
    SAVED.forEach(k => s[k] = $('#' + k).value);
    SAVED_CHK.forEach(k => s[k] = $('#' + k).checked);
    ext({ type: 'setSettings', settings: s }, 2000);
  }
  [...SAVED, ...SAVED_CHK].forEach(k => $('#' + k).addEventListener('change', saveSettings));
  loadSettings();

  /* ---------- image address resolution ---------- */
  const absUrl = (v, base) => { try { return new URL(v, base).href; } catch (e) { return ''; } };
  const PH_RE = /woocommerce-placeholder|placeholder|no[-_]?photo|no[-_]?image|image[-_]?coming|\/lazy\.(svg|gif|png)/i;
  let phItems = 0;
  function imgInfo(img, base, linkHref) {
    if (!img) return null;
    let thumb = '';
    for (const at of ['data-lazy-src', 'data-src', 'data-original', 'data-large_image', 'src']) {
      const v = img.getAttribute(at);
      if (v && !v.startsWith('data:')) { thumb = absUrl(v, base); break; }
    }
    if (!thumb) return null;
    if (/emoji|gravatar|avatar|spinner|\/1x1\.|\/blank\.gif|\/pixel\.(gif|png)/i.test(thumb + ' ' + img.className)) return null;
    if (PH_RE.test(thumb + ' ' + img.className)) return null;
    if (/\.svg(\?|#|$)/i.test(thumb)) return null;
    const w =parseInt(img.getAttribute('width'), 10) || 0, h = parseInt(img.getAttribute('height'), 10) || 0;
    if ((w && w < 80) || (h && h < 80)) return null;
    if (img.complete && img.naturalWidth && img.naturalWidth < 80 && img.ownerDocument === document) return null;
    const c = [];
    if (linkHref) { const l = absUrl(linkHref, base); if (IMG_RE.test(l)) c.push(l); }
    ['data-orig-file', 'data-full-url', 'data-large-file', 'data-large_image'].forEach(at => { const v = img.getAttribute(at); if (v) c.push(absUrl(v, base)); });
    c.push(thumb.replace(SIZE_RE, '$1$2'));
    if (/[?&](resize|fit|w|h|width|height)=/i.test(thumb)) c.push(thumb.split('?')[0]);
    const ss = img.getAttribute('srcset') || img.getAttribute('data-srcset') || img.getAttribute('data-lazy-srcset');
    if (ss) {
      const best = ss.split(',').map(s => s.trim().split(/\s+/)).filter(a => a[0])
        .sort((a, b) => (parseInt(b[1], 10) || 0) - (parseInt(a[1], 10) || 0))[0];
      if (best) c.push(absUrl(best[0], base));
    }
    c.push(thumb);
    /* always try the address without the “-300x300” size part first, then the others */
    return { thumb, cands: uniq([...c.map(u => u.replace(SIZE_RE, '$1$2')), ...c]) };
  }
  const nameFromUrl = u => { try { return decodeURIComponent(new URL(u).pathname.split('/').filter(Boolean).pop() || '').replace(/\.\w+$/, ''); } catch (e) { return ''; } };
  const inChrome = img => !!img.closest('header, footer, nav, aside, #wpadminbar, .site-header, .site-footer, [class*="wd-header"], [class*="footer-container"], [class*="whb-"]');
  const topLevel = list => list.filter(e => e !== document.body && !list.some(o => o !== e && o.contains(e)));

  /* ---------- parsers: each returns [{title,url,main,hover}] ---------- */
  const HOVER_RE = /(^|[\s_-])(hover|secondary|second|back|flip|alt)([\s_-]|$)/i;
  function parseProducts(doc, base) {
    const els = topLevel([...doc.querySelectorAll('li.product, .products > .product, .wc-block-grid__product, .wc-block-product, .product-grid-item, .type-product')]);
    const out = [];
    els.forEach(el => {
      const a = el.querySelector('a.woocommerce-LoopProduct-link, a.woocommerce-loop-product__link, .woocommerce-loop-product__title a, h2 a, h3 a, a[href]');
      const link = a ? absUrl(a.getAttribute('href'), base) : '';
      const infos = [...el.querySelectorAll('img')].map(i => ({ i, info: imgInfo(i, base, null) })).filter(x => x.info);
      const seen = new Set(), list = infos.filter(x => { const k = x.info.cands[0]; if (seen.has(k)) return false; seen.add(k); return true; });
      if (!list.length) {
        if ([...el.querySelectorAll('img')].some(i => PH_RE.test(i.className + ' ' + (i.getAttribute('data-src') || i.getAttribute('src') || '')))) phItems++;
        return;
      }
      const isHov = x => HOVER_RE.test(x.i.className + ' ' + (x.i.parentElement ? x.i.parentElement.className : ''));
      const main = list.find(x => !isHov(x)) || list[0];
      const hov = list.find(x => x !== main && isHov(x)) || list.find(x => x !== main) || null;
      const t = el.querySelector('.woocommerce-loop-product__title, .wc-block-grid__product-title, .product-title, h2, h3');
      out.push({ title: (t && t.textContent.trim()) || nameFromUrl(link), url: link || base, main: main.info, hover: hov ? hov.info : null });
    });
    return out;
  }
  function parsePosts(doc, base) {
    const els = topLevel([...doc.querySelectorAll('article, .wp-block-post, .hentry, .type-post, .post')]);
    const out = [];
    els.forEach(el => {
      const img = el.querySelector('img.wp-post-image, .post-thumbnail img, .wp-block-post-featured-image img, .entry-thumb img, .featured-image img') || el.querySelector('img');
      const info = imgInfo(img, base, null);
      if (!info) return;
      const a = el.querySelector('.entry-title a, .wp-block-post-title a, h1 a, h2 a, h3 a, a[rel=bookmark], a[href]');
      const link = a ? absUrl(a.getAttribute('href'), base) : base;
      out.push({ title: (a && a.textContent.trim()) || nameFromUrl(link), url: link, main: info, hover: null });
    });
    return out;
  }
  function parseContent(doc, base) {
    const sel = '.wp-block-gallery img, .blocks-gallery-grid img, .gallery img, .tiled-gallery img, .ngg-gallery-thumbnail img, .elementor-gallery-item img, .elementor-image-gallery img, .woocommerce-product-gallery img, figure.wp-block-image img, .entry-content img, .post-content img, .page-content img, article img';
    const out = [];
    doc.querySelectorAll(sel).forEach(img => {
      if (inChrome(img)) return;
      const a = img.closest('a');
      const info = imgInfo(img, base, a ? a.getAttribute('href') : null);
      if (!info) return;
      out.push({ title: (img.getAttribute('alt') || '').trim() || nameFromUrl(info.cands[0]), url: base, main: info, hover: null });
    });
    return out;
  }
  function parseAll(doc, base) {
    const out = [];
    doc.querySelectorAll('img').forEach(img => {
      if (inChrome(img)) return;
      const a = img.closest('a');
      const info = imgInfo(img, base, a ? a.getAttribute('href') : null);
      if (!info) return;
      out.push({ title: (img.getAttribute('alt') || '').trim() || nameFromUrl(info.cands[0]), url: base, main: info, hover: null });
    });
    return out;
  }
  /* main photo on a single product page */
  function parseProductPage(doc, base) {
    const gal = doc.querySelector('.woocommerce-product-gallery, .wd-gallery-images, .product-images, .images, [class*="product-gallery"], [class*="product-images"], .elementor-widget-woocommerce-product-images, .single-product .product');
    let info = null;
    if (gal) {
      const cand = [...gal.querySelectorAll('img.wp-post-image, .woocommerce-product-gallery__image img, .wd-carousel-item img, .swiper-slide img, img')]
        .filter(i => !i.closest('.flex-control-thumbs, .wd-gallery-thumb, .product-thumbnails'));
      for (const img of cand) {
        const a = img.closest('a');
        info = imgInfo(img, base, a ? a.getAttribute('href') : null);
        if (info) break;
      }
    }
    if (!info) {
      const m = doc.querySelector('meta[property="og:image"], meta[name="og:image"]');
      const v = m && m.getAttribute('content');
      if (v && !PH_RE.test(v)) { const u = absUrl(v, base); info = { thumb: u, cands: uniq([u.replace(SIZE_RE, '$1$2'), u]) }; }
    }
    return info;
  }
  async function fetchPages() {
    const todo = items.filter(it => it.url && !it.pageTried);
    if (!todo.length) return;
    const delay = +$('#delay').value || 0;
    let ok = 0;
    log(`Opening ${todo.length} product page(s) to get the main photo…`);
    for (let i = 0; i < todo.length; i++) {
      const it = todo[i]; it.pageTried = true;
      try {
        const u = new URL(it.url);
        if (u.origin === location.origin) {
          const res = await fetch(u.href, { credentials: 'same-origin' });
          if (res.ok) {
            const info = parseProductPage(new DOMParser().parseFromString(await res.text(), 'text/html'), u.href);
            if (info) { it.page = info; ok++; }
          }
        }
      } catch (e) { /* use the grid photo instead */ }
      progress((i + 1) / todo.length);
      if (i < todo.length - 1) await sleep(delay);
    }
    progress(0);
    log(`Main photo found on ${ok} of ${todo.length} product pages` + (ok < todo.length ? ' – the rest use the shop-grid photo.' : '.'));
  }
  const PARSERS = { products: parseProducts, posts: parsePosts, content: parseContent, all: parseAll };
  const MODE_NAMES = { products: 'product grid', posts: 'blog posts', content: 'gallery / content images', all: 'every image' };

  function detectMode(doc, base) {
    const p = parseProducts(doc, base); if (p.length >= 2 || phItems >= 2) return 'products';
    const a = parsePosts(doc, base); if (a.length >= 2) return 'posts';
    const c = parseContent(doc, base); if (c.length >= 1) return 'content';
    return 'all';
  }

  /* ---------- pagination ---------- */
  function nextUrl(doc, base) {
    const archive = /\b(archive|blog|home|search|paged|post-type-archive|tax-)/.test((doc.body && doc.body.className) || '');
    const sels = ['link[rel=next]', 'a[rel=next]', 'a.next.page-numbers', '.wp-block-query-pagination-next', '.woocommerce-pagination a.next',
      '.pagination a.next', '.nav-links a.next', '.pagination .next a', '.next-posts-link a', 'li.next a', 'a.next', '.nav-previous a'];
    for (const s of sels) {
      const el = doc.querySelector(s);
      if (!el || !el.getAttribute('href')) continue;
      if (s === '.nav-previous a' && !(archive && /older|next|more/i.test(el.textContent))) continue;
      return absUrl(el.getAttribute('href'), base);
    }
    const cont = doc.querySelector('.pagination, .nav-links, .woocommerce-pagination, nav.navigation, ul.page-numbers');
    if (cont) {
      const a = [...cont.querySelectorAll('a[href]')].find(x => /^\s*(next|older|›|»|→|>)/i.test(x.textContent));
      if (a) return absUrl(a.getAttribute('href'), base);
    }
    return null;
  }

  async function autoScroll() {
    let last = -1, same = 0;
    for (let i = 0; i < 40 && same < 3; i++) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await sleep(350);
      const h = document.documentElement.scrollHeight;
      same = h === last ? same + 1 : 0; last = h;
    }
    window.scrollTo(0, 0);
  }

  /* ---------- scan ---------- */
  let items = [], busy = false, modeUsed = 'products';

  async function scan() {
    if (busy) return; busy = true;
    $('#scan').disabled = true; $('#go').disabled = true;
    items = []; phItems = 0; $('#grid').textContent = ''; $('#warn').style.display = 'none'; progress(0);
    try {
      const follow = $('#pages').checked, delay = +$('#delay').value || 0;
      if ($('#scroll').checked) { log('Scrolling the page to load everything…'); await autoScroll(); }
      let doc = document, url = location.href, page = 1;
      const pagesSeen = new Set([url]), seen = new Set();
      let mode = $('#mode').value;
      while (doc && page <= 40 && items.length < 3000) {
        if (page === 1 && mode === 'auto') { mode = detectMode(doc, url); phItems = 0; log('Detected: ' + MODE_NAMES[mode] + (isWP() ? ' (WordPress site)' : ' (no WordPress signs found – trying anyway)')); }
        const found = PARSERS[mode](doc, url);
        let added = 0;
        for (const it of found) {
          const k = mode === 'products' ? it.url + '|' + it.main.cands[0] : it.main.cands[0];
          if (seen.has(k)) continue; seen.add(k); items.push(it); added++;
        }
        log(`Page ${page}: ${added} new item(s) (total ${items.length})`);
        if (!follow) break;
        const nurl = nextUrl(doc, url);
        if (!nurl || pagesSeen.has(nurl)) break;
        let nu; try { nu = new URL(nurl); } catch (e) { break; }
        if (nu.origin !== location.origin) break;
        pagesSeen.add(nurl);
        await sleep(delay);
        const res = await fetch(nurl, { credentials: 'same-origin' });
        if (!res.ok) { log(`Could not load ${nurl} (HTTP ${res.status}). Stopping the scan here.`); break; }
        doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        url = nurl; page++;
      }
      modeUsed = mode;
      if (phItems) log(`${phItems} product(s) only show a “no photo” placeholder and were left out.`);
      if (!items.length && mode === 'products' && phItems) {
        log('These products have no photos on the site yet (every one shows the shop’s placeholder), so there is nothing to download here. Add product photos in WordPress first.');
        return;
      }
      if (!items.length) { log('No images found with this setting. Try another “What to collect” option.'); return; }
      if (mode === 'products' && $('#src').value === 'page') await fetchPages();
      resolveImages();
      renderGrid();
      $('#go').disabled = false;
    } catch (e) {
      log('Scan failed: ' + e.message);
    } finally { busy = false; $('#scan').disabled = false; }
  }

  function resolveImages() {
    const want = $('#src').value, fallback = $('#nohover').value;
    let noHover = 0, noPage = 0;
    items.forEach(it => {
      let pick = it.main; it.usedMain = false;
      if (modeUsed === 'products' && want === 'page') {
        if (it.page) pick = it.page; else noPage++;
      } else if (modeUsed === 'products' && want === 'hover') {
        if (it.hover) pick = it.hover;
        else { noHover++; if (fallback === 'main') it.usedMain = true; else pick = null; }
      }
      it.img = pick ? pick.thumb : '';
      it.cands = pick ? pick.cands : [];
      it.include = !!pick;
    });
    if (noPage) log(`${noPage} product(s) use the shop-grid photo (no photo found on the product page).`);
    if (noHover) log(`${noHover} product(s) have no hover image` + (fallback === 'main' ? ' – using the main image.' : ' – skipped.'));
  }

  function renderGrid() {
    const g = $('#grid'); g.textContent = '';
    items.forEach((it, i) => {
      const d = document.createElement('div');
      if (!it.include) d.className = 'off';
      d.title = it.title + (it.usedMain ? ' (main image used)' : '');
      if (it.img) { const im = document.createElement('img'); im.src = it.img; im.loading = 'lazy'; d.appendChild(im); }
      const s = document.createElement('span'); s.textContent = i + 1; d.appendChild(s);
      d.onclick = () => { if (!it.img) return; it.include = !it.include; d.className = it.include ? '' : 'off'; updateHint(); };
      g.appendChild(d);
    });
    updateHint();
  }
  function updateHint() {
    $('#hint').textContent = `${items.filter(i => i.include).length} of ${items.length} images selected. Click a thumbnail to leave it out.`;
  }
  $('#nohover').onchange = () => { if (items.length) { resolveImages(); renderGrid(); } };
  $('#src').onchange = async () => {
    if (!items.length || busy) return;
    if (modeUsed === 'products' && $('#src').value === 'page') { busy = true; $('#go').disabled = true; try { await fetchPages(); } finally { busy = false; $('#go').disabled = false; } }
    resolveImages(); renderGrid();
  };

  /* ---------- image helpers ---------- */
  let permWarned = false;
  function showPermWarn(origin) {
    if (permWarned) return; permWarned = true;
    const w = $('#warn'); w.style.display = 'block';
    w.textContent = `Images from ${origin} are on another domain and the browser blocks reading them. Allow other domains in the extension’s settings, then scan again.`;
    const b = document.createElement('button'); b.className = 'btn sec'; b.textContent = 'Open extension settings';
    b.onclick = () => ext({ type: 'openOptions' }, 2000);
    w.appendChild(document.createElement('br')); w.appendChild(b);
  }
  const b64ToBlob = (b64, type) => { const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Blob([u8], { type }); };
  async function getBlob(it) {
    for (const u of it.cands) {
      let sameOrigin = false; try { sameOrigin = new URL(u).origin === location.origin; } catch (e) { continue; }
      try {
        const r = await fetch(u, { credentials: sameOrigin ? 'same-origin' : 'omit' });
        if (r.ok) { const b = await r.blob(); if (b.size > 0 && (!b.type || b.type.startsWith('image/'))) return { blob: b, url: u }; }
        continue;
      } catch (e) { /* blocked by CORS or network – try the extension */ }
      if (!sameOrigin && (await ensureBridge())) {
        const r = await ext({ type: 'fetchBytes', url: u });
        if (r && r.ok) return { blob: b64ToBlob(r.b64, r.type), url: u };
        if (r && r.reason === 'permission') { showPermWarn(r.origin); return null; }
      }
    }
    return null;
  }
  function gray64(bmp) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#fff'; x.fillRect(0, 0, 64, 64); x.drawImage(bmp, 0, 0, 64, 64);
    const d = x.getImageData(0, 0, 64, 64).data, out = new Float32Array(4096);
    for (let i = 0; i < 4096; i++) out[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    return out;
  }
  const mad = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
  function render(bmp, size) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, size, size);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    const k = Math.min(size / bmp.width, size / bmp.height), w = bmp.width * k, h = bmp.height * k;
    x.drawImage(bmp, (size - w) / 2, (size - h) / 2, w, h);
    return c;
  }
  const toWebp = (c, q) => new Promise(r => c.toBlob(r, 'image/webp', q));

  /* ---------- run ---------- */
  async function run() {
    if (busy) return;
    const outMode = $('#out').value;
    let dirHandle = null;
    if (outMode === 'folder') {
      if (!window.showDirectoryPicker) { log('This browser cannot save to a folder. Choose “Single .zip file”.'); return; }
      try { dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' }); }
      catch (e) { log('Folder choice cancelled.'); return; }
    }
    busy = true; $('#scan').disabled = true; $('#go').disabled = true;
    try {
      const prefix = ($('#prefix').value || 'image').trim().replace(/[^\w\-]+/g, '_');
      const size = Math.max(16, +$('#size').value || 700);
      const q = Math.min(100, Math.max(1, +$('#qual').value || 92)) / 100;
      const delay = +$('#delay').value || 0;
      const dedupe = $('#dedupe').checked, wantCsv = $('#csv').checked;
      let n = Math.max(0, parseInt($('#start').value, 10) || 0);
      const list = items.filter(i => i.include && i.cands.length);
      if (!list.length) { log('Nothing selected.'); return; }

      let sub = null;
      if (dirHandle) sub = await dirHandle.getDirectoryHandle(prefix, { create: true });
      const zipFiles = [], rows = [['file', 'title', 'page_url', 'image_url']];
      const hashes = new Map(), grays = [];
      let ok = 0, dup = 0, fail = 0;
      const pad = Math.max(3, String(n + list.length).length);

      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        progress(i / list.length);
        if (i) await sleep(delay);
        const got = await getBlob(it);
        if (!got) {
          fail++; log(`FAILED  ${it.title} (could not download image)`);
          if (permWarned && !ok) { log('Stopped: the images are on another domain that is not allowed yet (see the note above).'); break; }
          continue;
        }
        const buf = await got.blob.arrayBuffer();
        let h = null;
        if (dedupe && window.crypto && crypto.subtle) h = hex(await crypto.subtle.digest('SHA-256', buf));
        if (h && hashes.has(h)) { dup++; log(`DUPLICATE  ${it.title} = ${hashes.get(h)} (identical file) – skipped`); continue; }
        let bmp;
        try { bmp = await createImageBitmap(got.blob); }
        catch (e) { fail++; log(`FAILED  ${it.title} (unreadable image)`); continue; }
        let g = null;
        if (dedupe) {
          g = gray64(bmp);
          const hit = grays.find(s => mad(s.g, g) < 2);
          if (hit) { dup++; log(`DUPLICATE  ${it.title} ≈ ${hit.title} (same picture) – skipped`); bmp.close && bmp.close(); continue; }
        }
        const blob = await toWebp(render(bmp, size), q);
        bmp.close && bmp.close();
        if (!blob || blob.type !== 'image/webp') { fail++; log(`FAILED  ${it.title} (this browser could not encode WebP)`); continue; }
        const name = `${prefix}_${String(n).padStart(pad, '0')}.webp`;
        if (h) hashes.set(h, it.title);
        if (g) grays.push({ g, title: it.title });
        if (sub) {
          const fh = await sub.getFileHandle(name, { create: true });
          const w = await fh.createWritable(); await w.write(blob); await w.close();
        } else {
          zipFiles.push({ name: `${prefix}/${name}`, data: new Uint8Array(await blob.arrayBuffer()) });
        }
        rows.push([name, it.title, it.url, got.url]);
        n++; ok++;
        log(`${name}  ←  ${it.title}`);
      }

      if (wantCsv && ok) {
        const csv = '﻿' + rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
        if (sub) {
          const fh = await sub.getFileHandle('_map.csv', { create: true });
          const w = await fh.createWritable(); await w.write(csv); await w.close();
        } else zipFiles.push({ name: `${prefix}/_map.csv`, data: new TextEncoder().encode(csv) });
      }
      if (!sub && zipFiles.length) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(makeZip(zipFiles)); a.download = prefix + '.zip';
        document.body.appendChild(a); a.click(); a.remove();
      }
      progress(1);
      log(`\nDone: ${ok} saved, ${dup} duplicate(s) skipped, ${fail} failed.` +
        (!ok ? ' Nothing was saved.' : sub ? ` Saved in the folder “${prefix}” inside the folder you picked.` : ' The .zip is in your Downloads.'));
    } catch (e) {
      log('Error: ' + (e && e.message || e));
    } finally { busy = false; $('#scan').disabled = false; $('#go').disabled = false; }
  }

  $('#scan').onclick = scan;
  $('#go').onclick = run;
  $('#close').onclick = () => { host.style.display = 'none'; };
  window.__wpigGrab = { show() { host.style.display = ''; }, scan, run, root, get items() { return items; }, get mode() { return modeUsed; }, get bridge() { return bridgeOn; } };
})();
