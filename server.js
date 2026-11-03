// Crewdesk — all-in-one job tracker & team comms server
// Runs with zero dependencies on your own computer (`node server.js`, Node 18+).
// When DATABASE_URL is set (e.g. on Render with a Neon Postgres database), data and
// photos are kept in Postgres instead of the local data folder, using the `pg` package.
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = Number(process.env.PORT) || 3000;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 3443;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const DB_FILE = path.join(DATA, 'db.json');
const DATABASE_URL = process.env.DATABASE_URL || '';
// Who runs this copy of Crewdesk. Shown on the Privacy and Terms pages — set these on your host.
const OPERATOR = {
  name: process.env.OPERATOR_NAME || '',
  email: process.env.OPERATOR_EMAIL || '',
  address: process.env.OPERATOR_ADDRESS || '',
};
const LEGAL_VERSION = '2026-11-03';
const LOCATION_MAX_AGE = 12 * 60 * 60 * 1000; // live positions older than 12 hours are dropped

// ---------------------------------------------------------------- storage
// The whole app state lives in memory as one object and is written out (debounced) after
// each change: to data/db.json locally, or to a single Postgres row when DATABASE_URL is set.
let db = { users: {}, sessions: {}, companies: {}, data: {}, locations: {} };
let pool = null;

const fileStore = {
  async init() {
    fs.mkdirSync(UPLOADS, { recursive: true });
    if (fs.existsSync(DB_FILE)) db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
  },
  async write(json) { const tmp = DB_FILE + '.tmp'; fs.writeFileSync(tmp, json); fs.renameSync(tmp, DB_FILE); },
  async putFile(name, type, buf) { fs.writeFileSync(path.join(UPLOADS, name), buf); },
  async delFile(name) { try { fs.unlinkSync(path.join(UPLOADS, path.basename(name))); } catch (_) {} },
  async getFile(name) {
    const f = path.join(UPLOADS, path.basename(name));
    return fs.existsSync(f) ? { type: TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', data: fs.readFileSync(f) } : null;
  },
};
const pgStore = {
  async init() {
    const { Pool } = require('pg');
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL);
    pool = new Pool({ connectionString: DATABASE_URL.replace(/[?&](sslmode|channel_binding)=[^&]*/g, ''), ssl: local ? false : { rejectUnauthorized: true }, max: 4 });
    await pool.query('CREATE TABLE IF NOT EXISTS crewdesk_state (id int PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz DEFAULT now())');
    await pool.query('CREATE TABLE IF NOT EXISTS crewdesk_files (name text PRIMARY KEY, type text NOT NULL, data bytea NOT NULL)');
    const r = await pool.query('SELECT data FROM crewdesk_state WHERE id = 1');
    if (r.rows[0]) db = Object.assign(db, r.rows[0].data);
  },
  async write(json) {
    await pool.query('INSERT INTO crewdesk_state (id, data, updated_at) VALUES (1, $1, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()', [json]);
  },
  async putFile(name, type, buf) { await pool.query('INSERT INTO crewdesk_files (name, type, data) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING', [name, type, buf]); },
  async getFile(name) { const r = await pool.query('SELECT type, data FROM crewdesk_files WHERE name = $1', [name]); return r.rows[0] || null; },
  async delFile(name) { await pool.query('DELETE FROM crewdesk_files WHERE name = $1', [path.basename(name)]); },
};
const storage = DATABASE_URL ? pgStore : fileStore;

let saveTimer = null, writing = Promise.resolve(), dirty = false;
function save() {
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 400);
}
function flush() {
  clearTimeout(saveTimer); saveTimer = null;
  if (!dirty) return writing;
  dirty = false;
  const json = JSON.stringify(db);
  writing = writing.then(() => storage.write(json)).catch((e) => { console.error('Save failed, will retry:', e.message); dirty = true; saveTimer = setTimeout(flush, 3000); });
  return writing;
}
async function shutdown() { try { await flush(); await writing; } finally { process.exit(0); } }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const uid = (n = 10) => crypto.randomBytes(n).toString('base64url').replace(/[-_]/g, '').slice(0, n + 4);
const now = () => Date.now();
function hash(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(String(pw), salt, 64).toString('hex') };
}
function verify(pw, salt, h) {
  const a = Buffer.from(crypto.scryptSync(String(pw), salt, 64).toString('hex'));
  const b = Buffer.from(h);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function companyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from(crypto.randomBytes(6), b => chars[b % chars.length]).join(''); }
  while (Object.values(db.companies).some(x => x.code === c));
  return c;
}
function cdata(cid) {
  if (!db.data[cid]) db.data[cid] = {};
  const d = db.data[cid];
  for (const k of ['teams', 'jobs', 'tasks', 'clients', 'announcements', 'photos']) d[k] = d[k] || {};
  d.messages = d.messages || {};
  return d;
}

// ---------------------------------------------------------------- helpers
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const bad = (m) => { throw new HttpError(400, m); };
const deny = (m = 'You do not have permission to do that') => { throw new HttpError(403, m); };
const str = (v, max = 500) => (v == null ? '' : String(v)).trim().slice(0, max);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const isAdmin = (role) => role === 'owner' || role === 'admin';

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, email: u.email, title: u.title || '', phone: u.phone || '', bio: u.bio || '',
    avatar: u.avatar || '', shareLocation: !!u.shareLocation, lastSeen: u.lastSeen || 0, online: isOnline(u.id) };
}
function memberList(c) {
  return Object.entries(c.members).map(([id, m]) => Object.assign(publicUser(db.users[id]) || { id, name: 'Removed user' }, { role: m.role, joinedAt: m.joinedAt }));
}
function canSeeMoney(c, role) { return isAdmin(role) || !!(c.settings && c.settings.membersSeeMoney); }
function shapeJob(job, c, role) {
  if (canSeeMoney(c, role)) return job;
  const j = Object.assign({}, job); delete j.price; delete j.costs; return j;
}
function publicCompany(c, role) {
  return { id: c.id, name: c.name, code: c.code, ownerId: c.ownerId, createdAt: c.createdAt,
    settings: c.settings, hasJoinPassword: true, canSeeMoney: canSeeMoney(c, role) };
}
function companiesFor(userId) {
  return Object.values(db.companies).filter(c => c.members[userId])
    .map(c => ({ id: c.id, name: c.name, role: c.members[userId].role }));
}

// ---------------------------------------------------------------- realtime (Server-Sent Events)
const streams = new Set();          // { res, userId, cid }
const onlineCount = new Map();      // userId -> open connections
function isOnline(id) { return (onlineCount.get(id) || 0) > 0; }
function send(res, evt) { try { res.write(`data: ${JSON.stringify(evt)}\n\n`); } catch (_) {} }
function broadcast(cid, evt, opts = {}) {
  const c = db.companies[cid];
  for (const s of streams) {
    if (s.cid !== cid) continue;
    if (opts.only && !opts.only.includes(s.userId)) continue;
    const role = c && c.members[s.userId] && c.members[s.userId].role;
    if (!role) continue;
    send(s.res, typeof evt === 'function' ? evt(role, s.userId) : evt);
  }
}
function broadcastUser(userId, evtFn) {
  for (const c of Object.values(db.companies)) if (c.members[userId]) broadcast(c.id, evtFn);
}
function presence(userId) {
  const u = db.users[userId]; if (!u) return;
  broadcastUser(userId, { t: 'presence', userId, online: isOnline(userId), lastSeen: u.lastSeen || 0 });
}
function upsert(cid, coll, item) {
  const c = db.companies[cid];
  broadcast(cid, (role) => ({ t: 'upsert', coll, item: coll === 'jobs' ? shapeJob(item, c, role) : item }));
}
function remove(cid, coll, id) { broadcast(cid, { t: 'remove', coll, id }); }
function notify(cid, userIds, text, link) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length) broadcast(cid, { t: 'notify', text, link }, { only: ids });
}
setInterval(() => { for (const s of streams) { try { s.res.write(': ping\n\n'); } catch (_) {} } }, 25000);

// ---------------------------------------------------------------- uploads
async function saveImage(dataUrl, maxBytes = 4 * 1024 * 1024) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) bad('Image must be a JPEG, PNG or WebP');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > maxBytes) bad('Image is too large');
  const name = uid(16) + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
  await storage.putFile(name, 'image/' + m[1], buf);
  return '/uploads/' + name;
}
function dropFile(url) {
  if (typeof url === 'string' && url.startsWith('/uploads/')) storage.delFile(url.slice(9)).catch((e) => console.error('Could not delete file:', e.message));
}
function dropMessageFiles(list) {
  for (const m of list || []) { dropFile(m.image); for (const u of m.images || []) dropFile(u); }
}

// ---------------------------------------------------------------- messages
function channelOk(cid, ch) {
  if (ch === 'general') return true;
  const m = /^job:(.+)$/.exec(ch || '');
  return !!(m && cdata(cid).jobs[m[1]]);
}
function postMessage(cid, channel, userId, text, images, system = false) {
  const d = cdata(cid);
  const list = d.messages[channel] = d.messages[channel] || [];
  const msg = { id: uid(), channel, userId, text: str(text, 4000), images: images || [], at: now(), system };
  list.push(msg);
  if (list.length > 3000) list.splice(0, list.length - 3000);
  save();
  broadcast(cid, { t: 'msg', item: msg });
  return msg;
}
function msgImages(m) { return m.images && m.images.length ? m.images : m.image ? [m.image] : []; }
function msgPreview(m) {
  const n = msgImages(m).length;
  return m.text || (n > 1 ? `📷 ${n} photos` : n ? '📷 Photo' : '');
}
// a batch of job photos from one person becomes one tidy line in the job chat
const photoNotes = new Map();
function notePhotoAdded(cid, jobId, user) {
  const key = cid + '|' + jobId + '|' + user.id;
  const e = photoNotes.get(key) || { n: 0, t: null };
  e.n++; clearTimeout(e.t);
  e.t = setTimeout(() => {
    photoNotes.delete(key);
    if (cdata(cid).jobs[jobId]) postMessage(cid, 'job:' + jobId, user.id, `${user.name.split(' ')[0]} added ${e.n === 1 ? 'a photo' : e.n + ' photos'}`, [], true);
  }, 5000);
  photoNotes.set(key, e);
}
function unreadFor(cid, user) {
  const d = cdata(cid); const out = {}; const last = {};
  const reads = (user.reads && user.reads[cid]) || {};
  for (const [ch, list] of Object.entries(d.messages)) {
    if (!list.length) continue;
    const since = reads[ch] || 0;
    let n = 0; for (let i = list.length - 1; i >= 0 && list[i].at > since; i--) if (list[i].userId !== user.id && !list[i].system) n++;
    out[ch] = n;
    const l = list[list.length - 1];
    last[ch] = { at: l.at, text: msgPreview(l), userId: l.userId, system: l.system };
  }
  return { unread: out, lastMsg: last };
}

// ---------------------------------------------------------------- collection rules
const STATUSES = ['planned', 'active', 'hold', 'done'];
const STATUS_LABEL = { planned: 'Planned', active: 'In progress', hold: 'On hold', done: 'Done' };
function memberIds(c, arr) { return Array.isArray(arr) ? [...new Set(arr.map(String))].filter(id => c.members[id]).slice(0, 50) : []; }
function list(arr, fn, max = 200) { return Array.isArray(arr) ? arr.slice(0, max).map(fn) : []; }

const RULES = {
  jobs: {
    create: (c, role) => isAdmin(role) || c.settings.membersCreateJobs !== false,
    edit: () => true,
    del: (c, role, item, me) => isAdmin(role) || item.createdBy === me,
    clean(input, c, role, existing) {
      const o = {};
      if ('title' in input) o.title = str(input.title, 120) || bad('Give the job a title');
      if ('description' in input) o.description = str(input.description, 5000);
      if ('status' in input) o.status = STATUSES.includes(input.status) ? input.status : 'planned';
      if ('priority' in input) o.priority = ['low', 'normal', 'high', 'urgent'].includes(input.priority) ? input.priority : 'normal';
      if ('clientId' in input) o.clientId = cdata(c.id).clients[input.clientId] ? input.clientId : '';
      if ('teamId' in input) o.teamId = cdata(c.id).teams[input.teamId] ? input.teamId : '';
      if ('address' in input) o.address = str(input.address, 300);
      if ('lat' in input) o.lat = input.lat === null || input.lat === '' ? null : num(input.lat * 1e4) / 1e4 || null;
      if ('lng' in input) o.lng = input.lng === null || input.lng === '' ? null : num(input.lng * 1e4) / 1e4 || null;
      if ('start' in input) o.start = date(input.start);
      if ('deadline' in input) o.deadline = date(input.deadline);
      if ('assignees' in input) o.assignees = memberIds(c, input.assignees);
      if (canSeeMoney(c, role)) {
        if ('price' in input) o.price = num(input.price);
        if ('costs' in input) o.costs = list(input.costs, x => ({ id: str(x.id, 30) || uid(), label: str(x.label, 120), amount: num(x.amount) }));
      }
      return o;
    },
    defaults: (c) => ({ title: '', description: '', status: 'planned', priority: 'normal', clientId: '', teamId: '', address: '',
      lat: null, lng: null, start: '', deadline: '', assignees: [], price: 0, costs: [], ref: 'J-' + String((c.jobSeq = (c.jobSeq || 0) + 1)).padStart(4, '0') }),
  },
  tasks: {
    create: () => true, edit: () => true,
    del: (c, role, item, me) => isAdmin(role) || item.createdBy === me,
    clean(input, c) {
      const o = {};
      if ('jobId' in input) o.jobId = cdata(c.id).jobs[input.jobId] ? input.jobId : bad('That job no longer exists');
      if ('title' in input) o.title = str(input.title, 200) || bad('Give the task a title');
      if ('notes' in input) o.notes = str(input.notes, 3000);
      if ('assignees' in input) o.assignees = memberIds(c, input.assignees);
      if ('deadline' in input) o.deadline = date(input.deadline);
      if ('done' in input) o.done = !!input.done;
      if ('order' in input) o.order = num(input.order);
      if ('checklist' in input) o.checklist = list(input.checklist, x => ({ id: str(x.id, 30) || uid(), text: str(x.text, 200), done: !!x.done }));
      return o;
    },
    defaults: () => ({ jobId: '', title: '', notes: '', assignees: [], deadline: '', done: false, order: now(), checklist: [] }),
  },
  clients: {
    create: () => true, edit: () => true, del: (c, role) => isAdmin(role),
    clean(input) {
      const o = {};
      if ('name' in input) o.name = str(input.name, 120) || bad('Give the client a name');
      for (const k of ['company', 'phone', 'email', 'address']) if (k in input) o[k] = str(input[k], 200);
      if ('notes' in input) o.notes = str(input.notes, 3000);
      return o;
    },
    defaults: () => ({ name: '', company: '', phone: '', email: '', address: '', notes: '' }),
  },
  announcements: {
    create: (c, role) => isAdmin(role), edit: (c, role) => isAdmin(role), del: (c, role) => isAdmin(role),
    clean(input) {
      const o = {};
      if ('title' in input) o.title = str(input.title, 150) || bad('Add a headline');
      if ('body' in input) o.body = str(input.body, 5000);
      if ('pinned' in input) o.pinned = !!input.pinned;
      return o;
    },
    defaults: () => ({ title: '', body: '', pinned: false }),
  },
  teams: {
    create: (c, role) => isAdmin(role), edit: (c, role) => isAdmin(role), del: (c, role) => isAdmin(role),
    clean(input, c) {
      const o = {};
      if ('name' in input) o.name = str(input.name, 60) || bad('Give the team a name');
      if ('color' in input) o.color = /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : '#18693f';
      if ('members' in input) o.members = memberIds(c, input.members);
      return o;
    },
    defaults: () => ({ name: '', color: '#18693f', members: [] }),
  },
};

function afterChange(cid, coll, before, after, user) {
  const c = db.companies[cid];
  const who = user.name.split(' ')[0];
  if (coll === 'jobs') {
    const added = (after.assignees || []).filter(id => !(before && before.assignees || []).includes(id) && id !== user.id);
    notify(cid, added, `${who} added you to job ${after.ref}: ${after.title}`, '#/job/' + after.id);
    if (before && before.status !== after.status)
      postMessage(cid, 'job:' + after.id, user.id, `${who} moved this job to ${STATUS_LABEL[after.status]}`, [], true);
    if (!before) postMessage(cid, 'job:' + after.id, user.id, `${who} created this job`, [], true);
  }
  if (coll === 'tasks') {
    const added = (after.assignees || []).filter(id => !(before && before.assignees || []).includes(id) && id !== user.id);
    const job = cdata(cid).jobs[after.jobId];
    notify(cid, added, `${who} gave you a task: ${after.title}`, '#/job/' + after.jobId + '/tasks');
    if (before && !before.done && after.done && job)
      postMessage(cid, 'job:' + job.id, user.id, `${who} completed “${after.title}”`, [], true);
  }
  if (coll === 'announcements' && !before) {
    notify(cid, Object.keys(c.members).filter(id => id !== user.id), `📣 ${after.title}`, '#/news');
  }
}

// ---------------------------------------------------------------- HTTP plumbing
function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new HttpError(413, 'Upload too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'Invalid JSON')); }
    });
    req.on('error', reject);
  });
}
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function authUser(req, url) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : url.searchParams.get('token');
  const s = token && db.sessions[token];
  const u = s && db.users[s.userId];
  if (!u) throw new HttpError(401, 'Please sign in');
  if (now() - (s.seen || 0) > 60000) { s.seen = now(); save(); }
  return { user: u, token };
}
function companyCtx(user, cid) {
  const c = db.companies[cid];
  if (!c || !c.members[user.id]) throw new HttpError(404, 'Company not found');
  return { c, role: c.members[user.id].role, d: cdata(cid) };
}

function clientIp(req) {
  // behind a host like Render, the real visitor address is the first entry of X-Forwarded-For
  const fwd = DATABASE_URL || process.env.TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  return fwd || req.socket.remoteAddress || '';
}
// simple per-IP throttle for auth endpoints
const hits = new Map();
function throttle(req, key, max = 20) {
  const k = key + clientIp(req);
  const t = now(); const e = hits.get(k) || { n: 0, t };
  if (t - e.t > 10 * 60 * 1000) { e.n = 0; e.t = t; }
  e.n++; hits.set(k, e);
  if (e.n > max) throw new HttpError(429, 'Too many attempts — wait a few minutes and try again');
}

// ---------------------------------------------------------------- API
async function api(req, res, url) {
  const p = url.pathname; const M = req.method;
  let m;

  // --- accounts
  if (p === '/api/register' && M === 'POST') {
    throttle(req, 'reg');
    const b = await readBody(req);
    const email = str(b.email, 200).toLowerCase();
    const name = str(b.name, 80);
    if (!name) bad('Enter your name');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad('Enter a valid email');
    if (String(b.password || '').length < 6) bad('Password must be at least 6 characters');
    if (b.agree !== true) bad('Please agree to the Terms and Privacy Policy to create an account');
    if (Object.values(db.users).some(u => u.email === email)) bad('An account with that email already exists');
    const h = hash(b.password);
    const u = { id: uid(), email, name, salt: h.salt, hash: h.hash, title: '', phone: '', bio: '', avatar: '', shareLocation: false, reads: {}, createdAt: now(), lastSeen: now(),
      agreedAt: now(), agreedVersion: LEGAL_VERSION };
    db.users[u.id] = u;
    const token = uid(32); db.sessions[token] = { userId: u.id, createdAt: now(), seen: now() };
    save();
    return json(res, 200, { token, user: publicUser(u), companies: [] });
  }
  if (p === '/api/login' && M === 'POST') {
    throttle(req, 'login');
    const b = await readBody(req);
    const email = str(b.email, 200).toLowerCase();
    const u = Object.values(db.users).find(x => x.email === email);
    if (!u || !verify(b.password || '', u.salt, u.hash)) bad('Email or password is wrong');
    const token = uid(32); db.sessions[token] = { userId: u.id, createdAt: now(), seen: now() };
    save();
    return json(res, 200, { token, user: publicUser(u), companies: companiesFor(u.id) });
  }

  if (p === '/api/health' && M === 'GET') return json(res, 200, { ok: true, uptime: Math.round(process.uptime()) });
  if (p === '/api/info' && M === 'GET') return json(res, 200, { operator: OPERATOR, legalVersion: LEGAL_VERSION });
  if (p === '/api/stream' && M === 'GET') return stream(req, res, url);

  const { user, token } = authUser(req, url);

  if (p === '/api/logout' && M === 'POST') { delete db.sessions[token]; save(); return json(res, 200, { ok: true }); }
  if (p === '/api/me' && M === 'GET') return json(res, 200, { user: publicUser(user), companies: companiesFor(user.id) });
  if (p === '/api/me' && M === 'PUT') {
    const b = await readBody(req);
    if ('name' in b) user.name = str(b.name, 80) || bad('Name cannot be empty');
    for (const k of ['title', 'phone']) if (k in b) user[k] = str(b[k], 80);
    if ('bio' in b) user.bio = str(b.bio, 500);
    if ('avatar' in b) { const old = user.avatar; user.avatar = b.avatar ? await saveImage(b.avatar, 1024 * 1024) : ''; if (old !== user.avatar) dropFile(old); }
    if ('shareLocation' in b) {
      user.shareLocation = !!b.shareLocation;
      if (!user.shareLocation) { delete db.locations[user.id]; broadcastUser(user.id, { t: 'loc', userId: user.id, loc: null }); }
    }
    if (b.newPassword) {
      if (!verify(b.currentPassword || '', user.salt, user.hash)) bad('Current password is wrong');
      if (String(b.newPassword).length < 6) bad('New password must be at least 6 characters');
      Object.assign(user, (({ salt, hash: h }) => ({ salt, hash: h }))(hash(b.newPassword)));
    }
    save();
    const pu = publicUser(user);
    broadcastUser(user.id, { t: 'member', item: pu });
    return json(res, 200, { user: pu });
  }
  if (p === '/api/me/export' && M === 'GET') {
    // everything Crewdesk holds that is about this person (UK GDPR right of access)
    const out = { exportedAt: new Date().toISOString(), profile: Object.assign(publicUser(user), { createdAt: user.createdAt, agreedAt: user.agreedAt }),
      location: db.locations[user.id] || null, companies: [] };
    for (const c of Object.values(db.companies)) {
      if (!c.members[user.id]) continue;
      const d = cdata(c.id); const mine = [];
      for (const [ch, list] of Object.entries(d.messages)) for (const msg of list) if (msg.userId === user.id && !msg.system) mine.push({ channel: ch, at: new Date(msg.at).toISOString(), text: msg.text, photos: msgImages(msg) });
      out.companies.push({ name: c.name, role: c.members[user.id].role, joinedAt: new Date(c.members[user.id].joinedAt).toISOString(), messages: mine,
        photos: Object.values(d.photos).filter((ph) => ph.createdBy === user.id).map((ph) => ({ url: ph.url, caption: ph.caption, at: new Date(ph.createdAt).toISOString() })) });
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="crewdesk-my-data.json"', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(out, null, 2));
  }
  if (p === '/api/me' && M === 'DELETE') {
    const b = await readBody(req);
    if (!verify(b.password || '', user.salt, user.hash)) bad('Password is wrong');
    const blocking = Object.values(db.companies).filter((c) => c.members[user.id] && c.members[user.id].role === 'owner' && Object.keys(c.members).length > 1);
    if (blocking.length) bad(`You own ${blocking.map((c) => c.name).join(', ')}. Make someone else the owner (Team page) or delete the company first.`);
    for (const c of Object.values(db.companies)) {
      if (!c.members[user.id]) continue;
      if (Object.keys(c.members).length === 1) { // they were the only person left: remove the company and its files
        const d = cdata(c.id);
        for (const ph of Object.values(d.photos)) { dropFile(ph.url); dropFile(ph.thumb); }
        for (const list of Object.values(d.messages)) dropMessageFiles(list);
        broadcast(c.id, { t: 'kicked', cid: c.id });
        delete db.companies[c.id]; delete db.data[c.id];
      } else {
        delete c.members[user.id];
        for (const t of Object.values(cdata(c.id).teams)) t.members = (t.members || []).filter((x) => x !== user.id);
        broadcast(c.id, { t: 'memberRemoved', id: user.id });
      }
    }
    dropFile(user.avatar);
    for (const [tok, sess] of Object.entries(db.sessions)) if (sess.userId === user.id) delete db.sessions[tok];
    delete db.locations[user.id]; delete db.users[user.id];
    save();
    return json(res, 200, { ok: true });
  }
  if (p === '/api/me/location' && M === 'POST') {
    if (!user.shareLocation) bad('Location sharing is off');
    const b = await readBody(req);
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) bad('Bad coordinates');
    const loc = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, acc: Math.round(Number(b.acc) || 0), at: now() };
    db.locations[user.id] = loc; save();
    broadcastUser(user.id, { t: 'loc', userId: user.id, loc });
    return json(res, 200, { ok: true });
  }

  // --- companies
  if (p === '/api/companies' && M === 'POST') {
    const b = await readBody(req);
    const name = str(b.name, 80) || bad('Give your company a name');
    if (String(b.password || '').length < 4) bad('Join password must be at least 4 characters');
    const h = hash(b.password);
    const c = { id: uid(), name, code: companyCode(), joinSalt: h.salt, joinHash: h.hash, ownerId: user.id, createdAt: now(), jobSeq: 0,
      settings: { membersSeeMoney: false, membersCreateJobs: true, currency: '£' }, members: { [user.id]: { role: 'owner', joinedAt: now() } } };
    db.companies[c.id] = c; cdata(c.id);
    postMessage(c.id, 'general', user.id, `${user.name} created ${c.name}. Welcome to the team chat!`, [], true);
    save();
    return json(res, 200, { company: { id: c.id, name: c.name, role: 'owner' }, companies: companiesFor(user.id) });
  }
  if (p === '/api/companies/join' && M === 'POST') {
    throttle(req, 'join', 30);
    const b = await readBody(req);
    const code = str(b.code, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const c = Object.values(db.companies).find(x => x.code === code);
    if (!c || !verify(b.password || '', c.joinSalt, c.joinHash)) bad('Company code or password is wrong');
    if (!c.members[user.id]) {
      c.members[user.id] = { role: 'member', joinedAt: now() };
      save();
      broadcast(c.id, { t: 'member', item: Object.assign(publicUser(user), { role: 'member', joinedAt: now() }) });
      postMessage(c.id, 'general', user.id, `${user.name} joined the company 👋`, [], true);
    }
    return json(res, 200, { company: { id: c.id, name: c.name, role: c.members[user.id].role }, companies: companiesFor(user.id) });
  }

  if ((m = /^\/api\/c\/([^/]+)(\/.*)?$/.exec(p))) {
    const cid = m[1]; const sub = m[2] || '';
    const { c, role, d } = companyCtx(user, cid);

    if (sub === '/state' && M === 'GET') {
      const jobs = {}; for (const [k, j] of Object.entries(d.jobs)) jobs[k] = shapeJob(j, c, role);
      const locs = {}; for (const id of Object.keys(c.members)) if (db.users[id] && db.users[id].shareLocation && db.locations[id] && now() - db.locations[id].at < LOCATION_MAX_AGE) locs[id] = db.locations[id];
      return json(res, 200, Object.assign({ company: publicCompany(c, role), role, me: publicUser(user), members: memberList(c),
        teams: d.teams, jobs, tasks: d.tasks, clients: d.clients, announcements: d.announcements, photos: d.photos, locations: locs }, unreadFor(cid, user)));
    }
    if (sub === '' && M === 'PATCH') {
      if (!isAdmin(role)) deny();
      const b = await readBody(req);
      if ('name' in b) c.name = str(b.name, 80) || bad('Name cannot be empty');
      if (b.settings) {
        if ('membersSeeMoney' in b.settings) c.settings.membersSeeMoney = !!b.settings.membersSeeMoney;
        if ('membersCreateJobs' in b.settings) c.settings.membersCreateJobs = !!b.settings.membersCreateJobs;
        if ('currency' in b.settings) c.settings.currency = str(b.settings.currency, 3) || '£';
      }
      if (b.password) {
        if (String(b.password).length < 4) bad('Join password must be at least 4 characters');
        const h = hash(b.password); c.joinSalt = h.salt; c.joinHash = h.hash;
      }
      if (b.newCode) c.code = companyCode();
      save();
      broadcast(cid, { t: 'reload' });
      return json(res, 200, { company: publicCompany(c, role) });
    }
    if (sub === '' && M === 'DELETE') {
      if (role !== 'owner') deny('Only the owner can delete the company');
      broadcast(cid, { t: 'kicked', cid });
      for (const ph of Object.values(d.photos)) { dropFile(ph.url); if (ph.thumb !== ph.url) dropFile(ph.thumb); }
      for (const list of Object.values(d.messages)) dropMessageFiles(list);
      delete db.companies[cid]; delete db.data[cid]; save();
      return json(res, 200, { ok: true, companies: companiesFor(user.id) });
    }
    if (sub === '/leave' && M === 'POST') {
      if (role === 'owner') bad('Owners cannot leave — make someone else owner or delete the company');
      delete c.members[user.id]; save();
      broadcast(cid, { t: 'memberRemoved', id: user.id });
      return json(res, 200, { ok: true, companies: companiesFor(user.id) });
    }
    if ((m = /^\/members\/([^/]+)$/.exec(sub))) {
      const target = m[1];
      if (!c.members[target]) bad('Not a member');
      if (M === 'PATCH') {
        const b = await readBody(req);
        if (b.role === 'owner') {
          if (role !== 'owner') deny('Only the owner can hand over ownership');
          c.members[c.ownerId].role = 'admin'; c.members[target].role = 'owner'; c.ownerId = target;
        } else {
          if (!isAdmin(role) || c.members[target].role === 'owner') deny();
          c.members[target].role = b.role === 'admin' ? 'admin' : 'member';
        }
        save(); broadcast(cid, { t: 'reload' });
        return json(res, 200, { ok: true });
      }
      if (M === 'DELETE') {
        if (!isAdmin(role) || c.members[target].role === 'owner' || target === user.id) deny();
        delete c.members[target];
        for (const t of Object.values(d.teams)) t.members = (t.members || []).filter(x => x !== target);
        save();
        broadcast(cid, { t: 'memberRemoved', id: target });
        for (const s of streams) if (s.cid === cid && s.userId === target) send(s.res, { t: 'kicked', cid });
        return json(res, 200, { ok: true });
      }
    }
    if ((m = /^\/teams\/([^/]+)\/(join|leave)$/.exec(sub)) && M === 'POST') {
      const t = d.teams[m[1]] || bad('Team not found');
      t.members = (t.members || []).filter(x => x !== user.id);
      if (m[2] === 'join') t.members.push(user.id);
      save(); upsert(cid, 'teams', t);
      return json(res, 200, { item: t });
    }

    // messages
    if (sub === '/messages' && M === 'GET') {
      const ch = url.searchParams.get('channel');
      if (!channelOk(cid, ch)) bad('Unknown chat');
      const all = d.messages[ch] || [];
      const before = Number(url.searchParams.get('before')) || Infinity;
      const older = all.filter(x => x.at < before);
      return json(res, 200, { items: older.slice(-60), more: older.length > 60 });
    }
    if (sub === '/messages' && M === 'POST') {
      const b = await readBody(req);
      if (!channelOk(cid, b.channel)) bad('Unknown chat');
      const raw = Array.isArray(b.images) ? b.images : b.image ? [b.image] : [];
      if (raw.length > 6) bad('You can send up to 6 photos at once');
      const images = [];
      for (const img of raw) images.push(await saveImage(img));
      if (!str(b.text) && !images.length) bad('Message is empty');
      const msg = postMessage(cid, b.channel, user.id, b.text, images);
      markRead(user, cid, b.channel, msg.at);
      return json(res, 200, { item: msg });
    }
    // job photos
    if (sub === '/photos' && M === 'POST') {
      const b = await readBody(req, 12 * 1024 * 1024);
      const job = d.jobs[b.jobId] || bad('That job no longer exists');
      const url = await saveImage(b.image, 6 * 1024 * 1024);
      const thumb = b.thumb ? await saveImage(b.thumb, 600 * 1024) : url;
      const item = { id: uid(), jobId: job.id, url, thumb, caption: str(b.caption, 300), w: Math.round(Number(b.w) || 0), h: Math.round(Number(b.h) || 0),
        takenAt: Number(b.takenAt) || 0, createdBy: user.id, createdAt: now() };
      d.photos[item.id] = item; save();
      upsert(cid, 'photos', item);
      notePhotoAdded(cid, job.id, user);
      return json(res, 200, { item });
    }
    if ((m = /^\/photos\/([^/]+)$/.exec(sub))) {
      const ph = d.photos[m[1]];
      if (!ph) throw new HttpError(404, 'That photo was already deleted');
      if (!(isAdmin(role) || ph.createdBy === user.id)) deny('Only the person who added it, or an admin, can change this photo');
      if (M === 'PATCH') {
        const b = await readBody(req);
        if ('caption' in b) ph.caption = str(b.caption, 300);
        save(); upsert(cid, 'photos', ph);
        return json(res, 200, { item: ph });
      }
      if (M === 'DELETE') {
        delete d.photos[ph.id]; dropFile(ph.url); if (ph.thumb !== ph.url) dropFile(ph.thumb);
        save(); remove(cid, 'photos', ph.id);
        return json(res, 200, { ok: true });
      }
    }
    if (sub === '/read' && M === 'POST') {
      const b = await readBody(req);
      markRead(user, cid, str(b.channel, 60), now());
      return json(res, 200, { ok: true });
    }

    // generic collections
    if ((m = /^\/(jobs|tasks|clients|announcements|teams)(?:\/([^/]+))?$/.exec(sub))) {
      const coll = m[1]; const id = m[2]; const R = RULES[coll]; const store = d[coll];
      if (!id && M === 'POST') {
        if (!R.create(c, role)) deny();
        const b = await readBody(req);
        const clean = R.clean(b, c, role, null);
        const item = Object.assign(R.defaults(c), clean, { id: uid(), createdBy: user.id, createdAt: now(), updatedAt: now() });
        if (coll === 'jobs' && !item.title) bad('Give the job a title');
        if (coll === 'tasks' && (!item.jobId || !item.title)) bad('A task needs a title and a job');
        if (coll === 'clients' && !item.name) bad('Give the client a name');
        if (coll === 'announcements' && !item.title) bad('Add a headline');
        if (coll === 'teams' && !item.name) bad('Give the team a name');
        store[item.id] = item; save();
        upsert(cid, coll, item);
        afterChange(cid, coll, null, item, user);
        return json(res, 200, { item: coll === 'jobs' ? shapeJob(item, c, role) : item });
      }
      if (id) {
        const item = store[id];
        if (!item) throw new HttpError(404, 'Not found — it may have been deleted');
        if (M === 'PATCH') {
          if (!R.edit(c, role, item, user.id)) deny();
          const b = await readBody(req);
          const before = JSON.parse(JSON.stringify(item));
          Object.assign(item, R.clean(b, c, role, item), { updatedAt: now(), updatedBy: user.id });
          save(); upsert(cid, coll, item);
          afterChange(cid, coll, before, item, user);
          return json(res, 200, { item: coll === 'jobs' ? shapeJob(item, c, role) : item });
        }
        if (M === 'DELETE') {
          if (!R.del(c, role, item, user.id)) deny();
          delete store[id];
          if (coll === 'jobs') {
            for (const t of Object.values(d.tasks)) if (t.jobId === id) { delete d.tasks[t.id]; remove(cid, 'tasks', t.id); }
            for (const ph of Object.values(d.photos)) if (ph.jobId === id) { delete d.photos[ph.id]; dropFile(ph.url); if (ph.thumb !== ph.url) dropFile(ph.thumb); remove(cid, 'photos', ph.id); }
            dropMessageFiles(d.messages['job:' + id]);
            delete d.messages['job:' + id];
          }
          if (coll === 'clients') for (const j of Object.values(d.jobs)) if (j.clientId === id) { j.clientId = ''; upsert(cid, 'jobs', j); }
          if (coll === 'teams') for (const j of Object.values(d.jobs)) if (j.teamId === id) { j.teamId = ''; upsert(cid, 'jobs', j); }
          save(); remove(cid, coll, id);
          return json(res, 200, { ok: true });
        }
      }
    }
  }
  throw new HttpError(404, 'Not found');
}

function markRead(user, cid, channel, at) {
  user.reads = user.reads || {};
  user.reads[cid] = user.reads[cid] || {};
  user.reads[cid][channel] = at;
  save();
}

function stream(req, res, url) {
  const { user } = authUser(req, url);
  const cid = url.searchParams.get('cid');
  companyCtx(user, cid);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 3000\n\n');
  const s = { res, userId: user.id, cid };
  streams.add(s);
  const was = isOnline(user.id);
  onlineCount.set(user.id, (onlineCount.get(user.id) || 0) + 1);
  user.lastSeen = now();
  if (!was) presence(user.id);
  send(res, { t: 'hello' });
  req.on('close', () => {
    streams.delete(s);
    onlineCount.set(user.id, Math.max(0, (onlineCount.get(user.id) || 1) - 1));
    user.lastSeen = now(); save();
    setTimeout(() => { if (!isOnline(user.id)) presence(user.id); }, 4000); // ride out page reloads
  });
}

// ---------------------------------------------------------------- static files
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
// Everything the app needs is served from this site. The only outside requests are map tiles from OpenStreetMap.
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org; font-src 'self'; connect-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'geolocation=(self), camera=(self), microphone=()',
  'X-Frame-Options': 'DENY',
};
if (process.env.RENDER || process.env.FORCE_HSTS) SECURITY_HEADERS['Strict-Transport-Security'] = 'max-age=31536000';
function serveFile(res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, Object.assign({ 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Content-Length': st.size,
      'Cache-Control': cache || ext === '.woff2' || file.includes(path.sep + 'vendor' + path.sep) ? 'public, max-age=31536000, immutable' : 'no-cache' }, SECURITY_HEADERS));
    fs.createReadStream(file).pipe(res);
  });
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname.startsWith('/uploads/')) {
      const f = await storage.getFile(path.basename(url.pathname));
      if (!f) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': f.type, 'Content-Length': f.data.length, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
      return res.end(f.data);
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file)) return serveFile(res, file, false);
    return serveFile(res, path.join(PUBLIC, 'index.html'), false);
  } catch (e) {
    const code = e instanceof HttpError ? e.code : 500;
    if (code === 500) console.error(e);
    if (!res.headersSent) json(res, code, { error: code === 500 ? 'Something went wrong on the server' : e.message });
  }
}

// ---------------------------------------------------------------- start
async function main() {
  await storage.init();
  // Keep-awake: free hosting plans put the app to sleep after 15 minutes with no visitors, and the next
  // visitor then waits about a minute. When hosted, the app visits its own public address every 10 minutes
  // so it never goes to sleep. The visit only loads /api/health, which never touches the database.
  const publicUrl = process.env.KEEP_AWAKE_URL || process.env.RENDER_EXTERNAL_URL;
  if (publicUrl && process.env.KEEP_AWAKE !== 'off' && typeof fetch === 'function') {
    const ping = () => fetch(publicUrl.replace(/\/$/, '') + '/api/health', { headers: { 'User-Agent': 'Crewdesk keep-awake' } })
      .then((r) => { if (!r.ok) console.warn('Keep-awake check returned', r.status); })
      .catch((e) => console.warn('Keep-awake check failed:', e.message));
    setInterval(ping, 10 * 60 * 1000).unref();
    setTimeout(ping, 60 * 1000).unref();
    console.log('  Keep-awake is on: checking', publicUrl, 'every 10 minutes');
  }
  setInterval(() => { // forget old live positions
    let changed = false;
    for (const [id, loc] of Object.entries(db.locations)) if (now() - loc.at > LOCATION_MAX_AGE) { delete db.locations[id]; changed = true; }
    if (changed) save();
  }, 30 * 60 * 1000).unref();
  http.createServer(handler).listen(PORT, '0.0.0.0', () => {
    console.log(`\n  Crewdesk is running on port ${PORT} (storage: ${DATABASE_URL ? 'Postgres database' : 'data folder'})\n`);
    if (DATABASE_URL) return;
    console.log(`  This computer:  http://localhost:${PORT}`);
    for (const list of Object.values(os.networkInterfaces()))
      for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  Same Wi-Fi:     http://${a.address}:${PORT}`);
    console.log('\n  For phones on mobile data (and GPS), run start-public.bat — see README.md\n');
  });
  const certDir = path.join(ROOT, 'certs');
  if (fs.existsSync(path.join(certDir, 'key.pem')) && fs.existsSync(path.join(certDir, 'cert.pem'))) {
    https.createServer({ key: fs.readFileSync(path.join(certDir, 'key.pem')), cert: fs.readFileSync(path.join(certDir, 'cert.pem')) }, handler)
      .listen(HTTPS_PORT, '0.0.0.0', () => console.log(`  HTTPS:          https://<this-computer>:${HTTPS_PORT}`));
  }
}
main().catch((e) => { console.error('Crewdesk could not start:', e.message); process.exit(1); });
