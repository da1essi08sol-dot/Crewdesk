/* Firebase Cloud Messaging (HTTP v1) with no extra packages. Wakes the Crewdesk Android app so it can show notifications,
   and for emergencies a full-screen alert with a siren — even when the app is closed.
   Setup (Render environment):
     FIREBASE_SERVICE_ACCOUNT  the service-account JSON from Firebase → Project settings → Service accounts → Generate new private key
     FIREBASE_APP_CONFIG       the google-services.json from Firebase → Project settings → Your apps → Android app (download)
   Both can be pasted in whole. */
'use strict';
const crypto = require('crypto');

function parse(v) { if (!v) return null; try { return JSON.parse(v); } catch (_) { try { return JSON.parse(Buffer.from(v, 'base64').toString('utf8')); } catch (_) { return null; } } }
const SA = parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const APP = parse(process.env.FIREBASE_APP_CONFIG);
if (SA && SA.private_key) SA.private_key = SA.private_key.replace(/\\n/g, '\n');

const configured = () => !!(SA && SA.client_email && SA.private_key && SA.project_id && clientConfig());
// What the Android app needs to sign in to Firebase (all of this is public, it ships inside every Android app).
function clientConfig() {
  if (!APP || !APP.project_info) return null;
  const c = (APP.client || []).find((x) => x.client_info && x.client_info.android_client_info && x.client_info.android_client_info.package_name === 'com.crewdesk.app') || (APP.client || [])[0];
  if (!c) return null;
  return { projectId: APP.project_info.project_id, senderId: APP.project_info.project_number, appId: c.client_info.mobilesdk_app_id, apiKey: ((c.api_key || [])[0] || {}).current_key };
}

let token = null, tokenExp = 0;
async function accessToken() {
  if (token && Date.now() < tokenExp - 60e3) return token;
  const b64u = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
  const t = Math.floor(Date.now() / 1000);
  const head = b64u({ alg: 'RS256', typ: 'JWT' });
  const body = b64u({ iss: SA.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: t, exp: t + 3600 });
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), SA.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + head + '.' + body + '.' + sig, signal: AbortSignal.timeout(10000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Firebase sign-in failed: ' + (j.error_description || j.error || r.status));
  token = j.access_token; tokenExp = Date.now() + (j.expires_in || 3600) * 1000;
  return token;
}

// Data-only, high priority: the app decides how to show it (normal notification, check-in reminder, or full-screen siren).
// Resolves to 'ok', 'gone' (the app was uninstalled or the token replaced — forget it) or 'fail:<reason>'.
async function send(deviceToken, data) {
  if (!configured()) return 'fail:Firebase isn’t set up';
  try {
    const flat = {}; for (const [k, v] of Object.entries(data)) if (v !== undefined && v !== null) flat[k] = String(v);
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${SA.project_id}/messages:send`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + (await accessToken()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token: deviceToken, data: flat, android: { priority: 'HIGH', ttl: data.alarm === '1' ? '600s' : '86400s' } } }),
      signal: AbortSignal.timeout(10000) });
    if (r.ok) return 'ok';
    const j = await r.json().catch(() => ({})); const st = (j.error && j.error.status) || r.status;
    if (r.status === 404 || st === 'NOT_FOUND' || st === 'UNREGISTERED' || /UNREGISTERED/.test(JSON.stringify(j))) return 'gone';
    return 'fail:' + st + ' ' + ((j.error && j.error.message) || '').slice(0, 80);
  } catch (e) { return 'fail:' + e.message.slice(0, 80); }
}

module.exports = { configured, clientConfig, send };
