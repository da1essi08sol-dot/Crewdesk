/* Company directory: find public companies, view their profiles, and ask to join. Also the first-time screen. */
'use strict';

const coLogo = (c, size = 44) => (c.logo
  ? `<img src="${esc(c.logo)}" alt="" style="width:${size}px;height:${size}px;border-radius:${Math.round(size / 4)}px;object-fit:cover;flex:none;border:1px solid var(--line)">`
  : `<span class="avatar" style="--c:${colorFor(c.id)};width:${size}px;height:${size}px;border-radius:${Math.round(size / 4)}px;font-size:${Math.round(size / 2.6)}px">${esc(initials(c.name))}</span>`);
function joinButton(c) {
  if (c.isMember) return `<span class="pill st-active">${icSize('check', 12)}You’re a member</span>`;
  if (c.requested) return `<button class="btn sm" data-act="dir-cancel" data-id="${c.id}">Requested · Cancel</button>`;
  if (S.user && S.user.siteAdmin) return `<button class="btn sm primary" data-act="dir-join-admin" data-id="${c.id}">${ic('userplus')}Join to test</button>`; // Site Administrator: no approval needed
  return `<button class="btn sm primary" data-act="dir-request" data-id="${c.id}" data-name="${esc(c.name)}">${ic('userplus')}Ask to join</button>`;
}
function dirCard(c) {
  return `<div class="card stack" style="padding:0;overflow:hidden">
    ${c.banner ? `<div style="height:70px;background:url('${esc(c.banner)}') center ${c.bannerPos}% / cover"></div>` : '<div style="height:6px;background:var(--accent)"></div>'}
    <div class="stack" style="padding:0 16px 16px;gap:10px">
      <a href="#/company/${c.id}" class="row" style="text-decoration:none;color:inherit;margin-top:${c.banner ? '-22px' : '8px'}">${coLogo(c, 48)}<div class="grow" style="${c.banner ? 'margin-top:22px' : ''}"><b class="ellipsis" style="display:block">${esc(c.name)}</b>
        <span class="tiny muted">${esc([c.industry, c.location].filter(Boolean).join(' · ') || 'Company')}</span></div></a>
      ${c.description ? `<div class="small muted clamp2">${esc(c.description)}</div>` : ''}
      <div class="row between"><span class="small muted">${icSize('users', 14, 'vertical-align:-2px')} ${plural(c.membersCount, 'member')}</span>${joinButton(c)}</div>
    </div></div>`;
}
function companyProfileHtml(c, back) {
  return `${back ? `<a class="back" href="${back}">${ic('back')}Companies</a>` : ''}
    <div class="card" style="padding:0;overflow:hidden">
      <div style="height:160px;background:${c.banner ? `url('${esc(c.banner)}') center ${c.bannerPos}% / cover` : 'linear-gradient(120deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #0b2d1a))'}"></div>
      <div style="padding:0 20px 20px">
        <div class="row top wrap" style="margin-top:-36px;gap:14px">${coLogo(c, 84)}<div class="grow" style="margin-top:40px;min-width:180px"><h1>${esc(c.name)}</h1>
          <div class="muted small">${esc([c.industry, c.location].filter(Boolean).join(' · '))}</div></div>
          <div class="coprof-join">${joinButton(c)}</div></div>
        <div class="row wrap" style="gap:16px;margin-top:16px" >
          <span class="small"><b>${c.membersCount}</b> <span class="muted">${c.membersCount === 1 ? 'member' : 'members'}</span></span>
          ${c.owner ? `<span class="small muted">Run by ${esc(c.owner)}</span>` : ''}
          <span class="small muted">On Crewdesk since ${new Date(c.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
          ${c.visibility === 'public' ? '<span class="pill">Public</span>' : `<span class="pill lock">${ic('lock')}Private</span>`}
          ${c.website ? `<a class="small" href="${esc(c.website)}" target="_blank" rel="noopener noreferrer">${esc(c.website.replace(/^https?:\/\//, ''))}</a>` : ''}</div>
        ${c.description ? `<p class="pre" style="margin:16px 0 0">${linkify(c.description)}</p>` : '<p class="muted small" style="margin:16px 0 0">No description yet.</p>'}
      </div></div>
    ${(c.people || []).length ? `<div class="card section"><h3 style="margin-bottom:10px">People${c.isMember ? '' : ' with public profiles'}</h3><div class="stack tight">${c.people.map((p) => {
      const inner = `${avatar(p, 'sm', { link: false })}<span class="grow ellipsis"><b>${esc(p.name)}</b>${p.title ? ` <span class="muted small">· ${esc(p.title)}</span>` : ''}</span>${p.role === 'owner' ? '<span class="pill">Owner</span>' : ''}`;
      return S.company ? `<a href="#/person/${p.id}" class="row" style="text-decoration:none;color:inherit;padding:4px 0">${inner}</a>` : `<div class="row" style="padding:4px 0">${inner}</div>`; }).join('')}</div></div>` : ''}`;
}
const dirState = { q: '', items: null, total: 0, timer: null };
async function loadDirectory(q) {
  try { const r = await api('GET', '/api/directory?q=' + encodeURIComponent(q || '')); dirState.items = r.items; dirState.total = r.total; }
  catch (e) { dirState.items = []; toast(e.message, true); }
  paintDirectory();
}
function directoryList() {
  if (!dirState.items) return '<div class="cards">' + '<div class="skeleton" style="height:150px"></div>'.repeat(3) + '</div>';
  if (!dirState.items.length) return `<div class="card empty">${ic('building')}<h3>${dirState.q ? 'No companies match' : 'No public companies yet'}</h3><div class="small">Companies are private unless their owner lists them. Ask your boss for an invite link, or check the spelling.</div></div>`;
  return `<div class="cards">${dirState.items.map(dirCard).join('')}</div>`;
}
function paintDirectory() { const el = $('#dir-results'); if (el) el.innerHTML = directoryList(); }
I['dir-search'] = (el) => { dirState.q = el.value; clearTimeout(dirState.timer); dirState.timer = setTimeout(() => loadDirectory(dirState.q), 250); };
A['dir-request'] = (el) => sheet(`${sheetHead('Ask to join ' + el.dataset.name)}
  <form class="stack" data-form="dir-request" data-id="${el.dataset.id}">
    <p class="small muted" style="margin:0">The owner gets a message and can accept you with one click. You’ll get an email when they do.</p>
    <label class="field"><span>Message (optional)</span><textarea name="message" maxlength="500" placeholder="e.g. Hi, I’m Priya — I started on the Elm Road job this week."></textarea></label>
    <div class="err-msg" data-err></div>
    <div class="sheet-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Send request</button></div></form>`);
F['dir-request'] = async (f, d, close) => {
  const r = await api('POST', `/api/directory/${f.dataset.id}/request`, { message: d.message });
  close(); updateDirItem(r.company); toast(`Request sent to ${r.company.name}. We’ll email you when they accept.`);
};
A['dir-join-admin'] = async (el) => {
  try { const r = await api('POST', `/api/directory/${el.dataset.id}/request`, {}); S.companies = r.companies; S.cid = el.dataset.id; resetCompanyState(); location.hash = '#/home'; await loadCompany(); toast(`Joined ${r.company.name} as Site Administrator`); } catch (e) { toast(e.message, true); }
};
A['dir-cancel'] = async (el) => {
  try { const r = await api('DELETE', `/api/directory/${el.dataset.id}/request`); updateDirItem(r.company); toast('Request cancelled'); } catch (e) { toast(e.message, true); }
};
function updateDirItem(c) {
  if (dirState.items) dirState.items = dirState.items.map((x) => (x.id === c.id ? Object.assign(x, c) : x));
  if (dirProfile && dirProfile.id === c.id) Object.assign(dirProfile, c);
  if (S.company) renderView(false); else { paintDirectory(); paintPending(); const pv = $('#dir-profile'); if (pv && dirProfile) pv.innerHTML = companyProfileHtml(dirProfile); }
  refreshMyRequests();
}

// ---- inside the app
VIEWS.companies = {
  render() {
    if (!dirState.items) loadDirectory(dirState.q);
    return `<div class="page-head"><div><h1>Find companies</h1><div class="sub">Browse companies that have a public profile, and ask to join.</div></div><button class="btn" data-act="add-company">${ic('plus')}<span>Create a company</span></button></div>
      <label class="search" style="margin-bottom:16px"><input class="input" type="search" placeholder="Search by name, trade or town" value="${esc(dirState.q)}" data-input="dir-search" aria-label="Search companies">${ic('search')}</label>
      <div id="dir-results">${directoryList()}</div>`;
  },
};
let dirProfile = null;
VIEWS.company = {
  render(id) {
    if (!dirProfile || dirProfile.id !== id || (!dirProfile.loading && Date.now() - (dirProfile._t || 0) > 4000)) {
      dirProfile = { id, loading: true };
      api('GET', '/api/directory/' + id).then((r) => { dirProfile = Object.assign(r.company, { _t: Date.now() }); if (parseHash().name === 'company') renderView(false); })
        .catch((e) => { dirProfile = { id, error: e.message }; if (parseHash().name === 'company') renderView(false); });
    }
    if (dirProfile.loading) return `<a class="back" href="#/companies">${ic('back')}Companies</a><div class="skeleton" style="height:260px"></div>`;
    if (dirProfile.error) return `<a class="back" href="#/companies">${ic('back')}Companies</a><div class="card empty"><h3>${esc(dirProfile.error)}</h3></div>`;
    return companyProfileHtml(dirProfile, '#/companies') + (dirProfile.isMember && dirProfile.id === S.cid && isAdmin() ? `<p class="small muted" style="margin-top:12px">This is how other people see your company. <a href="#/settings">Edit the profile</a></p>` : '');
  },
};

// ---- first-time screen: you must join or create a company to use Crewdesk
let pendingPoll = null;
function renderOnboardProfile(id) {
  stopAll();
  $('#app').innerHTML = `<div class="auth"><div class="auth-card" style="max-width:760px">
    <a class="back" href="#/companies">${ic('back')}Back to companies</a>
    <div id="dir-profile"><div class="skeleton" style="height:260px"></div></div></div></div>`;
  api('GET', '/api/directory/' + id).then((r) => { dirProfile = Object.assign(r.company, { _t: Date.now() }); const el = $('#dir-profile'); if (el) el.innerHTML = companyProfileHtml(dirProfile); })
    .catch((e) => { const el = $('#dir-profile'); if (el) el.innerHTML = `<div class="card empty"><h3>${esc(e.message)}</h3></div>`; });
}
function renderOnboard(tab) {
  stopAll();
  if (S.myRequests === undefined) { S.myRequests = []; refreshMyRequests(); }
  const t = tab || (S.myRequests && S.myRequests.length ? 'find' : 'start');
  $('#app').innerHTML = `<div class="auth"><div class="auth-card" style="max-width:760px">
    <div class="row between" style="margin-bottom:22px"><div class="auth-brand" style="margin:0">${brand()}<b>Crewdesk</b></div><button class="btn ghost sm" data-act="logout">${ic('logout')}Sign out</button></div>
    <h1>Welcome, ${esc(S.user.name.split(' ')[0])}</h1><p class="muted">To use Crewdesk you need to be part of a company. Create your own, or find the one you work for.</p>
    <div id="pending-box">${pendingHtml()}</div>
    <div class="grid halves" style="margin:16px 0">
      <button class="card" data-act="onboard-tab" data-t="create" style="text-align:left;cursor:pointer;${t === 'create' ? 'border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)' : ''}">
        <div class="row">${icSize('plus', 22, 'color:var(--accent-text)')}<div><b>Create a company</b><div class="small muted">You’ll be the owner and can invite your crew.</div></div></div></button>
      <button class="card" data-act="onboard-tab" data-t="find" style="text-align:left;cursor:pointer;${t === 'find' ? 'border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)' : ''}">
        <div class="row">${icSize('search', 22, 'color:var(--accent-text)')}<div><b>Find your company</b><div class="small muted">Search companies and ask to join.</div></div></div></button>
    </div>
    <div id="onboard-body">${onboardBody(t)}</div>
    ${footLinks()}</div></div>`;
  if (t === 'find' && !dirState.items) loadDirectory(dirState.q);
  clearInterval(pendingPoll);
  pendingPoll = setInterval(checkAccepted, 20000);
}
function onboardBody(t) {
  if (t === 'create') return `<form class="card stack" data-form="create-co">
      <h2>Create a company</h2>
      <label class="field"><span>Company name</span><input name="name" required maxlength="80"></label>
      <label class="field"><span>Join password <span class="hint">· lets people join with your company code — you can also use invite links</span></span><input name="password" type="text" autocomplete="off" minlength="6" required></label>
      <div class="err-msg" data-err></div><button class="btn primary">Create company</button></form>`;
  if (t === 'find') return `<label class="search" style="margin-bottom:14px"><input class="input" type="search" placeholder="Search by company name, trade or town" value="${esc(dirState.q)}" data-input="dir-search" aria-label="Search companies">${ic('search')}</label>
      <div id="dir-results">${directoryList()}</div>
      <details class="card" style="margin-top:16px"><summary class="bold" style="cursor:pointer">Have a company code or an invite link?</summary>
        <p class="small muted">Invite links work straight away — just open the link. Or enter the 6-letter code and join password from your boss:</p>
        <form class="stack" data-form="join-co"><div class="form-grid"><label class="field"><span>Company code</span><input name="code" autocapitalize="characters" autocomplete="off" placeholder="e.g. K7Q2MX" required></label>
        <label class="field"><span>Join password</span><input name="password" type="password" autocomplete="off" required></label></div>
        <div class="err-msg" data-err></div><button class="btn">Join company</button></form></details>`;
  return `<div class="card small muted" style="text-align:center">Choose an option above to get started.</div>`;
}
A['onboard-tab'] = (el) => renderOnboard(el.dataset.t);
function pendingHtml() {
  const rs = S.myRequests || [];
  if (!rs.length) return '';
  return `<div class="info-box stack tight"><b>Waiting for an answer</b>${rs.map((r) => `<div class="row">${coLogo(r, 28)}<span class="grow">You asked to join <b>${esc(r.name)}</b> · ${timeAgo(r.at)}</span><button class="btn sm ghost" data-act="dir-cancel" data-id="${r.id}">Cancel</button></div>`).join('')}
    <span class="tiny muted">We’ll email you when they accept (check your spam folder too). This page updates by itself.</span></div>`;
}
function paintPending() { const el = $('#pending-box'); if (el) el.innerHTML = pendingHtml(); }
async function refreshMyRequests() { try { const r = await api('GET', '/api/me'); S.myRequests = r.requests || []; paintPending(); return r; } catch (_) { return null; } }
async function checkAccepted() {
  if (S.company || !S.user) { clearInterval(pendingPoll); return; }
  const r = await refreshMyRequests();
  if (r && r.companies.length) { clearInterval(pendingPoll); S.companies = r.companies; S.cid = r.companies[0].id; toast(`You’ve been accepted into ${r.companies[0].name}`); enterApp(); }
}
