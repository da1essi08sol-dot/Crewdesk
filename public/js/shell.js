/* Starting up, the app frame (sidebar, top bar, bottom tabs), routing, live updates, notifications and search. */
'use strict';

// ============================================================ start-up
async function boot() {
  store.set('cd_token', null); // sign-ins used to live in browser storage; they're now secure cookies
  if (!S.info) { try { S.info = await api('GET', '/api/info'); } catch (_) { S.info = { operator: {} }; } }
  const r0 = parseHash();
  let me = null;
  try { me = await api('GET', '/api/me'); } catch (_) {}
  if (!me) { S.user = null; return publicRoute(r0); }
  S.user = me.user; S.companies = me.companies; S.myRequests = me.requests || [];
  if (r0.name === 'verify') history.replaceState(null, '', '/#/home');
  if (r0.name === 'invite' && r0.args[0]) setPendingInvite(r0.args[0]);
  await enterApp();
}
async function enterApp() {
  const inv = pendingInvite();
  if (!S.companies.length) {
    if (isLegalRoute()) return renderLegalStandalone(parseHash().name);
    if (['login', 'register', 'forgot', 'reset', 'verify'].includes(parseHash().name)) history.replaceState(null, '', '/#/');
    renderOnboard();
    if (inv) openInvite(inv);
    return;
  }
  if (!S.companies.some((c) => c.id === S.cid)) S.cid = S.companies[0].id;
  if (['login', 'register', 'forgot', 'reset', 'verify', ''].includes(parseHash().name) || !location.hash) history.replaceState(null, '', '/#/home');
  await loadCompany();
  if (inv) { const r = parseHash(); if (r.name === 'invite') history.replaceState(null, '', '/#/home'); openInvite(inv); }
}
const isLegalRoute = () => ['privacy', 'terms'].includes(parseHash().name);
function resetCompanyState() { S.msgs = {}; S.msgsMore = {}; destroyMap(); stopAll(); }
async function loadCompany(keepView = false) {
  store.set('cd_cid', S.cid);
  let st;
  try { st = await capi('GET', '/state'); }
  catch (e) { if (e.status === 401) return; toast(e.message, true); S.cid = null; store.set('cd_cid', null); return boot(); }
  Object.assign(S, { company: st.company, role: st.role, user: st.me, teams: st.teams, jobs: st.jobs, tasks: st.tasks, clients: st.clients, pings: st.pings,
    photos: st.photos, projects: st.projects, events: st.events, finance: st.finance, chats: st.chats, invites: st.invites || [], favs: st.favs || { jobs: [], projects: [] },
    inbox: st.inbox || [], locations: st.locations, unread: st.unread, lastMsg: st.lastMsg });
  if (!keepView) { S.msgs = {}; S.msgsMore = {}; }
  S.members = Object.fromEntries(st.members.map((m) => [m.id, m]));
  const mine = S.companies.find((c) => c.id === S.cid); if (mine) { mine.name = st.company.name; mine.role = st.role; }
  if (!keepView || !$('#view')) { renderShell(); connect(); route(); startGeo(); }
  else {
    updateChrome();
    const typing = $('#view').contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    renderView(!(current.v && current.v.manual && !typing));
    Object.keys(S.msgs).forEach((ch) => { delete S.msgs[ch]; if ($(`.chat-pane[data-ch="${CSS.escape(ch)}"]`)) mountChat(ch); });
  }
}
function signOutLocal(msg) {
  stopAll(); destroyMap(); closeViewer(); closeMenu();
  S.user = null; S.company = null; S.cid = null; S.companies = []; S.myRequests = undefined;
  $('#sheet-root').innerHTML = ''; history.replaceState(null, '', '/#/login'); renderLogin(msg ? esc(msg) : '');
}

// ============================================================ frame
const SIDE_NAV = [['home', 'Home', 'home'], ['projects', 'Projects', 'folder'], ['jobs', 'Jobs', 'jobs'], ['calendar', 'Calendar', 'cal'], ['chat', 'Chat', 'chat'],
  ['pings', 'Pings', 'ping'], ['team', 'Team & map', 'team'], ['clients', 'Clients', 'contacts']];
const BOTTOM_NAV = [['home', 'Home', 'home'], ['projects', 'Projects', 'folder'], ['chat', 'Chat', 'chat'], ['pings', 'Pings', 'ping'], ['more', 'More', 'more']];
function navLink([k, l, i], extra = '') {
  return `<a class="navbtn" data-nav="${k}" href="#/${k}" ${extra}>${ic(i)}<span>${l}</span>${k === 'chat' || k === 'pings' || k === 'more' ? `<span class="count hidden" data-badge="${k}"></span>` : ''}</a>`;
}
function coButton(cls = '') {
  return `<button class="co-btn ${cls}" data-act="co-menu" aria-haspopup="menu" aria-label="Company menu: ${esc(S.company.name)}">${S.company.logo ? coLogo(S.company, 30) : brand()}<span class="name ellipsis" data-co-name>${esc(S.company.name)}</span>${icSize('down', 15, 'flex:none;color:var(--muted)')}</button>`;
}
function renderShell() {
  $('#app').innerHTML = `<div class="shell">
    <aside class="sidebar" aria-label="Main">
      ${coButton()}
      <nav class="stack tight" style="gap:1px" aria-label="Sections">${SIDE_NAV.map((n) => navLink(n)).join('')}
      ${isAdmin() ? `<div class="label navsec">Admin</div>${navLink(['sheets', 'Spreadsheets', 'sheet'])}` : ''}
      ${navLink(['settings', 'Company settings', 'settings'])}</nav>
      <div class="grow"></div>
      <button class="navbtn" data-act="me-menu" aria-haspopup="menu" id="side-me"></button>
      <nav class="foot-links" style="justify-content:flex-start;margin:8px 10px 0;gap:12px" aria-label="Legal"><a href="#/privacy">Privacy</a><a href="#/terms">Terms</a><a href="mailto:${esc(S.info.supportEmail || '')}">Support</a></nav>
    </aside>
    <div style="min-width:0">
      <header class="topbar">
        ${coButton()}
        <button class="searchbox" data-act="search" aria-label="Search">${ic('search')}<span>Search projects, jobs, people…</span><kbd>${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'} K</kbd></button>
        <div class="grow"></div>
        <button class="icon-btn mobile-only" data-act="search" aria-label="Search">${ic('search')}</button>
        <button class="icon-btn mobile-only" data-act="me-menu" aria-haspopup="menu" aria-label="My account" id="top-me"></button>
      </header>
      <main id="view" tabindex="-1"></main>
    </div>
    <nav class="bottomnav" aria-label="Sections">${BOTTOM_NAV.map((n) => navLink(n)).join('')}</nav>
  </div>`;
  updateChrome();
}
function updateChrome() {
  if (!$('#side-me') || !S.company) return;
  $$('[data-co-name]').forEach((e) => { e.textContent = S.company.name; });
  applyBanner();
  const me = S.members[S.user.id] || S.user;
  $('#top-me').innerHTML = avatar(Object.assign({}, me, { online: true }), 'sm', { link: false });
  $('#side-me').innerHTML = `${avatar(me, 'sm', { link: false })}<span class="ellipsis">${esc(me.name)}</span>`;
  const chatN = Object.values(S.unread).reduce((a, b) => a + (b || 0), 0);
  const pingN = unreadPings() + S.inbox.filter((n) => !n.read).length;
  const setBadge = (k, n) => $$(`[data-badge="${k}"]`).forEach((b) => { b.textContent = n > 99 ? '99+' : n; b.classList.toggle('hidden', !n); b.setAttribute('aria-label', `${n} unread`); });
  setBadge('chat', chatN); setBadge('pings', pingN);
  document.title = (chatN + pingN ? `(${chatN + pingN}) ` : '') + 'Crewdesk';
  const r = parseHash();
  const map = { job: 'jobs', project: 'projects', client: 'clients', person: 'team', ping: 'pings', company: 'companies' };
  let active = map[r.name] || r.name;
  const inBottom = BOTTOM_NAV.some((n) => n[0] === active);
  $$('.navbtn').forEach((b) => {
    let on = b.dataset.nav === active;
    if (b.closest('.bottomnav')) {
      if (active === 'jobs' && b.dataset.nav === 'projects') on = true;
      else if (!inBottom && active !== 'jobs' && b.dataset.nav === 'more') on = true;
    }
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
}
// The company's banner image fills the top bar to the right of the company name.
function applyBanner(pos) {
  const tb = $('.topbar'); if (!tb || !S.company) return;
  const b = S.company.banner;
  tb.classList.toggle('has-banner', !!b);
  tb.style.setProperty('--banner', b ? `url("${b.replace(/["\\]/g, '')}")` : 'none');
  tb.style.setProperty('--banner-y', (pos != null ? pos : S.company.bannerPos != null ? S.company.bannerPos : 50) + '%');
}
const unreadPings = () => Object.values(S.pings).filter((p) => !p.read).length;
window.addEventListener('resize', () => { if (S.company) updateChrome(); });

// ============================================================ menus in the frame
A['co-menu'] = (el) => {
  const others = S.companies.filter((c) => c.id !== S.cid);
  popMenu(el, `<div class="head"><b>${esc(S.company.name)}</b><div class="tiny muted">You’re ${S.role === 'owner' ? 'the owner' : 'a' + (S.role === 'admin' ? 'n admin' : ' member')}</div></div><div class="sep"></div>
    ${canInvite() ? `<button class="mi" data-act="invite-new">${ic('userplus')}Invite people</button>` : ''}
    <a class="mi" href="#/settings">${ic('settings')}Company settings</a>
    <a class="mi" href="#/company/${S.cid}">${ic('building')}Company profile</a>
    <div class="sep"></div>
    ${others.length ? `<div class="head tiny muted" style="padding-bottom:2px">Switch to</div>${others.map((c) => `<button class="mi" data-act="switch-co" data-id="${c.id}">${coLogo(c, 20)}<span class="grow ellipsis">${esc(c.name)}</span></button>`).join('')}<div class="sep"></div>` : ''}
    <a class="mi" href="#/companies">${ic('search')}Find or create a company</a>`);
};
A['me-menu'] = (el) => {
  const p = S.user.prefs || {};
  popMenu(el, `<div class="head row">${avatar(S.members[S.user.id] || S.user, '', { link: false })}<div class="grow"><b class="ellipsis" style="display:block">${esc(S.user.name)}</b><span class="tiny muted ellipsis" style="display:block">${esc(S.user.email)}</span></div></div><div class="sep"></div>
    <a class="mi" href="#/person/${S.user.id}">${ic('user')}My profile</a>
    <a class="mi" href="#/profile">${ic('settings')}My settings</a>
    <div class="sep"></div>
    <button class="mi" data-act="logout">${ic('logout')}Sign out</button>`);
};
A['toggle-popups'] = async () => {
  const on = !(S.user.prefs && S.user.prefs.popups !== false);
  try { const r = await api('PUT', '/api/me', { prefs: { popups: on } }); S.user = r.user; toast(on ? 'Notifications are on' : 'Notifications are off — you’ll still see red dots for unread items'); if (parseHash().name === 'profile') renderView(false); }
  catch (e) { toast(e.message, true); }
};
A['switch-co'] = (el) => { if (el.dataset.id === S.cid) return; S.cid = el.dataset.id; resetCompanyState(); location.hash = '#/home'; loadCompany(); };
A['add-company'] = () => sheet(`${sheetHead('Create or join a company')}<div class="stack">${companyForms()}</div>`);

// ============================================================ routing
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, ...args] = h.split('/');
  return { name: name || 'home', args: args.map((a) => { try { return decodeURIComponent(a); } catch { return a; } }) };
}
let current = { key: '' };
function route(opts = {}) {
  if (!S.company) return;
  closeMenu();
  const r = parseHash();
  if (r.name === 'invite' && r.args[0]) { history.replaceState(null, '', '/#/home'); openInvite(r.args[0]); return route(); }
  if (['login', 'register', 'forgot', 'reset', 'verify'].includes(r.name)) { history.replaceState(null, '', '/#/home'); return route(); }
  const v = VIEWS[r.name] || VIEWS.home;
  const key = location.hash;
  const prev = current;
  const sameView = prev.key === key;
  const tabSwitch = prev.name === 'job' && r.name === 'job' && prev.args[0] === r.args[0];
  const inkFrom = tabSwitch ? tabInk : null;
  const next = { key, name: r.name, args: r.args, v };
  const dir = navDirection(prev, next);
  const moving = !sameView && !tabSwitch;
  const paint = () => {
    current = next;
    renderView(false, moving);
    updateChrome();
    placeTabInk(inkFrom);
    if (moving) markEnter();
    if (moving) { const h = $('#view h1'); if (h && !isTouch()) { h.setAttribute('tabindex', '-1'); } }
  };
  if (moving && prev.name && !opts.noVT && canVT()) { withTransition(dir, paint); return; }
  paint();
  if (moving && prev.name && !opts.noVT && motionOK()) { const m = $('#view'); m.classList.remove('in-view', 'nav-forward', 'nav-back', 'nav-tab'); void m.offsetWidth; m.classList.add('in-view', 'nav-' + dir); }
}
function renderView(auto = false, scrollTop = false) {
  const main = $('#view'); if (!main || !current.v) return;
  if (auto && current.v.update) { current.v.update(...current.args); return; }
  if (auto && current.v.manual) return;
  if (auto && main.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const y = window.scrollY;
  main.innerHTML = current.v.render(...current.args);
  if (current.v.mount) current.v.mount(...current.args);
  window.scrollTo(0, scrollTop ? 0 : y);
  placeTabInk(null);
  paintSegs(main);
}
let rafPending = false;
function scheduleRender() {
  if (rafPending) return; rafPending = true;
  requestAnimationFrame(() => { rafPending = false; if (!S.company) return; updateChrome(); renderView(true); });
}
window.addEventListener('hashchange', () => {
  const r = parseHash();
  if (!S.user) return publicRoute(r);
  if (!S.company) {
    if (isLegalRoute()) return renderLegalStandalone(r.name);
    if (r.name === 'invite' && r.args[0]) return openInvite(r.args[0]);
    if (r.name === 'company' && r.args[0]) return renderOnboardProfile(r.args[0]);
    return renderOnboard(r.name === 'companies' ? 'find' : undefined);
  }
  route();
});
const motionOK = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;
// Underline that slides between job tabs.
let tabInk = null;
function placeTabInk(from) {
  const nav = $('#view .tabs'); if (!nav) { tabInk = null; return; }
  const on = nav.querySelector('.tab.on'); if (!on) return;
  nav.classList.add('has-ink');
  let ink = nav.querySelector('.tab-ink');
  if (!ink) { ink = document.createElement('i'); ink.className = 'tab-ink'; ink.setAttribute('aria-hidden', 'true'); nav.appendChild(ink); }
  const to = { x: on.offsetLeft, w: on.offsetWidth };
  if (from && motionOK()) { ink.style.transition = 'none'; ink.style.transform = `translateX(${from.x}px)`; ink.style.width = from.w + 'px'; void ink.offsetWidth; ink.style.transition = ''; }
  ink.style.transform = `translateX(${to.x}px)`; ink.style.width = to.w + 'px';
  if (on.offsetLeft < nav.scrollLeft || on.offsetLeft + on.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = on.offsetLeft - 24;
  tabInk = to;
}

// ============================================================ live updates (Server-Sent Events)
let es = null, helloCount = 0, retryTimer = null;
function connect(isRetry = false) {
  if (es) es.close();
  helloCount = isRetry ? 1 : 0;
  es = new EventSource(`/api/stream?cid=${encodeURIComponent(S.cid)}`);
  es.onmessage = (e) => { try { handleEvent(JSON.parse(e.data)); } catch (err) { console.error(err); } };
  es.onerror = () => {
    if (es && es.readyState === EventSource.CLOSED) {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(async () => { if (!S.company) return; try { await api('GET', '/api/me'); connect(true); } catch (_) {} }, 4000);
    }
  };
}
function stopAll() { if (es) { es.close(); es = null; } clearTimeout(retryTimer); stopGeo(); }
function handleEvent(ev) {
  switch (ev.t) {
    case 'hello': if (helloCount++ > 0) loadCompany(true); break;
    case 'upsert': {
      const coll = S[ev.coll]; if (!coll) break;
      const isNew = !coll[ev.item.id];
      coll[ev.item.id] = ev.item;
      if (ev.coll === 'pings' && isNew && ev.item.createdBy !== S.user.id) alertUser(`New ping from ${firstName(ev.item.createdBy)}: ${ev.item.title}`, '#/ping/' + ev.item.id, ev.item.body || '', { from: ev.item.createdBy, where: 'New ping', text: ev.item.title + (ev.item.body ? ' — ' + ev.item.body : '') });
      scheduleRender(); if (ev.coll === 'jobs') updateMap(); break;
    }
    case 'remove': {
      if (!S[ev.coll]) break;
      delete S[ev.coll][ev.id];
      const r = parseHash();
      if (ev.coll === 'jobs') { delete S.unread['job:' + ev.id]; delete S.lastMsg['job:' + ev.id]; if ((r.name === 'job' && r.args[0] === ev.id) || (r.name === 'chat' && r.args[0] === 'job:' + ev.id)) { toast('That job was deleted or is no longer shared with you'); location.hash = '#/jobs'; } }
      if (ev.coll === 'chats' && r.name === 'chat' && r.args[0] === 'chat:' + ev.id) { toast('You’re no longer in that chat'); location.hash = '#/chat'; }
      if (ev.coll === 'projects' && r.name === 'project' && r.args[0] === ev.id) { toast('That project was deleted or is no longer shared with you'); location.hash = '#/projects'; }
      scheduleRender(); break;
    }
    case 'msg': onMessage(ev.item); break;
    case 'inbox':
      S.inbox.push(ev.item); if (S.inbox.length > 200) S.inbox.shift();
      alertUser(ev.item.text, ev.item.link, '', { from: ev.item.by && S.members[ev.item.by] ? ev.item.by : null, icon: 'bell', title: ev.item.by && S.members[ev.item.by] ? member(ev.item.by).name : 'Crewdesk', text: ev.item.text }); scheduleRender(); break;
    case 'typing': onTyping(ev); break;
    case 'presence':
      if (S.members[ev.userId]) { S.members[ev.userId].online = ev.online; S.members[ev.userId].lastSeen = ev.lastSeen; }
      scheduleRender(); break;
    case 'member': {
      const old = S.members[ev.item.id];
      S.members[ev.item.id] = Object.assign({}, old || {}, ev.item, !ev.item.role && old ? { role: old.role } : {});
      if (ev.item.id === S.user.id) Object.assign(S.user, ev.item);
      if (!ev.item.shareLocation) delete S.locations[ev.item.id];
      scheduleRender(); updateMap(); break;
    }
    case 'memberRemoved':
      if (ev.id === S.user.id) { toast('You were removed from this company', true); S.cid = null; stopAll(); boot(); return; }
      delete S.members[ev.id]; delete S.locations[ev.id]; scheduleRender(); updateMap(); break;
    case 'loc':
      if (ev.loc) S.locations[ev.userId] = ev.loc; else delete S.locations[ev.userId];
      updateMap(); break;
    case 'reload': loadCompany(true); break;
    case 'kicked':
      if (ev.cid === S.cid) { toast('This company is no longer available', true); S.cid = null; stopAll(); api('GET', '/api/me').then((r) => { S.companies = r.companies; enterApp(); }).catch(() => {}); }
      break;
    case 'signedOut': signOutLocal('You were signed out because your password changed'); break;
  }
}
// A notification: pop-up (if switched on), desktop alert when the app is in the background, optional sound.
function alertUser(text, link, body = '', rich = null) {
  const p = S.user.prefs || {};
  if (p.popups !== false) { if (rich) banner(Object.assign({ link }, rich)); else toast(text.slice(0, 140), false, link); }
  if (p.sound) beep();
  if (p.desktop && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try { const n = new Notification(text.slice(0, 120), { body, icon: '/icon-192.png', tag: link }); n.onclick = () => { window.focus(); location.hash = link; n.close(); }; } catch {}
  }
}
let audioCtx = null;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = 880; g.gain.value = 0.04; o.connect(g); g.connect(audioCtx.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25); o.stop(audioCtx.currentTime + 0.26);
  } catch (_) {}
}

// ============================================================ global search (Ctrl/⌘ K)
function openSearch() {
  if ($('.search-pop')) return;
  const el = document.createElement('div');
  el.className = 'search-pop';
  el.innerHTML = `<div class="search-panel" role="dialog" aria-modal="true" aria-label="Search"><div class="q">${ic('search')}<input type="search" placeholder="Search projects, jobs, people, clients, pings…" aria-label="Search" autocomplete="off"><button class="btn ghost sm" data-sclose>Esc</button></div><div class="search-results" role="listbox"></div></div>`;
  document.body.appendChild(el);
  const inp = $('input', el), out = $('.search-results', el);
  let sel = 0, results = [];
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey, true); };
  const paint = () => {
    const q = inp.value.trim().toLowerCase();
    results = searchAll(q);
    if (!q) { out.innerHTML = `<div class="empty small">Type to search everything you can see in ${esc(S.company.name)}.</div>`; return; }
    if (!results.length) { out.innerHTML = `<div class="empty small">Nothing found for “${esc(inp.value)}”.</div>`; return; }
    sel = Math.min(sel, results.length - 1);
    let grp = '';
    out.innerHTML = results.map((r, i) => { const g = r.group !== grp ? `<div class="grp label">${esc(r.group)}</div>` : ''; grp = r.group; return `${g}<a class="res ${i === sel ? 'sel' : ''}" href="${esc(r.link)}" role="option" aria-selected="${i === sel}" data-i="${i}"><span class="ic">${r.icon}</span><span class="grow"><span class="ellipsis" style="display:block;font-weight:600">${esc(r.title)}</span>${r.sub ? `<span class="ellipsis tiny muted" style="display:block">${esc(r.sub)}</span>` : ''}</span></a>`; }).join('');
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(results.length - 1, sel + 1); paint(); $('.res.sel', out) && $('.res.sel', out).scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); paint(); $('.res.sel', out) && $('.res.sel', out).scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter' && results[sel]) { e.preventDefault(); location.hash = results[sel].link; close(); }
  };
  document.addEventListener('keydown', onKey, true);
  inp.addEventListener('input', () => { sel = 0; paint(); });
  el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
  el.addEventListener('click', (e) => { if (e.target.closest('.res') || e.target.closest('[data-sclose]')) close(); });
  paint(); inp.focus();
}
function searchAll(q) {
  if (!q) return [];
  const has = (...v) => v.join(' ').toLowerCase().includes(q);
  const out = [];
  const add = (group, icon, title, sub, link) => out.push({ group, icon: ic(icon), title, sub, link });
  Object.values(S.projects).filter((p) => has(p.name, p.description)).slice(0, 6).forEach((p) => add('Projects', 'folder', p.name, p.archived ? 'Archived' : (p.description || '').slice(0, 80), '#/project/' + p.id));
  Object.values(S.jobs).filter((j) => has(j.title, j.ref, j.address, j.description, (S.clients[j.clientId] || {}).name)).slice(0, 8).forEach((j) => add('Jobs', 'jobs', j.title, `${j.ref} · ${STATUS[j.status]}${j.address ? ' · ' + j.address : ''}`, '#/job/' + j.id));
  Object.values(S.members).filter((m) => has(m.name, m.title, m.dept, m.email)).slice(0, 6).forEach((m) => add('People', 'user', m.name, [m.title, m.dept].filter(Boolean).join(' · '), '#/person/' + m.id));
  Object.values(S.clients).filter((c) => has(c.name, c.company, c.phone, c.email, c.address)).slice(0, 5).forEach((c) => add('Clients', 'contacts', c.name, [c.company, c.phone].filter(Boolean).join(' · '), '#/client/' + c.id));
  Object.values(S.pings).filter((p) => has(p.title, p.body)).slice(0, 5).forEach((p) => add('Pings', 'ping', p.title, `${member(p.createdBy).name} · ${fmtDateTime(p.createdAt)}`, '#/ping/' + p.id));
  Object.values(S.events).filter((e) => has(e.title, e.description, e.location)).slice(0, 5).forEach((e) => add('Calendar', 'cal', e.title, fmtDate(e.date, true) + (e.allDay ? '' : ' ' + e.start), '#/calendar/' + e.date));
  Object.values(S.chats).filter((c) => has(chatName(c))).slice(0, 5).forEach((c) => add('Chats', 'chat', chatName(c), c.kind === 'dm' ? 'Direct message' : 'Group chat', '#/chat/chat:' + c.id));
  return out;
}
A.search = () => openSearch();
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && S.company) { e.preventDefault(); openSearch(); }
  else if (e.key === '/' && S.company && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) { e.preventDefault(); openSearch(); }
});

// ============================================================ live location
let geoWatch = null, lastPos = null, lastSent = null, geoBeat = null;
function dist(a, b) {
  const R = 6371e3, r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * R;
}
function sendPos(force = false) {
  if (!lastPos || !S.user || !S.user.shareLocation) return;
  const t = Date.now();
  if (!force && lastSent && (t - lastSent.t < 5000 || (t - lastSent.t < 20000 && dist(lastSent, lastPos) < 25))) return;
  lastSent = Object.assign({ t }, lastPos);
  api('POST', '/api/me/location', lastPos).catch(() => {});
}
function startGeo() {
  stopGeo();
  if (!S.user || !S.user.shareLocation || !('geolocation' in navigator) || !window.isSecureContext) return;
  geoWatch = navigator.geolocation.watchPosition((pos) => { lastPos = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }; sendPos(); },
    (err) => { if (err.code === 1) toast('Location permission was blocked — allow it in your browser settings', true); },
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
  geoBeat = setInterval(() => { if (lastSent && Date.now() - lastSent.t > 60000) sendPos(true); }, 30000);
}
function stopGeo() { if (geoWatch != null && navigator.geolocation) navigator.geolocation.clearWatch(geoWatch); geoWatch = null; clearInterval(geoBeat); }
function enableSharing(on, inputEl) {
  const fail = (msg) => { toast(msg, true); if (inputEl) inputEl.checked = !on; };
  if (!on) {
    return api('PUT', '/api/me', { shareLocation: false }).then((r) => { S.user = r.user; S.members[S.user.id] = Object.assign(S.members[S.user.id] || {}, r.user); delete S.locations[S.user.id]; stopGeo(); updateMap(); toast('Location sharing is off'); })
      .catch((e) => fail(e.message));
  }
  if (!window.isSecureContext) return fail('Location only works over a secure https:// link');
  if (!('geolocation' in navigator)) return fail('This device has no location support');
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const r = await api('PUT', '/api/me', { shareLocation: true });
      S.user = r.user; S.members[S.user.id] = Object.assign(S.members[S.user.id] || {}, r.user);
      lastPos = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
      sendPos(true); startGeo(); toast('Sharing your location with your company');
    } catch (e) { fail(e.message); }
  }, (err) => fail(err.code === 1 ? 'Location permission was denied' : 'Could not get your location'), { enableHighAccuracy: true, timeout: 20000 });
}
function applyTheme() { const t = store.get('cd_theme'); if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
setInterval(() => { if (S.company && ['home', 'team', 'chat', 'pings'].includes(parseHash().name)) scheduleRender(); }, 60000);
