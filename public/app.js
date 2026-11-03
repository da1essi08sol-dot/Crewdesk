/* Crewdesk web app — vanilla JS, no build step */
(() => {
'use strict';

// ============================================================ utilities
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
  jobs: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12Z"/>',
  team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16 14.2a5 5 0 0 1 6 4.8"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  send: '<path d="m4 12 16-8-6 16-2.5-6.5L4 12Z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  phone: '<path d="M5 3h3.5l2 5-2.5 1.5a11 11 0 0 0 5.5 5.5l1.5-2.5 5 2V18a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/>',
  nav: '<path d="M3 11 21 3l-8 18-2-8-8-2Z"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z"/><path d="M15 8a5 5 0 0 1 0 8M18 5a9 9 0 0 1 0 14"/>',
  contacts: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M7.5 17a4.5 4.5 0 0 1 9 0"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  money: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v5M18 9.5v5"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3"/>',
  hash: '<path d="M5 9h14M5 15h14M10 3 8 21M16 3l-2 18"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/>',
  phoneapp: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.5" r="3.5"/>',
  gallery: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.5-4.5L6 21"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
};
const ic = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

const STATUS = { planned: 'Planned', active: 'In progress', hold: 'On hold', done: 'Done' };
const STATUS_COLOR = { planned: 'var(--blue)', active: 'var(--accent)', hold: 'var(--amber)', done: 'var(--slate)' };
const PRIORITY = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };
const ROLE = { owner: 'Owner', admin: 'Admin', member: 'Member' };
const PALETTE = ['#18693f', '#1a5bb5', '#8a3fb8', '#c2255c', '#0c7a8a', '#a35200', '#2f8a3a', '#4c5fc0', '#495057', '#6b7f00'];

function colorFor(id) { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; }
function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'; }
function member(id) { return S.members[id] || { id, name: 'Former member', avatar: '' }; }
function avatar(m, size = '', dot = false) {
  if (!m) return '';
  return `<span class="avatar ${size}" style="--c:${colorFor(m.id)}" title="${esc(m.name)}">${m.avatar ? `<img src="${esc(m.avatar)}" alt="">` : esc(initials(m.name))}${dot ? `<i class="dot ${m.online ? 'on' : ''}"></i>` : ''}</span>`;
}
function avatarStack(ids, max = 4) {
  if (!ids || !ids.length) return '';
  const shown = ids.slice(0, max).map((id) => avatar(member(id), 'xs')).join('');
  const extra = ids.length > max ? `<span class="avatar xs more">+${ids.length - max}</span>` : '';
  return `<span class="stackav">${shown}${extra}</span>`;
}
const pad = (n) => String(n).padStart(2, '0');
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function days(dstr) { const a = new Date(dstr + 'T00:00:00'); const b = new Date(todayStr() + 'T00:00:00'); return Math.round((a - b) / 864e5); }
function fmtDate(dstr, weekday = false) {
  if (!dstr) return '';
  const d = new Date(dstr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', Object.assign({ day: 'numeric', month: 'short' }, weekday ? { weekday: 'short' } : {}, d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}));
}
function dueHtml(dstr, done = false) {
  if (!dstr) return '';
  const n = days(dstr);
  let cls = '', label;
  if (done) label = fmtDate(dstr);
  else if (n < 0) { cls = 'late'; label = n === -1 ? 'Overdue 1 day' : `Overdue ${-n} days`; }
  else if (n === 0) { cls = 'soon'; label = 'Due today'; }
  else if (n === 1) { cls = 'soon'; label = 'Due tomorrow'; }
  else if (n <= 7) { cls = 'soon'; label = 'Due ' + fmtDate(dstr, true); }
  else label = 'Due ' + fmtDate(dstr);
  return `<span class="due ${cls}">${ic('cal')}${esc(label)}</span>`;
}
function timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  if (s < 86400 * 7) return Math.round(s / 86400) + 'd ago';
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function clock(ts) { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function dayLabel(ts) {
  const d = new Date(ts); const t = new Date(); const y = new Date(Date.now() - 864e5);
  if (d.toDateString() === t.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}
function money(n) {
  const cur = (S.company && S.company.settings && S.company.settings.currency) || '£';
  const v = Number(n) || 0;
  return (v < 0 ? '−' : '') + cur + Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function linkify(t) { return esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>'); }
const isAdmin = () => S.role === 'owner' || S.role === 'admin';
const canCreateJobs = () => isAdmin() || (S.company.settings.membersCreateJobs !== false);
const jobCosts = (j) => (j.costs || []).reduce((a, c) => a + (Number(c.amount) || 0), 0);
function jobTasks(jobId) { return Object.values(S.tasks).filter((t) => t.jobId === jobId).sort((a, b) => (a.done - b.done) || ((a.order || 0) - (b.order || 0))); }
function progress(jobId) { const t = jobTasks(jobId); return { done: t.filter((x) => x.done).length, total: t.length }; }
function byDeadline(a, b) { return (a.deadline || '9999') < (b.deadline || '9999') ? -1 : (a.deadline || '9999') > (b.deadline || '9999') ? 1 : (b.updatedAt || 0) - (a.updatedAt || 0); }
function dirLink(job) {
  const dest = job.lat != null && job.lng != null ? `${job.lat},${job.lng}` : job.address;
  return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest || '');
}
function dist(a, b) {
  const R = 6371e3, r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * R;
}

// ============================================================ state & API
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
const S = {
  token: store.get('cd_token'), cid: store.get('cd_cid'), user: null, companies: [], role: null, company: null,
  members: {}, teams: {}, jobs: {}, tasks: {}, clients: {}, announcements: {}, locations: {},
  unread: {}, lastMsg: {}, msgs: {}, msgsMore: {}, photos: {}, info: null,
  jobFilter: 'open', jobSearch: '', clientSearch: '', openTask: null,
};

async function api(method, path, body) {
  const r = await fetch(path, {
    method, headers: Object.assign({ 'Content-Type': 'application/json' }, S.token ? { Authorization: 'Bearer ' + S.token } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && S.token) { signOutLocal(); throw new Error('Please sign in again'); }
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
  return j;
}
const capi = (method, sub, body) => api(method, `/api/c/${S.cid}${sub}`, body);
async function saveItem(coll, id, patch) {
  try {
    const r = id ? await capi('PATCH', `/${coll}/${id}`, patch) : await capi('POST', `/${coll}`, patch);
    S[coll][r.item.id] = r.item; scheduleRender();
    return r.item;
  } catch (e) { toast(e.message, true); throw e; }
}
async function deleteItem(coll, id) {
  try { await capi('DELETE', `/${coll}/${id}`); delete S[coll][id]; scheduleRender(); return true; }
  catch (e) { toast(e.message, true); return false; }
}

// ============================================================ toasts, sheets, confirm
function toast(text, isErr = false, link = '') {
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.innerHTML = `<span class="grow">${esc(text)}</span>${link ? ic('right') : ''}`;
  el.style.cssText = '';
  el.onclick = () => { if (link) location.hash = link; el.remove(); };
  const box = $('#toasts'); box.appendChild(el);
  while (box.children.length > 2) box.firstElementChild.remove();
  setTimeout(() => el.remove(), isErr ? 5000 : 4200);
}
function sheet(html, onMount) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-backdrop';
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  wrap.addEventListener('click', (e) => {
    const c = e.target.closest('[data-close]'); if (!c) return;
    if (!(c.tagName === 'A' && c.getAttribute('href') && c.getAttribute('href') !== '#')) e.preventDefault();
    close();
  });
  document.addEventListener('keydown', onKey);
  $('#sheet-root').appendChild(wrap);
  const sh = wrap.firstElementChild;
  if (onMount) onMount(sh, close);
  const first = sh.querySelector('input:not([type=hidden]):not([type=checkbox]),textarea');
  if (first && matchMedia('(hover:hover)').matches) requestAnimationFrame(() => { if (!sh.contains(document.activeElement)) first.focus({ preventScroll: true }); });
  return close;
}
function sheetHead(title) { return `<div class="sheet-head"><h2>${esc(title)}</h2><button class="btn ghost sm icon" data-close aria-label="Close">${ic('x')}</button></div>`; }
function confirmBox(title, text, okLabel = 'Delete', danger = true) {
  return new Promise((resolve) => {
    let done = false;
    const close = sheet(`${sheetHead(title)}<p class="muted">${esc(text)}</p>
      <div class="sheet-foot"><button class="btn" data-close>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" id="cf-ok">${esc(okLabel)}</button></div>`,
    (sh, cl) => {
      sh.querySelector('#cf-ok').onclick = () => { done = true; cl(); resolve(true); };
      new MutationObserver((_, o) => { if (!sh.isConnected) { o.disconnect(); if (!done) resolve(false); } }).observe(document.getElementById('sheet-root'), { childList: true });
    });
    void close;
  });
}
function peoplePicker(selected, name = 'people') {
  const ms = Object.values(S.members).sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="people-pick" data-picker="${name}">${ms.map((m) => `<button type="button" class="person-chip ${selected.includes(m.id) ? 'on' : ''}" data-act="pick" data-id="${m.id}">${avatar(m, 'sm')}${esc(m.name.split(' ')[0])}</button>`).join('')}</div>`;
}
const picked = (root, name = 'people') => $$(`[data-picker="${name}"] .person-chip.on`, root).map((b) => b.dataset.id);

// ============================================================ photos: picking, resizing, uploading, viewing
const isTouch = () => matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches;
const LOGO = `<svg viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="116" fill="#18693f"/><path d="M0 0h512v512z" fill="#0f4a2b" opacity=".35" clip-path="inset(0 round 116px)"/><ellipse cx="256" cy="414" rx="84" ry="18" fill="#48C680" opacity=".85"/><path d="M256 404C214 348 140 290 140 220a116 116 0 0 1 232 0c0 70-74 128-116 184Z" fill="#fff"/><path d="M203 222l37 37 70-72" fill="none" stroke="#18693F" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const brand = (cls = '') => `<span class="brandmark ${cls}">${LOGO}</span>`;
const IMG_RE = /^image\//;
const IMG_NAME_RE = /\.(jpe?g|png|webp|heic|heif|gif)$/i;
const isImageFile = (f) => IMG_RE.test(f.type || '') || IMG_NAME_RE.test(f.name || '');

// Opens the phone's camera or photo library. On phones you get two big buttons; on a computer it opens the file picker.
function choosePhotos({ multiple = true, title = 'Add photos', selfie = false } = {}) {
  return new Promise((resolve) => {
    const finish = (files) => {
      const list = [...(files || [])];
      const ok = list.filter(isImageFile);
      if (list.length && !ok.length) toast('That isn’t a photo — pick a picture from your camera roll', true);
      if (ok.length) resolve(multiple ? ok : ok.slice(0, 1));
    };
    if (!isTouch()) {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = multiple; inp.style.display = 'none';
      inp.onchange = () => { finish(inp.files); inp.remove(); };
      document.body.appendChild(inp); inp.click();
      return;
    }
    sheet(`${sheetHead(title)}
      <div class="pick-options">
        <label class="pick-btn">${ic('camera')}<span>Take photo</span><small>Open the camera</small>
          <input type="file" accept="image/*" capture="${selfie ? 'user' : 'environment'}" data-pick aria-label="Take a photo with the camera"></label>
        <label class="pick-btn">${ic('gallery')}<span>Photo library</span><small>${multiple ? 'Choose one or more' : 'Choose a photo'}</small>
          <input type="file" accept="image/*" ${multiple ? 'multiple' : ''} data-pick aria-label="Choose from your photo library"></label>
      </div>`, (sh, close) => {
      $$('[data-pick]', sh).forEach((inp) => inp.addEventListener('change', () => { const files = [...inp.files]; close(); finish(files); }));
    });
  });
}

// Shrinks a photo on the phone before upload (fast on mobile data) and fixes sideways photos.
async function loadBitmap(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) { /* fall back below */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(/hei[cf]/i.test(file.type + file.name) ? 'This browser can’t open HEIC photos — try from your phone, or save it as JPEG' : 'Could not read that photo')); };
    img.src = url;
  });
}
function drawScaled(src, max, square = false, quality = 0.82) {
  const W = src.width, H = src.height;
  let sx = 0, sy = 0, sw = W, sh = H;
  if (square) { const m = Math.min(W, H); sx = (W - m) / 2; sy = (H - m) / 2; sw = sh = m; }
  const k = Math.min(1, max / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
  g.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return { data: c.toDataURL('image/jpeg', quality), w: c.width, h: c.height };
}
async function processPhoto(file, { max = 1600, thumb = 480, square = false } = {}) {
  const bmp = await loadBitmap(file);
  const full = drawScaled(bmp, max, square);
  const small = thumb ? drawScaled(bmp, thumb, square, 0.74) : null;
  if (bmp.close) bmp.close();
  return { data: full.data, w: full.w, h: full.h, thumb: small && small.data, takenAt: file.lastModified || 0 };
}
// JSON upload with a progress bar (fetch can't report upload progress)
function sendWithProgress(method, path, body, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open(method, path); x.setRequestHeader('Content-Type', 'application/json');
    if (S.token) x.setRequestHeader('Authorization', 'Bearer ' + S.token);
    x.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch (_) {} x.status < 300 ? resolve(j) : reject(new Error(j.error || 'Upload failed')); };
    x.onerror = () => reject(new Error('No connection — photo not uploaded'));
    x.send(JSON.stringify(body));
  });
}

// ---- job photo uploads (queue, 2 at a time, with live tiles)
S.uploads = {}; // jobId -> [{ key, preview, progress, failed, file }]
let uploadActive = 0; const uploadQueue = [];
function queueJobPhotos(jobId, files) {
  if (!files.length) return;
  const list = S.uploads[jobId] = S.uploads[jobId] || [];
  for (const file of files) {
    const u = { key: Math.random().toString(36).slice(2), jobId, file, preview: URL.createObjectURL(file), progress: 0, failed: '' };
    list.push(u); uploadQueue.push(u);
  }
  toast(files.length === 1 ? 'Uploading photo…' : `Uploading ${files.length} photos…`);
  refreshPhotoViews(jobId); pumpUploads();
}
async function pumpUploads() {
  while (uploadActive < 2 && uploadQueue.length) {
    const u = uploadQueue.shift(); uploadActive++;
    uploadOne(u).finally(() => { uploadActive--; pumpUploads(); });
  }
}
async function uploadOne(u) {
  try {
    u.failed = ''; u.progress = 0.02; paintUpload(u);
    const p = await processPhoto(u.file);
    const r = await sendWithProgress('POST', `/api/c/${S.cid}/photos`, { jobId: u.jobId, image: p.data, thumb: p.thumb, w: p.w, h: p.h, takenAt: p.takenAt },
      (f) => { u.progress = 0.05 + f * 0.93; paintUpload(u); });
    S.photos[r.item.id] = r.item;
    const list = S.uploads[u.jobId] || [];
    list.splice(list.indexOf(u), 1);
    URL.revokeObjectURL(u.preview);
    refreshPhotoViews(u.jobId);
  } catch (e) {
    u.failed = e.message; paintUpload(u);
  }
}
function paintUpload(u) {
  const el = document.querySelector(`[data-upload="${u.key}"]`);
  if (!el) return;
  const bar = el.querySelector('.prog i'); if (bar) bar.style.width = Math.round(u.progress * 100) + '%';
  el.classList.toggle('failed', !!u.failed);
  const f = el.querySelector('.fail');
  if (u.failed && !f) el.insertAdjacentHTML('beforeend', `<span class="fail">${esc(u.failed)}<br>Tap to retry</span>`);
  if (!u.failed && f) f.remove();
}
function refreshPhotoViews(jobId) {
  const box = document.getElementById('photo-gallery');
  if (box && box.dataset.job === jobId) box.innerHTML = photoGalleryInner(jobId);
  const strip = document.getElementById('photo-strip');
  if (strip && strip.dataset.job === jobId) strip.innerHTML = photoStripInner(jobId);
}
function jobPhotos(jobId) { return Object.values(S.photos).filter((p) => p.jobId === jobId).sort((a, b) => b.createdAt - a.createdAt); }
function photoAlt(p, i) {
  const j = S.jobs[p.jobId];
  return p.caption ? p.caption : `Photo ${i + 1}${j ? ' of ' + j.title : ''}, added by ${member(p.createdBy).name}`;
}
function photoTile(p, i) {
  return `<button class="photo-tile" data-act="photo-open" data-id="${p.id}" aria-label="Open photo: ${esc(photoAlt(p, i))}">
    <img src="${esc(p.thumb || p.url)}" alt="${esc(photoAlt(p, i))}" loading="lazy" decoding="async">${p.caption ? `<span class="cap" aria-hidden="true">${esc(p.caption)}</span>` : ''}</button>`;
}
function uploadTile(u) {
  return `<button class="photo-tile uploading ${u.failed ? 'failed' : ''}" data-upload="${u.key}" data-act="upload-retry" aria-label="${u.failed ? 'Upload failed, tap to retry' : 'Uploading photo'}">
    <img src="${esc(u.preview)}" alt=""><span class="prog"><i style="width:${Math.round(u.progress * 100)}%"></i></span>${u.failed ? `<span class="fail">${esc(u.failed)}<br>Tap to retry</span>` : ''}</button>`;
}
function photoGalleryInner(jobId) {
  const ps = jobPhotos(jobId); const ups = S.uploads[jobId] || [];
  return `<div class="photo-grid">
      <button class="add-photo-tile" data-act="photos-add" data-job="${jobId}">${ic('camera')}<span>Add photos</span></button>
      ${ups.map(uploadTile).join('')}${ps.map(photoTile).join('')}</div>
    ${!ps.length && !ups.length ? `<p class="small muted" style="text-align:center;margin:14px 0 0">No photos yet. Snap the site before, during and after the job — everyone on the job can see them.</p>` : ''}`;
}
function photoStripInner(jobId) {
  const ps = jobPhotos(jobId).slice(0, 8); const ups = S.uploads[jobId] || [];
  return `<div class="photo-strip"><button class="add-photo-tile" style="width:72px;flex:none" data-act="photos-add" data-job="${jobId}" aria-label="Add photos">${ic('camera')}<span>Add</span></button>
    ${ups.map(uploadTile).join('')}${ps.map(photoTile).join('')}</div>`;
}

// ---- full-screen viewer (job photos and chat photos)
let viewer = null;
function openViewer(items, index = 0, opts = {}) {
  closeViewer();
  const back = document.activeElement;
  const el = document.createElement('div');
  el.className = 'viewer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Photo viewer');
  document.body.appendChild(el);
  viewer = { el, items, i: Math.max(0, Math.min(index, items.length - 1)), back, opts };
  paintViewer();
  const onKey = (e) => {
    if (!viewer) return;
    if (e.key === 'Escape') closeViewer();
    else if (e.key === 'ArrowRight' && !e.target.matches('input')) stepViewer(1);
    else if (e.key === 'ArrowLeft' && !e.target.matches('input')) stepViewer(-1);
  };
  document.addEventListener('keydown', onKey); viewer.onKey = onKey;
  let sx = null, sy = 0;
  el.addEventListener('pointerdown', (e) => { if (e.target.closest('.viewer-stage')) { sx = e.clientX; sy = e.clientY; } });
  el.addEventListener('pointerup', (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) stepViewer(dx < 0 ? 1 : -1);
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5) closeViewer();
  });
}
function paintViewer() {
  if (!viewer) return;
  const it = viewer.items[viewer.i]; if (!it) return closeViewer();
  const who = member(it.by);
  const canEdit = it.id && S.photos[it.id] && (isAdmin() || it.by === S.user.id);
  const many = viewer.items.length > 1;
  viewer.el.innerHTML = `
    <div class="viewer-top">
      <button class="vbtn" data-vact="close" aria-label="Close photo">${ic('x')}</button>
      <div class="who"><b>${esc(who.name)}</b><span>${esc(new Date(it.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}${it.where ? ' · ' + esc(it.where) : ''}</span></div>
      <a class="vbtn" href="${esc(it.url)}" download aria-label="Download photo">${ic('download')}</a>
      ${canEdit ? `<button class="vbtn" data-vact="delete" aria-label="Delete photo">${ic('trash')}</button>` : ''}
    </div>
    <div class="viewer-stage">
      <img src="${esc(it.url)}" alt="${esc(it.alt || it.caption || 'Photo')}">
      ${many ? `<button class="vbtn nav prev" data-vact="prev" aria-label="Previous photo">${ic('back')}</button><button class="vbtn nav next" data-vact="next" aria-label="Next photo">${ic('right')}</button>` : ''}
    </div>
    <div class="viewer-bottom">
      ${canEdit ? `<label class="sr-only" for="vcap">Caption</label><input id="vcap" value="${esc(it.caption || '')}" placeholder="Add a caption… e.g. Before: kitchen wall" maxlength="300" enterkeyhint="done">`
        : it.caption ? `<div class="caption">${esc(it.caption)}</div>` : ''}
      ${many ? `<div class="count">${viewer.i + 1} of ${viewer.items.length}${isTouch() ? ' · swipe for more' : ''}</div>` : ''}
    </div>`;
  viewer.el.onclick = async (e) => {
    const b = e.target.closest('[data-vact]'); if (!b) return;
    const a = b.dataset.vact;
    if (a === 'close') closeViewer();
    if (a === 'prev') stepViewer(-1);
    if (a === 'next') stepViewer(1);
    if (a === 'delete') {
      if (!(await confirmBox('Delete this photo?', 'It will be removed for everyone on the job.'))) return;
      try { await capi('DELETE', `/photos/${it.id}`); delete S.photos[it.id]; refreshPhotoViews(it.jobId); toast('Photo deleted');
        viewer.items.splice(viewer.i, 1); if (!viewer.items.length) closeViewer(); else { viewer.i = Math.min(viewer.i, viewer.items.length - 1); paintViewer(); } }
      catch (err) { toast(err.message, true); }
    }
  };
  const cap = viewer.el.querySelector('#vcap');
  if (cap) {
    const saveCap = async () => {
      const v = cap.value.trim(); if (v === (it.caption || '')) return;
      try { const r = await capi('PATCH', `/photos/${it.id}`, { caption: v }); S.photos[it.id] = r.item; it.caption = r.item.caption; refreshPhotoViews(it.jobId); toast('Caption saved'); }
      catch (err) { toast(err.message, true); }
    };
    cap.addEventListener('change', saveCap);
    cap.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); cap.blur(); } });
  }
  const closeBtn = viewer.el.querySelector('[data-vact="close"]'); if (closeBtn && !viewer.el.contains(document.activeElement)) closeBtn.focus({ preventScroll: true });
}
function stepViewer(d) { if (!viewer || viewer.items.length < 2) return; viewer.i = (viewer.i + d + viewer.items.length) % viewer.items.length; paintViewer(); }
function closeViewer() {
  if (!viewer) return;
  document.removeEventListener('keydown', viewer.onKey);
  const back = viewer.back; viewer.el.remove(); viewer = null;
  if (back && back.isConnected) back.focus({ preventScroll: true });
}
function viewerItemsForJob(jobId) {
  return jobPhotos(jobId).map((p, i) => ({ id: p.id, jobId, url: p.url, caption: p.caption, by: p.createdBy, at: p.createdAt, alt: photoAlt(p, i) }));
}

// ---- chat photo attachments
S.pendingImgs = {}; // channel -> [{ data, key }]
async function addChatPhotos(ch, files) {
  const list = S.pendingImgs[ch] = S.pendingImgs[ch] || [];
  const room = 6 - list.length;
  if (room <= 0) return toast('You can send up to 6 photos at once', true);
  if (files.length > room) toast(`Only the first ${room} photo${room === 1 ? '' : 's'} added (6 max per message)`);
  for (const f of files.slice(0, room)) {
    try { const p = await processPhoto(f, { thumb: 0 }); list.push({ data: p.data, key: Math.random().toString(36).slice(2) }); }
    catch (e) { toast(e.message, true); }
  }
  paintAttach(ch);
}
function paintAttach(ch) {
  const pane = document.querySelector(`.chat-pane[data-ch="${CSS.escape(ch)}"]`); if (!pane) return;
  const box = pane.querySelector('[data-attach]'); const list = S.pendingImgs[ch] || [];
  box.classList.toggle('hidden', !list.length);
  box.innerHTML = list.map((p, i) => `<span class="attach-thumb"><img src="${p.data}" alt="Photo ${i + 1} ready to send"><button type="button" data-act="unattach" data-ch="${esc(ch)}" data-key="${p.key}" aria-label="Remove photo ${i + 1}">${ic('x')}</button></span>`).join('')
    + (list.length ? `<span class="small muted" style="flex:none">${list.length} photo${list.length === 1 ? '' : 's'} ready</span>` : '');
}

// ============================================================ auth & onboarding screens
function renderAuth(mode = 'login') {
  stopAll();
  $('#app').innerHTML = `<div class="auth"><div class="auth-card">
    <div class="auth-brand">${brand()}<div><h1>Crewdesk</h1><div class="muted small">Jobs, photos and team chat in one place</div></div></div>
    <div class="card">
      <div class="seg"><button class="${mode === 'login' ? 'on' : ''}" data-act="auth-mode" data-mode="login">Sign in</button><button class="${mode === 'register' ? 'on' : ''}" data-act="auth-mode" data-mode="register">Create account</button></div>
      <form data-form="${mode}" class="stack">
        ${mode === 'register' ? `<label class="field"><span>Your name</span><input name="name" autocomplete="name" required></label>` : ''}
        <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
        <label class="field"><span>Password</span><input name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" minlength="6" required aria-describedby="${mode === 'register' ? 'pw-hint' : ''}"></label>
        ${mode === 'register' ? `<div class="tiny muted" id="pw-hint" style="margin-top:-6px">At least 6 characters.</div>
        <label class="consent"><input type="checkbox" name="agree" required><span>I agree to the <a href="#/terms">Terms</a> and have read the <a href="#/privacy">Privacy Policy</a>.</span></label>` : ''}
        <div class="err-msg" id="auth-err" role="alert"></div>
        <button class="btn primary block">${mode === 'login' ? 'Sign in' : 'Create account'}</button>
      </form>
    </div>
    <p class="pwa-tip" style="text-align:center;margin-top:16px">Tip: on your phone, use “Add to Home Screen” to install Crewdesk like an app.</p>
    ${footLinks()}
  </div></div>`;
}
function renderOnboard() {
  stopAll();
  $('#app').innerHTML = `<div class="auth"><div class="auth-card" style="max-width:520px">
    <div class="auth-brand">${brand()}<div><h1>Hi ${esc(S.user.name.split(' ')[0])}</h1><div class="muted small">Join your company’s board, or set one up for your crew.</div></div></div>
    <div class="stack">${companyForms()}
      <button class="btn ghost" data-act="logout">${ic('logout')} Sign out</button></div>
    ${footLinks()}
  </div></div>`;
}
function footLinks() {
  return `<nav class="foot-links" aria-label="Legal"><a href="#/privacy">Privacy</a><a href="#/terms">Terms</a>${S.info && S.info.operator && S.info.operator.email ? `<a href="mailto:${esc(S.info.operator.email)}">Contact</a>` : ''}</nav>`;
}
function companyForms() {
  return `<form class="card stack" data-form="join-co">
      <div><h2>Join a company</h2><p class="muted small" style="margin:4px 0 0">Ask your boss for the 6-letter company code and the join password.</p></div>
      <div class="form-grid"><label class="field"><span>Company code</span><input name="code" autocapitalize="characters" autocomplete="off" placeholder="e.g. K7Q2MX" required></label>
      <label class="field"><span>Join password</span><input name="password" type="password" autocomplete="off" required></label></div>
      <div class="err-msg" data-err></div>
      <button class="btn dark">Join company</button>
    </form>
    <form class="card stack" data-form="create-co">
      <div><h2>Set up a new company</h2><p class="muted small" style="margin:4px 0 0">You’ll be the owner. Share the code and password with your crew so they can join.</p></div>
      <label class="field"><span>Company name</span><input name="name" required></label>
      <label class="field"><span>Join password for your crew</span><input name="password" type="text" autocomplete="off" minlength="4" required></label>
      <div class="err-msg" data-err></div>
      <button class="btn primary">Create company</button>
    </form>`;
}

// ============================================================ boot & realtime
const isLegal = (name) => name === 'privacy' || name === 'terms';
let standalone = false;
async function boot() {
  if (!S.info) { try { S.info = await api('GET', '/api/info'); } catch (_) { S.info = { operator: {} }; } }
  const r0 = parseHash();
  if (!S.token) return isLegal(r0.name) ? renderLegalStandalone(r0.name) : renderAuth();
  try {
    const r = await api('GET', '/api/me');
    S.user = r.user; S.companies = r.companies;
  } catch (e) { return renderAuth(); }
  if (!S.companies.length) return isLegal(r0.name) ? renderLegalStandalone(r0.name) : renderOnboard();
  if (!S.companies.some((c) => c.id === S.cid)) S.cid = S.companies[0].id;
  await loadCompany();
}
async function loadCompany(keepView = false) {
  store.set('cd_cid', S.cid);
  let st;
  try { st = await capi('GET', '/state'); }
  catch (e) { toast(e.message, true); S.cid = null; store.set('cd_cid', null); return boot(); }
  Object.assign(S, { company: st.company, role: st.role, user: st.me, teams: st.teams, jobs: st.jobs, tasks: st.tasks, clients: st.clients,
    announcements: st.announcements, photos: st.photos || {}, locations: st.locations, unread: st.unread, lastMsg: st.lastMsg });
  if (!keepView) { S.msgs = {}; S.msgsMore = {}; }
  S.members = Object.fromEntries(st.members.map((m) => [m.id, m]));
  const me = S.companies.find((c) => c.id === S.cid); if (me) { me.name = st.company.name; me.role = st.role; }
  if (!keepView || !$('#view')) { renderShell(); connect(); route(); startGeo(); }
  else {
    updateChrome();
    const typing = $('#view').contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    renderView(!(current.v && current.v.manual && !typing));
    if (S.msgs) Object.keys(S.msgs).forEach((ch) => { delete S.msgs[ch]; const p = $(`.chat-pane[data-ch="${CSS.escape(ch)}"]`); if (p) mountChat(ch); });
  }
}

let es = null, helloCount = 0, retryTimer = null;
function connect(isRetry = false) {
  if (es) es.close();
  helloCount = isRetry ? 1 : 0;
  es = new EventSource(`/api/stream?token=${encodeURIComponent(S.token)}&cid=${encodeURIComponent(S.cid)}`);
  es.onmessage = (e) => { try { handleEvent(JSON.parse(e.data)); } catch (err) { console.error(err); } };
  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) { clearTimeout(retryTimer); retryTimer = setTimeout(() => { if (S.company) connect(true); }, 4000); }
  };
}
function stopAll() { if (es) { es.close(); es = null; } stopGeo(); }

function handleEvent(ev) {
  switch (ev.t) {
    case 'hello':
      if (helloCount++ > 0) loadCompany(true); // reconnected: catch up on anything missed
      break;
    case 'upsert': {
      const prev = S[ev.coll][ev.item.id];
      S[ev.coll][ev.item.id] = ev.item;
      if (ev.coll === 'jobs' && prev && prev.status !== ev.item.status) { /* status reflected on render */ }
      scheduleRender(); break;
    }
    case 'remove':
      delete S[ev.coll][ev.id];
      if (ev.coll === 'jobs') { delete S.unread['job:' + ev.id]; delete S.lastMsg['job:' + ev.id];
        const r = parseHash(); if ((r.name === 'job' && r.args[0] === ev.id) || (r.name === 'chat' && r.args[0] === 'job:' + ev.id)) { toast('That job was deleted'); location.hash = '#/jobs'; } }
      scheduleRender(); break;
    case 'msg': onMessage(ev.item); break;
    case 'presence':
      if (S.members[ev.userId]) { S.members[ev.userId].online = ev.online; S.members[ev.userId].lastSeen = ev.lastSeen; }
      scheduleRender(); break;
    case 'member': {
      const old = S.members[ev.item.id];
      S.members[ev.item.id] = Object.assign({}, old || {}, ev.item, old && !ev.item.role ? { role: old.role } : {});
      if (ev.item.id === S.user.id) S.user = Object.assign(S.user, ev.item);
      if (!ev.item.shareLocation) delete S.locations[ev.item.id];
      scheduleRender(); updateMap(); break;
    }
    case 'memberRemoved':
      if (ev.id === S.user.id) { toast('You were removed from this company', true); S.cid = null; stopAll(); boot(); return; }
      delete S.members[ev.id]; delete S.locations[ev.id]; scheduleRender(); updateMap(); break;
    case 'loc':
      if (ev.loc) S.locations[ev.userId] = ev.loc; else delete S.locations[ev.userId];
      updateMap(); break;
    case 'notify':
      toast(ev.text, false, ev.link); systemNotify(ev.text, ev.link); break;
    case 'reload': loadCompany(true); break;
    case 'kicked':
      if (ev.cid === S.cid) { toast('This company is no longer available', true); S.cid = null; stopAll(); boot(); }
      break;
  }
}

const msgImages = (m) => (m.images && m.images.length ? m.images : m.image ? [m.image] : []);
function msgPreview(m) { const n = msgImages(m).length; return m.text || (n > 1 ? `📷 ${n} photos` : n ? '📷 Photo' : ''); }
function onMessage(m) {
  const list = S.msgs[m.channel];
  if (list && !list.some((x) => x.id === m.id)) list.push(m);
  S.lastMsg[m.channel] = { at: m.at, text: msgPreview(m), userId: m.userId, system: m.system };
  const viewing = currentChannel() === m.channel && !document.hidden;
  if (m.userId !== S.user.id && !m.system) {
    if (viewing) markRead(m.channel);
    else {
      S.unread[m.channel] = (S.unread[m.channel] || 0) + 1;
      const who = member(m.userId).name.split(' ')[0];
      const where = m.channel === 'general' ? 'Company chat' : (S.jobs[m.channel.slice(4)] || {}).title || 'Job chat';
      const r = parseHash();
      if (r.name !== 'chat') toast(`${who} · ${where}: ${msgPreview(m)}`.slice(0, 120), false, '#/chat/' + m.channel);
      systemNotify(`${who} in ${where}`, '#/chat/' + m.channel, m.text);
    }
  }
  refreshPanes(m.channel);
  scheduleRender();
}
function systemNotify(title, link, body = '') {
  if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
  try { const n = new Notification(title, { body, icon: '/icon-192.png', tag: link }); n.onclick = () => { window.focus(); location.hash = link; n.close(); }; } catch {}
  if (navigator.vibrate) navigator.vibrate(80);
}
function currentChannel() { const p = $('.chat-pane'); return p ? p.dataset.ch : null; }
let readTimers = {};
function markRead(ch) {
  S.unread[ch] = 0;
  clearTimeout(readTimers[ch]);
  readTimers[ch] = setTimeout(() => capi('POST', '/read', { channel: ch }).catch(() => {}), 400);
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { const ch = currentChannel(); if (ch && S.unread[ch]) { markRead(ch); scheduleRender(); } }
});

// ============================================================ geolocation
let geoWatch = null, lastPos = null, lastSent = null, geoBeat = null;
function sendPos(force = false) {
  if (!lastPos || !S.user || !S.user.shareLocation) return;
  const t = Date.now();
  if (!force && lastSent && (t - lastSent.t < 5000 || (t - lastSent.t < 20000 && dist(lastSent, lastPos) < 25))) return;
  lastSent = Object.assign({ t }, lastPos);
  api('POST', '/api/me/location', lastPos).catch(() => {});
}
function startGeo() {
  stopGeo();
  if (!S.user || !S.user.shareLocation || !('geolocation' in navigator) || !window.isSecureContext) return;
  geoWatch = navigator.geolocation.watchPosition((pos) => {
    lastPos = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
    sendPos();
  }, (err) => { if (err.code === 1) toast('Location permission was blocked — allow it in your browser settings', true); },
  { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
  geoBeat = setInterval(() => { if (lastSent && Date.now() - lastSent.t > 60000) sendPos(true); }, 30000);
}
function stopGeo() { if (geoWatch != null) navigator.geolocation.clearWatch(geoWatch); geoWatch = null; clearInterval(geoBeat); }
function enableSharing(on, inputEl) {
  if (!on) {
    api('PUT', '/api/me', { shareLocation: false }).then((r) => { S.user = r.user; S.members[S.user.id] = Object.assign(S.members[S.user.id] || {}, r.user); delete S.locations[S.user.id]; stopGeo(); updateMap(); toast('Location sharing is off'); })
      .catch((e) => { toast(e.message, true); if (inputEl) inputEl.checked = true; });
    return;
  }
  if (!window.isSecureContext) { toast('Location only works over a secure https:// link — see README', true); if (inputEl) inputEl.checked = false; return; }
  if (!('geolocation' in navigator)) { toast('This device has no location support', true); if (inputEl) inputEl.checked = false; return; }
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const r = await api('PUT', '/api/me', { shareLocation: true });
      S.user = r.user; S.members[S.user.id] = Object.assign(S.members[S.user.id] || {}, r.user);
      lastPos = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
      sendPos(true); startGeo(); toast('Sharing your location with your company');
    } catch (e) { toast(e.message, true); if (inputEl) inputEl.checked = false; }
  }, (err) => { toast(err.code === 1 ? 'Location permission was denied' : 'Could not get your location', true); if (inputEl) inputEl.checked = false; },
  { enableHighAccuracy: true, timeout: 20000 });
}

// ============================================================ map (Leaflet, loaded on demand)
let map = null, mapLayer = null, leafletP = null, mapFitted = false;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  return leafletP || (leafletP = new Promise((res, rej) => {
    const css = document.createElement('link'); css.rel = 'stylesheet';
    css.href = '/vendor/leaflet/leaflet.css'; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = '/vendor/leaflet/leaflet.js';
    s.onload = res; s.onerror = () => { leafletP = null; rej(new Error('Map could not load — check internet')); }; document.head.appendChild(s);
  }));
}
async function drawMap() {
  const el = $('#map'); if (!el) return;
  try { await loadLeaflet(); } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  if (!el.isConnected) return;
  if (map && map.getContainer() !== el) { map.remove(); map = null; }
  if (!map) {
    map = L.map(el, { zoomControl: true, attributionControl: true }).setView([54.5, -3], 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' }).addTo(map);
    mapLayer = L.layerGroup().addTo(map); mapFitted = false;
  }
  updateMap();
}
function updateMap() {
  if (!map || !$('#map') || !window.L) return;
  mapLayer.clearLayers();
  const pts = [];
  for (const [id, loc] of Object.entries(S.locations)) {
    const m = S.members[id]; if (!m) continue;
    const icon = L.divIcon({ className: 'pin', html: avatar(m, 'sm'), iconSize: [28, 28], iconAnchor: [14, 14] });
    L.marker([loc.lat, loc.lng], { icon, zIndexOffset: 1000 }).addTo(mapLayer)
      .bindPopup(`<b>${esc(m.name)}</b><br><span style="color:#888">${m.online ? 'Online' : 'Offline'} · updated ${timeAgo(loc.at)}${loc.acc ? ` · ±${loc.acc}m` : ''}</span>`);
    pts.push([loc.lat, loc.lng]);
  }
  for (const j of Object.values(S.jobs)) {
    if (j.lat == null || j.lng == null || j.status === 'done') continue;
    const icon = L.divIcon({ className: '', html: `<div class="pin-job">${ic('jobs')}</div>`, iconSize: [30, 30], iconAnchor: [15, 30] });
    L.marker([j.lat, j.lng], { icon }).addTo(mapLayer).bindPopup(`<b>${esc(j.title)}</b><br><span style="color:#888">${esc(j.ref)} · ${STATUS[j.status]}</span><br><a href="#/job/${j.id}">Open job</a>`);
    pts.push([j.lat, j.lng]);
  }
  if (!mapFitted && pts.length) { map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 }); mapFitted = true; }
}

// ============================================================ shell & routing
const NAV = [
  ['home', 'Home', 'home'], ['jobs', 'Jobs', 'jobs'], ['chat', 'Chat', 'chat'], ['team', 'Team', 'team'],
];
const SIDE_EXTRA = [['clients', 'Clients', 'contacts'], ['news', 'Announcements', 'megaphone'], ['settings', 'Company', 'settings']];
function renderShell() {
  $('#app').innerHTML = `<div class="shell">
    <aside class="sidebar">
      <div class="row" style="padding:4px 8px 16px">${brand()}<b class="wordmark">Crewdesk</b></div>
      ${NAV.concat(SIDE_EXTRA).map(([k, l, i]) => `<a class="navbtn" data-nav="${k}" href="#/${k}">${ic(i)}<span>${l}</span>${k === 'chat' ? '<span class="badge hidden" data-badge="chat"></span>' : ''}</a>`).join('')}
      <div class="grow"></div>
      <a class="navbtn" data-nav="profile" href="#/profile" id="side-me"></a>
      <nav class="foot-links" style="justify-content:flex-start;margin:8px 12px 0" aria-label="Legal"><a href="#/privacy">Privacy</a><a href="#/terms">Terms</a></nav>
    </aside>
    <div style="min-width:0">
      <header class="topbar">
        ${brand()}
        <button class="co-switch" data-act="switcher"><span class="name ellipsis" id="co-name"></span>${ic('down').replace('<svg', '<svg width="16" height="16"')}</button>
        <div class="grow"></div>
        <a href="#/team" class="pill nodot" id="online-pill" style="text-decoration:none"></a>
        <a href="#/profile" id="top-me" aria-label="My profile"></a>
      </header>
      <main id="view" tabindex="-1"></main>
    </div>
    <nav class="bottomnav">
      ${NAV.map(([k, l, i]) => `<a class="navbtn" data-nav="${k}" href="#/${k}">${ic(i)}<span>${l}</span>${k === 'chat' ? '<span class="badge hidden" data-badge="chat"></span>' : ''}</a>`).join('')}
      <a class="navbtn" data-nav="more" href="#/more">${ic('more')}<span>More</span></a>
    </nav>
  </div>`;
  updateChrome();
}
function updateChrome() {
  if (!$('#co-name')) return;
  $('#co-name').textContent = S.company.name;
  const online = Object.values(S.members).filter((m) => m.online).length;
  $('#online-pill').innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:#37b24d;display:inline-block"></span>${online} online`;
  const me = S.members[S.user.id] || S.user;
  $('#top-me').innerHTML = avatar(Object.assign({}, me, { online: true }), 'sm');
  $('#side-me').innerHTML = `${avatar(me, 'sm')}<span class="ellipsis">${esc(me.name)}</span>`;
  const unread = Object.values(S.unread).reduce((a, b) => a + (b || 0), 0);
  $$('[data-badge="chat"]').forEach((b) => { b.textContent = unread > 99 ? '99+' : unread; b.classList.toggle('hidden', !unread); });
  document.title = (unread ? `(${unread}) ` : '') + 'Crewdesk';
  const r = parseHash();
  const moreKeys = ['more', 'clients', 'client', 'news', 'settings', 'profile'];
  const active = r.name === 'job' ? 'jobs' : r.name === 'client' ? 'clients' : r.name;
  $$('.navbtn').forEach((b) => {
    const on = b.dataset.nav === active || (b.dataset.nav === 'more' && moreKeys.concat(['privacy', 'terms']).includes(r.name) && !b.closest('.sidebar'));
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
}
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, ...args] = h.split('/');
  return { name: name || 'home', args: args.map((a) => { try { return decodeURIComponent(a); } catch { return a; } }) };
}
let current = { key: '' };
const VIEWS = {};
function route() {
  if (!S.company) return;
  const r = parseHash();
  const v = VIEWS[r.name] || VIEWS.home;
  const key = location.hash;
  const sameView = current.key === key;
  current = { key, name: r.name, args: r.args, v };
  renderView(false, !sameView);
  updateChrome();
}
function renderView(auto = false, scrollTop = false) {
  const main = $('#view'); if (!main || !current.v) return;
  if (auto && current.v.update) { current.v.update(...current.args); return; }
  if (auto && current.v.manual) return;
  if (auto && main.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const y = window.scrollY;
  main.innerHTML = current.v.render(...current.args);
  if (current.v.mount) current.v.mount(...current.args);
  window.scrollTo(0, scrollTop ? 0 : y);
}
let rafPending = false;
function scheduleRender() {
  if (rafPending) return; rafPending = true;
  requestAnimationFrame(() => { rafPending = false; if (!S.company) return; updateChrome(); renderView(true); });
}
window.addEventListener('hashchange', () => {
  const r = parseHash();
  if (!S.company) {
    if (isLegal(r.name)) return renderLegalStandalone(r.name);
    if (standalone) { standalone = false; boot(); }
    return;
  }
  route();
});

// ============================================================ HOME
VIEWS.home = {
  render() {
    const me = S.user.id;
    const jobs = Object.values(S.jobs), open = jobs.filter((j) => j.status !== 'done');
    const tasks = Object.values(S.tasks).filter((t) => S.jobs[t.jobId] && S.jobs[t.jobId].status !== 'done');
    const active = jobs.filter((j) => j.status === 'active').length;
    const week = open.filter((j) => j.deadline && days(j.deadline) >= 0 && days(j.deadline) <= 7).length;
    const overdue = open.filter((j) => j.deadline && days(j.deadline) < 0).length + tasks.filter((t) => !t.done && t.deadline && days(t.deadline) < 0).length;
    const mine = tasks.filter((t) => !t.done && (t.assignees || []).includes(me)).sort(byDeadline);
    const hr = new Date().getHours();
    const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
    const upcoming = [
      ...open.filter((j) => j.deadline && days(j.deadline) <= 14).map((j) => ({ kind: 'job', id: j.id, title: j.title, sub: j.ref, deadline: j.deadline, link: '#/job/' + j.id })),
      ...tasks.filter((t) => !t.done && t.deadline && days(t.deadline) <= 14).map((t) => ({ kind: 'task', id: t.id, title: t.title, sub: S.jobs[t.jobId].title, deadline: t.deadline, link: `#/job/${t.jobId}/tasks` })),
    ].sort(byDeadline).slice(0, 8);
    const online = Object.values(S.members).filter((m) => m.online && m.id !== me);
    const news = Object.values(S.announcements).sort((a, b) => (b.pinned - a.pinned) || (b.createdAt - a.createdAt)).slice(0, 2);
    let moneyHtml = '';
    if (S.company.canSeeMoney) {
      const quoted = open.reduce((a, j) => a + (Number(j.price) || 0), 0);
      const costs = open.reduce((a, j) => a + jobCosts(j), 0);
      const doneVal = jobs.filter((j) => j.status === 'done').reduce((a, j) => a + (Number(j.price) || 0) - jobCosts(j), 0);
      moneyHtml = `<div class="section"><div class="section-head"><span class="eyebrow">Open jobs value</span><span class="tiny muted">Completed profit ${esc(money(doneVal))}</span></div>
        <div class="money-strip"><div><div class="tiny muted">Quoted</div><div class="v">${esc(money(quoted))}</div></div>
        <div><div class="tiny muted">Costs</div><div class="v">${esc(money(costs))}</div></div>
        <div><div class="tiny muted">Margin</div><div class="v ${quoted - costs >= 0 ? 'pos' : 'neg'}">${esc(money(quoted - costs))}</div></div></div></div>`;
    }
    return `
    <div class="hello"><div><div class="date">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <h1>${greet}, ${esc(S.user.name.split(' ')[0])}</h1></div>
      ${canCreateJobs() ? `<button class="btn primary" data-act="new-job">${ic('plus')}<span>New job</span></button>` : ''}</div>
    <div class="kpis">
      <a class="kpi hot" href="#/jobs/mine"><span class="v">${mine.length}</span><span class="l">My open tasks</span></a>
      <a class="kpi" href="#/jobs/active"><span class="v">${active}</span><span class="l">Jobs in progress</span></a>
      <a class="kpi" href="#/jobs/week"><span class="v">${week}</span><span class="l">Due in 7 days</span></a>
      <a class="kpi ${overdue ? 'alert' : ''}" href="#/jobs/overdue"><span class="v">${overdue}</span><span class="l">Overdue</span></a>
    </div>
    ${moneyHtml}
    <div class="grid two section">
      <div class="stack">
        <div><div class="section-head"><h2>My tasks</h2><a class="small muted" href="#/jobs/mine">See jobs</a></div>
          <div class="card flush">${mine.length ? `<div class="list">${mine.slice(0, 8).map((t) => `
            <div class="item"><button class="check round" data-act="task-toggle" data-id="${t.id}" aria-label="Mark done">${ic('check')}</button>
              <a class="grow" href="#/job/${t.jobId}/tasks" style="text-decoration:none"><div class="ellipsis" style="font-weight:600">${esc(t.title)}</div>
              <div class="row small muted"><span class="ellipsis">${esc(S.jobs[t.jobId].title)}</span>${dueHtml(t.deadline)}</div></a></div>`).join('')}</div>`
            : `<div class="empty">${ic('check')}<h3>You’re all caught up</h3><div class="small">Tasks assigned to you will show here.</div></div>`}</div></div>
        <div><div class="section-head"><h2>Coming up</h2><span class="tiny muted">Next 14 days</span></div>
          <div class="card flush">${upcoming.length ? `<div class="list">${upcoming.map((u) => `
            <a class="item" href="${u.link}"><span class="chan-ico" style="width:34px;height:34px;border-radius:10px">${ic(u.kind === 'job' ? 'jobs' : 'list')}</span>
            <div class="grow"><div class="ellipsis" style="font-weight:600">${esc(u.title)}</div><div class="tiny muted ellipsis">${u.kind === 'job' ? 'Job ' : 'Task · '}${esc(u.sub)}</div></div>${dueHtml(u.deadline)}</a>`).join('')}</div>`
            : `<div class="empty small">No deadlines in the next two weeks.</div>`}</div></div>
      </div>
      <div class="stack">
        <div class="card"><div class="section-head"><h3>Online now</h3><a class="small muted" href="#/team">Team</a></div>
          ${online.length ? `<div class="online-strip">${online.map((m) => `<a href="#/team" data-act="member" data-id="${m.id}">${avatar(m, 'lg', true)}<span>${esc(m.name.split(' ')[0])}</span></a>`).join('')}</div>`
          : '<div class="small muted">Just you right now.</div>'}</div>
        <div class="card"><div class="section-head"><h3>Announcements</h3><a class="small muted" href="#/news">All</a></div>
          ${news.length ? `<div class="stack">${news.map((n) => `<div class="announce"><div class="row"><b class="grow">${esc(n.title)}</b>${n.pinned ? '<span class="pill nodot st-active">Pinned</span>' : ''}</div>
            <div class="small" style="white-space:pre-wrap;margin-top:2px">${linkify(n.body.length > 220 ? n.body.slice(0, 220) + '…' : n.body)}</div>
            <div class="tiny muted" style="margin-top:4px">${esc(member(n.createdBy).name)} · ${timeAgo(n.createdAt)}</div></div>`).join('')}</div>`
          : `<div class="small muted">Nothing posted yet.${isAdmin() ? ' <a href="#/news">Post one</a>' : ''}</div>`}</div>
      </div>
    </div>`;
  },
};

// ============================================================ JOBS LIST
const FILTERS = [['open', 'Open'], ['mine', 'Mine'], ['planned', 'Planned'], ['active', 'In progress'], ['hold', 'On hold'], ['week', 'Due this week'], ['overdue', 'Overdue'], ['done', 'Done']];
function jobMatches(j, f) {
  const me = S.user.id;
  switch (f) {
    case 'open': return j.status !== 'done';
    case 'mine': return j.status !== 'done' && ((j.assignees || []).includes(me) || jobTasks(j.id).some((t) => !t.done && (t.assignees || []).includes(me)));
    case 'week': return j.status !== 'done' && j.deadline && days(j.deadline) >= 0 && days(j.deadline) <= 7;
    case 'overdue': return j.status !== 'done' && ((j.deadline && days(j.deadline) < 0) || jobTasks(j.id).some((t) => !t.done && t.deadline && days(t.deadline) < 0));
    case 'all': return true;
    default: return j.status === f;
  }
}
function jobCard(j) {
  const p = progress(j.id);
  const client = S.clients[j.clientId];
  const unread = S.unread['job:' + j.id] || 0;
  return `<a class="jobcard" href="#/job/${j.id}"><span class="stripe" style="background:${STATUS_COLOR[j.status]}"></span>
    <div class="row between"><span class="ref">${esc(j.ref)}</span><span class="row" style="gap:6px">${j.priority === 'urgent' || j.priority === 'high' ? `<span class="pill nodot pr-${j.priority}">${PRIORITY[j.priority]}</span>` : ''}${unread ? `<span class="badge">${unread}</span>` : ''}</span></div>
    <div><h3>${esc(j.title)}</h3>${client || j.address ? `<div class="small muted ellipsis" style="margin-top:2px">${esc([client && client.name, j.address].filter(Boolean).join(' · '))}</div>` : ''}</div>
    <div class="row wrap" style="gap:8px"><span class="pill st-${j.status}">${STATUS[j.status]}</span>${dueHtml(j.deadline, j.status === 'done')}</div>
    <div class="row">${p.total ? `<div class="grow"><div class="progress"><i style="width:${(p.done / p.total) * 100}%"></i></div><div class="tiny muted" style="margin-top:4px">${p.done}/${p.total} tasks</div></div>` : '<div class="grow tiny muted">No tasks yet</div>'}
      ${(() => { const n = jobPhotos(j.id).length; return n ? `<span class="meta-icons"><span title="${n} photos">${ic('camera')}${n}<span class="sr-only"> photos</span></span></span>` : ''; })()}${avatarStack(j.assignees)}</div>
  </a>`;
}
VIEWS.jobs = {
  render(filter) {
    if (filter) S.jobFilter = filter;
    const all = Object.values(S.jobs);
    return `<div class="section-head" style="margin-bottom:14px"><h1>Jobs</h1>${canCreateJobs() ? `<button class="btn primary" data-act="new-job">${ic('plus')}<span>New job</span></button>` : ''}</div>
      <div class="stack" style="gap:10px">
        <label class="search"><input class="input" type="search" placeholder="Search jobs, clients, addresses…" value="${esc(S.jobSearch)}" data-input="job-search">${ic('search')}</label>
        <div class="chips">${FILTERS.map(([k, l]) => `<button class="chip ${S.jobFilter === k ? 'on' : ''}" data-act="job-filter" data-f="${k}">${l}<span class="n">${all.filter((j) => jobMatches(j, k)).length}</span></button>`).join('')}</div>
      </div>
      <div class="section" id="joblist" style="margin-top:14px">${this.list()}</div>`;
  },
  list() {
    const q = S.jobSearch.trim().toLowerCase();
    let jobs = Object.values(S.jobs).filter((j) => jobMatches(j, S.jobFilter));
    if (q) jobs = jobs.filter((j) => [j.title, j.ref, j.address, j.description, (S.clients[j.clientId] || {}).name].join(' ').toLowerCase().includes(q));
    jobs.sort(S.jobFilter === 'done' ? (a, b) => b.updatedAt - a.updatedAt : byDeadline);
    if (!jobs.length) return `<div class="card empty">${ic('jobs')}<h3>${Object.keys(S.jobs).length ? 'No jobs match' : 'No jobs yet'}</h3><div class="small">${Object.keys(S.jobs).length ? 'Try another filter or search.' : canCreateJobs() ? 'Create your first job to start tracking work.' : 'Jobs your company adds will appear here.'}</div>${!Object.keys(S.jobs).length && canCreateJobs() ? `<button class="btn primary" style="margin-top:14px" data-act="new-job">${ic('plus')}New job</button>` : ''}</div>`;
    return `<div class="job-grid">${jobs.map(jobCard).join('')}</div>`;
  },
};

// ============================================================ JOB DETAIL
VIEWS.job = {
  render(id, tab = 'overview') {
    const j = S.jobs[id];
    if (!j) return `<a class="back" href="#/jobs">${ic('back')}Jobs</a><div class="card empty"><h3>Job not found</h3><div class="small">It may have been deleted.</div></div>`;
    return `<div id="job-top">${this.top(j, tab)}</div><div id="job-tab" class="section" style="margin-top:16px">${this.tab(j, tab)}</div>`;
  },
  mount(id, tab) { if (tab === 'chat') mountChat('job:' + id); },
  update(id, tab = 'overview') {
    const j = S.jobs[id];
    if (!j || !$('#job-top')) return renderView(false);
    $('#job-top').innerHTML = this.top(j, tab);
    const box = $('#job-tab');
    if (tab === 'chat') { refreshPanes('job:' + id); return; }
    if (box.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    box.innerHTML = this.tab(j, tab);
  },
  top(j, tab) {
    const p = progress(j.id);
    const unread = S.unread['job:' + j.id] || 0;
    const nPhotos = jobPhotos(j.id).length;
    const tabs = [['overview', 'Overview'], ['tasks', `Tasks${p.total ? ` <span class="muted">${p.done}/${p.total}</span>` : ''}`], ['photos', `Photos${nPhotos ? ` <span class="muted">${nPhotos}</span>` : ''}`]];
    if (S.company.canSeeMoney) tabs.push(['money', 'Money']);
    tabs.push(['chat', `Chat${unread ? ` <span class="badge">${unread}</span>` : ''}`]);
    return `<a class="back" href="#/jobs">${ic('back')}Jobs</a>
      <div class="job-head">
        <div class="row between top"><div class="grow"><div class="row" style="gap:8px"><span class="mono muted">${esc(j.ref)}</span>${j.priority !== 'normal' ? `<span class="pill nodot ${j.priority === 'low' ? '' : 'pr-' + j.priority}">${PRIORITY[j.priority]} priority</span>` : ''}</div>
          <h1 style="margin-top:4px">${esc(j.title)}</h1></div>
          <div class="row" style="gap:6px"><button class="btn sm icon" data-act="edit-job" data-id="${j.id}" aria-label="Edit job">${ic('edit')}</button>
          ${isAdmin() || j.createdBy === S.user.id ? `<button class="btn sm icon danger" data-act="del-job" data-id="${j.id}" aria-label="Delete job">${ic('trash')}</button>` : ''}</div></div>
        <div class="status-picker">${Object.entries(STATUS).map(([k, l]) => `<button class="${j.status === k ? 'on st-' + k : ''}" data-act="job-status" data-id="${j.id}" data-s="${k}">${l}</button>`).join('')}</div>
        ${p.total ? `<div><div class="progress"><i style="width:${(p.done / p.total) * 100}%"></i></div></div>` : ''}
      </div>
      <nav class="tabs" style="margin-top:14px" aria-label="Job sections">${tabs.map(([k, l]) => `<a class="tab ${tab === k ? 'on' : ''}" href="#/job/${j.id}/${k}" ${tab === k ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`;
  },
  tab(j, tab) {
    if (tab === 'tasks') return tasksTab(j);
    if (tab === 'photos') return `<div class="section-head"><div><h2>Photos</h2><div class="small muted">${isTouch() ? 'Take photos on site or pick from your camera roll.' : 'Click to add, or drag photos onto this page.'}</div></div>
      <button class="btn primary" data-act="photos-add" data-job="${j.id}">${ic('camera')}<span>Add photos</span></button></div>
      <div id="photo-gallery" data-job="${j.id}" data-drop="${j.id}">${photoGalleryInner(j.id)}</div>`;
    if (tab === 'money' && S.company.canSeeMoney) return moneyTab(j);
    if (tab === 'chat') return chatPane('job:' + j.id, true);
    return overviewTab(j);
  },
};
function overviewTab(j) {
  const c = S.clients[j.clientId]; const t = S.teams[j.teamId];
  return `<div class="grid two">
    <div class="stack">
      <div class="card"><dl class="kv">
        <dt>Client</dt><dd>${c ? `<a href="#/client/${c.id}" style="font-weight:600">${esc(c.name)}</a>${c.company ? `<span class="muted"> · ${esc(c.company)}</span>` : ''}
          <div class="row" style="gap:6px;margin-top:6px">${c.phone ? `<a class="btn sm" href="tel:${esc(c.phone)}">${ic('phone')}Call</a>` : ''}${c.email ? `<a class="btn sm" href="mailto:${esc(c.email)}">${ic('mail')}Email</a>` : ''}</div>` : '<span class="muted">None</span>'}</dd>
        <dt>Site</dt><dd>${j.address ? esc(j.address) : j.lat != null ? '<span class="muted">Pinned on map</span>' : '<span class="muted">No address</span>'}
          <div class="row wrap" style="gap:6px;margin-top:6px">${j.address || j.lat != null ? `<a class="btn sm" target="_blank" rel="noopener" href="${dirLink(j)}">${ic('nav')}Directions</a>` : ''}
          <button class="btn sm" data-act="job-here" data-id="${j.id}">${ic('locate')}${j.lat != null ? 'Re-pin here' : 'Pin my location'}</button></div></dd>
        <dt>Start</dt><dd>${j.start ? esc(fmtDate(j.start, true)) : '<span class="muted">—</span>'}</dd>
        <dt>Deadline</dt><dd>${j.deadline ? dueHtml(j.deadline, j.status === 'done') : '<span class="muted">No deadline</span>'}</dd>
        <dt>Team</dt><dd>${t ? `<span class="row" style="gap:6px"><span class="team-swatch" style="background:${esc(t.color)}"></span>${esc(t.name)}</span>` : '<span class="muted">—</span>'}</dd>
        <dt>Created</dt><dd class="small">${esc(member(j.createdBy).name)} · ${timeAgo(j.createdAt)}</dd>
      </dl></div>
      <div class="card"><h3 style="margin-bottom:8px">Description</h3>${j.description ? `<div style="white-space:pre-wrap">${linkify(j.description)}</div>` : `<div class="muted small">No description. <a href="#" data-act="edit-job" data-id="${j.id}">Add one</a></div>`}</div>
      <div class="card"><div class="section-head" style="margin-bottom:8px"><h3>Photos</h3><a class="small muted" href="#/job/${j.id}/photos">See all${jobPhotos(j.id).length ? ' ' + jobPhotos(j.id).length : ''}</a></div>
        <div id="photo-strip" data-job="${j.id}" data-drop="${j.id}">${photoStripInner(j.id)}</div></div>
    </div>
    <div class="stack">
      <div class="card"><h3>Who’s on this job</h3><p class="small muted" style="margin:4px 0 10px">Tap to add or remove people. They’ll get a notification.</p>
        <div class="people-pick">${Object.values(S.members).sort((a, b) => a.name.localeCompare(b.name)).map((m) => `<button class="person-chip ${(j.assignees || []).includes(m.id) ? 'on' : ''}" data-act="job-assign" data-id="${j.id}" data-uid="${m.id}">${avatar(m, 'sm', true)}${esc(m.name.split(' ')[0])}</button>`).join('')}</div></div>
      ${S.company.canSeeMoney ? `<a class="card" href="#/job/${j.id}/money" style="text-decoration:none"><div class="row between"><h3>Money</h3>${ic('right').replace('<svg', '<svg width="18" height="18"')}</div>
        <div class="row between small" style="margin-top:8px"><span class="muted">Price</span><b class="mono">${esc(money(j.price))}</b></div>
        <div class="row between small"><span class="muted">Costs</span><b class="mono">${esc(money(jobCosts(j)))}</b></div>
        <div class="row between small"><span class="muted">Profit</span><b class="mono ${j.price - jobCosts(j) >= 0 ? 'pos' : 'neg'}">${esc(money((j.price || 0) - jobCosts(j)))}</b></div></a>` : ''}
    </div></div>`;
}
function tasksTab(j) {
  const tasks = jobTasks(j.id);
  return `<form class="inline-add" data-form="task-add" data-job="${j.id}" style="margin-bottom:12px"><input class="input" name="title" placeholder="Add a task… e.g. Strip old tiles" required><button class="btn primary">${ic('plus')}<span>Add</span></button></form>
    <div class="card flush">${tasks.length ? tasks.map(taskHtml).join('') : `<div class="empty">${ic('list')}<h3>No tasks yet</h3><div class="small">Break the job into tasks, then add a checklist to each one.</div></div>`}</div>`;
}
function taskHtml(t) {
  const open = S.openTask === t.id;
  const cl = t.checklist || [];
  const clDone = cl.filter((x) => x.done).length;
  return `<div class="task">
    <div class="task-row">
      <button class="check round ${t.done ? 'on' : ''}" data-act="task-toggle" data-id="${t.id}" aria-pressed="${t.done}" aria-label="${t.done ? 'Mark not done' : 'Mark done'}: ${esc(t.title)}">${ic('check')}</button>
      <button class="task-main" data-act="task-open" data-id="${t.id}" aria-expanded="${open}"><div class="t ${t.done ? 'struck' : ''}">${esc(t.title)}</div>
        <div class="row wrap small muted" style="gap:10px;margin-top:3px">${avatarStack(t.assignees, 3)}${dueHtml(t.deadline, t.done)}${cl.length ? `<span class="row" style="gap:4px">${ic('list').replace('<svg', '<svg width="14" height="14"')}${clDone}/${cl.length}</span>` : ''}${t.notes ? '<span>Notes</span>' : ''}</div></div>
      </button><span class="muted" aria-hidden="true" style="transform:rotate(${open ? 90 : 0}deg);transition:.2s;display:flex">${ic('right').replace('<svg', '<svg width="18" height="18"')}</span>
    </div>
    ${open ? `<div class="task-body">
      <div><div class="eyebrow" style="margin-bottom:6px">Checklist</div>
        ${cl.map((x) => `<div class="cl-item"><button class="check ${x.done ? 'on' : ''}" data-act="cl-toggle" data-id="${t.id}" data-item="${x.id}">${ic('check')}</button><span class="${x.done ? 'struck' : ''}">${esc(x.text)}</span><button class="btn ghost sm icon x" data-act="cl-del" data-id="${t.id}" data-item="${x.id}" aria-label="Remove">${ic('x')}</button></div>`).join('')}
        <form class="inline-add" data-form="cl-add" data-id="${t.id}" style="margin-top:6px"><input class="input" name="text" placeholder="Add checklist item" aria-label="New checklist item" required><button class="btn sm" aria-label="Add checklist item">${ic('plus')}</button></form></div>
      <div><div class="eyebrow" style="margin-bottom:6px">Assigned to</div>
        <div class="people-pick">${Object.values(S.members).sort((a, b) => a.name.localeCompare(b.name)).map((m) => `<button class="person-chip ${(t.assignees || []).includes(m.id) ? 'on' : ''}" data-act="task-assign" data-id="${t.id}" data-uid="${m.id}">${avatar(m, 'sm')}${esc(m.name.split(' ')[0])}</button>`).join('')}</div></div>
      <div class="form-grid"><label class="field"><span>Deadline</span><input type="date" value="${esc(t.deadline)}" data-change="task-due" data-id="${t.id}"></label><div></div>
        <label class="field full"><span>Notes</span><textarea data-change="task-notes" data-id="${t.id}" placeholder="Details, measurements, materials…">${esc(t.notes)}</textarea></label></div>
      <div class="row"><button class="btn sm" data-act="task-rename" data-id="${t.id}">${ic('edit')}Rename</button><div class="grow"></div><button class="btn sm danger" data-act="task-del" data-id="${t.id}">${ic('trash')}Delete task</button></div>
    </div>` : ''}
  </div>`;
}
function moneyTab(j) {
  const costs = jobCosts(j); const price = Number(j.price) || 0; const profit = price - costs;
  return `<div class="grid two">
    <div class="stack">
      <div class="card"><label class="field"><span>Price charged to client</span><input type="number" inputmode="decimal" step="0.01" min="0" value="${price || ''}" placeholder="0.00" data-change="job-price" data-id="${j.id}"></label></div>
      <div class="card"><div class="section-head"><h3>Costs</h3><span class="mono small">${esc(money(costs))}</span></div>
        <div class="stack tight">${(j.costs || []).map((c) => `<div class="cost-row"><input class="input" value="${esc(c.label)}" data-change="cost-field" data-id="${j.id}" data-cost="${c.id}" data-k="label" aria-label="Cost description">
          <input class="input" type="number" inputmode="decimal" step="0.01" value="${c.amount}" data-change="cost-field" data-id="${j.id}" data-cost="${c.id}" data-k="amount" aria-label="Amount">
          <button class="btn ghost sm icon" data-act="cost-del" data-id="${j.id}" data-cost="${c.id}" aria-label="Remove">${ic('x')}</button></div>`).join('') || '<div class="small muted">No costs added yet.</div>'}</div>
        <form class="cost-row" data-form="cost-add" data-id="${j.id}" style="margin-top:12px"><input class="input" name="label" placeholder="Materials, labour, skip hire…" required><input class="input" name="amount" type="number" inputmode="decimal" step="0.01" placeholder="0.00" required><button class="btn sm icon primary" aria-label="Add cost">${ic('plus')}</button></form>
      </div>
    </div>
    <div class="card totals"><span class="eyebrow">Summary</span>
      <div class="row"><span class="muted">Price</span><span class="mono">${esc(money(price))}</span></div>
      <div class="row"><span class="muted">Costs</span><span class="mono">− ${esc(money(costs))}</span></div>
      <div style="border-top:1px solid var(--line);margin:4px 0"></div>
      <div class="row"><b>Profit</b><span class="big ${profit >= 0 ? 'pos' : 'neg'}">${esc(money(profit))}</span></div>
      <div class="row small"><span class="muted">Margin</span><span>${price ? Math.round((profit / price) * 100) + '%' : '—'}</span></div>
      ${!S.company.settings.membersSeeMoney ? `<div class="tiny muted" style="margin-top:6px">${ic('lock').replace('<svg', '<svg width="12" height="12" style="vertical-align:-1px"')} Only admins can see money. Change this in Company settings.</div>` : ''}
    </div></div>`;
}

function jobSheet(job) {
  const j = job || { title: '', description: '', status: 'planned', priority: 'normal', clientId: '', teamId: '', address: '', start: '', deadline: '', assignees: [S.user.id], price: '' };
  const clients = Object.values(S.clients).sort((a, b) => a.name.localeCompare(b.name));
  sheet(`${sheetHead(job ? 'Edit job' : 'New job')}
    <form class="stack" data-form="job" data-id="${job ? job.id : ''}">
      <label class="field"><span>Job title</span><input name="title" value="${esc(j.title)}" placeholder="e.g. Kitchen refit — 14 Elm Road" required></label>
      <div class="form-grid">
        <label class="field full"><span>Client</span><div class="row"><select name="clientId" class="grow"><option value="">No client</option>${clients.map((c) => `<option value="${c.id}" ${c.id === j.clientId ? 'selected' : ''}>${esc(c.name)}${c.company ? ' — ' + esc(c.company) : ''}</option>`).join('')}</select><button type="button" class="btn sm" data-act="quick-client">${ic('plus')}New</button></div></label>
        <label class="field"><span>Status</span><select name="status">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${j.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Priority</span><select name="priority">${Object.entries(PRIORITY).map(([k, l]) => `<option value="${k}" ${j.priority === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Start date</span><input type="date" name="start" value="${esc(j.start)}"></label>
        <label class="field"><span>Deadline</span><input type="date" name="deadline" value="${esc(j.deadline)}"></label>
        <label class="field full"><span>Site address</span><input name="address" value="${esc(j.address)}" placeholder="Street, town, postcode" autocomplete="street-address"></label>
        <label class="field full"><span>Team</span><select name="teamId"><option value="">No team</option>${Object.values(S.teams).map((t) => `<option value="${t.id}" ${t.id === j.teamId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
        ${S.company.canSeeMoney ? `<label class="field full"><span>Price (optional)</span><input type="number" inputmode="decimal" step="0.01" min="0" name="price" value="${j.price || ''}" placeholder="0.00"></label>` : ''}
        <label class="field full"><span>Description</span><textarea name="description" placeholder="Scope of work, access notes, materials…">${esc(j.description)}</textarea></label>
      </div>
      <div class="field"><span>Assign people</span>${peoplePicker(j.assignees || [])}</div>
      <div class="err-msg" data-err></div>
      <div class="sheet-foot" style="margin-top:4px"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${job ? 'Save changes' : 'Create job'}</button></div>
    </form>`);
}

// ============================================================ CHAT
function channelList(active) {
  const chans = [{ ch: 'general', name: S.company.name, sub: 'Everyone in the company', gen: true }];
  const jobs = Object.values(S.jobs).filter((j) => j.status !== 'done' || S.lastMsg['job:' + j.id]);
  jobs.sort((a, b) => ((S.lastMsg['job:' + b.id] || {}).at || b.createdAt) - ((S.lastMsg['job:' + a.id] || {}).at || a.createdAt));
  for (const j of jobs) chans.push({ ch: 'job:' + j.id, name: j.title, sub: j.ref, job: j });
  return chans.map((c) => {
    const lm = S.lastMsg[c.ch]; const un = S.unread[c.ch] || 0;
    const preview = lm ? (lm.system ? lm.text : `${lm.userId === S.user.id ? 'You' : member(lm.userId).name.split(' ')[0]}: ${lm.text}`) : c.sub;
    return `<a class="chan ${active === c.ch ? 'on' : ''}" href="#/chat/${c.ch}">
      <span class="chan-ico ${c.gen ? 'gen' : ''}" ${c.job ? `style="color:${STATUS_COLOR[c.job.status]}"` : ''}>${ic(c.gen ? 'hash' : 'jobs')}</span>
      <div class="grow"><div class="row between"><b class="ellipsis">${esc(c.name)}</b>${lm ? `<span class="tiny muted" style="flex:none">${timeAgo(lm.at)}</span>` : ''}</div>
        <div class="row between"><span class="small muted ellipsis">${esc(preview)}</span>${un ? `<span class="badge">${un}</span>` : ''}</div></div></a>`;
  }).join('');
}
function chatTitle(ch) {
  if (ch === 'general') return { name: S.company.name, sub: `${Object.keys(S.members).length} members · ${Object.values(S.members).filter((m) => m.online).length} online`, icon: 'hash' };
  const j = S.jobs[ch.slice(4)];
  return j ? { name: j.title, sub: `${j.ref} · ${STATUS[j.status]}`, icon: 'jobs', job: j } : { name: 'Chat', sub: '', icon: 'chat' };
}
function chatPane(ch, embedded = false) {
  const t = chatTitle(ch);
  return `<div class="chat-pane ${embedded ? 'embedded' : ''}" data-ch="${esc(ch)}">
    ${embedded ? '' : `<div class="chat-top"><a class="btn ghost sm icon" href="#/chat" aria-label="All chats" style="${matchMedia('(min-width:900px)').matches ? 'display:none' : ''}">${ic('back')}</a>
      <span class="chan-ico ${ch === 'general' ? 'gen' : ''}" style="width:36px;height:36px">${ic(t.icon)}</span>
      <div class="grow"><b class="ellipsis" style="display:block">${esc(t.name)}</b><span class="tiny muted" data-chat-sub>${esc(t.sub)}</span></div>
      ${t.job ? `<a class="btn sm" href="#/job/${t.job.id}">Open job</a>` : ''}</div>`}
    <div class="msgs" data-msgs role="log" aria-live="polite" aria-label="Messages"><div class="empty small">Loading…</div></div>
    <div class="attach-preview hidden" data-attach></div>
    <form class="composer" data-form="send" data-ch="${esc(ch)}">
      <button type="button" class="btn ghost icon" data-act="attach" data-ch="${esc(ch)}" aria-label="Add photos">${ic('camera')}</button>
      <textarea name="text" rows="1" placeholder="Message${ch === 'general' ? ' everyone' : ' the job crew'}…" data-input="autosize" enterkeyhint="send"></textarea>
      <button class="btn primary" aria-label="Send">${ic('send')}</button>
    </form>
  </div>`;
}
async function mountChat(ch) {
  const pane = $(`.chat-pane[data-ch="${CSS.escape(ch)}"]`); if (!pane) return;
  if (!S.msgs[ch]) {
    try { const r = await capi('GET', `/messages?channel=${encodeURIComponent(ch)}`); S.msgs[ch] = r.items; S.msgsMore[ch] = r.more; }
    catch (e) { $('[data-msgs]', pane).innerHTML = `<div class="empty small">${esc(e.message)}</div>`; return; }
  }
  renderMsgs(pane, ch, true); paintAttach(ch);
  if (S.unread[ch]) { markRead(ch); scheduleRender(); }
}
function refreshPanes(ch) {
  $$('.chat-pane').forEach((pane) => { if (pane.dataset.ch === ch && S.msgs[ch]) renderMsgs(pane, ch); });
}
function renderMsgs(pane, ch, forceBottom = false) {
  const box = $('[data-msgs]', pane);
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  const list = S.msgs[ch] || [];
  let html = S.msgsMore[ch] ? `<button class="btn sm" style="align-self:center;margin-bottom:8px" data-act="older" data-ch="${esc(ch)}">Load earlier messages</button>` : '';
  if (!list.length) html += `<div class="empty small" style="margin:auto">${ic('chat')}<div>No messages yet — say hello.</div></div>`;
  let lastDay = '';
  list.forEach((m, i) => {
    const day = new Date(m.at).toDateString();
    if (day !== lastDay) { html += `<div class="daysep">${esc(dayLabel(m.at))}</div>`; lastDay = day; }
    if (m.system) { html += `<div class="sys">${esc(m.text)} · ${clock(m.at)}</div>`; return; }
    const prev = list[i - 1], next = list[i + 1];
    const startRun = !prev || prev.system || prev.userId !== m.userId || m.at - prev.at > 300000 || new Date(prev.at).toDateString() !== day;
    const endRun = !next || next.system || next.userId !== m.userId || next.at - m.at > 300000 || new Date(next.at).toDateString() !== day;
    const mine = m.userId === S.user.id; const who = member(m.userId);
    if (startRun && !mine) html += `<div class="who" style="margin-left:${40}px;font-size:11.5px;font-weight:700;color:var(--muted);margin-top:10px">${esc(who.name)}</div>`;
    html += `<div class="msg ${mine ? 'mine' : ''} ${endRun ? 'last' : ''}" style="${startRun && mine ? 'margin-top:8px' : ''}">
      ${mine ? '' : avatar(who, 'sm')}
      <div class="bubble">${(() => { const imgs = msgImages(m); return imgs.length ? `<div class="bubble-photos ${imgs.length === 1 ? 'one' : ''}">${imgs.map((u, k) => `<button type="button" data-act="chat-photo" data-ch="${esc(ch)}" data-msg="${m.id}" data-i="${k}" aria-label="Open photo ${k + 1} from ${esc(who.name)}"><img src="${esc(u)}" alt="Photo from ${esc(who.name)}" loading="lazy" decoding="async"></button>`).join('')}</div>` : ''; })()}${m.text ? linkify(m.text) : ''}</div>
      <span class="msg-time">${clock(m.at)}</span></div>`;
  });
  box.innerHTML = html;
  $$('img', box).forEach((img) => img.addEventListener('load', () => { if (forceBottom || nearBottom) box.scrollTop = box.scrollHeight; }, { once: true }));
  if (forceBottom || nearBottom) box.scrollTop = box.scrollHeight;
  const sub = $('[data-chat-sub]', pane); if (sub) sub.textContent = chatTitle(ch).sub;
}
VIEWS.chat = {
  render(ch) {
    const wide = matchMedia('(min-width:900px)').matches;
    if (!ch && wide) ch = 'general';
    if (ch && ch !== 'general' && !S.jobs[ch.slice(4)]) ch = wide ? 'general' : null;
    if (!ch) return `<div class="section-head" style="margin-bottom:14px"><h1>Chat</h1></div><div class="card flush" id="chanlist">${channelList(null)}</div>`;
    return `<div class="chat-layout">${wide ? `<div class="card flush" style="overflow-y:auto" id="chanlist">${channelList(ch)}</div>` : ''}${chatPane(ch)}</div>`;
  },
  mount(ch) { const p = $('.chat-pane'); if (p) mountChat(p.dataset.ch); },
  update(ch) {
    const pane = $('.chat-pane');
    const cl = $('#chanlist'); if (cl) { const st = cl.scrollTop; cl.innerHTML = channelList(pane ? pane.dataset.ch : null); cl.scrollTop = st; }
    if (pane) { const sub = $('[data-chat-sub]', pane); if (sub) sub.textContent = chatTitle(pane.dataset.ch).sub; }
  },
};

// ============================================================ TEAM
VIEWS.team = {
  render() {
    const sharing = !!(S.user.shareLocation);
    return `<div class="section-head" style="margin-bottom:14px"><h1>Team</h1><span class="small muted">${Object.keys(S.members).length} people</span></div>
      <div class="stack">
        <label class="loc-banner">${ic('locate')}<div class="grow"><b>Share my live location</b><div class="small muted">Your crew sees where you are while Crewdesk is open on your phone. Turn off any time.</div></div>
          <span class="switch"><input type="checkbox" ${sharing ? 'checked' : ''} data-change="share-loc"><i></i></span></label>
        ${!window.isSecureContext ? `<div class="warn">GPS needs a secure <b>https://</b> link. Open Crewdesk through the public link from <b>start-public.bat</b> (see README) to use location.</div>` : ''}
        <div id="map"></div>
        <div class="grid halves">
          <div><div class="section-head"><h2>People</h2></div><div class="card flush" id="team-people">${this.people()}</div></div>
          <div><div class="section-head"><h2>Teams</h2>${isAdmin() ? `<button class="btn sm" data-act="team-edit">${ic('plus')}New team</button>` : ''}</div><div id="team-teams">${this.teams()}</div></div>
        </div>
      </div>`;
  },
  mount() { drawMap(); },
  update() { const a = $('#team-people'), b = $('#team-teams'); if (a) a.innerHTML = this.people(); if (b) b.innerHTML = this.teams(); updateMap(); },
  people() {
    const ms = Object.values(S.members).sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name));
    return `<div class="list">${ms.map((m) => `<button class="item" data-act="member" data-id="${m.id}">${avatar(m, '', true)}
      <div class="grow"><div class="row" style="gap:6px"><b class="ellipsis">${esc(m.name)}</b>${m.id === S.user.id ? '<span class="tiny muted">(you)</span>' : ''}</div>
      <div class="small muted ellipsis">${esc([m.title, m.online ? 'Online' : 'Last seen ' + timeAgo(m.lastSeen)].filter(Boolean).join(' · '))}</div></div>
      ${S.locations[m.id] ? `<span class="muted" title="Sharing location">${ic('pin').replace('<svg', '<svg width="16" height="16"')}</span>` : ''}
      ${m.role !== 'member' ? `<span class="pill nodot">${ROLE[m.role]}</span>` : ''}</button>`).join('')}</div>`;
  },
  teams() {
    const ts = Object.values(S.teams).sort((a, b) => a.name.localeCompare(b.name));
    if (!ts.length) return `<div class="card empty small">${ic('layers')}<div>No teams yet.${isAdmin() ? ' Create teams like “Electrical” or “North crew”, then people can join them.' : ''}</div></div>`;
    return `<div class="stack tight">${ts.map((t) => { const inT = (t.members || []).includes(S.user.id); return `<div class="card" style="padding:12px 14px">
      <div class="row"><span class="team-swatch" style="background:${esc(t.color)}"></span><b class="grow ellipsis">${esc(t.name)}</b>
      <button class="btn sm ${inT ? '' : 'dark'}" data-act="team-${inT ? 'leave' : 'join'}" data-id="${t.id}">${inT ? 'Leave' : 'Join'}</button>
      ${isAdmin() ? `<button class="btn ghost sm icon" data-act="team-edit" data-id="${t.id}" aria-label="Edit team">${ic('edit')}</button>` : ''}</div>
      <div class="row" style="margin-top:8px">${(t.members || []).length ? avatarStack(t.members, 8) + `<span class="small muted">${t.members.length} member${t.members.length === 1 ? '' : 's'}</span>` : '<span class="small muted">No one yet</span>'}</div></div>`; }).join('')}</div>`;
  },
};
function memberSheet(id) {
  const m = S.members[id]; if (!m) return;
  const loc = S.locations[id];
  const myJobs = Object.values(S.jobs).filter((j) => j.status !== 'done' && (j.assignees || []).includes(id));
  const canManage = isAdmin() && m.role !== 'owner' && id !== S.user.id;
  sheet(`${sheetHead('')}
    <div class="stack" style="align-items:center;text-align:center;margin-top:-30px">${avatar(m, 'xl', true)}
      <div><h2>${esc(m.name)}</h2><div class="muted small">${esc([m.title, ROLE[m.role]].filter(Boolean).join(' · '))}</div>
      <div class="tiny muted" style="margin-top:2px">${m.online ? '● Online now' : 'Last seen ' + timeAgo(m.lastSeen)}</div></div>
      ${m.bio ? `<p style="margin:0;white-space:pre-wrap">${esc(m.bio)}</p>` : ''}
      <div class="row wrap" style="justify-content:center">${m.phone ? `<a class="btn sm" href="tel:${esc(m.phone)}">${ic('phone')}Call</a><a class="btn sm" href="sms:${esc(m.phone)}">${ic('chat')}Text</a>` : ''}${m.email ? `<a class="btn sm" href="mailto:${esc(m.email)}">${ic('mail')}Email</a>` : ''}
      ${loc ? `<button class="btn sm" data-act="map-focus" data-id="${id}" data-close>${ic('pin')}On map</button><a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}">${ic('nav')}Directions</a>` : ''}</div>
    </div>
    ${myJobs.length ? `<div class="section"><div class="eyebrow" style="margin-bottom:8px">Working on</div><div class="card flush"><div class="list">${myJobs.map((j) => `<a class="item" href="#/job/${j.id}" data-close><div class="grow"><b class="ellipsis" style="display:block">${esc(j.title)}</b><span class="tiny muted">${esc(j.ref)}</span></div><span class="pill st-${j.status}">${STATUS[j.status]}</span></a>`).join('')}</div></div></div>` : ''}
    ${canManage || (S.role === 'owner' && id !== S.user.id) ? `<div class="section"><div class="eyebrow" style="margin-bottom:8px">Manage</div><div class="row wrap">
      ${canManage ? `<button class="btn sm" data-act="set-role" data-id="${id}" data-role="${m.role === 'admin' ? 'member' : 'admin'}" data-close>${m.role === 'admin' ? 'Make member' : 'Make admin'}</button>` : ''}
      ${S.role === 'owner' && id !== S.user.id ? `<button class="btn sm" data-act="make-owner" data-id="${id}" data-close>Make owner</button>` : ''}
      ${canManage ? `<button class="btn sm danger" data-act="remove-member" data-id="${id}" data-close>Remove from company</button>` : ''}</div></div>` : ''}`);
}
function teamSheet(id) {
  const t = id ? S.teams[id] : { name: '', color: PALETTE[Object.keys(S.teams).length % PALETTE.length], members: [] };
  sheet(`${sheetHead(id ? 'Edit team' : 'New team')}<form class="stack" data-form="team" data-id="${id || ''}">
    <label class="field"><span>Team name</span><input name="name" value="${esc(t.name)}" placeholder="e.g. Electrical, North crew" required></label>
    <div class="field"><span>Colour</span><div class="row wrap">${PALETTE.map((c) => `<label style="cursor:pointer"><input type="radio" name="color" value="${c}" ${c === t.color ? 'checked' : ''} style="position:absolute;opacity:0"><span class="team-swatch" style="width:30px;height:30px;border-radius:9px;display:block;background:${c};outline:${c === t.color ? '3px solid var(--ink)' : 'none'};outline-offset:2px" data-swatch></span></label>`).join('')}</div></div>
    <div class="field"><span>Members</span>${peoplePicker(t.members || [])}</div>
    <div class="err-msg" data-err></div>
    <div class="sheet-foot">${id ? `<button type="button" class="btn danger" data-act="team-del" data-id="${id}">Delete</button>` : '<button type="button" class="btn" data-close>Cancel</button>'}<button class="btn primary">${id ? 'Save' : 'Create team'}</button></div>
  </form>`, (sh) => {
    sh.addEventListener('change', (e) => { if (e.target.name === 'color') $$('[data-swatch]', sh).forEach((s) => { s.style.outline = s.previousElementSibling.checked ? '3px solid var(--ink)' : 'none'; }); });
  });
}

// ============================================================ CLIENTS
VIEWS.clients = {
  render() {
    return `<div class="section-head" style="margin-bottom:14px"><h1>Clients</h1><button class="btn primary" data-act="client-edit">${ic('plus')}<span>Add client</span></button></div>
      <label class="search"><input class="input" type="search" placeholder="Search name, company, phone…" value="${esc(S.clientSearch)}" data-input="client-search">${ic('search')}</label>
      <div class="section" id="clientlist" style="margin-top:14px">${this.list()}</div>`;
  },
  list() {
    const q = S.clientSearch.trim().toLowerCase();
    let cs = Object.values(S.clients).sort((a, b) => a.name.localeCompare(b.name));
    if (q) cs = cs.filter((c) => [c.name, c.company, c.phone, c.email, c.address].join(' ').toLowerCase().includes(q));
    if (!cs.length) return `<div class="card empty">${ic('contacts')}<h3>${Object.keys(S.clients).length ? 'No matches' : 'No clients yet'}</h3><div class="small">Keep every customer’s phone, email and address in one place.</div></div>`;
    return `<div class="card flush"><div class="list">${cs.map((c) => { const n = Object.values(S.jobs).filter((j) => j.clientId === c.id && j.status !== 'done').length; return `
      <a class="item" href="#/client/${c.id}"><span class="avatar" style="--c:${colorFor(c.id)};border-radius:11px">${esc(initials(c.name))}</span>
      <div class="grow"><b class="ellipsis" style="display:block">${esc(c.name)}</b><span class="small muted ellipsis" style="display:block">${esc([c.company, c.phone].filter(Boolean).join(' · ') || c.email || '—')}</span></div>
      ${n ? `<span class="pill nodot st-active">${n} open</span>` : ''}</a>`; }).join('')}</div></div>`;
  },
};
VIEWS.client = {
  render(id) {
    const c = S.clients[id];
    if (!c) return `<a class="back" href="#/clients">${ic('back')}Clients</a><div class="card empty"><h3>Client not found</h3></div>`;
    const jobs = Object.values(S.jobs).filter((j) => j.clientId === id).sort(byDeadline);
    return `<a class="back" href="#/clients">${ic('back')}Clients</a>
      <div class="row between top" style="margin:6px 0 16px"><div class="row"><span class="avatar lg" style="--c:${colorFor(c.id)};border-radius:14px">${esc(initials(c.name))}</span><div><h1>${esc(c.name)}</h1>${c.company ? `<div class="muted">${esc(c.company)}</div>` : ''}</div></div>
      <div class="row" style="gap:6px"><button class="btn sm icon" data-act="client-edit" data-id="${c.id}" aria-label="Edit">${ic('edit')}</button>${isAdmin() ? `<button class="btn sm icon danger" data-act="client-del" data-id="${c.id}" aria-label="Delete">${ic('trash')}</button>` : ''}</div></div>
      <div class="row wrap" style="margin-bottom:16px">${c.phone ? `<a class="btn primary" href="tel:${esc(c.phone)}">${ic('phone')}Call</a><a class="btn" href="sms:${esc(c.phone)}">${ic('chat')}Text</a>` : ''}${c.email ? `<a class="btn" href="mailto:${esc(c.email)}">${ic('mail')}Email</a>` : ''}${c.address ? `<a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(c.address)}">${ic('nav')}Directions</a>` : ''}</div>
      <div class="grid two">
        <div class="card"><dl class="kv"><dt>Phone</dt><dd>${esc(c.phone) || '<span class="muted">—</span>'}</dd><dt>Email</dt><dd>${esc(c.email) || '<span class="muted">—</span>'}</dd>
          <dt>Address</dt><dd>${esc(c.address) || '<span class="muted">—</span>'}</dd><dt>Notes</dt><dd style="white-space:pre-wrap">${c.notes ? linkify(c.notes) : '<span class="muted">—</span>'}</dd></dl></div>
        <div><div class="section-head"><h2>Jobs</h2>${canCreateJobs() ? `<button class="btn sm" data-act="new-job" data-client="${c.id}">${ic('plus')}New job</button>` : ''}</div>
          ${jobs.length ? `<div class="stack tight">${jobs.map(jobCard).join('')}</div>` : '<div class="card empty small">No jobs for this client yet.</div>'}</div>
      </div>`;
  },
};
function clientSheet(id, onSaved) {
  const c = id ? S.clients[id] : { name: '', company: '', phone: '', email: '', address: '', notes: '' };
  sheet(`${sheetHead(id ? 'Edit client' : 'New client')}<form class="stack" data-form="client" data-id="${id || ''}">
    <div class="form-grid">
      <label class="field"><span>Name</span><input name="name" value="${esc(c.name)}" autocomplete="off" required></label>
      <label class="field"><span>Company</span><input name="company" value="${esc(c.company)}" autocomplete="off"></label>
      <label class="field"><span>Phone</span><input name="phone" type="tel" value="${esc(c.phone)}" autocomplete="off"></label>
      <label class="field"><span>Email</span><input name="email" type="email" value="${esc(c.email)}" autocomplete="off"></label>
      <label class="field full"><span>Address</span><input name="address" value="${esc(c.address)}" autocomplete="off"></label>
      <label class="field full"><span>Notes</span><textarea name="notes" placeholder="Gate code, parking, preferred contact times…">${esc(c.notes)}</textarea></label>
    </div><div class="err-msg" data-err></div>
    <div class="sheet-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${id ? 'Save' : 'Add client'}</button></div>
  </form>`, (sh) => { sh.querySelector('form')._onSaved = onSaved; });
}

// ============================================================ ANNOUNCEMENTS
VIEWS.news = {
  render() {
    const list = Object.values(S.announcements).sort((a, b) => (b.pinned - a.pinned) || (b.createdAt - a.createdAt));
    return `<div class="section-head" style="margin-bottom:14px"><h1>Announcements</h1>${isAdmin() ? `<button class="btn primary" data-act="news-edit">${ic('megaphone')}<span>Post</span></button>` : ''}</div>
      ${list.length ? `<div class="stack">${list.map((n) => { const a = member(n.createdBy); return `<article class="card">
        <div class="row top"><div class="grow"><div class="row" style="gap:8px">${n.pinned ? '<span class="pill nodot st-active">Pinned</span>' : ''}<h2 style="font-size:17px">${esc(n.title)}</h2></div></div>
        ${isAdmin() ? `<div class="row" style="gap:4px"><button class="btn ghost sm" data-act="news-pin" data-id="${n.id}">${n.pinned ? 'Unpin' : 'Pin'}</button><button class="btn ghost sm icon" data-act="news-edit" data-id="${n.id}" aria-label="Edit">${ic('edit')}</button><button class="btn ghost sm icon" data-act="news-del" data-id="${n.id}" aria-label="Delete">${ic('trash')}</button></div>` : ''}</div>
        ${n.body ? `<div style="white-space:pre-wrap;margin-top:8px">${linkify(n.body)}</div>` : ''}
        <div class="row small muted" style="margin-top:12px">${avatar(a, 'xs')}<span>${esc(a.name)} · ${timeAgo(n.createdAt)}</span></div></article>`; }).join('')}</div>`
      : `<div class="card empty">${ic('megaphone')}<h3>No announcements</h3><div class="small">${isAdmin() ? 'Post updates the whole company should see — everyone gets notified.' : 'Company updates from your admins will appear here.'}</div></div>`}`;
  },
};
function newsSheet(id) {
  const n = id ? S.announcements[id] : { title: '', body: '', pinned: false };
  sheet(`${sheetHead(id ? 'Edit announcement' : 'New announcement')}<form class="stack" data-form="news" data-id="${id || ''}">
    <label class="field"><span>Headline</span><input name="title" value="${esc(n.title)}" required></label>
    <label class="field"><span>Message</span><textarea name="body" rows="6">${esc(n.body)}</textarea></label>
    <label class="row"><span class="switch"><input type="checkbox" name="pinned" ${n.pinned ? 'checked' : ''}><i></i></span><span>Pin to the top</span></label>
    <div class="err-msg" data-err></div>
    <div class="sheet-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${id ? 'Save' : 'Post to everyone'}</button></div></form>`);
}

// ============================================================ MORE, SETTINGS, PROFILE
VIEWS.more = {
  render() {
    const unreadNews = '';
    return `<h1 style="margin-bottom:14px">More</h1>
      <div class="card" style="padding:4px 14px"><div class="menu">
        <a href="#/clients">${ic('contacts')}<span class="grow">Clients</span>${ic('right')}</a>
        <a href="#/news">${ic('megaphone')}<span class="grow">Announcements</span>${unreadNews}${ic('right')}</a>
        <a href="#/settings">${ic('settings')}<span class="grow">Company &amp; invites</span>${ic('right')}</a>
        <a href="#/profile">${ic('user')}<span class="grow">My profile</span>${ic('right')}</a>
        <button data-act="switcher">${ic('building')}<span class="grow">Switch or join company</span>${ic('right')}</button>
        <a href="#/privacy">${ic('shield')}<span class="grow">Privacy policy</span>${ic('right')}</a>
        <a href="#/terms">${ic('file')}<span class="grow">Terms of use</span>${ic('right')}</a>
        <button data-act="logout">${ic('logout')}<span class="grow">Sign out</span></button>
      </div></div>
      <div class="card section row">${ic('phoneapp').replace('<svg', '<svg width="26" height="26" style="color:var(--accent);flex:none"')}<div class="small"><b>Install on your phone</b><br><span class="muted">iPhone: Safari → Share → Add to Home Screen. Android: Chrome menu → Install app.</span></div></div>`;
  },
};
VIEWS.settings = {
  manual: true,
  render() {
    const c = S.company; const admin = isAdmin();
    const link = location.origin;
    return `<h1 style="margin-bottom:14px">Company</h1>
    <div class="grid halves">
      <div class="stack">
        <div class="card stack"><div><h2>Invite your crew</h2><p class="small muted" style="margin:4px 0 0">People sign up, tap “Join a company” and enter this code with your join password.</p></div>
          <div class="code-box">${esc(c.code)}</div>
          <div class="row wrap"><button class="btn sm" data-act="copy-invite">${ic('copy')}Copy invite message</button>${admin ? `<button class="btn sm" data-act="new-code">${ic('refresh')}New code</button>` : ''}</div>
          <div class="tiny muted">App link: ${esc(link)}</div></div>
        ${admin ? `<form class="card stack" data-form="co-pass"><h3>Change join password</h3><div class="inline-add"><input class="input" name="password" type="text" autocomplete="off" minlength="4" placeholder="New join password" required><button class="btn dark">Save</button></div>
          <div class="tiny muted">Existing members stay in. New joiners need the new password.</div></form>` : ''}
      </div>
      <div class="stack">
        ${admin ? `<form class="card stack" data-form="co-name"><h3>Company details</h3>
          <div class="form-grid"><label class="field"><span>Name</span><input name="name" value="${esc(c.name)}" required></label>
          <label class="field"><span>Currency symbol</span><input name="currency" value="${esc(c.settings.currency || '£')}" maxlength="3"></label></div>
          <button class="btn dark">Save details</button></form>
        <div class="card stack"><h3>Permissions</h3>
          <label class="row between"><span><b>Members can see money</b><br><span class="small muted">Prices, costs and profit on jobs</span></span><span class="switch"><input type="checkbox" data-change="co-setting" data-k="membersSeeMoney" ${c.settings.membersSeeMoney ? 'checked' : ''}><i></i></span></label>
          <label class="row between"><span><b>Members can create jobs</b><br><span class="small muted">Otherwise only admins can</span></span><span class="switch"><input type="checkbox" data-change="co-setting" data-k="membersCreateJobs" ${c.settings.membersCreateJobs !== false ? 'checked' : ''}><i></i></span></label>
          <div class="tiny muted">Manage roles by tapping a person on the Team page.</div></div>` : `<div class="card"><h3>${esc(c.name)}</h3><p class="small muted">You’re a ${ROLE[S.role].toLowerCase()}. Admins manage company settings.</p></div>`}
        <div class="card stack"><h3>Danger zone</h3>
          ${S.role === 'owner' ? `<button class="btn danger" data-act="del-company">${ic('trash')}Delete company and all its data</button>` : `<button class="btn danger" data-act="leave-company">${ic('logout')}Leave ${esc(c.name)}</button>`}</div>
      </div>
    </div>`;
  },
};
VIEWS.profile = {
  manual: true,
  render() {
    const u = S.members[S.user.id] ? Object.assign({}, S.user, S.members[S.user.id]) : S.user;
    const theme = store.get('cd_theme') || 'auto';
    const notif = 'Notification' in window ? Notification.permission : 'unsupported';
    return `<h1 style="margin-bottom:14px">My profile</h1>
    <div class="grid halves">
      <div class="stack">
        <div class="card row">${avatar(Object.assign({}, u, { online: true }), 'xl')}<div class="stack tight"><b>${esc(u.name)}</b><span class="small muted">${esc(u.email)}</span>
          <div class="row wrap" style="gap:6px"><button class="btn sm" data-act="avatar">${ic('image')}Change picture</button>${u.avatar ? `<button class="btn ghost sm" data-act="avatar-remove">Remove</button>` : ''}</div></div></div>
        <form class="card stack" data-form="profile">
          <div class="form-grid"><label class="field"><span>Name</span><input name="name" value="${esc(u.name)}" required></label>
          <label class="field"><span>Job title</span><input name="title" value="${esc(u.title)}" placeholder="e.g. Site manager"></label>
          <label class="field full"><span>Phone</span><input name="phone" type="tel" value="${esc(u.phone)}" placeholder="So your crew can call you"></label>
          <label class="field full"><span>About</span><textarea name="bio" placeholder="Trades, skills, certifications…">${esc(u.bio)}</textarea></label></div>
          <button class="btn dark">Save profile</button></form>
      </div>
      <div class="stack">
        <div class="card stack"><h3>Location</h3>
          <label class="row between"><span><b>Share my live location</b><br><span class="small muted">Visible to people in your companies while the app is open.</span></span><span class="switch"><input type="checkbox" data-change="share-loc" ${u.shareLocation ? 'checked' : ''}><i></i></span></label>
          ${!window.isSecureContext ? '<div class="warn">Needs a secure https:// link to work on phones.</div>' : ''}</div>
        <div class="card stack"><h3>Alerts &amp; appearance</h3>
          <div class="row between"><span><b>Pop-up notifications</b><br><span class="small muted">${notif === 'granted' ? 'On for this device' : notif === 'denied' ? 'Blocked in browser settings' : notif === 'unsupported' ? 'Not supported on this browser' : 'Get alerts when the app is in the background'}</span></span>
            ${notif === 'default' ? `<button class="btn sm" data-act="enable-notif">${ic('bell')}Turn on</button>` : ''}</div>
          <label class="field"><span>Theme</span><select data-change="theme"><option value="auto" ${theme === 'auto' ? 'selected' : ''}>Match my device</option><option value="light" ${theme === 'light' ? 'selected' : ''}>Light</option><option value="dark" ${theme === 'dark' ? 'selected' : ''}>Dark</option></select></label></div>
        <form class="card stack" data-form="password"><h3>Change password</h3>
          <label class="field"><span>Current password</span><input name="currentPassword" type="password" autocomplete="current-password" required></label>
          <label class="field"><span>New password</span><input name="newPassword" type="password" autocomplete="new-password" minlength="6" required></label>
          <button class="btn">Update password</button></form>
        <div class="card stack"><h3>Your data</h3>
          <p class="small muted" style="margin:0">Download a copy of everything Crewdesk holds about you, or delete your account. See the <a href="#/privacy">Privacy Policy</a>.</p>
          <div class="row wrap"><button class="btn sm" data-act="export-data">${ic('download')}Download my data</button>
          <button class="btn sm danger" data-act="delete-account">${ic('trash')}Delete my account</button></div></div>
        <button class="btn danger" data-act="logout">${ic('logout')}Sign out</button>
      </div>
    </div>`;
  },
};

// ============================================================ PRIVACY & TERMS
const LEGAL_DATE = '3 November 2026';
function operatorLine() {
  const o = (S.info && S.info.operator) || {};
  if (o.name) return `${esc(o.name)}${o.address ? ', ' + esc(o.address) : ''}${o.email ? ` — <a href="mailto:${esc(o.email)}">${esc(o.email)}</a>` : ''}`;
  return 'the person or business that invited you to Crewdesk (this copy is a test version, so contact them directly)';
}
function legalHtml(kind) {
  const op = operatorLine();
  if (kind === 'terms') return `<article class="legal">
    <h1>Terms of use</h1><p class="updated">Last updated ${LEGAL_DATE}</p>
    <p>These terms cover your use of Crewdesk, a job tracker and team chat app run by ${op} (“we”).</p>
    <h2>The service</h2>
    <p>Crewdesk is currently offered free of charge as a test service. It may change, have downtime, or lose data, so keep your own copies of anything critical. Because nothing is paid for, there are no charges to refund. If paid plans are added later, prices and a refund policy will be shown before you pay.</p>
    <h2>Your account</h2>
    <ul><li>Give your real name and an email address you control, and keep your password private.</li>
    <li>You are responsible for what happens under your account.</li>
    <li>Company owners and admins control their company’s board: they can change settings, remove members and delete the company and its content.</li></ul>
    <h2>What you put in Crewdesk</h2>
    <ul><li>You keep ownership of your photos, messages and job details. You let us store and show them to the people in your company so the app can work.</li>
    <li>Only upload photos you took or have the right to share, and don’t photograph people without their permission.</li>
    <li>If you add customer contact details, make sure you are allowed to use them for the job.</li>
    <li>Don’t use Crewdesk for anything illegal, abusive, or to harass anyone, and don’t try to break or overload it.</li></ul>
    <h2>Location sharing</h2>
    <p>Sharing your live location is optional and off by default. Only switch it on if you’re happy for your company to see where you are while the app is open. Employers should agree this with staff and not use it to track people outside working time.</p>
    <h2>Ending your account</h2>
    <p>You can delete your account at any time from your profile. We may suspend accounts that break these terms.</p>
    <h2>Liability</h2>
    <p>We provide Crewdesk “as is” and can’t promise it will always be available or error-free. We are not liable for indirect losses, such as lost profits or business, arising from use of the app. Nothing in these terms limits liability that can’t be limited by law, including for death or personal injury caused by negligence, or for fraud.</p>
    <h2>Changes and law</h2>
    <p>We may update these terms and will show the date of the latest version here. These terms are governed by the law of England and Wales.</p>
    <h2>Contact</h2><p>${op}.</p>
  </article>`;
  return `<article class="legal">
    <h1>Privacy policy</h1><p class="updated">Last updated ${LEGAL_DATE}</p>
    <p>This explains what personal information Crewdesk collects, why, and your rights under UK data protection law (UK GDPR). Crewdesk is run by ${op}, who is responsible for your data.</p>
    <h2>What we collect</h2>
    <ul><li><b>Account:</b> your name, email address and password (stored only as a secure scrambled “hash”, never readable).</li>
    <li><b>Profile (optional):</b> phone number, job title, a short bio and a profile picture, if you add them.</li>
    <li><b>Your work:</b> jobs, tasks, checklists, photos, messages, announcements, and any customer contact details your company adds.</li>
    <li><b>Live location (optional, off by default):</b> only if you switch on “Share my live location”, and only while Crewdesk is open on your device. Turning it off deletes your position straight away, and old positions are deleted automatically after 12 hours.</li>
    <li><b>Technical:</b> when you were last online, and your IP address, which is used briefly to block repeated failed sign-ins and is not stored.</li></ul>
    <p>We don’t collect anything else, and we don’t use advertising, analytics or tracking tools.</p>
    <h2>Why we use it</h2>
    <ul><li>To run the app for you and your company: this is necessary to provide the service you signed up for.</li>
    <li>To keep accounts secure and prevent misuse: this is in our legitimate interests.</li>
    <li>Live location is used only because you chose to switch it on (your consent), which you can withdraw at any time.</li></ul>
    <h2>Who can see it</h2>
    <ul><li>People in the same company can see your name, profile, the jobs and photos you’re part of, and messages in chats you share. Your location is shown only to your companies, only while sharing is on.</li>
    <li>Our hosting providers store data for us under contract: Render (web hosting) and Neon (database), both in the EU (Frankfurt).</li>
    <li>When you open the team map, map images load from OpenStreetMap, which sees your IP address. If you tap “Directions”, Google Maps opens and its own privacy policy applies.</li>
    <li>We never sell your data.</li></ul>
    <h2>Cookies and storage</h2>
    <p>Crewdesk doesn’t use cookies. It saves your sign-in, your chosen company and your theme in your browser’s storage so the app works. These are strictly necessary, so no cookie banner is needed. Signing out removes your sign-in.</p>
    <h2>How long we keep it</h2>
    <p>We keep your data while your account is open. If you delete your account, your profile, picture, sign-ins and location are deleted. Messages and photos you posted in a company’s jobs stay part of that company’s job records, shown as from a “Former member”, unless the company deletes them. Deleting a company deletes all its jobs, photos and chats.</p>
    <h2>Your rights</h2>
    <ul><li><b>See your data:</b> use “Download my data” on your profile page.</li>
    <li><b>Correct it:</b> edit your profile at any time.</li>
    <li><b>Delete it:</b> use “Delete my account” on your profile page.</li>
    <li>You can also object to how we use your data or ask us to limit it by contacting us.</li>
    <li>If you’re unhappy, you can complain to the Information Commissioner’s Office: <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener">ico.org.uk</a>.</li></ul>
    <h2>Security</h2>
    <p>Connections are encrypted (https), passwords are hashed, and only members of a company can open its board.</p>
    <h2>Children</h2><p>Crewdesk is a work tool and isn’t meant for anyone under 16.</p>
    <h2>Contact</h2><p>${op}.</p>
  </article>`;
}
VIEWS.privacy = { manual: true, render() { return `<a class="back" href="#/more">${ic('back')}Back</a>${legalHtml('privacy')}`; } };
VIEWS.terms = { manual: true, render() { return `<a class="back" href="#/more">${ic('back')}Back</a>${legalHtml('terms')}`; } };
function renderLegalStandalone(kind) {
  stopAll(); standalone = true;
  $('#app').innerHTML = `<div class="legal-wrap"><main class="stack" style="max-width:720px;width:100%" id="view" tabindex="-1">
    <div class="row">${brand()}<b class="wordmark">Crewdesk</b></div>
    <a class="back" href="#/">${ic('back')}Back</a>${legalHtml(kind)}${footLinks()}</main></div>`;
  window.scrollTo(0, 0);
}
function switcherSheet() {
  sheet(`${sheetHead('Your companies')}
    <div class="card flush"><div class="list">${S.companies.map((c) => `<button class="item" data-act="switch-co" data-id="${c.id}" data-close>
      <span class="chan-ico ${c.id === S.cid ? 'gen' : ''}" style="width:36px;height:36px">${ic('building')}</span><div class="grow"><b>${esc(c.name)}</b><div class="tiny muted">${ROLE[c.role]}</div></div>${c.id === S.cid ? ic('check').replace('<svg', '<svg width="18" height="18" style="color:var(--accent)"') : ''}</button>`).join('')}</div></div>
    <div class="section stack">${companyForms()}</div>`);
}

// ============================================================ event wiring
const A = {
  'auth-mode': (el) => renderAuth(el.dataset.mode),
  logout: async () => { try { await api('POST', '/api/logout'); } catch {} signOutLocal(); },
  switcher: () => switcherSheet(),
  'switch-co': (el) => { if (el.dataset.id === S.cid) return; S.cid = el.dataset.id; S.msgs = {}; if (map) { map.remove(); map = null; } stopAll(); location.hash = '#/home'; loadCompany(); },
  'new-job': (el) => { jobSheet(null); if (el.dataset.client) { const s = $('#sheet-root select[name=clientId]'); if (s) s.value = el.dataset.client; } },
  'edit-job': (el) => jobSheet(S.jobs[el.dataset.id]),
  'del-job': async (el) => { const j = S.jobs[el.dataset.id]; if (await confirmBox('Delete job?', `“${j.title}”, its tasks and its chat will be deleted for everyone.`)) { if (await deleteItem('jobs', j.id)) location.hash = '#/jobs'; } },
  'job-status': (el) => saveItem('jobs', el.dataset.id, { status: el.dataset.s }),
  'job-filter': (el) => { S.jobFilter = el.dataset.f; if (location.hash !== '#/jobs') location.hash = '#/jobs'; else renderView(false); },
  'job-assign': (el) => { const j = S.jobs[el.dataset.id]; const a = new Set(j.assignees || []); a.has(el.dataset.uid) ? a.delete(el.dataset.uid) : a.add(el.dataset.uid); saveItem('jobs', j.id, { assignees: [...a] }); },
  'job-here': (el) => {
    if (!window.isSecureContext || !navigator.geolocation) return toast('Location needs a secure https:// link', true);
    toast('Getting your location…');
    navigator.geolocation.getCurrentPosition((p) => saveItem('jobs', el.dataset.id, { lat: p.coords.latitude, lng: p.coords.longitude }).then(() => toast('Job site pinned')),
      () => toast('Could not get your location', true), { enableHighAccuracy: true, timeout: 20000 });
  },
  'quick-client': (el) => {
    const sel = el.closest('form').querySelector('select[name=clientId]');
    clientSheet(null, (c) => { sel.insertAdjacentHTML('beforeend', `<option value="${c.id}">${esc(c.name)}</option>`); sel.value = c.id; });
  },
  'task-open': (el) => { S.openTask = S.openTask === el.dataset.id ? null : el.dataset.id; renderView(false); },
  'task-toggle': (el) => { const t = S.tasks[el.dataset.id]; el.classList.toggle('on'); saveItem('tasks', t.id, { done: !t.done }); },
  'task-assign': (el) => { const t = S.tasks[el.dataset.id]; const a = new Set(t.assignees || []); a.has(el.dataset.uid) ? a.delete(el.dataset.uid) : a.add(el.dataset.uid); saveItem('tasks', t.id, { assignees: [...a] }); },
  'task-rename': (el) => { const t = S.tasks[el.dataset.id]; sheet(`${sheetHead('Rename task')}<form class="stack" data-form="task-rename" data-id="${t.id}"><input class="input" name="title" value="${esc(t.title)}" required><div class="sheet-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div></form>`); },
  'task-del': async (el) => { const t = S.tasks[el.dataset.id]; if (await confirmBox('Delete task?', `“${t.title}” and its checklist will be removed.`)) deleteItem('tasks', t.id); },
  'cl-toggle': (el) => { const t = S.tasks[el.dataset.id]; saveItem('tasks', t.id, { checklist: t.checklist.map((x) => x.id === el.dataset.item ? Object.assign({}, x, { done: !x.done }) : x) }); },
  'cl-del': (el) => { const t = S.tasks[el.dataset.id]; saveItem('tasks', t.id, { checklist: t.checklist.filter((x) => x.id !== el.dataset.item) }); },
  'cost-del': (el) => { const j = S.jobs[el.dataset.id]; saveItem('jobs', j.id, { costs: j.costs.filter((c) => c.id !== el.dataset.cost) }); },
  attach: async (el) => {
    const ch = el.dataset.ch;
    const files = await choosePhotos({ multiple: true, title: 'Send photos' });
    addChatPhotos(ch, files);
  },
  'photos-add': async (el) => { const jobId = el.dataset.job; const files = await choosePhotos({ multiple: true, title: 'Add job photos' }); queueJobPhotos(jobId, files); },
  'photo-open': (el) => { const p = S.photos[el.dataset.id]; if (!p) return; const items = viewerItemsForJob(p.jobId); openViewer(items, items.findIndex((x) => x.id === p.id)); },
  'upload-retry': (el) => {
    for (const list of Object.values(S.uploads)) { const u = list.find((x) => x.key === el.dataset.upload); if (u && u.failed) { u.failed = ''; u.progress = 0; uploadQueue.push(u); paintUpload(u); pumpUploads(); } }
  },
  'chat-photo': (el) => {
    const m = (S.msgs[el.dataset.ch] || []).find((x) => x.id === el.dataset.msg); if (!m) return;
    const where = el.dataset.ch === 'general' ? 'Company chat' : ((S.jobs[el.dataset.ch.slice(4)] || {}).title || 'Job chat');
    openViewer(msgImages(m).map((u, k) => ({ url: u, by: m.userId, at: m.at, caption: k === 0 ? m.text : '', where, alt: `Photo from ${member(m.userId).name}` })), Number(el.dataset.i) || 0);
  },
  'export-data': async () => {
    try {
      const r = await fetch('/api/me/export', { headers: { Authorization: 'Bearer ' + S.token } });
      if (!r.ok) throw new Error('Could not prepare your data');
      const blob = await r.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'crewdesk-my-data.json'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000); toast('Your data is downloading');
    } catch (e) { toast(e.message, true); }
  },
  'delete-account': () => sheet(`${sheetHead('Delete your account?')}
    <form class="stack" data-form="delete-account">
      <p class="small" style="margin:0">This permanently deletes your profile, picture, sign-ins and location. Messages and photos you posted stay in your companies’ job records as from a “Former member”. If you’re the only person in a company, that company is deleted too.</p>
      <label class="field"><span>Type your password to confirm</span><input name="password" type="password" autocomplete="current-password" required></label>
      <div class="err-msg" data-err role="alert"></div>
      <div class="sheet-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn danger">Delete my account</button></div>
    </form>`),
  unattach: (el) => { const ch = el.dataset.ch; S.pendingImgs[ch] = (S.pendingImgs[ch] || []).filter((p) => p.key !== el.dataset.key); paintAttach(ch); },
  older: async (el) => {
    const ch = el.dataset.ch; const first = (S.msgs[ch] || [])[0]; if (!first) return;
    el.disabled = true;
    try {
      const r = await capi('GET', `/messages?channel=${encodeURIComponent(ch)}&before=${first.at}`);
      S.msgs[ch] = r.items.concat(S.msgs[ch]); S.msgsMore[ch] = r.more;
      const pane = el.closest('.chat-pane'); const box = $('[data-msgs]', pane); const h = box.scrollHeight;
      renderMsgs(pane, ch); box.scrollTop = box.scrollHeight - h;
    } catch (e) { toast(e.message, true); el.disabled = false; }
  },
  member: (el) => memberSheet(el.dataset.id),
  'map-focus': (el) => { const l = S.locations[el.dataset.id]; if (!l) return; if (parseHash().name !== 'team') location.hash = '#/team'; setTimeout(() => { if (map) map.setView([l.lat, l.lng], 16); }, 400); },
  'set-role': async (el) => { try { await capi('PATCH', `/members/${el.dataset.id}`, { role: el.dataset.role }); toast('Role updated'); } catch (e) { toast(e.message, true); } },
  'make-owner': async (el) => { if (!(await confirmBox('Hand over ownership?', `${member(el.dataset.id).name} will become the owner. You’ll become an admin.`, 'Make owner', false))) return; try { await capi('PATCH', `/members/${el.dataset.id}`, { role: 'owner' }); toast('Ownership transferred'); } catch (e) { toast(e.message, true); } },
  'remove-member': async (el) => { const m = member(el.dataset.id); if (!(await confirmBox('Remove from company?', `${m.name} will lose access to all jobs and chats.`, 'Remove'))) return; try { await capi('DELETE', `/members/${m.id}`); delete S.members[m.id]; scheduleRender(); toast(`${m.name} removed`); } catch (e) { toast(e.message, true); } },
  'team-join': async (el) => { try { const r = await capi('POST', `/teams/${el.dataset.id}/join`); S.teams[r.item.id] = r.item; scheduleRender(); } catch (e) { toast(e.message, true); } },
  'team-leave': async (el) => { try { const r = await capi('POST', `/teams/${el.dataset.id}/leave`); S.teams[r.item.id] = r.item; scheduleRender(); } catch (e) { toast(e.message, true); } },
  'team-edit': (el) => teamSheet(el.dataset.id),
  'team-del': async (el) => { const t = S.teams[el.dataset.id]; $('#sheet-root').innerHTML = ''; if (await confirmBox('Delete team?', `“${t.name}” will be removed. Jobs stay, just without a team.`)) deleteItem('teams', t.id); },
  'client-edit': (el) => clientSheet(el.dataset.id),
  'client-del': async (el) => { const c = S.clients[el.dataset.id]; if (await confirmBox('Delete client?', `${c.name} will be removed. Their jobs stay.`)) { if (await deleteItem('clients', c.id)) location.hash = '#/clients'; } },
  'news-edit': (el) => newsSheet(el.dataset.id),
  'news-pin': (el) => saveItem('announcements', el.dataset.id, { pinned: !S.announcements[el.dataset.id].pinned }),
  'news-del': async (el) => { if (await confirmBox('Delete announcement?', 'It will be removed for everyone.')) deleteItem('announcements', el.dataset.id); },
  'copy-invite': async () => {
    const text = `Join ${S.company.name} on Crewdesk:\n1. Open ${location.origin}\n2. Create an account\n3. Tap “Join a company” and enter code ${S.company.code}\n(Ask me for the join password.)`;
    try { await navigator.clipboard.writeText(text); toast('Invite copied — paste it into a text or WhatsApp'); }
    catch { sheet(`${sheetHead('Invite message')}<textarea class="input" rows="6" readonly>${esc(text)}</textarea>`); }
  },
  'new-code': async () => { if (!(await confirmBox('Make a new code?', 'The old code will stop working for new joiners.', 'New code', false))) return; try { const r = await capi('PATCH', '', { newCode: true }); S.company = r.company; renderView(false); } catch (e) { toast(e.message, true); } },
  'del-company': async () => { if (!(await confirmBox('Delete the whole company?', 'Every job, task, client, announcement and chat will be permanently deleted for everyone. This cannot be undone.', 'Delete everything'))) return; try { const r = await capi('DELETE', ''); S.companies = r.companies; S.cid = null; stopAll(); boot(); } catch (e) { toast(e.message, true); } },
  'leave-company': async () => { if (!(await confirmBox(`Leave ${S.company.name}?`, 'You’ll need the code and password to rejoin.', 'Leave'))) return; try { const r = await capi('POST', '/leave'); S.companies = r.companies; S.cid = null; stopAll(); boot(); } catch (e) { toast(e.message, true); } },
  avatar: async () => {
    const [file] = await choosePhotos({ multiple: false, title: 'Profile picture', selfie: true });
    try { const p = await processPhoto(file, { max: 400, thumb: 0, square: true }); const r = await api('PUT', '/api/me', { avatar: p.data }); updateMe(r.user); toast('Picture updated'); }
    catch (e) { toast(e.message, true); }
  },
  'avatar-remove': async () => { try { const r = await api('PUT', '/api/me', { avatar: '' }); updateMe(r.user); } catch (e) { toast(e.message, true); } },
  'enable-notif': async () => { try { await Notification.requestPermission(); } catch {} renderView(false); },
  pick: (el) => el.classList.toggle('on'),
};
function updateMe(u) { S.user = u; S.members[u.id] = Object.assign(S.members[u.id] || {}, u); updateChrome(); renderView(false); }

const C = {
  'task-due': (el) => saveItem('tasks', el.dataset.id, { deadline: el.value }),
  'task-notes': (el) => saveItem('tasks', el.dataset.id, { notes: el.value }),
  'job-price': (el) => saveItem('jobs', el.dataset.id, { price: el.value }),
  'cost-field': (el) => { const j = S.jobs[el.dataset.id]; saveItem('jobs', j.id, { costs: j.costs.map((c) => c.id === el.dataset.cost ? Object.assign({}, c, { [el.dataset.k]: el.value }) : c) }); },
  'share-loc': (el) => enableSharing(el.checked, el),
  'co-setting': async (el) => { try { const r = await capi('PATCH', '', { settings: { [el.dataset.k]: el.checked } }); S.company = r.company; toast('Saved'); } catch (e) { toast(e.message, true); el.checked = !el.checked; } },
  theme: (el) => { store.set('cd_theme', el.value === 'auto' ? null : el.value); applyTheme(); },
};
const I = {
  'job-search': (el) => { S.jobSearch = el.value; const l = $('#joblist'); if (l) l.innerHTML = VIEWS.jobs.list(); },
  'client-search': (el) => { S.clientSearch = el.value; const l = $('#clientlist'); if (l) l.innerHTML = VIEWS.clients.list(); },
  autosize: (el) => { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 140) + 'px'; },
};
const F = {
  async login(f, d) {
    const r = await api('POST', '/api/login', d);
    S.token = r.token; store.set('cd_token', r.token); boot();
  },
  async register(f, d) {
    const r = await api('POST', '/api/register', Object.assign({}, d, { agree: !!d.agree }));
    S.token = r.token; store.set('cd_token', r.token); boot();
  },
  async 'create-co'(f, d) {
    const r = await api('POST', '/api/companies', d);
    S.companies = r.companies; S.cid = r.company.id; $('#sheet-root').innerHTML = ''; stopAll(); if (map) { map.remove(); map = null; }
    location.hash = '#/settings'; await loadCompany(); toast(`${r.company.name} is ready — invite your crew`);
  },
  async 'join-co'(f, d) {
    const r = await api('POST', '/api/companies/join', d);
    S.companies = r.companies; S.cid = r.company.id; $('#sheet-root').innerHTML = ''; stopAll(); if (map) { map.remove(); map = null; }
    location.hash = '#/home'; await loadCompany(); toast(`You’re in ${r.company.name}`);
  },
  async job(f, d, close) {
    const body = { title: d.title, clientId: d.clientId, status: d.status, priority: d.priority, start: d.start, deadline: d.deadline,
      address: d.address, teamId: d.teamId, description: d.description, assignees: picked(f) };
    if ('price' in d) body.price = d.price;
    const item = await saveItem('jobs', f.dataset.id || null, body);
    close();
    if (!f.dataset.id) location.hash = '#/job/' + item.id;
  },
  async 'task-add'(f, d) {
    const j = S.jobs[f.dataset.job];
    const item = await saveItem('tasks', null, { jobId: j.id, title: d.title, assignees: [] });
    S.openTask = item.id; f.reset(); renderView(false);
    const inp = $('form[data-form="task-add"] input'); if (inp && matchMedia('(hover:hover)').matches) inp.focus();
  },
  async 'cl-add'(f, d) {
    const t = S.tasks[f.dataset.id];
    await saveItem('tasks', t.id, { checklist: (t.checklist || []).concat({ id: Math.random().toString(36).slice(2, 10), text: d.text, done: false }) });
    renderView(false);
    const inp = $(`form[data-form="cl-add"][data-id="${t.id}"] input`); if (inp) inp.focus();
  },
  async 'task-rename'(f, d, close) { await saveItem('tasks', f.dataset.id, { title: d.title }); close(); },
  async 'cost-add'(f, d) {
    const j = S.jobs[f.dataset.id];
    await saveItem('jobs', j.id, { costs: (j.costs || []).concat({ id: Math.random().toString(36).slice(2, 10), label: d.label, amount: d.amount }) });
    renderView(false); const inp = $('form[data-form="cost-add"] input'); if (inp) inp.focus();
  },
  async send(f, d) {
    const ch = f.dataset.ch; const text = (d.text || '').trim(); const imgs = S.pendingImgs[ch] || [];
    if (!text && !imgs.length) return;
    const ta = f.querySelector('textarea'); const btn = f.querySelector('button:not([type=button])');
    btn.disabled = true;
    try {
      const r = imgs.length
        ? await sendWithProgress('POST', `/api/c/${S.cid}/messages`, { channel: ch, text, images: imgs.map((p) => p.data) }, (x) => { btn.style.opacity = String(0.4 + x * 0.6); })
        : await capi('POST', '/messages', { channel: ch, text });
      ta.value = ''; ta.style.height = ''; delete S.pendingImgs[ch]; paintAttach(ch);
      onMessage(r.item);
      const box = $('[data-msgs]', f.closest('.chat-pane')); box.scrollTop = box.scrollHeight;
    } finally { btn.disabled = false; btn.style.opacity = ''; if (matchMedia('(hover:hover)').matches) ta.focus(); }
  },
  async 'delete-account'(f, d, close) {
    await api('DELETE', '/api/me', { password: d.password });
    close(); signOutLocal(); toast('Your account has been deleted');
  },
  async team(f, d, close) {
    const body = { name: d.name, color: d.color, members: picked(f) };
    await saveItem('teams', f.dataset.id || null, body); close();
  },
  async client(f, d, close) {
    const item = await saveItem('clients', f.dataset.id || null, d);
    close(); if (f._onSaved) f._onSaved(item); else if (!f.dataset.id) location.hash = '#/client/' + item.id;
  },
  async news(f, d, close) { await saveItem('announcements', f.dataset.id || null, { title: d.title, body: d.body, pinned: !!d.pinned }); close(); },
  async profile(f, d) { const r = await api('PUT', '/api/me', d); updateMe(r.user); toast('Profile saved'); },
  async password(f, d) { await api('PUT', '/api/me', d); f.reset(); toast('Password updated'); },
  async 'co-name'(f, d) { const r = await capi('PATCH', '', { name: d.name, settings: { currency: d.currency } }); S.company = r.company; updateChrome(); toast('Saved'); },
  async 'co-pass'(f, d) { await capi('PATCH', '', { password: d.password }); f.reset(); toast('Join password changed'); },
};

document.addEventListener('click', (e) => {
  if (e.target.closest('.skip-link')) { e.preventDefault(); const v = $('#view'); if (v) v.focus(); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = A[el.dataset.act]; if (!fn) return;
  if (el.tagName === 'A' && !el.dataset.close && el.dataset.act !== 'member') e.preventDefault();
  if (el.dataset.act === 'member') e.preventDefault();
  fn(el, e);
});
document.addEventListener('change', (e) => { const el = e.target.closest('[data-change]'); if (el && C[el.dataset.change]) C[el.dataset.change](el, e); });
document.addEventListener('input', (e) => { const el = e.target.closest('[data-input]'); if (el && I[el.dataset.input]) I[el.dataset.input](el, e); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && e.target.matches('.composer textarea') && !e.isComposing) {
    if (matchMedia('(hover:hover)').matches) { e.preventDefault(); e.target.form.requestSubmit(); }
  }
});
document.addEventListener('submit', async (e) => {
  const f = e.target; const fn = F[f.dataset.form]; if (!fn) return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(f));
  const errBox = f.querySelector('[data-err]') || (f.dataset.form === 'login' || f.dataset.form === 'register' ? $('#auth-err') : null);
  if (errBox) errBox.textContent = '';
  const btn = f.querySelector('button:not([type=button])'); if (btn && f.dataset.form !== 'send') btn.disabled = true;
  const backdrop = f.closest('.sheet-backdrop');
  const close = () => { if (backdrop) backdrop.remove(); };
  try { await fn(f, d, close); }
  catch (err) { if (errBox) errBox.textContent = err.message; else if (f.dataset.form !== 'send') toast(err.message, true); else toast(err.message, true); }
  finally { if (btn && btn.isConnected && f.dataset.form !== 'send') btn.disabled = false; }
});

function signOutLocal() {
  stopAll(); S.token = null; S.company = null; S.cid = null; store.set('cd_token', null);
  if (map) { map.remove(); map = null; }
  $('#sheet-root').innerHTML = ''; history.replaceState(null, '', '/'); renderAuth();
}
function applyTheme() { const t = store.get('cd_theme'); if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
setInterval(() => { if (S.company && ['home', 'team', 'chat'].includes(parseHash().name)) scheduleRender(); }, 60000);

applyTheme();
boot();
})();

// ---- drag photos onto a job's photo area or a chat (computers), paste photos into chat
document.addEventListener('dragover', (e) => {
  if (!S.company || !e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
  if (e.target.closest('[data-drop], .chat-pane') || parseHash().name === 'job') { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
});
document.addEventListener('drop', (e) => {
  if (!S.company || !e.dataTransfer || !e.dataTransfer.files.length) return;
  const files = [...e.dataTransfer.files].filter(isImageFile);
  const pane = e.target.closest('.chat-pane');
  if (pane) { e.preventDefault(); if (files.length) addChatPhotos(pane.dataset.ch, files); return; }
  const r = parseHash();
  const zone = e.target.closest('[data-drop]');
  const jobId = zone ? zone.dataset.drop : r.name === 'job' ? r.args[0] : null;
  if (jobId && S.jobs[jobId]) { e.preventDefault(); if (files.length) queueJobPhotos(jobId, files); else toast('Only photos can be added here', true); }
});
document.addEventListener('paste', (e) => {
  const ta = e.target.closest && e.target.closest('.composer textarea'); if (!ta || !e.clipboardData) return;
  const files = [...e.clipboardData.files].filter(isImageFile);
  if (files.length) { e.preventDefault(); addChatPhotos(ta.form.dataset.ch, files); }
});
