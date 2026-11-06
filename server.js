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
const zlib = require('zlib');
const passwords = require('./lib/passwords');
const mail = require('./lib/email');
const ts = require('./lib/timesheet');
const gdrive = require('./lib/gdrive');
const { writeZip } = require('./lib/zip');
const TZ = 'Europe/London';

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
// The app state lives in memory as one object. It's saved in pieces so that a change only writes what it touched:
//   core            everything except time entries, day notes and chat messages (small)
//   entries|c|YYYY-MM   one month of a company's time entries
//   days|c|YYYY-MM      one month of day notes and approvals
//   messages|c|channel  one chat's messages
// Locally that's data/db.json plus data/chunks/; with DATABASE_URL it's Postgres rows. Uploaded files are stored
// separately (data/uploads or the crewdesk_files table). A compressed copy of everything is kept every day.
let db = {};
let pool = null;
const CHUNKS = path.join(DATA, 'chunks');
const chunkFile = (key) => path.join(CHUNKS, encodeURIComponent(key) + '.json');
const BIG = ['entries', 'days', 'messages', 'manholes'];
function mergeChunk(key, data) {
  const [kind, cid] = key.split('|');
  db.data = db.data || {}; const d = db.data[cid] = db.data[cid] || {};
  d[kind] = d[kind] || {};
  if (kind === 'messages') d.messages[key.split('|').slice(2).join('|')] = data; else Object.assign(d[kind], data);
}

const fileStore = {
  async init() {
    fs.mkdirSync(UPLOADS, { recursive: true }); fs.mkdirSync(BACKUPS, { recursive: true }); fs.mkdirSync(CHUNKS, { recursive: true });
    if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    const keys = [];
    for (const n of fs.readdirSync(CHUNKS)) if (n.endsWith('.json')) { const key = decodeURIComponent(n.slice(0, -5)); mergeChunk(key, JSON.parse(fs.readFileSync(path.join(CHUNKS, n), 'utf8'))); keys.push(key); }
    return keys;
  },
  async write(json) { const tmp = DB_FILE + '.tmp'; fs.writeFileSync(tmp, json); fs.renameSync(tmp, DB_FILE); },
  async writeChunk(key, json) { const f = chunkFile(key); fs.writeFileSync(f + '.tmp', json); fs.renameSync(f + '.tmp', f); },
  async delChunk(key) { try { fs.unlinkSync(chunkFile(key)); } catch (_) {} },
  async putFile(name, type, buf) { fs.writeFileSync(path.join(UPLOADS, path.basename(name)), buf); },
  async delFile(name) { try { fs.unlinkSync(path.join(UPLOADS, path.basename(name))); } catch (_) {} },
  async sizes() { const o = {}; for (const n of fs.readdirSync(UPLOADS)) { try { o[n] = fs.statSync(path.join(UPLOADS, n)).size; } catch (_) {} } return o; },
  async getFile(name) {
    const f = path.join(UPLOADS, path.basename(name));
    return fs.existsSync(f) ? { type: TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', data: fs.readFileSync(f) } : null;
  },
  async backup(gz) {
    fs.writeFileSync(path.join(BACKUPS, `db-${new Date().toISOString().slice(0, 10)}.json.gz`), gz);
    const all = fs.readdirSync(BACKUPS).filter((n) => /^db-\d{4}-\d{2}-\d{2}\.json(\.gz)?$/.test(n)).sort();
    for (const n of all.slice(0, Math.max(0, all.length - 14))) fs.unlinkSync(path.join(BACKUPS, n));
  },
};
const pgStore = {
  async init() {
    const { Pool } = require('pg');
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL);
    pool = new Pool({ connectionString: DATABASE_URL.replace(/[?&](sslmode|channel_binding)=[^&]*/g, ''), ssl: local ? false : { rejectUnauthorized: true }, max: 4 });
    await pool.query('CREATE TABLE IF NOT EXISTS crewdesk_state (id int PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz DEFAULT now())');
    await pool.query('CREATE TABLE IF NOT EXISTS crewdesk_chunks (key text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz DEFAULT now())');
    await pool.query('CREATE TABLE IF NOT EXISTS crewdesk_files (name text PRIMARY KEY, type text NOT NULL, data bytea NOT NULL)');
    await pool.query('CREATE TABLE IF NOT EXISTS crewdesk_backups (id serial PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), data jsonb)');
    await pool.query('ALTER TABLE crewdesk_backups ALTER COLUMN data DROP NOT NULL');
    await pool.query('ALTER TABLE crewdesk_backups ADD COLUMN IF NOT EXISTS gz bytea');
    await pool.query('CREATE INDEX IF NOT EXISTS crewdesk_backups_created ON crewdesk_backups (created_at)');
    const r = await pool.query('SELECT data FROM crewdesk_state WHERE id = 1');
    if (r.rows[0]) db = r.rows[0].data;
    const c = await pool.query('SELECT key, data FROM crewdesk_chunks');
    for (const row of c.rows) mergeChunk(row.key, row.data);
    return c.rows.map((row) => row.key);
  },
  async write(json) {
    await pool.query('INSERT INTO crewdesk_state (id, data, updated_at) VALUES (1, $1, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()', [json]);
  },
  async writeChunk(key, json) { await pool.query('INSERT INTO crewdesk_chunks (key, data, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()', [key, json]); },
  async delChunk(key) { await pool.query('DELETE FROM crewdesk_chunks WHERE key = $1', [key]); },
  async putFile(name, type, buf) { await pool.query('INSERT INTO crewdesk_files (name, type, data) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING', [name, type, buf]); },
  async getFile(name) { const r = await pool.query('SELECT type, data FROM crewdesk_files WHERE name = $1', [path.basename(name)]); return r.rows[0] || null; },
  async delFile(name) { await pool.query('DELETE FROM crewdesk_files WHERE name = $1', [path.basename(name)]); },
  async sizes() { const r = await pool.query('SELECT name, length(data) AS n FROM crewdesk_files'); const o = {}; for (const x of r.rows) o[x.name] = Number(x.n); return o; },
  async backup(gz) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO crewdesk_backups (gz) VALUES ($1)', [gz]);
      await client.query('DELETE FROM crewdesk_backups WHERE id NOT IN (SELECT id FROM crewdesk_backups ORDER BY created_at DESC LIMIT 14)');
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
  },
};
const storage = DATABASE_URL ? pgStore : fileStore;
// Photos and files go to Cloudflare R2 when it's set up; files saved before that are still read from where they were.
const r2 = require('./lib/r2');
if (r2.configured()) {
  const base = { putFile: storage.putFile, getFile: storage.getFile, delFile: storage.delFile };
  storage.putFile = (name, type, buf) => r2.put(path.basename(name), type, buf);
  storage.getFile = async (name) => (await r2.get(path.basename(name))) || base.getFile(name);
  storage.delFile = async (name) => { await r2.del(path.basename(name)).catch((e) => console.error('R2 delete:', e.message)); await base.delFile(name).catch(() => {}); };
}

// Free-allowance guard: counts storage, R2 operations and Google Maps calls each month and refuses anything that would go past 95% of the free tier.
const FREE = { bytes: 10e9, r2A: 1e6, r2B: 10e6, gMaps: 10000, gGeo: 10000, gStatic: 10000 };
const LOCK_AT = 0.95;
function usage() {
  db.meta = db.meta || {}; const mon = new Date().toISOString().slice(0, 7);
  const u = db.meta.usage = db.meta.usage || {}; if (u.month !== mon) Object.assign(u, { month: mon, r2A: 0, r2B: 0, gMaps: 0, gGeo: 0, gStatic: 0 });
  db.meta.fsize = db.meta.fsize || {}; return u;
}
const usedBytes = () => Object.values(usage() && db.meta.fsize).reduce((a, b) => a + b, 0);
function overFree(k, add = 1) { const u = usage(); return k === 'bytes' ? usedBytes() + add > FREE.bytes * LOCK_AT : (u[k] || 0) + add > FREE[k] * LOCK_AT; }
function countUse(k, n = 1) { const u = usage(); u[k] = (u[k] || 0) + n; save(); }
{
  const s = { putFile: storage.putFile, getFile: storage.getFile, delFile: storage.delFile };
  const viaR2 = r2.configured();
  storage.putFile = async (name, type, buf) => {
    if (overFree('bytes', buf.length)) throw new HttpError(507, 'Storage is nearly at the free limit, so uploads are paused. An admin can free space in More → Data.');
    if (viaR2 && overFree('r2A')) throw new HttpError(507, 'Uploads are paused until next month to stay inside the free allowance.');
    await s.putFile(name, type, buf); usage(); db.meta.fsize[path.basename(name)] = buf.length; if (viaR2) countUse('r2A'); save();
  };
  storage.getFile = async (name) => { if (viaR2) { if (overFree('r2B')) return null; countUse('r2B'); } return s.getFile(name); };
  storage.delFile = async (name) => { usage(); delete db.meta.fsize[path.basename(name)]; save(); return s.delFile(name); };
}

// Saving: debounced (but never put off for more than 2 seconds), core plus only the pieces that changed.
let saveTimer = null, firstDirty = 0, writing = Promise.resolve(), dirty = false;
const dirtyChunks = new Set(); let allChunksDirty = false; const storedChunks = new Set();
function save() {
  dirty = true; clearTimeout(saveTimer);
  if (!firstDirty) firstDirty = now();
  saveTimer = setTimeout(flush, now() - firstDirty > 2000 ? 0 : 400);
}
function touch(kind, cid, sub) { dirtyChunks.add(`${kind}|${cid}|${sub}`); save(); }
const touchEntry = (cid, e) => touch('entries', cid, entryDay(e).slice(0, 7));
const touchDay = (cid, r) => touch('days', cid, r.date.slice(0, 7));
const touchChannel = (cid, ch) => touch('messages', cid, ch);
// The pieces as they are now (all of them, or just the given keys).
function buildChunks(only) {
  const out = new Map();
  for (const [cid, d] of Object.entries(db.data || {})) {
    if (!db.companies[cid]) continue;
    const want = (k) => !only || only.has(k);
    for (const e of Object.values(d.entries || {})) { const k = `entries|${cid}|${entryDay(e).slice(0, 7)}`; if (want(k)) { if (!out.has(k)) out.set(k, {}); out.get(k)[e.id] = e; } }
    for (const r of Object.values(d.days || {})) { const k = `days|${cid}|${r.date.slice(0, 7)}`; if (want(k)) { if (!out.has(k)) out.set(k, {}); out.get(k)[r.id] = r; } }
    for (const [ch, list] of Object.entries(d.messages || {})) { const k = `messages|${cid}|${ch}`; if (want(k) && list.length) out.set(k, list); }
    for (const r of Object.values(d.manholes || {})) { const k = `manholes|${cid}|${r.mapId}`; if (want(k)) { if (!out.has(k)) out.set(k, {}); out.get(k)[r.id] = r; } }
  }
  return out;
}
function flush() {
  clearTimeout(saveTimer); saveTimer = null; firstDirty = 0;
  if (!dirty) return writing;
  dirty = false;
  const data = {};
  for (const [cid, d] of Object.entries(db.data || {})) { const o = Object.assign({}, d); for (const k of BIG) delete o[k]; data[cid] = o; }
  const core = JSON.stringify(Object.assign({}, db, { data }));
  const all = allChunksDirty; const keys = new Set(dirtyChunks); dirtyChunks.clear(); allChunksDirty = false;
  const chunks = buildChunks(all ? null : keys);
  const writes = [...chunks].map(([k, v]) => [k, JSON.stringify(v)]);
  const gone = all ? [...storedChunks].filter((k) => !chunks.has(k)) : [...keys].filter((k) => !chunks.has(k));
  writing = writing.then(async () => {
    for (const [k, json] of writes) { await storage.writeChunk(k, json); storedChunks.add(k); }
    for (const k of gone) { await storage.delChunk(k); storedChunks.delete(k); }
    await storage.write(core);
  }).catch((e) => {
    console.error('Save failed, will retry:', e.message);
    dirty = true; for (const [k] of writes) dirtyChunks.add(k); for (const k of gone) dirtyChunks.add(k); if (all) allChunksDirty = true;
    saveTimer = setTimeout(flush, 3000);
  });
  return writing;
}
// A full write every 15 minutes as a safety net, in case a change ever forgot to mark its piece.
setInterval(() => { allChunksDirty = true; save(); }, 15 * 60e3).unref();
async function backupIfDue() {
  const today = new Date().toISOString().slice(0, 10);
  if (db.meta.lastBackup === today) return;
  try {
    await flush();
    const gz = await new Promise((res, rej) => zlib.gzip(JSON.stringify(db), (e, b) => (e ? rej(e) : res(b))));
    await storage.backup(gz); db.meta.lastBackup = today; save(); console.log(`  Daily backup saved (${(gz.length / 1e6).toFixed(1)} MB compressed)`);
  } catch (e) { console.error('Backup failed:', e.message); }
}
async function shutdown() { try { allChunksDirty = true; dirty = true; await flush(); await writing; } finally { process.exit(0); } }
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
// Two levels of work: projects (the bigger thing) made up of tasks (the smaller things). Time is logged as entries.
const COLLS = ['teams', 'tasks', 'clients', 'pings', 'photos', 'projects', 'events', 'finance', 'chats', 'files', 'entries', 'days', 'suggestions'];
function cdata(cid) {
  const d = db.data[cid] = db.data[cid] || {};
  for (const k of COLLS) d[k] = d[k] || {};
  d.messages = d.messages || {};
  d.inbox = d.inbox || {};
  d.sheetUploads = d.sheetUploads || {}; // userId_YYYY-MM -> a timesheet the person uploaded themselves
  return d;
}
const DEFAULT_SETTINGS = { membersSeeMoney: false, membersCreateProjects: true, membersInvite: false, membersPing: true, allowCodeJoin: true, currency: '£',
  dayStart: '08:00', dayEnd: '16:30', dayHours: 8 };
const PROJECT_COLORS = ['#18693f', '#1f57a4', '#7b3fa8', '#b0284f', '#0b7285', '#a35200', '#2f8a3a', '#4c5fc0', '#57564f', '#6b7f00'];
const PROJECT_DEFAULTS = { ref: '', description: '', clientId: '', color: '#18693f', start: '', due: '', address: '', lat: null, lng: null, visibility: 'all', members: [], archived: false, archivedAt: 0, chat: false, plannedHours: 0 };
// v3: jobs are gone. A job that was inside a project becomes a task of that project; a job on its own becomes a project,
// with its tasks (and their checklists) as the project's tasks. The old records are kept in d.legacy, untouched.
function migrateJobs(c, d) {
  const oldJobs = d.jobs || {}; const oldTasks = d.tasks || {};
  d.legacy = { jobs: oldJobs, tasks: oldTasks, movedAt: now() };
  const tasks = {}; const toProject = {}; let n = Object.keys(d.projects).length;
  const tasksOf = (jid) => Object.values(oldTasks).filter((t) => t.jobId === jid).sort((a, b) => (a.order || 0) - (b.order || 0));
  const checklist = (t) => ((t.checklist || []).length ? '\n' + t.checklist.map((x) => `${x.done ? '✓' : '•'} ${x.text}`).join('\n') : '');
  const task = (o) => { const t = Object.assign({ id: uid(), title: '', notes: '', assignees: [], date: '', planMins: 0, done: false, doneAt: 0, order: now(), createdAt: now(), updatedAt: now() }, o); tasks[t.id] = t; return t; };
  for (const j of Object.values(oldJobs)) {
    const p = j.projectId && d.projects[j.projectId];
    if (p) {
      toProject[j.id] = p.id;
      const sub = tasksOf(j.id).map((t) => `${t.done ? '✓' : '•'} ${t.title}${checklist(t).replace(/\n/g, '\n   ')}`).join('\n');
      task({ projectId: p.id, title: j.title, notes: str([j.description || '', sub].filter(Boolean).join('\n\n'), 3000), assignees: j.assignees || [], date: j.start || j.deadline || '',
        done: j.status === 'done', doneAt: j.status === 'done' ? (j.completedAt || j.updatedAt || now()) : 0, order: j.createdAt || now(), createdBy: j.createdBy, createdAt: j.createdAt || now(), fromJob: j.id });
      if (!p.address && j.address) { p.address = j.address; p.lat = j.lat != null ? j.lat : null; p.lng = j.lng != null ? j.lng : null; }
    } else {
      const pid = uid();
      d.projects[pid] = Object.assign({}, PROJECT_DEFAULTS, { id: pid, name: j.title || 'Untitled', ref: j.ref || '', description: j.description || '', clientId: j.clientId || '', color: PROJECT_COLORS[n++ % PROJECT_COLORS.length],
        start: j.start || '', due: j.deadline || '', address: j.address || '', lat: j.lat != null ? j.lat : null, lng: j.lng != null ? j.lng : null, visibility: j.visibility === 'selected' ? 'selected' : 'all',
        members: [...new Set([...(j.viewers || []), ...(j.assignees || [])])], archived: j.status === 'done', archivedAt: j.status === 'done' ? (j.completedAt || now()) : 0,
        createdBy: j.createdBy, createdAt: j.createdAt || now(), updatedAt: now(), fromJob: j.id });
      toProject[j.id] = pid;
      for (const t of tasksOf(j.id)) task({ projectId: pid, title: t.title, notes: str((t.notes || '') + checklist(t), 3000), assignees: t.assignees || j.assignees || [], date: t.deadline || '',
        done: !!t.done, doneAt: t.done ? (t.updatedAt || now()) : 0, order: t.order || now(), createdBy: t.createdBy, createdAt: t.createdAt || now() });
    }
  }
  d.tasks = tasks; delete d.jobs;
  for (const ph of Object.values(d.photos)) if (!ph.projectId) ph.projectId = toProject[ph.jobId] || '';
  for (const e of Object.values(d.events)) { if (e.jobId && !e.projectId) e.projectId = toProject[e.jobId] || ''; delete e.jobId; }
  for (const f of Object.values(d.finance)) { if (f.jobId && !f.projectId) f.projectId = toProject[f.jobId] || ''; delete f.jobId; }
  for (const [ch, list] of Object.entries(d.messages)) {
    const m = /^job:(.+)$/.exec(ch); if (!m) continue;
    const pid = toProject[m[1]];
    if (pid && list.some((x) => !x.system)) {
      const to = 'project:' + pid;
      d.messages[to] = (d.messages[to] || []).concat(list.map((x) => Object.assign({}, x, { channel: to }))).sort((a, b) => a.at - b.at);
      d.projects[pid].chat = true;
    }
    delete d.messages[ch];
  }
  for (const u of Object.values(db.users)) {
    if (u.reads && u.reads[c.id]) for (const k of Object.keys(u.reads[c.id])) if (k.startsWith('job:')) delete u.reads[c.id][k];
    const f = u.favs && u.favs[c.id];
    if (f) { f.projects = [...new Set((f.projects || []).concat((f.jobs || []).map((id) => toProject[id]).filter(Boolean)))]; delete f.jobs; }
  }
}
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
    if (Array.isArray(u.prefs.tabs) && u.prefs.tabs.includes('jobs')) u.prefs.tabs = [...new Set(u.prefs.tabs.map((k) => (k === 'jobs' ? 'timesheet' : k)))];
  }
  if (db.meta.schema < 3) {
    for (const c of Object.values(db.companies)) migrateJobs(c, cdata(c.id));
    db.meta.schema = 3;
    console.log('  Moved jobs into projects and tasks (the old records are kept in the backup)');
  }
  for (const c of Object.values(db.companies)) {
    c.settings = Object.assign({}, DEFAULT_SETTINGS, c.settings || {});
    delete c.settings.membersCreateJobs;
    c.invites = c.invites || {};
    const d = cdata(c.id);
    for (const p of Object.values(d.projects)) for (const [k, v] of Object.entries(PROJECT_DEFAULTS)) if (p[k] === undefined) p[k] = Array.isArray(v) ? [] : v;
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
    for (const p of Object.values(d.photos || {})) for (const u of [p.url, p.thumb]) { const n = name(u); if (n) idx[n] = { kind: 'photo', cid, project: p.projectId }; }
    for (const r of Object.values(d.manholes || {})) for (const ph of r.photos || []) for (const u of [ph.url, ph.thumb]) { const n = name(u); if (n) idx[n] = { kind: 'photo', cid, project: r.projectId }; }
    for (const [ch, list] of Object.entries(d.messages || {})) for (const m of list) for (const u of msgImages(m)) { const n = name(u); if (n) idx[n] = { kind: 'msg', cid, ch }; }
    for (const f of Object.values(d.files || {})) for (const u of [f.url, f.thumb]) { const n = name(u); if (n) idx[n] = { kind: 'file', cid, fileId: f.id }; }
    for (const u of Object.values(d.sheetUploads || {})) idx[u.stored] = { kind: 'sheet', cid, user: u.userId };
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
const projectOf = (x, id) => (id && x.d.projects[id]) || null;
function canSeeTask(x, t) { const p = t && projectOf(x, t.projectId); return !!(p && canSeeProject(x, p)); }
// Time entries: your own; anyone's on a project you can see (so a crew sees who's on it); admins see everything.
function canSeeEntry(x, e) {
  if (isAdmin(x.role) || e.userId === x.uid) return true;
  const p = projectOf(x, e.projectId);
  return !!(p && canSeeProject(x, p));
}
function canSeeEvent(x, e) {
  if (e.projectId && !canSeeProject(x, x.d.projects[e.projectId])) return false;
  if (e.visibility === 'selected' && !isAdmin(x.role)) return e.createdBy === x.uid || (e.participants || []).includes(x.uid);
  return true;
}
function canSeeChannel(x, ch) {
  if (ch === 'general') return true;
  let m;
  if ((m = /^project:(.+)$/.exec(ch || ''))) { const p = projectOf(x, m[1]); return !!(p && p.chat && canSeeProject(x, p)); } // only once someone opens the project's chat
  if ((m = /^chat:(.+)$/.exec(ch || ''))) { const c = x.d.chats[m[1]]; return !!(c && c.members.includes(x.uid)); } // private: even admins can’t read others’ chats
  return false;
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
    case 'tasks': case 'photos': case 'mhMaps': case 'manholes': return canSeeTask(x, item) ? item : null;
    case 'projects': return canSeeProject(x, item) ? item : null;
    case 'events': return canSeeEvent(x, item) ? item : null;
    case 'finance': return isAdmin(x.role) ? item : null;
    case 'pings': return shapePing(item, x);
    case 'chats': return item.members.includes(x.uid) ? item : null;
    case 'entries': return canSeeEntry(x, item) ? item : null;
    case 'days': case 'suggestions': return isAdmin(x.role) || item.userId === x.uid || item.createdBy === x.uid ? item : null; // end-of-day notes and suggestions: just you and the admins
    case 'files': return null;
    default: return item;
  }
}
const RECENT = 62 * 864e5; // the app loads about two months of your own time; older time is fetched when needed
function stateFor(x) {
  const out = {}; const d = x.d; const admin = isAdmin(x.role);
  const yearAgo = new Date(now() - 365 * 864e5).toISOString().slice(0, 10);
  for (const coll of ['teams', 'clients', 'pings', 'photos', 'projects', 'finance', 'chats', 'suggestions']) {
    const o = {}; for (const [k, v] of Object.entries(d[coll])) { const s = viewFor(coll, v, x); if (s) o[k] = s; }
    out[coll] = o;
  }
  // Tasks of active projects (an archived project's tasks load when you open it); events from the last year on.
  mhSeed(x.c.id, d); out.mhPresets = d.mhPresets; out.mhMaps = {};
  for (const mp of Object.values(d.mhMaps)) if (canSeeTask(x, mp)) out.mhMaps[mp.id] = mhPublicMap(mp);
  out.mhCounts = {}; for (const r of Object.values(d.manholes)) if (!r.deleted && out.mhMaps[r.mapId]) out.mhCounts[r.mapId] = (out.mhCounts[r.mapId] || 0) + 1;
  out.mapsKey = overFree('gMaps') ? '' : (process.env.GOOGLE_MAPS_KEY || '');
  out.tasks = {}; out.projectCounts = {};
  for (const t of Object.values(d.tasks)) {
    const p = d.projects[t.projectId]; if (!p || !out.projects[p.id]) continue;
    if (!p.archived) out.tasks[t.id] = t;
    else { const c = out.projectCounts[p.id] = out.projectCounts[p.id] || [0, 0]; c[0]++; if (t.done) c[1]++; }
  }
  out.events = {}; for (const e of Object.values(d.events)) if ((e.endDate || e.date) >= yearAgo && canSeeEvent(x, e)) out.events[e.id] = e;
  // Time: your own recent time, everyone's running timers, and (admins) everyone's time today.
  const ix = idxFor(x.c.id); out.entries = {}; out.days = {};
  const days = []; for (let t = now() - RECENT; t <= now() + 864e5; t += 864e5) days.push(localDay(t));
  for (const ds of new Set(days)) for (const e of userDayEntries(d, x.c.id, x.uid, ds)) out.entries[e.id] = e;
  for (const id of ix.running) { const e = d.entries[id]; if (e && canSeeEntry(x, e)) out.entries[e.id] = e; }
  const today = localDay(now());
  if (admin) for (const uidv of Object.keys(x.c.members)) for (const e of userDayEntries(d, x.c.id, uidv, today)) out.entries[e.id] = e;
  const dayFrom = new Date(now() - RECENT).toISOString().slice(0, 10), noteFrom = new Date(now() - 14 * 864e5).toISOString().slice(0, 10);
  for (const r of Object.values(d.days)) if ((r.userId === x.uid && r.date >= dayFrom) || (admin && r.date >= noteFrom)) out.days[r.id] = r;
  // Time logged on each task and project, worked out on the server (finished time; running timers are added on screen).
  out.totals = { tasks: {}, projects: {} };
  for (const [k, v] of Object.entries(ix.projects)) if (out.projects[k]) out.totals.projects[k] = Math.round(v);
  for (const [k, v] of Object.entries(ix.tasks)) { const t = d.tasks[k]; if (t && out.projects[t.projectId]) out.totals.tasks[k] = Math.round(v); }
  return out;
}

// ---------------------------------------------------------------- realtime (Server-Sent Events)
const streams = new Set();          // { res, userId, cid }
const onlineCount = new Map();      // userId -> open connections
// A phone on a bad signal can stop reading while updates keep coming. Rather than let them pile up in memory,
// drop that connection once 256 KB is waiting; the app reconnects by itself and reloads what it missed.
function send(res, evt) {
  try {
    if (res.writableLength > 256 * 1024) { res.destroy(); return; }
    res.write(`data: ${JSON.stringify(evt)}\n\n`);
  } catch (_) {}
}
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
function dropMessageFiles(list) { for (const m of list || []) { for (const u of msgImages(m)) dropFile(u); for (const f of m.files || []) { dropFile(f.url); if (f.thumb && f.thumb !== f.url) dropFile(f.thumb); } } }
function dropCompanyFiles(cid) {
  for (const [n, e] of Object.entries(db.fileIndex)) if (e.cid === cid) { delete db.fileIndex[n]; storage.delFile(n).catch(() => {}); }
}
function canReadFile(user, e) {
  if (!e) return false;
  if (e.kind === 'avatar') return e.owner === user.id || sharesCompany(user.id, e.owner) || !!(db.users[e.owner] && db.users[e.owner].privacy && db.users[e.owner].privacy.profilePublic);
  if (e.kind === 'banner' || e.kind === 'logo') { const c = db.companies[e.cid]; return !!(c && (c.members[user.id] || (c.profile && c.profile.visibility === 'public'))); }
  const c = db.companies[e.cid]; if (!c) return false;
  const x = ctxFor(c, user.id); if (!x) return false;
  if (e.kind === 'sheet') return e.user === user.id || isAdmin(x.role);
  if (e.kind === 'photo') { const p = projectOf(x, e.project); return !!(p && canSeeProject(x, p)); }
  if (e.kind === 'msg') return canSeeChannel(x, e.ch);
  if (e.kind === 'file') {
    const f = x.d.files[e.fileId]; if (!f) return false;
    if (f.status !== 'attached') return f.by === user.id;
    if (f.scope && f.scope.ping) return !!x.d.pings[f.scope.ping];
    if (f.scope && f.scope.ch) return canSeeChannel(x, f.scope.ch);
    return false;
  }
  return false;
}

// ---------------------------------------------------------------- messages
const msgImages = (m) => (m.images && m.images.length ? m.images : m.image ? [m.image] : []);
function msgPreview(m) { const n = msgImages(m).length; const f = (m.files || []).length; return m.text || (n > 1 ? `📷 ${n} photos` : n ? '📷 Photo' : f > 1 ? `📎 ${f} files` : f ? '📎 ' + m.files[0].name : ''); }
function postMessage(cid, channel, userId, text, images, system = false, files = []) {
  const d = cdata(cid);
  const arr = d.messages[channel] = d.messages[channel] || [];
  const msg = { id: uid(), channel, userId, text: str(text, 4000), images: images || [], files, at: now(), system };
  arr.push(msg);
  if (arr.length > 3000) dropMessageFiles(arr.splice(0, arr.length - 3000));
  touchChannel(cid, channel);
  broadcast(cid, (x) => (canSeeChannel(x, channel) ? { t: 'msg', item: msg } : null));
  return msg;
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
const vis = (v) => (v === 'selected' ? 'selected' : 'all');
const coord = (v, max) => (v === null || v === '' || v === undefined || !Number.isFinite(Number(v)) || Math.abs(v) > max ? null : Math.round(Number(v) * 1e5) / 1e5);
const color = (v, d = '#18693f') => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : d);

const RULES = {
  projects: {
    create: (x) => isAdmin(x.role) || x.c.settings.membersCreateProjects !== false,
    edit: (x, p) => isAdmin(x.role) || p.createdBy === x.uid || p.visibility !== 'selected' || (p.members || []).includes(x.uid),
    del: (x, p) => isAdmin(x.role) || p.createdBy === x.uid,
    clean(b, x, existing) {
      const o = {};
      if ('name' in b) o.name = str(b.name, 120) || bad('Give the project a name');
      if ('ref' in b) o.ref = str(b.ref, 30);
      if ('description' in b) o.description = str(b.description, 5000);
      if ('clientId' in b) o.clientId = x.d.clients[b.clientId] ? b.clientId : '';
      if ('color' in b) o.color = b.color === '' ? '' : color(b.color); // '' = no colour
      if ('start' in b) o.start = date(b.start);
      if ('due' in b) o.due = date(b.due);
      if ('address' in b) o.address = str(b.address, 300);
      if ('lat' in b) o.lat = coord(b.lat, 90);
      if ('lng' in b) o.lng = coord(b.lng, 180);
      if ('plannedHours' in b) o.plannedHours = Math.max(0, Math.min(100000, num(b.plannedHours)));
      if ('chat' in b) o.chat = !!b.chat;
      if ('visibility' in b || 'members' in b) {
        if (existing && !(isAdmin(x.role) || existing.createdBy === x.uid)) deny('Only the person who made this project, or an admin, can change who sees it');
        if ('visibility' in b) o.visibility = vis(b.visibility);
        if ('members' in b) o.members = memberIds(x.c, b.members);
      }
      if ('archived' in b) { o.archived = !!b.archived; o.archivedAt = o.archived ? now() : 0; if (!o.archived) o.folder = ''; }
      if ('folder' in b) o.folder = str(b.folder, 60);
      return o;
    },
    defaults: (x) => Object.assign({}, PROJECT_DEFAULTS, { members: [], color: PROJECT_COLORS[Object.keys(x.d.projects).length % PROJECT_COLORS.length] }),
  },
  tasks: {
    create: () => true,
    edit: (x, t) => canSeeTask(x, t),
    del: (x, t) => canSeeTask(x, t) && (isAdmin(x.role) || t.createdBy === x.uid || (projectOf(x, t.projectId) || {}).createdBy === x.uid),
    clean(b, x) {
      const o = {};
      if ('projectId' in b) { const p = projectOf(x, b.projectId); if (!p || !canSeeProject(x, p)) bad('Pick a project for this task'); o.projectId = p.id; }
      if ('title' in b) o.title = str(b.title, 200) || bad('Give the task a title');
      if ('notes' in b) o.notes = str(b.notes, 3000);
      if ('assignees' in b) o.assignees = memberIds(x.c, b.assignees);
      if ('date' in b) o.date = date(b.date);
      if ('planMins' in b) o.planMins = Math.max(0, Math.min(60 * 24 * 60, Math.round(Number(b.planMins) || 0)));
      if ('done' in b) { o.done = !!b.done; o.doneAt = o.done ? now() : 0; }
      if ('order' in b) o.order = num(b.order);
      return o;
    },
    defaults: () => ({ projectId: '', title: '', notes: '', assignees: [], date: '', planMins: 0, done: false, doneAt: 0, order: now() }),
  },
  suggestions: {
    create: () => true,
    edit: (x, s) => isAdmin(x.role) || s.createdBy === x.uid,
    del: (x, s) => isAdmin(x.role) || s.createdBy === x.uid,
    clean(b, x, existing) {
      const o = {};
      if ('kind' in b) o.kind = ['idea', 'bug', 'question'].includes(b.kind) ? b.kind : 'idea';
      if ('text' in b) { if (existing && existing.createdBy !== x.uid) deny('Only the person who sent it can change what it says'); o.text = str(b.text, 4000) || bad('Write something first'); }
      if ('status' in b || 'reply' in b) {
        if (!isAdmin(x.role)) deny('Only admins can answer suggestions');
        if ('status' in b) o.status = ['new', 'seen', 'doing', 'done'].includes(b.status) ? b.status : 'seen';
        if ('reply' in b) { o.reply = str(b.reply, 4000); o.repliedBy = x.uid; o.repliedAt = now(); }
      }
      return o;
    },
    defaults: (x) => ({ kind: 'idea', text: '', status: 'new', reply: '', repliedBy: '', repliedAt: 0, userId: x.uid }),
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
      if ('projectId' in b) { const p = x.d.projects[b.projectId]; if (b.projectId && (!p || !canSeeProject(x, p))) bad('That project no longer exists'); o.projectId = p ? p.id : ''; }
      if ('color' in b) o.color = color(b.color, '');
      if ('calendarId' in b) o.calendarId = (x.c.settings.calendars || []).some((k) => k.id === b.calendarId) ? String(b.calendarId) : '';
      return o;
    },
    defaults: () => ({ calendarId: '', title: '', date: '', endDate: '', allDay: true, start: '', end: '', startsAt: 0, description: '', location: '', participants: [], visibility: 'all', projectId: '', color: '', remindedAt: 0 }),
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
      if ('projectId' in b) o.projectId = x.d.projects[b.projectId] ? b.projectId : '';
      if ('clientId' in b) o.clientId = x.d.clients[b.clientId] ? b.clientId : '';
      return o;
    },
    defaults: () => ({ date: new Date().toISOString().slice(0, 10), type: 'income', category: '', description: '', amount: 0, projectId: '', clientId: '', source: '' }),
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
const REQUIRED = { projects: ['name', 'Give the project a name'], tasks: ['title', 'A task needs a title'], clients: ['name', 'Give the client a name'],
  pings: ['title', 'Give the ping a title'], events: ['title', 'Give the event a title'], teams: ['name', 'Give the team a name'], finance: ['date', 'Enter a date'],
  suggestions: ['text', 'Write something first'] };

const ACCESS_FIELDS = { projects: ['visibility', 'members', 'chat'], tasks: ['projectId'], events: ['visibility', 'participants', 'projectId'] };
function accessChanged(coll, before, after) {
  return before && (ACCESS_FIELDS[coll] || []).some((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

function afterChange(cid, coll, before, after, user) {
  const c = db.companies[cid]; const d = cdata(cid);
  const who = user.name.split(' ')[0];
  if (coll === 'tasks') {
    const added = (after.assignees || []).filter((id) => !(before && before.assignees || []).includes(id) && id !== user.id);
    const p = d.projects[after.projectId];
    notify(cid, added, `${who} gave you a task${p ? ' on ' + p.name : ''}: ${after.title}`, '#/project/' + after.projectId);
    if (p && p.chat && before && !before.done && after.done) postMessage(cid, 'project:' + p.id, user.id, `${who} completed “${after.title}”`, [], true);
    if (p) { p.updatedAt = now(); upsert(cid, 'projects', p); }
  }
  if (coll === 'projects') {
    const added = (after.members || []).filter((id) => !(before && before.members || []).includes(id) && id !== user.id);
    notify(cid, added, `${who} added you to project ${after.name}`, '#/project/' + after.id);
    if (after.chat && !(before && before.chat)) postMessage(cid, 'project:' + after.id, user.id, `${who} opened a chat for ${after.name}`, [], true);
    // Keep the project's name on its time entries, so timesheets still read well if it's renamed or deleted later.
    if (before && (before.name !== after.name || before.ref !== after.ref)) for (const e of Object.values(d.entries)) if (e.projectId === after.id) { e.pname = after.name; e.pref = after.ref; touchEntry(cid, e); }
  }
  if (coll === 'suggestions') {
    if (!before) {
      const admins = Object.keys(c.members).filter((id) => isAdmin(c.members[id].role) && id !== user.id);
      notify(cid, admins, `${who} sent ${after.kind === 'bug' ? 'a bug report' : after.kind === 'question' ? 'a question' : 'a suggestion'}: ${after.text.slice(0, 80)}`, '#/admin/suggestions');
    } else if (after.reply && after.reply !== before.reply && after.createdBy !== user.id) notify(cid, [after.createdBy], `${who} replied to your ${after.kind === 'bug' ? 'bug report' : after.kind === 'question' ? 'question' : 'suggestion'}`, '#/suggest');
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

  // Back from Google after an admin connected Google Drive.
  if (p === '/api/gdrive/callback' && M === 'GET') {
    const back = (what) => { res.writeHead(302, Object.assign({}, SECURITY_HEADERS, { Location: '/#/admin/timesheets/' + what, 'Cache-Control': 'no-store' })); res.end(); };
    const t = useToken('gdrive', url.searchParams.get('state') || '');
    if (!t || t.userId !== user.id) return back('expired');
    const c = db.companies[t.cid];
    if (!c || !c.members[user.id] || !isAdmin(c.members[user.id].role)) return back('denied');
    if (url.searchParams.get('error') || !url.searchParams.get('code')) return back('cancelled');
    try { await gdrive.connect(c, url.searchParams.get('code'), APP_URL + '/api/gdrive/callback', user.id); save(); runDriveSync(c.id, true).catch(() => {}); return back('connected'); }
    catch (e) { console.error('Google Drive connect failed:', e.message); return back('failed'); }
  }

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
    if (b.prefs && Array.isArray(b.prefs.tabs)) { // the phone's bottom tab bar, as the person arranged it
      const ok = ['home', 'projects', 'timesheet', 'calendar', 'chat', 'pings', 'team', 'clients', 'suggest', 'admin', 'sheets'];
      const tabs = [...new Set(b.prefs.tabs.map(String))].filter((k) => ok.includes(k)).slice(0, 4);
      if (!tabs.length) bad('Keep at least one tab');
      user.prefs.tabs = tabs;
    } else if (b.prefs && b.prefs.tabs === null) delete user.prefs.tabs;
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
        timeEntries: Object.values(d.entries).filter((e) => e.userId === user.id).sort((a, b) => a.start - b.start).map((e) => ({ start: new Date(e.start).toISOString(), end: e.end ? new Date(e.end).toISOString() : null,
          type: (ts.CATS[e.category] || {}).label || e.category, project: (d.projects[e.projectId] || {}).name || e.pname || '', task: (d.tasks[e.taskId] || {}).title || e.tname || '', note: e.note })),
        dayNotes: Object.values(d.days).filter((x) => x.userId === user.id).map((x) => ({ date: x.date, wentWell: x.well, wentWrong: x.wrong, improve: x.improve })),
        suggestions: Object.values(d.suggestions).filter((x) => x.createdBy === user.id).map((x) => ({ kind: x.kind, text: x.text, reply: x.reply, at: new Date(x.createdAt).toISOString() })),
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
      if (Object.keys(c.members).length === 1) { broadcast(c.id, { t: 'kicked', cid: c.id }); dropCompanyFiles(c.id); delete db.companies[c.id]; delete db.data[c.id]; IDX.delete(c.id); allChunksDirty = true; }
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

  // --- a private demo company: you as owner, everyone else fake. One per person; opening it again just switches to it.
  if (p === '/api/demo-company' && M === 'POST') {
    const have = user.demoCid && db.companies[user.demoCid] && db.companies[user.demoCid].members[user.id];
    if (!have) {
      throttle('demo:' + user.id, 5, 3600e3);
      const r = require('./lib/demo').build(user, () => uid(8));
      const c = { id: uid(), name: 'Northgate Geomatics (Demo)', code: companyCode(), ownerId: user.id, createdAt: now(), demo: true,
        settings: Object.assign({}, DEFAULT_SETTINGS, { allowCodeJoin: false, membersInvite: false }), invites: {}, members: r.members, profile: { visibility: 'private' } };
      Object.assign(db.users, r.users); db.companies[c.id] = c; db.data[c.id] = r.data; cdata(c.id);
      user.demoCid = c.id; allChunksDirty = true; save();
    }
    return json(res, 200, { company: { id: user.demoCid, name: db.companies[user.demoCid].name, role: 'owner' }, companies: companiesFor(user.id) });
  }
  // --- companies
  if (p === '/api/companies' && M === 'POST') {
    throttle('newco:' + user.id, 10, 3600e3);
    const b = await readBody(req);
    const name = str(b.name, 80) || bad('Give your company a name');
    const jp = String(b.password || '');
    if (jp.length < 6) bad('The join password must be at least 6 characters');
    const h = await passwords.hash(jp);
    const c = { id: uid(), name, code: companyCode(), joinSalt: h.salt, joinHash: h.hash, joinKdf: h.kdf, ownerId: user.id, createdAt: now(),
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
  for (const t of Object.values(d.tasks)) t.assignees = (t.assignees || []).filter((x) => x !== id);
  // Their time entries and day notes stay: they're the company's payroll records.
  for (const e of Object.values(d.entries)) if (e.userId === id && !e.end) { const before = Object.assign({}, e); e.end = now(); putEntry(c, e, before); }
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
  if (sub === '/usage/gmaps' && M === 'POST') { const b = await readBody(req); const k = b.kind === 'geo' ? 'gGeo' : 'gMaps'; if (overFree(k)) return json(res, 200, { ok: false }); countUse(k); return json(res, 200, { ok: true }); }
  if (sub.startsWith('/data') && !isAdmin(role)) deny('Only admins can manage data');
  if (sub === '/data' && M === 'GET') {
    const u = usage(); const files = {};
    for (const [n, e] of Object.entries(db.fileIndex)) if (e.cid === cid) { const k = e.kind || 'other'; files[k] = files[k] || { n: 0, bytes: 0 }; files[k].n++; files[k].bytes += db.meta.fsize[n] || 0; }
    const records = {}; for (const k of Object.keys(d)) { try { records[k] = Buffer.byteLength(JSON.stringify(d[k])); } catch (_) {} }
    let dbBytes = 0; try { dbBytes = Buffer.byteLength(JSON.stringify(db)); } catch (_) {}
    return json(res, 200, { month: u.month, lockAt: LOCK_AT, free: Object.assign({ db: 0.5e9 }, FREE), used: { bytes: usedBytes(), db: dbBytes, r2A: u.r2A, r2B: u.r2B, gMaps: u.gMaps, gGeo: u.gGeo, gStatic: u.gStatic }, r2: r2.configured(), google: !!process.env.GOOGLE_MAPS_KEY, files, records });
  }
  if (sub === '/data/test' && M === 'GET') {
    const results = [];
    if (!r2.configured()) results.push({ name: 'Cloudflare R2', ok: false, msg: 'not set up (add the R2_ variables in Render)' });
    else { try { const k = 'crewdesk-test-' + uid(8) + '.txt'; await r2.put(k, 'text/plain', Buffer.from('ok')); const g = await r2.get(k); await r2.del(k); countUse('r2A', 2); countUse('r2B'); results.push({ name: 'Cloudflare R2', ok: !!(g && String(g.data) === 'ok'), msg: 'wrote but could not read back' }); } catch (e) { results.push({ name: 'Cloudflare R2', ok: false, msg: e.message.slice(0, 120) }); } }
    return json(res, 200, { results });
  }
  if (sub === '/data/export' && M === 'GET') {
    const out = []; const safe = (s) => String(s).replace(/[^\w.-]+/g, '_');
    for (const k of Object.keys(d)) out.push({ name: `records/${safe(k)}.json`, data: Buffer.from(JSON.stringify(d[k], null, 1)) });
    for (const [n, e] of Object.entries(db.fileIndex)) if (e.cid === cid) { try { const f = await storage.getFile(n); if (f) out.push({ name: `files/${safe(e.kind || 'other')}/${safe(n)}`, data: f.data }); } catch (_) {} }
    const zip = writeZip(out); const fn = `${safe(c.name || 'company')}_data_${new Date().toISOString().slice(0, 10)}.zip`;
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${fn}"`, 'Content-Length': zip.length }); return res.end(zip);
  }
  if (sub === '/data/clear' && M === 'POST') {
    const b = await readBody(req); if (b.confirm !== true) bad('Confirm to clear this data');
    if (b.area === 'chat') { for (const ch of Object.keys(d.messages)) { dropMessageFiles(d.messages[ch]); d.messages[ch] = []; touchChannel(cid, ch); broadcast(cid, () => ({ t: 'msgClear', channel: ch })); } }
    else if (b.area === 'sheets') { for (const [k, s] of Object.entries(d.sheetUploads || {})) { dropFile('/uploads/' + s.stored); delete d.sheetUploads[k]; } save(); }
    else bad('Pick something to clear');
    return json(res, 200, { ok: true });
  }

  if (sub === '/state' && M === 'GET') {
    const locs = {};
    for (const id of Object.keys(c.members)) if (db.users[id] && db.users[id].shareLocation && db.locations[id] && now() - db.locations[id].at < LOCATION_MAX_AGE) locs[id] = db.locations[id];
    const invites = isAdmin(role) || c.settings.membersInvite
      ? Object.values(c.invites).filter((i) => isAdmin(role) || i.createdBy === user.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50).map((i) => publicInvite(i, c)) : [];
    return json(res, 200, Object.assign({ company: publicCompany(c, role), role, me: meUser(user), members: memberList(c, user.id), locations: locs,
      sheetUploads: Object.fromEntries(Object.entries(d.sheetUploads).filter(([, u]) => isAdmin(role) || u.userId === user.id).map(([k, u]) => [k, publicSheet(u)])),
      favs: user.favs[cid] || { projects: [] }, inbox: (d.inbox[user.id] || []).slice(-100), invites, gdrive: isAdmin(role) ? gdrive.status(c) : null }, stateFor(x), unreadFor(x)));
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
      for (const k of ['membersSeeMoney', 'membersCreateProjects', 'membersInvite', 'membersPing', 'allowCodeJoin']) if (k in b.settings) c.settings[k] = !!b.settings[k];
      if ('currency' in b.settings) c.settings.currency = str(b.settings.currency, 3) || '£';
      if ('dayStart' in b.settings) c.settings.dayStart = hhmm(b.settings.dayStart) || bad('Enter the usual start time, like 08:00');
      if ('dayEnd' in b.settings) c.settings.dayEnd = hhmm(b.settings.dayEnd) || bad('Enter the usual finish time, like 16:30');
      if ('calendars' in b.settings) { // named calendars, e.g. one per office: Gateshead, Warrington
        if (!Array.isArray(b.settings.calendars)) bad('Calendars must be a list');
        const seen = new Set();
        c.settings.calendars = b.settings.calendars.slice(0, 30).map((k) => ({ id: /^[A-Za-z0-9]{4,20}$/.test(String(k.id || '')) ? String(k.id) : uid(8), name: str(k.name, 40) || bad('Give each calendar a name'), color: color(k.color, '#0a84ff') || '#0a84ff' }))
          .filter((k) => !seen.has(k.id) && seen.add(k.id));
      }
      if ('dayHours' in b.settings) { const h = num(b.settings.dayHours); if (!(h > 0 && h <= 24)) bad('A standard day must be between 0 and 24 hours'); c.settings.dayHours = h; }
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
    delete db.companies[cid]; delete db.data[cid]; IDX.delete(cid); allChunksDirty = true;
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
    const kind = 'projects';
    const item = d[kind][b.id];
    if (!item || !viewFor(kind, item, x)) notFound();
    const f = user.favs[cid] = user.favs[cid] || { projects: [] };
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
      delete d.chats[ch.id]; dropMessageFiles(d.messages['chat:' + ch.id]); delete d.messages['chat:' + ch.id]; touchChannel(cid, 'chat:' + ch.id);
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
    // Documents (and photos sent as files) are uploaded first with /files, then linked to the message here.
    const files = [];
    if (Array.isArray(b.files)) {
      if (b.files.length > 10) bad('You can send up to 10 files at once');
      for (const id of b.files.map(String)) { const f = d.files[id]; if (!f || f.status !== 'pending' || f.by !== user.id) continue; f.status = 'attached'; f.scope = { ch: b.channel }; files.push(publicFile(f)); }
    }
    if (!str(b.text) && !images.length && !files.length) bad('Message is empty');
    const msg = postMessage(cid, b.channel, user.id, b.text, images, false, files);
    markRead(user, cid, b.channel, msg.at);
    const ch = /^chat:(.+)$/.exec(b.channel);
    if (ch && d.chats[ch[1]] && d.chats[ch[1]].kind === 'dm') { /* the live 'msg' event already alerts the other person */ }
    return json(res, 200, { item: msg });
  }
  // Delete one message (your own, or any as an admin), or clear a whole chat's history (admins).
  if ((m = /^\/messages\/([A-Za-z0-9]+)$/.exec(sub)) && M === 'DELETE') {
    const ch = url.searchParams.get('channel') || '';
    if (!canSeeChannel(x, ch)) notFound('Chat not found');
    const arr = d.messages[ch] || []; const i = arr.findIndex((q) => q.id === m[1]);
    if (i < 0) notFound('That message was already deleted');
    const msg = arr[i];
    if (!(isAdmin(role) || (msg.userId === user.id && !msg.system))) deny('Only the person who sent it, or an admin, can delete this message');
    arr.splice(i, 1); dropMessageFiles([msg]); touchChannel(cid, ch); save();
    broadcast(cid, (y) => (canSeeChannel(y, ch) ? { t: 'msgDel', channel: ch, id: msg.id } : null));
    return json(res, 200, { ok: true });
  }
  if (sub === '/messages/clear' && M === 'POST') {
    if (!isAdmin(role)) deny('Only admins can clear a chat’s history');
    const b = await readBody(req); const ch = str(b.channel, 80);
    if (!canSeeChannel(x, ch)) notFound('Chat not found');
    if (b.confirm !== true) bad('Confirm to clear this chat');
    const n = (d.messages[ch] || []).filter((q) => !q.system).length;
    dropMessageFiles(d.messages[ch]); d.messages[ch] = []; touchChannel(cid, ch);
    broadcast(cid, (y) => (canSeeChannel(y, ch) ? { t: 'msgClear', channel: ch } : null));
    postMessage(cid, ch, user.id, `${user.name} cleared the chat history`, [], true);
    save(); return json(res, 200, { cleared: n });
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

  // --- the archive: folders and clearing (admins)
  if (sub === '/archive/folder' && M === 'PATCH') {
    if (!isAdmin(role)) deny('Only admins can rename archive folders');
    const b = await readBody(req); const from = str(b.from, 60), to = str(b.to, 60); let n = 0;
    for (const p of Object.values(d.projects)) if (p.archived && (p.folder || '') === from) { p.folder = to; p.updatedAt = now(); upsert(cid, 'projects', p); n++; }
    save(); return json(res, 200, { moved: n });
  }
  if (sub === '/archive/auto' && M === 'POST') {
    if (!isAdmin(role)) deny('Only admins can organise the archive');
    const b = await readBody(req); const by = b.by === 'month' ? 'month' : 'year'; let n = 0;
    for (const p of Object.values(d.projects)) {
      if (!p.archived || p.folder) continue;
      const z = ts.zoneParts(p.archivedAt || p.updatedAt || p.createdAt, TZ).date; // YYYY-MM-DD
      p.folder = by === 'month' ? `${z.slice(0, 4)}-${z.slice(5, 7)} ${ts.MONTHS[Number(z.slice(5, 7)) - 1]}` : z.slice(0, 4);
      p.updatedAt = now(); upsert(cid, 'projects', p); n++;
    }
    save(); return json(res, 200, { filed: n });
  }
  if (sub === '/archive/clear' && M === 'POST') {
    if (!isAdmin(role)) deny('Only admins can clear the archive');
    const b = await readBody(req);
    if (b.confirm !== true) bad('Confirm to clear the archive');
    const folder = 'folder' in b ? str(b.folder, 60) : null; let n = 0;
    for (const p of Object.values(d.projects)) {
      if (!p.archived || (folder !== null && (p.folder || '') !== folder)) continue;
      delete d.projects[p.id]; dropProjectData(cid, d, p); n++;
    }
    save(); broadcast(cid, { t: 'reload' });
    return json(res, 200, { cleared: n });
  }

  // --- project photos
  if (sub === '/photos' && M === 'POST') {
    const b = await readBody(req, 14 * 1024 * 1024);
    const p = projectOf(x, b.projectId);
    if (!p || !canSeeProject(x, p)) bad('That project no longer exists');
    const ref = { kind: 'photo', cid, project: p.id };
    const urlFull = await saveImage(b.image, 7 * 1024 * 1024, ref);
    const thumb = b.thumb ? await saveImage(b.thumb, 700 * 1024, ref) : urlFull;
    const item = { id: uid(), projectId: p.id, url: urlFull, thumb, caption: str(b.caption, 300), w: Math.round(Number(b.w) || 0), h: Math.round(Number(b.h) || 0),
      takenAt: Number(b.takenAt) || 0, createdBy: user.id, createdAt: now() };
    d.photos[item.id] = item; save();
    upsert(cid, 'photos', item);
    return json(res, 200, { item });
  }
  if ((m = /^\/photos\/([A-Za-z0-9]+)$/.exec(sub))) {
    const ph = d.photos[m[1]];
    if (!ph || !canSeeTask(x, ph)) notFound('That photo was already deleted');
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

  // --- time: entries, days, timesheets (see timeApi)
  if (/^\/mh\//.test(sub)) return manholeApi(req, res, url, x, sub);
  if (/^\/(entries|days|timesheet|timesheets|gdrive|stats)(\/|$)|^\/projects\/[A-Za-z0-9]+\/(timesheet|pdf)$/.test(sub)) return timeApi(req, res, url, x, sub);

  // --- generic collections
  if ((m = /^\/(projects|tasks|clients|pings|events|finance|teams|suggestions)(?:\/([A-Za-z0-9]+))?$/.exec(sub))) {
    const coll = m[1]; const id = m[2]; const R = RULES[coll]; const store = d[coll];
    if (!id && M === 'POST') {
      if (!R.create(x)) deny();
      throttle('create:' + user.id, 300, 3600e3);
      const b = await readBody(req, 256 * 1024);
      const item = Object.assign(R.defaults(x), R.clean(b, x, null), { id: uid(), createdBy: user.id, createdAt: now(), updatedAt: now() });
      const [field, msg] = REQUIRED[coll]; if (!item[field]) bad(msg);
      if (coll === 'tasks' && !item.projectId) bad('A task needs a project');
      if (coll === 'pings') { item.readBy = { [user.id]: now() }; item.files = attachFiles(x, b.files, item.id, []); }
      if (coll === 'suggestions') throttle('suggest:' + user.id, 30, 3600e3, 'You’ve sent a lot — try again a little later');
      store[item.id] = item;
      afterChange(cid, coll, null, item, user);
      save(); upsert(cid, coll, item);
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
        if (coll === 'projects') { dropProjectData(cid, d, item); broadcast(cid, { t: 'reload' }); }
        if (coll === 'tasks') for (const e of Object.values(d.entries)) if (e.taskId === id) { e.tname = e.tname || item.title; touchEntry(cid, e); }
        if (coll === 'pings') for (const fid of (item.files || []).map((f) => f.id)) { const f = d.files[fid]; if (f) { dropFile(f.url); if (f.thumb && f.thumb !== f.url) dropFile(f.thumb); delete d.files[fid]; } }
        if (coll === 'clients') for (const p of Object.values(d.projects)) if (p.clientId === id) { p.clientId = ''; upsert(cid, 'projects', p); }
        save(); removeItem(cid, coll, id);
        return json(res, 200, { ok: true });
      }
    }
  }
  void cur;
  notFound('Not found');
}
// A project's tasks, photos and chat go with it. Time already logged stays on people's timesheets, under the project's name.
function dropProjectData(cid, d, item) {
  const id = item.id;
  for (const mp of Object.values(d.mhMaps || {})) if (mp.projectId === id) { for (const r of Object.values(d.manholes || {})) if (r.mapId === mp.id) { for (const ph of r.photos || []) { dropFile(ph.url); if (ph.thumb !== ph.url) dropFile(ph.thumb); } delete d.manholes[r.id]; } delete d.mhMaps[mp.id]; touchMh(cid, mp.id); }
  for (const t of Object.values(d.tasks)) if (t.projectId === id) delete d.tasks[t.id];
  for (const ph of Object.values(d.photos)) if (ph.projectId === id) { delete d.photos[ph.id]; dropFile(ph.url); if (ph.thumb !== ph.url) dropFile(ph.thumb); }
  for (const e of Object.values(d.events)) if (e.projectId === id) e.projectId = '';
  for (const e of Object.values(d.entries)) if (e.projectId === id) { e.pname = e.pname || item.name; e.pref = e.pref || item.ref || ''; touchEntry(cid, e); }
  dropMessageFiles(d.messages['project:' + id]); delete d.messages['project:' + id]; touchChannel(cid, 'project:' + id);
}

function projectPdf(x, p) {
  const { Doc } = require('./lib/pdf'); const d = x.d; const cname = (d.clients[p.clientId] || {}).name || '';
  const doc = new Doc({ footer: `Crewdesk - ${x.c.name} - ${p.name}` });
  const nm = (id) => personNameOf(id);
  const tasks = Object.values(d.tasks).filter((t) => t.projectId === p.id).sort((a, b) => (a.order || 0) - (b.order || 0));
  const entries = Object.values(d.entries).filter((e) => e.projectId === p.id && canSeeEntry(x, e)).sort((a, b) => a.start - b.start);
  const nowT = Date.now(); const mins = (e) => Math.max(0, Math.round(((e.end || nowT) - e.start) / 60000));
  const paid = entries.filter((e) => !ts.CATS[e.category] || ts.CATS[e.category].paid !== false);
  const byTask = {}, byPerson = {}; let actual = 0;
  for (const e of paid) { const m = mins(e); actual += m; byTask[e.taskId || ''] = (byTask[e.taskId || ''] || 0) + m; byPerson[e.userId] = (byPerson[e.userId] || 0) + m; }
  const planned = p.plannedHours ? Math.round(p.plannedHours * 60) : tasks.reduce((a, t) => a + (t.planMins || 0), 0);
  const hrs = (m) => (m / 60).toFixed(1) + ' h';
  const dd = (t) => (t ? new Date(t).toLocaleDateString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }) : '-');
  const dstr = (s) => (s ? dd(new Date(s + 'T12:00:00Z').getTime()) : '-');
  // title band
  doc.rect(0, doc.h - 96, doc.w, 96, '#0f4f2f');
  doc.text('PROJECT REPORT', doc.m, doc.h - 36, 9, { bold: true, color: '#9fd3b5' });
  doc.text(doc.fit(p.name, doc.inner, 22, true), doc.m, doc.h - 62, 22, { bold: true, color: '#ffffff' });
  doc.text(`${x.c.name}  -  generated ${dd(nowT)}`, doc.m, doc.h - 82, 9, { color: '#cfe8d8' });
  doc.y = doc.h - 110;
  const diff = actual - planned;
  doc.stats([['Logged', hrs(actual)], ['Planned', planned ? hrs(planned) : '-'], ['Difference', planned ? (diff > 0 ? '+' : '') + hrs(diff) : '-'], ['Tasks done', `${tasks.filter((t) => t.done).length} / ${tasks.length}`]]);
  doc.heading('Details');
  const kv = [['Job number', p.ref || '-'], ['Status', p.archived ? `Archived ${dd(p.archivedAt)}${p.folder ? ' (folder: ' + p.folder + ')' : ''}` : 'Active'], ['Client', cname || '-'], ['Site', p.address || '-'],
    ['Start', dstr(p.start)], ['Finish by', dstr(p.due)], ['Created', `${dd(p.createdAt)}${p.createdBy ? ' by ' + nm(p.createdBy) : ''}`],
    ['Team', (p.members || []).map(nm).join(', ') || (p.visibility === 'selected' ? '-' : 'Everyone in the company')]];
  for (const [k, v] of kv) { doc.ensure(16); doc.y -= 14; doc.text(k, doc.m, doc.y, 9.5, { bold: true, color: '#53625a' }); const ls = doc.wrap(v, doc.inner - 100, 9.5); ls.forEach((l, i) => { if (i) { doc.ensure(14); doc.y -= 13; } doc.text(l, doc.m + 100, doc.y, 9.5); }); }
  if (p.description) { doc.heading('Description'); doc.para(p.description, 10); }
  doc.heading('Tasks - plan vs actual');
  const rows = tasks.map((t) => [t.title, (t.assignees || []).map(nm).join(', '), t.planMins ? hrs(t.planMins) : '-', hrs(byTask[t.id] || 0), t.done ? 'Done' : 'Open']);
  if (byTask['']) rows.push(['(no task)', '', '-', hrs(byTask['']), '']);
  doc.table([{ label: 'Task', w: 4 }, { label: 'Assigned to', w: 2.4 }, { label: 'Planned', w: 1.1, align: 'r' }, { label: 'Logged', w: 1.1, align: 'r' }, { label: 'Status', w: 1 }], rows.length ? rows : [['No tasks', '', '', '', '']]);
  doc.heading('People');
  const prow = Object.entries(byPerson).sort((a, b) => b[1] - a[1]).map(([id, m]) => [nm(id), hrs(m), String(new Set(paid.filter((e) => e.userId === id).map(entryDay)).size)]);
  doc.table([{ label: 'Person', w: 4 }, { label: 'Hours', w: 1.5, align: 'r' }, { label: 'Days on site', w: 1.5, align: 'r' }], prow.length ? prow : [['No time logged', '', '']]);
  if (entries.length) {
    doc.heading('Time log');
    const MAX = 400; const typ = (e) => (ts.CATS[e.category] || ts.CATS.field).label;
    doc.table([{ label: 'Date', w: 1.5 }, { label: 'Person', w: 2 }, { label: 'Time', w: 1.5 }, { label: 'Hours', w: 0.9, align: 'r' }, { label: 'Task / note', w: 4 }],
      entries.slice(0, MAX).map((e) => { const a = ts.zoneParts(e.start, TZ); const b = ts.zoneParts(e.end || e.start, TZ); const tt = (d.tasks[e.taskId] || {}).title || e.tname || '';
        return [dstr(a.date), nm(e.userId), `${ukClock(e.start)}-${e.end ? ukClock(e.end) : 'running'}`, (mins(e) / 60).toFixed(2), [typ(e) !== 'Field' ? typ(e) : '', tt, e.note].filter(Boolean).join(' - ')]; }), { size: 8.5 });
    if (entries.length > MAX) doc.para(`... and ${entries.length - MAX} more entries. The full list is in the project timesheet (.xlsx).`, 8.5, { color: '#667a6f' });
  }
  const photos = Object.values(d.photos).filter((ph) => ph.projectId === p.id).length;
  const msgs = (d.messages['project:' + p.id] || []).filter((m) => !m.system && m.text);
  doc.heading('Photos & chat');
  doc.para(`${photos} photo${photos === 1 ? '' : 's'} are stored with this project in Crewdesk.`, 10);
  if (msgs.length) {
    doc.para(`Project chat (${msgs.length} message${msgs.length === 1 ? '' : 's'}${msgs.length > 120 ? ', latest 120 shown' : ''}):`, 10, { bold: true, after: 2 });
    for (const m of msgs.slice(-120)) doc.para(`${dd(m.at)}  ${nm(m.userId)}: ${m.text}`, 8.5, { color: '#3b4a42', after: 1 });
  }
  return doc.build();
}
// Is someone's month filled in? Every weekday since they joined needs most of a day logged (or holiday/absence),
// unless they uploaded their own timesheet. Future months are "future"; this month is "in progress".
function sheetStatus(c, d, uid, ym) {
  const t = now(); const today = localDay(t); const curYm = today.slice(0, 7);
  if (ym > curYm) return { s: 'future' };
  const mem = c.members[uid]; const first = firstLogged(c.id).get(uid);
  if (!first) return ym === curYm ? { s: 'progress', missing: [] } : { s: 'none' }; // never logged time: nothing to chase yet
  const joined = [mem ? localDay(mem.joinedAt || 0) : '0000-00-00', first].sort()[1]; // counted from the first day they used the timesheet
  const [y, mo] = ym.split('-').map(Number); const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (`${ym}-${pad2(last)}` < joined) return { s: 'none' };
  const need = (c.settings.dayHours || 8) * 60 * 0.75; const missing = [];
  for (let dd = 1; dd <= last; dd++) {
    const ds = `${ym}-${pad2(dd)}`; if (ds < joined || ds >= today) continue;
    const dow = new Date(Date.UTC(y, mo - 1, dd)).getUTCDay(); if (dow === 0 || dow === 6) continue;
    let mins = 0, leave = false;
    for (const e of userDayEntries(d, c.id, uid, ds)) { if (e.category === 'holiday' || e.category === 'absent') leave = true; else if (e.category !== 'lunch') mins += ((e.end || t) - e.start) / 60000; }
    if (!leave && mins < need) missing.push(ds);
  }
  if (ym === curYm) return { s: 'progress', missing };
  if ((d.sheetUploads || {})[uid + '_' + ym]) return { s: 'complete', uploaded: true };
  return missing.length ? { s: 'incomplete', missing } : { s: 'complete' };
}
// The first day each person logged anything (kept for a minute; cheap to rebuild).
const firstCache = new Map();
function firstLogged(cid) {
  const hit = firstCache.get(cid); if (hit && Date.now() - hit.at < 60e3) return hit.map;
  const map = new Map();
  for (const k of idxFor(cid).byUserDay.keys()) { const i = k.indexOf('|'); const u = k.slice(0, i), ds = k.slice(i + 1); const cur = map.get(u); if (!cur || ds < cur) map.set(u, ds); }
  firstCache.set(cid, { at: Date.now(), map }); return map;
}
function sheetStatusAll(c, d, uids) {
  const cur = localDay(now()).slice(0, 7); let first = cur;
  for (const id of uids) { const f = firstLogged(c.id).get(id); if (f && f.slice(0, 7) < first) first = f.slice(0, 7); }
  const [cy, cm] = cur.split('-').map(Number); const next = cm === 12 ? `${cy + 1}-01` : `${cy}-${pad2(cm + 1)}`;
  const out = {};
  for (let ym = first; ym <= next; ) {
    out[ym] = {}; for (const id of uids) { const st = sheetStatus(c, d, id, ym); if (st.s !== 'none') out[ym][id] = st; }
    const [y, m] = ym.split('-').map(Number); ym = m === 12 ? `${y + 1}-01` : `${y}-${pad2(m + 1)}`;
  }
  return out;
}
// At the start of each month (and every Monday after) remind people whose timesheets aren't filled in, and tell the admins.
function sheetAlerts(c, d, nowLocal) {
  if (nowLocal.mins < 9 * 60) return;
  const cur = nowLocal.date.slice(0, 7); const [y, m] = cur.split('-').map(Number); const prev = m === 1 ? `${y - 1}-12` : `${y}-${pad2(m - 1)}`;
  const monday = new Date(nowLocal.date + 'T12:00:00Z').getUTCDay() === 1;
  const monthly = c.sheetAlert !== prev; const weekly = monday && c.sheetNag !== nowLocal.date;
  if (!monthly && !weekly) return;
  if (monthly) c.sheetAlert = prev; if (weekly) c.sheetNag = nowLocal.date; save();
  const months = monthly && !weekly ? [prev] : Object.keys(sheetStatusAll(c, d, Object.keys(c.members))).filter((ym) => ym < cur).slice(-3);
  const bad = [];
  for (const ym of months) for (const id of Object.keys(c.members)) {
    const st = sheetStatus(c, d, id, ym); if (st.s !== 'incomplete') continue;
    bad.push(`${personNameOf(id)} (${ts.MONTHS[Number(ym.slice(5)) - 1]})`);
    notify(c.id, [id], `Your ${ts.MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)} timesheet isn’t finished — ${st.missing.length} working day${st.missing.length === 1 ? '' : 's'} with no time logged. Please fill them in.`, '#/timesheet/' + ym);
  }
  if (bad.length) notify(c.id, Object.keys(c.members).filter((id) => isAdmin(c.members[id].role)), `${bad.length} timesheet${bad.length === 1 ? ' isn’t' : 's aren’t'} finished: ${bad.slice(0, 6).join(', ')}${bad.length > 6 ? '…' : ''}`, '#/admin/timesheets');
}
// ---------------------------------------------------------------- manhole maps
// Company-wide presets (anyone can make and edit them) are kept apart from each project's maps and manhole records,
// which only people who can see that project can open. Records keep a history and a version per field, so two
// people editing the same manhole can't silently overwrite each other.
const MH_DEFAULT_PRESETS = [
  ['Fire water', '#e5484d', 'hydrant', 'Fire Hydrant', 'Fire hydrants and fire mains'],
  ['Clean water', '#2f7de1', 'tap', 'Water Tap', 'Potable water supply'],
  ['Surface water', '#30a46c', 'drop', 'Water Drop', 'Rainwater and surface water drainage'],
  ['Foul water', '#8d5a33', 'drain', 'Drain', 'Foul sewage'],
  ['Combined sewer', '#8e4ec6', 'pipe', 'Sewer Pipe', 'Combined foul and surface water'],
  ['Unknown', '#868e96', 'question', 'Question Mark', 'Type not yet identified'],
];
const MH_STATUS = ['not_started', 'in_progress', 'completed'];
const MH_SURVEY = { coverLevel: 'num', invertLevel: 'num', depth: 'num', diameter: 'num', material: 'text', pipeDirection: 'text', pipeDiameter: 'num',
  pipesIn: 'int', pipesOut: 'int', condition: 'text', accessibility: 'text', observations: 'long' };
const MH_ICONS = new Set(['hydrant', 'tap', 'drop', 'drain', 'pipe', 'question', 'valve', 'cover', 'warning', 'bolt', 'gas', 'telecom', 'chamber', 'pump', 'meter', 'cable', 'fibre', 'lamp', 'tree', 'flag', 'star', 'grid', 'arrow', 'cross', 'gully', 'outfall', 'interceptor', 'soakaway']);
function mhSeed(cid, d) {
  d.mhPresets = d.mhPresets || {}; d.mhMaps = d.mhMaps || {}; d.manholes = d.manholes || {};
  if (d.mhSeeded) return;
  d.mhSeeded = true; const t = now(); const c = db.companies[cid];
  MH_DEFAULT_PRESETS.forEach(([name, colorV, icon, iconName, description], i) => { const id = uid(); d.mhPresets[id] = { id, cid, name, color: colorV, icon, iconName, description, category: 'Drainage & water', order: i, builtIn: true, createdBy: c ? c.ownerId : '', createdAt: t, updatedBy: '', updatedAt: t }; });
}
const mhNum = (v, kind) => { if (v === '' || v == null) return null; const n = Number(v); if (!Number.isFinite(n)) bad('Enter a number'); return kind === 'int' ? Math.max(0, Math.round(n)) : Math.round(n * 1000) / 1000; };
const mhLat = (v) => { const n = Number(v); if (!Number.isFinite(n) || n < -90 || n > 90) bad('Latitude must be between -90 and 90'); return Math.round(n * 1e7) / 1e7; };
const mhLng = (v) => { const n = Number(v); if (!Number.isFinite(n) || n < -180 || n > 180) bad('Longitude must be between -180 and 180'); return Math.round(n * 1e7) / 1e7; };
const touchMh = (cid, mapId) => touch('manholes', cid, mapId);
function mhMapFor(x, id) { const mp = x.d.mhMaps && x.d.mhMaps[id]; if (!mp || !canSeeTask(x, mp)) notFound('That manhole map doesn’t exist, or you don’t have access to its project'); return mp; }
function mhFor(x, id) { const r = x.d.manholes && x.d.manholes[id]; if (!r || !canSeeTask(x, r)) notFound('That manhole doesn’t exist, or you don’t have access to its project'); return r; }
function mhLog(mp, by, action, detail) { mp.log = mp.log || []; mp.log.push({ at: now(), by, action, detail: str(detail, 300) }); if (mp.log.length > 1000) mp.log.splice(0, mp.log.length - 1000); }
function mhHist(r, by, action, detail) { r.history = r.history || []; r.history.push({ at: now(), by, action, detail: str(detail, 300) }); if (r.history.length > 300) r.history.splice(0, r.history.length - 300); if (!r.editors.includes(by)) r.editors.push(by); }
function mhSnap(r, p) { if (p) { r.type = { name: p.name, color: p.color, icon: p.icon }; } }
const MH_LABEL = { lat: 'position', lng: 'position', presetId: 'type', ref: 'reference', description: 'description', status: 'status' };
function mhApplyPatch(x, mp, r, b) {
  const changed = [];
  const set = (k, v) => { const cur = k.startsWith('survey.') ? r.survey[k.slice(7)] : r[k]; if (JSON.stringify(cur) === JSON.stringify(v)) return; if (k.startsWith('survey.')) r.survey[k.slice(7)] = v; else r[k] = v; r.fv[k] = r.v + 1; changed.push(k); };
  if ('ref' in b) { const v = str(b.ref, 20).toUpperCase() || bad('Give the manhole a reference'); if (Object.values(x.d.manholes).some((o) => o.mapId === mp.id && o.id !== r.id && !o.deleted && o.ref === v)) bad(`${v} is already used on this map`); set('ref', v); }
  if ('presetId' in b) { const p = x.d.mhPresets[b.presetId]; if (!p) bad('That manhole type no longer exists'); set('presetId', p.id); mhSnap(r, p); }
  if ('lat' in b) set('lat', mhLat(b.lat));
  if ('lng' in b) set('lng', mhLng(b.lng));
  if ('description' in b) set('description', str(b.description, 500));
  if ('status' in b) { if (!MH_STATUS.includes(b.status)) bad('Pick a status'); set('status', b.status); }
  if (b.survey && typeof b.survey === 'object') for (const [k, kind] of Object.entries(MH_SURVEY)) if (k in b.survey) set('survey.' + k, kind === 'text' ? str(b.survey[k], 120) || null : kind === 'long' ? str(b.survey[k], 3000) || null : mhNum(b.survey[k], kind));
  return changed;
}
function mhPublicMap(mp) { const o = Object.assign({}, mp); delete o.log; return o; }
function mhView(r) { return r; }

async function manholeApi(req, res, url, x, sub) {
  const M = req.method; const { c, d, user, role } = x; const cid = c.id; let m;
  const admin = isAdmin(role);
  mhSeed(cid, d);
  // ---- presets (company-wide; any employee)
  if (sub === '/mh/presets' && M === 'GET') return json(res, 200, { items: Object.values(d.mhPresets) });
  const presetBody = (b, p) => {
    if ('name' in b) p.name = str(b.name, 40) || bad('Give the type a name');
    if ('color' in b) p.color = color(b.color, '#868e96');
    if ('icon' in b) { if (!MH_ICONS.has(String(b.icon))) bad('Pick an icon from the library'); p.icon = String(b.icon); }
    if ('iconName' in b) p.iconName = str(b.iconName, 40);
    if ('description' in b) p.description = str(b.description, 300);
    if ('category' in b) p.category = str(b.category, 40) || 'Other';
  };
  if (sub === '/mh/presets' && M === 'POST') {
    const b = await readBody(req); const id = uid(); const t = now();
    const p = { id, cid, name: '', color: '#868e96', icon: 'cover', iconName: 'Manhole Cover', description: '', category: 'Other', order: Object.keys(d.mhPresets).length, createdBy: user.id, createdAt: t, updatedBy: user.id, updatedAt: t };
    presetBody(b, p); if (!p.name) bad('Give the type a name');
    d.mhPresets[id] = p; save(); upsert(cid, 'mhPresets', p);
    return json(res, 200, { item: p });
  }
  if ((m = /^\/mh\/presets\/([A-Za-z0-9]+)$/.exec(sub))) {
    const p = d.mhPresets[m[1]] || notFound('That type was deleted');
    if (M === 'PATCH') {
      const b = await readBody(req); presetBody(b, p); p.updatedBy = user.id; p.updatedAt = now();
      // records of this type pick up the new look; their history keeps what they were
      for (const r of Object.values(d.manholes)) if (r.presetId === p.id) { mhSnap(r, p); }
      save(); upsert(cid, 'mhPresets', p); return json(res, 200, { item: p });
    }
    if (M === 'DELETE') {
      if (Object.keys(d.mhPresets).length <= 1) bad('Keep at least one manhole type');
      delete d.mhPresets[p.id]; save(); removeItem(cid, 'mhPresets', p.id); // records keep their last name, colour and icon
      return json(res, 200, { ok: true });
    }
  }
  // ---- maps (one project can have many)
  if (sub === '/mh/maps' && M === 'GET') {
    const pid = url.searchParams.get('project');
    const items = Object.values(d.mhMaps).filter((mp) => (!pid || mp.projectId === pid) && canSeeTask(x, mp)).map(mhPublicMap);
    const counts = {}; for (const r of Object.values(d.manholes)) if (!r.deleted) counts[r.mapId] = (counts[r.mapId] || 0) + 1;
    return json(res, 200, { items, counts });
  }
  const mapBody = (b, mp) => {
    if ('name' in b) mp.name = str(b.name, 80) || bad('Give the map a name');
    if ('description' in b) mp.description = str(b.description, 1000);
    if ('area' in b) mp.area = str(b.area, 200);
    if ('center' in b && b.center) mp.center = { lat: mhLat(b.center.lat), lng: mhLng(b.center.lng) };
    if ('zoom' in b) { const z = Number(b.zoom); if (Number.isFinite(z)) mp.zoom = Math.max(1, Math.min(22, Math.round(z * 100) / 100)); }
    if ('layer' in b) mp.layer = ['satellite', 'hybrid', 'roadmap'].includes(b.layer) ? b.layer : 'satellite';
  };
  if (sub === '/mh/maps' && M === 'POST') {
    const b = await readBody(req);
    const p = projectOf(x, b.projectId); if (!p || !canSeeProject(x, p)) bad('Pick a project you have access to');
    const t = now(); const mp = { id: uid(), projectId: p.id, name: '', description: '', area: '', center: p.lat != null ? { lat: p.lat, lng: p.lng } : { lat: 54.97, lng: -1.61 }, zoom: p.lat != null ? 18 : 6, layer: 'satellite', seq: 0, createdBy: user.id, createdAt: t, updatedBy: user.id, updatedAt: t, log: [] };
    mapBody(b, mp); if (!mp.name) bad('Give the map a name');
    mhLog(mp, user.id, 'created', `Created the map “${mp.name}”`);
    d.mhMaps[mp.id] = mp; save(); upsert(cid, 'mhMaps', mhPublicMap(mp));
    return json(res, 200, { item: mhPublicMap(mp) });
  }
  if ((m = /^\/mh\/maps\/([A-Za-z0-9]+)$/.exec(sub))) {
    const mp = mhMapFor(x, m[1]);
    if (M === 'GET') return json(res, 200, { item: mhPublicMap(mp), manholes: Object.values(d.manholes).filter((r) => r.mapId === mp.id && (!r.deleted || url.searchParams.get('deleted') === '1')) });
    if (M === 'PATCH') {
      const b = await readBody(req); const before = mp.name; mapBody(b, mp);
      const view = ('center' in b || 'zoom' in b || 'layer' in b) && !('name' in b || 'description' in b || 'area' in b);
      if (!view) { mp.updatedBy = user.id; mp.updatedAt = now(); mhLog(mp, user.id, 'map-edited', before !== mp.name ? `Renamed the map to “${mp.name}”` : 'Edited the map details'); }
      save(); if (!view) upsert(cid, 'mhMaps', mhPublicMap(mp)); return json(res, 200, { item: mhPublicMap(mp) });
    }
    if (M === 'DELETE') {
      if (!(admin || mp.createdBy === user.id)) deny('Only the person who made this map, or an admin, can delete it');
      for (const r of Object.values(d.manholes)) if (r.mapId === mp.id) { for (const ph of r.photos || []) { dropFile(ph.url); if (ph.thumb !== ph.url) dropFile(ph.thumb); } delete d.manholes[r.id]; }
      delete d.mhMaps[mp.id]; touchMh(cid, mp.id); save(); removeItem(cid, 'mhMaps', mp.id);
      return json(res, 200, { ok: true });
    }
  }
  if ((m = /^\/mh\/maps\/([A-Za-z0-9]+)\/activity$/.exec(sub)) && M === 'GET') {
    const mp = mhMapFor(x, m[1]); const out = (mp.log || []).map((l) => Object.assign({ ref: '' }, l));
    for (const r of Object.values(d.manholes)) if (r.mapId === mp.id) for (const h of r.history || []) out.push(Object.assign({ ref: r.ref, mhId: r.id }, h));
    out.sort((a, b) => b.at - a.at);
    return json(res, 200, { items: out.slice(0, 400) });
  }
  // ---- manholes
  if ((m = /^\/mh\/maps\/([A-Za-z0-9]+)\/manholes$/.exec(sub)) && M === 'POST') {
    const mp = mhMapFor(x, m[1]); const b = await readBody(req);
    const p = d.mhPresets[b.presetId] || Object.values(d.mhPresets).find((q) => q.name === 'Unknown') || Object.values(d.mhPresets)[0];
    const used = new Set(Object.values(d.manholes).filter((o) => o.mapId === mp.id && !o.deleted).map((o) => o.ref));
    let ref = str(b.ref, 20).toUpperCase();
    if (ref && used.has(ref)) bad(`${ref} is already used on this map`);
    if (!ref) { do { mp.seq = (mp.seq || 0) + 1; ref = 'MH' + String(mp.seq).padStart(3, '0'); } while (used.has(ref)); }
    const t = now();
    const r = { id: uid(), mapId: mp.id, projectId: mp.projectId, ref, presetId: p ? p.id : '', type: null, lat: mhLat(b.lat), lng: mhLng(b.lng), description: '', status: 'not_started', survey: {}, photos: [], notes: [],
      createdBy: user.id, createdAt: t, updatedBy: user.id, updatedAt: t, editors: [user.id], v: 1, fv: {}, history: [] };
    for (const k of Object.keys(MH_SURVEY)) r.survey[k] = null;
    mhSnap(r, p);
    if ('description' in b) r.description = str(b.description, 500);
    if (b.status && MH_STATUS.includes(b.status)) r.status = b.status;
    mhHist(r, user.id, 'created', `Added ${ref} (${r.type ? r.type.name : 'no type'}) at ${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}`);
    d.manholes[r.id] = r; mp.updatedAt = t; touchMh(cid, mp.id); save(); upsert(cid, 'manholes', r);
    return json(res, 200, { item: r });
  }
  if ((m = /^\/mh\/manholes\/([A-Za-z0-9]+)$/.exec(sub))) {
    const r = mhFor(x, m[1]); const mp = mhMapFor(x, r.mapId);
    if (M === 'GET') return json(res, 200, { item: r });
    if (M === 'PATCH') {
      if (r.deleted) bad('That manhole was deleted — restore it first');
      const b = await readBody(req); const base = Number(b.base) || 0;
      // Someone else changed one of these same fields since you opened it: stop and show both.
      const sent = []; for (const k of Object.keys(b)) if (k !== 'base' && k !== 'survey') sent.push(k); if (b.survey) for (const k of Object.keys(b.survey)) sent.push('survey.' + k);
      const clash = base ? sent.filter((k) => (r.fv[k] || 0) > base) : [];
      if (clash.length && !b.force) throw new HttpError(409, 'Someone else changed this manhole while you were editing it. Check their changes, then save again.', { conflict: clash, item: r });
      const before = { lat: r.lat, lng: r.lng, status: r.status, type: r.type && r.type.name, ref: r.ref };
      const changed = mhApplyPatch(x, mp, r, b);
      if (!changed.length) return json(res, 200, { item: r });
      r.v++; r.updatedBy = user.id; r.updatedAt = now();
      if (changed.includes('lat') || changed.includes('lng')) mhHist(r, user.id, 'moved', `Moved ${r.ref} from ${before.lat.toFixed(6)}, ${before.lng.toFixed(6)} to ${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}`);
      if (changed.includes('status')) mhHist(r, user.id, 'status', `Status: ${before.status.replace('_', ' ')} → ${r.status.replace('_', ' ')}`);
      if (changed.includes('presetId')) mhHist(r, user.id, 'type', `Type: ${before.type || '—'} → ${r.type ? r.type.name : '—'}`);
      if (changed.includes('ref')) mhHist(r, user.id, 'ref', `Reference: ${before.ref} → ${r.ref}`);
      const other = changed.filter((k) => !['lat', 'lng', 'status', 'presetId', 'ref'].includes(k));
      if (other.length) mhHist(r, user.id, 'edited', 'Edited ' + [...new Set(other.map((k) => MH_LABEL[k] || k.replace('survey.', '').replace(/([A-Z])/g, ' $1').toLowerCase()))].join(', '));
      touchMh(cid, r.mapId); save(); upsert(cid, 'manholes', r);
      return json(res, 200, { item: r, changed });
    }
    if (M === 'DELETE') { // kept with its history (and photos) so it can be restored
      if (r.deleted) return json(res, 200, { item: r });
      r.deleted = { by: user.id, at: now() }; r.v++; mhHist(r, user.id, 'deleted', `Deleted ${r.ref}`); mhLog(mp, user.id, 'deleted', `Deleted ${r.ref}`);
      touchMh(cid, r.mapId); save(); upsert(cid, 'manholes', r); return json(res, 200, { item: r });
    }
  }
  if ((m = /^\/mh\/manholes\/([A-Za-z0-9]+)\/restore$/.exec(sub)) && M === 'POST') {
    const r = mhFor(x, m[1]); if (!r.deleted) return json(res, 200, { item: r });
    if (Object.values(d.manholes).some((o) => o.mapId === r.mapId && o.id !== r.id && !o.deleted && o.ref === r.ref)) { const mp = d.mhMaps[r.mapId]; mp.seq = (mp.seq || 0) + 1; r.ref = 'MH' + String(mp.seq).padStart(3, '0'); }
    delete r.deleted; r.v++; mhHist(r, user.id, 'restored', `Restored ${r.ref}`); touchMh(cid, r.mapId); save(); upsert(cid, 'manholes', r); return json(res, 200, { item: r });
  }
  if ((m = /^\/mh\/manholes\/([A-Za-z0-9]+)\/notes$/.exec(sub)) && M === 'POST') {
    const r = mhFor(x, m[1]); const b = await readBody(req); const text = str(b.text, 2000) || bad('Write a note first');
    const n = { id: uid(), by: user.id, at: now(), text }; r.notes = r.notes || []; r.notes.push(n); r.updatedAt = now(); mhHist(r, user.id, 'note', `Added a note: “${text.slice(0, 80)}${text.length > 80 ? '…' : ''}”`);
    touchMh(cid, r.mapId); save(); upsert(cid, 'manholes', r); return json(res, 200, { item: r });
  }
  if ((m = /^\/mh\/manholes\/([A-Za-z0-9]+)\/notes\/([A-Za-z0-9]+)$/.exec(sub)) && M === 'DELETE') {
    const r = mhFor(x, m[1]); const n = (r.notes || []).find((q) => q.id === m[2]) || notFound('That note was already deleted');
    if (!(admin || n.by === user.id)) deny('Only the person who wrote it, or an admin, can delete this note');
    r.notes = r.notes.filter((q) => q.id !== n.id); mhHist(r, user.id, 'note-deleted', 'Deleted a note'); touchMh(cid, r.mapId); save(); upsert(cid, 'manholes', r); return json(res, 200, { item: r });
  }
  if ((m = /^\/mh\/manholes\/([A-Za-z0-9]+)\/photos$/.exec(sub)) && M === 'POST') {
    const r = mhFor(x, m[1]); throttle('mhphoto:' + user.id, 400, 3600e3, 'You’ve uploaded a lot of photos — wait a while and try again');
    const b = await readBody(req, 12 * 1024 * 1024);
    const ref = { kind: 'photo', cid, project: r.projectId };
    const urlFull = await saveImage(b.image, 8 * 1024 * 1024, ref);
    const thumb = b.thumb ? await saveImage(b.thumb, 700 * 1024, ref) : urlFull;
    const ph = { id: uid(), url: urlFull, thumb, caption: str(b.caption, 300), w: Math.round(Number(b.w) || 0), h: Math.round(Number(b.h) || 0), takenAt: Number(b.takenAt) || 0, by: user.id, at: now() };
    r.photos = r.photos || []; r.photos.push(ph); r.updatedAt = now(); mhHist(r, user.id, 'photo', `Added a photo${ph.caption ? ': ' + ph.caption : ''}`);
    touchMh(cid, r.mapId); save(); upsert(cid, 'manholes', r); return json(res, 200, { item: r, photo: ph });
  }
  if ((m = /^\/mh\/manholes\/([A-Za-z0-9]+)\/photos\/([A-Za-z0-9]+)$/.exec(sub))) {
    const r = mhFor(x, m[1]); const ph = (r.photos || []).find((q) => q.id === m[2]) || notFound('That photo was already deleted');
    if (M === 'PATCH') { const b = await readBody(req); ph.caption = str(b.caption, 300); mhHist(r, user.id, 'photo-caption', 'Changed a photo caption'); touchMh(cid, r.mapId); save(); upsert(cid, 'manholes', r); return json(res, 200, { item: r }); }
    if (M === 'DELETE') {
      if (!(admin || ph.by === user.id)) deny('Only the person who added it, or an admin, can remove this photo');
      r.photos = r.photos.filter((q) => q.id !== ph.id); dropFile(ph.url); if (ph.thumb !== ph.url) dropFile(ph.thumb);
      mhHist(r, user.id, 'photo-removed', 'Removed a photo'); touchMh(cid, r.mapId); save(); upsert(cid, 'manholes', r); return json(res, 200, { item: r });
    }
  }
  // ---- exports
  if ((m = /^\/mh\/maps\/([A-Za-z0-9]+)\/(register\.xlsx|index\.pdf|map\.pdf|report\.pdf)$/.exec(sub)) && M === 'GET') {
    const mp = mhMapFor(x, m[1]); const p = d.projects[mp.projectId] || {};
    const fields = (url.searchParams.get('fields') || '').split(',').filter(Boolean);
    const list = Object.values(d.manholes).filter((r) => r.mapId === mp.id && !r.deleted).sort((a, b) => a.ref.localeCompare(b.ref, 'en', { numeric: true }));
    const base = ts.safeName(`${p.ref ? p.ref + ' ' : ''}${mp.name}`);
    if (m[2] === 'register.xlsx') return sendDownload(res, base + ' manhole register.xlsx', mhRegister(x, mp, p, list, fields));
    const what = m[2].split('.')[0]; if (what === 'report' && url.searchParams.get('photos') !== '0') await mhLoadPhotos(list); else mhPhotoCache.clear();
    const bg = what !== 'index' && url.searchParams.get('bg') !== '0' ? await mhStaticMap(list, mp).catch(() => null) : null;
    return sendDownload(res, base + (what === 'index' ? ' manhole index.pdf' : what === 'map' ? ' manhole map.pdf' : ' manhole report.pdf'), mhPdf(x, mp, p, list, fields, what, bg), 'application/pdf');
  }
  notFound();
}

// ---- exports
const MH_FIELDS = [
  ['ref', 'Ref'], ['type', 'Type'], ['lat', 'Latitude'], ['lng', 'Longitude'], ['status', 'Status'], ['description', 'Description'],
  ['coverLevel', 'Cover level (m)'], ['invertLevel', 'Invert level (m)'], ['depth', 'Depth (m)'], ['diameter', 'Diameter (mm)'], ['material', 'Material'],
  ['pipeDirection', 'Pipe direction'], ['pipeDiameter', 'Pipe diameter (mm)'], ['pipesIn', 'Pipes in'], ['pipesOut', 'Pipes out'], ['condition', 'Condition'],
  ['accessibility', 'Accessibility'], ['observations', 'Observations'], ['notes', 'Notes'], ['photos', 'Photos'], ['createdBy', 'Recorded by'], ['createdAt', 'Recorded'], ['updatedAt', 'Last updated'],
];
const MH_DEFAULT_FIELDS = ['ref', 'type', 'lat', 'lng', 'status', 'coverLevel', 'invertLevel', 'depth', 'condition'];
const MH_STATUS_LABEL = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed' };
function mhTypeOf(d, r) { const p = d.mhPresets[r.presetId]; return p ? { name: p.name, color: p.color } : r.type || { name: 'Unknown', color: '#868e96' }; }
function mhVal(d, r, k) {
  const dd = (t) => (t ? new Date(t).toLocaleDateString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }) : '');
  switch (k) {
    case 'ref': return r.ref; case 'type': return mhTypeOf(d, r).name; case 'lat': return r.lat; case 'lng': return r.lng;
    case 'status': return MH_STATUS_LABEL[r.status] || r.status; case 'description': return r.description || '';
    case 'notes': return (r.notes || []).map((n) => `${personNameOf(n.by)}: ${n.text}`).join(' | ');
    case 'photos': return (r.photos || []).length; case 'createdBy': return personNameOf(r.createdBy);
    case 'createdAt': return dd(r.createdAt); case 'updatedAt': return dd(r.updatedAt);
    default: { const v = r.survey ? r.survey[k] : null; return v == null ? '' : v; }
  }
}
function mhFieldList(fields) { const ok = MH_FIELDS.filter(([k]) => fields.includes(k)); return ok.length ? ok : MH_FIELDS.filter(([k]) => MH_DEFAULT_FIELDS.includes(k)); }
function mhRegister(x, mp, p, list, fields) {
  const cols = mhFieldList(fields); const d = x.d;
  const head = cols.map(([, l]) => ({ v: l, s: 'head' }));
  const rows = [[{ v: `${mp.name} — manhole register`, s: 'title' }], [`${p.ref ? p.ref + ' · ' : ''}${p.name || ''}${mp.area ? ' · ' + mp.area : ''}`], [`Exported ${new Date().toLocaleString('en-GB', { timeZone: TZ })} · ${list.length} manholes · coordinates WGS84 (decimal degrees)`], [], head]
    .concat(list.map((r) => cols.map(([k]) => { const v = mhVal(d, r, k); return typeof v === 'number' ? v : String(v); })));
  const byType = {}; for (const r of list) { const t = mhTypeOf(d, r).name; byType[t] = byType[t] || { n: 0, done: 0 }; byType[t].n++; if (r.status === 'completed') byType[t].done++; }
  const sum = [[{ v: 'Summary', s: 'title' }], [], [{ v: 'Type', s: 'head' }, { v: 'Manholes', s: 'head' }, { v: 'Completed', s: 'head' }]].concat(Object.entries(byType).map(([t, o]) => [t, o.n, o.done]))
    .concat([[], [{ v: 'Total', s: 'bold' }, { v: list.length, s: 'bold' }, { v: list.filter((r) => r.status === 'completed').length, s: 'bold' }]]);
  return ts.buildXlsx([{ name: 'Register', cols: cols.map(([k]) => (['description', 'observations', 'notes'].includes(k) ? 40 : k === 'type' ? 18 : k === 'lat' || k === 'lng' ? 13 : 12)), rows, freeze: 5 },
    { name: 'Summary', cols: [24, 12, 12], rows: sum }], `${mp.name} manhole register`);
}
// A satellite picture behind the labelled map, from Google's Static Maps when a key is set (optional).
const STATIC_KEY = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_MAPS_KEY || '';
const merc = (lat, lng, z) => { const s = Math.sin((lat * Math.PI) / 180); const n = 256 * 2 ** z; return { x: ((lng + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n }; };
function mhFit(list, mp, W, H) {
  const pts = list.length ? list : [mp.center];
  const la = pts.map((r) => r.lat), ln = pts.map((r) => r.lng);
  const c = { lat: (Math.min(...la) + Math.max(...la)) / 2, lng: (Math.min(...ln) + Math.max(...ln)) / 2 };
  let z = 21; for (; z > 2; z--) { const a = merc(Math.max(...la), Math.min(...ln), z), b = merc(Math.min(...la), Math.max(...ln), z); if (b.x - a.x < W * 0.8 && b.y - a.y < H * 0.8) break; }
  return { c, z };
}
async function mhStaticMap(list, mp) {
  if (typeof fetch !== 'function') return null;
  const { c, z } = mhFit(list, mp, 640, 640);
  if (!STATIC_KEY || overFree('gStatic')) { // free Esri imagery for the same area
    try { const R = 6378137, x = c.lng * Math.PI / 180 * R, y = Math.log(Math.tan(Math.PI / 4 + c.lat * Math.PI / 360)) * R, h = 320 * 156543.03392804097 / 2 ** z;
      const r = await fetch(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${x - h},${y - h},${x + h},${y + h}&bboxSR=3857&imageSR=3857&size=1280,1280&format=jpg&f=image`);
      if (!r.ok || !/jpeg/.test(r.headers.get('content-type') || '')) return null; return { data: Buffer.from(await r.arrayBuffer()), w: 1280, h: 1280, c, z }; } catch (_) { return null; }
  }
  countUse('gStatic');
  const u = `https://maps.googleapis.com/maps/api/staticmap?center=${c.lat},${c.lng}&zoom=${z}&size=640x640&scale=2&maptype=satellite&format=jpg&key=${encodeURIComponent(STATIC_KEY)}`;
  const r = await fetch(u); if (!r.ok || !/jpeg/.test(r.headers.get('content-type') || '')) return null;
  return { data: Buffer.from(await r.arrayBuffer()), w: 1280, h: 1280, c, z };
}
function mhDrawMap(doc, d, list, mp, bg, top, size) {
  const x0 = doc.m + (doc.inner - size) / 2, y0 = top - size;
  let proj; let zUsed;
  if (bg) { const C = merc(bg.c.lat, bg.c.lng, bg.z); zUsed = bg.z; proj = (r) => { const p = merc(r.lat, r.lng, bg.z); return { x: x0 + size / 2 + ((p.x - C.x) / 640) * size, y: y0 + size / 2 - ((p.y - C.y) / 640) * size }; }; doc.image(bg.data, bg.w, bg.h, x0, y0, size, size); }
  else { const { c, z } = mhFit(list, mp, size, size); zUsed = z; const C = merc(c.lat, c.lng, z); doc.rect(x0, y0, size, size, '#eef3ef');
    for (let i = 1; i < 6; i++) { doc.line(x0 + (size * i) / 6, y0, x0 + (size * i) / 6, y0 + size, '#dbe4dd', 0.4); doc.line(x0, y0 + (size * i) / 6, x0 + size, y0 + (size * i) / 6, '#dbe4dd', 0.4); }
    proj = (r) => { const p = merc(r.lat, r.lng, z); return { x: x0 + size / 2 + (p.x - C.x), y: y0 + size / 2 - (p.y - C.y) }; }; }
  for (const r of list) {
    const p = proj(r); if (p.x < x0 || p.x > x0 + size || p.y < y0 || p.y > y0 + size) continue;
    const t = mhTypeOf(d, r); doc.circle(p.x, p.y, 4.2, t.color, '#ffffff', 1.1);
    const lw = doc.textWidth(r.ref, 7, true) + 6; doc.rect(p.x + 5.5, p.y - 4.5, lw, 9.5, '#ffffff'); doc.text(r.ref, p.x + 8.5, p.y - 1.6, 7, { bold: true, color: '#1d2421' });
  }
  // north arrow and scale bar
  doc.rect(x0 + size - 30, y0 + size - 40, 22, 32, '#ffffff'); doc.text('N', x0 + size - 22.5, y0 + size - 20, 10, { bold: true }); doc.line(x0 + size - 19, y0 + size - 35, x0 + size - 19, y0 + size - 24, '#1d2421', 1.4);
  const mPerPt = (156543.03392 * Math.cos((((list[0] || mp.center).lat) * Math.PI) / 180)) / 2 ** zUsed * (bg ? 640 / size : 1);
  const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find((v) => v / mPerPt > 50) || 5000; const len = nice / mPerPt;
  doc.rect(x0 + 8, y0 + 8, len + 16, 22, '#ffffff'); doc.rect(x0 + 16, y0 + 14, len, 3, '#1d2421'); doc.text(nice >= 1000 ? nice / 1000 + ' km' : nice + ' m', x0 + 16, y0 + 20, 7.5, { bold: true });
  return y0;
}
function mhPdf(x, mp, p, list, fields, what, bg) {
  const { Doc } = require('./lib/pdf'); const d = x.d;
  const doc = new Doc({ footer: `Crewdesk - ${x.c.name} - ${mp.name}` });
  doc.rect(0, doc.h - 96, doc.w, 96, '#0f4f2f');
  doc.text(what === 'index' ? 'MANHOLE INDEX' : what === 'map' ? 'LABELLED MANHOLE MAP' : 'MANHOLE SURVEY REPORT', doc.m, doc.h - 36, 9, { bold: true, color: '#9fd3b5' });
  doc.text(doc.fit(mp.name, doc.inner, 22, true), doc.m, doc.h - 62, 22, { bold: true, color: '#ffffff' });
  doc.text(`${p.ref ? p.ref + ' · ' : ''}${p.name || ''}${mp.area ? ' · ' + mp.area : ''}  -  ${new Date().toLocaleDateString('en-GB', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' })}`, doc.m, doc.h - 82, 9, { color: '#cfe8d8' });
  doc.y = doc.h - 110;
  const done = list.filter((r) => r.status === 'completed').length, prog = list.filter((r) => r.status === 'in_progress').length;
  if (what !== 'map') doc.stats([['Manholes', String(list.length)], ['Completed', String(done)], ['In progress', String(prog)], ['Not started', String(list.length - done - prog)]]);
  if (what === 'map' || what === 'report') {
    const size = what === 'map' ? doc.inner : Math.min(doc.inner, 380);
    if (what === 'report') doc.heading('Labelled map');
    doc.ensure(size + 30); const top = doc.y - 6; mhDrawMap(doc, d, list, mp, bg, top, size); doc.y = top - size - 10;
    const types = {}; for (const r of list) { const t = mhTypeOf(d, r); types[t.name] = t.color; }
    let lx = doc.m; doc.ensure(16); doc.y -= 10; for (const [n, col] of Object.entries(types)) { const w = doc.textWidth(n, 8) + 22; if (lx + w > doc.w - doc.m) { lx = doc.m; doc.y -= 13; } doc.circle(lx + 4, doc.y + 3, 3.5, col, '#ffffff', 0.8); doc.text(n, lx + 11, doc.y, 8); lx += w; }
    doc.y -= 6; doc.para(bg ? 'Satellite imagery: Google. Positions in WGS84.' : 'Positions plotted from WGS84 coordinates (no background imagery).', 7.5, { color: '#667a6f' });
    if (what === 'map') {
      doc.heading('Key');
      doc.table([{ label: 'Ref', w: 1 }, { label: 'Type', w: 2 }, { label: 'Status', w: 1.3 }, { label: 'Lat', w: 1.4, align: 'r' }, { label: 'Lng', w: 1.4, align: 'r' }], list.map((r) => [r.ref, mhTypeOf(d, r).name, MH_STATUS_LABEL[r.status], r.lat.toFixed(6), r.lng.toFixed(6)]), { size: 8 });
      return doc.build();
    }
  }
  const cols = mhFieldList(fields);
  doc.heading('Manhole index');
  const narrow = cols.filter(([k]) => !['description', 'observations', 'notes'].includes(k)).slice(0, 9);
  doc.table(narrow.map(([k, l]) => ({ label: l, w: k === 'type' ? 2 : k === 'lat' || k === 'lng' ? 1.6 : k === 'status' ? 1.4 : 1, align: ['lat', 'lng', 'coverLevel', 'invertLevel', 'depth', 'diameter', 'pipeDiameter', 'pipesIn', 'pipesOut', 'photos'].includes(k) ? 'r' : undefined })),
    list.map((r) => narrow.map(([k]) => { const v = mhVal(d, r, k); return typeof v === 'number' ? (k === 'lat' || k === 'lng' ? v.toFixed(6) : String(v)) : String(v); })), { size: 7.5 });
  if (what === 'report') {
    for (const r of list) {
      doc.ensure(120); const t = mhTypeOf(d, r);
      doc.heading(`${r.ref} - ${t.name}`, '#0f4f2f');
      const kv = [['Status', MH_STATUS_LABEL[r.status]], ['Position', `${r.lat.toFixed(7)}, ${r.lng.toFixed(7)}`], ['Description', r.description || '-']]
        .concat(MH_FIELDS.filter(([k]) => r.survey && r.survey[k] != null && r.survey[k] !== '').map(([k, l]) => [l, String(r.survey[k])]))
        .concat([['Recorded', `${mhVal(d, r, 'createdAt')} by ${personNameOf(r.createdBy)}`], ['Edited by', [...new Set(r.editors || [])].map(personNameOf).join(', ')], ['Last updated', mhVal(d, r, 'updatedAt')]]);
      for (const [k, v] of kv) { const ls = doc.wrap(v, doc.inner - 110, 9); doc.ensure(13 * ls.length + 2); doc.y -= 13; doc.text(k, doc.m, doc.y, 9, { bold: true, color: '#53625a' }); ls.forEach((l, i) => { if (i) doc.y -= 12; doc.text(l, doc.m + 110, doc.y, 9); }); }
      if ((r.notes || []).length) { doc.y -= 6; doc.para('Notes', 9, { bold: true, after: 1 }); for (const n of r.notes) doc.para(`${new Date(n.at).toLocaleDateString('en-GB', { timeZone: TZ })} ${personNameOf(n.by)}: ${n.text}`, 8.5, { color: '#3b4a42', after: 1 }); }
      const phs = (r.photos || []).slice(0, 6);
      if (phs.length) {
        doc.y -= 8; const w = (doc.inner - 16) / 3, h = w * 0.75; let i = 0;
        for (const ph of phs) {
          const f = mhPhotoCache.get(ph.thumb); if (!f) continue;
          if (i % 3 === 0) { doc.ensure(h + 26); doc.y -= h; }
          const xx = doc.m + (i % 3) * (w + 8); doc.image(f.data, f.w, f.h, xx, doc.y, w, h, true);
          if (ph.caption) doc.text(doc.fit(ph.caption, w, 7.5), xx, doc.y - 10, 7.5, { color: '#53625a' });
          if (i % 3 === 2 || i === phs.length - 1) doc.y -= 16; i++;
        }
      }
    }
  }
  return doc.build();
}
// Photo thumbnails for the PDF report are fetched just before it's made (they may live in R2).
const mhPhotoCache = new Map();
async function mhLoadPhotos(list) {
  mhPhotoCache.clear();
  for (const r of list) for (const ph of (r.photos || []).slice(0, 6)) {
    try { const f = await storage.getFile(path.basename(ph.thumb)); if (f && /jpeg/.test(f.type)) { const dim = jpegSize(f.data); if (dim) mhPhotoCache.set(ph.thumb, { data: f.data, w: dim.w, h: dim.h }); } } catch (_) {}
  }
}
function jpegSize(b) { let i = 2; while (i < b.length) { if (b[i] !== 0xff) return null; const mk = b[i + 1]; const len = b.readUInt16BE(i + 2); if (mk >= 0xc0 && mk <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; i += 2 + len; } return null; }

// ---------------------------------------------------------------- time tracking & timesheets
const CAT_KEYS = Object.keys(ts.CATS);
const pad2 = (n) => String(n).padStart(2, '0');
const localDay = (t) => ts.zoneParts(t, TZ).date;
// An entry's day (company time zone), worked out once and kept on the entry.
function entryDay(e) { return e.day || (e.day = ts.zoneParts(e.start, TZ).date); }
const ukClock = (t) => new Date(t).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const ukDay = (t) => new Date(t).toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
const minute = (t) => Math.floor(t / 60000) * 60000;
const personNameOf = (id) => (db.users[id] || {}).name || 'Former member';
// Quick lookups kept alongside the data (rebuilt on start): each person's entries by day, the running timers,
// and the time logged on each task and project (finished, paid time only — running time is added on screen).
const IDX = new Map();
function idxFor(cid) {
  let x = IDX.get(cid);
  if (!x) {
    x = { byUserDay: new Map(), running: new Set(), tasks: {}, projects: {} };
    IDX.set(cid, x);
    for (const e of Object.values(cdata(cid).entries)) idxAdd(x, e);
  }
  return x;
}
const paidMins = (e) => (e && e.end && (ts.CATS[e.category] || {}).paid ? Math.max(0, (e.end - e.start) / 60000) : 0);
function idxAdd(x, e, sign = 1) {
  const k = e.userId + '|' + entryDay(e);
  let set = x.byUserDay.get(k);
  if (sign > 0) { if (!set) x.byUserDay.set(k, (set = new Set())); set.add(e.id); if (!e.end) x.running.add(e.id); else x.running.delete(e.id); }
  else { if (set) { set.delete(e.id); if (!set.size) x.byUserDay.delete(k); } x.running.delete(e.id); }
  const m = paidMins(e) * sign;
  if (m && e.taskId) x.tasks[e.taskId] = Math.round(((x.tasks[e.taskId] || 0) + m) * 100) / 100;
  if (m && e.projectId) x.projects[e.projectId] = Math.round(((x.projects[e.projectId] || 0) + m) * 100) / 100;
}
// Every change to a time entry goes through here: lookups, totals, saving and live updates.
function putEntry(c, e, before) {
  const x = idxFor(c.id); const d = cdata(c.id);
  if (before) { idxAdd(x, before, -1); touchEntry(c.id, before); }
  e.day = localDay(e.start);
  d.entries[e.id] = e; idxAdd(x, e); touchEntry(c.id, e);
  upsert(c.id, 'entries', e); sendTotals(c, [before, e]);
}
function delEntry(c, e) {
  const x = idxFor(c.id); idxAdd(x, e, -1); touchEntry(c.id, e);
  delete cdata(c.id).entries[e.id]; removeItem(c.id, 'entries', e.id); sendTotals(c, [e]);
}
function sendTotals(c, list) {
  const x = idxFor(c.id); const tasks = {}, projects = {};
  for (const e of list) { if (!e) continue; if (e.taskId) tasks[e.taskId] = x.tasks[e.taskId] || 0; if (e.projectId) projects[e.projectId] = x.projects[e.projectId] || 0; }
  if (Object.keys(tasks).length || Object.keys(projects).length) broadcast(c.id, { t: 'totals', tasks, projects });
}
function userDayEntries(d, cid, userId, ds) { const set = idxFor(cid).byUserDay.get(userId + '|' + ds); return set ? [...set].map((id) => d.entries[id]).filter(Boolean) : []; }
function runningFor(d, userId, cid) {
  for (const id of idxFor(cid || Object.keys(db.data).find((k) => db.data[k] === d)).running) { const e = d.entries[id]; if (e && e.userId === userId && !e.end) return e; }
  return null;
}
function checkOverlap(d, e, ignoreId, cid) {
  const end = e.end || now();
  const near = [];
  for (const k of [-1, 0, 1]) near.push(...userDayEntries(d, cid, e.userId, localDay(e.start + k * 864e5)));
  const clash = near.find((o) => o.id !== e.id && o.id !== ignoreId && o.userId === e.userId && o.start < end && (o.end || now()) > e.start);
  if (clash) bad(`That overlaps with ${(ts.CATS[clash.category] || ts.CATS.field).label.toLowerCase()} time on ${ukDay(clash.start)}, ${ukClock(clash.start)}–${clash.end ? ukClock(clash.end) : 'now'}. Change the times so they don’t overlap.`);
}
// Fill in an entry from a request body (only the fields given), checking everything.
function cleanEntry(b, x, e, exact = false) { // exact: times from the live timer keep their seconds; typed times are whole minutes
  const rnd = exact ? (t) => Math.floor(t / 1000) * 1000 : minute;
  if ('projectId' in b) {
    if (!b.projectId) e.projectId = '';
    else { const p = projectOf(x, String(b.projectId)); if (!p || !canSeeProject(x, p)) bad('That project no longer exists'); e.projectId = p.id; }
    if (!('taskId' in b) && e.taskId && (x.d.tasks[e.taskId] || {}).projectId !== e.projectId) e.taskId = '';
  }
  if ('taskId' in b) {
    if (!b.taskId) e.taskId = '';
    else { const t = x.d.tasks[String(b.taskId)]; if (!t || t.projectId !== e.projectId) bad('That task isn’t part of this project'); e.taskId = t.id; }
  }
  if ('category' in b) e.category = CAT_KEYS.includes(b.category) ? b.category : 'field';
  if ('note' in b) e.note = str(b.note, 1000);
  if ('start' in b) { const s = Number(b.start); if (!Number.isFinite(s) || s < Date.UTC(2020, 0, 1)) bad('Enter a start time'); e.start = rnd(s); }
  if ('end' in b) { if (!b.end) e.end = 0; else { const t = Number(b.end); if (!Number.isFinite(t)) bad('Enter a finish time'); e.end = rnd(t); } }
  if (e.start > now() + 5 * 60e3) bad('The start time is in the future');
  if (e.end) {
    if (e.end <= e.start) bad('The finish time must be after the start time');
    if (e.end > now() + 5 * 60e3) bad('The finish time is in the future');
    if (e.end - e.start > 24 * 3600e3) bad('One entry can be at most 24 hours — split it into two');
  }
  const p = projectOf(x, e.projectId); const t = e.taskId && x.d.tasks[e.taskId];
  e.pname = p ? p.name : ''; e.pref = p ? (p.ref || '') : ''; e.tname = t ? t.title : '';
  return e;
}
function dayRec(d, userId, ds, create) {
  const id = userId + '_' + ds;
  if (!d.days[id] && create) d.days[id] = { id, userId, date: ds, well: '', wrong: '', improve: '', finishedAt: 0, approvedBy: '', approvedById: '', approvedAt: 0, createdAt: now(), updatedAt: now() };
  return d.days[id] || null;
}
// Changing approved time takes the approval off again (unless an admin made the change).
function unapprove(x, userId, ds) {
  const r = dayRec(x.d, userId, ds, false);
  if (r && r.approvedBy && !isAdmin(x.role)) { Object.assign(r, { approvedBy: '', approvedById: '', approvedAt: 0, updatedAt: now() }); touchDay(x.c.id, r); upsert(x.c.id, 'days', r); }
}
function projectNames(d, entries) {
  const out = {};
  for (const p of Object.values(d.projects)) out[p.id] = { ref: p.ref || '', name: p.name };
  for (const e of entries) if (e.projectId && !out[e.projectId]) out[e.projectId] = { ref: e.pref || '', name: e.pname || 'Deleted project' };
  return out;
}
const publicSheet = (u) => ({ userId: u.userId, ym: u.ym, name: u.name, ext: u.ext, size: u.size, at: u.at, by: u.by });
// A month's timesheet as admins get it: the person's own upload if they've given one, otherwise made from their time.
async function sheetFor(c, userId, y, mo, generated = false) {
  const u = !generated && cdata(c.id).sheetUploads[`${userId}_${y}-${pad2(mo)}`];
  if (u) { const f = await storage.getFile(u.stored); if (f) return { name: ts.monthFileName(personNameOf(userId), y, mo).replace(/\.xlsx$/, '.' + u.ext), data: f.data, uploaded: true, type: f.type }; }
  return monthFileFor(c, userId, y, mo);
}
function monthFileFor(c, userId, y, mo) {
  const d = cdata(c.id); const ym = `${y}-${pad2(mo)}`;
  const entries = []; const [yy, mm] = ym.split('-').map(Number); const days = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  for (let k = 1; k <= days; k++) entries.push(...userDayEntries(d, c.id, userId, `${ym}-${pad2(k)}`));
  const approvals = {}; for (const r of Object.values(d.days)) if (r.userId === userId && r.approvedBy && r.date.startsWith(ym)) approvals[r.date] = r.approvedBy;
  const approverList = Object.keys(c.members).filter((id) => isAdmin(c.members[id].role)).map((id) => ts.initials(personNameOf(id)));
  return ts.monthWorkbook({ person: { name: personNameOf(userId) }, year: y, month: mo, entries, projects: projectNames(d, entries), approvals, dayHours: c.settings.dayHours || 8, tz: TZ, approverList });
}
function yearFileFor(c, userId, y) {
  const d = cdata(c.id);
  const entries = Object.values(d.entries).filter((e) => e.userId === userId && entryDay(e).startsWith(y + '-'));
  const notes = {}; for (const r of Object.values(d.days)) if (r.userId === userId && r.date.startsWith(y + '-')) notes[r.date] = r;
  return ts.yearWorkbook({ person: { name: personNameOf(userId) }, year: y, entries, projects: projectNames(d, entries), tasks: d.tasks, notes, dayHours: c.settings.dayHours || 8, tz: TZ });
}
// Everyone who has time logged in a month (members and people who've since left).
function peopleInMonth(c, ym) {
  const d = cdata(c.id); const ids = new Set();
  for (const k of idxFor(c.id).byUserDay.keys()) { const [u, ds] = k.split('|'); if (ds.slice(0, 7) === ym) ids.add(u); }
  return [...ids].sort((a, b) => personNameOf(a).localeCompare(personNameOf(b)));
}
function sendDownload(res, name, data, type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
  res.writeHead(200, Object.assign({}, SECURITY_HEADERS, { 'Content-Type': type, 'Content-Length': data.length, 'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="${name.replace(/[^\w.\- ]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}` }));
  res.end(data);
}
// Google Drive: after someone's time changes, refresh their timesheet there a minute later (batched).
const driveQueue = new Map(); // cid -> { users: Set, timer }
function syncSoon(c, userId, months) {
  if (!c.gdrive || !c.gdrive.refreshToken || !gdrive.configured()) return;
  const q = driveQueue.get(c.id) || { users: new Map(), timer: null };
  const set = q.users.get(userId) || new Set();
  for (const ym of months || [localDay(now()).slice(0, 7)]) set.add(ym);
  q.users.set(userId, set);
  clearTimeout(q.timer); q.timer = setTimeout(() => runDriveSync(c.id).catch(() => {}), 60e3);
  driveQueue.set(c.id, q);
}
async function runDriveSync(cid, all = false) {
  const c = db.companies[cid]; if (!c || !c.gdrive || !c.gdrive.refreshToken) return { files: 0 };
  const q = driveQueue.get(cid); driveQueue.delete(cid);
  const files = [];
  const add = async (uidv, ym) => { const [y, mo] = ym.split('-').map(Number); const f = await sheetFor(c, uidv, y, mo); files.push({ year: y, monthLabel: `${pad2(mo)} ${new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })}`, name: f.name, data: f.data }); };
  if (all) { const ym = localDay(now()).slice(0, 7); for (const id of peopleInMonth(c, ym)) await add(id, ym); }
  else if (q) for (const [id, months] of q.users) for (const ym of months) await add(id, ym);
  try { await gdrive.upload(c, `${c.name} — Crewdesk timesheets`, files); }
  catch (e) { c.gdrive.lastError = e.message; console.error('Google Drive sync failed:', e.message); }
  save(); broadcastAdmins(c, { t: 'reload' });
  return { files: files.length, error: c.gdrive.lastError };
}

async function timeApi(req, res, url, x, sub) {
  const M = req.method; const { c, d, user, role } = x; const cid = c.id; let m;
  const admin = isAdmin(role); const who = user.name.split(' ')[0];
  const forUser = (id) => {
    const target = id || user.id;
    if (target !== user.id && !admin) deny('Only admins can see other people’s time');
    if (!c.members[target] && !Object.values(d.entries).some((e) => e.userId === target)) notFound('That person isn’t in this company');
    return target;
  };

  // Start the timer (the big + button). Anything already running stops at the same moment.
  if (sub === '/entries/start' && M === 'POST') {
    throttle('timer:' + user.id, 200, 3600e3, 'You’ve started a lot of timers — slow down a little');
    const b = await readBody(req);
    const at = b.start ? minute(Number(b.start)) : Math.floor(now() / 1000) * 1000;
    const run = runningFor(d, user.id, cid);
    if (run && at <= run.start) bad(`Your current timer started at ${ukClock(run.start)} — pick a later start time`);
    let task = null;
    const e = { id: uid(), userId: user.id, projectId: '', taskId: '', category: 'field', note: '', start: at, end: 0, source: 'timer', edited: !!b.start, createdAt: now(), updatedAt: now() };
    cleanEntry({ projectId: b.projectId || '', category: b.category, note: b.note }, x, e);
    if (b.newTask) {
      if (!e.projectId) bad('Pick a project for the new task');
      task = Object.assign(RULES.tasks.defaults(x), RULES.tasks.clean({ projectId: e.projectId, title: b.newTask, assignees: [user.id] }, x), { id: uid(), createdBy: user.id, createdAt: now(), updatedAt: now() });
      d.tasks[task.id] = task; afterChange(cid, 'tasks', null, task, user); upsert(cid, 'tasks', task);
      cleanEntry({ taskId: task.id }, x, e);
    } else if (b.taskId) cleanEntry({ taskId: b.taskId }, x, e);
    checkOverlap(d, e, run && run.id, cid);
    if (run) { const before = Object.assign({}, run); run.end = at; run.updatedAt = now(); putEntry(c, run, before); }
    putEntry(c, e, null);
    return json(res, 200, { item: e, stopped: run || null, task });
  }
  // Stop it (the red square). You can say what you did, change the finish time, and tick the task off.
  if ((m = /^\/entries\/([A-Za-z0-9]+)\/stop$/.exec(sub)) && M === 'POST') {
    const e = d.entries[m[1]];
    if (!e || (e.userId !== user.id && !admin)) notFound('That timer was already stopped or deleted');
    const b = await readBody(req);
    if (e.end) return json(res, 200, { item: e }); // pressed twice
    const copy = Object.assign({}, e);
    const patch = { end: b.end ? Number(b.end) : Math.max(now(), e.start + 1000) };
    for (const k of ['note', 'category', 'taskId']) if (k in b) patch[k] = b[k];
    cleanEntry(patch, x, copy, !b.end);
    checkOverlap(d, copy, null, cid);
    const before = Object.assign({}, e);
    Object.assign(e, copy, { updatedAt: now(), edited: e.edited || !!b.end });
    if (b.taskDone && e.taskId && d.tasks[e.taskId] && !d.tasks[e.taskId].done) {
      const t = d.tasks[e.taskId]; const before = Object.assign({}, t);
      t.done = true; t.doneAt = now(); t.updatedAt = now(); afterChange(cid, 'tasks', before, t, user); upsert(cid, 'tasks', t);
    }
    putEntry(c, e, before); syncSoon(c, e.userId);
    return json(res, 200, { item: e });
  }
  // Add time by hand: something you forgot to log, or overtime.
  if (sub === '/entries' && M === 'POST') {
    const b = await readBody(req);
    const target = b.userId ? forUser(String(b.userId)) : user.id;
    if (!b.start || !b.end) bad('Enter a start and finish time');
    const e = { id: uid(), userId: target, projectId: '', taskId: '', category: 'field', note: '', start: 0, end: 0, source: 'manual', edited: true, createdBy: user.id, createdAt: now(), updatedAt: now() };
    cleanEntry({ projectId: b.projectId || '', taskId: b.taskId || '', category: b.category, note: b.note, start: b.start, end: b.end }, x, e);
    checkOverlap(d, e, null, cid);
    putEntry(c, e, null); unapprove(x, target, e.day); syncSoon(c, target, [e.day.slice(0, 7)]);
    if (target !== user.id) notify(cid, [target], `${who} added time to your timesheet for ${ukDay(e.start)}`, '#/timesheet/' + localDay(e.start).slice(0, 7));
    return json(res, 200, { item: e });
  }
  // Change or delete an entry (yours, or anyone's if you're an admin).
  if ((m = /^\/entries\/([A-Za-z0-9]+)$/.exec(sub)) && (M === 'PATCH' || M === 'DELETE')) {
    const e = d.entries[m[1]];
    if (!e || !(e.userId === user.id || admin)) notFound('That entry was already deleted');
    const day0 = entryDay(e);
    if (M === 'DELETE') {
      delEntry(c, e); unapprove(x, e.userId, day0); syncSoon(c, e.userId, [day0.slice(0, 7)]);
      return json(res, 200, { ok: true });
    }
    const b = await readBody(req);
    const copy = Object.assign({}, e); const patch = {};
    for (const k of ['projectId', 'taskId', 'category', 'note', 'start', 'end']) if (k in b) patch[k] = b[k];
    cleanEntry(patch, x, copy);
    if (e.end && !copy.end) bad('Enter a finish time');
    checkOverlap(d, copy, null, cid);
    const changed = ['start', 'end', 'category', 'projectId'].some((k) => copy[k] !== e[k]);
    const before = Object.assign({}, e);
    Object.assign(e, copy, { updatedAt: now(), updatedBy: user.id, edited: e.edited || changed });
    putEntry(c, e, before);
    if (changed) { unapprove(x, e.userId, day0); unapprove(x, e.userId, e.day); } syncSoon(c, e.userId, [...new Set([day0.slice(0, 7), localDay(e.start).slice(0, 7)])]);
    if (e.userId !== user.id && changed) notify(cid, [e.userId], `${who} changed your time on ${ukDay(e.start)}`, '#/timesheet/' + localDay(e.start).slice(0, 7));
    return json(res, 200, { item: e });
  }
  // Older time (timesheet pages, the admin dashboard, a project's timeline).
  if (sub === '/entries' && M === 'GET') {
    const from = date(url.searchParams.get('from')) || '2000-01-01'; const to = date(url.searchParams.get('to')) || '2999-12-31';
    const pid = url.searchParams.get('project'); const u = url.searchParams.get('user');
    let items;
    let tasks;
    if (pid) { const p = projectOf(x, pid); if (!p || !canSeeProject(x, p)) notFound('Project not found'); items = Object.values(d.entries).filter((e) => e.projectId === pid); tasks = Object.values(d.tasks).filter((t) => t.projectId === pid); }
    else if (u === 'all') { if (!admin) deny(); items = Object.values(d.entries); }
    else { const target = forUser(u); items = []; for (let t = Date.parse(from + 'T12:00:00Z'); from !== '2000-01-01' && t <= Date.parse(to + 'T12:00:00Z') && items.length < 50000; t += 864e5) items.push(...userDayEntries(d, cid, target, new Date(t).toISOString().slice(0, 10))); if (from === '2000-01-01') items = Object.values(d.entries).filter((e) => e.userId === target); }
    items = items.filter((e) => { const ds = entryDay(e); return ds >= from && ds <= to && canSeeEntry(x, e); });
    const days = Object.values(d.days).filter((r) => r.date >= from && r.date <= to && (admin || r.userId === user.id) && (pid || u === 'all' || r.userId === (u || user.id)));
    return json(res, 200, { items: items.slice(0, 50000), days, tasks });
  }
  // End of the day: optional notes on what went well, what went wrong and what to improve. Stops the timer.
  if ((m = /^\/days\/(\d{4}-\d{2}-\d{2})$/.exec(sub)) && M === 'PUT') {
    const b = await readBody(req);
    const r = dayRec(d, user.id, m[1], true);
    for (const k of ['well', 'wrong', 'improve']) if (k in b) r[k] = str(b[k], 2000);
    let stopped = null;
    if (b.finished) {
      r.finishedAt = now();
      const run = runningFor(d, user.id, cid);
      if (run) { const before = Object.assign({}, run); run.end = Math.max(run.start + 1000, Math.floor(now() / 1000) * 1000); run.updatedAt = now(); putEntry(c, run, before); stopped = run; }
      r.stoppedId = run ? run.id : ''; r.stoppedEnd = run ? run.end : 0;
    } else if (b.finished === false) {
      // Undo "finish for today": reopen the day, and restart the timer it stopped (if nothing has changed since).
      r.finishedAt = 0;
      const e = r.stoppedId && d.entries[r.stoppedId];
      if (e && e.end === r.stoppedEnd && e.userId === user.id && !runningFor(d, user.id, cid)) { const before = Object.assign({}, e); e.end = 0; e.updatedAt = now(); putEntry(c, e, before); stopped = e; }
      r.stoppedId = ''; r.stoppedEnd = 0;
    }
    r.updatedAt = now(); touchDay(cid, r); upsert(cid, 'days', r); syncSoon(c, user.id, [m[1].slice(0, 7)]);
    return json(res, 200, { item: r, stopped });
  }
  // Admins approve a day's overtime; their initials go in "OT Approved By" on the timesheet.
  if ((m = /^\/days\/(\d{4}-\d{2}-\d{2})\/approve$/.exec(sub)) && M === 'POST') {
    if (!admin) deny('Only admins can approve overtime');
    const b = await readBody(req);
    const target = forUser(str(b.userId, 40));
    const r = dayRec(d, target, m[1], true);
    if (b.approve) Object.assign(r, { approvedBy: ts.initials(user.name), approvedById: user.id, approvedAt: now() });
    else Object.assign(r, { approvedBy: '', approvedById: '', approvedAt: 0 });
    r.updatedAt = now(); touchDay(cid, r); upsert(cid, 'days', r); syncSoon(c, target, [m[1].slice(0, 7)]);
    if (b.approve && target !== user.id) notify(cid, [target], `${who} approved your time for ${ukDay(Date.parse(m[1] + 'T12:00:00Z'))}`, '#/timesheet/' + m[1].slice(0, 7));
    return json(res, 200, { item: r });
  }
  // Your own timesheet for a month: upload it and admins get it instead of the automatic one (DELETE to go back).
  if ((m = /^\/timesheet\/([A-Za-z0-9]+)\/(\d{4}-\d{2})\/upload$/.exec(sub)) && (M === 'POST' || M === 'DELETE')) {
    const target = forUser(m[1]); const key = `${target}_${m[2]}`; const old = d.sheetUploads[key];
    const tell = (item) => broadcast(cid, { t: 'sheetUpload', key, item }, { only: Object.keys(c.members).filter((id) => id === target || isAdmin(c.members[id].role)) });
    if (M === 'DELETE') {
      if (old) { dropFile('/uploads/' + old.stored); delete d.sheetUploads[key]; save(); tell(null); syncSoon(c, target, [m[2]]); }
      return json(res, 200, { ok: true });
    }
    throttle('sheetup:' + user.id, 30, 3600e3, 'You’ve uploaded a lot — try again later');
    const b = await readBody(req, 24 * 1024 * 1024);
    const name = str(b.name, 120).replace(/[\\/:*?"<>|]+/g, '_') || 'timesheet';
    const ext = ((/\.([a-z0-9]{2,5})$/i.exec(name) || [])[1] || '').toLowerCase();
    if (!['xlsx', 'xls', 'ods', 'pdf'].includes(ext)) bad('Upload your timesheet as an Excel file (.xlsx or .xls), an .ods file or a PDF');
    const buf = decodeData(b.data);
    if (buf.length > 15 * 1024 * 1024) bad('That file is too big — up to 15 MB');
    if (!docOk(ext, buf)) bad('That file doesn’t match its type, so it was refused');
    const stored = uid(18) + '.' + ext;
    await storage.putFile(stored, DOC_TYPES[ext], buf);
    db.fileIndex[stored] = { kind: 'sheet', cid, user: target };
    if (old) dropFile('/uploads/' + old.stored);
    const item = d.sheetUploads[key] = { userId: target, ym: m[2], name, ext, size: buf.length, stored, at: now(), by: user.id };
    save(); tell(publicSheet(item)); syncSoon(c, target, [m[2]]);
    const admins = Object.keys(c.members).filter((id) => isAdmin(c.members[id].role) && id !== user.id);
    if (target === user.id) notify(cid, admins, `${who} uploaded their own timesheet for ${new Date(m[2] + '-01T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`, `#/timesheet/${m[2]}/${target}`);
    return json(res, 200, { item: publicSheet(item) });
  }
  // Timesheet files: a month in the company's template (or the person's own upload), or a whole year.
  if ((m = /^\/timesheet\/([A-Za-z0-9]+)\/(\d{4})(?:-(\d{2}))?$/.exec(sub)) && M === 'GET') {
    const target = forUser(m[1]);
    const f = m[3] ? await sheetFor(c, target, Number(m[2]), Number(m[3]), url.searchParams.get('generated') === '1') : yearFileFor(c, target, Number(m[2]));
    return sendDownload(res, f.name, f.data, f.type);
  }
  // Admins: everyone's timesheets for a month in one zip, a folder per person.
  // Hours & performance figures for the Spreadsheets page (admins): totals by month, person, project, weekday and start time.
  if (sub === '/stats' && M === 'GET') {
    if (!admin) deny('Only admins can see company statistics');
    const from = date(url.searchParams.get('from')) || bad('Pick a start date'), to = date(url.searchParams.get('to')) || bad('Pick an end date');
    const std = (c.settings.dayHours || 8) * 60; const t = now();
    const byMonth = {}, byPerson = {}, byProject = {}, byWeekday = [0, 0, 0, 0, 0, 0, 0], days = {};
    for (const e of Object.values(d.entries)) {
      const ds = entryDay(e); if (ds < from || ds > to) continue;
      const mins = Math.max(0, ((e.end || t) - e.start) / 60000); const cat = e.category || 'field';
      const ym = ds.slice(0, 7); const mo = byMonth[ym] = byMonth[ym] || {}; mo[cat] = (mo[cat] || 0) + mins;
      const pp = byPerson[e.userId] = byPerson[e.userId] || { cats: {}, days: 0, ot: 0, tasksDone: 0, notes: 0, starts: [], ends: [], holiday: 0 };
      pp.cats[cat] = (pp.cats[cat] || 0) + mins;
      if (ts.CATS[cat] && ts.CATS[cat].paid) {
        if (e.projectId) byProject[e.projectId] = (byProject[e.projectId] || 0) + mins;
        const dw = (new Date(ds + 'T12:00:00Z').getUTCDay() + 6) % 7; byWeekday[dw] += mins;
        const k = e.userId + '|' + ds; const dd2 = days[k] = days[k] || { paid: 0, first: Infinity, last: 0, dw };
        dd2.paid += mins; dd2.first = Math.min(dd2.first, e.start); dd2.last = Math.max(dd2.last, e.end || t);
      }
    }
    for (const [k, v] of Object.entries(days)) {
      const u = k.split('|')[0]; const pp = byPerson[u]; pp.days++;
      pp.ot += v.dw >= 5 ? v.paid : Math.max(0, v.paid - std);
      pp.starts.push(ts.zoneParts(v.first, TZ).mins); pp.ends.push(ts.zoneParts(v.last, TZ).mins);
    }
    const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
    for (const pp of Object.values(byPerson)) { pp.avgStart = avg(pp.starts); pp.avgEnd = avg(pp.ends); delete pp.starts; delete pp.ends; }
    for (const tk of Object.values(d.tasks)) {
      if (!tk.done || !tk.doneAt) continue; const ds = localDay(tk.doneAt); if (ds < from || ds > to) continue;
      for (const u of (tk.assignees || [])) if (byPerson[u]) byPerson[u].tasksDone++;
    }
    for (const r of Object.values(d.days)) { if (r.date < from || r.date > to || !byPerson[r.userId]) continue; if (r.well || r.wrong || r.improve) byPerson[r.userId].notes++; }
    return json(res, 200, { from, to, std, byMonth, byPerson, byProject, byWeekday });
  }
  if (sub === '/timesheets/status' && M === 'GET') {
    return json(res, 200, { months: sheetStatusAll(c, d, admin ? Object.keys(c.members) : [user.id]) });
  }
  if ((m = /^\/timesheets\/(\d{4})-(\d{2})$/.exec(sub)) && M === 'GET') {
    if (!admin) deny('Only admins can download everyone’s timesheets');
    const y = Number(m[1]), mo = Number(m[2]);
    const ids = new Set(peopleInMonth(c, `${m[1]}-${m[2]}`).concat(Object.keys(c.members)));
    const files = []; const used = new Set();
    for (const id of ids) {
      const f = await sheetFor(c, id, y, mo);
      let folderName = ts.safeName(personNameOf(id)); while (used.has(folderName)) folderName += ' (2)'; used.add(folderName);
      files.push({ name: `${folderName}/${f.name}`, data: f.data });
    }
    return sendDownload(res, `Timesheets_${ts.MONTHS[mo - 1]}_${y}.zip`, writeZip(files), 'application/zip');
  }
  // The whole project on paper: details, plan vs actual, tasks, people, time log and chat.
  if ((m = /^\/projects\/([A-Za-z0-9]+)\/pdf$/.exec(sub)) && M === 'GET') {
    const p = projectOf(x, m[1]); if (!p || !canSeeProject(x, p)) notFound('Project not found');
    return sendDownload(res, ts.safeName(`${p.ref ? p.ref + ' ' : ''}${p.name} project report`) + '.pdf', projectPdf(x, p), 'application/pdf');
  }
  // A project's timesheet and timeline.
  if ((m = /^\/projects\/([A-Za-z0-9]+)\/timesheet$/.exec(sub)) && M === 'GET') {
    const p = projectOf(x, m[1]); if (!p || !canSeeProject(x, p)) notFound('Project not found');
    const people = {}; for (const id of Object.keys(db.users)) people[id] = { name: db.users[id].name };
    const f = ts.projectWorkbook({ project: p, client: (d.clients[p.clientId] || {}).name || '', tz: TZ, people,
      tasks: Object.values(d.tasks).filter((t) => t.projectId === p.id).sort((a, b) => (a.order || 0) - (b.order || 0)),
      entries: Object.values(d.entries).filter((e) => e.projectId === p.id && canSeeEntry(x, e)) });
    return sendDownload(res, f.name, f.data);
  }
  // Google Drive (admins).
  if (sub.startsWith('/gdrive')) {
    if (!admin) deny('Only admins can set up Google Drive');
    if (sub === '/gdrive/connect' && M === 'POST') {
      if (!gdrive.configured()) bad('Google Drive isn’t set up on this server yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see README).');
      const state = makeToken('gdrive', user.id, 15 * 60e3, { cid });
      return json(res, 200, { url: gdrive.authUrl(APP_URL + '/api/gdrive/callback', state) });
    }
    if (sub === '/gdrive/sync' && M === 'POST') {
      throttle('gsync:' + cid, 10, 3600e3, 'Synced a lot recently — try again later');
      const r = await runDriveSync(cid, true);
      if (r.error) bad('Google Drive: ' + r.error);
      return json(res, 200, Object.assign(r, { gdrive: gdrive.status(c) }));
    }
    if (sub === '/gdrive' && M === 'DELETE') { delete c.gdrive; save(); return json(res, 200, { gdrive: gdrive.status(c) }); }
  }
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
    // Timers left running: a nudge an hour after the usual finish time; stopped automatically after 16 hours.
    const nowLocal = ts.zoneParts(t, TZ);
    const [eh, em] = String(c.settings.dayEnd || '16:30').split(':').map(Number);
    for (const id of [...idxFor(c.id).running]) {
      const e = d.entries[id]; if (!e || e.end) continue;
      if (t - e.start > 16 * 3600e3) {
        const before = Object.assign({}, e);
        e.end = e.start + 16 * 3600e3; e.edited = true; e.note = (e.note ? e.note + ' ' : '') + '(Stopped automatically after 16 hours — check the finish time.)';
        putEntry(c, e, before);
        notify(c.id, [e.userId], 'Your timer was left running, so it was stopped after 16 hours. Please check the finish time on your timesheet.', '#/timesheet');
      } else if (!e.nudgedAt && nowLocal.date === localDay(e.start) && nowLocal.mins >= eh * 60 + em + 60) {
        e.nudgedAt = t; touchEntry(c.id, e);
        notify(c.id, [e.userId], `Your timer is still running${e.pname ? ' on ' + e.pname : ''}. Finished for the day? Tap the red square to stop it.`, '#/home');
      }
    }
    try { sheetAlerts(c, d, nowLocal); } catch (err) { console.error('timesheet alerts', err); }
  }
}

// ---------------------------------------------------------------- static files & security headers
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf', '.csv': 'text/csv; charset=utf-8', '.mp4': 'video/mp4' };
for (const [ext, type] of Object.entries(DOC_TYPES)) if (!TYPES['.' + ext]) TYPES['.' + ext] = type;
// Map data comes from OpenFreeMap (vector maps) with OpenStreetMap as a fallback; nothing else loads from other sites.
const SECURITY_HEADERS = {
  // Manhole maps add Google Maps (when a key is set), Esri satellite imagery and OpenStreetMap place search.
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://maps.googleapis.com https://maps.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "img-src 'self' data: blob: https://tiles.openfreemap.org https://tile.openstreetmap.org https://*.googleapis.com https://*.gstatic.com https://*.google.com https://server.arcgisonline.com https://services.arcgisonline.com; " +
    "font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://tiles.openfreemap.org https://*.googleapis.com https://maps.gstatic.com https://server.arcgisonline.com https://services.arcgisonline.com https://nominatim.openstreetmap.org; worker-src 'self' blob:; child-src 'self' blob:; manifest-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  // Sends only this site's address (never the page path) to map servers, which their usage policy requires.
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(self), camera=(self), microphone=(), payment=(), usb=()',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};
if (HOSTED) SECURITY_HEADERS['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
function serveFile(res, file, req) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, SECURITY_HEADERS); return res.end('Not found'); }
    const ext = path.extname(file).toLowerCase();
    // Videos: answer byte-range requests (iPhones won't play a video without them).
    const rg = ext === '.mp4' && req && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (rg) {
      let a = rg[1] === '' ? Math.max(0, st.size - Number(rg[2])) : Number(rg[1]); let b = rg[1] !== '' && rg[2] !== '' ? Math.min(Number(rg[2]), st.size - 1) : st.size - 1;
      if (a > b || a >= st.size) { res.writeHead(416, Object.assign({ 'Content-Range': `bytes */${st.size}` }, SECURITY_HEADERS)); return res.end(); }
      res.writeHead(206, Object.assign({ 'Content-Type': 'video/mp4', 'Content-Length': b - a + 1, 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400' }, SECURITY_HEADERS));
      return fs.createReadStream(file, { start: a, end: b }).pipe(res);
    }
    const immutable = ext === '.woff2' || file.includes(path.sep + 'vendor' + path.sep);
    res.writeHead(200, Object.assign({ 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Content-Length': st.size,
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' }, ext === '.mp4' ? { 'Accept-Ranges': 'bytes' } : {}, SECURITY_HEADERS));
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
    if (fs.existsSync(file)) return serveFile(res, file, req);
    return serveFile(res, path.join(PUBLIC, 'index.html'));
  } catch (e) {
    const code = e instanceof HttpError ? e.code : 500;
    if (code === 500) console.error(e);
    if (!res.headersSent) json(res, code, Object.assign({ error: code === 500 ? 'Something went wrong on the server. Please try again.' : e.message }, e.extra || {}));
  }
}

// ---------------------------------------------------------------- start
async function main() {
  const loaded = await storage.init();
  for (const k of loaded || []) storedChunks.add(k);
  migrate();
  if (!db.meta.chunked) { db.meta.chunked = true; allChunksDirty = true; save(); console.log('  Splitting the database into pieces (one-off)'); }
  for (const cid of Object.keys(db.companies)) idxFor(cid); // build the quick lookups now rather than on the first request
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
  setTimeout(async () => { try { const o = await storage.sizes(); usage(); for (const [k, v] of Object.entries(o)) if (!(k in db.meta.fsize)) db.meta.fsize[k] = v; save(); } catch (e) { console.error('Size check:', e.message); } }, 20e3).unref();
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
