/* Crewdesk web app — shared helpers, state and server calls. Plain JavaScript, no build step.
   The app is split into several files that share these top-level names. */
'use strict';

// ============================================================ utilities
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
  jobs: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z"/>',
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
  ping: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/>',
  contacts: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M7.5 17a4.5 4.5 0 0 1 9 0"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  userplus: '<circle cx="10" cy="8" r="4"/><path d="M2 21a8 8 0 0 1 14.5-4.7M19 14v6M16 17h6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
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
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.5" r="3.5"/>',
  gallery: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.5-4.5L6 21"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  clip: '<path d="m21 11-8.6 8.6a5 5 0 0 1-7-7L14 4a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4L15.5 7"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9Z"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>',
  sheet: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4L12 18.4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6 6 0 0 1 3.5 5.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  phoneapp: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  restore: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
};
const ic = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;
const icSize = (n, px, style = '') => ic(n).replace('<svg', `<svg width="${px}" height="${px}"${style ? ` style="${style}"` : ''}`);
// Just the map marker with a tick (no tile behind it). Colours come from CSS so it flips in dark mode.
const LOGO = `<svg viewBox="128 96 256 320" aria-hidden="true"><path class="lm-pin" d="M256 404C214 348 140 290 140 220a116 116 0 0 1 232 0c0 70-74 128-116 184Z"/><path class="lm-tick" d="M203 222l37 37 70-72" fill="none" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const brand = () => `<span class="brandmark">${LOGO}</span>`;

const STATUS = { planned: 'Planned', active: 'In progress', hold: 'On hold', done: 'Done' };
const STATUS_COLOR = { planned: 'var(--blue)', active: 'var(--ok)', hold: 'var(--amber)', done: 'var(--slate)' };
const PRIORITY = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };
const ROLE = { owner: 'Owner', admin: 'Admin', member: 'Member' };
const PALETTE = ['#18693f', '#1f57a4', '#7b3fa8', '#b0284f', '#0b7285', '#a35200', '#2f8a3a', '#4c5fc0', '#57564f', '#6b7f00'];

function colorFor(id) { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; }
function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'; }
function member(id) { return S.members[id] || { id, name: 'Former member', avatar: '', former: true }; }
const firstName = (id) => member(id).name.split(' ')[0];
// Avatars and names open the person's profile wherever they appear (link: false inside pickers).
function avatar(m, size = '', opts = {}) {
  if (!m) return '';
  const link = opts.link !== false && !m.former && m.id;
  return `<span class="avatar ${size}" style="--c:${colorFor(m.id)}" ${link ? `data-person="${esc(m.id)}" title="${esc(m.name)}"` : ''} role="img" aria-label="${esc(m.name)}">${m.avatar ? `<img src="${esc(m.avatar)}" alt="" loading="lazy" decoding="async">` : esc(initials(m.name))}${opts.dot ? `<i class="on-dot ${m.online ? 'on' : ''}"></i>` : ''}</span>`;
}
function personName(id, short = false) {
  const m = member(id);
  const n = short ? m.name.split(' ')[0] : m.name;
  return m.former ? `<span>${esc(n)}</span>` : `<span class="person-link" data-person="${esc(id)}" role="link" tabindex="0">${esc(n)}</span>`;
}
function avatarStack(ids, max = 4, size = 'xs') {
  if (!ids || !ids.length) return '';
  const shown = ids.slice(0, max).map((id) => avatar(member(id), size)).join('');
  const extra = ids.length > max ? `<span class="avatar ${size} more">+${ids.length - max}</span>` : '';
  return `<span class="stackav">${extra}${shown}</span>`;
}
const pad = (n) => String(n).padStart(2, '0');
const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => dstr(new Date());
const parseD = (s) => new Date(s + 'T00:00:00');
function days(s) { return Math.round((parseD(s) - parseD(todayStr())) / 864e5); }
function fmtDate(s, weekday = false) {
  if (!s) return '';
  const d = parseD(s);
  return d.toLocaleDateString('en-GB', Object.assign({ day: 'numeric', month: 'short' }, weekday ? { weekday: 'short' } : {}, d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}));
}
function fmtDateTime(ts) {
  const d = new Date(ts); const same = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString('en-GB', Object.assign({ weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }, same ? {} : { year: 'numeric' }));
}
function dueHtml(s, done = false) {
  if (!s) return '';
  const n = days(s);
  let cls = '', label;
  if (done) label = fmtDate(s);
  else if (n < 0) { cls = 'late'; label = n === -1 ? 'Overdue 1 day' : `Overdue ${-n} days`; }
  else if (n === 0) { cls = 'soon'; label = 'Due today'; }
  else if (n === 1) { cls = 'soon'; label = 'Due tomorrow'; }
  else if (n <= 7) { cls = 'soon'; label = 'Due ' + fmtDate(s, true); }
  else label = 'Due ' + fmtDate(s);
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
const clock = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
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
const fileSize = (b) => (b < 1024 ? b + ' B' : b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
function linkify(t) { return esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'); }
const plural = (n, w, ws = w + 's') => `${n} ${n === 1 ? w : ws}`;

// ============================================================ state & server
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
const S = {
  cid: store.get('cd_cid'), user: null, companies: [], role: null, company: null, info: null,
  members: {}, teams: {}, jobs: {}, tasks: {}, clients: {}, pings: {}, photos: {}, projects: {}, events: {}, finance: {}, chats: {},
  invites: [], favs: { jobs: [], projects: [] }, inbox: [], locations: {}, unread: {}, lastMsg: {}, msgs: {}, msgsMore: {},
  jobFilter: store.get('cd_jobFilter') || 'open', jobSearch: '', projFilter: 'active', projSearch: '', clientSearch: '', openTask: null,
  calView: store.get('cd_calView') || 'month', calDate: todayStr(), pingTab: 'pings',
};
// Registries the view files fill in.
const VIEWS = {}; const A = {}; const C = {}; const I = {}; const F = {};

class ApiError extends Error { constructor(msg, status, data) { super(msg); this.status = status; this.data = data || {}; } }
async function api(method, path, body) {
  let r;
  try {
    r = await fetch(path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Crewdesk': '1' }, body: body ? JSON.stringify(body) : undefined });
  } catch (_) { throw new ApiError('No connection — check your internet and try again', 0); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && S.user && !path.startsWith('/api/login')) { signOutLocal('Your session ended — please sign in again'); throw new ApiError('Please sign in again', 401); }
  if (!r.ok) throw new ApiError(j.error || 'Something went wrong — please try again', r.status, j);
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
// JSON upload with a progress bar (fetch can't report upload progress).
function sendWithProgress(method, path, body, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open(method, path); x.setRequestHeader('Content-Type', 'application/json'); x.setRequestHeader('X-Crewdesk', '1');
    x.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch (_) {} x.status < 300 ? resolve(j) : reject(new ApiError(j.error || 'Upload failed', x.status, j)); };
    x.onerror = () => reject(new ApiError('No connection — not uploaded', 0));
    x.send(JSON.stringify(body));
  });
}

// ============================================================ permissions (the server checks these too)
const isAdmin = () => S.role === 'owner' || S.role === 'admin';
const setting = (k) => !!(S.company && S.company.settings && S.company.settings[k]);
const canCreateJobs = () => isAdmin() || (S.company.settings.membersCreateJobs !== false);
const canCreateProjects = () => isAdmin() || (S.company.settings.membersCreateProjects !== false);
const canPing = () => isAdmin() || (S.company.settings.membersPing !== false);
const canInvite = () => isAdmin() || setting('membersInvite');
const canManageAccess = (item) => isAdmin() || item.createdBy === S.user.id;
const isFav = (kind, id) => (S.favs[kind] || []).includes(id);

// ============================================================ toasts, dialogs, menus
function toast(text, isErr = false, link = '', action = null) {
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.setAttribute('role', isErr ? 'alert' : 'status');
  el.innerHTML = `<span class="grow">${esc(text)}</span>${action ? `<button class="act" type="button">${esc(action.label)}</button>` : link ? ic('right') : ''}`;
  el.onclick = (e) => {
    if (action && e.target.closest('.act')) { action.fn(); leave(el); return; }
    if (link) location.hash = link;
    leave(el);
  };
  const box = $('#toasts'); box.appendChild(el);
  const live = [...box.children].filter((c) => !c.classList.contains('leaving'));
  live.slice(0, Math.max(0, live.length - 3)).forEach((c) => leave(c));
  setTimeout(() => leave(el), isErr ? 6000 : action ? 7000 : 4200);
}
function leave(el, done) {
  if (!el || !el.isConnected || el.classList.contains('leaving')) return;
  el.classList.add('leaving'); el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true');
  let finished = false;
  const fin = () => { if (finished) return; finished = true; el.remove(); if (done) done(); };
  el.addEventListener('animationend', (e) => { if (e.target === el) fin(); });
  setTimeout(fin, 300);
}
function sheet(html, onMount, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-backdrop';
  const back = document.activeElement;
  wrap.innerHTML = `<div class="sheet ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  const close = () => { leave(wrap); document.removeEventListener('keydown', onKey); if (back && back.isConnected) back.focus({ preventScroll: true }); if (opts.onClose) opts.onClose(); };
  const onKey = (e) => { if (e.key === 'Escape' && wrap === $('#sheet-root').lastElementChild) close(); };
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  wrap.addEventListener('click', (e) => {
    const c = e.target.closest('[data-close]'); if (!c) return;
    if (!(c.tagName === 'A' && c.getAttribute('href') && c.getAttribute('href') !== '#')) e.preventDefault();
    close();
  });
  document.addEventListener('keydown', onKey);
  $('#sheet-root').appendChild(wrap);
  const sh = wrap.firstElementChild;
  const h = sh.querySelector('h2'); if (h) { h.id = h.id || 'sh-' + Math.random().toString(36).slice(2, 8); sh.setAttribute('aria-labelledby', h.id); }
  if (onMount) onMount(sh, close);
  const first = sh.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]),textarea');
  if (first && matchMedia('(hover:hover)').matches) requestAnimationFrame(() => { if (!sh.contains(document.activeElement)) first.focus({ preventScroll: true }); });
  else requestAnimationFrame(() => { if (!sh.contains(document.activeElement)) sh.setAttribute('tabindex', '-1'), sh.focus({ preventScroll: true }); });
  return close;
}
function closeSheets() { $$('#sheet-root .sheet-backdrop').forEach((w) => leave(w)); }
function sheetHead(title) { return `<div class="sheet-head"><h2>${esc(title)}</h2><button class="btn ghost sm icon" type="button" data-close aria-label="Close">${ic('x')}</button></div>`; }
function confirmBox(title, text, okLabel = 'Delete', danger = true, extraHtml = '') {
  return new Promise((resolve) => {
    let done = false;
    sheet(`${sheetHead(title)}<p class="muted">${esc(text)}</p>${extraHtml}
      <div class="sheet-foot"><button class="btn" type="button" data-close>Cancel</button><button class="btn ${danger ? 'danger solid' : 'primary'}" type="button" id="cf-ok">${esc(okLabel)}</button></div>`,
    (sh, cl) => {
      sh.querySelector('#cf-ok').onclick = () => { done = true; const v = sh.querySelector('[data-confirm-value]'); cl(); resolve(v ? v.value : true); };
    }, { onClose: () => { if (!done) resolve(false); } });
  });
}
// Small dropdown menu next to a button.
let openMenuEl = null;
function popMenu(anchor, html) {
  closeMenu();
  const el = document.createElement('div');
  el.className = 'menu-pop'; el.setAttribute('role', 'menu'); el.innerHTML = html;
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  let left = Math.min(r.left, window.innerWidth - w - 8); if (left < 8) left = 8;
  let top = r.bottom + 6; if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
  el.style.left = left + 'px'; el.style.top = top + 'px';
  openMenuEl = el;
  const first = el.querySelector('a,button'); if (first) first.focus({ preventScroll: true });
  setTimeout(() => document.addEventListener('mousedown', outside), 0);
  function outside(e) { if (!el.contains(e.target)) closeMenu(); }
  el._off = () => document.removeEventListener('mousedown', outside);
  el.addEventListener('click', (e) => { if (e.target.closest('a,button')) setTimeout(closeMenu, 0); });
  return el;
}
function closeMenu() { if (openMenuEl) { openMenuEl._off(); openMenuEl.remove(); openMenuEl = null; } }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openMenuEl) closeMenu(); });

function peoplePicker(selected, name = 'people', opts = {}) {
  let ms = Object.values(S.members).sort((a, b) => a.name.localeCompare(b.name));
  if (opts.exclude) ms = ms.filter((m) => !opts.exclude.includes(m.id));
  return `<div class="people-pick" data-picker="${name}" role="group">${ms.map((m) => `<button type="button" class="person-chip ${selected.includes(m.id) ? 'on' : ''}" data-act="pick" data-id="${m.id}" aria-pressed="${selected.includes(m.id)}">${avatar(m, 'sm', { link: false })}${esc(m.name.split(' ')[0])}${m.id === S.user.id ? ' (you)' : ''}</button>`).join('')}</div>`;
}
const picked = (root, name = 'people') => $$(`[data-picker="${name}"] .person-chip.on`, root).map((b) => b.dataset.id);
A.pick = (el) => { el.classList.toggle('on'); el.setAttribute('aria-pressed', el.classList.contains('on')); };
// "Who can see this" control used by jobs, projects and events.
function visibilityField(vis, ids, label = 'Who can see this') {
  return `<div class="field"><span>${esc(label)}</span>
    <div class="seg" role="radiogroup"><button type="button" class="${vis !== 'selected' ? 'on' : ''}" data-act="vis" data-v="all" role="radio" aria-checked="${vis !== 'selected'}">${icSize('users', 15, 'vertical-align:-3px;margin-right:4px')}Everyone</button>
    <button type="button" class="${vis === 'selected' ? 'on' : ''}" data-act="vis" data-v="selected" role="radio" aria-checked="${vis === 'selected'}">${icSize('lock', 15, 'vertical-align:-3px;margin-right:4px')}Only selected people</button></div>
    <input type="hidden" name="visibility" value="${vis === 'selected' ? 'selected' : 'all'}">
    <div data-vis-people class="${vis === 'selected' ? '' : 'hidden'}" style="margin-top:8px"><div class="hint" style="margin-bottom:6px">Admins can always see everything. People assigned can always see it.</div>${peoplePicker(ids || [], 'viewers')}</div></div>`;
}
A.vis = (el) => {
  const f = el.closest('.field');
  $$('[data-act="vis"]', f).forEach((b) => { b.classList.toggle('on', b === el); b.setAttribute('aria-checked', b === el); });
  f.querySelector('input[name=visibility]').value = el.dataset.v;
  f.querySelector('[data-vis-people]').classList.toggle('hidden', el.dataset.v !== 'selected');
};
const lockPill = (item) => (item.visibility === 'selected' ? `<span class="pill lock" title="Only selected people can see this">${ic('lock')}Private</span>` : '');
function starBtn(kind, id) {
  const on = isFav(kind, id);
  return `<button class="star-btn ${on ? 'on' : ''}" type="button" data-act="fav" data-kind="${kind}" data-id="${id}" aria-pressed="${on}" aria-label="${on ? 'Unstar' : 'Star'}" title="${on ? 'Starred — pinned to the top for you' : 'Star to pin it to the top'}">${ic('star')}</button>`;
}
A.fav = async (el) => {
  const kind = el.dataset.kind, id = el.dataset.id; const on = !isFav(kind, id);
  S.favs[kind] = on ? [id].concat((S.favs[kind] || []).filter((x) => x !== id)) : (S.favs[kind] || []).filter((x) => x !== id);
  scheduleRender();
  try { const r = await capi('POST', '/favs', { kind, id, on }); S.favs = r.favs; }
  catch (e) { toast(e.message, true); }
};
const isTouch = () => matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches;
const wide = () => matchMedia('(min-width:900px)').matches;
