/* The painting this site sits on, the way Monet Shot frames a take.
   The page becomes a sheet with rounded corners, the painting fills the margin around it.
   Off with ?record (Monet Shot adds its own painting when you record), with ?bare, and when the
   page is shown inside a frame. Swap painting.webp for another to change it; delete the
   <script src="./backdrop/backdrop.js"> line in index.html to drop it. */
(function () {
  var q = new URLSearchParams(location.search), d = document.documentElement;
  if (q.has('record') || q.has('bare')) return;
  try { if (window.top !== window.self && !q.has('backdrop')) return; } catch (e) { return; }
  var me = document.currentScript, src = (me && me.src || '').replace(/[^/]*$/, '') + 'painting.webp';
  d.classList.add('sf-backdrop');
  var s = document.createElement('style');
  s.textContent =
    'html.sf-backdrop{--bd-m:clamp(10px,3.4vw,48px);background:#2a251f url("' + src + '") center/cover fixed!important;min-height:100%}' +
    'html.sf-backdrop>body{box-sizing:border-box;margin:var(--bd-m) auto!important;width:calc(100% - 2 * var(--bd-m));' +
    'min-height:calc(100vh - 2 * var(--bd-m));border-radius:clamp(10px,1.2vw,16px);overflow:clip;' +
    'box-shadow:0 34px 80px -28px rgba(12,10,7,.7),0 0 0 1px rgba(0,0,0,.1)}';
  (document.head || d).appendChild(s);
  // A page that painted its colour on <html> and left <body> clear keeps that colour on the sheet.
  function sheet() {
    var b = document.body; if (!b) return;
    if (getComputedStyle(b).backgroundColor.replace(/\s/g, '') !== 'rgba(0,0,0,0)') return;
    d.classList.remove('sf-backdrop');
    var c = getComputedStyle(d).backgroundColor;
    d.classList.add('sf-backdrop');
    b.style.backgroundColor = c.replace(/\s/g, '') === 'rgba(0,0,0,0)' ? '#fff' : c;
  }
  // A fixed bar across the top (or bottom) of the page stays on the sheet, not over the painting.
  var bars = [];
  function findBars() {
    var b = document.body; if (!b) return;
    bars = [];
    b.querySelectorAll('*').forEach(function (el) {
      var cs = getComputedStyle(el); if (cs.position !== 'fixed') return;
      var r = el.getBoundingClientRect();
      if (r.width >= innerWidth * 0.9 && r.height < innerHeight * 0.4) bars.push({el: el, top: r.top < innerHeight / 2});
    });
    place();
  }
  function place() {
    if (!bars.length) return;
    var m = parseFloat(getComputedStyle(document.body).marginLeft) || 0;
    var below = d.scrollHeight - scrollY - innerHeight;
    bars.forEach(function (x) {
      var s = x.el.style; s.left = m + 'px'; s.right = m + 'px'; s.width = 'auto';
      if (x.top) s.top = Math.max(0, m - scrollY) + 'px'; else s.bottom = Math.max(0, m - below) + 'px';
    });
  }
  function ready() { sheet(); findBars(); }
  document.addEventListener('DOMContentLoaded', ready);
  addEventListener('load', ready);
  addEventListener('scroll', place, {passive: true});
  addEventListener('resize', findBars);
})();
