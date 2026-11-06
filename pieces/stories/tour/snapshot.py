# /// script
# dependencies = ["websocket-client"]
# ///
"""Harvest a real screen from a running web app into a static fragment for the tour window.

  uv run snapshot.py http://localhost:3000/projects --selector "#app" --size 1200x710 \
      --out fragments/projects.html --scope projects \
      --hook "button.new-project=new" --hook "[data-testid=share]=share"

It opens the page in headless Chrome at the window's size, lets it settle (reduced motion, so entrance
animations are already finished), optionally runs --before JavaScript to reach a state (open a menu, type
in a field, switch a tab), then copies the element with every computed style written into one scoped
<style> block: no app code, no framework, no network. Images, backgrounds and canvases are inlined as data
URIs (unless --no-inline) and the page's @font-face rules come along. Layout is frozen in pixels, exactly
as the browser drew it.

  --hook "css=name"   adds data-tour="name" to the first match, so script.js can say '@name'
  --before "js"       run before capturing (repeatable; each may return a promise)
  --wait 1.5          seconds to settle after load and after each --before
  --scope name        class prefix for the fragment's rules (one per fragment on a page)
  --header "K: V"     extra request header (an auth cookie for a signed-in screen, say)
  --mobile            a phone: mobile viewport, touch events, an iPhone user agent (a mobile web build at 390x844)

Capture each state you need (empty, filled, menu open) as its own fragment and switch between them in the
script with show()/hide(). Text stays real text, so it's sharp at any zoom.
"""
import argparse, json, os, subprocess, sys, tempfile, time, urllib.request
import websocket

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for c in ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"]:
    if not os.path.exists(CHROME) and os.path.exists(c): CHROME = c

SERIALIZE = r"""
(async (rootSel, scope, inline, hooks) => {
  const root = document.querySelector(rootSel);
  if (!root) return { error: 'nothing matches ' + rootSel };
  for (const [s, name] of hooks) { const e = root.matches(s) ? root : root.querySelector(s); if (e) e.setAttribute('data-tour', name); else console.warn('hook: nothing matches ' + s); }
  const SVG = 'http://www.w3.org/2000/svg';
  const INHERITED = new Set(['color','font-family','font-size','font-style','font-weight','font-stretch','font-variant','font-feature-settings','font-variation-settings','font-kerning','font-optical-sizing',
    'line-height','letter-spacing','word-spacing','text-align','text-transform','text-indent','text-shadow','white-space','white-space-collapse','text-wrap','text-wrap-mode','word-break','overflow-wrap',
    'visibility','cursor','list-style-type','list-style-position','list-style-image','direction','quotes','tab-size','hyphens','-webkit-font-smoothing','text-rendering','fill','fill-opacity','fill-rule',
    'stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-opacity','stroke-dasharray','stroke-dashoffset','stroke-miterlimit','paint-order','accent-color','color-scheme',
    'border-collapse','border-spacing','caption-side','empty-cells','font-synthesis','-webkit-text-stroke-width','text-underline-position','orphans','widows']);
  const KEEP_WEBKIT = /^-webkit-(font-smoothing|line-clamp|box-orient|text-fill-color|background-clip|mask|text-stroke|box-decoration-break|user-select)/;
  const skip = (p) => /^(transition|animation|will-change|view-transition|offset|scroll-timeline|view-timeline|anchor|position-try|inset-(block|inline)|block-size|inline-size|min-block|min-inline|max-block|max-inline|d$|cx$|cy$|r$|rx$|ry$|x$|y$)/.test(p)
    || /-(block|inline)(-|$)/.test(p) || p.startsWith('--') || /^border-(start|end)-/.test(p) || (p.startsWith('-webkit-') && !KEEP_WEBKIT.test(p)) || p === 'perspective-origin' || p === 'content-visibility';
  // defaults, read off fresh elements in a blank frame
  const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;left:-9999px;width:800px;height:600px;border:0'; document.body.append(fr);
  const fd = fr.contentDocument; fd.open(); fd.write('<!doctype html><html><body></body></html>'); fd.close();
  const defs = new Map();
  const defaultsFor = (el) => {
    const k = (el.namespaceURI === SVG ? 'svg:' : '') + el.localName; if (defs.has(k)) return defs.get(k);
    const d = el.namespaceURI === SVG ? fd.createElementNS(SVG, el.localName) : fd.createElement(el.localName);
    const host = el.namespaceURI === SVG && el.localName !== 'svg' ? fd.body.appendChild(fd.createElementNS(SVG, 'svg')) : fd.body;
    host.appendChild(d); const cs = fr.contentWindow.getComputedStyle(d), o = {};
    for (let i = 0; i < cs.length; i++) o[cs[i]] = cs.getPropertyValue(cs[i]);
    defs.set(k, o); return o;
  };
  const abs = (u) => { try { return new URL(u, location.href).href; } catch (e) { return u; } };
  const cache = new Map();
  const dataURI = async (u) => {
    if (!inline || u.startsWith('data:')) return u;
    if (cache.has(u)) return cache.get(u);
    const p = fetch(u).then((r) => r.ok ? r.blob() : null).then((b) => !b || b.size > 3e6 ? u : new Promise((res) => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(b); })).catch(() => u);
    cache.set(u, p); return p;
  };
  const urls = async (v) => { const m = [...v.matchAll(/url\(["']?([^"')]+)["']?\)/g)]; for (const x of m) v = v.replace(x[0], `url("${await dataURI(abs(x[1]))}")`); return v; };
  const bodies = new Map(); let nRule = 0;
  const ruleFor = async (cs, parentCs, el, pseudo) => {
    const d = defaultsFor(el), out = [];
    for (let i = 0; i < cs.length; i++) {
      const p = cs[i]; if (skip(p)) continue;
      let v = cs.getPropertyValue(p);
      if (INHERITED.has(p)) { if (parentCs && !pseudo ? parentCs.getPropertyValue(p) === v : d[p] === v) continue; }
      else if (d[p] === v) continue;
      if (p === 'transform-origin' && cs.getPropertyValue('transform') === 'none') continue;
      if (p !== 'color' && p !== 'background-color' && /-color$/.test(p) && v === cs.color) continue;   // follows currentColor anyway
      if (v.includes('url(')) v = await urls(v);
      out.push(`${p}:${v}`);
    }
    return out.join(';');
  };
  const clsFor = (body) => { if (!bodies.has(body)) bodies.set(body, `${scope}-${(nRule++).toString(36)}`); return bodies.get(body); };
  const pseudoRules = [];
  const walk = async (el, parentCs, isRoot) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' && !isRoot) return null;
    const tag = el.localName;
    if (['script', 'noscript', 'template', 'link', 'meta', 'style'].includes(tag)) return null;
    let out;
    if (tag === 'canvas') { out = document.createElement('img'); try { out.src = el.toDataURL(); } catch (e) {} }
    else if (tag === 'iframe' || tag === 'video') { out = document.createElement('div'); if (tag === 'video' && el.poster) out.style.background = `url("${await dataURI(abs(el.poster))}") center/cover`; }
    else out = el.namespaceURI === SVG ? document.createElementNS(SVG, tag) : document.createElement(tag);
    for (const a of el.attributes) {
      const n = a.name;
      if (n === 'style' || n === 'class' || n.startsWith('on') || n === 'srcset' || n === 'loading') continue;
      let v = a.value;
      if ((n === 'src' || n === 'poster') && tag !== 'iframe') v = await dataURI(abs(el[n] && typeof el[n] === 'string' ? el[n] : v));
      else if (n === 'href' && tag === 'a') v = abs(v);
      else if ((n === 'href' || n === 'xlink:href') && el.namespaceURI === SVG && !v.startsWith('#')) v = await dataURI(abs(v));
      try { out.setAttribute(n, v); } catch (e) {}
    }
    if (tag === 'img' && el.currentSrc) out.setAttribute('src', await dataURI(el.currentSrc));
    if (tag === 'input' || tag === 'textarea') { out.setAttribute('value', el.value); if (tag === 'textarea') out.textContent = el.value; if (el.checked) out.setAttribute('checked', ''); out.setAttribute('tabindex', '-1'); }
    if (tag === 'a' || tag === 'button') out.setAttribute('tabindex', '-1');
    let body = await ruleFor(cs, parentCs, el, false);
    if (isRoot) {   // a transparent root takes the colour it sat on, so stacked states don't show through
      let bg = cs.backgroundColor, a = el.parentElement;
      while (a && /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) { bg = getComputedStyle(a).backgroundColor; a = a.parentElement; }
      if (/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) bg = getComputedStyle(document.documentElement).backgroundColor;
      body = `position:relative;${body};background-color:${/rgba\(0, 0, 0, 0\)/.test(bg) ? '#fff' : bg}`;
    }
    const cls = clsFor(body); out.setAttribute('class', ((el.getAttribute('class') || '') + ' ' + cls).trim());
    for (const ps of ['::before', '::after', '::marker', '::placeholder']) {
      const pc = getComputedStyle(el, ps);
      if ((ps === '::before' || ps === '::after') && (pc.content === 'none' || pc.content === 'normal')) continue;
      if (ps === '::marker' && cs.display !== 'list-item') continue;
      if (ps === '::placeholder' && tag !== 'input' && tag !== 'textarea') continue;
      const pb = await ruleFor(pc, cs, el, true);
      if (pb) pseudoRules.push(`.${scope} .${cls}${ps}{${pb}${ps.length < 9 && pc.content ? `;content:${pc.content}` : ''}}`);
    }
    for (const ch of el.childNodes) {
      if (ch.nodeType === 3) out.appendChild(document.createTextNode(ch.textContent));
      else if (ch.nodeType === 1) { const c = await walk(ch, cs, false); if (c) out.appendChild(c); }
    }
    return out;
  };
  const tree = await walk(root, root.parentElement ? getComputedStyle(root.parentElement) : null, true);
  // inherited values the root gets from its ancestors
  const rcs = getComputedStyle(root), base = [];
  for (const p of INHERITED) { const v = rcs.getPropertyValue(p); if (v) base.push(`${p}:${v}`); }
  const r = root.getBoundingClientRect();
  tree.classList.add(scope);
  tree.setAttribute('data-snapshot', location.href);
  // fonts
  const faces = [];
  for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch (e) { continue; }
    const walkR = async (rs) => { for (const ru of rs) { if (ru.type === 5) { let t = ru.cssText; const m = [...t.matchAll(/url\(["']?([^"')]+)["']?\)/g)]; for (const x of m) t = t.replace(x[0], `url("${await dataURI(new URL(x[1], sh.href || location.href).href)}")`); faces.push(t); } else if (ru.cssRules) await walkR(ru.cssRules); } };
    await walkR(rules); }
  for (const sh of document.styleSheets) { try { sh.cssRules; } catch (e) { if (sh.href && /font/i.test(sh.href)) faces.unshift(`@import url("${sh.href}");`); } }
  const css = [`.${scope}{${base.join(';')};box-sizing:border-box;width:${r.width}px;height:${r.height}px;overflow:hidden}`,
    ...[...bodies].map(([b, c]) => `.${scope} .${c},.${c}.${scope}{${b}}`), ...pseudoRules];
  fr.remove();
  return { html: tree.outerHTML, css: css.join('\n'), faces: faces.join('\n'), n: bodies.size, w: r.width, h: r.height };
})
"""

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("url"); ap.add_argument("--selector", default="body"); ap.add_argument("--size", default="1200x710")
ap.add_argument("--out", required=True); ap.add_argument("--scope", default=None)
ap.add_argument("--hook", action="append", default=[]); ap.add_argument("--before", action="append", default=[])
ap.add_argument("--wait", type=float, default=1.5); ap.add_argument("--port", type=int, default=9705)
ap.add_argument("--no-inline", action="store_true"); ap.add_argument("--motion", action="store_true", help="don't emulate reduced motion")
ap.add_argument("--header", action="append", default=[]); ap.add_argument("--dpr", type=float, default=1)
ap.add_argument("--mobile", action="store_true", help="a phone: mobile viewport, touch, an iPhone user agent (for a mobile web build)")
a = ap.parse_args()
w, h = map(int, a.size.split("x"))
scope = a.scope or "snap-" + os.path.splitext(os.path.basename(a.out))[0].replace("_", "-")
prof = tempfile.mkdtemp(prefix="tour-snapshot-")
proc = subprocess.Popen([CHROME, "--headless=new", f"--remote-debugging-port={a.port}", "--remote-allow-origins=*",
                         f"--user-data-dir={prof}", "--hide-scrollbars", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    tabs = []
    for _ in range(80):
        try: tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{a.port}/json").read()); break
        except Exception: time.sleep(0.2)
    ws = websocket.create_connection([t for t in tabs if t["type"] == "page"][0]["webSocketDebuggerUrl"], timeout=120, suppress_origin=True)
    n = [0]; logs = []
    def cmd(method, **params):
        n[0] += 1; ws.send(json.dumps({"id": n[0], "method": method, "params": params}))
        while True:
            m = json.loads(ws.recv())
            if m.get("method") == "Runtime.consoleAPICalled": logs.append(" ".join(str(x.get("value", "")) for x in m["params"]["args"]))
            if m.get("method") == "Runtime.exceptionThrown": logs.append("exception: " + m["params"]["exceptionDetails"].get("text", ""))
            if m.get("id") == n[0]:
                if "error" in m: raise RuntimeError(m["error"])
                return m.get("result", {})
    def js(expr):
        r = cmd("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
        if r.get("exceptionDetails"): raise RuntimeError(r["exceptionDetails"].get("exception", {}).get("description", "js error"))
        return r.get("result", {}).get("value")
    cmd("Runtime.enable"); cmd("Page.enable"); cmd("Network.enable")
    if a.header: cmd("Network.setExtraHTTPHeaders", headers=dict(x.split(":", 1) for x in a.header))
    cmd("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=a.dpr, mobile=a.mobile)
    if a.mobile:
        cmd("Emulation.setTouchEmulationEnabled", enabled=True, maxTouchPoints=5)
        cmd("Emulation.setUserAgentOverride", userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")
    if not a.motion: cmd("Emulation.setEmulatedMedia", features=[{"name": "prefers-reduced-motion", "value": "reduce"}])
    cmd("Page.navigate", url=a.url); time.sleep(a.wait + 1)
    js("document.fonts && document.fonts.ready.then(() => true)")
    for b in a.before:
        js(f"(async () => {{ {b} }})()"); time.sleep(a.wait)
    hooks = [x.rsplit("=", 1) for x in a.hook]
    res = js(f"{SERIALIZE}({json.dumps(a.selector)}, {json.dumps(scope)}, {json.dumps(not a.no_inline)}, {json.dumps(hooks)})")
    if not res or res.get("error"): sys.exit(f"snapshot failed: {res and res.get('error')}\n" + "\n".join(logs))
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    frag = (f"<!-- snapshot of {a.url} ({a.selector}) at {w}x{h}, {time.strftime('%Y-%m-%d %H:%M')}. Regenerate rather than hand-edit. -->\n"
            f"<style>\n{res['faces']}\n{res['css']}\n</style>\n{res['html']}\n")
    open(a.out, "w", encoding="utf-8").write(frag)
    print(f"{a.out}: {res['w']:.0f}x{res['h']:.0f}px, {res['n']} style rules, {len(frag) / 1024:.0f} KB")
    for l in logs[-10:]: print("  console:", l)
finally:
    proc.terminate()
