// Password rules, hashing and breach checks for Crewdesk.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIN_LENGTH = 12;
const MAX_LENGTH = 200;

// The 10,000 most common passwords (from the zxcvbn-ts project, MIT licence).
const COMMON = new Set(fs.readFileSync(path.join(__dirname, 'common-passwords.txt'), 'utf8')
  .split('\n').map((s) => s.trim().toLowerCase()).filter(Boolean));

const LEET = { '@': 'a', 4: 'a', 3: 'e', 1: 'i', '!': 'i', '|': 'i', 0: 'o', $: 's', 5: 's', 7: 't', '+': 't' };
const unleet = (s) => s.replace(/[@4310!|$57+]/g, (c) => LEET[c]);

// Rules a password must meet. Returns a list of what is missing (empty when it passes).
function missingRules(pw) {
  pw = String(pw || '');
  const out = [];
  if (pw.length < MIN_LENGTH) out.push(`at least ${MIN_LENGTH} characters`);
  if (pw.length > MAX_LENGTH) out.push(`no more than ${MAX_LENGTH} characters`);
  if (!/[a-z]/.test(pw)) out.push('a lowercase letter');
  if (!/[A-Z]/.test(pw)) out.push('a capital letter');
  if (!/[0-9]/.test(pw)) out.push('a number');
  if (!/[^A-Za-z0-9]/.test(pw)) out.push('a symbol such as ! ? # or %');
  return out;
}

// Catches common passwords dressed up with capitals, numbers and symbols, e.g. "Password123!" or "P@ssw0rd2024".
function isCommon(pw) {
  const low = String(pw).toLowerCase();
  if (COMMON.has(low)) return true;
  const core = low.replace(/^[^a-z@$]+|[^a-z]+$/g, '');
  for (const c of [core, unleet(core), unleet(low).replace(/[^a-z]+$/g, '')]) {
    if (c.length >= 4 && COMMON.has(c) && c.length >= low.length * 0.45) return true;
  }
  if (/(.)\1{5,}/.test(pw)) return true; // aaaaaa…
  const letters = low.replace(/[^a-z]/g, '');
  if (/^(qwerty|asdfgh|zxcvbn|abcdef|qwertyuiop)/.test(letters) && letters.length <= 10) return true;
  return false;
}

// Password contains the person's own name or email, or the app's name.
function isPersonal(pw, words) {
  const low = unleet(String(pw).toLowerCase());
  return (words || []).concat(['crewdesk']).some((w) => {
    w = String(w || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return w.length >= 4 && low.includes(w);
  });
}

// Have I Been Pwned "range" check. Only the first 5 characters of the SHA-1 hash leave the server
// (k-anonymity), so the password itself is never sent. Returns how many breaches it appears in,
// or null if the check could not run (offline, blocked or turned off).
async function breachCount(pw) {
  if (process.env.PWNED_CHECK === 'off' || typeof fetch !== 'function') return null;
  const sha = crypto.createHash('sha1').update(String(pw)).digest('hex').toUpperCase();
  try {
    const r = await fetch('https://api.pwnedpasswords.com/range/' + sha.slice(0, 5), {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'Crewdesk-password-check' },
      signal: AbortSignal.timeout(3500),
    });
    if (!r.ok) return null;
    const body = await r.text();
    for (const line of body.split('\n')) {
      const [suffix, count] = line.trim().split(':');
      if (suffix === sha.slice(5)) return Number(count) || 0;
    }
    return 0;
  } catch (_) { return null; }
}

// Full check. Returns an error message, or '' if the password is acceptable.
async function problem(pw, personalWords = []) {
  const miss = missingRules(pw);
  if (miss.length) return 'Your password needs ' + listify(miss) + '.';
  if (isCommon(pw)) return 'That password is too common or easy to guess. Try a short phrase of unrelated words with a number and symbol.';
  if (isPersonal(pw, personalWords)) return 'Don’t use your name or email address in your password.';
  const n = await breachCount(pw);
  if (n && n > 0) return `That password has appeared in ${n.toLocaleString('en-GB')} known data breaches, so attackers will try it. Please choose a different one.`;
  return '';
}
function listify(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

// ---------------------------------------------------------------- hashing
// scrypt is a memory-hard algorithm recommended by OWASP alongside Argon2id. It is built into Node,
// so no native add-on is needed on the host. Parameters: N=2^16 (64 MB of memory per hash), r=8, p=1 — sized for small hosting plans.
const CURRENT = 'scrypt-16-8-1';
function params(kdf) {
  const m = /^scrypt-(\d+)-(\d+)-(\d+)$/.exec(kdf || '');
  if (m) return { N: 2 ** Number(m[1]), r: Number(m[2]), p: Number(m[3]) };
  return { N: 16384, r: 8, p: 1 }; // hashes made by the first version of Crewdesk
}
function scrypt(pw, salt, kdf) {
  const { N, r, p } = params(kdf);
  return new Promise((resolve, reject) => crypto.scrypt(String(pw), salt, 64, { N, r, p, maxmem: 256 * N * r + 1024 * 1024 },
    (err, key) => (err ? reject(err) : resolve(key.toString('hex')))));
}
async function hash(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: await scrypt(pw, salt, CURRENT), kdf: CURRENT };
}
async function verify(pw, rec) {
  if (!rec || !rec.salt || !rec.hash) return false;
  const a = Buffer.from(await scrypt(String(pw || '').slice(0, MAX_LENGTH), rec.salt, rec.kdf));
  const b = Buffer.from(rec.hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const needsRehash = (rec) => rec && rec.kdf !== CURRENT;

module.exports = { MIN_LENGTH, missingRules, isCommon, isPersonal, breachCount, problem, hash, verify, needsRehash, CURRENT };
