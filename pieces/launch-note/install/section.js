// Tabs (arrow keys move between them) and a copy button that says so.
export default function init(root) {
  const tabs = [...root.querySelectorAll('[role=tab]')], said = root.querySelector('.cta-install-said');
  const pick = (t, focus) => {
    tabs.forEach((b) => { const on = b === t; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; root.querySelector('#' + b.getAttribute('aria-controls')).hidden = !on; });
    if (focus) t.focus();
  };
  const onTab = (e) => { const t = e.target.closest('[role=tab]'); if (t) pick(t); };
  const onKey = (e) => {
    const i = tabs.indexOf(document.activeElement); if (i < 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); pick(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length], true); }
  };
  const onCopy = async (e) => {
    const b = e.target.closest('.cta-install-copy'); if (!b) return;
    const txt = b.parentNode.querySelector('code').textContent;
    let ok = false;
    try { await navigator.clipboard.writeText(txt); ok = true; } catch (_) {
      const r = document.createRange(); r.selectNodeContents(b.parentNode.querySelector('code'));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      try { ok = document.execCommand('copy'); } catch (__) { ok = false; }
    }
    b.textContent = ok ? 'Copied' : 'Press ⌘C'; said.textContent = ok ? 'Copied to the clipboard' : '';
    clearTimeout(b._t); b._t = setTimeout(() => { b.textContent = 'Copy'; said.textContent = ''; }, 2000);
  };
  root.addEventListener('click', onTab); root.addEventListener('click', onCopy); root.addEventListener('keydown', onKey);
  return () => { root.removeEventListener('click', onTab); root.removeEventListener('click', onCopy); root.removeEventListener('keydown', onKey); };
}
