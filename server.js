// Crewdesk — projects, jobs, chat, pings and calendar for small companies.
// Runs with zero dependencies on your own computer (`node server.js`, Node 18+).
// When DATABASE_URL is set (e.g. on Render with a Neon Postgres database), data and files are kept in
// Postgres instead of the local data folder, using the `pg` package.
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const passwords = require('./lib/passwords');
const mail = require('./lib/email');

const PORT = Number(process.env.PORT) || 3000;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 3443;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const BACKUPS = path.join(DATA, 'backups');
const DB_FILE = path.join(DATA, 'db.json');
const DATABASE_URL = process.env.DATABASE_URL || '';
const HOSTED = !!(process.env.RENDER || process.env.FORCE_HSTS);
const TRUST_PROXY = !!(DATABASE_URL || process.env.RENDER || process.env.TRUST_PROXY);
// Links in emails always use this address — never the request's Host header, which an attacker could fake.
const APP_URL = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const OPERATOR = { name: process.env.OPERATOR_NAME || '', email: process.env.OPERATOR_EMAIL || '', address: process.env.OPERATOR_ADDRESS || '' };
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'da1essi08sol@gmail.com';
const LEGAL_VERSION = '2026-11-03';
const LOCATION_MAX_AGE = 12 * 3600e3;
const SESSION_IDLE = 30 * 864e5;      // signed out after 30 days without use
const SESSION_MAX = 90 * 864e5;       // and after 90 days in any case
const VERIFY_TTL = 24 * 3600e3;
const RESET_TTL = 30 * 60e3;
const LOCK_FIRST = 3600e3;            // 5 wrong passwords: locked 1 hour
const LOCK_SECOND = 24 * 3600e3;      // next wrong password after that: 24 hours, then doubling
const LOCK_MAX = 365 * 864e5;
const MAX_FAILS = 5;

// ---------------------------------------------------------------- storage
// The app state lives in memory as one object and is written out (debounced) after each change:
// to data/db.json locally, or to a single Postgres row when DATABASE_URL is set. Uploaded files are
// stored separately (data/uploads or the crewdesk_files table). A dated snapshot is kept every day.
let db = {};
let pool = null;

const fileStore = {
  async init() {
    fs.mkdirSync(UPLOADS, { recursive: true }); fs.mkdirSync(BACKUPS, { recursive: true });
    if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  },
  async write(json) { const tmp = DB_FILE + '.tmp'; fs.writeFileSync(tmp, json); fs.renameSync(tmp, DB_FILE); },
  async putFile(name, type, buf) { fs.writeFileSync(path.join(UPLOADS, path.basename(name)), buf); },
  async delFile(name) { try { fs.unlinkSync(path.join(UPLOADS, path.basename(name))); } catch (_) {} },
  async getFile(name) {
    const f = path.join(UPLOADS, path.basename(name));
    return fs.existsSync(f) ? { type: TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', data: fs.readFileSync(f) } : null;
  },
  async backup(json) {
    const f = path.join(BACKUPS, `db-${new Date().toISOString().slice(0, 10)}.json`);
    fs.writeFileSync(f, json);
    const all = fs.readdirSync(BACKUPS).filter((n) => /^db-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
    for (const n of all.slice(0, Math.max(0, all.length - 14))) fs.unlinkSync(path.join(BACKUPS, n));
  },
};
const pgStore = {
  async init() {
    const { Pool } = require('pg');
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL);
    pool = new Pool({ connectionString: DATABASE_URL.replace(/[?&](sslmode|channel_binding)=[^&]*/g, ''), ssl: local ? false : { rejectUnauthorized: true }, max: 4 });
    await pool.query('CREATE TABLE IF NOT EXISTS crewdesk_state (id int PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz DEFAULT now())');
    await pool.query('CREATE TABLE IF NOT EXISTS crewdesk_files (name text PRIMARY KEY, type text NOT NULL, data bytea NOT NULL)');
    await pool.query('CREATE TABLE IF NOT EXISTS crewdesk_backups (id serial PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), data jsonb NOT NULL)');
    await pool.query('CREATE INDEX IF NOT EXISTS crewdesk_backups_created ON crewdesk_backups (created_at)');
    const r = await pool.query('SELECT data FROM crewdesk_state WHERE id = 1');
    if (r.rows[0]) db = r.rows[0].data;
  },
  async write(json) {
    await pool.query('INSERT INTO crewdesk_state (id, data, updated_at) VALUES (1, $1, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()', [json]);
  },
  async putFile(name, type, buf) { await pool.query('INSERT INTO crewdesk_files (name, type, data) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING', [name, type, buf]); },
  async getFile(name) { const r = await pool.query('SELECT type, data FROM crewdesk_files WHERE name = $1', [path.basename(name)]); return r.rows[0] || null; },
  async delFile(name) { await pool.query('DELETE FROM crewdesk_files WHERE name = $1', [path.basename(name)]); },
  async backup(json) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO crewdesk_backups (data) VALUES ($1)', [json]);
      await client.query('DELETE FROM crewdesk_backups WHERE id NOT IN (SELECT id FROM crewdesk_backups ORDER BY created_at DESC LIMIT 14)');
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
  },
};
const storage = DATABASE_URL ? pgStore : fileStore;

let saveTimer = null, writing = Promise.resolve(), dirty = false;
function save() { dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 400); }
function flush() {
  clearTimeout(saveTimer); saveTimer = null;
  if (!dirty) return writing;
  dirty = false;
  const json = JSON.stringify(db);
  writing = writing.then(() => storage.write(json)).catch((e) => { console.error('Save failed, will retry:', e.message); dirty = true; saveTimer = setTimeout(flush, 3000); });
  return writing;
}
async function backupIfDue() {
  const today = new Date().toISOString().slice(0, 10);
  if (db.meta.lastBackup === today) return;
  try { await flush(); await storage.backup(JSON.stringify(db)); db.meta.lastBackup = today; save(); console.log('  Daily backup saved'); }
  catch (e) { console.error('Backup failed:', e.message); }
}
async function shutdown() { try { await flush(); await writing; } finally { process.exit(0); } }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ---------------------------------------------------------------- small helpers
const uid = (n = 10) => crypto.randomBytes(n).toString('base64url').replace(/[-_]/g, '').slice(0, n + 4);
const now = () => Date.now();
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');
class HttpError extends Error { constructor(code, msg, extra) { super(msg); this.code = code; this.extra = extra; } }
const bad = (m, extra) => { throw new HttpError(400, m, extra); };
const deny = (m = 'You don’t have permission to do that') => { throw new HttpError(403, m); };
const notFound = (m = 'Not found — it may have been deleted') => { throw new HttpError(404, m); };
const str = (v, max = 500) => (v == null ? '' : String(v)).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !isNaN(Date.parse(v)) ? String(v) : '');
const hhmm = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : '');
const isAdmin = (role) => role === 'owner' || role === 'admin';
const emailOk = (e) => /^[^@\s]{1,64}@[^@\s]+\.[a-z]{2,}$/i.test(e) && e.length <= 200;
const normEmail = (e) => str(e, 200).toLowerCase();
const ukTime = (ts) => new Date(ts).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function companyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from(crypto.randomBytes(6), (b) => chars[b % chars.length]).join(''); }
  while (Object.values(db.companies).some((x) => x.code === c));
  return c;
}
function userByEmail(email) { return Object.values(db.users).find((u) => u.email === email) || null; }
function secLog(type, info = {}) {
  db.secLog.push(Object.assign({ at: now(), type }, info));
  if (db.secLog.length > 1500) db.secLog.splice(0, db.secLog.length - 1500);
  if (/locked|blocked|reset-done|password-changed/.test(type)) console.warn(`[security] ${type}`, JSON.stringify(info));
  save();
}

// ---------------------------------------------------------------- data shape & migration
const COLLS = ['teams', 'jobs', 'tasks', 'clients', 'pings', 'photos', 'projects', 'events', 'finance', 'chats', 'files'];
function cdata(cid) {
  const d = db.data[cid] = db.data[cid] || {};
  for (const k of COLLS) d[k] = d[k] || {};
  d.messages = d.messages || {};
  d.inbox = d.inbox || {};
  return d;
}
const DEFAULT_SETTINGS = { membersSeeMoney: false, membersCreateJobs: true, membersCreateProjects: true, membersInvite: false, membersPing: true, allowCodeJoin: true, currency: '£' };
function migrate() {
  for (const k of ['users', 'sessions', 'companies', 'data', 'locations', 'tokens', 'guard', 'fileIndex']) db[k] = db[k] || {};
  db.secLog = db.secLog || [];
  db.meta = db.meta || { schema: 1 };
  if (db.meta.schema < 2) {
    // v2: cookie sessions (old sign-ins are cleared), verified flag, pings replace announcements, projects etc.
    db.sessions = {};
    for (const u of Object.values(db.users)) { if (u.verified === undefined) u.verified = true; }
    for (const c of Object.values(db.companies)) {
      const d = cdata(c.id);
      for (const a of Object.values(d.announcements || {})) {
        const readBy = {}; for (const id of Object.keys(c.members)) readBy[id] = now();
        d.pings[a.id] = { id: a.id, title: a.title, body: a.body || '', pinned: !!a.pinned, files: [], readBy, createdBy: a.createdBy, createdAt: a.createdAt, updatedAt: a.updatedAt || a.createdAt };
      }
      delete d.announcements;
    }
    db.meta.schema = 2;
  }
  for (const u of Object.values(db.users)) {
    u.prefs = Object.assign({ popups: true, desktop: false, sound: false }, u.prefs || {});
    u.privacy = Object.assign({ showPhone: true, showEmail: true, showCompanies: true, profilePublic: false }, u.privacy || {});
    u.favs = u.favs || {}; u.reads = u.reads || {};
  }
  for (const c of Object.values(db.companies)) {
    c.settings = Object.assign({}, DEFAULT_SETTINGS, c.settings || {});
    c.invites = c.invites || {};
    const d = cdata(c.id);
    for (const j of Object.values(d.jobs)) { j.visibility = j.visibility || 'all'; j.viewers = j.viewers || []; j.projectId = j.projectId || ''; j.history = j.history || []; }
  }
  buildFileIndex();
  save();
}
// Which record every uploaded file belongs to, so /uploads/ can check who may open it.
function buildFileIndex() {
  const idx = {};
  const name = (url) => (typeof url === 'string' && url.startsWith('/uploads/') ? url.slice(9) : null);
  for (const u of Object.values(db.users)) { const n = name(u.avatar); if (n) idx[n] = { kind: 'avatar', owner: u.id }; }
  for (const c of Object.values(db.companies)) {
    const n = name(c.banner); if (n) idx[n] = { kind: 'banner', cid: c.id };
    const l = name(c.logo); if (l) idx[l] = { kind: 'logo', cid: c.id };
  }
  for (const [cid, d] of Object.entries(db.data)) {
    if (!db.companies[cid]) continue;
    for (const p of Object.values(d.photos || {})) for (const u of [p.url, p.thumb]) { const n = name(u); if (n) idx[n] = { kind: 'photo', cid, job: p.jobId }; }
    for (const [ch, list] of Object.entries(d.messages || {})) for (const m of list) for (const u of msgImages(m)) { const n = name(u); if (n) idx[n] = { kind: 'msg', cid, ch }; }
    for (const f of Object.values(d.files || {})) for (const u of [f.url, f.thumb]) { const n = name(u); if (n) idx[n] = { kind: 'file', cid, fileId: f.id }; }
  }
  db.fileIndex = idx;
}

// ---------------------------------------------------------------- people & permissions
function isOnline(id) { return (onlineCount.get(id) || 0) > 0; }
function publicUser(u, viewerId) {
  if (!u) return null;
  const self = viewerId === undefined || viewerId === u.id;
  return { id: u.id, name: u.name, email: self || u.privacy.showEmail ? u.email : '', title: u.title || '', dept: u.dept || '', phone: self || u.privacy.showPhone ? (u.phone || '') : '',
    bio: u.bio || '', avatar: u.avatar || '', shareLocation: !!u.shareLocation, lastSeen: u.lastSeen || 0, online: isOnline(u.id) };
}
function meUser(u) { return Object.assign(publicUser(u), { prefs: u.prefs, privacy: u.privacy, verified: !!u.verified, createdAt: u.createdAt }); }
function memberList(c, viewerId) {
  return Object.entries(c.members).map(([id, m]) => Object.assign(publicUser(db.users[id], viewerId) || { id, name: 'Removed user' }, { role: m.role, joinedAt: m.joinedAt, companies: db.users[id] ? profileCompanies(db.users[id], viewerId) : [] }));
}
const canSeeMoney = (c, role) => isAdmin(role) || !!c.settings.membersSeeMoney;
function publicCompany(c, role) {
  const profile = Object.assign({ visibility: 'private', description: '', location: '', industry: '', website: '' }, c.profile || {});
  const out = { id: c.id, name: c.name, code: isAdmin(role) || c.settings.allowCodeJoin ? c.code : '', ownerId: c.ownerId, createdAt: c.createdAt,
    settings: c.settings, canSeeMoney: canSeeMoney(c, role), banner: c.banner || '', bannerPos: c.bannerPos != null ? c.bannerPos : 50, logo: c.logo || '', profile,
    membersCount: Object.keys(c.members).length };
  if (isAdmin(role)) out.requests = Object.values(c.requests || {}).filter((r) => db.users[r.userId]).map((r) => Object.assign({ at: r.at, message: r.message }, publicUser(db.users[r.userId])));
  return out;
}
// What anyone signed in may see about a public company (or members about their own).
function directoryCard(c, viewerId, full = false) {
  const p = c.profile || {};
  const o = { id: c.id, name: c.name, logo: c.logo || '', banner: c.banner || '', bannerPos: c.bannerPos != null ? c.bannerPos : 50, description: full ? (p.description || '') : (p.description || '').slice(0, 220),
    location: p.location || '', industry: p.industry || '', website: p.website || '', visibility: p.visibility || 'private', membersCount: Object.keys(c.members).length,
    createdAt: c.createdAt, isMember: !!c.members[viewerId], requested: !!(c.requests && c.requests[viewerId]) };
  if (full) {
    o.owner = (db.users[c.ownerId] || {}).name || '';
    // people who've chosen to show their profile outside their companies (or everyone, if you're in it too)
    o.people = Object.keys(c.members).map((id) => db.users[id]).filter((u) => u && (c.members[viewerId] || (u.privacy && u.privacy.profilePublic)))
      .slice(0, 48).map((u) => ({ id: u.id, name: u.name, avatar: u.avatar || '', title: u.title || '', role: c.members[u.id].role }));
  }
  return o;
}
function sharesCompany(a, b) { return Object.values(db.companies).some((c) => c.members[a] && c.members[b]); }
// A profile as someone outside your companies sees it: never contact details, location or online status.
function outsideProfile(u, viewerId) {
  return { id: u.id, name: u.name, avatar: u.avatar || '', title: u.title || '', dept: u.dept || '', bio: u.bio || '', companies: profileCompanies(u, viewerId), outside: true };
}
function myRequests(userId) {
  return Object.values(db.companies).filter((c) => c.requests && c.requests[userId]).map((c) => ({ id: c.id, name: c.name, logo: c.logo || '', at: c.requests[userId].at }));
}
function broadcastAdmins(c, evt) { broadcast(c.id, evt, { only: Object.keys(c.members).filter((id) => isAdmin(c.members[id].role)) }); }
// Companies shown on someone's profile: only public ones, or ones the viewer is also in.
function profileCompanies(u, viewerId) {
  if (u.privacy && u.privacy.showCompanies === false && u.id !== viewerId) return [];
  return Object.values(db.companies).filter((c) => c.members[u.id] && (c.members[viewerId] || (c.profile && c.profile.visibility === 'public')))
    .map((c) => ({ id: c.id, name: c.name, logo: c.logo || '', role: c.members[u.id].role, shared: !!c.members[viewerId], public: !!(c.profile && c.profile.visibility === 'public') }));
}
function companiesFor(userId) {
  return Object.values(db.companies).filter((c) => c.members[userId]).map((c) => ({ id: c.id, name: c.name, role: c.members[userId].role, logo: c.logo || '' }));
}
function memberIds(c, arr, max = 100) { return Array.isArray(arr) ? [...new Set(arr.map(String))].filter((id) => c.members[id]).slice(0, max) : []; }
function list(arr, fn, max = 200) { return Array.isArray(arr) ? arr.slice(0, max).map(fn) : []; }

function ctxFor(c, userId) { const m = c.members[userId]; return m ? { c, role: m.role, uid: userId, d: cdata(c.id), user: db.users[userId] } : null; }
function canSeeProject(x, p) {
  if (!p) return true;
  return isAdmin(x.role) || p.visibility !== 'selected' || p.createdBy === x.uid || (p.members || []).includes(x.uid);
}
function canSeeJob(x, j) {
  if (!j) return false;
  if (isAdmin(x.role)) return true;
  if (j.projectId && x.d.projects[j.projectId] && !canSeeProject(x, x.d.projects[j.projectId])) return false;
  if (j.visibility !== 'selected') return true;
  return j.createdBy === x.uid || (j.viewers || []).includes(x.uid) || (j.assignees || []).includes(x.uid);
}
function canSeeEvent(x, e) {
  if (e.jobId && !canSeeJob(x, x.d.jobs[e.jobId])) return false;
  if (e.projectId && !canSeeProject(x, x.d.projects[e.projectId])) return false;
  if (e.visibility === 'selected' && !isAdmin(x.role)) return e.createdBy === x.uid || (e.participants || []).includes(x.uid);
  return true;
}
function canSeeChannel(x, ch) {
  if (ch === 'general') return true;
  let m;
  if ((m = /^job:(.+)$/.exec(ch || ''))) return canSeeJob(x, x.d.jobs[m[1]]);
  if ((m = /^chat:(.+)$/.exec(ch || ''))) { const c = x.d.chats[m[1]]; return !!(c && c.members.includes(x.uid)); } // private: even admins can’t read others’ chats
  return false;
}
function shapeJob(j, x) {
  const o = Object.assign({}, j);
  if (!canSeeMoney(x.c, x.role)) { delete o.price; delete o.costs; }
  return o;
}
function shapePing(p, x) {
  const o = Object.assign({}, p); delete o.readBy;
  o.read = !!(p.readBy && p.readBy[x.uid]) || p.createdBy === x.uid;
  o.readCount = Object.keys(p.readBy || {}).length;
  return o;
}
// What one person may see of one item (null = hidden from them).
function viewFor(coll, item, x) {
  switch (coll) {
    case 'jobs': return canSeeJob(x, item) ? shapeJob(item, x) : null;
    case 'tasks': case 'photos': return canSeeJob(x, x.d.jobs[item.jobId]) ? item : null;
    case 'projects': return canSeeProject(x, item) ? item : null;
    case 'events': return canSeeEvent(x, item) ? item : null;
    case 'finance': return isAdmin(x.role) ? item : null;
    case 'pings': return shapePing(item, x);
    case 'chats': return item.members.includes(x.uid) ? item : null;
    case 'files': return null;
    default: return item;
  }
}
function stateFor(x) {
  const out = {};
  for (const coll of ['teams', 'jobs', 'tasks', 'clients', 'pings', 'photos', 'projects', 'events', 'finance', 'chats']) {
    const o = {}; for (const [k, v] of Object.entries(x.d[coll])) { const s = viewFor(coll, v, x); if (s) o[k] = s; }
    out[coll] = o;
  }
  return out;
}

// ---------------------------------------------------------------- realtime (Server-Sent Events)
const streams = new Set();          // { res, userId, cid }
const onlineCount = new Map();      // userId -> open connections
function send(res, evt) { try { res.write(`data: ${JSON.stringify(evt)}\n\n`); } catch (_) {} }
function broadcast(cid, evt, opts = {}) {
  const c = db.companies[cid]; if (!c) return;
  for (const s of streams) {
    if (s.cid !== cid) continue;
    if (opts.only && !opts.only.includes(s.userId)) continue;
    const x = ctxFor(c, s.userId); if (!x) continue;
    const e = typeof evt === 'function' ? evt(x) : evt;
    if (e) send(s.res, e);
  }
}
function broadcastUser(userId, evt) { for (const c of Object.values(db.companies)) if (c.members[userId]) broadcast(c.id, evt); }
function presence(userId) { const u = db.users[userId]; if (u) broadcastUser(userId, { t: 'presence', userId, online: isOnline(userId), lastSeen: u.lastSeen || 0 }); }
function upsert(cid, coll, item) { broadcast(cid, (x) => { const v = viewFor(coll, item, x); return v ? { t: 'upsert', coll, item: v } : { t: 'remove', coll, id: item.id }; }); }
function removeItem(cid, coll, id) { broadcast(cid, { t: 'remove', coll, id }); }
function memberEvent(cid, user) { broadcast(cid, (x) => ({ t: 'member', item: Object.assign(publicUser(user, x.uid), { role: x.c.members[user.id] && x.c.members[user.id].role }) })); }
// A personal notification: saved in the person's activity list, and shown live if they're online.
function notify(cid, userIds, text, link) {
  const c = db.companies[cid]; if (!c) return;
  const d = cdata(cid);
  const ids = [...new Set(userIds)].filter((id) => id && c.members[id]);
  for (const id of ids) {
    const box = d.inbox[id] = d.inbox[id] || [];
    const item = { id: uid(), text: str(text, 300), link: str(link, 200), at: now(), read: false };
    box.push(item); if (box.length > 200) box.splice(0, box.length - 200);
    broadcast(cid, { t: 'inbox', item }, { only: [id] });
  }
  if (ids.length) save();
}
setInterval(() => { for (const s of streams) { try { s.res.write(': ping\n\n'); } catch (_) {} } }, 25000);

// ---------------------------------------------------------------- uploads
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const DOC_TYPES = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet', txt: 'text/plain', csv: 'text/csv', rtf: 'application/rtf' };
function sniffImage(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (/^GIF8[79]a/.test(buf.slice(0, 6).toString('latin1'))) return 'image/gif';
  return '';
}
function docOk(ext, buf) { // content must match the file type, so a renamed web page or program is refused
  const head = buf.slice(0, 8);
  if (ext === 'pdf') return head.slice(0, 5).toString('latin1') === '%PDF-';
  if (['docx', 'xlsx', 'pptx', 'odt', 'ods'].includes(ext)) return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  if (['doc', 'xls', 'ppt'].includes(ext)) return head.equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (ext === 'rtf') return head.slice(0, 5).toString('latin1') === '{\\rtf';
  if (ext === 'txt' || ext === 'csv') { if (buf.includes(0)) return false; const t = buf.toString('utf8'); return !/<\s*(script|html|iframe|svg)/i.test(t); }
  return false;
}
function decodeData(dataUrl) {
  const m = /^data:([\w.+/-]*);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!m) bad('That file could not be read');
  return Buffer.from(m[2], 'base64');
}
async function saveImage(dataUrl, maxBytes, ref) {
  const buf = decodeData(dataUrl);
  const type = sniffImage(buf);
  if (!type || type === 'image/gif') bad('Image must be a JPEG, PNG or WebP photo');
  if (buf.length > maxBytes) bad('Image is too large');
  const name = uid(18) + '.' + IMAGE_TYPES[type];
  await storage.putFile(name, type, buf);
  db.fileIndex[name] = ref;
  return '/uploads/' + name;
}
function dropFile(url) {
  if (typeof url === 'string' && url.startsWith('/uploads/')) {
    const n = url.slice(9); delete db.fileIndex[n];
    storage.delFile(n).catch((e) => console.error('Could not delete file:', e.message));
  }
}
function dropMessageFiles(list) { for (const m of list || []) for (const u of msgImages(m)) dropFile(u); }
function dropCompanyFiles(cid) {
  for (const [n, e] of Object.entries(db.fileIndex)) if (e.cid === cid) { delete db.fileIndex[n]; storage.delFile(n).catch(() => {}); }
}
function canReadFile(user, e) {
  if (!e) return false;
  if (e.kind === 'avatar') return e.owner === user.id || sharesCompany(user.id, e.owner) || !!(db.users[e.owner] && db.users[e.owner].privacy && db.users[e.owner].privacy.profilePublic);
  if (e.kind === 'banner' || e.kind === 'logo') { const c = db.companies[e.cid]; return !!(c && (c.members[user.id] || (c.profile && c.profile.visibility === 'public'))); }
  const c = db.companies[e.cid]; if (!c) return false;
  const x = ctxFor(c, user.id); if (!x) return false;
  if (e.kind === 'photo') return canSeeJob(x, x.d.jobs[e.job]);
  if (e.kind === 'msg') return canSeeChannel(x, e.ch);
  if (e.kind === 'file') {
    const f = x.d.files[e.fileId]; if (!f) return false;
    if (f.status !== 'attached') return f.by === user.id;
    if (f.scope && f.scope.ping) return !!x.d.pings[f.scope.ping];
    return false;
  }
  return false;
}

// ---------------------------------------------------------------- messages
const msgImages = (m) => (m.images && m.images.length ? m.images : m.image ? [m.image] : []);
function msgPreview(m) { const n = msgImages(m).length; return m.text || (n > 1 ? `📷 ${n} photos` : n ? '📷 Photo' : ''); }
function postMessage(cid, channel, userId, text, images, system = false) {
  const d = cdata(cid);
  const arr = d.messages[channel] = d.messages[channel] || [];
  const msg = { id: uid(), channel, userId, text: str(text, 4000), images: images || [], at: now(), system };
  arr.push(msg);
  if (arr.length > 3000) dropMessageFiles(arr.splice(0, arr.length - 3000));
  save();
  broadcast(cid, (x) => (canSeeChannel(x, channel) ? { t: 'msg', item: msg } : null));
  return msg;
}
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
function unreadFor(x) {
  const out = {}; const last = {};
  const reads = (x.user.reads && x.user.reads[x.c.id]) || {};
  for (const [ch, arr] of Object.entries(x.d.messages)) {
    if (!arr.length || !canSeeChannel(x, ch)) continue;
    const since = reads[ch] || 0;
    let n = 0; for (let i = arr.length - 1; i >= 0 && arr[i].at > since; i--) if (arr[i].userId !== x.uid && !arr[i].system) n++;
    out[ch] = n;
    const l = arr[arr.length - 1];
    last[ch] = { at: l.at, text: msgPreview(l), userId: l.userId, system: l.system };
  }
  return { unread: out, lastMsg: last };
}
function markRead(user, cid, channel, at) {
  user.reads[cid] = user.reads[cid] || {};
  user.reads[cid][channel] = at; save();
}

// ---------------------------------------------------------------- collection rules
const STATUSES = ['planned', 'active', 'hold', 'done'];
const STATUS_LABEL = { planned: 'Planned', active: 'In progress', hold: 'On hold', done: 'Done' };
const vis = (v) => (v === 'selected' ? 'selected' : 'all');
const color = (v, d = '#18693f') => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : d);

const RULES = {
  projects: {
    create: (x) => isAdmin(x.role) || x.c.settings.membersCreateProjects !== false,
    edit: (x, p) => isAdmin(x.role) || p.createdBy === x.uid || p.visibility !== 'selected' || (p.members || []).includes(x.uid),
    del: (x, p) => isAdmin(x.role) || p.createdBy === x.uid,
    clean(b, x, existing) {
      const o = {};
      if ('name' in b) o.name = str(b.name, 120) || bad('Give the project a name');
      if ('description' in b) o.description = str(b.description, 5000);
      if ('clientId' in b) o.clientId = x.d.clients[b.clientId] ? b.clientId : '';
      if ('color' in b) o.color = color(b.color);
      if ('start' in b) o.start = date(b.start);
      if ('due' in b) o.due = date(b.due);
      if ('visibility' in b || 'members' in b) {
        if (existing && !(isAdmin(x.role) || existing.createdBy === x.uid)) deny('Only the person who made this project, or an admin, can change who sees it');
        if ('visibility' in b) o.visibility = vis(b.visibility);
        if ('members' in b) o.members = memberIds(x.c, b.members);
      }
      if ('archived' in b) { o.archived = !!b.archived; o.archivedAt = o.archived ? now() : 0; }
      return o;
    },
    defaults: () => ({ name: '', description: '', clientId: '', color: '#18693f', start: '', due: '', visibility: 'all', members: [], archived: false, archivedAt: 0 }),
  },
  jobs: {
    create: (x) => isAdmin(x.role) || x.c.settings.membersCreateJobs !== false,
    edit: (x, j) => canSeeJob(x, j),
    del: (x, j) => isAdmin(x.role) || j.createdBy === x.uid,
    clean(b, x, existing) {
      const o = {};
      if ('title' in b) o.title = str(b.title, 140) || bad('Give the job a title');
      if ('description' in b) o.description = str(b.description, 5000);
      if ('status' in b) o.status = STATUSES.includes(b.status) ? b.status : 'planned';
      if ('priority' in b) o.priority = ['low', 'normal', 'high', 'urgent'].includes(b.priority) ? b.priority : 'normal';
      if ('clientId' in b) o.clientId = x.d.clients[b.clientId] ? b.clientId : '';
      if ('teamId' in b) o.teamId = x.d.teams[b.teamId] ? b.teamId : '';
      if ('projectId' in b) {
        const p = x.d.projects[b.projectId];
        if (b.projectId && (!p || !canSeeProject(x, p))) bad('That project no longer exists');
        o.projectId = p ? p.id : '';
      }
      if ('address' in b) o.address = str(b.address, 300);
      if ('lat' in b) o.lat = b.lat === null || b.lat === '' || !Number.isFinite(Number(b.lat)) || Math.abs(b.lat) > 90 ? null : Math.round(Number(b.lat) * 1e5) / 1e5;
      if ('lng' in b) o.lng = b.lng === null || b.lng === '' || !Number.isFinite(Number(b.lng)) || Math.abs(b.lng) > 180 ? null : Math.round(Number(b.lng) * 1e5) / 1e5;
      if ('start' in b) o.start = date(b.start);
      if ('deadline' in b) o.deadline = date(b.deadline);
      if ('assignees' in b) o.assignees = memberIds(x.c, b.assignees);
      if ('visibility' in b || 'viewers' in b) {
        if (existing && !(isAdmin(x.role) || existing.createdBy === x.uid)) deny('Only the person who made this job, or an admin, can change who sees it');
        if ('visibility' in b) o.visibility = vis(b.visibility);
        if ('viewers' in b) o.viewers = memberIds(x.c, b.viewers);
      }
      if (canSeeMoney(x.c, x.role)) {
        if ('price' in b) o.price = Math.max(0, num(b.price));
        if ('costs' in b) o.costs = list(b.costs, (c) => ({ id: str(c.id, 30) || uid(), label: str(c.label, 120), amount: num(c.amount) }), 100);
      }
      return o;
    },
    defaults: (x) => ({ title: '', description: '', status: 'planned', priority: 'normal', clientId: '', teamId: '', projectId: '', address: '', lat: null, lng: null,
      start: '', deadline: '', assignees: [], visibility: 'all', viewers: [], price: 0, costs: [], history: [],
      ref: 'J-' + String((x.c.jobSeq = (x.c.jobSeq || 0) + 1)).padStart(4, '0') }),
  },
  tasks: {
    create: () => true,
    edit: (x, t) => canSeeJob(x, x.d.jobs[t.jobId]),
    del: (x, t) => canSeeJob(x, x.d.jobs[t.jobId]) && (isAdmin(x.role) || t.createdBy === x.uid || (x.d.jobs[t.jobId] || {}).createdBy === x.uid),
    clean(b, x) {
      const o = {};
      if ('jobId' in b) { const j = x.d.jobs[b.jobId]; if (!j || !canSeeJob(x, j)) bad('That job no longer exists'); o.jobId = j.id; }
      if ('title' in b) o.title = str(b.title, 200) || bad('Give the task a title');
      if ('notes' in b) o.notes = str(b.notes, 3000);
      if ('assignees' in b) o.assignees = memberIds(x.c, b.assignees);
      if ('deadline' in b) o.deadline = date(b.deadline);
      if ('done' in b) o.done = !!b.done;
      if ('order' in b) o.order = num(b.order);
      if ('checklist' in b) o.checklist = list(b.checklist, (c) => ({ id: str(c.id, 30) || uid(), text: str(c.text, 200), done: !!c.done }), 100);
      return o;
    },
    defaults: () => ({ jobId: '', title: '', notes: '', assignees: [], deadline: '', done: false, order: now(), checklist: [] }),
  },
  clients: {
    create: () => true, edit: () => true, del: (x) => isAdmin(x.role),
    clean(b) {
      const o = {};
      if ('name' in b) o.name = str(b.name, 120) || bad('Give the client a name');
      for (const k of ['company', 'phone', 'email', 'address']) if (k in b) o[k] = str(b[k], 200);
      if ('notes' in b) o.notes = str(b.notes, 3000);
      return o;
    },
    defaults: () => ({ name: '', company: '', phone: '', email: '', address: '', notes: '' }),
  },
  pings: {
    create: (x) => isAdmin(x.role) || x.c.settings.membersPing !== false,
    edit: (x, p) => isAdmin(x.role) || p.createdBy === x.uid,
    del: (x, p) => isAdmin(x.role) || p.createdBy === x.uid,
    clean(b, x) {
      const o = {};
      if ('title' in b) o.title = str(b.title, 150) || bad('Give the ping a title');
      if ('body' in b) o.body = str(b.body, 8000);
      if ('pinned' in b) { if (!isAdmin(x.role)) deny('Only admins can pin pings'); o.pinned = !!b.pinned; }
      return o;
    },
    defaults: () => ({ title: '', body: '', pinned: false, files: [], readBy: {} }),
  },
  events: {
    create: () => true,
    edit: (x, e) => isAdmin(x.role) || e.createdBy === x.uid,
    del: (x, e) => isAdmin(x.role) || e.createdBy === x.uid,
    clean(b, x) {
      const o = {};
      if ('title' in b) o.title = str(b.title, 150) || bad('Give the event a title');
      if ('date' in b) o.date = date(b.date) || bad('Pick a date');
      if ('endDate' in b) o.endDate = date(b.endDate);
      if ('allDay' in b) o.allDay = !!b.allDay;
      if ('start' in b) o.start = hhmm(b.start);
      if ('end' in b) o.end = hhmm(b.end);
      if ('startsAt' in b) o.startsAt = Number.isFinite(Number(b.startsAt)) ? Number(b.startsAt) : 0;
      if ('description' in b) o.description = str(b.description, 3000);
      if ('location' in b) o.location = str(b.location, 200);
      if ('participants' in b) o.participants = memberIds(x.c, b.participants);
      if ('visibility' in b) o.visibility = vis(b.visibility);
      if ('jobId' in b) { const j = x.d.jobs[b.jobId]; if (b.jobId && (!j || !canSeeJob(x, j))) bad('That job no longer exists'); o.jobId = j ? j.id : ''; }
      if ('projectId' in b) { const p = x.d.projects[b.projectId]; if (b.projectId && (!p || !canSeeProject(x, p))) bad('That project no longer exists'); o.projectId = p ? p.id : ''; }
      if ('color' in b) o.color = color(b.color, '');
      return o;
    },
    defaults: () => ({ title: '', date: '', endDate: '', allDay: true, start: '', end: '', startsAt: 0, description: '', location: '', participants: [], visibility: 'all', jobId: '', projectId: '', color: '', remindedAt: 0 }),
  },
  finance: {
    create: (x) => isAdmin(x.role), edit: (x) => isAdmin(x.role), del: (x) => isAdmin(x.role),
    clean(b, x) {
      const o = {};
      if ('date' in b) o.date = date(b.date) || bad('Enter a date');
      if ('type' in b) o.type = b.type === 'expense' ? 'expense' : 'income';
      if ('category' in b) o.category = str(b.category, 60);
      if ('description' in b) o.description = str(b.description, 300);
      if ('amount' in b) { o.amount = Math.abs(num(b.amount)); if (o.amount > 1e10) bad('That amount is too large'); }
      if ('jobId' in b) o.jobId = x.d.jobs[b.jobId] ? b.jobId : '';
      if ('clientId' in b) o.clientId = x.d.clients[b.clientId] ? b.clientId : '';
      return o;
    },
    defaults: () => ({ date: new Date().toISOString().slice(0, 10), type: 'income', category: '', description: '', amount: 0, jobId: '', clientId: '', source: '' }),
  },
  teams: {
    create: (x) => isAdmin(x.role), edit: (x) => isAdmin(x.role), del: (x) => isAdmin(x.role),
    clean(b, x) {
      const o = {};
      if ('name' in b) o.name = str(b.name, 60) || bad('Give the team a name');
      if ('color' in b) o.color = color(b.color);
      if ('members' in b) o.members = memberIds(x.c, b.members);
      return o;
    },
    defaults: () => ({ name: '', color: '#18693f', members: [] }),
  },
};
const REQUIRED = { projects: ['name', 'Give the project a name'], jobs: ['title', 'Give the job a title'], tasks: ['title', 'A task needs a title'], clients: ['name', 'Give the client a name'],
  pings: ['title', 'Give the ping a title'], events: ['title', 'Give the event a title'], teams: ['name', 'Give the team a name'], finance: ['date', 'Enter a date'] };

const ACCESS_FIELDS = { jobs: ['visibility', 'viewers', 'assignees', 'projectId', 'createdBy'], projects: ['visibility', 'members'], events: ['visibility', 'participants', 'jobId', 'projectId'] };
function accessChanged(coll, before, after) {
  return before && (ACCESS_FIELDS[coll] || []).some((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

function jobHistory(job, user, text) {
  job.history = job.history || [];
  job.history.push({ at: now(), by: user.id, text: str(text, 200) });
  if (job.history.length > 100) job.history.splice(0, job.history.length - 100);
}
function afterChange(cid, coll, before, after, user) {
  const c = db.companies[cid]; const d = cdata(cid);
  const who = user.name.split(' ')[0];
  if (coll === 'jobs') {
    const added = (after.assignees || []).filter((id) => !(before && before.assignees || []).includes(id) && id !== user.id);
    notify(cid, added, `${who} added you to job ${after.ref}: ${after.title}`, '#/job/' + after.id);
    if (!before) { jobHistory(after, user, 'Created the job'); postMessage(cid, 'job:' + after.id, user.id, `${who} created this job`, [], true); }
    else {
      if (before.status !== after.status) {
        jobHistory(after, user, `Moved to ${STATUS_LABEL[after.status]}`);
        postMessage(cid, 'job:' + after.id, user.id, `${who} moved this job to ${STATUS_LABEL[after.status]}`, [], true);
        if (after.status === 'done') after.completedAt = now();
      }
      if (before.title !== after.title) jobHistory(after, user, `Renamed to “${after.title}”`);
      if (before.deadline !== after.deadline) jobHistory(after, user, after.deadline ? `Set the deadline to ${after.deadline}` : 'Removed the deadline');
      if (before.start !== after.start) jobHistory(after, user, after.start ? `Set the start date to ${after.start}` : 'Removed the start date');
      if (before.priority !== after.priority) jobHistory(after, user, `Changed priority to ${after.priority}`);
      const names = (ids) => ids.map((id) => (db.users[id] || {}).name || 'someone').join(', ');
      const add = (after.assignees || []).filter((id) => !(before.assignees || []).includes(id));
      const rem = (before.assignees || []).filter((id) => !(after.assignees || []).includes(id));
      if (add.length) jobHistory(after, user, `Assigned ${names(add)}`);
      if (rem.length) jobHistory(after, user, `Unassigned ${names(rem)}`);
      if (before.visibility !== after.visibility || JSON.stringify(before.viewers) !== JSON.stringify(after.viewers))
        jobHistory(after, user, after.visibility === 'selected' ? 'Limited who can see this job' : 'Made the job visible to everyone');
      if (before.projectId !== after.projectId) jobHistory(after, user, after.projectId ? `Moved to project “${(d.projects[after.projectId] || {}).name || ''}”` : 'Removed from its project');
      if (JSON.stringify(before.price) !== JSON.stringify(after.price) || JSON.stringify(before.costs) !== JSON.stringify(after.costs)) jobHistory(after, user, 'Updated the money');
    }
  }
  if (coll === 'tasks') {
    const added = (after.assignees || []).filter((id) => !(before && before.assignees || []).includes(id) && id !== user.id);
    const job = d.jobs[after.jobId];
    notify(cid, added, `${who} gave you a task: ${after.title}`, '#/job/' + after.jobId + '/tasks');
    if (job && before && !before.done && after.done) { postMessage(cid, 'job:' + job.id, user.id, `${who} completed “${after.title}”`, [], true); jobHistory(job, user, `Completed task “${after.title}”`); }
    if (job && !before) jobHistory(job, user, `Added task “${after.title}”`);
  }
  if (coll === 'projects' && after.visibility === 'selected') {
    const added = (after.members || []).filter((id) => !(before && before.members || []).includes(id) && id !== user.id);
    notify(cid, added, `${who} added you to project ${after.name}`, '#/project/' + after.id);
  }
  if (coll === 'events') {
    const added = (after.participants || []).filter((id) => !(before && before.participants || []).includes(id) && id !== user.id);
    notify(cid, added, `${who} added you to “${after.title}” on ${after.date}${after.allDay || !after.start ? '' : ' at ' + after.start}`, '#/calendar/' + after.date);
    if (before && (before.date !== after.date || before.start !== after.start || before.startsAt !== after.startsAt)) after.remindedAt = 0;
  }
  if (coll === 'pings' && !before) {
    // pings have their own unread dot; live viewers also get a pop-up via the upsert event
  }
  void c;
}

// ---------------------------------------------------------------- HTTP plumbing
function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new HttpError(413, 'That upload is too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8')); resolve(v && typeof v === 'object' && !Array.isArray(v) ? v : {}); } catch { reject(new HttpError(400, 'Invalid request')); }
    });
    req.on('error', reject);
  });
}
function json(res, code, obj) {
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, SECURITY_HEADERS));
  res.end(JSON.stringify(obj));
}
function clientIp(req) {
  const fwd = TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  return fwd || req.socket.remoteAddress || '';
}
function isHttps(req) { return HOSTED || req.socket.encrypted || (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https'); }
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim(); }
  return out;
}
const COOKIE = 'cd_session';
function setSessionCookie(req, res, token, maxAgeSec) {
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${isHttps(req) ? '; Secure' : ''}`);
}
// A new random session every sign-in (stops session fixation). Only a hash of the token is stored.
function startSession(req, res, user) {
  const token = randomToken();
  db.sessions[sha(token)] = { userId: user.id, createdAt: now(), seen: now(), ip: clientIp(req), ua: str(req.headers['user-agent'], 160) };
  setSessionCookie(req, res, token, Math.round(SESSION_IDLE / 1000));
  save();
}
function currentSession(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token || token.length > 100) return null;
  const key = sha(token); const s = db.sessions[key];
  if (!s) return null;
  if (now() - (s.seen || 0) > SESSION_IDLE || now() - s.createdAt > SESSION_MAX || !db.users[s.userId]) { delete db.sessions[key]; save(); return null; }
  return { key, s, user: db.users[s.userId] };
}
function authUser(req) {
  const cur = currentSession(req);
  if (!cur || !cur.user.verified) throw new HttpError(401, 'Please sign in');
  if (now() - (cur.s.seen || 0) > 60000) { cur.s.seen = now(); save(); }
  return cur;
}
function endSessions(userId, exceptKey) {
  for (const [k, s] of Object.entries(db.sessions)) if (s.userId === userId && k !== exceptKey) delete db.sessions[k];
  for (const st of streams) if (st.userId === userId && !(exceptKey && st.sessionKey === exceptKey)) { send(st.res, { t: 'signedOut' }); try { st.res.end(); } catch (_) {} }
  save();
}
function companyCtx(user, cid) {
  const c = db.companies[cid];
  if (!c || !c.members[user.id]) throw new HttpError(404, 'Company not found');
  return ctxFor(c, user.id);
}

// Rate limits (per IP, and per account where it matters).
const hits = new Map();
function throttle(key, max, windowMs, msg = 'Too many attempts — please wait a few minutes and try again') {
  const t = now(); const e = hits.get(key) || { n: 0, t };
  if (t - e.t > windowMs) { e.n = 0; e.t = t; }
  e.n++; hits.set(key, e);
  if (e.n > max) throw new HttpError(429, msg);
}
setInterval(() => { const t = now(); for (const [k, e] of hits) if (t - e.t > 2 * 3600e3) hits.delete(k); }, 600e3).unref();

// One-time tokens (email verification, password reset). Only the hash is stored.
function makeToken(kind, userId, ttl, extra = {}) {
  for (const [k, t] of Object.entries(db.tokens)) if (t.kind === kind && t.userId === userId) delete db.tokens[k]; // older links stop working
  const token = randomToken();
  db.tokens[sha(token)] = Object.assign({ kind, userId, exp: now() + ttl }, extra);
  save();
  return token;
}
function useToken(kind, token) {
  if (typeof token !== 'string' || token.length > 100) return null;
  const key = sha(token); const t = db.tokens[key];
  if (!t || t.kind !== kind) return null;
  delete db.tokens[key]; save();
  if (t.exp < now() || !db.users[t.userId]) return null;
  return t;
}
async function sendVerify(user) {
  const token = makeToken('verify', user.id, VERIFY_TTL);
  return mail.send(user.email, 'verify', { name: user.name.split(' ')[0], url: `${APP_URL}/#/verify/${token}` });
}

// Account lockout: 5 wrong passwords → 1 hour; the next wrong one after that → 24 hours; then each lockout doubles.
// Tracked by a hash of the email address, for addresses that exist and those that don’t, so the
// responses never reveal which emails have accounts. A successful sign-in or password reset clears it.
function guardFor(email) { const k = sha('guard:' + email); return (db.guard[k] = db.guard[k] || { fails: 0, level: 0, until: 0 }); }
function lockMessage(g) { return `Too many wrong passwords. For your security, sign-in is locked until ${ukTime(g.until)} (UK time). You can unlock it now with “Forgot password”.`; }
function recordFailure(email, user, req) {
  const g = guardFor(email);
  g.fails++; g.lastFail = now();
  let locked = false;
  if (g.level === 0 && g.fails >= MAX_FAILS) { g.level = 1; g.until = now() + LOCK_FIRST; locked = true; }
  else if (g.level >= 1) { g.level++; g.until = now() + Math.min(LOCK_SECOND * 2 ** (g.level - 2), LOCK_MAX); locked = true; }
  if (locked) {
    g.fails = 0;
    secLog('account-locked', { email: user ? email : '(no account)', ip: clientIp(req), level: g.level, until: g.until });
    if (user) mail.send(user.email, 'locked', { name: user.name.split(' ')[0], until: ukTime(g.until), url: `${APP_URL}/#/forgot` });
  } else secLog('login-failed', { email: user ? email : '(no account)', ip: clientIp(req) });
  save();
  return { locked, g };
}
function clearGuard(email) { delete db.guard[sha('guard:' + email)]; save(); }
let DUMMY_HASH = null;

// ---------------------------------------------------------------- invites
function inviteState(inv) {
  if (!inv) return 'missing';
  if (inv.revoked) return 'revoked';
  if (inv.expiresAt && inv.expiresAt < now()) return 'expired';
  if (inv.maxUses && inv.uses >= inv.maxUses) return 'used';
  return 'ok';
}
function findInvite(token) {
  if (typeof token !== 'string' || token.length > 100) return null;
  for (const c of Object.values(db.companies)) for (const inv of Object.values(c.invites || {})) if (inv.token === token) return { c, inv };
  return null;
}
function publicInvite(inv, c) {
  return { id: inv.id, url: `${APP_URL}/#/invite/${inv.token}`, createdBy: inv.createdBy, createdAt: inv.createdAt, expiresAt: inv.expiresAt, maxUses: inv.maxUses,
    uses: inv.uses, email: inv.email, revoked: !!inv.revoked, state: inviteState(inv), company: c.name };
}
function joinCompany(c, user, how) {
  if (c.members[user.id]) return false;
  c.members[user.id] = { role: 'member', joinedAt: now(), via: how };
  save();
  memberEvent(c.id, user);
  postMessage(c.id, 'general', user.id, `${user.name} joined the company 👋`, [], true);
  return true;
}
function acceptInvite(token, user) {
  const f = findInvite(token);
  const st = f ? inviteState(f.inv) : 'missing';
  if (st !== 'ok') bad(st === 'expired' ? 'This invite link has expired. Ask for a new one.' : st === 'used' ? 'This invite link has already been used.' : 'This invite link is no longer valid. Ask for a new one.');
  if (f.inv.email && f.inv.email !== user.email) deny(`This invite is for ${f.inv.email}. Sign in with that email to use it.`);
  if (joinCompany(f.c, user, 'invite')) f.inv.uses++;
  save();
  return f.c;
}

// ---------------------------------------------------------------- API
async function api(req, res, url) {
  const p = url.pathname; const M = req.method; const ip = clientIp(req);
  let m;

  // CSRF protection: every change must come from this site's own pages.
  if (M !== 'GET' && M !== 'HEAD') {
    if (req.headers['x-crewdesk'] !== '1') throw new HttpError(403, 'Request blocked');
    const origin = req.headers.origin;
    if (origin && origin !== 'null') {
      let host = ''; try { host = new URL(origin).host; } catch (_) {}
      if (host !== req.headers.host && host !== new URL(APP_URL).host) throw new HttpError(403, 'Request blocked');
    }
    throttle('w:' + ip, 600, 60e3, 'You’re doing that too fast — slow down a little');
  }

  if (p === '/api/health' && M === 'GET') return json(res, 200, { ok: true, uptime: Math.round(process.uptime()) });
  if (p === '/api/info' && M === 'GET') return json(res, 200, { operator: OPERATOR, supportEmail: SUPPORT_EMAIL, legalVersion: LEGAL_VERSION, emailReady: mail.configured(), passwordMin: passwords.MIN_LENGTH });

  // --- accounts
  if (p === '/api/register' && M === 'POST') {
    throttle('reg:' + ip, 10, 3600e3);
    const b = await readBody(req);
    const email = normEmail(b.email); const name = str(b.name, 80);
    if (!name) bad('Enter your name');
    if (!emailOk(email)) bad('Enter a valid email address');
    if (b.agree !== true) bad('Please agree to the Terms and Privacy Policy to create an account');
    const invite = b.invite ? str(b.invite, 100) : '';
    if (invite) { const f = findInvite(invite); if (!f || inviteState(f.inv) !== 'ok') bad('That invite link is no longer valid. Ask for a new one, or sign up without it.'); }
    const why = await passwords.problem(b.password, [name, ...name.split(/\s+/), email.split('@')[0]]);
    if (why) bad(why, { field: 'password' });
    const existing = userByEmail(email);
    if (existing && existing.verified) {
      // Same answer as a new sign-up, so nobody can find out which emails have accounts.
      throttle('exist:' + email, 3, 3600e3, 'Please check your email');
      mail.send(email, 'existing', { name: existing.name.split(' ')[0], url: APP_URL + '/#/login' });
      secLog('register-existing', { email, ip });
      return json(res, 200, { ok: true, email, emailSent: mail.configured(), emailLogged: !mail.configured() });
    }
    if (existing) { delete db.users[existing.id]; for (const [k, t] of Object.entries(db.tokens)) if (t.userId === existing.id) delete db.tokens[k]; }
    const h = await passwords.hash(b.password);
    const u = { id: uid(), email, name, salt: h.salt, hash: h.hash, kdf: h.kdf, verified: false, title: '', dept: '', phone: '', bio: '', avatar: '', shareLocation: false,
      reads: {}, favs: {}, prefs: { popups: true, desktop: false, sound: false }, privacy: { showPhone: true, showEmail: true, showCompanies: true, profilePublic: false },
      createdAt: now(), lastSeen: 0, agreedAt: now(), agreedVersion: LEGAL_VERSION, pendingInvite: invite };
    db.users[u.id] = u; save();
    const r = await sendVerify(u);
    secLog('registered', { email, ip });
    return json(res, 200, { ok: true, email, emailSent: r.sent || mail.configured(), emailLogged: r.via === 'log' });
  }
  if (p === '/api/verify/resend' && M === 'POST') {
    throttle('resend:' + ip, 6, 3600e3);
    const b = await readBody(req);
    const email = normEmail(b.email);
    throttle('resend-e:' + email, 3, 3600e3, 'We’ve already sent a few emails. Please check your inbox and spam folder, or wait an hour.');
    const u = userByEmail(email);
    if (u && !u.verified) await sendVerify(u);
    return json(res, 200, { ok: true });
  }
  if (p === '/api/verify' && M === 'POST') {
    throttle('verify:' + ip, 30, 3600e3);
    const b = await readBody(req);
    const t = useToken('verify', b.token);
    if (!t) bad('This confirmation link has expired or was already used. Sign in to get a new one.');
    const u = db.users[t.userId];
    u.verified = true; u.verifiedAt = now();
    let joined = null;
    if (u.pendingInvite) { try { joined = acceptInvite(u.pendingInvite, u).id; } catch (e) { console.warn('Invite on verify:', e.message); } u.pendingInvite = ''; }
    startSession(req, res, u);
    secLog('verified', { email: u.email, ip });
    return json(res, 200, { user: meUser(u), companies: companiesFor(u.id), joined });
  }
  if (p === '/api/login' && M === 'POST') {
    throttle('login:' + ip, 40, 15 * 60e3);
    const b = await readBody(req);
    const email = normEmail(b.email);
    const g = guardFor(email);
    if (g.until > now()) { secLog('login-while-locked', { email, ip }); throw new HttpError(423, lockMessage(g), { locked: true, until: g.until }); }
    const u = userByEmail(email);
    if (!DUMMY_HASH) DUMMY_HASH = await passwords.hash('timing-equaliser-' + randomToken());
    const ok = await passwords.verify(b.password, u || DUMMY_HASH); // same work whether or not the account exists
    if (!u || !ok) {
      const f = recordFailure(email, u, req);
      if (f.locked) throw new HttpError(423, lockMessage(f.g), { locked: true, until: f.g.until });
      const left = MAX_FAILS - f.g.fails;
      bad(f.g.level === 0 && left <= 2 ? `Email or password is wrong. ${left} ${left === 1 ? 'try' : 'tries'} left before sign-in is locked for an hour.` : 'Email or password is wrong');
    }
    if (!u.verified) throw new HttpError(403, 'Please confirm your email first. We can send the link again.', { needVerify: true, email });
    clearGuard(email);
    if (passwords.needsRehash(u)) Object.assign(u, await passwords.hash(b.password));
    startSession(req, res, u);
    secLog('login', { email, ip });
    return json(res, 200, { user: meUser(u), companies: companiesFor(u.id) });
  }
  if (p === '/api/password/forgot' && M === 'POST') {
    throttle('forgot:' + ip, 8, 3600e3);
    const b = await readBody(req);
    const email = normEmail(b.email);
    if (!emailOk(email)) bad('Enter a valid email address');
    const u = userByEmail(email);
    // Chosen by the owner: say clearly when an email has no account (the per-IP limit above stops mass checking).
    if (!u) { secLog('reset-no-account', { email, ip }); throw new HttpError(404, 'There’s no account for this email yet. Check it’s spelt right, or create an account.', { noAccount: true }); }
    throttle('forgot-e:' + email, 3, 3600e3, 'We’ve already sent a few reset emails. Check your inbox and spam folder, or try again in an hour.');
    const token = makeToken('reset', u.id, RESET_TTL);
    const r = await mail.send(u.email, 'reset', { name: u.name.split(' ')[0], url: `${APP_URL}/#/reset/${token}` });
    secLog('reset-requested', { email, ip, sent: r.sent });
    if (!r.sent && r.via !== 'log') throw new HttpError(502, 'We couldn’t send the email just now. Please try again in a few minutes.');
    return json(res, 200, { ok: true });
  }
  if (p === '/api/password/reset' && M === 'POST') {
    throttle('reset:' + ip, 20, 3600e3);
    const b = await readBody(req);
    const key = typeof b.token === 'string' ? sha(b.token) : '';
    const pending = db.tokens[key];
    if (!pending || pending.kind !== 'reset' || pending.exp < now() || !db.users[pending.userId]) bad('This reset link has expired or was already used. Ask for a new one.');
    const u = db.users[pending.userId];
    const why = await passwords.problem(b.password, [u.name, ...u.name.split(/\s+/), u.email.split('@')[0]]);
    if (why) bad(why, { field: 'password' });
    if (!useToken('reset', b.token)) bad('This reset link has expired or was already used. Ask for a new one.');
    Object.assign(u, await passwords.hash(b.password));
    u.verified = true; // they proved they own the email
    endSessions(u.id);
    clearGuard(u.email);
    secLog('reset-done', { email: u.email, ip });
    mail.send(u.email, 'changed', { name: u.name.split(' ')[0], url: `${APP_URL}/#/forgot` });
    save();
    return json(res, 200, { ok: true });
  }
  if ((m = /^\/api\/invite\/([A-Za-z0-9_-]{10,100})$/.exec(p)) && M === 'GET') {
    throttle('inv:' + ip, 60, 600e3);
    const f = findInvite(m[1]);
    const st = f ? inviteState(f.inv) : 'missing';
    if (st !== 'ok') return json(res, 200, { valid: false, reason: st });
    return json(res, 200, { valid: true, company: f.c.name, inviter: (db.users[f.inv.createdBy] || {}).name || '', email: f.inv.email || '' });
  }
  if (p === '/api/stream' && M === 'GET') return stream(req, res, url);

  // ---------------- signed-in only below
  const cur = authUser(req); const user = cur.user;
  throttle('u:' + user.id + ':' + M, M === 'GET' ? 2000 : 400, 60e3, 'You’re doing that too fast — slow down a little');

  if (p === '/api/logout' && M === 'POST') { delete db.sessions[cur.key]; setSessionCookie(req, res, '', 0); save(); return json(res, 200, { ok: true }); }
  if (p === '/api/logout-others' && M === 'POST') { endSessions(user.id, cur.key); return json(res, 200, { ok: true }); }
  if (p === '/api/me' && M === 'GET') return json(res, 200, { user: meUser(user), companies: companiesFor(user.id), requests: myRequests(user.id), sessions: Object.values(db.sessions).filter((s) => s.userId === user.id).length });

  // --- someone's profile: people in your companies, or anyone who has made their profile public
  if ((m = /^\/api\/people\/([A-Za-z0-9]+)$/.exec(p)) && M === 'GET') {
    throttle('people:' + user.id, 120, 60e3);
    const u = db.users[m[1]];
    if (!u || u.deleted) notFound('That profile isn’t available');
    if (u.id === user.id || sharesCompany(user.id, u.id)) return json(res, 200, { person: Object.assign(publicUser(u, user.id), { companies: profileCompanies(u, user.id), outside: false }) });
    if (!(u.privacy && u.privacy.profilePublic)) notFound('This profile is private');
    return json(res, 200, { person: outsideProfile(u, user.id) });
  }
  // --- company directory: public companies can be found by anyone signed in, and asked to join
  if (p === '/api/directory' && M === 'GET') {
    throttle('dir:' + user.id, 120, 60e3);
    const q = str(url.searchParams.get('q'), 80).toLowerCase();
    let list = Object.values(db.companies).filter((c) => c.profile && c.profile.visibility === 'public');
    if (q) list = list.filter((c) => [c.name, c.profile.description, c.profile.location, c.profile.industry].join(' ').toLowerCase().includes(q));
    list.sort((a, b) => Object.keys(b.members).length - Object.keys(a.members).length || a.name.localeCompare(b.name));
    return json(res, 200, { items: list.slice(0, 60).map((c) => directoryCard(c, user.id)), total: list.length });
  }
  if ((m = /^\/api\/directory\/([A-Za-z0-9]+)$/.exec(p)) && M === 'GET') {
    const c = db.companies[m[1]];
    if (!c || !(c.members[user.id] || (c.profile && c.profile.visibility === 'public'))) notFound('That company isn’t listed');
    return json(res, 200, { company: directoryCard(c, user.id, true) });
  }
  if ((m = /^\/api\/directory\/([A-Za-z0-9]+)\/request$/.exec(p)) && (M === 'POST' || M === 'DELETE')) {
    const c = db.companies[m[1]];
    if (!c || !(c.profile && c.profile.visibility === 'public')) notFound('That company isn’t listed');
    c.requests = c.requests || {};
    if (M === 'DELETE') { delete c.requests[user.id]; save(); broadcastAdmins(c, { t: 'reload' }); return json(res, 200, { company: directoryCard(c, user.id) }); }
    if (c.members[user.id]) bad('You’re already in this company');
    throttle('req:' + user.id, 10, 24 * 3600e3, 'You’ve sent a lot of join requests today — try again tomorrow');
    const b = await readBody(req);
    c.requests[user.id] = { userId: user.id, at: now(), message: str(b.message, 500) };
    save();
    const admins = Object.keys(c.members).filter((id) => isAdmin(c.members[id].role));
    notify(c.id, admins, `${user.name} asked to join ${c.name}`, '#/settings/requests');
    broadcastAdmins(c, { t: 'reload' });
    const owner = db.users[c.ownerId];
    if (owner) mail.send(owner.email, 'joinRequest', { name: owner.name.split(' ')[0], who: user.name, company: c.name, message: c.requests[user.id].message, url: `${APP_URL}/#/settings/requests` });
    secLog('join-requested', { company: c.id, user: user.id });
    return json(res, 200, { company: directoryCard(c, user.id) });
  }
  if (p === '/api/me' && M === 'PUT') {
    const b = await readBody(req, 2 * 1024 * 1024);
    if ('name' in b) user.name = str(b.name, 80) || bad('Name can’t be empty');
    for (const k of ['title', 'dept', 'phone']) if (k in b) user[k] = str(b[k], 80);
    if ('bio' in b) user.bio = str(b.bio, 500);
    if ('avatar' in b) {
      const old = user.avatar;
      user.avatar = b.avatar ? await saveImage(b.avatar, 1024 * 1024, { kind: 'avatar', owner: user.id }) : '';
      if (old !== user.avatar) dropFile(old);
    }
    if (b.prefs && typeof b.prefs === 'object') for (const k of ['popups', 'desktop', 'sound']) if (k in b.prefs) user.prefs[k] = !!b.prefs[k];
    if (b.privacy && typeof b.privacy === 'object') for (const k of ['showPhone', 'showEmail', 'showCompanies', 'profilePublic']) if (k in b.privacy) user.privacy[k] = !!b.privacy[k];
    if ('shareLocation' in b) {
      user.shareLocation = !!b.shareLocation;
      if (!user.shareLocation) { delete db.locations[user.id]; broadcastUser(user.id, { t: 'loc', userId: user.id, loc: null }); }
    }
    if (b.newPassword) {
      throttle('pwchange:' + user.id, 10, 3600e3);
      if (!(await passwords.verify(b.currentPassword, user))) bad('Your current password is wrong', { field: 'currentPassword' });
      const why = await passwords.problem(b.newPassword, [user.name, ...user.name.split(/\s+/), user.email.split('@')[0]]);
      if (why) bad(why, { field: 'newPassword' });
      Object.assign(user, await passwords.hash(b.newPassword));
      endSessions(user.id, cur.key); // sign out everywhere else
      secLog('password-changed', { email: user.email, ip });
      mail.send(user.email, 'changed', { name: user.name.split(' ')[0], url: `${APP_URL}/#/forgot` });
    }
    save();
    for (const c of Object.values(db.companies)) if (c.members[user.id]) memberEvent(c.id, user);
    return json(res, 200, { user: meUser(user) });
  }
  if (p === '/api/me/export' && M === 'GET') {
    const out = { exportedAt: new Date().toISOString(), profile: Object.assign(meUser(user), { agreedAt: user.agreedAt }), location: db.locations[user.id] || null, companies: [] };
    for (const c of Object.values(db.companies)) {
      if (!c.members[user.id]) continue;
      const d = cdata(c.id); const mine = [];
      for (const [ch, arr] of Object.entries(d.messages)) for (const msg of arr) if (msg.userId === user.id && !msg.system) mine.push({ channel: ch, at: new Date(msg.at).toISOString(), text: msg.text, photos: msgImages(msg) });
      out.companies.push({ name: c.name, role: c.members[user.id].role, joinedAt: new Date(c.members[user.id].joinedAt).toISOString(), messages: mine,
        pings: Object.values(d.pings).filter((x) => x.createdBy === user.id).map((x) => ({ title: x.title, body: x.body, at: new Date(x.createdAt).toISOString() })),
        events: Object.values(d.events).filter((x) => x.createdBy === user.id).map((x) => ({ title: x.title, date: x.date, description: x.description })),
        photos: Object.values(d.photos).filter((ph) => ph.createdBy === user.id).map((ph) => ({ url: ph.url, caption: ph.caption, at: new Date(ph.createdAt).toISOString() })),
        notifications: (d.inbox[user.id] || []).map((n) => ({ text: n.text, at: new Date(n.at).toISOString() })) });
    }
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="crewdesk-my-data.json"', 'Cache-Control': 'no-store' }, SECURITY_HEADERS));
    return res.end(JSON.stringify(out, null, 2));
  }
  if (p === '/api/me' && M === 'DELETE') {
    throttle('del:' + user.id, 10, 3600e3);
    const b = await readBody(req);
    if (!(await passwords.verify(b.password, user))) bad('Password is wrong');
    const blocking = Object.values(db.companies).filter((c) => c.members[user.id] && c.members[user.id].role === 'owner' && Object.keys(c.members).length > 1);
    if (blocking.length) bad(`You own ${blocking.map((c) => c.name).join(', ')}. Make someone else the owner (Team page) or delete the company first.`);
    for (const c of Object.values(db.companies)) {
      if (!c.members[user.id]) continue;
      if (Object.keys(c.members).length === 1) { broadcast(c.id, { t: 'kicked', cid: c.id }); dropCompanyFiles(c.id); delete db.companies[c.id]; delete db.data[c.id]; }
      else removeMemberData(c, user.id);
    }
    dropFile(user.avatar);
    endSessions(user.id);
    delete db.locations[user.id]; delete db.users[user.id];
    for (const [k, t] of Object.entries(db.tokens)) if (t.userId === user.id) delete db.tokens[k];
    secLog('account-deleted', { ip });
    save();
    setSessionCookie(req, res, '', 0);
    return json(res, 200, { ok: true });
  }
  if (p === '/api/me/location' && M === 'POST') {
    if (!user.shareLocation) bad('Location sharing is off');
    const b = await readBody(req);
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) bad('Bad coordinates');
    const loc = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, acc: Math.min(100000, Math.round(Number(b.acc) || 0)), at: now() };
    db.locations[user.id] = loc; save();
    broadcastUser(user.id, { t: 'loc', userId: user.id, loc });
    return json(res, 200, { ok: true });
  }

  // --- companies
  if (p === '/api/companies' && M === 'POST') {
    throttle('newco:' + user.id, 10, 3600e3);
    const b = await readBody(req);
    const name = str(b.name, 80) || bad('Give your company a name');
    const jp = String(b.password || '');
    if (jp.length < 6) bad('The join password must be at least 6 characters');
    const h = await passwords.hash(jp);
    const c = { id: uid(), name, code: companyCode(), joinSalt: h.salt, joinHash: h.hash, joinKdf: h.kdf, ownerId: user.id, createdAt: now(), jobSeq: 0,
      settings: Object.assign({}, DEFAULT_SETTINGS), invites: {}, members: { [user.id]: { role: 'owner', joinedAt: now() } } };
    db.companies[c.id] = c; cdata(c.id);
    postMessage(c.id, 'general', user.id, `${user.name} created ${c.name}. Welcome to the company chat!`, [], true);
    save();
    return json(res, 200, { company: { id: c.id, name: c.name, role: 'owner' }, companies: companiesFor(user.id) });
  }
  if (p === '/api/companies/join' && M === 'POST') {
    throttle('join:' + ip, 20, 600e3); throttle('join-u:' + user.id, 20, 3600e3);
    const b = await readBody(req);
    const code = str(b.code, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const c = Object.values(db.companies).find((x) => x.code === code);
    const ok = c && c.settings.allowCodeJoin && await passwords.verify(b.password, { salt: c.joinSalt, hash: c.joinHash, kdf: c.joinKdf });
    if (!ok) { secLog('join-failed', { ip, user: user.id }); bad('Company code or join password is wrong'); }
    joinCompany(c, user, 'code');
    return json(res, 200, { company: { id: c.id, name: c.name, role: c.members[user.id].role }, companies: companiesFor(user.id) });
  }
  if ((m = /^\/api\/invite\/([A-Za-z0-9_-]{10,100})\/accept$/.exec(p)) && M === 'POST') {
    throttle('inv-acc:' + user.id, 20, 3600e3);
    const c = acceptInvite(m[1], user);
    return json(res, 200, { company: { id: c.id, name: c.name, role: c.members[user.id].role }, companies: companiesFor(user.id) });
  }

  if ((m = /^\/api\/c\/([A-Za-z0-9]+)(\/.*)?$/.exec(p))) return companyApi(req, res, url, user, m[1], m[2] || '', cur);
  notFound('Not found');
}

function removeMemberData(c, id) {
  delete c.members[id];
  const d = cdata(c.id);
  for (const t of Object.values(d.teams)) t.members = (t.members || []).filter((x) => x !== id);
  for (const p of Object.values(d.projects)) p.members = (p.members || []).filter((x) => x !== id);
  for (const j of Object.values(d.jobs)) { j.viewers = (j.viewers || []).filter((x) => x !== id); j.assignees = (j.assignees || []).filter((x) => x !== id); }
  for (const ch of Object.values(d.chats)) ch.members = ch.members.filter((x) => x !== id);
  delete d.inbox[id];
  const u = db.users[id]; if (u) { delete u.favs[c.id]; delete u.reads[c.id]; }
  broadcast(c.id, { t: 'memberRemoved', id });
  for (const s of streams) if (s.cid === c.id && s.userId === id) send(s.res, { t: 'kicked', cid: c.id });
  broadcast(c.id, { t: 'reload' });
}

async function companyApi(req, res, url, user, cid, sub, cur) {
  const M = req.method; let m;
  const x = companyCtx(user, cid); const { c, role, d } = x;

  if (sub === '/state' && M === 'GET') {
    const locs = {};
    for (const id of Object.keys(c.members)) if (db.users[id] && db.users[id].shareLocation && db.locations[id] && now() - db.locations[id].at < LOCATION_MAX_AGE) locs[id] = db.locations[id];
    const invites = isAdmin(role) || c.settings.membersInvite
      ? Object.values(c.invites).filter((i) => isAdmin(role) || i.createdBy === user.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50).map((i) => publicInvite(i, c)) : [];
    return json(res, 200, Object.assign({ company: publicCompany(c, role), role, me: meUser(user), members: memberList(c, user.id), locations: locs,
      favs: user.favs[cid] || { jobs: [], projects: [] }, inbox: (d.inbox[user.id] || []).slice(-100), invites }, stateFor(x), unreadFor(x)));
  }
  if (sub === '' && M === 'PATCH') {
    if (!isAdmin(role)) deny();
    const b = await readBody(req, 8 * 1024 * 1024);
    if ('name' in b) c.name = str(b.name, 80) || bad('Name can’t be empty');
    if ('banner' in b) { // company banner shown in the top bar
      const old = c.banner;
      c.banner = b.banner ? await saveImage(b.banner, 4 * 1024 * 1024, { kind: 'banner', cid: c.id }) : '';
      if (old && old !== c.banner) dropFile(old);
    }
    if ('bannerPos' in b) c.bannerPos = Math.max(0, Math.min(100, Math.round(Number(b.bannerPos) || 0)));
    if ('logo' in b) { // company profile picture
      const old = c.logo;
      c.logo = b.logo ? await saveImage(b.logo, 1024 * 1024, { kind: 'logo', cid: c.id }) : '';
      if (old && old !== c.logo) dropFile(old);
    }
    if (b.profile && typeof b.profile === 'object') {
      c.profile = c.profile || { visibility: 'private' };
      if ('description' in b.profile) c.profile.description = str(b.profile.description, 2000);
      if ('location' in b.profile) c.profile.location = str(b.profile.location, 100);
      if ('industry' in b.profile) c.profile.industry = str(b.profile.industry, 60);
      if ('website' in b.profile) { const w = str(b.profile.website, 200); c.profile.website = !w || /^https?:\/\/[^\s<>"]+$/i.test(w) ? w : bad('The website must start with https://'); }
      if ('visibility' in b.profile) c.profile.visibility = b.profile.visibility === 'public' ? 'public' : 'private';
    }
    if (b.settings && typeof b.settings === 'object') {
      for (const k of ['membersSeeMoney', 'membersCreateJobs', 'membersCreateProjects', 'membersInvite', 'membersPing', 'allowCodeJoin']) if (k in b.settings) c.settings[k] = !!b.settings[k];
      if ('currency' in b.settings) c.settings.currency = str(b.settings.currency, 3) || '£';
    }
    if (b.password) {
      if (String(b.password).length < 6) bad('The join password must be at least 6 characters');
      const h = await passwords.hash(b.password); c.joinSalt = h.salt; c.joinHash = h.hash; c.joinKdf = h.kdf;
    }
    if (b.newCode) c.code = companyCode();
    save(); broadcast(cid, { t: 'reload' });
    return json(res, 200, { company: publicCompany(c, role) });
  }
  if (sub === '' && M === 'DELETE') {
    if (role !== 'owner') deny('Only the owner can delete the company');
    const b = await readBody(req);
    if (!(await passwords.verify(b.password, user))) bad('Password is wrong');
    broadcast(cid, { t: 'kicked', cid });
    dropCompanyFiles(cid);
    delete db.companies[cid]; delete db.data[cid];
    for (const u of Object.values(db.users)) { if (u.favs) delete u.favs[cid]; if (u.reads) delete u.reads[cid]; }
    save();
    return json(res, 200, { ok: true, companies: companiesFor(user.id) });
  }
  if (sub === '/leave' && M === 'POST') {
    if (role === 'owner') bad('Owners can’t leave — make someone else the owner first, or delete the company');
    removeMemberData(c, user.id); save();
    return json(res, 200, { ok: true, companies: companiesFor(user.id) });
  }
  if ((m = /^\/members\/([A-Za-z0-9]+)$/.exec(sub))) {
    const target = m[1];
    if (!c.members[target]) notFound('That person isn’t in this company');
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
      removeMemberData(c, target); save();
      return json(res, 200, { ok: true });
    }
  }
  if ((m = /^\/teams\/([A-Za-z0-9]+)\/(join|leave)$/.exec(sub)) && M === 'POST') {
    const t = d.teams[m[1]] || notFound('Team not found');
    t.members = (t.members || []).filter((id) => id !== user.id);
    if (m[2] === 'join') t.members.push(user.id);
    save(); upsert(cid, 'teams', t);
    return json(res, 200, { item: t });
  }

  // --- join requests from the directory (admins accept or decline)
  if ((m = /^\/requests\/([A-Za-z0-9]+)$/.exec(sub)) && M === 'POST') {
    if (!isAdmin(role)) deny('Only admins can answer join requests');
    c.requests = c.requests || {};
    const rq = c.requests[m[1]]; const who = db.users[m[1]];
    if (!rq || !who) notFound('That request was already answered');
    const b = await readBody(req);
    delete c.requests[m[1]];
    if (b.accept) {
      joinCompany(c, who, 'request');
      mail.send(who.email, 'requestAccepted', { name: who.name.split(' ')[0], company: c.name, url: `${APP_URL}/#/home` });
    }
    save(); broadcastAdmins(c, { t: 'reload' });
    return json(res, 200, { ok: true, accepted: !!b.accept });
  }

  // --- invites
  if (sub === '/invites' && M === 'POST') {
    if (!(isAdmin(role) || c.settings.membersInvite)) deny('Only admins can invite people');
    throttle('mkinv:' + user.id, 30, 3600e3);
    const b = await readBody(req);
    const days = [1, 7, 30, 0].includes(Number(b.days)) ? Number(b.days) : 7;
    const email = b.email ? normEmail(b.email) : '';
    if (email && !emailOk(email)) bad('That email address doesn’t look right');
    const inv = { id: uid(), token: crypto.randomBytes(24).toString('base64url'), createdBy: user.id, createdAt: now(), expiresAt: days ? now() + days * 864e5 : 0,
      maxUses: email ? 1 : Math.max(0, Math.min(500, Math.round(Number(b.maxUses) || 0))), uses: 0, email, revoked: false };
    c.invites[inv.id] = inv; save();
    const out = publicInvite(inv, c);
    let emailed = false;
    if (email) {
      const r = await mail.send(email, 'invite', { inviter: user.name, company: c.name, url: out.url, expires: inv.expiresAt ? ukTime(inv.expiresAt) : '' });
      emailed = r.sent;
    }
    return json(res, 200, { invite: out, emailed });
  }
  if ((m = /^\/invites\/([A-Za-z0-9]+)$/.exec(sub)) && M === 'DELETE') {
    const inv = c.invites[m[1]] || notFound('Invite not found');
    if (!(isAdmin(role) || inv.createdBy === user.id)) deny();
    inv.revoked = true; save();
    return json(res, 200, { invite: publicInvite(inv, c) });
  }

  // --- favourites (personal, never shared)
  if (sub === '/favs' && M === 'POST') {
    const b = await readBody(req);
    const kind = b.kind === 'projects' ? 'projects' : 'jobs';
    const item = d[kind][b.id];
    if (!item || !viewFor(kind, item, x)) notFound();
    const f = user.favs[cid] = user.favs[cid] || { jobs: [], projects: [] };
    f[kind] = (f[kind] || []).filter((id) => id !== item.id && d[kind][id]);
    if (b.on) f[kind].unshift(item.id);
    save();
    return json(res, 200, { favs: f });
  }

  // --- personal notifications
  if (sub === '/inbox/read' && M === 'POST') {
    const b = await readBody(req);
    const box = d.inbox[user.id] || [];
    const ids = Array.isArray(b.ids) ? b.ids.map(String) : null;
    for (const n of box) if (!ids || ids.includes(n.id)) n.read = true;
    save();
    return json(res, 200, { ok: true });
  }
  if (sub === '/inbox' && M === 'DELETE') { d.inbox[user.id] = []; save(); return json(res, 200, { ok: true }); }

  // --- chats (direct and group)
  if (sub === '/chats' && M === 'POST') {
    throttle('mkchat:' + user.id, 60, 3600e3);
    const b = await readBody(req);
    const others = memberIds(c, b.members, 60).filter((id) => id !== user.id);
    if (!others.length) bad('Pick at least one person');
    if (b.kind === 'dm' || others.length === 1 && !str(b.name)) {
      if (others.length !== 1) bad('A direct message is between two people');
      const pair = [user.id, others[0]].sort();
      const existing = Object.values(d.chats).find((ch) => ch.kind === 'dm' && ch.members.length === 2 && ch.members.slice().sort().join() === pair.join());
      if (existing) return json(res, 200, { item: existing });
      const ch = { id: uid(), kind: 'dm', name: '', members: pair, createdBy: user.id, createdAt: now() };
      d.chats[ch.id] = ch; save(); upsert(cid, 'chats', ch);
      return json(res, 200, { item: ch });
    }
    const name = str(b.name, 80) || bad('Give the group a name');
    const ch = { id: uid(), kind: 'group', name, members: [user.id, ...others], createdBy: user.id, createdAt: now() };
    d.chats[ch.id] = ch; save(); upsert(cid, 'chats', ch);
    postMessage(cid, 'chat:' + ch.id, user.id, `${user.name.split(' ')[0]} created the group “${name}”`, [], true);
    notify(cid, others, `${user.name.split(' ')[0]} added you to the group chat “${name}”`, '#/chat/chat:' + ch.id);
    return json(res, 200, { item: ch });
  }
  if ((m = /^\/chats\/([A-Za-z0-9]+)(\/leave)?$/.exec(sub))) {
    const ch = d.chats[m[1]];
    if (!ch || !ch.members.includes(user.id)) notFound('Chat not found');
    const manage = ch.createdBy === user.id || isAdmin(role);
    if (m[2] && M === 'POST') {
      if (ch.kind === 'dm') bad('You can’t leave a direct message');
      ch.members = ch.members.filter((id) => id !== user.id); save();
      postMessage(cid, 'chat:' + ch.id, user.id, `${user.name.split(' ')[0]} left the group`, [], true);
      broadcast(cid, { t: 'remove', coll: 'chats', id: ch.id }, { only: [user.id] }); upsert(cid, 'chats', ch);
      return json(res, 200, { ok: true });
    }
    if (!m[2] && M === 'PATCH') {
      if (ch.kind === 'dm') bad('Direct messages can’t be changed');
      if (!manage) deny('Only the person who made this group, or an admin, can change it');
      const b = await readBody(req);
      const before = ch.members.slice();
      if ('name' in b) ch.name = str(b.name, 80) || bad('Give the group a name');
      if ('members' in b) { ch.members = [...new Set([user.id, ...memberIds(c, b.members, 60)])]; }
      save();
      const added = ch.members.filter((id) => !before.includes(id)); const removed = before.filter((id) => !ch.members.includes(id));
      if (added.length) { postMessage(cid, 'chat:' + ch.id, user.id, `${user.name.split(' ')[0]} added ${added.map((id) => db.users[id].name.split(' ')[0]).join(', ')}`, [], true); notify(cid, added, `${user.name.split(' ')[0]} added you to the group chat “${ch.name}”`, '#/chat/chat:' + ch.id); }
      if (removed.length) { postMessage(cid, 'chat:' + ch.id, user.id, `${user.name.split(' ')[0]} removed ${removed.map((id) => (db.users[id] || {}).name || 'someone').join(', ')}`, [], true); broadcast(cid, { t: 'remove', coll: 'chats', id: ch.id }, { only: removed }); }
      upsert(cid, 'chats', ch);
      return json(res, 200, { item: ch });
    }
    if (!m[2] && M === 'DELETE') {
      if (ch.kind === 'dm' || !manage) deny('Only the person who made this group, or an admin, can delete it');
      const members = ch.members.slice();
      delete d.chats[ch.id]; dropMessageFiles(d.messages['chat:' + ch.id]); delete d.messages['chat:' + ch.id]; save();
      broadcast(cid, { t: 'remove', coll: 'chats', id: ch.id }, { only: members });
      return json(res, 200, { ok: true });
    }
  }

  // --- messages
  if (sub === '/messages' && M === 'GET') {
    const ch = url.searchParams.get('channel');
    if (!canSeeChannel(x, ch)) notFound('Chat not found');
    const all = d.messages[ch] || [];
    const before = Number(url.searchParams.get('before')) || Infinity;
    const older = all.filter((msg) => msg.at < before);
    return json(res, 200, { items: older.slice(-60), more: older.length > 60 });
  }
  if (sub === '/messages' && M === 'POST') {
    const b = await readBody(req, 30 * 1024 * 1024);
    if (!canSeeChannel(x, b.channel)) notFound('Chat not found');
    throttle('msg:' + user.id, 120, 60e3, 'You’re sending messages too fast');
    const raw = Array.isArray(b.images) ? b.images : [];
    if (raw.length > 6) bad('You can send up to 6 photos at once');
    const images = [];
    for (const img of raw) images.push(await saveImage(img, 4 * 1024 * 1024, { kind: 'msg', cid, ch: b.channel }));
    if (!str(b.text) && !images.length) bad('Message is empty');
    const msg = postMessage(cid, b.channel, user.id, b.text, images);
    markRead(user, cid, b.channel, msg.at);
    const ch = /^chat:(.+)$/.exec(b.channel);
    if (ch && d.chats[ch[1]] && d.chats[ch[1]].kind === 'dm') { /* the live 'msg' event already alerts the other person */ }
    return json(res, 200, { item: msg });
  }
  if (sub === '/typing' && M === 'POST') { // "… is typing" — sent live to others who can see the chat, never stored
    const b = await readBody(req);
    const ch = str(b.channel, 80);
    if (!canSeeChannel(x, ch)) notFound('Chat not found');
    throttle('typing:' + user.id, 60, 60e3, 'Slow down');
    const on = b.on !== false;
    broadcast(cid, (y) => (y.uid !== user.id && canSeeChannel(y, ch) ? { t: 'typing', channel: ch, userId: user.id, on } : null));
    return json(res, 200, { ok: true });
  }
  if (sub === '/read' && M === 'POST') {
    const b = await readBody(req);
    const ch = str(b.channel, 80);
    if (canSeeChannel(x, ch)) markRead(user, cid, ch, now());
    return json(res, 200, { ok: true });
  }

  // --- job photos
  if (sub === '/photos' && M === 'POST') {
    const b = await readBody(req, 14 * 1024 * 1024);
    const job = d.jobs[b.jobId];
    if (!job || !canSeeJob(x, job)) bad('That job no longer exists');
    const ref = { kind: 'photo', cid, job: job.id };
    const urlFull = await saveImage(b.image, 7 * 1024 * 1024, ref);
    const thumb = b.thumb ? await saveImage(b.thumb, 700 * 1024, ref) : urlFull;
    const item = { id: uid(), jobId: job.id, url: urlFull, thumb, caption: str(b.caption, 300), w: Math.round(Number(b.w) || 0), h: Math.round(Number(b.h) || 0),
      takenAt: Number(b.takenAt) || 0, createdBy: user.id, createdAt: now() };
    d.photos[item.id] = item; save();
    upsert(cid, 'photos', item);
    notePhotoAdded(cid, job.id, user);
    return json(res, 200, { item });
  }
  if ((m = /^\/photos\/([A-Za-z0-9]+)$/.exec(sub))) {
    const ph = d.photos[m[1]];
    if (!ph || !canSeeJob(x, d.jobs[ph.jobId])) notFound('That photo was already deleted');
    if (!(isAdmin(role) || ph.createdBy === user.id)) deny('Only the person who added it, or an admin, can change this photo');
    if (M === 'PATCH') { const b = await readBody(req); if ('caption' in b) ph.caption = str(b.caption, 300); save(); upsert(cid, 'photos', ph); return json(res, 200, { item: ph }); }
    if (M === 'DELETE') { delete d.photos[ph.id]; dropFile(ph.url); if (ph.thumb !== ph.url) dropFile(ph.thumb); save(); removeItem(cid, 'photos', ph.id); return json(res, 200, { ok: true }); }
  }

  // --- attachments (images and documents for pings)
  if (sub === '/files' && M === 'POST') {
    throttle('file:' + user.id, 120, 3600e3, 'You’ve uploaded a lot of files — wait a while and try again');
    const b = await readBody(req, 24 * 1024 * 1024);
    const name = str(b.name, 120).replace(/[\\/:*?"<>|]+/g, '_') || 'file';
    const buf = decodeData(b.data);
    const id = uid();
    let meta;
    const imgType = sniffImage(buf);
    if (imgType && imgType !== 'image/gif') {
      if (buf.length > 8 * 1024 * 1024) bad('Images can be up to 8 MB');
      const ref = { kind: 'file', cid, fileId: id };
      const fileName = uid(18) + '.' + IMAGE_TYPES[imgType];
      await storage.putFile(fileName, imgType, buf); db.fileIndex[fileName] = ref;
      const thumb = b.thumb ? await saveImage(b.thumb, 400 * 1024, ref) : '/uploads/' + fileName;
      meta = { id, kind: 'image', name, type: imgType, size: buf.length, url: '/uploads/' + fileName, thumb, w: Math.round(Number(b.w) || 0), h: Math.round(Number(b.h) || 0) };
    } else {
      const ext = (/\.([a-z0-9]{2,5})$/i.exec(name) || [])[1];
      const e = ext && ext.toLowerCase();
      if (!e || !DOC_TYPES[e]) bad('That file type isn’t allowed. You can attach photos, PDFs, Word, Excel, PowerPoint, text and CSV files.');
      if (buf.length > 15 * 1024 * 1024) bad('Documents can be up to 15 MB');
      if (!docOk(e, buf)) bad('That file doesn’t match its type, so it was refused');
      const fileName = uid(18) + '.' + e;
      await storage.putFile(fileName, DOC_TYPES[e], buf); db.fileIndex[fileName] = { kind: 'file', cid, fileId: id };
      meta = { id, kind: 'doc', name, type: DOC_TYPES[e], ext: e, size: buf.length, url: '/uploads/' + fileName };
    }
    d.files[id] = Object.assign(meta, { by: user.id, at: now(), status: 'pending', scope: null });
    save();
    return json(res, 200, { file: publicFile(d.files[id]) });
  }

  // --- pings
  if ((m = /^\/pings\/([A-Za-z0-9]+)\/read$/.exec(sub)) && M === 'POST') {
    const pg = d.pings[m[1]] || notFound('That ping was deleted');
    pg.readBy = pg.readBy || {};
    if (!pg.readBy[user.id]) { pg.readBy[user.id] = now(); save(); }
    return json(res, 200, { item: shapePing(pg, x) });
  }
  if (sub === '/pings/read-all' && M === 'POST') {
    for (const pg of Object.values(d.pings)) { pg.readBy = pg.readBy || {}; if (!pg.readBy[user.id]) pg.readBy[user.id] = now(); }
    save();
    return json(res, 200, { ok: true });
  }

  // --- finance helper: turn completed jobs into income and cost records
  if (sub === '/finance/import-jobs' && M === 'POST') {
    if (!isAdmin(role)) deny();
    let added = 0;
    for (const j of Object.values(d.jobs)) {
      if (j.status !== 'done') continue;
      const day = new Date(j.completedAt || j.updatedAt || j.createdAt).toISOString().slice(0, 10);
      const has = (type) => Object.values(d.finance).some((f) => f.jobId === j.id && f.source === 'job-' + type);
      const mk = (type, amount, category, desc) => {
        const it = Object.assign(RULES.finance.defaults(), { id: uid(), date: day, type, amount, category, description: desc, jobId: j.id, clientId: j.clientId || '', source: 'job-' + type, createdBy: user.id, createdAt: now(), updatedAt: now() });
        d.finance[it.id] = it; upsert(cid, 'finance', it); added++;
      };
      if (Number(j.price) > 0 && !has('income')) mk('income', num(j.price), 'Jobs', `${j.ref} ${j.title}`);
      const costs = (j.costs || []).reduce((a, k) => a + (Number(k.amount) || 0), 0);
      if (costs > 0 && !has('expense')) mk('expense', num(costs), 'Job costs', `${j.ref} ${j.title}`);
    }
    save();
    return json(res, 200, { added });
  }

  // --- generic collections
  if ((m = /^\/(projects|jobs|tasks|clients|pings|events|finance|teams)(?:\/([A-Za-z0-9]+))?$/.exec(sub))) {
    const coll = m[1]; const id = m[2]; const R = RULES[coll]; const store = d[coll];
    if (!id && M === 'POST') {
      if (!R.create(x)) deny();
      throttle('create:' + user.id, 300, 3600e3);
      const b = await readBody(req, 256 * 1024);
      const item = Object.assign(R.defaults(x), R.clean(b, x, null), { id: uid(), createdBy: user.id, createdAt: now(), updatedAt: now() });
      const [field, msg] = REQUIRED[coll]; if (!item[field]) bad(msg);
      if (coll === 'tasks' && !item.jobId) bad('A task needs a job');
      if (coll === 'pings') { item.readBy = { [user.id]: now() }; item.files = attachFiles(x, b.files, item.id, []); }
      store[item.id] = item;
      afterChange(cid, coll, null, item, user);
      save(); upsert(cid, coll, item);
      if (coll === 'jobs' && item.projectId) touchProject(x, item.projectId);
      return json(res, 200, { item: viewFor(coll, item, x) });
    }
    if (id) {
      const item = store[id];
      if (!item || !viewFor(coll, item, x)) notFound();
      if (M === 'PATCH') {
        if (!R.edit(x, item)) deny();
        const b = await readBody(req, 256 * 1024);
        const before = JSON.parse(JSON.stringify(item));
        Object.assign(item, R.clean(b, x, item), { updatedAt: now(), updatedBy: user.id });
        if (coll === 'pings' && 'files' in b) item.files = attachFiles(x, b.files, item.id, before.files || []);
        afterChange(cid, coll, before, item, user);
        save();
        if (accessChanged(coll, before, item)) broadcast(cid, { t: 'reload' }); else upsert(cid, coll, item);
        return json(res, 200, { item: viewFor(coll, item, x) });
      }
      if (M === 'DELETE') {
        if (!R.del(x, item)) deny();
        delete store[id];
        if (coll === 'jobs') {
          for (const t of Object.values(d.tasks)) if (t.jobId === id) { delete d.tasks[t.id]; removeItem(cid, 'tasks', t.id); }
          for (const ph of Object.values(d.photos)) if (ph.jobId === id) { delete d.photos[ph.id]; dropFile(ph.url); if (ph.thumb !== ph.url) dropFile(ph.thumb); removeItem(cid, 'photos', ph.id); }
          for (const e of Object.values(d.events)) if (e.jobId === id) { e.jobId = ''; upsert(cid, 'events', e); }
          dropMessageFiles(d.messages['job:' + id]); delete d.messages['job:' + id];
        }
        if (coll === 'projects') {
          for (const j of Object.values(d.jobs)) if (j.projectId === id) j.projectId = '';
          for (const e of Object.values(d.events)) if (e.projectId === id) e.projectId = '';
          broadcast(cid, { t: 'reload' });
        }
        if (coll === 'pings') for (const fid of (item.files || []).map((f) => f.id)) { const f = d.files[fid]; if (f) { dropFile(f.url); if (f.thumb && f.thumb !== f.url) dropFile(f.thumb); delete d.files[fid]; } }
        if (coll === 'clients') for (const j of Object.values(d.jobs)) if (j.clientId === id) { j.clientId = ''; upsert(cid, 'jobs', j); }
        if (coll === 'teams') for (const j of Object.values(d.jobs)) if (j.teamId === id) { j.teamId = ''; upsert(cid, 'jobs', j); }
        save(); removeItem(cid, coll, id);
        return json(res, 200, { ok: true });
      }
    }
  }
  void cur;
  notFound('Not found');
}
function publicFile(f) { return { id: f.id, kind: f.kind, name: f.name, type: f.type, ext: f.ext || '', size: f.size, url: f.url, thumb: f.thumb || '', w: f.w || 0, h: f.h || 0 }; }
// Link uploaded files to a ping. Only the uploader's own unattached files (or ones already on this ping) can be used.
function attachFiles(x, ids, pingId, current) {
  if (!Array.isArray(ids)) return current;
  if (ids.length > 10) bad('You can attach up to 10 files');
  const keep = [];
  for (const id of ids.map(String)) {
    const f = x.d.files[id];
    if (!f) continue;
    const mine = f.status === 'pending' && f.by === x.uid;
    const already = f.status === 'attached' && f.scope && f.scope.ping === pingId;
    if (!mine && !already) continue;
    f.status = 'attached'; f.scope = { ping: pingId };
    keep.push(publicFile(f));
  }
  for (const old of current || []) if (!keep.some((k) => k.id === old.id)) { const f = x.d.files[old.id]; if (f) { dropFile(f.url); if (f.thumb && f.thumb !== f.url) dropFile(f.thumb); delete x.d.files[old.id]; } }
  return keep;
}
function touchProject(x, pid) { const p = x.d.projects[pid]; if (p) { p.updatedAt = now(); upsert(x.c.id, 'projects', p); } }

function stream(req, res) {
  const cur = authUser(req); const user = cur.user;
  const url = new URL(req.url, 'http://x');
  const cid = url.searchParams.get('cid');
  companyCtx(user, cid);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 3000\n\n');
  const s = { res, userId: user.id, cid, sessionKey: cur.key };
  streams.add(s);
  const was = isOnline(user.id);
  onlineCount.set(user.id, (onlineCount.get(user.id) || 0) + 1);
  user.lastSeen = now();
  if (!was) presence(user.id);
  send(res, { t: 'hello' });
  req.on('close', () => {
    streams.delete(s);
    onlineCount.set(user.id, Math.max(0, (onlineCount.get(user.id) || 1) - 1));
    if (db.users[user.id]) { user.lastSeen = now(); save(); }
    setTimeout(() => { if (!isOnline(user.id)) presence(user.id); }, 4000);
  });
}

// ---------------------------------------------------------------- background jobs
function sweep() {
  const t = now(); let changed = false;
  for (const [id, loc] of Object.entries(db.locations)) if (t - loc.at > LOCATION_MAX_AGE) { delete db.locations[id]; changed = true; }
  for (const [k, tok] of Object.entries(db.tokens)) if (tok.exp < t) { delete db.tokens[k]; changed = true; }
  for (const [k, s] of Object.entries(db.sessions)) if (t - (s.seen || 0) > SESSION_IDLE || t - s.createdAt > SESSION_MAX) { delete db.sessions[k]; changed = true; }
  for (const [k, g] of Object.entries(db.guard)) if (g.until < t - 30 * 864e5 && (g.lastFail || 0) < t - 30 * 864e5) { delete db.guard[k]; changed = true; }
  for (const u of Object.values(db.users)) if (!u.verified && t - u.createdAt > 7 * 864e5) { delete db.users[u.id]; changed = true; } // never confirmed
  for (const [cid, d] of Object.entries(db.data)) {
    if (!db.companies[cid]) continue;
    for (const f of Object.values(d.files || {})) if (f.status === 'pending' && t - f.at > 24 * 3600e3) { dropFile(f.url); if (f.thumb && f.thumb !== f.url) dropFile(f.thumb); delete d.files[f.id]; changed = true; }
  }
  if (changed) save();
}
// Calendar reminders: an hour before timed events, and at 7am on the day for all-day events.
function reminders() {
  const t = now();
  for (const c of Object.values(db.companies)) {
    const d = cdata(c.id);
    for (const e of Object.values(d.events)) {
      if (!e.startsAt || e.remindedAt) continue;
      const due = e.allDay ? e.startsAt + 7 * 3600e3 : e.startsAt - 3600e3;
      const late = e.allDay ? e.startsAt + 20 * 3600e3 : e.startsAt + 5 * 60e3;
      if (t < due) continue;
      e.remindedAt = t; save();
      if (t > late) continue;
      const who = (e.participants && e.participants.length ? e.participants : Object.keys(c.members)).filter((id) => { const x = ctxFor(c, id); return x && canSeeEvent(x, e); });
      notify(c.id, who, e.allDay ? `Today: ${e.title}` : `In 1 hour (${e.start}): ${e.title}`, '#/calendar/' + e.date);
    }
  }
}

// ---------------------------------------------------------------- static files & security headers
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf', '.csv': 'text/csv; charset=utf-8' };
for (const [ext, type] of Object.entries(DOC_TYPES)) if (!TYPES['.' + ext]) TYPES['.' + ext] = type;
// Map data comes from OpenFreeMap (vector maps) with OpenStreetMap as a fallback; nothing else loads from other sites.
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tiles.openfreemap.org https://tile.openstreetmap.org; " +
    "font-src 'self'; connect-src 'self' https://tiles.openfreemap.org; worker-src 'self' blob:; child-src 'self' blob:; manifest-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  // Sends only this site's address (never the page path) to map servers, which their usage policy requires.
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(self), camera=(self), microphone=(), payment=(), usb=()',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};
if (HOSTED) SECURITY_HEADERS['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
function serveFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, SECURITY_HEADERS); return res.end('Not found'); }
    const ext = path.extname(file).toLowerCase();
    const immutable = ext === '.woff2' || file.includes(path.sep + 'vendor' + path.sep);
    res.writeHead(200, Object.assign({ 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Content-Length': st.size,
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' }, SECURITY_HEADERS));
    fs.createReadStream(file).pipe(res);
  });
}
async function serveUpload(req, res, url) {
  const name = path.basename(url.pathname);
  let cur = null; try { cur = authUser(req); } catch (_) {}
  const entry = db.fileIndex[name];
  if (!cur || !canReadFile(cur.user, entry)) { res.writeHead(cur ? 404 : 401, Object.assign({ 'Content-Type': 'text/plain' }, SECURITY_HEADERS)); return res.end(cur ? 'Not found' : 'Please sign in'); }
  const f = await storage.getFile(name);
  if (!f) { res.writeHead(404, SECURITY_HEADERS); return res.end('Not found'); }
  const headers = Object.assign({}, SECURITY_HEADERS, { 'Content-Type': f.type, 'Content-Length': f.data.length, 'Cache-Control': 'private, max-age=86400',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" });
  if (!/^image\//.test(f.type)) {
    let fname = 'download';
    if (entry.kind === 'file') { const c = db.companies[entry.cid]; const ff = c && cdata(c.id).files[entry.fileId]; if (ff) fname = ff.name; }
    const inline = f.type === 'application/pdf' && url.searchParams.get('view') === '1';
    headers['Content-Disposition'] = `${inline ? 'inline' : 'attachment'}; filename="${fname.replace(/[^\w.\- ]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fname)}`;
    if (inline) { // shown inside the app's own document viewer
      headers['X-Frame-Options'] = 'SAMEORIGIN';
      headers['Content-Security-Policy'] = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'self'";
      headers['Cross-Origin-Resource-Policy'] = 'same-origin';
    }
  }
  res.writeHead(200, headers);
  res.end(f.data);
}

async function handler(req, res) {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch (_) { res.writeHead(400); return res.end(); }
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname.startsWith('/uploads/')) return await serveUpload(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, SECURITY_HEADERS); return res.end(); }
    let rel; try { rel = decodeURIComponent(url.pathname); } catch (_) { res.writeHead(400); return res.end(); }
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403, SECURITY_HEADERS); return res.end(); }
    if (fs.existsSync(file)) return serveFile(res, file);
    return serveFile(res, path.join(PUBLIC, 'index.html'));
  } catch (e) {
    const code = e instanceof HttpError ? e.code : 500;
    if (code === 500) console.error(e);
    if (!res.headersSent) json(res, code, Object.assign({ error: code === 500 ? 'Something went wrong on the server. Please try again.' : e.message }, e.extra || {}));
  }
}

// ---------------------------------------------------------------- start
async function main() {
  await storage.init();
  migrate();
  if (!mail.configured()) console.log('  Email isn’t set up (BREVO_API_KEY or RESEND_API_KEY, plus EMAIL_FROM). Verification and reset links will be printed here instead.');
  const publicUrl = process.env.KEEP_AWAKE_URL || process.env.RENDER_EXTERNAL_URL;
  if (publicUrl && process.env.KEEP_AWAKE !== 'off' && typeof fetch === 'function') {
    const ping = () => fetch(publicUrl.replace(/\/$/, '') + '/api/health', { headers: { 'User-Agent': 'Crewdesk keep-awake' } })
      .then((r) => { if (!r.ok) console.warn('Keep-awake check returned', r.status); })
      .catch((e) => console.warn('Keep-awake check failed:', e.message));
    setInterval(ping, 10 * 60 * 1000).unref();
    setTimeout(ping, 60 * 1000).unref();
    console.log('  Keep-awake is on: checking', publicUrl, 'every 10 minutes');
  }
  setInterval(sweep, 10 * 60e3).unref(); setTimeout(sweep, 5000).unref();
  setInterval(reminders, 60e3).unref();
  setInterval(backupIfDue, 3 * 3600e3).unref(); setTimeout(backupIfDue, 30e3).unref();
  http.createServer(handler).listen(PORT, '0.0.0.0', () => {
    console.log(`\n  Crewdesk is running on port ${PORT} (storage: ${DATABASE_URL ? 'Postgres database' : 'data folder'})\n`);
    if (DATABASE_URL) return;
    console.log(`  This computer:  http://localhost:${PORT}`);
    for (const l of Object.values(os.networkInterfaces())) for (const a of l || []) if (a.family === 'IPv4' && !a.internal) console.log(`  Same Wi-Fi:     http://${a.address}:${PORT}`);
    console.log('\n  For phones on mobile data (and GPS), run start-public.bat — see README.md\n');
  });
  const certDir = path.join(ROOT, 'certs');
  if (fs.existsSync(path.join(certDir, 'key.pem')) && fs.existsSync(path.join(certDir, 'cert.pem'))) {
    https.createServer({ key: fs.readFileSync(path.join(certDir, 'key.pem')), cert: fs.readFileSync(path.join(certDir, 'cert.pem')) }, handler)
      .listen(HTTPS_PORT, '0.0.0.0', () => console.log(`  HTTPS:          https://<this-computer>:${HTTPS_PORT}`));
  }
}
main().catch((e) => { console.error('Crewdesk could not start:', e.message); process.exit(1); });
