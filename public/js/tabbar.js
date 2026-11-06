/* Tab bar editor: a mock phone with jiggling icons. Drag to reorder, drag between the bar and "More",
   drop onto a full bar to swap, or tap the minus / plus badges. Others slide smoothly out of the way. */
'use strict';

let tabEd = null;
A['edit-tabs'] = () => openTabEditor();
function openTabEditor() {
  closeMenu(); closeSheets();
  if (tabEd) return;
  const el = document.createElement('div');
  el.className = 'tab-editor'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Edit tab bar');
  const first = esc((S.user.name || '').split(' ')[0]);
  el.innerHTML = `<div class="te-top"><button class="btn sm ghost" data-te="reset">Reset</button><b>Edit tab bar</b><button class="btn sm primary" data-te="done">Done</button></div>
    <div class="te-body">
      <div class="te-phone" aria-hidden="true"><div class="te-screen">
        <div class="te-mock-top">${brand()}<span>${esc(S.company.name)}</span></div>
        <div class="te-mock-main"><div class="te-mock-sub">${esc(new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))}</div><div class="te-mock-h">Hello, ${first}</div>
          <div class="te-mock-kpis"><i></i><i></i><i></i><i></i></div><div class="te-mock-card"></div><div class="te-mock-card short"></div></div>
      </div><div class="te-bar" data-zone="bar"></div></div>
      <div class="te-side">
        <p class="small muted te-help">Drag the buttons to rearrange them — like moving apps on an iPhone. Drag one down into <b>More</b> to take it off the bar, or drag one from More onto the bar to add or swap it. Tap <b>−</b> to remove, <b>+</b> to add. Up to four, plus More.</p>
        <div class="label" style="margin:0 4px 8px">In More</div>
        <div class="te-tray" data-zone="tray"></div>
      </div>
    </div>`;
  document.body.appendChild(el);
  tabEd = { el, tabs: myTabs().slice(), drag: null };
  paintTabEd(false);
  el.addEventListener('click', onTabEdClick);
  el.addEventListener('pointerdown', onTabEdDown);
  tabEd.onKey = (e) => { if (e.key === 'Escape') closeTabEditor(true); };
  document.addEventListener('keydown', tabEd.onKey);
  history.pushState({ cdOverlay: 'tabs' }, '', location.href);
  $('[data-te="done"]', el).focus({ preventScroll: true });
}
const teAvail = () => Object.keys(TAB_ITEMS).filter((k) => tabAllowed(k) && !tabEd.tabs.includes(k));
function teIcon(k, where) {
  const [label, icon] = k === 'more' ? ['More', 'more'] : TAB_ITEMS[k];
  const ghost = tabEd.drag && tabEd.drag.k === k ? 'ghost' : '';
  const swap = tabEd.drag && tabEd.drag.swap === k ? 'swap' : '';
  const badge = k === 'more' ? '' : where === 'bar'
    ? `<button class="te-badge minus" data-te="remove" data-k="${k}" aria-label="Remove ${label} from the tab bar">−</button>`
    : `<button class="te-badge plus" data-te="add" data-k="${k}" aria-label="Add ${label} to the tab bar">+</button>`;
  return `<div class="te-item ${where} ${ghost} ${swap} ${k === 'more' ? 'fixed' : ''}" data-k="${k}">${badge}<span class="te-ico">${ic(icon)}</span><span class="te-lbl">${label}</span></div>`;
}
function paintTabEd(animate = true) {
  if (!tabEd) return;
  const el = tabEd.el;
  const before = {};
  if (animate && motionOK()) $$('.te-item', el).forEach((n) => { before[n.dataset.k + '|' + (n.classList.contains('bar') ? 'bar' : 'tray')] = n.getBoundingClientRect(); before[n.dataset.k] = n.getBoundingClientRect(); });
  $('.te-bar', el).innerHTML = tabEd.tabs.map((k) => teIcon(k, 'bar')).join('') + teIcon('more', 'bar');
  const av = teAvail();
  $('.te-tray', el).innerHTML = av.length ? av.map((k) => teIcon(k, 'tray')).join('') : '<div class="small muted" style="grid-column:1/-1;padding:10px 4px">Everything is on your tab bar.</div>';
  $$('.te-item', el).forEach((n, i) => n.style.setProperty('--d', `${(i % 4) * -0.13}s`));
  if (!animate || !motionOK()) return;
  $$('.te-item', el).forEach((n) => {
    if (n.classList.contains('ghost')) return;
    const r0 = before[n.dataset.k]; if (!r0) { n.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.34,1.4,.64,1)' }); return; }
    const r1 = n.getBoundingClientRect(); const dx = r0.left - r1.left, dy = r0.top - r1.top;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) n.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.32,.72,0,1)' });
  });
}
function teShake(n) { if (n && motionOK()) n.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-4px)' }, { transform: 'none' }], { duration: 360 }); }
function onTabEdClick(e) {
  const b = e.target.closest('[data-te]'); if (!b || !tabEd) return;
  const a = b.dataset.te, k = b.dataset.k;
  if (a === 'done') return closeTabEditor(true);
  if (a === 'reset') { tabEd.tabs = defaultTabs().filter(tabAllowed); paintTabEd(); return; }
  if (a === 'remove') {
    if (tabEd.tabs.length <= 1) { toast('Keep at least one button on the bar', true); teShake(b.closest('.te-item')); return; }
    tabEd.tabs = tabEd.tabs.filter((x) => x !== k); paintTabEd();
  }
  if (a === 'add') {
    if (tabEd.tabs.length >= 4) { toast('The bar is full — remove one, or drag this onto one to swap'); teShake($('.te-bar', tabEd.el)); return; }
    tabEd.tabs.push(k); paintTabEd();
  }
}
// ---- dragging
function onTabEdDown(e) {
  const it = e.target.closest('.te-item'); if (!it || it.classList.contains('fixed') || e.target.closest('.te-badge') || !tabEd) return;
  e.preventDefault();
  const r = it.getBoundingClientRect();
  tabEd.drag = { k: it.dataset.k, sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, started: false, swap: null, pid: e.pointerId };
  const move = (ev) => onTabEdMove(ev), up = (ev) => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); onTabEdUp(ev); };
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
}
function onTabEdMove(e) {
  const d = tabEd && tabEd.drag; if (!d) return;
  if (!d.started) {
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return;
    d.started = true;
    const src = $(`.te-item[data-k="${d.k}"]`, tabEd.el);
    const fl = src.cloneNode(true); fl.classList.add('te-float'); fl.classList.remove('ghost');
    const r = src.getBoundingClientRect(); fl.style.width = r.width + 'px'; fl.style.height = r.height + 'px';
    document.body.appendChild(fl); d.float = fl;
    tabEd.el.classList.add('dragging'); paintTabEd(false);
  }
  d.float.style.transform = `translate(${e.clientX - d.ox}px, ${e.clientY - d.oy}px) scale(1.12)`;
  const bar = $('.te-bar', tabEd.el).getBoundingClientRect(), tray = $('.te-side', tabEd.el).getBoundingClientRect();
  const inBar = e.clientY > bar.top - 40 && e.clientY < bar.bottom + 30 && e.clientX > bar.left - 20 && e.clientX < bar.right + 20;
  const inTray = !inBar && e.clientX > tray.left && e.clientX < tray.right && e.clientY > tray.top && e.clientY < tray.bottom;
  const tabs = tabEd.tabs; const onBar = tabs.includes(d.k);
  let changed = false; let swap = null;
  if (inBar) {
    const others = $$('.te-bar .te-item:not(.fixed)', tabEd.el).filter((n) => n.dataset.k !== d.k);
    if (!onBar && tabs.length >= 4) { // full: hover over one to swap with it
      let best = null, bd = Infinity;
      others.forEach((n) => { const r = n.getBoundingClientRect(); const dd = Math.abs(r.left + r.width / 2 - e.clientX); if (dd < bd) { bd = dd; best = n.dataset.k; } });
      swap = best;
    } else {
      const idx = others.filter((n) => { const r = n.getBoundingClientRect(); return r.left + r.width / 2 < e.clientX; }).length;
      const without = tabs.filter((x) => x !== d.k);
      const next = without.slice(0, idx).concat(d.k, without.slice(idx));
      if (next.join() !== tabs.join()) { tabEd.tabs = next; changed = true; }
    }
  } else if (inTray && onBar && tabs.length > 1) { tabEd.tabs = tabs.filter((x) => x !== d.k); changed = true; }
  if (swap !== d.swap) { d.swap = swap; changed = true; }
  if (changed) paintTabEd(true);
}
function onTabEdUp() {
  const d = tabEd && tabEd.drag; if (!d) return;
  if (!d.started) { tabEd.drag = null; return; }
  if (d.swap) { const i = tabEd.tabs.indexOf(d.swap); if (i >= 0) tabEd.tabs[i] = d.k; }
  const fl = d.float; tabEd.drag = null; tabEd.el.classList.remove('dragging');
  paintTabEd(true);
  const dest = $(`.te-item[data-k="${d.k}"]`, tabEd.el);
  if (fl && dest && motionOK()) {
    const r = dest.getBoundingClientRect(); dest.style.visibility = 'hidden';
    const a = fl.animate([{ transform: fl.style.transform }, { transform: `translate(${r.left}px, ${r.top}px) scale(1)` }], { duration: 320, easing: 'cubic-bezier(.32,.72,0,1)', fill: 'forwards' });
    const fin = () => { fl.remove(); dest.style.visibility = ''; };
    a.finished.then(fin, fin);
  } else if (fl) fl.remove();
}
async function closeTabEditor(save, fromPop = false) {
  if (!tabEd) return;
  const t = tabEd; tabEd = null;
  document.removeEventListener('keydown', t.onKey);
  if (!fromPop && history.state && history.state.cdOverlay === 'tabs') { ignorePop++; history.back(); }
  leave(t.el);
  if (!save || t.tabs.join() === myTabs().join()) return;
  try {
    const r = await api('PUT', '/api/me', { prefs: { tabs: t.tabs } });
    S.user = r.user; renderShell(); route({ noVT: true }); toast('Tab bar updated');
  } catch (e) { toast(e.message, true); }
}
window.addEventListener('popstate', () => { if (tabEd) closeTabEditor(true, true); });
