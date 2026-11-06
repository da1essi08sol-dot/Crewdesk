// Cloudflare R2 (or any S3-compatible store) for uploaded photos and files, so they don't fill the database.
// Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET. Without them, files stay where they were.
// Requests are signed with AWS Signature V4 using Node's own crypto — no extra packages.
'use strict';
const crypto = require('crypto');

const ACCOUNT = process.env.R2_ACCOUNT_ID || '';
const KEY = process.env.R2_ACCESS_KEY_ID || '';
const SECRET = process.env.R2_SECRET_ACCESS_KEY || '';
const BUCKET = process.env.R2_BUCKET || '';
const ENDPOINT = (process.env.R2_ENDPOINT || (ACCOUNT ? `https://${ACCOUNT}.r2.cloudflarestorage.com` : '')).replace(/\/+$/, '');
const REGION = process.env.R2_REGION || 'auto';
const PREFIX = (process.env.R2_PREFIX || 'crewdesk/').replace(/^\/+/, '');
const configured = () => !!(ENDPOINT && KEY && SECRET && BUCKET && typeof fetch === 'function');

const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

async function call(method, name, body, type) {
  const url = new URL(`${ENDPOINT}/${BUCKET}/${PREFIX}${name}`);
  const pathPart = url.pathname.split('/').map((p) => enc(decodeURIComponent(p))).join('/');
  const t = new Date(); const amz = t.toISOString().replace(/[-:]|\.\d{3}/g, ''); const day = amz.slice(0, 8);
  const payload = sha(body || Buffer.alloc(0));
  const headers = { host: url.host, 'x-amz-content-sha256': payload, 'x-amz-date': amz };
  if (type) headers['content-type'] = type;
  const names = Object.keys(headers).sort();
  const canon = [method, pathPart, '', names.map((h) => `${h}:${headers[h]}`).join('\n') + '\n', names.join(';'), payload].join('\n');
  const scope = `${day}/${REGION}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, sha(canon)].join('\n');
  const kSign = hmac(hmac(hmac(hmac('AWS4' + SECRET, day), REGION), 's3'), 'aws4_request');
  const sig = crypto.createHmac('sha256', kSign).update(toSign).digest('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${KEY}/${scope}, SignedHeaders=${names.join(';')}, Signature=${sig}`;
  delete headers.host;
  const r = await fetch(url.origin + pathPart, { method, headers, body: body || undefined });
  return r;
}
async function put(name, type, buf) { const r = await call('PUT', name, buf, type); if (!r.ok) throw new Error(`File store refused the upload (${r.status})`); }
async function get(name) {
  const r = await call('GET', name);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`File store error (${r.status})`);
  return { type: r.headers.get('content-type') || 'application/octet-stream', data: Buffer.from(await r.arrayBuffer()) };
}
async function del(name) { const r = await call('DELETE', name); if (!r.ok && r.status !== 404) throw new Error(`File store error (${r.status})`); }
module.exports = { configured, put, get, del };
