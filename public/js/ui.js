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
    if (!th.dataset.placed) { // a freshly drawn control: put the thumb where it was (or straight where it belongs) with no slide
      const start = from && motionOK() ? from : to;
      th.style.transition = 'none'; th.style.transform = `translateX(${start.x}px)`; th.style.width = start.w + 'px'; void th.offsetWidth; th.style.transition = '';
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
  const sheetDoc = ext === 'xlsx' && 'DecompressionStream' in window;
  const card = (msg) => `<div class="doc-card"><span class="ext ${esc(ext)}">${esc(ext || 'file')}</span><b style="font-size:17px;overflow-wrap:anywhere">${esc(f.name)}</b><span class="muted small">${f.size ? fileSize(f.size) + ' · ' : ''}${msg}</span>
        <button class="btn primary" data-dact="save">${ic('download')}Save or open in another app</button><button class="btn" data-dact="close">${ic('back')}Back to Crewdesk</button></div>`;
  el.innerHTML = `<div class="docview-top"><button class="btn sm" data-dact="close">${ic('back')}Back</button><div class="nm">${esc(f.name)}</div><button class="btn sm" data-dact="save" aria-label="Save or share ${esc(f.name)}">${ic('download')}<span class="hide-xs">Save</span></button></div>
    ${pdf ? `<iframe src="${esc(f.url)}${f.url.includes('?') ? '&' : '?'}view=1" title="${esc(f.name)}"></iframe>`
      : sheetDoc ? `<div class="xlsx-view" data-xlsx><div class="empty small">Opening the spreadsheet…</div></div>`
      : card('This kind of file can’t be previewed in Crewdesk.')}`;
  if (sheetDoc) prefetchBlob(f.url).then((b) => xlsxPreview(b)).then((html) => { const box = $('[data-xlsx]', el); if (box) { box.innerHTML = html; box.addEventListener('click', (e) => { const t = e.target.closest('[data-sheet]'); if (!t) return; $$('[data-sheet]', box).forEach((x) => x.classList.toggle('on', x === t)); $$('.xs-sheet', box).forEach((x, i) => x.classList.toggle('hidden', String(i) !== t.dataset.sheet)); }); } })
    .catch(() => { const box = $('[data-xlsx]', el); if (box) box.outerHTML = card('A preview couldn’t be shown, but you can still save it.'); });
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

// ---- spreadsheet preview (.xlsx): unzip in the browser, read the cells, colours and number formats, show them as a table.
async function readZipEntries(buf) {
  const dv = new DataView(buf); let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Not a spreadsheet');
  const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const out = {}; const dec = new TextDecoder();
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nl)); const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    out[name] = { method, data: new Uint8Array(buf, start, size) }; p += 46 + nl + xl + cl;
  }
  return async (name) => {
    const e = out[name]; if (!e) return null;
    if (e.method === 0) return dec.decode(e.data);
    return new Response(new Blob([e.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  };
}
async function xlsxPreview(blob) {
  const read = await readZipEntries(await blob.arrayBuffer());
  const xml = (t) => (t ? new DOMParser().parseFromString(t, 'application/xml') : null);
  const tags = (doc, n) => (doc ? [...doc.getElementsByTagNameNS('*', n)] : []);
  const wb = xml(await read('xl/workbook.xml')); const rels = xml(await read('xl/_rels/workbook.xml.rels'));
  const sst = tags(xml(await read('xl/sharedStrings.xml')), 'si').map((si) => tags(si, 't').map((t) => t.textContent).join(''));
  const st = xml(await read('xl/styles.xml'));
  const fmts = {}; tags(st, 'numFmt').forEach((f) => { fmts[f.getAttribute('numFmtId')] = f.getAttribute('formatCode'); });
  const fills = tags(tags(st, 'fills')[0], 'fill').map((f) => { const c = tags(f, 'fgColor')[0]; const pt = tags(f, 'patternFill')[0]; const rgb = c && c.getAttribute('rgb'); return pt && pt.getAttribute('patternType') === 'solid' && rgb ? '#' + rgb.slice(-6) : ''; });
  const fonts = tags(tags(st, 'fonts')[0], 'font').map((f) => { const c = tags(f, 'color')[0]; const rgb = c && c.getAttribute('rgb'); return { b: tags(f, 'b').length > 0, c: rgb ? '#' + rgb.slice(-6) : '' }; });
  const xfs = tags(tags(st, 'cellXfs')[0], 'xf').map((x) => ({ fmt: x.getAttribute('numFmtId'), fill: fills[Number(x.getAttribute('fillId'))] || '', font: fonts[Number(x.getAttribute('fontId'))] || {} }));
  const kind = (id) => { const code = fmts[id] || ''; if (['18', '19', '20', '21', '45', '46', '47'].includes(id) || /h+:m/i.test(code)) return 'time'; if (['14', '15', '16', '17', '22'].includes(id) || /[dy]/i.test(code.replace(/"[^"]*"/g, ''))) return 'date'; return ''; };
  const colN = (c) => [...c].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
  const colL = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const fmtVal = (v, xf) => {
    const k = xf ? kind(xf.fmt) : ''; const n = Number(v);
    if (k === 'date' && Number.isFinite(n) && n > 0) return new Date(Date.UTC(1899, 11, 30) + Math.round(n * 864e5)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    if (k === 'time' && Number.isFinite(n)) { const m = Math.round((n % 1) * 1440); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; }
    return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : v;
  };
  const sheets = [];
  for (const sh of tags(wb, 'sheet').slice(0, 8)) {
    const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const rel = tags(rels, 'Relationship').find((r) => r.getAttribute('Id') === rid); if (!rel) continue;
    const doc = xml(await read('xl/' + rel.getAttribute('Target').replace(/^\/?xl\//, '').replace(/^\//, '')));
    const cells = {}; let maxR = 0, maxC = 0;
    for (const c of tags(doc, 'c')) {
      const m = /^([A-Z]+)(\d+)$/.exec(c.getAttribute('r') || ''); if (!m) continue;
      const r = Number(m[2]), col = colN(m[1]); if (r > 400 || col > 40) continue;
      const xf = xfs[Number(c.getAttribute('s') || 0)]; const t = c.getAttribute('t'); const v = tags(c, 'v')[0];
      let val = '';
      if (t === 's') val = sst[Number(v && v.textContent)] || '';
      else if (t === 'inlineStr') val = tags(c, 't').map((x) => x.textContent).join('');
      else if (t === 'b') val = v && v.textContent === '1' ? 'TRUE' : 'FALSE';
      else if (v) val = t === 'str' || t === 'e' ? v.textContent : fmtVal(v.textContent, xf);
      if (!val && !(xf && xf.fill)) continue;
      cells[r + ':' + col] = { val, xf }; maxR = Math.max(maxR, r); maxC = Math.max(maxC, col);
    }
    let rows = '';
    for (let r = 1; r <= maxR; r++) {
      let tr = `<th>${r}</th>`;
      for (let c = 1; c <= maxC; c++) {
        const cell = cells[r + ':' + c];
        const style = cell && cell.xf ? [cell.xf.fill ? `background:${cell.xf.fill}` : '', cell.xf.font.c && cell.xf.font.c !== '#000000' ? `color:${cell.xf.font.c}` : '', cell.xf.font.b ? 'font-weight:700' : ''].filter(Boolean).join(';') : '';
        tr += `<td${style ? ` style="${style}"` : ''}>${cell ? esc(cell.val) : ''}</td>`;
      }
      rows += `<tr>${tr}</tr>`;
    }
    sheets.push({ name: sh.getAttribute('name'), html: maxR ? `<table class="xs-table"><thead><tr><th></th>${Array.from({ length: maxC }, (_, i) => `<th>${colL(i + 1)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty small">This sheet is empty.</div>' });
  }
  if (!sheets.length) throw new Error('No sheets');
  return `${sheets.length > 1 ? `<div class="xs-tabs">${sheets.map((x, i) => `<button class="${i ? '' : 'on'}" data-sheet="${i}">${esc(x.name)}</button>`).join('')}</div>` : ''}
    ${sheets.map((x, i) => `<div class="xs-sheet ${i ? 'hidden' : ''}">${x.html}</div>`).join('')}`;
}
// On phones, a download link would replace the app with the file (and there's no way back), so open it inside the app instead.
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a[download]');
  if (!a || !isTouch() || e.defaultPrevented) return;
  const href = a.getAttribute('href') || '';
  if (!href.startsWith('/api/') && !href.startsWith('/uploads/')) return;
  e.preventDefault(); e.stopPropagation(); closeMenu();
  const name = a.getAttribute('download') || 'file';
  openDoc({ url: href, name, ext: (name.split('.').pop() || '').toLowerCase() });
}, true);
