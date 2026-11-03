/* Motion and feel: page transitions, sliding segmented controls, notification banners, sheet drag-to-close,
   and saving or opening files without leaving the app. */
'use strict';

// the last thing tapped, so photos can grow out of their thumbnail (Safari doesn't focus tapped buttons)
let lastTapEl = null;
document.addEventListener('pointerdown', (e) => { lastTapEl = e.target.closest && e.target.closest('[data-act]'); }, true);

// ---------------------------------------------------------------- page transitions
const NAV_DEPTH = { home: 0, projects: 0, jobs: 0, calendar: 0, pings: 0, team: 0, clients: 0, more: 0, chat: 0,
  settings: 1, profile: 1, sheets: 1, companies: 1, privacy: 1, terms: 1, project: 1, ping: 1, person: 1, client: 1, company: 2, job: 2 };
function navDepth(name, args) { if (name === 'chat') return args && args[0] ? 1 : 0; return NAV_DEPTH[name] != null ? NAV_DEPTH[name] : 1; }
function navDirection(prev, next) {
  if (!prev || !prev.name) return 'tab';
  const a = navDepth(prev.name, prev.args), b = navDepth(next.name, next.args);
  return b > a ? 'forward' : b < a ? 'back' : 'tab';
}
const canVT = () => typeof document.startViewTransition === 'function' && motionOK();
function withTransition(dir, fn) {
  if (!canVT()) { fn(); return null; }
  const html = document.documentElement; html.dataset.nav = dir;
  const t = document.startViewTransition(() => { fn(); });
  t.finished.finally(() => { if (html.dataset.nav === dir) delete html.dataset.nav; });
  t.ready.catch(() => {});
  return t;
}
// Content in a newly opened page settles in one item after another.
function markEnter() {
  const v = $('#view'); if (!v || !motionOK()) return;
  v.classList.add('enter'); clearTimeout(markEnter.t); markEnter.t = setTimeout(() => v.classList.remove('enter'), 900);
}

// ---------------------------------------------------------------- segmented controls with a sliding thumb
const segPos = {};
function segKey(seg) { return seg.dataset.seg || [...seg.children].filter((c) => !c.classList.contains('seg-thumb')).map((c) => c.textContent.trim()).join('|'); }
function paintSegs(root = document) {
  $$('.seg', root).forEach((seg) => {
    const on = seg.querySelector(':scope > .on');
    let th = seg.querySelector(':scope > .seg-thumb');
    if (!on || !on.offsetWidth) { if (th) th.remove(); seg.classList.remove('has-thumb'); return; }
    if (!th) { th = document.createElement('span'); th.className = 'seg-thumb'; th.setAttribute('aria-hidden', 'true'); seg.prepend(th); }
    const key = segKey(seg); const to = { x: on.offsetLeft, w: on.offsetWidth }; const from = segPos[key];
    if (from && (from.x !== to.x || from.w !== to.w) && !th.dataset.placed && motionOK()) {
      th.style.transition = 'none'; th.style.transform = `translateX(${from.x}px)`; th.style.width = from.w + 'px'; void th.offsetWidth; th.style.transition = '';
    }
    th.style.transform = `translateX(${to.x}px)`; th.style.width = to.w + 'px'; th.dataset.placed = '1';
    seg.classList.add('has-thumb'); segPos[key] = to;
  });
}
document.addEventListener('click', (e) => { const seg = e.target.closest('.seg'); if (seg) requestAnimationFrame(() => paintSegs(seg.parentElement || document)); });
window.addEventListener('resize', () => { clearTimeout(paintSegs.t); paintSegs.t = setTimeout(() => { $$('.seg-thumb').forEach((t) => delete t.dataset.placed); paintSegs(); }, 120); });

// ---------------------------------------------------------------- sheets: drag the handle (or the top) down to close
function enhanceSheet(wrap, close) {
  requestAnimationFrame(() => paintSegs(wrap));
  const sh = wrap.firstElementChild; if (!sh) return;
  let y0 = null, dy = 0, t0 = 0;
  const start = (e) => {
    if (matchMedia('(min-width: 700px)').matches) return;
    const onGrab = e.target.closest('.grab, .sheet-head');
    if (!onGrab || e.target.closest('button, input, a, select, textarea')) return;
    if (!e.target.closest('.grab') && sh.scrollTop > 0) return;
    y0 = e.clientY; dy = 0; t0 = Date.now(); sh.style.transition = 'none'; sh.setPointerCapture && sh.setPointerCapture(e.pointerId);
  };
  sh.addEventListener('pointerdown', start);
  sh.addEventListener('pointermove', (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sh.style.transform = `translateY(${dy}px)`; wrap.style.background = `rgba(0,0,0,${0.32 * Math.max(0, 1 - dy / 400)})`; });
  const end = () => {
    if (y0 == null) return; y0 = null;
    const fast = dy / Math.max(1, Date.now() - t0) > 0.6;
    sh.style.transition = 'transform .45s var(--spring)'; wrap.style.background = '';
    if (dy > 120 || (fast && dy > 30)) { sh.style.transform = 'translateY(110%)'; setTimeout(close, 180); }
    else sh.style.transform = '';
  };
  sh.addEventListener('pointerup', end); sh.addEventListener('pointercancel', end);
}

// ---------------------------------------------------------------- notification banners
// A frosted banner at the top: who sent it on the left, a line of the message, tap to jump straight there.
function banner(o) {
  const box = $('#toasts'); if (!box) return;
  const el = document.createElement('div');
  el.className = 'nbanner'; el.setAttribute('role', 'status');
  const who = o.from ? member(o.from) : null;
  el.innerHTML = `${who ? avatar(who, '', { link: false }) : `<span class="nb-ico">${ic(o.icon || 'bell')}</span>`}
    <div class="nb-main"><div class="nb-top"><b>${esc(o.title || (who ? who.name : 'Crewdesk'))}</b>${o.where ? `<span class="where">${esc(o.where)}</span>` : ''}<time>now</time></div>
    <div class="nb-text">${esc(o.text || '')}</div></div>`;
  box.prepend(el);
  [...box.children].filter((c) => !c.classList.contains('leaving')).slice(2).forEach((c) => leave(c));
  let timer = setTimeout(() => leave(el), 6000);
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => { clearTimeout(timer); timer = setTimeout(() => leave(el), 2500); });
  // drag up (or sideways) to dismiss; a tap opens it
  let x0 = null, y0 = 0, dx = 0, dy = 0;
  el.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; dx = dy = 0; el.style.transition = 'none'; el.setPointerCapture && el.setPointerCapture(e.pointerId); clearTimeout(timer); });
  el.addEventListener('pointermove', (e) => { if (x0 == null) return; dx = e.clientX - x0; dy = Math.min(e.clientY - y0, 12); if (Math.abs(dx) > 4 || Math.abs(dy) > 4) el.style.transform = `translate(${Math.abs(dx) > Math.abs(dy) ? dx : 0}px, ${Math.abs(dx) > Math.abs(dy) ? 0 : dy}px)`; });
  el.addEventListener('pointerup', () => {
    if (x0 == null) return; x0 = null; el.style.transition = '';
    if (dy < -30) { el.style.transform = 'translateY(-140%)'; el.style.opacity = '0'; setTimeout(() => el.remove(), 350); return; }
    if (Math.abs(dx) > 90) { el.style.transform = `translateX(${dx > 0 ? 120 : -120}%)`; el.style.opacity = '0'; setTimeout(() => el.remove(), 350); return; }
    el.style.transform = '';
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) openFromBanner(el, o.link); else timer = setTimeout(() => leave(el), 3000);
  });
  el.addEventListener('pointercancel', () => { x0 = null; el.style.transition = ''; el.style.transform = ''; });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') openFromBanner(el, o.link); });
  el.tabIndex = 0;
}
function openFromBanner(el, link) {
  if (!link) { leave(el); return; }
  if (!canVT()) { el.classList.add('opening'); location.hash = link; setTimeout(() => el.remove(), 400); return; }
  el.style.viewTransitionName = 'nb-morph';
  let target = null;
  const html = document.documentElement; html.dataset.nav = 'tab';
  const t = document.startViewTransition(() => {
    el.remove();
    if (location.hash !== link) history.pushState(null, '', link);
    route({ noVT: true });
    target = $('#view .chat-pane') || $('#view article') || $('#view .card');
    if (target) target.style.viewTransitionName = 'nb-morph';
  });
  t.finished.finally(() => { if (target) target.style.viewTransitionName = ''; delete html.dataset.nav; });
}

// ---------------------------------------------------------------- saving and opening files without leaving the app
// On iPhone (especially from the home screen) a plain download link replaces the app with the file and there's no way
// back, so files are fetched first and handed to the share sheet ("Save Image", "Save to Files") instead.
const blobCache = new Map();
function prefetchBlob(url) {
  if (!blobCache.has(url)) blobCache.set(url, fetch(url, { credentials: 'same-origin' }).then((r) => { if (!r.ok) throw new Error('Couldn’t load the file'); return r.blob(); }).catch((e) => { blobCache.delete(url); throw e; }));
  return blobCache.get(url);
}
function saveBlob(name, blob) { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
async function saveFile(url, name) {
  try {
    const blob = await prefetchBlob(url);
    const file = new File([blob], name || 'file', { type: blob.type });
    if (isTouch() && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    saveBlob(name || 'file', blob);
  } catch (e) { toast(e.message || 'Couldn’t save the file', true); }
}
let docView = null;
function openDoc(f) {
  closeDoc();
  const ext = (f.ext || (f.name || '').split('.').pop() || '').toLowerCase();
  const el = document.createElement('div');
  el.className = 'docview'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', f.name);
  const pdf = ext === 'pdf';
  el.innerHTML = `<div class="docview-top"><button class="btn sm" data-dact="close">Done</button><div class="nm">${esc(f.name)}</div><button class="btn sm icon" data-dact="save" aria-label="Save or share ${esc(f.name)}">${ic('download')}</button></div>
    ${pdf ? `<iframe src="${esc(f.url)}?view=1" title="${esc(f.name)}"></iframe>`
      : `<div class="doc-card"><span class="ext ${esc(ext)}">${esc(ext || 'file')}</span><b style="font-size:17px;overflow-wrap:anywhere">${esc(f.name)}</b><span class="muted small">${f.size ? fileSize(f.size) + ' · ' : ''}This kind of file can’t be previewed in Crewdesk.</span>
        <button class="btn primary" data-dact="save">${ic('download')}Save or open in another app</button></div>`}`;
  document.body.appendChild(el);
  const back = document.activeElement;
  docView = { el, back, pushed: true };
  history.pushState({ cdOverlay: 'doc' }, '', location.href);
  prefetchBlob(f.url).catch(() => {});
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-dact]'); if (!b) return; if (b.dataset.dact === 'close') closeDoc(); else saveFile(f.url, f.name); });
  const onKey = (e) => { if (e.key === 'Escape') closeDoc(); };
  document.addEventListener('keydown', onKey); docView.onKey = onKey;
  $('[data-dact="close"]', el).focus({ preventScroll: true });
}
function closeDoc(fromPop = false) {
  if (!docView) return;
  const d = docView; docView = null;
  document.removeEventListener('keydown', d.onKey);
  leave(d.el);
  if (!fromPop && history.state && history.state.cdOverlay === 'doc') { ignorePop++; history.back(); }
  if (d.back && d.back.isConnected) d.back.focus({ preventScroll: true });
}
let ignorePop = 0;
window.addEventListener('popstate', () => {
  if (ignorePop) { ignorePop--; return; }
  if (docView) closeDoc(true);
  else if (viewer) closeViewer(true);
});
const fileAttrs = (f) => `data-url="${esc(f.url)}" data-name="${esc(f.name)}" data-ext="${esc(f.ext || '')}" data-size="${Number(f.size) || 0}"`;
const fileFromEl = (el) => ({ url: el.dataset.url, name: el.dataset.name, ext: el.dataset.ext, size: Number(el.dataset.size) || 0 });
A['file-open'] = (el) => openDoc(fileFromEl(el));
A['file-save'] = (el) => saveFile(el.dataset.url, el.dataset.name);
