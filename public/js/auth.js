/* Signing in, signing up, email confirmation, password reset, invite links and first-time setup. */
'use strict';

// ---- password field with show/hide and a strength meter
function pwField(name, label, { meter = false, autocomplete = 'current-password', hint = '' } = {}) {
  const id = 'pw-' + name;
  return `<div class="field"><label for="${id}" class="lbl">${esc(label)}</label>
    <div class="pw-wrap"><input id="${id}" name="${name}" type="password" autocomplete="${autocomplete}" required ${meter ? `minlength="${(S.info && S.info.passwordMin) || 12}" data-input="pw-meter" aria-describedby="${id}-rules"` : ''} spellcheck="false" autocapitalize="off">
    <button type="button" class="pw-toggle" data-act="pw-toggle" aria-controls="${id}" aria-pressed="false">Show</button></div>
    ${meter ? `<div class="pw-meter" data-s="0" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <ul class="pw-rules" id="${id}-rules" aria-live="polite"><li data-r="len">12+ characters</li><li data-r="lower">lowercase letter</li><li data-r="upper">capital letter</li><li data-r="num">number</li><li data-r="sym">symbol</li></ul>
    <div class="hint" style="margin-top:4px">${hint || 'Tip: three or four unrelated words with a number and symbol, like Copper-Window-88-Seal. We also check it isn’t in any known data breach.'}</div>` : ''}</div>`;
}
const PW_WEAK = /(password|passw0rd|qwerty|123456|letmein|welcome|iloveyou|abc123|admin|crewdesk)/i;
function pwScore(pw) {
  const r = { len: pw.length >= 12, lower: /[a-z]/.test(pw), upper: /[A-Z]/.test(pw), num: /\d/.test(pw), sym: /[^A-Za-z0-9]/.test(pw) };
  const classes = [r.lower, r.upper, r.num, r.sym].filter(Boolean).length;
  let s = !pw ? 0 : pw.length < 8 ? 1 : (r.len && classes === 4) ? (pw.length >= 16 ? 4 : 3) : classes >= 3 ? 2 : 1;
  if (PW_WEAK.test(pw) || /(.)\1{4,}/.test(pw)) s = Math.min(s, 1);
  return { r, s };
}
I['pw-meter'] = (el) => {
  const { r, s } = pwScore(el.value);
  const f = el.closest('.field');
  f.querySelector('.pw-meter').dataset.s = s;
  for (const [k, v] of Object.entries(r)) f.querySelector(`[data-r="${k}"]`).classList.toggle('ok', v);
};
A['pw-toggle'] = (el) => {
  const inp = document.getElementById(el.getAttribute('aria-controls'));
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password'; el.textContent = show ? 'Hide' : 'Show'; el.setAttribute('aria-pressed', show);
};
function rulesOk(pw) { const { r } = pwScore(pw); return Object.values(r).every(Boolean); }

// ---- screens shown before signing in
function authFrame(inner, wide = false) {
  stopAll();
  $('#app').innerHTML = `<div class="auth"><div class="auth-card" style="${wide ? 'max-width:520px' : ''}">
    <a class="auth-brand" href="#/login" style="text-decoration:none;color:inherit">${brand()}<b>Crewdesk</b></a>
    ${inner}${footLinks()}</div></div>`;
}
function footLinks() {
  const sup = (S.info && S.info.supportEmail) || '';
  return `<nav class="foot-links" aria-label="Legal"><a href="#/privacy">Privacy</a><a href="#/terms">Terms</a>${sup ? `<a href="mailto:${esc(sup)}">Support</a>` : ''}</nav>`;
}
function renderLogin(msg = '') {
  authFrame(`<h1>Sign in</h1><p class="muted">Welcome back.</p>
    <div class="card"><form data-form="login" class="stack" novalidate>
      ${msg ? `<div class="info-box">${msg}</div>` : ''}
      ${pendingInvite() ? inviteNote() : ''}
      <label class="field"><span>Email</span><input name="email" type="text" inputmode="email" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="username" required value="${esc(S.lastEmail || '')}"></label>
      ${pwField('password', 'Password')}
      <div class="err-msg" data-err role="alert"></div>
      <button class="btn primary block">Sign in</button>
      <div class="row between small"><a href="#/forgot">Forgot password?</a><a href="#/register">Create an account</a></div>
    </form></div>`);
}
function renderRegister(invite = null) {
  authFrame(`<h1>Create your account</h1><p class="muted">Free for your whole crew. We’ll email you a link to confirm your address.</p>
    <div class="card"><form data-form="register" class="stack" novalidate>
      ${invite ? `<div class="invite-banner">${ic('building')}<span><b>${esc(invite.inviter || 'Someone')}</b> invited you to join <b>${esc(invite.company)}</b>. You’ll be added once you confirm your email.</span></div>` : ''}
      <label class="field"><span>Your name</span><input name="name" autocomplete="name" required maxlength="80"></label>
      <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required value="${esc((invite && invite.email) || '')}"></label>
      ${pwField('password', 'Password', { meter: true, autocomplete: 'new-password' })}
      <label class="consent"><input type="checkbox" name="agree" required><span>I agree to the <a href="#/terms">Terms</a> and have read the <a href="#/privacy">Privacy Policy</a>.</span></label>
      <div class="err-msg" data-err role="alert"></div>
      <button class="btn primary block">Create account</button>
      <div class="small" style="text-align:center">Already have an account? <a href="#/login">Sign in</a></div>
    </form></div>`);
}
function renderCheckEmail(email, logged) {
  authFrame(`<h1>Check your email</h1>
    <div class="card stack">
      <p style="margin:0">We sent a confirmation link to <b>${esc(email)}</b>. Open it on this device to finish setting up. It works for 24 hours.</p>
      ${logged ? `<div class="warn">This server isn’t set up to send emails yet, so the link was written to the server log instead. If you run this copy of Crewdesk, you’ll find it in your Render logs.</div>` : '<div class="info-box small" style="margin:0">📬 <b>Can’t see it?</b> Check your <b>spam or junk folder</b> — the first email from Crewdesk often lands there. If it does, mark it “Not spam”.</div>'}
      <form data-form="resend" class="row"><input type="hidden" name="email" value="${esc(email)}"><button class="btn">Send the link again</button></form>
      <div class="err-msg" data-err role="alert"></div>
      <a href="#/login" class="small">Back to sign in</a>
    </div>`);
}
function renderForgot(sentTo = '') {
  authFrame(`<h1>Reset your password</h1>
    <div class="card">${sentTo ? `<div class="stack"><p style="margin:0">We’ve emailed a link to <b>${esc(sentTo)}</b> to choose a new password. It works once, for 30 minutes.</p>
      <div class="info-box small" style="margin:0">📬 <b>Can’t see it?</b> Check your <b>spam or junk folder</b> — the first email from Crewdesk often lands there. If it does, mark it “Not spam”.</div>
      <p class="small muted" style="margin:0">Resetting your password also unlocks your account if it was locked after wrong passwords.</p>
      <div class="row wrap tight"><a href="#/forgot" class="small" data-act="forgot-again">Use a different email</a><span class="muted">·</span><a href="#/login" class="small">Back to sign in</a></div></div>`
      : `<form data-form="forgot" class="stack" novalidate><p class="muted" style="margin:0">Enter your email and we’ll send you a link to choose a new password.</p>
      <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required value="${esc(S.lastEmail || '')}"></label>
      <div class="err-msg" data-err role="alert"></div>
      <button class="btn primary block">Send reset link</button><a href="#/login" class="small">Back to sign in</a></form>`}</div>`);
}
function renderReset(token) {
  authFrame(`<h1>Choose a new password</h1>
    <div class="card"><form data-form="reset" class="stack" novalidate data-token="${esc(token)}">
      ${pwField('password', 'New password', { meter: true, autocomplete: 'new-password' })}
      ${pwField('confirm', 'Type it again', { autocomplete: 'new-password' })}
      <div class="err-msg" data-err role="alert"></div>
      <button class="btn primary block">Save new password</button>
      <p class="small muted" style="margin:0">You’ll be signed out on every other device.</p>
    </form></div>`);
}
async function runVerify(token) {
  authFrame(`<h1>Confirming your email…</h1><div class="card"><div class="skeleton" style="height:18px;width:60%"></div></div>`);
  try {
    const r = await api('POST', '/api/verify', { token });
    S.user = r.user; S.companies = r.companies;
    setPendingInvite(null); // the server joins invited people straight after they confirm
    if (r.joined) S.cid = r.joined;
    history.replaceState(null, '', '/#/home');
    await enterApp();
    toast(r.joined ? 'Email confirmed — you’ve joined the company' : 'Email confirmed. Welcome to Crewdesk!');
  } catch (e) {
    authFrame(`<h1>That link didn’t work</h1><div class="card stack"><p style="margin:0">${esc(e.message)}</p>
      <form data-form="resend" class="stack"><label class="field"><span>Your email</span><input name="email" type="email" required></label><button class="btn primary">Send a new link</button></form>
      <div class="err-msg" data-err role="alert"></div><a href="#/login" class="small">Back to sign in</a></div>`);
  }
}

// ---- invite links
const pendingInvite = () => { try { return sessionStorage.getItem('cd_invite'); } catch { return null; } };
const setPendingInvite = (t) => { try { t ? sessionStorage.setItem('cd_invite', t) : sessionStorage.removeItem('cd_invite'); } catch {} };
function inviteNote() { return `<div class="invite-banner">${ic('building')}<span>Sign in to accept your invite.</span></div>`; }
async function openInvite(token) {
  let info;
  try { info = await api('GET', '/api/invite/' + encodeURIComponent(token)); } catch (e) { info = { valid: false }; }
  if (!info.valid) {
    const why = { expired: 'This invite link has expired.', used: 'This invite link has already been used.', revoked: 'This invite link was cancelled.' }[info.reason] || 'This invite link isn’t valid.';
    setPendingInvite(null);
    if (S.user) { toast(why + ' Ask for a new one.', true); location.hash = '#/home'; return; }
    return authFrame(`<h1>Invite not valid</h1><div class="card stack"><p style="margin:0">${why} Ask the person who invited you for a new link.</p><a href="#/login">Sign in</a></div>`);
  }
  info.token = token;
  if (!S.user) { setPendingInvite(token); S.inviteInfo = info; return renderRegister(info); }
  setPendingInvite(null);
  const already = S.companies.find((c) => c.name === info.company);
  if (already) { if (already.id !== S.cid) toast(`You’re already in ${info.company}`); return; }
  acceptInviteSheet(info);
}
function acceptInviteSheet(info) {
  sheet(`${sheetHead('Join ' + info.company + '?')}<p class="muted">${esc(info.inviter || 'Someone')} invited you to join <b>${esc(info.company)}</b> on Crewdesk.</p>
    ${info.email && info.email !== S.user.email ? `<div class="warn">This invite is for ${esc(info.email)}, but you’re signed in as ${esc(S.user.email)}.</div>` : ''}
    <div class="err-msg" data-err></div>
    <div class="sheet-foot"><button type="button" class="btn" data-close>Not now</button><button type="button" class="btn primary" data-act="invite-accept" data-token="${esc(info.token)}">Join ${esc(info.company)}</button></div>`);
}
A['invite-accept'] = async (el) => {
  el.classList.add('busy');
  try {
    const r = await api('POST', `/api/invite/${encodeURIComponent(el.dataset.token)}/accept`);
    setPendingInvite(null); closeSheets();
    S.companies = r.companies; S.cid = r.company.id; resetCompanyState();
    location.hash = '#/home'; await loadCompany(); toast(`You’ve joined ${r.company.name}`);
  } catch (e) { const box = el.closest('.sheet').querySelector('[data-err]'); box.textContent = e.message; el.classList.remove('busy'); }
};

// ---- first-time setup: no company yet
// (the first-time screen, renderOnboard, lives in directory.js)
function companyForms() {
  return `<form class="card stack" data-form="create-co">
      <div><h2>Set up a new company</h2><p class="muted small" style="margin:4px 0 0">You’ll be the owner, and can invite your crew with a link.</p></div>
      <label class="field"><span>Company name</span><input name="name" required maxlength="80"></label>
      <label class="field"><span>Join password <span class="hint">· people can also join with your company code and this password</span></span><input name="password" type="text" autocomplete="off" minlength="6" required></label>
      <div class="err-msg" data-err></div>
      <button class="btn primary">Create company</button>
    </form>
    <form class="card stack" data-form="join-co">
      <div><h2>Join with a company code</h2><p class="muted small" style="margin:4px 0 0">Got an invite link instead? Just open it.</p></div>
      <div class="form-grid"><label class="field"><span>Company code</span><input name="code" autocapitalize="characters" autocomplete="off" placeholder="e.g. K7Q2MX" required></label>
      <label class="field"><span>Join password</span><input name="password" type="password" autocomplete="off" required></label></div>
      <div class="err-msg" data-err></div>
      <button class="btn">Join company</button>
    </form>`;
}

// ---- form handlers
F.login = async (f, d) => {
  const errBox = f.querySelector('[data-err]');
  if (!d.email || !d.password) throw new Error('Enter your email and password');
  S.lastEmail = d.email;
  try {
    const r = await api('POST', '/api/login', { email: d.email, password: d.password });
    S.user = r.user; S.companies = r.companies;
    await enterApp();
  } catch (e) {
    if (e.data && e.data.needVerify) {
      errBox.innerHTML = `${esc(e.message)} <button type="button" class="btn sm" data-act="resend-verify" data-email="${esc(d.email)}" style="margin-top:6px">Send link again</button>`;
      return;
    }
    throw e;
  }
};
A['resend-verify'] = async (el) => {
  try { await api('POST', '/api/verify/resend', { email: el.dataset.email }); toast('We’ve sent a new link — check your inbox and spam folder'); }
  catch (e) { toast(e.message, true); }
};
F.register = async (f, d) => {
  if (!d.name || !d.name.trim()) throw new Error('Enter your name');
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(d.email || '')) throw new Error('Enter a valid email address');
  if (!rulesOk(d.password || '')) throw new Error('Your password needs at least 12 characters, with a lowercase letter, a capital, a number and a symbol.');
  if (!d.agree) throw new Error('Please tick the box to agree to the Terms and Privacy Policy');
  const r = await api('POST', '/api/register', { name: d.name, email: d.email, password: d.password, agree: true, invite: pendingInvite() || undefined });
  S.lastEmail = r.email;
  renderCheckEmail(r.email, r.emailLogged);
};
F.resend = async (f, d) => {
  await api('POST', '/api/verify/resend', { email: d.email });
  toast('We’ve sent a new link — check your inbox and your spam folder.');
};
F.forgot = async (f, d) => {
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(d.email || '')) throw new Error('Enter a valid email address');
  try { await api('POST', '/api/password/forgot', { email: d.email }); }
  catch (e) {
    if (e.data && e.data.noAccount) { const box = f.querySelector('[data-err]'); box.innerHTML = `${esc(e.message)} <a href="#/register">Create an account</a>`; f.querySelector('input[name=email]').setAttribute('aria-invalid', 'true'); return; }
    throw e;
  }
  S.lastEmail = d.email; renderForgot(d.email);
};
F.reset = async (f, d) => {
  if (!rulesOk(d.password || '')) throw new Error('Your password needs at least 12 characters, with a lowercase letter, a capital, a number and a symbol.');
  if (d.password !== d.confirm) throw new Error('The two passwords don’t match');
  await api('POST', '/api/password/reset', { token: f.dataset.token, password: d.password });
  history.replaceState(null, '', '/#/login');
  renderLogin('Your password has been changed. Sign in with your new password.');
};
F['create-co'] = async (f, d) => {
  const r = await api('POST', '/api/companies', d);
  S.companies = r.companies; S.cid = r.company.id; closeSheets(); resetCompanyState();
  location.hash = '#/settings'; await loadCompany(); toast(`${r.company.name} is ready — now invite your crew`);
};
F['join-co'] = async (f, d) => {
  const r = await api('POST', '/api/companies/join', d);
  S.companies = r.companies; S.cid = r.company.id; closeSheets(); resetCompanyState();
  location.hash = '#/home'; await loadCompany(); toast(`You’re in ${r.company.name}`);
};
A.logout = async () => { try { await api('POST', '/api/logout'); } catch {} signOutLocal(); };

// Routes that work without signing in.
function publicRoute(r) {
  if (r.name === 'privacy' || r.name === 'terms') { renderLegalStandalone(r.name); return true; }
  if (r.name === 'verify' && r.args[0]) { runVerify(r.args[0]); return true; }
  if (r.name === 'reset' && r.args[0]) { renderReset(r.args[0]); return true; }
  if (r.name === 'invite' && r.args[0]) { openInvite(r.args[0]); return true; }
  if (r.name === 'register') { renderRegister(S.inviteInfo && pendingInvite() ? S.inviteInfo : null); return true; }
  if (r.name === 'forgot') { renderForgot(); return true; }
  renderLogin(); return true;
}
A['forgot-again'] = () => renderForgot();
