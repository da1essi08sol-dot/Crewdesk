// Optional: copy timesheets into a Google Drive folder automatically.
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (a Google Cloud "OAuth client", web application type) with
// <APP_URL>/api/gdrive/callback as an authorised redirect URI. An admin then connects their Drive once from the app.
// Uses the narrow "drive.file" permission: Crewdesk can only see and change the files it creates itself.
'use strict';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const SCOPE = 'https://www.googleapis.com/auth/drive.file openid email';
const FOLDER = 'application/vnd.google-apps.folder';
const configured = () => !!(CLIENT_ID && CLIENT_SECRET && typeof fetch === 'function');

function status(c) {
  const g = c.gdrive || {};
  return { ready: configured(), connected: !!g.refreshToken, email: g.email || '', folderUrl: g.rootId ? `https://drive.google.com/drive/folders/${g.rootId}` : '',
    lastSync: g.lastSync || 0, lastError: g.lastError || '', connectedBy: g.connectedBy || '' };
}
function authUrl(redirectUri, state) {
  const q = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: redirectUri, response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', state, include_granted_scopes: 'true' });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + q;
}
async function tokenCall(params) {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(Object.assign({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET }, params)) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.error || 'Google sign-in failed');
  return j;
}
// After the admin agrees on Google's page: swap the one-time code for a long-lived refresh token.
async function connect(c, code, redirectUri, userId) {
  const t = await tokenCall({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  if (!t.refresh_token) throw new Error('Google didn’t give Crewdesk lasting access. Remove Crewdesk from your Google account’s third-party access and try again.');
  let email = '';
  try { email = JSON.parse(Buffer.from(String(t.id_token || '').split('.')[1], 'base64url').toString('utf8')).email || ''; } catch (_) {}
  c.gdrive = { refreshToken: t.refresh_token, email, connectedBy: userId, connectedAt: Date.now(), folders: {}, files: {}, lastSync: 0, lastError: '' };
  tokens.delete(c.id);
}
const tokens = new Map(); // company id -> { token, exp }
async function accessToken(c) {
  const k = tokens.get(c.id);
  if (k && k.exp > Date.now() + 60e3) return k.token;
  const t = await tokenCall({ grant_type: 'refresh_token', refresh_token: c.gdrive.refreshToken });
  tokens.set(c.id, { token: t.access_token, exp: Date.now() + (t.expires_in || 3600) * 1000 });
  return t.access_token;
}
async function api(c, method, url, opts = {}) {
  const r = await fetch(url, Object.assign({ method, headers: Object.assign({ Authorization: 'Bearer ' + await accessToken(c) }, opts.headers || {}) }, opts.body ? { body: opts.body } : {}));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error((j.error && j.error.message) || 'Google Drive returned an error'); e.status = r.status; throw e; }
  return j;
}
async function folder(c, name, parent) {
  const key = (parent || 'root') + '/' + name;
  const g = c.gdrive; g.folders = g.folders || {};
  if (g.folders[key]) return g.folders[key];
  const q = `name='${name.replace(/['\\]/g, '\\$&')}' and mimeType='${FOLDER}' and trashed=false${parent ? ` and '${parent}' in parents` : ''}`;
  const found = await api(c, 'GET', 'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({ q, fields: 'files(id)', spaces: 'drive' }));
  const id = found.files && found.files[0] ? found.files[0].id
    : (await api(c, 'POST', 'https://www.googleapis.com/drive/v3/files?fields=id', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: FOLDER, parents: parent ? [parent] : undefined }) })).id;
  g.folders[key] = id;
  return id;
}
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
async function put(c, parent, name, data) {
  const g = c.gdrive; g.files = g.files || {};
  const key = parent + '/' + name;
  if (g.files[key]) {
    try { await api(c, 'PATCH', `https://www.googleapis.com/upload/drive/v3/files/${g.files[key]}?uploadType=media&fields=id`, { headers: { 'Content-Type': XLSX }, body: data }); return; }
    catch (e) { if (e.status !== 404) throw e; delete g.files[key]; } // deleted in Drive: make it again
  }
  const boundary = 'crewdesk' + Math.random().toString(36).slice(2);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parent] })}\r\n--${boundary}\r\nContent-Type: ${XLSX}\r\n\r\n`),
    data, Buffer.from(`\r\n--${boundary}--`),
  ]);
  const r = await api(c, 'POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
  g.files[key] = r.id;
}
// files: [{ year, monthLabel, name, data }] → Crewdesk Timesheets / 2026 / 11 November / AS_Nov_2026_Timesheet.xlsx
async function upload(c, rootName, files) {
  const root = await folder(c, rootName, null);
  c.gdrive.rootId = root;
  for (const f of files) {
    const y = await folder(c, String(f.year), root);
    const parent = f.monthLabel ? await folder(c, f.monthLabel, y) : y;
    await put(c, parent, f.name, f.data);
  }
  c.gdrive.lastSync = Date.now(); c.gdrive.lastError = '';
}

module.exports = { configured, status, authUrl, connect, upload };
