/* Stay safe: lone working. Start a session, check in when asked (the green ring empties as the next check-in gets closer),
   hold the round help button to raise an alert (loud siren, or silent). Miss a check-in and your own phone sounds a siren,
   and admins get a message. Location is only shared from the Crewdesk Android app. Not available on iPhone. */
'use strict';

// ---------------------------------------------------------------- the Crewdesk Android app (native features)
const NA = () => window.CrewdeskAndroid || null;
const isAndroidApp = () => !!NA();
const APK_URL = 'https://github.com/da1essi08sol-dot/Crewdesk/releases/download/android-latest/crewdesk.apk';
function nativeStatus() { try { return JSON.parse(NA().status()); } catch (_) { return {}; } }
const locBody = (extra = {}) => { let loc = null; try { loc = isAndroidApp() ? JSON.parse(NA().lastLoc() || 'null') : null; } catch (_) {} return Object.assign(loc ? { platform: 'android', loc } : {}, extra); };
let loneSvcKey = '';
function loneTrack(on) { // the app's working-alone service: ongoing notification with I'm safe, and battery-friendly location
  if (!isAndroidApp()) return;
  const m = S.lone && S.lone.mine;
  if (on && m) { const key = [m.id, m.nextAt, m.endsAt].join('|'); if (key !== loneSvcKey) { loneSvcKey = key; try { NA().startSession(S.cid, m.id, m.nextAt, m.endsAt, m.where || ''); } catch (_) {} } }
  else if (loneSvcKey) { loneSvcKey = ''; try { NA().stopSession(); } catch (_) {} }
}
window.crewdeskNative = (msg) => { // the app tells us when a permission changed
  if (msg && msg.type === 'status') {
    const t = nativeStatus().token; if (t) { S.pushEndpoint = 'fcm:' + t; S.pushOn = true; }
    if (['lone', 'profile'].includes(parseHash().name)) renderView(false);
  }
};
if (isAndroidApp()) setTimeout(() => window.crewdeskNative({ type: 'status' }), 500);

// ---------------------------------------------------------------- the siren
// In the Android app: the phone's alarm siren (full volume, keeps going with the screen off). In a browser: a loud
// web siren with buzzing — capped by the phone's media volume.
const Siren = {
  ctx: null, nodes: null, vib: null, wl: null,
  unlock() { try { this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state === 'suspended') this.ctx.resume(); } catch (_) {} },
  start(title, body) {
    if (isAndroidApp()) { try { NA().siren(true, title || 'Alert sent', body || 'Help has been asked for'); } catch (_) {} this.label(); return; }
    this.unlock(); if (!this.ctx || this.nodes) return;
    // A standard alarm: four quick beeps, a short pause, repeat — like a phone's stock alarm.
    const c = this.ctx; const out = c.createGain(); out.gain.value = 0.9;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -24; comp.ratio.value = 10; out.connect(comp); comp.connect(c.destination);
    const osc = c.createOscillator(); osc.type = 'square'; osc.frequency.value = 1000;
    const env = c.createGain(); env.gain.value = 0; osc.connect(env); env.connect(out); osc.start();
    const burst = () => { const t = c.currentTime + 0.02; for (let i = 0; i < 4; i++) { const s0 = t + i * 0.16; env.gain.setValueAtTime(1, s0); env.gain.setValueAtTime(0, s0 + 0.1); } };
    burst(); const timer = setInterval(burst, 1000);
    this.nodes = { osc, out, timer };
    if (navigator.vibrate) { const v = () => navigator.vibrate([700, 300]); v(); this.vib = setInterval(v, 1000); }
    try { if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then((w) => { this.wl = w; }).catch(() => {}); } catch (_) {}
    this.label();
  },
  stop() {
    if (isAndroidApp()) { try { NA().siren(false, '', ''); } catch (_) {} setTimeout(() => this.label(), 300); return; }
    if (this.nodes) { clearInterval(this.nodes.timer); try { this.nodes.osc.stop(); } catch (_) {} try { this.nodes.out.disconnect(); } catch (_) {} this.nodes = null; }
    clearInterval(this.vib); this.vib = null; if (navigator.vibrate) try { navigator.vibrate(0); } catch (_) {}
    if (this.wl) { this.wl.release().catch(() => {}); this.wl = null; }
    this.label();
  },
  get on() { if (isAndroidApp()) { try { return !!NA().sirenOn(); } catch (_) { return false; } } return !!this.nodes; },
  label() { setTimeout(() => $$('[data-siren-label]').forEach((e) => { e.textContent = this.on ? 'Stop siren' : 'Sound siren'; }), 150); },
};
document.addEventListener('pointerdown', () => Siren.unlock(), { capture: true, passive: true }); // browsers only allow sound after a tap

// ---------------------------------------------------------------- helpers
const hm = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const RING = 2 * Math.PI * 88;
const ringOff = (m) => { const f = Math.min(1, Math.max(0, (m.nextAt - Date.now()) / (m.every * 60e3))); return (RING * (1 - f)).toFixed(1); };
const loneEvery = () => { const v = S.company && S.company.settings && S.company.settings.loneEvery; return [15, 30, 45, 60, 90, 120].includes(v) ? v : 60; };
const everyTxt = (n) => (n < 60 ? `${n} minutes` : n === 60 ? 'hour' : n === 90 ? '1½ hours' : `${n / 60} hours`);
const loneClock = (ms) => { ms = Math.max(0, ms); const h = Math.floor(ms / 3600e3), mm = Math.floor((ms % 3600e3) / 60e3), ss = Math.floor((ms % 60e3) / 1000); return `${h}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`; };
function loneLeft(m) {
  const ms = m.nextAt - Date.now(); if (ms <= 0) return 'Now';
  const mm = Math.floor(ms / 60000), ss = Math.floor((ms % 60000) / 1000);
  return mm >= 60 ? `${Math.floor(mm / 60)}h ${mm % 60}m` : `${mm}:${String(ss).padStart(2, '0')}`;
}
const inTxt = (t) => { const m = Math.round((t - Date.now()) / 60000); return m < 60 ? `in ${m} min` : `in ${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}`; };
const dayTxt = (t) => (new Date(t).toDateString() === new Date().toDateString() ? '' : ' tomorrow');
const LONE_STATUS = { active: ['Safe', 'ok'], due: ['Check-in due', 'amber'], overdue: ['Missed check-in', 'red'], alert: ['Needs help', 'red'], ended: ['Finished', 'muted'] };
const loneStatusOf = (s) => (s.status === 'active' && Date.now() >= s.nextAt ? 'due' : s.status);
const loneNeeds = () => { const L = S.lone || {}; return (L.watching || []).filter((s) => s.status === 'overdue' || s.status === 'alert').length + (L.mine && (L.mine.status === 'overdue' || loneStatusOf(L.mine) === 'due') ? 1 : 0); };
function setLone(r) { S.lone = r; loneTrack(!!(r && r.mine)); updateChrome(); renderView(false); }
const lonePost = async (path, body) => setLone(await capi('POST', path, body));
const mineId = () => S.lone && S.lone.mine && S.lone.mine.id;

// The session you're about to start (remembered from last time, edited in Session details).
function loneDraft() {
  if (!S.loneDraft) {
    const p = (S.user.prefs && S.user.prefs.lone) || {};
    const step = 5 * 60e3; const want = Math.round((Date.now() + (p.mins || 240) * 60e3) / step) * step;
    S.loneDraft = { where: p.where || '', note: '', finishAt: want };
  }
  const min = Math.ceil((Date.now() + 10 * 60e3) / 300e3) * 300e3;
  if (S.loneDraft.finishAt < min) S.loneDraft.finishAt = min;
  return S.loneDraft;
}

// ---------------------------------------------------------------- the page
VIEWS.lone = {
  render() {
    if (isIOS()) return `<div class="lone-page"><section class="lone-hero"><div class="lone-hero-ico">${icSize('shield', 30)}</div><div><h1>Stay safe</h1><p>Stay safe isn’t available on iPhone. iOS does not support web app alerts or live location tracking, while Android does.</p></div></section>
      <div class="card stack"><b>Use an Android phone for lone working</b><span class="small muted">Install the Crewdesk Android app on a company Android phone to start sessions, check in, raise alerts and share your location.</span></div></div>`;
    const L = S.lone || {};
    return `<div class="lone-page">${loneTestWarning()}${loneSetup()}${L.mine ? loneActive(L.mine) : loneStart()}${loneWatching(L.watching || [])}${loneAdmin()}${loneHistory(L.recent || [])}</div>`;
  },
  mount(arg) {
    loneTick();
    if (arg === 'checkin') { // opened from a "check in" notification: check in straight away
      history.replaceState(null, '', '#/lone');
      const m = S.lone && S.lone.mine; if (m && m.status !== 'alert') A['lone-checkin']();
    }
  },
};
function loneTestWarning() {
  return `<div class="lone-warn" role="note">${icSize('warn', 20)}<div><b>Stay safe is being tested — don’t rely on it.</b><br>Keep using the StaySafe app alongside Crewdesk to make sure you’re fully protected, until further testing is done and safety standards are met.</div></div>`;
}

// Android app: a checklist of the phone permissions Stay safe needs. In a browser: where to get the app.
function loneSetup() {
  if (!isAndroidApp()) {
    // Already using the web app from the Home Screen (or on a computer)? Then say nothing.
    const webApp = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
    return /Android/i.test(navigator.userAgent) && !webApp
      ? `<div class="lone-note warn">${icSize('phoneapp', 18)}<span class="grow"><b>Add Crewdesk to your Home Screen as a web app</b> so check-in reminders reach your lock screen.</span><button class="btn sm" data-act="install-show">Add</button></div>`
      : '';
  }
  const st = nativeStatus();
  const rows = [
    ['notifications', 'Notifications', 'Check-in reminders and alerts', st.notifications],
    ['location', 'Location', 'Shared only while a session runs', st.location],
    ['fullScreen', 'Full-screen alerts', 'Emergency alerts over the lock screen', st.fullScreen],
    ['battery', 'No battery limits', 'So Android never stops a session or a siren', st.battery],
    ['dnd', 'Alarms on Do Not Disturb', 'Optional: the siren still sounds when Do Not Disturb is on', st.dnd, true],
  ];
  const missing = rows.filter((r) => !r[3] && !r[4]).length;
  const linked = !!st.token;
  return `<details class="card lone-setup" ${missing || !linked ? 'open' : ''}><summary><b>${missing || !linked ? 'Set up this phone for Stay safe' : '✓ This phone is set up for Stay safe'}</b><span class="small muted">${missing ? missing + ' to do' : ''}</span></summary>
    ${rows.map(([k, t, d, ok, opt]) => `<div class="lone-perm"><span class="lone-perm-ico ${ok ? 'ok' : opt ? '' : 'bad'}">${icSize(ok ? 'check' : opt ? 'help' : 'warn', 16)}</span><span class="grow"><b>${t}</b><br><span class="tiny muted">${d}</span></span>${ok ? '' : `<button class="btn sm ${opt ? '' : 'primary'}" data-act="lone-perm" data-k="${k}">Allow</button>`}</div>`).join('')}
    <div class="lone-perm"><span class="lone-perm-ico ${linked ? 'ok' : 'bad'}">${icSize(linked ? 'check' : 'warn', 16)}</span><span class="grow"><b>Emergency alerts connected</b><br><span class="tiny muted">${linked ? 'Alerts reach this phone even when Crewdesk is closed' : 'Waiting for the server (Firebase must be set up in Render)'}</span></span></div>
    <div class="row wrap tight" style="margin-top:10px"><button class="btn sm" data-act="lone-test" data-alarm="1">${ic('bell')}Test the siren</button><button class="btn sm ghost" data-act="lone-perm" data-k="channel">Alert sound settings</button></div>
  </details>`;
}
function panicButton(big) {
  return `<div class="ls-wheel ${big ? 'big' : ''}">
      <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54" class="ls-wheel-track"/><circle cx="60" cy="60" r="54" class="ls-wheel-fill"/></svg>
      <button class="ls-panic" data-hold="lone-alert" aria-label="Help: press and hold for 2 seconds to raise an alert">${icSize('warn', big ? 40 : 30)}<b>Help</b><span>Hold 2 sec</span></button>
    </div>`;
}
function loneStart() {
  const d = loneDraft(); const every = loneEvery();
  return `<section class="ls">
      <div class="ls-clock"><b>${loneClock(every * 60e3)}</b><span>Check in every ${everyTxt(every)} · finish by ${hm(d.finishAt)}${dayTxt(d.finishAt)}</span></div>
      ${panicButton(true)}
      <p class="ls-hint">In trouble? Press and hold <b>Help</b> for 2 seconds.</p>
      <button class="ls-go" data-act="lone-go">${icSize('play', 20)}Start session</button>
      <button class="ls-details" data-act="lone-details">
        <span class="grow"><b>${esc(d.where || 'Where are you working?')}</b><span class="tiny muted">Finish ${hm(d.finishAt)}${dayTxt(d.finishAt)} · admins are alerted if you need help</span></span>${ic('edit')}
      </button>
      <button class="lone-silent" data-act="lone-alert-silent">Send a silent alert instead</button>
    </section>`;
}
function loneActive(m) {
  const st = loneStatusOf(m);
  if (m.status === 'alert') {
    return `<section class="lone-alert-panel">
      <div class="lone-alert-ico">${icSize('warn', 34)}</div>
      <h1>${m.silent ? 'Silent alert sent' : 'Alert sent'}</h1>
      <p>${m.ackBy ? `<b>${esc(firstName(m.ackBy))} is responding.</b> Help is on the way.` : 'Your admins have been alerted and asked to call you. A ping with your location is up for everyone until you tap I’m safe.'}</p>
      <div class="lone-alert-acts">
        <button class="btn lone-siren-btn" data-act="lone-siren">${icSize('bell', 18)}<span data-siren-label>${Siren.on ? 'Stop siren' : 'Sound siren'}</span></button>
        <button class="btn lone-safe-btn" data-act="lone-safe">${icSize('check', 18)}I’m safe, cancel alert</button>
      </div>
    </section>${loneDetails(m)}`;
  }
  const late = st === 'overdue' || st === 'due';
  return `<section class="lone-live ${late ? 'late' : ''}">
      <div class="lone-status"><span class="lone-chip ${st === 'active' ? 'ok' : st === 'due' ? 'amber' : 'red'}">${LONE_STATUS[st][0]}</span><span class="ellipsis">${esc(m.where || 'Working alone')}</span></div>
      <button class="lone-dial lone-dial-btn" data-act="lone-checkin" aria-label="I’m safe — check in. Next check-in ${esc(loneLeft(m))}">
        <svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="88" class="track"/><circle cx="100" cy="100" r="88" class="fill" data-lone-ring style="stroke-dasharray:${RING.toFixed(1)};stroke-dashoffset:${ringOff(m)}"/></svg>
        <span class="lone-core">
          ${icSize('check', 30)}
          <b class="lone-core-big">I’m safe</b>
          <span class="lone-core-sub">Tap to check in</span>
          <span class="lone-core-time"><span data-lone-count>${loneLeft(m)}</span> ${st === 'overdue' ? '· admins told' : st === 'due' ? '· due now' : 'left · ' + hm(m.nextAt)}</span>
        </span>
      </button>
      <div class="ls-trio">
        <button class="ls-round" data-act="lone-addtime">${icSize('plus', 24)}<span>Add time</span></button>
        ${panicButton(false)}
        <button class="ls-round" data-act="lone-end">${icSize('flag', 22)}<span>Finish</span></button>
      </div>
      <button class="lone-silent" data-act="lone-alert-silent">Send a silent alert instead</button>
    </section>${loneDetails(m)}`;
}
function loneDetails(m) {
  const rows = [
    ['pin', 'Where', m.where || 'Not given'],
    ['clock', 'Checking in', `Every ${everyTxt(m.every)}`], ['flag', 'Finish by', hm(m.endsAt)],
  ].concat(m.loc ? [['locate', 'Location', `Shared · updated ${timeAgo(m.loc.at)}`]] : []);
  return `<div class="card lone-details">${rows.map(([i, k, v]) => `<div class="lone-kv">${icSize(i, 16)}<span class="k">${k}</span><span class="v">${esc(v)}</span></div>`).join('')}
    ${m.note ? `<p class="small" style="margin:10px 0 0">${esc(m.note)}</p>` : ''}
    <div class="lone-log">${m.log.slice(-6).reverse().map((l) => `<div><time>${hm(l.at)}</time><span>${esc(l.what)}</span></div>`).join('')}</div></div>`;
}
function loneWatching(list) {
  if (!list.length) return '';
  return `<h2 class="lone-h">People working alone <span class="muted">(${list.length})</span></h2>
    <div class="stack tight">${list.map((s) => {
      const st = loneStatusOf(s); const [lbl, cls] = LONE_STATUS[st]; const bad = s.status === 'alert' || s.status === 'overdue';
      return `<div class="card lone-person ${bad ? 'bad' : ''}">
        <div class="row">${avatar(member(s.userId), '')}<div class="grow" style="min-width:0"><b class="ellipsis" style="display:block">${esc(member(s.userId).name)}</b><span class="small muted ellipsis" style="display:block">${esc(s.where || 'Working alone')}</span></div><span class="lone-chip ${cls}">${lbl}</span></div>
        <div class="small muted lone-meta">Checked in ${timeAgo(s.lastCheck)} · next due ${hm(s.nextAt)} · finishes ${hm(s.endsAt)}${s.ackBy ? ` · <b>${esc(firstName(s.ackBy))} is responding</b>` : ''}</div>
        ${s.note ? `<div class="small lone-meta">${esc(s.note)}</div>` : ''}
        <div class="row wrap tight" style="margin-top:10px">
          ${s.phone ? `<a class="btn sm ${bad ? 'danger solid' : ''}" href="tel:${esc(s.phone.replace(/[^\d+]/g, ''))}">${ic('phone')}Call</a>` : ''}
          ${s.loc ? `<a class="btn sm" href="https://www.google.com/maps/search/?api=1&query=${s.loc.lat},${s.loc.lng}" target="_blank" rel="noopener">${ic('pin')}Map · ${timeAgo(s.loc.at)}</a>` : ''}
          <a class="btn sm ghost" href="#/chat/" data-act="message-person" data-id="${s.userId}">${ic('chat')}Message</a>
          ${bad && !s.ackBy ? `<button class="btn sm primary" data-act="lone-ack" data-id="${s.id}">${ic('check')}I’m responding</button>` : ''}
          ${s.status === 'alert' && Siren.on ? `<button class="btn sm" data-act="lone-siren-off">Stop alarm</button>` : ''}
        </div></div>`;
    }).join('')}</div>`;
}
function loneAdmin() { // admins choose how often everyone checks in (one hour unless changed)
  if (!isAdmin()) return '';
  const v = loneEvery();
  return `<div class="card lone-admin"><div class="row between wrap" style="gap:10px"><div><b>Check-in interval</b><br><span class="tiny muted">For everyone in ${esc(S.company.name)} · admins only</span></div>
    <select data-change="lone-every" aria-label="Check-in interval">${[15, 30, 45, 60, 90, 120].map((n) => `<option value="${n}" ${n === v ? 'selected' : ''}>Every ${everyTxt(n)}${n === 60 ? ' (default)' : ''}</option>`).join('')}</select></div></div>`;
}
function loneHistory(list) {
  if (!list.length) return '';
  return `<details class="card lone-hist"><summary><b>Recent sessions</b><span class="muted small">${list.length}</span></summary>
    ${list.map((s) => { const alerts = s.log.filter((l) => /alert|Missed/.test(l.what)).length; const mins = Math.round((s.endedAt - s.startedAt) / 60000);
      return `<div class="lone-hrow"><span class="grow"><b>${esc(member(s.userId).name)}</b> <span class="muted">· ${esc(s.where || 'Working alone')}</span><br><span class="tiny muted">${esc(fmtDateTime(s.startedAt))} · ${mins >= 60 ? Math.floor(mins / 60) + 'h ' : ''}${mins % 60}m</span></span>${alerts ? `<span class="lone-chip red">${alerts} alert${alerts > 1 ? 's' : ''}</span>` : '<span class="lone-chip ok">Safe</span>'}</div>`; }).join('')}</details>`;
}

// ---------------------------------------------------------------- the time picker (5-minute steps)
function timePicker(t, min, max, chips) {
  const d = new Date(t);
  return `<div class="tp" data-tp data-t="${t}" data-min="${min}" data-max="${max}">
      <div class="tp-col"><button type="button" class="tp-arrow" data-act="tp-step" data-d="60" aria-label="One hour later">${icSize('down', 22, 'transform:rotate(180deg)')}</button><b data-tp-h>${String(d.getHours()).padStart(2, '0')}</b><button type="button" class="tp-arrow" data-act="tp-step" data-d="-60" aria-label="One hour earlier">${icSize('down', 22)}</button></div>
      <span class="tp-colon">:</span>
      <div class="tp-col"><button type="button" class="tp-arrow" data-act="tp-step" data-d="5" aria-label="5 minutes later">${icSize('down', 22, 'transform:rotate(180deg)')}</button><b data-tp-m>${String(d.getMinutes()).padStart(2, '0')}</b><button type="button" class="tp-arrow" data-act="tp-step" data-d="-5" aria-label="5 minutes earlier">${icSize('down', 22)}</button></div>
    </div>
    <div class="tp-in" data-tp-in>${dayTxt(t) ? 'Tomorrow · ' : ''}${inTxt(t)}</div>
    <div class="tp-chips">${chips.map(([l, v]) => `<button type="button" class="tp-chip" data-act="tp-set" data-v="${v}">${l}</button>`).join('')}</div>`;
}
function tpPaint(box, t) {
  const min = Number(box.dataset.min), max = Number(box.dataset.max);
  t = Math.min(max, Math.max(min, Math.round(t / 300e3) * 300e3)); box.dataset.t = t;
  const d = new Date(t); box.querySelector('[data-tp-h]').textContent = String(d.getHours()).padStart(2, '0'); box.querySelector('[data-tp-m]').textContent = String(d.getMinutes()).padStart(2, '0');
  const inEl = box.parentNode.querySelector('[data-tp-in]'); if (inEl) inEl.textContent = (dayTxt(t) ? 'Tomorrow · ' : '') + inTxt(t);
  const f = box.closest('form'); if (f && f.elements.finishAt) f.elements.finishAt.value = t;
  $$('.tp-chip', box.parentNode).forEach((c) => c.classList.toggle('on', Math.abs(Number(c.dataset.v) - t) < 1000));
  if (navigator.vibrate) try { navigator.vibrate(6); } catch (_) {}
}
A['tp-step'] = (el) => { const box = el.closest('[data-tp]'); tpPaint(box, Number(box.dataset.t) + Number(el.dataset.d) * 60e3); };
A['tp-set'] = (el) => { const box = el.parentNode.parentNode.querySelector('[data-tp]'); tpPaint(box, Number(el.dataset.v)); };
function dayEndToday() { const [h, mi] = String((S.company.settings && S.company.settings.dayEnd) || '16:30').split(':').map(Number); const d = new Date(); d.setHours(h, mi, 0, 0); return d.getTime(); }

A['lone-details'] = () => {
  const d = loneDraft(); const now = Date.now();
  const min = Math.ceil((now + 10 * 60e3) / 300e3) * 300e3, max = now + 12 * 3600e3;
  const r5 = (t) => Math.round(t / 300e3) * 300e3;
  const chips = [['1 hour', r5(now + 3600e3)], ['2 hours', r5(now + 2 * 3600e3)], ['4 hours', r5(now + 4 * 3600e3)]];
  const de = dayEndToday(); if (de > min) chips.push([`End of day (${hm(de)})`, de]);
  sheet(`${sheetHead('Session details')}
    <form class="stack" data-form="lone-details">
      <label class="field"><span>Where are you working?</span><input name="where" maxlength="120" value="${esc(d.where)}" placeholder="e.g. Manhole survey, Tyne Street" autocomplete="off"></label>
      <div class="field"><span>Finish by</span>${timePicker(Math.min(max, Math.max(min, d.finishAt)), min, max, chips)}<input type="hidden" name="finishAt" value="${Math.min(max, Math.max(min, d.finishAt))}"></div>
      <label class="field"><span>Anything that would help someone find you <span class="muted">(optional)</span></span><textarea name="note" rows="2" maxlength="300" placeholder="Van reg, access code, which entrance…">${esc(d.note)}</textarea></label>
      <div class="sheet-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Done</button></div>
    </form>`);
};
F['lone-details'] = async (f, d, close) => { Object.assign(loneDraft(), { where: d.where.trim(), note: d.note.trim(), finishAt: Number(d.finishAt) }); close(); renderView(false); };

A['lone-addtime'] = () => {
  const m = S.lone && S.lone.mine; if (!m) return;
  if (m.status === 'overdue') return toast('Check in first — you’ve missed a check-in', true);
  if (m.extendedAt && m.extendedAt > m.lastCheck) return toast('You’ve already added time. Check in first, then you can add more.', true);
  const max = Math.min(m.endsAt + 2 * 3600e3, m.startedAt + 12 * 3600e3), min = m.endsAt + 5 * 60e3;
  if (max < min) return toast('A session can’t run longer than 12 hours. Finish this one and start a new one.', true);
  const r5 = (t) => Math.round(t / 300e3) * 300e3;
  sheet(`${sheetHead('Add time')}
    <form class="stack" data-form="lone-addtime">
      <p class="small muted" style="margin:0">Now finishing at <b>${hm(m.endsAt)}</b>. Pick your new finish time (up to 2 hours more). Your check-ins stay the same, and you can add time again after your next check-in.</p>
      <div class="field"><span>New finish time</span>${timePicker(Math.min(max, r5(m.endsAt + 30 * 60e3)), min, max, [['+15 min', r5(m.endsAt + 15 * 60e3)], ['+30 min', r5(m.endsAt + 30 * 60e3)], ['+1 hour', r5(m.endsAt + 3600e3)], ['+2 hours', r5(m.endsAt + 2 * 3600e3)]].filter(([, v]) => v <= max))}<input type="hidden" name="finishAt" value="${Math.min(max, r5(m.endsAt + 30 * 60e3))}"></div>
      <div class="sheet-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Add time</button></div>
    </form>`);
};
F['lone-addtime'] = async (f, d, close) => {
  const m = S.lone.mine; const mins = Math.round((Number(d.finishAt) - m.endsAt) / 60e3);
  await lonePost(`/lone/${m.id}/extend`, locBody({ minutes: mins })); close(); toast(`Finishing at ${hm(m.endsAt + mins * 60e3)} now`);
};

let loneTimer = null;
function loneTick() {
  clearInterval(loneTimer);
  loneTimer = setInterval(() => {
    if (parseHash().name !== 'lone') { clearInterval(loneTimer); return; }
    const m = S.lone && S.lone.mine; if (!m || m.status === 'alert') return;
    const el = $('[data-lone-count]'); if (el) el.textContent = loneLeft(m);
    const ring = $('[data-lone-ring]'); if (ring) ring.style.strokeDashoffset = ringOff(m); // the green ring empties as the check-in gets closer
    if (m.nextAt <= Date.now() && !$('.lone-live.late')) renderView(false); // just became due
  }, 1000);
}

// ---------------------------------------------------------------- actions
A['lone-go'] = async (el) => {
  const d = loneDraft(); el.disabled = true;
  try {
    S.user.prefs = Object.assign({}, S.user.prefs, { lone: { mins: Math.round((d.finishAt - Date.now()) / 60e3), where: d.where } });
    setLone(await capi('POST', '/lone', locBody({ where: d.where, finishAt: d.finishAt, note: d.note })));
    S.loneDraft = null; toast('Session started. Stay safe.');
  } catch (e) { toast(e.message, true); el.disabled = false; }
};
A['lone-perm'] = (el) => { try { NA().request(el.dataset.k); } catch (_) {} };
A['lone-test'] = async (el) => { try { await api('POST', '/api/fcm/test', { alarm: el.dataset.alarm === '1' }); toast('Sent — it should arrive in a few seconds'); } catch (e) { toast(e.message, true); } };
A['lone-push'] = async () => { try { await pushSubscribe(); toast('Lock-screen notifications are on'); renderView(false); } catch (e) { toast(e.message, true); } };
A['lone-checkin'] = async () => {
  Siren.stop();
  try { await lonePost(`/lone/${mineId()}/checkin`, locBody()); if (navigator.vibrate) navigator.vibrate(25); toast('Checked in. Stay safe.'); } catch (e) { toast(e.message, true); }
};
A['lone-end'] = async () => {
  if (!(await confirmBox('Finish working alone?', 'Your admins won’t be alerted any more. Only finish once you’re safe.', 'I’m safe, finish'))) return;
  try { await lonePost(`/lone/${mineId()}/end`, locBody()); Siren.stop(); toast('Session finished. Glad you’re safe.'); } catch (e) { toast(e.message, true); }
};
A['lone-alert'] = async () => {
  Siren.start('Alert sent', 'Your admins have been asked to call you');
  try { await lonePost(mineId() ? `/lone/${mineId()}/alert` : '/lone/panic', locBody()); } catch (e) { toast(e.message, true); }
};
A['lone-alert-silent'] = async () => {
  if (!(await confirmBox('Send a silent alert?', 'Your admins are alerted straight away and a ping with your location goes up. Your phone makes no sound.', 'Send silent alert'))) return;
  try { await lonePost(mineId() ? `/lone/${mineId()}/alert` : '/lone/panic', locBody({ silent: true })); } catch (e) { toast(e.message, true); }
};
A['lone-safe'] = async () => { Siren.stop(); try { await lonePost(`/lone/${mineId()}/safe`, locBody()); toast('Alert cancelled. Everyone has been told you’re safe.'); } catch (e) { toast(e.message, true); } };
A['lone-siren'] = () => { if (Siren.on) Siren.stop(); else Siren.start(); };
A['lone-siren-off'] = () => { Siren.stop(); setTimeout(() => renderView(false), 350); };
A['lone-ack'] = async (el) => { Siren.stop(); try { await lonePost(`/lone/${el.dataset.id}/ack`); toast('They’ve been told you’re responding'); } catch (e) { toast(e.message, true); } };
C['lone-every'] = async (el) => {
  try { const r = await capi('PATCH', '', { settings: { loneEvery: Number(el.value) } }); S.company = r.company; toast(`Everyone now checks in every ${everyTxt(Number(el.value))}`); renderView(false); } catch (e) { toast(e.message, true); }
};

// Hold-to-activate: press and hold for 2 seconds (the ring fills), so it can't go off in a pocket.
let holdT = null, holdEl = null;
const holdStop = () => { clearTimeout(holdT); holdT = null; if (holdEl) { holdEl.classList.remove('holding'); const w = holdEl.closest('.ls-wheel'); if (w) w.classList.remove('holding'); } holdEl = null; };
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest && e.target.closest('[data-hold]'); if (!el) return;
  e.preventDefault(); Siren.unlock(); holdEl = el; el.classList.add('holding');
  const w = el.closest('.ls-wheel'); if (w) w.classList.add('holding');
  if (navigator.vibrate) navigator.vibrate(15);
  holdT = setTimeout(() => { const fn = A[el.dataset.hold]; holdStop(); if (navigator.vibrate) navigator.vibrate(80); if (fn) fn(el); }, 2000);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => document.addEventListener(t, (e) => { if (holdEl && (t !== 'pointerleave' || e.target === holdEl)) holdStop(); }, true));
document.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('[data-hold]')) e.preventDefault(); });

// Live updates. Someone's alert sounds the alarm for buddies and admins with the app open; a missed check-in only sounds
// the siren on the worker's own phone (buddies and admins just get a message).
function loneEvent(ev) {
  const was = S.lone && S.lone.mine && S.lone.mine.status;
  S.lone = ev.state; loneTrack(!!(ev.state && ev.state.mine));
  const mine = ev.state && ev.state.mine;
  if (mine && mine.status === 'overdue' && was !== 'overdue' && !isAndroidApp()) Siren.start(); // (the Android app sounds it natively)
  if (ev.alarm) {
    const s = (ev.state.watching || []).find((x) => x.id === ev.alarm);
    if (s && s.status === 'alert') {
      if (!isAndroidApp()) Siren.start();
      banner({ link: '#/lone', from: s.userId, title: `${member(s.userId).name} needs help`, text: s.where ? 'Working at ' + s.where : 'Working alone — call them now', icon: 'bell' });
    }
  }
  if (typeof updateMap === 'function') updateMap(); // red exclamation on the team map
  scheduleRender();
}

// Everywhere a person shows: is their alert active? (everyone in the company can see this — it's also a ping)
const alertOf = (uid) => ((S.lone && S.lone.alerts) || []).find((a) => a.userId === uid) || null;
(function () {
  const render = VIEWS.person.render;
  VIEWS.person.render = function (id) {
    const a = alertOf(id); const html = render.apply(this, arguments);
    if (!a) return html;
    const D = a.loc ? dirLinks(a.loc.lat, a.loc.lng) : null;
    return `<div class="lone-alert-strip">${icSize('warn', 20)}<div class="grow"><b>Alert active</b><br><span class="small">${esc(member(id).name)} triggered an alert ${timeAgo(a.at)}${a.where ? ' · ' + esc(a.where) : ''}</span></div>
      ${a.phone ? `<a class="btn sm" href="tel:${esc(a.phone.replace(/[^\d+]/g, ''))}">${ic('phone')}Call</a>` : ''}${D ? `<a class="btn sm" href="${isIOS() ? D.apple : D.google}" target="_blank" rel="noopener">${ic('route')}Directions</a>` : ''}</div>` + html;
  };
})();
