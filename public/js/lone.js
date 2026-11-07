/* Stay safe: lone working. Start a session, check in when asked, hold the help button to raise an alert (loud siren, or silent).
   Miss a check-in and your buddy and admins are alerted. Location is only shared from the Crewdesk Android app — never from
   a browser or iPhone. */
'use strict';

// ---------------------------------------------------------------- Android-only location
const isAndroidApp = () => { const Cap = window.Capacitor; try { return !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform() && Cap.getPlatform() === 'android'); } catch (_) { return false; } };
let loneWatchId = null, loneLastSent = 0, loneLastLoc = null;
const locBody = (extra = {}) => Object.assign(isAndroidApp() && loneLastLoc ? { platform: 'android', loc: loneLastLoc } : {}, extra);
function loneTrack(on) {
  if (!isAndroidApp() || !navigator.geolocation) return; // tracking only ever runs in the Android app
  if (on && loneWatchId == null) {
    loneWatchId = navigator.geolocation.watchPosition((p) => {
      loneLastLoc = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
      const m = S.lone && S.lone.mine;
      if (m && Date.now() - loneLastSent > 120e3) { loneLastSent = Date.now(); capi('POST', `/lone/${m.id}/loc`, locBody()).catch(() => {}); }
    }, () => {}, { enableHighAccuracy: true, maximumAge: 30e3, timeout: 60e3 });
  }
  if (!on && loneWatchId != null) { navigator.geolocation.clearWatch(loneWatchId); loneWatchId = null; loneLastLoc = null; }
}

// ---------------------------------------------------------------- the siren
// As loud as the phone allows: a sweeping two-tone siren through a compressor, with buzzing and the screen kept awake.
// The phone's media volume still sets the ceiling — no web app can go past it.
const Siren = {
  ctx: null, nodes: null, vib: null, wl: null,
  unlock() { try { this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state === 'suspended') this.ctx.resume(); } catch (_) {} },
  start() {
    this.unlock(); if (!this.ctx || this.nodes) return;
    const c = this.ctx; const out = c.createGain(); out.gain.value = 0.95;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -30; comp.ratio.value = 12; out.connect(comp); comp.connect(c.destination);
    const a = c.createOscillator(), b = c.createOscillator(); a.type = 'sawtooth'; b.type = 'square'; a.frequency.value = b.frequency.value = 1050; b.detune.value = 15;
    const lfo = c.createOscillator(); lfo.frequency.value = 1.7; const depth = c.createGain(); depth.gain.value = 480;
    lfo.connect(depth); depth.connect(a.frequency); depth.connect(b.frequency);
    const bg = c.createGain(); bg.gain.value = 0.4; b.connect(bg); bg.connect(out); a.connect(out);
    a.start(); b.start(); lfo.start(); this.nodes = [a, b, lfo, out];
    if (navigator.vibrate) { const v = () => navigator.vibrate([700, 300]); v(); this.vib = setInterval(v, 1000); }
    try { if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then((w) => { this.wl = w; }).catch(() => {}); } catch (_) {}
    $$('[data-siren-label]').forEach((e) => { e.textContent = 'Stop siren'; });
  },
  stop() {
    if (this.nodes) { for (const n of this.nodes.slice(0, 3)) try { n.stop(); } catch (_) {} try { this.nodes[3].disconnect(); } catch (_) {} this.nodes = null; }
    clearInterval(this.vib); this.vib = null; if (navigator.vibrate) try { navigator.vibrate(0); } catch (_) {}
    if (this.wl) { this.wl.release().catch(() => {}); this.wl = null; }
    $$('[data-siren-label]').forEach((e) => { e.textContent = 'Sound siren'; });
  },
  get on() { return !!this.nodes; },
};
document.addEventListener('pointerdown', () => Siren.unlock(), { capture: true, passive: true }); // browsers only allow sound after a tap

// ---------------------------------------------------------------- helpers
const hm = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const RING = 2 * Math.PI * 88;
const ringOff = (m) => { const f = Math.min(1, Math.max(0, (m.nextAt - Date.now()) / (m.every * 60e3))); return (RING * (1 - f)).toFixed(1); };
function loneLeft(m) {
  const ms = m.nextAt - Date.now(); if (ms <= 0) return 'Now';
  const mm = Math.floor(ms / 60000), ss = Math.floor((ms % 60000) / 1000);
  return mm >= 60 ? `${Math.floor(mm / 60)}h ${mm % 60}m` : `${mm}:${String(ss).padStart(2, '0')}`;
}
const LONE_STATUS = { active: ['Safe', 'ok'], due: ['Check-in due', 'amber'], overdue: ['Missed check-in', 'red'], alert: ['Needs help', 'red'], ended: ['Finished', 'muted'] };
const loneStatusOf = (s) => (s.status === 'active' && Date.now() >= s.nextAt ? 'due' : s.status);
const loneNeeds = () => { const L = S.lone || {}; return (L.watching || []).filter((s) => s.status === 'overdue' || s.status === 'alert').length + (L.mine && (L.mine.status === 'overdue' || loneStatusOf(L.mine) === 'due') ? 1 : 0); };
function setLone(r) { S.lone = r; loneTrack(!!(r && r.mine)); updateChrome(); renderView(false); }
const lonePost = async (path, body) => setLone(await capi('POST', path, body));
const mineId = () => S.lone && S.lone.mine && S.lone.mine.id;

// ---------------------------------------------------------------- the page
VIEWS.lone = {
  render() {
    const L = S.lone || {};
    return `<div class="lone-page">${L.mine ? loneActive(L.mine) : loneStart()}${loneWatching(L.watching || [])}${loneHistory(L.recent || [])}</div>`;
  },
  mount() { loneTick(); },
};

function loneTrackingNote() {
  return isAndroidApp()
    ? `<div class="lone-note ok">${icSize('pin', 16)}<span>Your location is shared with your buddy and admins while a session runs.</span></div>`
    : `<div class="lone-note">${icSize('pin', 16)}<span>Location isn’t shared from this device. Only the Crewdesk Android app shares location. Check-ins and alerts still work here.</span></div>`;
}
function loneStart() {
  const people = Object.values(S.members).filter((m) => m.id !== S.user.id).sort((a, b) => a.name.localeCompare(b.name));
  const opt = (v, l, on) => `<label class="lone-pill"><input type="radio" name="every" value="${v}" ${on ? 'checked' : ''}><span>${l}</span></label>`;
  const hrs = [0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12];
  return `<section class="lone-hero">
      <div class="lone-hero-ico">${icSize('shield', 30)}</div>
      <div><h1>Stay safe</h1><p>Working on your own? Start a session before you go. Crewdesk asks you to check in, and if you miss one your buddy and admins are alerted straight away.</p></div>
    </section>
    ${S.pushOn ? '' : `<div class="lone-note warn">${icSize('bell', 16)}<span class="grow">Turn on lock-screen notifications so Crewdesk can remind you to check in when your phone is locked.</span><button class="btn sm" data-act="lone-push">Turn on</button></div>`}
    <form class="card stack lone-form" data-form="lone-start">
      <label class="field"><span>Where are you working?</span><input name="where" maxlength="120" placeholder="e.g. Manhole survey, Tyne Street" autocomplete="off"></label>
      <div class="field"><span>Check in every</span><div class="lone-pills">${opt(15, '15 min')}${opt(30, '30 min')}${opt(45, '45 min')}${opt(60, '1 hour', true)}${opt(90, '1½ hr')}${opt(120, '2 hours')}</div></div>
      <div class="form-grid">
        <label class="field"><span>Finish by</span><select name="hours" data-change="lone-hours">${hrs.map((h) => `<option value="${h}" ${h === 4 ? 'selected' : ''}>${h < 1 ? '30 minutes' : h === 1 ? '1 hour' : h + ' hours'} · ${hm(Date.now() + h * 3600e3)}</option>`).join('')}</select></label>
        <label class="field"><span>Buddy</span><select name="buddy"><option value="">No buddy (admins only)</option>${people.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>Anything that would help someone find you <span class="muted">(optional)</span></span><textarea name="note" rows="2" maxlength="300" placeholder="Van reg, access code, which entrance…"></textarea></label>
      ${loneTrackingNote()}
      <div class="err-msg" data-err role="alert"></div>
      <button class="btn primary lone-go">${icSize('play', 18)}Start session</button>
    </form>`;
}
function loneActive(m) {
  const st = loneStatusOf(m);
  if (m.status === 'alert') {
    return `<section class="lone-alert-panel">
      <div class="lone-alert-ico">${icSize('bell', 34)}</div>
      <h1>${m.silent ? 'Silent alert sent' : 'Alert sent'}</h1>
      <p>${m.ackBy ? `<b>${esc(firstName(m.ackBy))} is responding.</b> Help is on the way.` : 'Your buddy and admins have been alerted and asked to call you.'}</p>
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
          <span class="lone-core-time"><span data-lone-count>${loneLeft(m)}</span> ${st === 'overdue' ? '· buddy alerted' : st === 'due' ? '· due now' : 'left · ' + hm(m.nextAt)}</span>
        </span>
      </button>
      <div class="lone-row">
        <button class="btn" data-act="lone-extend" data-min="30">${ic('plus')}30 min</button>
        <button class="btn" data-act="lone-extend" data-min="60">${ic('plus')}1 hour</button>
        <button class="btn" data-act="lone-end">${ic('flag')}Finish</button>
      </div>
      <button class="lone-sos" data-hold="lone-alert" aria-label="Hold for 2 seconds to raise an alert"><span class="lone-sos-fill"></span><span class="lone-sos-txt">${icSize('bell', 22)}<b>Hold for help</b><small>Alerts your buddy and admins, and sounds a siren</small></span></button>
      <button class="lone-silent" data-act="lone-alert-silent">Send a silent alert instead</button>
    </section>${loneDetails(m)}`;
}
function loneDetails(m) {
  const rows = [
    ['pin', 'Where', m.where || 'Not given'], ['user', 'Buddy', m.buddy ? member(m.buddy).name : 'Admins only'],
    ['clock', 'Checking in', `Every ${m.every < 60 ? m.every + ' min' : m.every / 60 + (m.every === 60 ? ' hour' : ' hours')}`], ['flag', 'Finish by', hm(m.endsAt)],
    ['locate', 'Location', isAndroidApp() ? (m.loc ? `Shared · updated ${timeAgo(m.loc.at)}` : 'Waiting for GPS…') : 'Not shared (Android app only)'],
  ];
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
          ${bad && Siren.on ? `<button class="btn sm" data-act="lone-siren-off">Stop alarm</button>` : ''}
        </div></div>`;
    }).join('')}</div>`;
}
function loneHistory(list) {
  if (!list.length) return '';
  return `<details class="card lone-hist"><summary><b>Recent sessions</b><span class="muted small">${list.length}</span></summary>
    ${list.map((s) => { const alerts = s.log.filter((l) => /alert|Missed/.test(l.what)).length; const mins = Math.round((s.endedAt - s.startedAt) / 60000);
      return `<div class="lone-hrow"><span class="grow"><b>${esc(member(s.userId).name)}</b> <span class="muted">· ${esc(s.where || 'Working alone')}</span><br><span class="tiny muted">${esc(fmtDateTime(s.startedAt))} · ${mins >= 60 ? Math.floor(mins / 60) + 'h ' : ''}${mins % 60}m</span></span>${alerts ? `<span class="lone-chip red">${alerts} alert${alerts > 1 ? 's' : ''}</span>` : '<span class="lone-chip ok">Safe</span>'}</div>`; }).join('')}</details>`;
}

let loneTimer = null;
function loneTick() {
  clearInterval(loneTimer);
  loneTimer = setInterval(() => {
    if (parseHash().name !== 'lone') { clearInterval(loneTimer); return; }
    const m = S.lone && S.lone.mine; if (!m || m.status === 'alert') return;
    const el = $('[data-lone-count]'); if (el) el.textContent = loneLeft(m);
    const ring = $('[data-lone-ring]'); if (ring) ring.style.strokeDashoffset = ringOff(m);
    if (m.nextAt <= Date.now() && !$('.lone-live.late')) renderView(false); // just became due
  }, 1000);
}

// ---------------------------------------------------------------- actions
F['lone-start'] = async (f, d) => {
  setLone(await capi('POST', '/lone', locBody({ where: d.where, every: Number(d.every), hours: Number(d.hours), buddy: d.buddy, note: d.note })));
  toast('Session started. Stay safe.');
};
C['lone-hours'] = () => {};
A['lone-push'] = async () => { try { await pushSubscribe(); toast('Lock-screen notifications are on'); renderView(false); } catch (e) { toast(e.message, true); } };
A['lone-checkin'] = async () => {
  try { await lonePost(`/lone/${mineId()}/checkin`, locBody()); if (navigator.vibrate) navigator.vibrate(25); toast('Checked in. Stay safe.'); } catch (e) { toast(e.message, true); }
};
A['lone-extend'] = async (el) => { try { await lonePost(`/lone/${mineId()}/extend`, locBody({ minutes: Number(el.dataset.min) })); toast(`Added ${el.dataset.min === '60' ? '1 hour' : el.dataset.min + ' minutes'}`); } catch (e) { toast(e.message, true); } };
A['lone-end'] = async () => {
  if (!(await confirmBox('Finish working alone?', 'Your buddy and admins won’t be alerted any more. Only finish once you’re safe.', 'I’m safe, finish'))) return;
  try { await lonePost(`/lone/${mineId()}/end`, locBody()); Siren.stop(); toast('Session finished. Glad you’re safe.'); } catch (e) { toast(e.message, true); }
};
A['lone-alert'] = async () => {
  Siren.start();
  try { await lonePost(`/lone/${mineId()}/alert`, locBody()); } catch (e) { toast(e.message, true); }
};
A['lone-alert-silent'] = async () => {
  if (!(await confirmBox('Send a silent alert?', 'Your buddy and admins are alerted straight away. Your phone makes no sound.', 'Send silent alert'))) return;
  try { await lonePost(`/lone/${mineId()}/alert`, locBody({ silent: true })); } catch (e) { toast(e.message, true); }
};
A['lone-safe'] = async () => { Siren.stop(); try { await lonePost(`/lone/${mineId()}/safe`, locBody()); toast('Alert cancelled. Everyone has been told you’re safe.'); } catch (e) { toast(e.message, true); } };
A['lone-siren'] = () => { if (Siren.on) Siren.stop(); else Siren.start(); };
A['lone-siren-off'] = () => { Siren.stop(); renderView(false); };
A['lone-ack'] = async (el) => { Siren.stop(); try { await lonePost(`/lone/${el.dataset.id}/ack`); toast('They’ve been told you’re responding'); } catch (e) { toast(e.message, true); } };

// Hold-to-alert: press and hold for 2 seconds, so it can't go off in a pocket.
let holdT = null, holdEl = null;
const holdStop = () => { clearTimeout(holdT); holdT = null; if (holdEl) holdEl.classList.remove('holding'); holdEl = null; };
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest && e.target.closest('[data-hold]'); if (!el) return;
  e.preventDefault(); Siren.unlock(); holdEl = el; el.classList.add('holding');
  if (navigator.vibrate) navigator.vibrate(15);
  holdT = setTimeout(() => { const fn = A[el.dataset.hold]; holdStop(); if (navigator.vibrate) navigator.vibrate(80); if (fn) fn(el); }, 2000);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => document.addEventListener(t, (e) => { if (holdEl && (t !== 'pointerleave' || e.target === holdEl)) holdStop(); }, true));
document.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('[data-hold]')) e.preventDefault(); });

// Live: someone else's alert (or a missed check-in) arrives — sound the alarm if the app is open.
function loneEvent(ev) {
  S.lone = ev.state; loneTrack(!!(ev.state && ev.state.mine));
  if (ev.alarm) {
    const s = (ev.state.watching || []).find((x) => x.id === ev.alarm);
    if (s) {
      Siren.start();
      banner({ link: '#/lone', from: s.userId, title: s.status === 'alert' ? `${member(s.userId).name} needs help` : `${member(s.userId).name} missed a check-in`, text: s.where ? 'Working at ' + s.where : 'Working alone — call them now', icon: 'bell' });
    }
  }
  scheduleRender();
}
