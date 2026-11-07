/* Web Push with no extra packages: VAPID sign-in (RFC 8292) and aes128gcm message encryption (RFC 8291 / 8188).
   This is what puts a notification on a phone's lock screen (and makes it buzz) when Crewdesk isn't open. */
'use strict';
const crypto = require('crypto');

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (s) => Buffer.from(String(s || ''), 'base64url');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// The server's own key pair. Made once and kept in the database, so phones stay subscribed across restarts.
function makeKeys() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { jwk: privateKey.export({ format: 'jwk' }) };
}
function publicKeyOf(keys) { // 65-byte uncompressed point, as browsers want it for applicationServerKey
  return b64u(Buffer.concat([Buffer.from([4]), unb64u(keys.jwk.x), unb64u(keys.jwk.y)]));
}

function vapidHeader(keys, endpoint, subject) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 3600, sub: subject }));
  const key = crypto.createPrivateKey({ key: keys.jwk, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${publicKeyOf(keys)}`;
}

function encrypt(sub, payload) {
  const uaPublic = unb64u(sub.keys.p256dh);
  const authSecret = unb64u(sub.keys.auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error('Bad subscription keys');
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const prkKey = hmac(authSecret, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const salt = crypto.randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, ct]);
}

// Sends one message. Resolves to 'ok', 'gone' (the phone unsubscribed — forget it) or 'fail:<reason>'.
async function send(keys, subject, sub, data) {
  try {
    const body = encrypt(sub, JSON.stringify(data));
    const headers = { 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'aes128gcm', TTL: '86400', Urgency: 'high',
      Authorization: vapidHeader(keys, sub.endpoint, subject) };
    const r = await fetch(sub.endpoint, { method: 'POST', body, headers, signal: AbortSignal.timeout(10000) });
    if (r.status === 404 || r.status === 410) return 'gone';
    if (!r.ok) { const why = (await r.text().catch(() => '')).slice(0, 200); console.warn('Push refused', r.status, why); return 'fail:' + r.status + ' ' + why.slice(0, 80); }
    return 'ok';
  } catch (e) { console.warn('Push failed:', e.message); return 'fail:' + e.message.slice(0, 80); }
}

// Only real push services, so a made-up "subscription" can't turn the server into a request relay.
const PUSH_HOSTS = [/\.googleapis\.com$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/, /\.mozilla\.com$/, /\.mozaws\.net$/, /^fcm\.googleapis\.com$/];
function endpointOk(u) {
  try { const x = new URL(u); return x.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(x.hostname)); } catch (_) { return false; }
}

module.exports = { makeKeys, publicKeyOf, send, endpointOk, encrypt };
