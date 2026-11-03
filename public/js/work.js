/* Home, projects, jobs (with tasks, photos, money, history) and the shared calendar. */
'use strict';

const jobCosts = (j) => (j.costs || []).reduce((a, c) => a + (Number(c.amount) || 0), 0);
function jobTasks(jobId) { return Object.values(S.tasks).filter((t) => t.jobId === jobId).sort((a, b) => (a.done - b.done) || ((a.order || 0) - (b.order || 0))); }
function progress(jobId) { const t = jobTasks(jobId); return { done: t.filter((x) => x.done).length, total: t.length }; }
function byDeadline(a, b) { return (a.deadline || '9999') < (b.deadline || '9999') ? -1 : (a.deadline || '9999') > (b.deadline || '9999') ? 1 : (b.updatedAt || 0) - (a.updatedAt || 0); }
const favFirst = (kind) => (a, b) => { const fa = S.favs[kind] || []; const ia = fa.indexOf(a.id), ib = fa.indexOf(b.id); return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib); };
function dirLink(job) {
  const dest = job.lat != null && job.lng != null ? `${job.lat},${job.lng}` : job.address;
  return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest || '');
}
const projectJobs = (pid) => Object.values(S.jobs).filter((j) => j.projectId === pid);

// ============================================================ HOME
VIEWS.home = {
  render() {
    const me = S.user.id;
    const jobs = Object.values(S.jobs), open = jobs.filter((j) => j.status !== 'done');
    const tasks = Object.values(S.tasks).filter((t) => S.jobs[t.jobId] && S.jobs[t.jobId].status !== 'done');
    const mine = tasks.filter((t) => !t.done && (t.assignees || []).includes(me)).sort(byDeadline);
    const myJobs = open.filter((j) => (j.assignees || []).includes(me)).length;
    const week = open.filter((j) => j.deadline && days(j.deadline) >= 0 && days(j.deadline) <= 7).length;
    const overdue = open.filter((j) => j.deadline && days(j.deadline) < 0).length + tasks.filter((t) => !t.done && t.deadline && days(t.deadline) < 0).length;
    const hr = new Date().getHours();
    const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
    const starredP = (S.favs.projects || []).map((id) => S.projects[id]).filter(Boolean);
    const starredJ = (S.favs.jobs || []).map((id) => S.jobs[id]).filter(Boolean);
    const unreadP = Object.values(S.pings).filter((p) => !p.read).sort((a, b) => b.createdAt - a.createdAt);
    const latestP = unreadP.length ? unreadP.slice(0, 3) : Object.values(S.pings).sort((a, b) => b.createdAt - a.createdAt).slice(0, 2);
    const online = Object.values(S.members).filter((m) => m.online && m.id !== me);
    const agenda = calendarItems(todayStr(), dstr(new Date(Date.now() + 13 * 864e5))).slice(0, 8);
    return `
    <div class="page-head"><div><div class="sub">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div><h1>${greet}, ${esc(S.user.name.split(' ')[0])}</h1></div>
      <div class="row tight">${canCreateJobs() ? `<button class="btn primary" data-act="new-job">${ic('plus')}<span>New job</span></button>` : ''}</div></div>
    <div class="kpis">
      <a class="kpi" href="#/jobs/mine"><span class="v">${mine.length}</span><span class="l">My open tasks</span></a>
      <a class="kpi" href="#/jobs/mine"><span class="v">${myJobs}</span><span class="l">Jobs I’m on</span></a>
      <a class="kpi" href="#/jobs/week"><span class="v">${week}</span><span class="l">Due in 7 days</span></a>
      <a class="kpi ${overdue ? 'alert' : ''}" href="#/jobs/overdue"><span class="v">${overdue}</span><span class="l">Overdue</span></a>
    </div>
    ${starredP.length || starredJ.length ? `<div class="section"><div class="section-head"><h2>Starred</h2><span class="tiny muted">Only you see your stars</span></div>
      <div class="cards">${starredP.map(projectCard).join('')}${starredJ.map(jobCard).join('')}</div></div>` : ''}
    <div class="grid two section">
      <div class="stack loose">
        <div><div class="section-head"><h2>My tasks</h2><a class="small" href="#/jobs/mine">My jobs</a></div>
          <div class="card flush">${mine.length ? `<div class="list">${mine.slice(0, 8).map((t) => `
            <div class="item static"><button class="check round" data-act="task-toggle" data-id="${t.id}" aria-label="Mark “${esc(t.title)}” done">${ic('check')}</button>
              <a class="grow" href="#/job/${t.jobId}/tasks" style="text-decoration:none;color:inherit"><div class="ellipsis bold">${esc(t.title)}</div>
              <div class="row small muted tight"><span class="ellipsis">${esc(S.jobs[t.jobId].title)}</span>${dueHtml(t.deadline)}</div></a></div>`).join('')}</div>`
            : `<div class="empty">${ic('check')}<h3>You’re all caught up</h3><div class="small">Tasks assigned to you will show here.</div></div>`}</div></div>
        <div><div class="section-head"><h2>Coming up</h2><a class="small" href="#/calendar">Calendar</a></div>
          <div class="card flush">${agenda.length ? `<div class="list agenda">${agenda.map(agendaRow).join('')}</div>` : `<div class="empty small">Nothing in the next two weeks.</div>`}</div></div>
      </div>
      <div class="stack loose">
        <div><div class="section-head"><h2>Pings</h2><a class="small" href="#/pings">All pings${unreadPings() ? ` · ${unreadPings()} unread` : ''}</a></div>
          <div class="card flush">${latestP.length ? latestP.map((p) => pingRow(p, true)).join('') : `<div class="empty small">No pings yet.${canPing() ? ' <a href="#" data-act="new-ping">Send the first one</a>' : ''}</div>`}</div></div>
        <div class="card"><div class="section-head"><h3>Online now</h3><a class="small" href="#/team">Team</a></div>
          ${online.length ? `<div class="row wrap">${online.map((m) => `<span class="row tight">${avatar(m, 'sm', { dot: true })}${personName(m.id, true)}</span>`).join('')}</div>` : '<div class="small muted">Just you right now.</div>'}</div>
      </div>
    </div>`;
  },
};
function agendaRow(it) {
  const when = it.date === todayStr() ? 'Today' : days(it.date) === 1 ? 'Tomorrow' : fmtDate(it.date, true);
  return `<a class="item" href="${esc(it.link)}"><span class="when">${esc(when)}${it.time ? `<br><span class="tiny">${esc(it.time)}</span>` : ''}</span>
    <span class="chan-ico" style="width:30px;height:30px">${ic(it.kind === 'event' ? 'cal' : 'jobs')}</span>
    <span class="grow"><span class="ellipsis bold" style="display:block">${esc(it.title)}</span><span class="tiny muted ellipsis" style="display:block">${esc(it.sub)}</span></span></a>`;
}

// ============================================================ PROJECTS
function projectCard(p) {
  const js = projectJobs(p.id); const openN = js.filter((j) => j.status !== 'done').length;
  const people = p.visibility === 'selected' ? [...new Set([p.createdBy, ...(p.members || [])])] : [...new Set(js.flatMap((j) => j.assignees || []))];
  return `<a class="projcard ${p.archived ? 'archived' : ''}" href="#/project/${p.id}">
    <span class="swatch" style="background:${esc(p.color || '#18693f')}"></span>
    <div class="row between top"><h3 class="grow">${esc(p.name)}</h3>${starBtn('projects', p.id)}</div>
    ${p.description ? `<div class="desc clamp2">${esc(p.description)}</div>` : ''}
    <div class="row wrap tight">${lockPill(p)}${p.archived ? '<span class="pill">Archived</span>' : ''}${S.clients[p.clientId] ? `<span class="pill">${esc(S.clients[p.clientId].name)}</span>` : ''}</div>
    <div class="foot"><span>${plural(openN, 'open job')}${js.length - openN ? ` · ${js.length - openN} done` : ''}</span>${avatarStack(people, 5)}</div></a>`;
}
VIEWS.projects = {
  render() {
    const all = Object.values(S.projects);
    const f = S.projFilter;
    const q = S.projSearch.trim().toLowerCase();
    let ps = all.filter((p) => (f === 'archived' ? p.archived : f === 'all' ? true : !p.archived));
    if (q) ps = ps.filter((p) => [p.name, p.description, (S.clients[p.clientId] || {}).name].join(' ').toLowerCase().includes(q));
    ps.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
    const starred = ps.filter((p) => isFav('projects', p.id)).sort(favFirst('projects'));
    const rest = ps.filter((p) => !isFav('projects', p.id));
    return `<div class="page-head"><div><h1>Projects</h1><div class="sub">Group related jobs together. Star the ones you use most.</div></div>
        <div class="row tight"><a class="btn" href="#/jobs">${ic('jobs')}<span>All jobs</span></a>${canCreateProjects() ? `<button class="btn primary" data-act="new-project">${ic('plus')}<span>New project</span></button>` : ''}</div></div>
      <div class="row wrap" style="margin-bottom:16px">
        <div class="seg">${[['active', 'Active'], ['archived', 'Archived'], ['all', 'All']].map(([k, l]) => `<button class="${f === k ? 'on' : ''}" data-act="proj-filter" data-f="${k}">${l} <span class="muted">${all.filter((p) => (k === 'archived' ? p.archived : k === 'all' ? true : !p.archived)).length}</span></button>`).join('')}</div>
        <label class="search grow" style="min-width:200px;max-width:360px"><input class="input" type="search" placeholder="Search projects" value="${esc(S.projSearch)}" data-input="proj-search" aria-label="Search projects">${ic('search')}</label>
      </div>
      <div id="projlist">${this.list(starred, rest, all.length)}</div>`;
  },
  list(starred, rest, total) {
    if (!starred.length && !rest.length) return `<div class="card empty">${ic('folder')}<h3>${total ? 'No projects match' : 'No projects yet'}</h3><div class="small">${total ? 'Try another filter or search.' : 'A project groups related jobs — for example, one building site or one big customer.'}</div>${!total && canCreateProjects() ? `<button class="btn primary" data-act="new-project">${ic('plus')}New project</button>` : ''}</div>`;
    return `${starred.length ? `<div class="section-head"><h2 class="row tight">${icSize('star', 17, 'color:#d29b0a;fill:currentColor')}Starred</h2></div><div class="cards" style="margin-bottom:24px">${starred.map(projectCard).join('')}</div>` : ''}
      ${rest.length ? `${starred.length ? '<div class="section-head"><h2>Everything else</h2></div>' : ''}<div class="cards">${rest.map(projectCard).join('')}</div>` : ''}`;
  },
};
A['proj-filter'] = (el) => { S.projFilter = el.dataset.f; renderView(false); };
I['proj-search'] = (el) => { S.projSearch = el.value; const box = $('#projlist'); if (!box) return; const html = VIEWS.projects.render(); const tmp = document.createElement('div'); tmp.innerHTML = html; box.innerHTML = tmp.querySelector('#projlist').innerHTML; };
VIEWS.project = {
  render(id) {
    const p = S.projects[id];
    if (!p) return `<a class="back" href="#/projects">${ic('back')}Projects</a><div class="card empty"><h3>Project not found</h3><div class="small">It may have been deleted, or it isn’t shared with you.</div></div>`;
    const js = projectJobs(id).sort(byDeadline);
    const open = js.filter((j) => j.status !== 'done'), done = js.filter((j) => j.status === 'done');
    const canEdit = isAdmin() || p.createdBy === S.user.id || p.visibility !== 'selected' || (p.members || []).includes(S.user.id);
    const canDel = isAdmin() || p.createdBy === S.user.id;
    const people = p.visibility === 'selected' ? [...new Set([p.createdBy, ...(p.members || [])])] : [];
    const evs = Object.values(S.events).filter((e) => e.projectId === id && e.date >= todayStr()).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).slice(0, 5);
    return `<a class="back" href="#/projects">${ic('back')}Projects</a>
      <div class="page-head"><div class="grow"><div class="row tight">${starBtn('projects', id)}<h1>${esc(p.name)}</h1></div>
        <div class="row wrap tight" style="margin-top:6px">${lockPill(p)}${p.archived ? '<span class="pill">Archived</span>' : ''}${S.clients[p.clientId] ? `<a class="pill" href="#/client/${p.clientId}" style="text-decoration:none">${ic('contacts')}${esc(S.clients[p.clientId].name)}</a>` : ''}
        <span class="tiny muted">Started by ${personName(p.createdBy)} · ${timeAgo(p.createdAt)}</span></div></div>
        <div class="row tight">${canEdit ? `<button class="btn sm" data-act="edit-project" data-id="${id}">${ic('edit')}Edit</button>
          <button class="btn sm" data-act="archive-project" data-id="${id}">${ic(p.archived ? 'restore' : 'archive')}${p.archived ? 'Restore' : 'Archive'}</button>` : ''}
          ${canDel ? `<button class="btn sm icon danger" data-act="del-project" data-id="${id}" aria-label="Delete project">${ic('trash')}</button>` : ''}</div></div>
      ${p.archived ? `<div class="info-box" style="margin-bottom:16px">This project is archived. It’s kept for reference — restore it to start working on it again.</div>` : ''}
      <div class="grid two">
        <div class="stack loose">
          ${p.description ? `<div class="card pre">${linkify(p.description)}</div>` : ''}
          <div><div class="section-head"><h2>Jobs <span class="muted" style="font-weight:500">${open.length}</span></h2>${canCreateJobs() && !p.archived ? `<button class="btn sm primary" data-act="new-job" data-project="${id}">${ic('plus')}Add job</button>` : ''}</div>
            ${open.length ? `<div class="stack tight">${open.map(jobCard).join('')}</div>` : `<div class="card empty small">No open jobs in this project.</div>`}
            ${done.length ? `<details style="margin-top:12px"><summary class="small bold" style="cursor:pointer">${plural(done.length, 'finished job')}</summary><div class="stack tight" style="margin-top:8px">${done.map(jobCard).join('')}</div></details>` : ''}</div>
        </div>
        <div class="stack">
          <div class="card"><h3 style="margin-bottom:8px">${p.visibility === 'selected' ? 'People in this project' : 'Who can see it'}</h3>
            ${p.visibility === 'selected' ? `<div class="stack tight">${people.map((uid) => `<div class="row">${avatar(member(uid), 'sm')}${personName(uid)}${uid === p.createdBy ? '<span class="tiny muted">started it</span>' : ''}</div>`).join('')}</div><div class="tiny muted" style="margin-top:8px">Admins can also see private projects.</div>`
              : `<div class="small muted">Everyone in ${esc(S.company.name)}.</div>`}</div>
          <div class="card"><div class="section-head"><h3>Coming up</h3><button class="btn sm" data-act="new-event" data-project="${id}">${ic('plus')}Event</button></div>
            ${evs.length ? `<div class="stack tight">${evs.map((e) => `<a href="#/calendar/${e.date}" class="row small" style="text-decoration:none;color:inherit"><span class="pill">${esc(fmtDate(e.date, true))}${e.allDay ? '' : ' ' + esc(e.start)}</span><span class="ellipsis">${esc(e.title)}</span></a>`).join('')}</div>` : '<div class="small muted">No upcoming events.</div>'}</div>
          ${p.start || p.due ? `<div class="card"><dl class="kv"><dt>Start</dt><dd>${p.start ? esc(fmtDate(p.start, true)) : '—'}</dd><dt>Finish by</dt><dd>${p.due ? dueHtml(p.due) : '—'}</dd></dl></div>` : ''}
        </div>
      </div>`;
  },
};
function projectSheet(p) {
  const v = p || { name: '', description: '', clientId: '', color: PALETTE[Object.keys(S.projects).length % PALETTE.length], visibility: 'all', members: [], start: '', due: '' };
  const canAccess = !p || canManageAccess(p);
  sheet(`${sheetHead(p ? 'Edit project' : 'New project')}
    <form class="stack" data-form="project" data-id="${p ? p.id : ''}">
      <label class="field"><span>Project name</span><input name="name" value="${esc(v.name)}" placeholder="e.g. Elm Road extension" required maxlength="120"></label>
      <label class="field"><span>Description</span><textarea name="description" placeholder="What it is, who it’s for, anything people should know">${esc(v.description)}</textarea></label>
      <div class="form-grid">
        <label class="field"><span>Client</span><select name="clientId"><option value="">No client</option>${Object.values(S.clients).sort((a, b) => a.name.localeCompare(b.name)).map((c) => `<option value="${c.id}" ${c.id === v.clientId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <div class="field"><span>Colour</span><div class="row wrap tight">${PALETTE.map((c) => `<label style="cursor:pointer"><input type="radio" name="color" value="${c}" ${c === v.color ? 'checked' : ''} class="sr-only"><span class="team-swatch" style="width:24px;height:24px;border-radius:6px;display:block;background:${c};outline:${c === v.color ? '2px solid var(--ink)' : 'none'};outline-offset:2px" data-swatch></span></label>`).join('')}</div></div>
        <label class="field"><span>Start</span><input type="date" name="start" value="${esc(v.start)}"></label>
        <label class="field"><span>Finish by</span><input type="date" name="due" value="${esc(v.due)}"></label>
      </div>
      ${canAccess ? visibilityField(v.visibility, v.members || [], 'Who can see this project') : `<div class="info-box small">${ic('lock')} Only the person who started this project, or an admin, can change who sees it.</div>`}
      <div class="err-msg" data-err></div>
      <div class="sheet-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${p ? 'Save changes' : 'Create project'}</button></div>
    </form>`, swatchPicker);
}
function swatchPicker(sh) { sh.addEventListener('change', (e) => { if (e.target.name === 'color') $$('[data-swatch]', sh).forEach((s) => { s.style.outline = s.previousElementSibling.checked ? '2px solid var(--ink)' : 'none'; }); }); }
F.project = async (f, d, close) => {
  const body = { name: d.name, description: d.description, clientId: d.clientId, color: d.color, start: d.start, due: d.due };
  if (d.visibility) { body.visibility = d.visibility; body.members = picked(f, 'viewers'); }
  const item = await saveItem('projects', f.dataset.id || null, body);
  close(); if (!f.dataset.id) location.hash = '#/project/' + item.id;
};
A['new-project'] = () => projectSheet(null);
A['edit-project'] = (el) => projectSheet(S.projects[el.dataset.id]);
A['archive-project'] = async (el) => {
  const p = S.projects[el.dataset.id]; const to = !p.archived;
  await saveItem('projects', p.id, { archived: to });
  toast(to ? `“${p.name}” archived` : `“${p.name}” restored`, false, '', to ? { label: 'Undo', fn: () => saveItem('projects', p.id, { archived: false }) } : null);
};
A['del-project'] = async (el) => {
  const p = S.projects[el.dataset.id];
  if (!(await confirmBox('Delete this project?', `“${p.name}” will be deleted. Its ${plural(projectJobs(p.id).length, 'job')} will stay, just without a project. To keep it for reference, archive it instead.`))) return;
  if (await deleteItem('projects', p.id)) location.hash = '#/projects';
};

// ============================================================ JOBS
const FILTERS = [['open', 'Open'], ['starred', 'Starred'], ['mine', 'Mine'], ['planned', 'Planned'], ['active', 'In progress'], ['hold', 'On hold'], ['week', 'Due this week'], ['overdue', 'Overdue'], ['done', 'Done'], ['all', 'All']];
function jobMatches(j, f) {
  const me = S.user.id;
  switch (f) {
    case 'open': return j.status !== 'done';
    case 'starred': return isFav('jobs', j.id);
    case 'mine': return j.status !== 'done' && ((j.assignees || []).includes(me) || jobTasks(j.id).some((t) => !t.done && (t.assignees || []).includes(me)));
    case 'week': return j.status !== 'done' && j.deadline && days(j.deadline) >= 0 && days(j.deadline) <= 7;
    case 'overdue': return j.status !== 'done' && ((j.deadline && days(j.deadline) < 0) || jobTasks(j.id).some((t) => !t.done && t.deadline && days(t.deadline) < 0));
    case 'all': return true;
    default: return j.status === f;
  }
}
function jobCard(j) {
  const p = progress(j.id);
  const client = S.clients[j.clientId]; const proj = S.projects[j.projectId];
  const unread = S.unread['job:' + j.id] || 0; const nPh = jobPhotos(j.id).length;
  return `<a class="jobcard" href="#/job/${j.id}"><span class="bar" style="background:${STATUS_COLOR[j.status]}"></span>
    <div class="row between"><span class="ref">${esc(j.ref)}${proj ? ` · ${esc(proj.name)}` : ''}</span><span class="row tight">${j.priority === 'urgent' || j.priority === 'high' ? `<span class="pill pr-${j.priority}">${PRIORITY[j.priority]}</span>` : ''}${unread ? `<span class="count" title="${unread} unread messages">${unread}</span>` : ''}${starBtn('jobs', j.id)}</span></div>
    <div><h3>${esc(j.title)}</h3>${client || j.address ? `<div class="small muted ellipsis" style="margin-top:2px">${esc([client && client.name, j.address].filter(Boolean).join(' · '))}</div>` : ''}</div>
    <div class="row wrap tight"><span class="pill st-${j.status}">${STATUS[j.status]}</span>${lockPill(j)}${dueHtml(j.deadline, j.status === 'done')}</div>
    <div class="row">${p.total ? `<div class="grow"><div class="progress"><i style="width:${(p.done / p.total) * 100}%"></i></div><div class="tiny muted" style="margin-top:4px">${p.done}/${p.total} tasks</div></div>` : '<div class="grow tiny muted">No tasks yet</div>'}
      ${nPh ? `<span class="meta" title="${nPh} photos">${ic('camera')}${nPh}</span>` : ''}${avatarStack(j.assignees)}</div>
  </a>`;
}
VIEWS.jobs = {
  render(filter) {
    if (filter) { S.jobFilter = filter; store.set('cd_jobFilter', filter); }
    const all = Object.values(S.jobs);
    return `<div class="page-head"><div><h1>Jobs</h1><div class="sub">${plural(all.filter((j) => j.status !== 'done').length, 'open job')}</div></div>${canCreateJobs() ? `<button class="btn primary" data-act="new-job">${ic('plus')}<span>New job</span></button>` : ''}</div>
      <div class="stack" style="gap:10px">
        <label class="search"><input class="input" type="search" placeholder="Search jobs, clients, addresses…" value="${esc(S.jobSearch)}" data-input="job-search" aria-label="Search jobs">${ic('search')}</label>
        <div class="chips" role="toolbar" aria-label="Filter jobs">${FILTERS.map(([k, l]) => `<button class="chip ${S.jobFilter === k ? 'on' : ''}" data-act="job-filter" data-f="${k}" aria-pressed="${S.jobFilter === k}">${k === 'starred' ? icSize('star', 13) : ''}${l}<span class="n">${all.filter((j) => jobMatches(j, k)).length}</span></button>`).join('')}</div>
      </div>
      <div class="section" id="joblist" style="margin-top:16px">${this.list()}</div>`;
  },
  list() {
    const q = S.jobSearch.trim().toLowerCase();
    let jobs = Object.values(S.jobs).filter((j) => jobMatches(j, S.jobFilter));
    if (q) jobs = jobs.filter((j) => [j.title, j.ref, j.address, j.description, (S.clients[j.clientId] || {}).name, (S.projects[j.projectId] || {}).name].join(' ').toLowerCase().includes(q));
    jobs.sort(S.jobFilter === 'done' ? (a, b) => b.updatedAt - a.updatedAt : byDeadline);
    const starred = jobs.filter((j) => isFav('jobs', j.id)).sort(favFirst('jobs')); const rest = jobs.filter((j) => !isFav('jobs', j.id));
    const total = Object.keys(S.jobs).length;
    if (!jobs.length) return `<div class="card empty">${ic('jobs')}<h3>${total ? 'No jobs match' : 'No jobs yet'}</h3><div class="small">${total ? 'Try another filter or search.' : canCreateJobs() ? 'Create your first job to start tracking work.' : 'Jobs shared with you will appear here.'}</div>${!total && canCreateJobs() ? `<button class="btn primary" data-act="new-job">${ic('plus')}New job</button>` : ''}</div>`;
    return `${starred.length && S.jobFilter !== 'starred' ? `<div class="section-head"><h2 class="row tight">${icSize('star', 16, 'color:#d29b0a;fill:currentColor')}Starred</h2></div><div class="cards" style="margin-bottom:22px">${starred.map(jobCard).join('')}</div>${rest.length ? '<div class="section-head"><h2>Other jobs</h2></div>' : ''}` : ''}
      <div class="cards">${(S.jobFilter === 'starred' ? starred : rest).map(jobCard).join('')}</div>`;
  },
};
A['job-filter'] = (el) => { S.jobFilter = el.dataset.f; store.set('cd_jobFilter', el.dataset.f); if (!/^#\/jobs\/?$/.test(location.hash)) location.hash = '#/jobs'; else renderView(false); };
I['job-search'] = (el) => { S.jobSearch = el.value; const l = $('#joblist'); if (l) l.innerHTML = VIEWS.jobs.list(); };

// ============================================================ JOB DETAIL
VIEWS.job = {
  render(id, tab = 'overview') {
    const j = S.jobs[id];
    if (!j) return `<a class="back" href="#/jobs">${ic('back')}Jobs</a><div class="card empty"><h3>Job not found</h3><div class="small">It may have been deleted, or it isn’t shared with you.</div></div>`;
    return `<div id="job-top">${this.top(j, tab)}</div><div id="job-tab" style="margin-top:18px">${this.tab(j, tab)}</div>`;
  },
  mount(id, tab) { if (tab === 'chat') mountChat('job:' + id); },
  update(id, tab = 'overview') {
    const j = S.jobs[id];
    if (!j || !$('#job-top')) return renderView(false);
    const sx = ($('#job-top .tabs') || {}).scrollLeft || 0;
    $('#job-top').innerHTML = this.top(j, tab);
    if ($('#job-top .tabs')) $('#job-top .tabs').scrollLeft = sx;
    placeTabInk(null);
    const box = $('#job-tab');
    if (tab === 'chat') { refreshPanes('job:' + id); return; }
    if (box.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    box.innerHTML = this.tab(j, tab);
  },
  top(j, tab) {
    const p = progress(j.id); const unread = S.unread['job:' + j.id] || 0; const nPh = jobPhotos(j.id).length;
    const proj = S.projects[j.projectId];
    const tabs = [['overview', 'Overview'], ['tasks', `Tasks${p.total ? ` <span class="muted">${p.done}/${p.total}</span>` : ''}`], ['photos', `Photos${nPh ? ` <span class="muted">${nPh}</span>` : ''}`]];
    if (S.company.canSeeMoney) tabs.push(['money', 'Money']);
    tabs.push(['chat', `Chat${unread ? ` <span class="count">${unread}</span>` : ''}`], ['history', 'History']);
    return `<a class="back" href="${proj ? '#/project/' + proj.id : '#/jobs'}">${ic('back')}${proj ? esc(proj.name) : 'Jobs'}</a>
      <div class="stack" style="gap:10px">
        <div class="row between top"><div class="grow"><div class="row wrap tight"><span class="mono muted">${esc(j.ref)}</span>${j.priority !== 'normal' ? `<span class="pill ${j.priority === 'low' ? '' : 'pr-' + j.priority}">${PRIORITY[j.priority]} priority</span>` : ''}${lockPill(j)}</div>
          <div class="row tight" style="margin-top:4px">${starBtn('jobs', j.id)}<h1>${esc(j.title)}</h1></div></div>
          <div class="row tight"><button class="btn sm" data-act="edit-job" data-id="${j.id}">${ic('edit')}<span>Edit</span></button>
          ${isAdmin() || j.createdBy === S.user.id ? `<button class="btn sm icon danger" data-act="del-job" data-id="${j.id}" aria-label="Delete job">${ic('trash')}</button>` : ''}</div></div>
        <div class="status-picker" role="group" aria-label="Job status">${Object.entries(STATUS).map(([k, l]) => `<button class="${j.status === k ? 'on st-' + k : ''}" data-act="job-status" data-id="${j.id}" data-s="${k}" aria-pressed="${j.status === k}">${l}</button>`).join('')}</div>
        ${p.total ? `<div class="progress" role="progressbar" aria-valuenow="${p.done}" aria-valuemax="${p.total}" aria-label="Tasks done"><i style="width:${(p.done / p.total) * 100}%"></i></div>` : ''}
      </div>
      <nav class="tabs" style="margin-top:14px" aria-label="Job sections">${tabs.map(([k, l]) => `<a class="tab ${tab === k ? 'on' : ''}" href="#/job/${j.id}/${k}" ${tab === k ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`;
  },
  tab(j, tab) {
    if (tab === 'tasks') return tasksTab(j);
    if (tab === 'photos') return `<div class="section-head"><div><h2>Photos</h2><div class="small muted">${isTouch() ? 'Take photos on site or pick from your camera roll.' : 'Click to add, or drag photos onto this page.'}</div></div>
      <button class="btn primary" data-act="photos-add" data-job="${j.id}">${ic('camera')}<span>Add photos</span></button></div>
      <div id="photo-gallery" data-job="${j.id}" data-drop="${j.id}">${photoGalleryInner(j.id)}</div>`;
    if (tab === 'money' && S.company.canSeeMoney) return moneyTab(j);
    if (tab === 'chat') return chatPane('job:' + j.id, true);
    if (tab === 'history') return historyTab(j);
    return overviewTab(j);
  },
};
function overviewTab(j) {
  const c = S.clients[j.clientId]; const t = S.teams[j.teamId]; const proj = S.projects[j.projectId];
  const viewers = j.visibility === 'selected' ? [...new Set([j.createdBy, ...(j.viewers || []), ...(j.assignees || [])])] : null;
  return `<div class="grid two">
    <div class="stack">
      <div class="card"><dl class="kv">
        <dt>Client</dt><dd>${c ? `<a href="#/client/${c.id}" class="bold">${esc(c.name)}</a>${c.company ? `<span class="muted"> · ${esc(c.company)}</span>` : ''}
          <div class="row tight" style="margin-top:6px">${c.phone ? `<a class="btn sm" href="tel:${esc(c.phone)}">${ic('phone')}Call</a>` : ''}${c.email ? `<a class="btn sm" href="mailto:${esc(c.email)}">${ic('mail')}Email</a>` : ''}</div>` : '<span class="muted">None</span>'}</dd>
        <dt>Project</dt><dd>${proj ? `<a href="#/project/${proj.id}" class="bold">${esc(proj.name)}</a>` : '<span class="muted">None</span>'}</dd>
        <dt>Site</dt><dd>${j.address ? esc(j.address) : j.lat != null ? '<span class="muted">Pinned on map</span>' : '<span class="muted">No address</span>'}
          <div class="row wrap tight" style="margin-top:6px">${j.address || j.lat != null ? `<a class="btn sm" target="_blank" rel="noopener noreferrer" href="${dirLink(j)}">${ic('nav')}Directions</a>` : ''}
          <button class="btn sm" data-act="job-here" data-id="${j.id}">${ic('locate')}${j.lat != null ? 'Re-pin here' : 'Pin my location'}</button></div></dd>
        <dt>Start</dt><dd>${j.start ? esc(fmtDate(j.start, true)) : '<span class="muted">—</span>'}</dd>
        <dt>Deadline</dt><dd>${j.deadline ? dueHtml(j.deadline, j.status === 'done') : '<span class="muted">No deadline</span>'}</dd>
        <dt>Team</dt><dd>${t ? `<span class="row tight"><span class="team-swatch" style="background:${esc(t.color)}"></span>${esc(t.name)}</span>` : '<span class="muted">—</span>'}</dd>
        <dt>Owner</dt><dd>${personName(j.createdBy)} <span class="muted small">· created ${timeAgo(j.createdAt)}</span></dd>
        <dt>Visible to</dt><dd>${viewers ? `<span class="row wrap tight">${avatarStack(viewers, 8)}<span class="small muted">${plural(viewers.length, 'person', 'people')} + admins</span></span>` : '<span class="muted">Everyone in the company</span>'}</dd>
      </dl>
      <div class="row wrap tight" style="margin-top:12px"><button class="btn sm" data-act="new-event" data-job="${j.id}">${ic('cal')}Add to calendar</button></div></div>
      <div class="card"><h3 style="margin-bottom:8px">Description</h3>${j.description ? `<div class="pre">${linkify(j.description)}</div>` : `<div class="muted small">No description. <a href="#" data-act="edit-job" data-id="${j.id}">Add one</a></div>`}</div>
      <div class="card"><div class="section-head" style="margin-bottom:8px"><h3>Photos</h3><a class="small" href="#/job/${j.id}/photos">See all${jobPhotos(j.id).length ? ' ' + jobPhotos(j.id).length : ''}</a></div>
        <div id="photo-strip" data-job="${j.id}" data-drop="${j.id}">${photoStripInner(j.id)}</div></div>
    </div>
    <div class="stack">
      <div class="card"><h3>Who’s working on it</h3><p class="small muted" style="margin:4px 0 10px">Tap to add or remove people. They’ll get a notification.</p>
        <div class="people-pick">${Object.values(S.members).sort((a, b) => a.name.localeCompare(b.name)).map((m) => `<button class="person-chip ${(j.assignees || []).includes(m.id) ? 'on' : ''}" data-act="job-assign" data-id="${j.id}" data-uid="${m.id}" aria-pressed="${(j.assignees || []).includes(m.id)}">${avatar(m, 'sm', { dot: true, link: false })}${esc(m.name.split(' ')[0])}</button>`).join('')}</div></div>
      ${S.company.canSeeMoney ? `<a class="card" href="#/job/${j.id}/money"><div class="row between"><h3>Money</h3>${icSize('right', 18)}</div>
        <div class="row between small" style="margin-top:8px"><span class="muted">Price</span><b class="mono">${esc(money(j.price))}</b></div>
        <div class="row between small"><span class="muted">Costs</span><b class="mono">${esc(money(jobCosts(j)))}</b></div>
        <div class="row between small"><span class="muted">Profit</span><b class="mono ${(j.price || 0) - jobCosts(j) >= 0 ? 'pos' : 'neg'}">${esc(money((j.price || 0) - jobCosts(j)))}</b></div></a>` : ''}
      <div class="card"><div class="section-head"><h3>Recent activity</h3><a class="small" href="#/job/${j.id}/history">All</a></div>${historyList((j.history || []).slice(-4).reverse())}</div>
    </div></div>`;
}
function historyList(items) {
  if (!items.length) return '<div class="small muted">Nothing yet.</div>';
  return `<ul class="hist">${items.map((h) => `<li>${avatar(member(h.by), 'xs')}<span class="grow">${personName(h.by, true)} ${esc(h.text.charAt(0).toLowerCase() + h.text.slice(1))}</span><time datetime="${new Date(h.at).toISOString()}" title="${esc(fmtDateTime(h.at))}">${timeAgo(h.at)}</time></li>`).join('')}</ul>`;
}
function historyTab(j) { return `<div class="card"><h2 style="margin-bottom:10px">History</h2>${historyList((j.history || []).slice().reverse())}</div>`; }
function tasksTab(j) {
  const tasks = jobTasks(j.id);
  return `<form class="inline-add" data-form="task-add" data-job="${j.id}" style="margin-bottom:12px"><input class="input" name="title" placeholder="Add a task… e.g. Strip old tiles" required aria-label="New task"><button class="btn primary">${ic('plus')}<span>Add</span></button></form>
    <div class="card flush">${tasks.length ? tasks.map(taskHtml).join('') : `<div class="empty">${ic('list')}<h3>No tasks yet</h3><div class="small">Break the job into tasks, then add a checklist to each one.</div></div>`}</div>`;
}
function taskHtml(t) {
  const open = S.openTask === t.id; const cl = t.checklist || []; const clDone = cl.filter((x) => x.done).length;
  return `<div class="task">
    <div class="task-row">
      <button class="check round ${t.done ? 'on' : ''}" data-act="task-toggle" data-id="${t.id}" aria-pressed="${t.done}" aria-label="${t.done ? 'Mark not done' : 'Mark done'}: ${esc(t.title)}">${ic('check')}</button>
      <button class="task-main" data-act="task-open" data-id="${t.id}" aria-expanded="${open}"><div class="t ${t.done ? 'struck' : ''}">${esc(t.title)}</div>
        <div class="row wrap small muted" style="gap:10px;margin-top:3px">${avatarStack(t.assignees, 3)}${dueHtml(t.deadline, t.done)}${cl.length ? `<span class="row tight">${icSize('list', 14)}${clDone}/${cl.length}</span>` : ''}${t.notes ? '<span>Notes</span>' : ''}</div>
      </button><span class="muted" aria-hidden="true" style="transform:rotate(${open ? 90 : 0}deg);transition:transform .2s;display:flex">${icSize('right', 18)}</span>
    </div>
    ${open ? `<div class="task-body">
      <div><div class="label" style="margin-bottom:6px">Checklist</div>
        ${cl.map((x) => `<div class="cl-item"><button class="check ${x.done ? 'on' : ''}" data-act="cl-toggle" data-id="${t.id}" data-item="${x.id}" aria-pressed="${x.done}" aria-label="${esc(x.text)}">${ic('check')}</button><span class="${x.done ? 'struck' : ''}">${esc(x.text)}</span><button class="btn ghost sm icon" data-act="cl-del" data-id="${t.id}" data-item="${x.id}" aria-label="Remove ${esc(x.text)}">${ic('x')}</button></div>`).join('')}
        <form class="inline-add" data-form="cl-add" data-id="${t.id}" style="margin-top:6px"><input class="input" name="text" placeholder="Add checklist item" aria-label="New checklist item" required><button class="btn sm" aria-label="Add checklist item">${ic('plus')}</button></form></div>
      <div><div class="label" style="margin-bottom:6px">Assigned to</div>
        <div class="people-pick">${Object.values(S.members).sort((a, b) => a.name.localeCompare(b.name)).map((m) => `<button class="person-chip ${(t.assignees || []).includes(m.id) ? 'on' : ''}" data-act="task-assign" data-id="${t.id}" data-uid="${m.id}" aria-pressed="${(t.assignees || []).includes(m.id)}">${avatar(m, 'sm', { link: false })}${esc(m.name.split(' ')[0])}</button>`).join('')}</div></div>
      <div class="form-grid"><label class="field"><span>Deadline</span><input type="date" value="${esc(t.deadline)}" data-change="task-due" data-id="${t.id}"></label><div></div>
        <label class="field full"><span>Notes</span><textarea data-change="task-notes" data-id="${t.id}" placeholder="Details, measurements, materials…">${esc(t.notes)}</textarea></label></div>
      <div class="row"><button class="btn sm" data-act="task-rename" data-id="${t.id}">${ic('edit')}Rename</button><div class="grow"></div><button class="btn sm danger" data-act="task-del" data-id="${t.id}">${ic('trash')}Delete task</button></div>
    </div>` : ''}
  </div>`;
}
function moneyTab(j) {
  const costs = jobCosts(j); const price = Number(j.price) || 0; const profit = price - costs;
  return `<div class="grid two">
    <div class="stack">
      <div class="card"><label class="field"><span>Price charged to client</span><input type="number" inputmode="decimal" step="0.01" min="0" value="${price || ''}" placeholder="0.00" data-change="job-price" data-id="${j.id}"></label></div>
      <div class="card"><div class="section-head"><h3>Costs</h3><span class="mono small">${esc(money(costs))}</span></div>
        <div class="stack tight">${(j.costs || []).map((c) => `<div class="cost-row"><input class="input" value="${esc(c.label)}" data-change="cost-field" data-id="${j.id}" data-cost="${c.id}" data-k="label" aria-label="Cost description">
          <input class="input" type="number" inputmode="decimal" step="0.01" value="${c.amount}" data-change="cost-field" data-id="${j.id}" data-cost="${c.id}" data-k="amount" aria-label="Amount">
          <button class="btn ghost sm icon" data-act="cost-del" data-id="${j.id}" data-cost="${c.id}" aria-label="Remove cost">${ic('x')}</button></div>`).join('') || '<div class="small muted">No costs added yet.</div>'}</div>
        <form class="cost-row" data-form="cost-add" data-id="${j.id}" style="margin-top:12px"><input class="input" name="label" placeholder="Materials, labour, skip hire…" required aria-label="Cost description"><input class="input" name="amount" type="number" inputmode="decimal" step="0.01" placeholder="0.00" required aria-label="Amount"><button class="btn sm icon primary" aria-label="Add cost">${ic('plus')}</button></form>
      </div>
    </div>
    <div class="card totals"><span class="label">Summary</span>
      <div class="row"><span class="muted">Price</span><span class="mono">${esc(money(price))}</span></div>
      <div class="row"><span class="muted">Costs</span><span class="mono">− ${esc(money(costs))}</span></div>
      <hr class="sep" style="margin:4px 0">
      <div class="row"><b>Profit</b><span class="big ${profit >= 0 ? 'pos' : 'neg'}">${esc(money(profit))}</span></div>
      <div class="row small"><span class="muted">Margin</span><span>${price ? Math.round((profit / price) * 100) + '%' : '—'}</span></div>
      ${!S.company.settings.membersSeeMoney ? `<div class="tiny muted" style="margin-top:6px">${icSize('lock', 12, 'vertical-align:-1px')} Only admins can see money. Change this in Company settings.</div>` : ''}
    </div></div>`;
}
function jobSheet(job, preset = {}) {
  const j = job || Object.assign({ title: '', description: '', status: 'planned', priority: 'normal', clientId: '', teamId: '', projectId: '', address: '', start: '', deadline: '', assignees: [S.user.id], price: '', visibility: 'all', viewers: [] }, preset);
  const clients = Object.values(S.clients).sort((a, b) => a.name.localeCompare(b.name));
  const projects = Object.values(S.projects).filter((p) => !p.archived || p.id === j.projectId).sort((a, b) => a.name.localeCompare(b.name));
  const canAccess = !job || canManageAccess(job);
  sheet(`${sheetHead(job ? 'Edit job' : 'New job')}
    <form class="stack" data-form="job" data-id="${job ? job.id : ''}">
      <label class="field"><span>Job title</span><input name="title" value="${esc(j.title)}" placeholder="e.g. Kitchen refit — 14 Elm Road" required maxlength="140"></label>
      <div class="form-grid">
        <label class="field"><span>Project</span><select name="projectId"><option value="">No project</option>${projects.map((p) => `<option value="${p.id}" ${p.id === j.projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Client</span><div class="row tight"><select name="clientId" class="grow"><option value="">No client</option>${clients.map((c) => `<option value="${c.id}" ${c.id === j.clientId ? 'selected' : ''}>${esc(c.name)}${c.company ? ' — ' + esc(c.company) : ''}</option>`).join('')}</select><button type="button" class="btn sm icon" data-act="quick-client" aria-label="New client">${ic('plus')}</button></div></label>
        <label class="field"><span>Status</span><select name="status">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${j.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Priority</span><select name="priority">${Object.entries(PRIORITY).map(([k, l]) => `<option value="${k}" ${j.priority === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Start date</span><input type="date" name="start" value="${esc(j.start)}"></label>
        <label class="field"><span>Deadline</span><input type="date" name="deadline" value="${esc(j.deadline)}"></label>
        <label class="field full"><span>Site address</span><input name="address" value="${esc(j.address)}" placeholder="Street, town, postcode" autocomplete="street-address"></label>
        <label class="field"><span>Team</span><select name="teamId"><option value="">No team</option>${Object.values(S.teams).map((t) => `<option value="${t.id}" ${t.id === j.teamId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
        ${S.company.canSeeMoney ? `<label class="field"><span>Price (optional)</span><input type="number" inputmode="decimal" step="0.01" min="0" name="price" value="${j.price || ''}" placeholder="0.00"></label>` : '<div></div>'}
        <label class="field full"><span>Description</span><textarea name="description" placeholder="Scope of work, access notes, materials…">${esc(j.description)}</textarea></label>
      </div>
      <div class="field"><span>Assign people</span>${peoplePicker(j.assignees || [])}</div>
      ${canAccess ? visibilityField(j.visibility, j.viewers || [], 'Who can see this job') : `<div class="info-box small">${icSize('lock', 14, 'vertical-align:-2px')} Only ${personName(j.createdBy)} or an admin can change who sees this job.</div>`}
      <div class="err-msg" data-err></div>
      <div class="sheet-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${job ? 'Save changes' : 'Create job'}</button></div>
    </form>`);
}
F.job = async (f, d, close) => {
  const body = { title: d.title, clientId: d.clientId, projectId: d.projectId, status: d.status, priority: d.priority, start: d.start, deadline: d.deadline,
    address: d.address, teamId: d.teamId, description: d.description, assignees: picked(f) };
  if ('price' in d) body.price = d.price;
  if (d.visibility) { body.visibility = d.visibility; body.viewers = picked(f, 'viewers'); }
  const item = await saveItem('jobs', f.dataset.id || null, body);
  close();
  if (!f.dataset.id) location.hash = '#/job/' + item.id;
};
A['new-job'] = (el) => jobSheet(null, { clientId: el.dataset.client || '', projectId: el.dataset.project || (parseHash().name === 'project' ? parseHash().args[0] : '') });
A['edit-job'] = (el) => jobSheet(S.jobs[el.dataset.id]);
A['del-job'] = async (el) => { const j = S.jobs[el.dataset.id]; if (await confirmBox('Delete this job?', `“${j.title}”, its tasks, photos and chat will be deleted for everyone. This can’t be undone.`)) { if (await deleteItem('jobs', j.id)) location.hash = '#/jobs'; } };
A['job-status'] = (el) => saveItem('jobs', el.dataset.id, { status: el.dataset.s });
A['job-assign'] = (el) => { const j = S.jobs[el.dataset.id]; const a = new Set(j.assignees || []); a.has(el.dataset.uid) ? a.delete(el.dataset.uid) : a.add(el.dataset.uid); saveItem('jobs', j.id, { assignees: [...a] }); };
A['job-here'] = (el) => {
  if (!window.isSecureContext || !navigator.geolocation) return toast('Location needs a secure https:// link', true);
  toast('Getting your location…');
  navigator.geolocation.getCurrentPosition((p) => saveItem('jobs', el.dataset.id, { lat: p.coords.latitude, lng: p.coords.longitude }).then(() => toast('Job site pinned')),
    () => toast('Could not get your location', true), { enableHighAccuracy: true, timeout: 20000 });
};
A['quick-client'] = (el) => {
  const sel = el.closest('form').querySelector('select[name=clientId]');
  clientSheet(null, (c) => { sel.insertAdjacentHTML('beforeend', `<option value="${c.id}">${esc(c.name)}</option>`); sel.value = c.id; });
};
A['task-open'] = (el) => { S.openTask = S.openTask === el.dataset.id ? null : el.dataset.id; renderView(false); };
A['task-toggle'] = (el) => { const t = S.tasks[el.dataset.id]; el.classList.toggle('on'); saveItem('tasks', t.id, { done: !t.done }); };
A['task-assign'] = (el) => { const t = S.tasks[el.dataset.id]; const a = new Set(t.assignees || []); a.has(el.dataset.uid) ? a.delete(el.dataset.uid) : a.add(el.dataset.uid); saveItem('tasks', t.id, { assignees: [...a] }); };
A['task-rename'] = (el) => { const t = S.tasks[el.dataset.id]; sheet(`${sheetHead('Rename task')}<form class="stack" data-form="task-rename" data-id="${t.id}"><input class="input" name="title" value="${esc(t.title)}" required aria-label="Task name"><div class="sheet-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div></form>`); };
A['task-del'] = async (el) => { const t = S.tasks[el.dataset.id]; if (await confirmBox('Delete this task?', `“${t.title}” and its checklist will be removed.`)) deleteItem('tasks', t.id); };
A['cl-toggle'] = (el) => { const t = S.tasks[el.dataset.id]; saveItem('tasks', t.id, { checklist: t.checklist.map((x) => (x.id === el.dataset.item ? Object.assign({}, x, { done: !x.done }) : x)) }); };
A['cl-del'] = (el) => { const t = S.tasks[el.dataset.id]; saveItem('tasks', t.id, { checklist: t.checklist.filter((x) => x.id !== el.dataset.item) }); };
A['cost-del'] = (el) => { const j = S.jobs[el.dataset.id]; saveItem('jobs', j.id, { costs: j.costs.filter((c) => c.id !== el.dataset.cost) }); };
C['task-due'] = (el) => saveItem('tasks', el.dataset.id, { deadline: el.value });
C['task-notes'] = (el) => saveItem('tasks', el.dataset.id, { notes: el.value });
C['job-price'] = (el) => saveItem('jobs', el.dataset.id, { price: el.value });
C['cost-field'] = (el) => { const j = S.jobs[el.dataset.id]; saveItem('jobs', j.id, { costs: j.costs.map((c) => (c.id === el.dataset.cost ? Object.assign({}, c, { [el.dataset.k]: el.value }) : c)) }); };
F['task-add'] = async (f, d) => {
  const item = await saveItem('tasks', null, { jobId: f.dataset.job, title: d.title, assignees: [] });
  S.openTask = item.id; f.reset(); renderView(false);
  const inp = $('form[data-form="task-add"] input'); if (inp && matchMedia('(hover:hover)').matches) inp.focus();
};
F['cl-add'] = async (f, d) => {
  const t = S.tasks[f.dataset.id];
  await saveItem('tasks', t.id, { checklist: (t.checklist || []).concat({ id: Math.random().toString(36).slice(2, 10), text: d.text, done: false }) });
  renderView(false); const inp = $(`form[data-form="cl-add"][data-id="${t.id}"] input`); if (inp) inp.focus();
};
F['task-rename'] = async (f, d, close) => { await saveItem('tasks', f.dataset.id, { title: d.title }); close(); };
F['cost-add'] = async (f, d) => {
  const j = S.jobs[f.dataset.id];
  await saveItem('jobs', j.id, { costs: (j.costs || []).concat({ id: Math.random().toString(36).slice(2, 10), label: d.label, amount: d.amount }) });
  renderView(false); const inp = $('form[data-form="cost-add"] input'); if (inp) inp.focus();
};

// ============================================================ CALENDAR
// Items from events plus job start dates and deadlines, between two dates (inclusive).
function calendarItems(from, to) {
  const out = [];
  for (const e of Object.values(S.events)) {
    const end = e.endDate && e.endDate > e.date ? e.endDate : e.date;
    if (end < from || e.date > to) continue;
    for (let d = e.date > from ? e.date : from; d <= end && d <= to; d = dstr(new Date(parseD(d).getTime() + 864e5 + 3600e3))) {
      out.push({ kind: 'event', id: e.id, date: d, time: e.allDay ? '' : e.start, title: e.title, sub: [S.jobs[e.jobId] && S.jobs[e.jobId].title, S.projects[e.projectId] && S.projects[e.projectId].name, e.location].filter(Boolean).join(' · ') || (e.allDay ? 'All day' : `${e.start}${e.end ? '–' + e.end : ''}`), link: '#/calendar/' + d, ev: e });
    }
  }
  for (const j of Object.values(S.jobs)) {
    if (j.status === 'done') continue;
    if (j.start && j.start >= from && j.start <= to) out.push({ kind: 'start', id: j.id, date: j.start, title: 'Starts: ' + j.title, sub: j.ref, link: '#/job/' + j.id });
    if (j.deadline && j.deadline >= from && j.deadline <= to) out.push({ kind: 'due', id: j.id, date: j.deadline, title: 'Due: ' + j.title, sub: j.ref, link: '#/job/' + j.id });
  }
  return out.sort((a, b) => (a.date + (a.time || '00:00')).localeCompare(b.date + (b.time || '00:00')));
}
function calChip(it) {
  if (it.kind === 'event') return `<button class="cal-ev" data-act="event-open" data-id="${it.id}" style="${it.ev.color ? `background:color-mix(in srgb, ${it.ev.color} 18%, var(--surface));color:${it.ev.color}` : ''}">${it.time ? `<span class="t">${esc(it.time)}</span>` : ''}${esc(it.title)}</button>`;
  return `<a class="cal-ev ${it.kind === 'due' ? 'due' : 'job'}" href="${it.link}">${esc(it.title)}</a>`;
}
const monday = (d) => { const x = new Date(d); const k = (x.getDay() + 6) % 7; x.setDate(x.getDate() - k); return x; };
VIEWS.calendar = {
  render(day) {
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) S.calDate = day;
    const view = S.calView; const cur = parseD(S.calDate);
    let title, body;
    if (view === 'month') {
      title = cur.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      const first = new Date(cur.getFullYear(), cur.getMonth(), 1); const start = monday(first);
      const cells = []; for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); cells.push(d); }
      const lastRow = cells[35].getMonth() !== cur.getMonth() ? 35 : 42;
      const items = calendarItems(dstr(cells[0]), dstr(cells[lastRow - 1]));
      body = `<div class="cal-month" role="grid">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="cal-dow" role="columnheader">${d}</div>`).join('')}
        ${cells.slice(0, lastRow).map((d) => { const ds = dstr(d); const its = items.filter((x) => x.date === ds); return `<div class="cal-day ${d.getMonth() !== cur.getMonth() ? 'other' : ''} ${ds === todayStr() ? 'today' : ''}" role="gridcell" data-act="cal-day" data-d="${ds}" tabindex="0" aria-label="${esc(d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))}${its.length ? ', ' + plural(its.length, 'item') : ''}">
          <span class="n">${d.getDate()}</span>${its.slice(0, 3).map(calChip).join('')}${its.length > 3 ? `<span class="cal-more">+${its.length - 3} more</span>` : ''}</div>`; }).join('')}</div>`;
    } else if (view === 'week') {
      const st = monday(cur); const en = new Date(st); en.setDate(st.getDate() + 6);
      title = `${st.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${en.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
      const items = calendarItems(dstr(st), dstr(en));
      body = `<div class="cal-week">${[0, 1, 2, 3, 4, 5, 6].map((i) => { const d = new Date(st); d.setDate(st.getDate() + i); const ds = dstr(d); const its = items.filter((x) => x.date === ds);
        return `<div class="cal-col ${ds === todayStr() ? 'today' : ''}"><button class="btn ghost sm" style="justify-content:flex-start;padding:0 4px" data-act="cal-goday" data-d="${ds}"><b>${d.toLocaleDateString('en-GB', { weekday: 'short' })}</b>&nbsp;<span class="muted">${d.getDate()}</span></button>${its.map(calChip).join('') || '<span class="tiny muted" style="padding:0 4px">—</span>'}<button class="btn ghost sm" data-act="new-event" data-date="${ds}" aria-label="Add event on ${ds}" style="margin-top:auto">${ic('plus')}</button></div>`; }).join('')}</div>`;
    } else {
      title = cur.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const its = calendarItems(S.calDate, S.calDate);
      body = `<div class="card flush">${its.length ? `<div class="list agenda">${its.map((it) => it.kind === 'event'
        ? `<button class="item" data-act="event-open" data-id="${it.id}"><span class="when">${esc(it.time || 'All day')}</span><span class="grow"><span class="bold" style="display:block">${esc(it.title)}</span><span class="tiny muted">${esc(it.sub)}</span></span>${avatarStack(it.ev.participants, 4)}</button>`
        : `<a class="item" href="${it.link}"><span class="when">${it.kind === 'due' ? 'Due' : 'Starts'}</span><span class="grow"><span class="bold" style="display:block">${esc(it.title.replace(/^(Due|Starts): /, ''))}</span><span class="tiny muted">${esc(it.sub)}</span></span></a>`).join('')}</div>`
        : `<div class="empty">${ic('cal')}<h3>Nothing on this day</h3><button class="btn primary" data-act="new-event" data-date="${S.calDate}">${ic('plus')}Add an event</button></div>`}</div>`;
    }
    return `<div class="page-head"><div><h1>Calendar</h1><div class="sub">Shared with everyone in ${esc(S.company.name)}. Job start dates and deadlines show automatically.</div></div><button class="btn primary" data-act="new-event" data-date="${S.calDate}">${ic('plus')}<span>New event</span></button></div>
      <div class="cal-head"><div class="row tight"><button class="btn sm icon" data-act="cal-step" data-d="-1" aria-label="Previous">${ic('left')}</button><button class="btn sm" data-act="cal-today">Today</button><button class="btn sm icon" data-act="cal-step" data-d="1" aria-label="Next">${ic('right')}</button></div>
        <h2 class="grow" aria-live="polite">${esc(title)}</h2>
        <div class="seg">${[['month', 'Month'], ['week', 'Week'], ['day', 'Day']].map(([k, l]) => `<button class="${view === k ? 'on' : ''}" data-act="cal-view" data-v="${k}">${l}</button>`).join('')}</div></div>
      ${body}
      <div class="legend"><span><i style="background:var(--blue-soft);border:1px solid var(--blue)"></i>Event</span><span><i style="background:var(--ok-soft);border:1px solid var(--ok)"></i>Job starts</span><span><i style="background:var(--amber-soft);border:1px solid var(--amber)"></i>Job due</span></div>`;
  },
};
A['cal-view'] = (el) => { S.calView = el.dataset.v; store.set('cd_calView', S.calView); renderView(false); };
A['cal-today'] = () => { S.calDate = todayStr(); location.hash = '#/calendar/' + S.calDate; renderView(false); };
A['cal-step'] = (el) => {
  const d = parseD(S.calDate); const n = Number(el.dataset.d);
  if (S.calView === 'month') { d.setDate(1); d.setMonth(d.getMonth() + n); } else d.setDate(d.getDate() + (S.calView === 'week' ? 7 : 1) * n);
  S.calDate = dstr(d); history.replaceState(null, '', '#/calendar/' + S.calDate); current.key = location.hash; renderView(false);
};
A['cal-day'] = (el, e) => { if (e.target.closest('.cal-ev')) return; S.calDate = el.dataset.d; S.calView = 'day'; store.set('cd_calView', 'day'); history.replaceState(null, '', '#/calendar/' + S.calDate); current.key = location.hash; renderView(false); };
A['cal-goday'] = (el) => { S.calDate = el.dataset.d; S.calView = 'day'; renderView(false); };
document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.cal-day')) { e.preventDefault(); A['cal-day'](e.target, e); } });

function eventSheet(ev, preset = {}) {
  const e = ev || Object.assign({ title: '', date: S.calDate || todayStr(), endDate: '', allDay: true, start: '09:00', end: '10:00', description: '', location: '', participants: [], visibility: 'all', jobId: '', projectId: '', color: '' }, preset);
  if (preset.jobId && !ev) { const j = S.jobs[preset.jobId]; if (j) { e.title = e.title || j.title; e.location = j.address || ''; e.participants = (j.assignees || []).slice(); e.date = j.start || e.date; e.projectId = j.projectId || ''; } }
  const jobs = Object.values(S.jobs).filter((j) => j.status !== 'done' || j.id === e.jobId).sort((a, b) => a.title.localeCompare(b.title));
  const projs = Object.values(S.projects).filter((p) => !p.archived || p.id === e.projectId).sort((a, b) => a.name.localeCompare(b.name));
  sheet(`${sheetHead(ev ? 'Edit event' : 'New event')}
    <form class="stack" data-form="event" data-id="${ev ? ev.id : ''}">
      <label class="field"><span>What</span><input name="title" value="${esc(e.title)}" placeholder="e.g. Site survey, client meeting, delivery" required maxlength="150"></label>
      <div class="form-grid">
        <label class="field"><span>Date</span><input type="date" name="date" value="${esc(e.date)}" required></label>
        <label class="field"><span>Ends (optional)</span><input type="date" name="endDate" value="${esc(e.endDate)}"></label>
        <label class="row full" style="gap:8px"><span class="switch"><input type="checkbox" name="allDay" ${e.allDay ? 'checked' : ''} data-change="ev-allday"><i></i></span><span>All day</span></label>
        <label class="field ${e.allDay ? 'hidden' : ''}" data-time><span>Start time</span><input type="time" name="start" value="${esc(e.start || '09:00')}"></label>
        <label class="field ${e.allDay ? 'hidden' : ''}" data-time><span>End time</span><input type="time" name="end" value="${esc(e.end || '')}"></label>
        <label class="field"><span>Job</span><select name="jobId"><option value="">None</option>${jobs.map((j) => `<option value="${j.id}" ${j.id === e.jobId ? 'selected' : ''}>${esc(j.ref + ' ' + j.title)}</option>`).join('')}</select></label>
        <label class="field"><span>Project</span><select name="projectId"><option value="">None</option>${projs.map((p) => `<option value="${p.id}" ${p.id === e.projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <label class="field full"><span>Where</span><input name="location" value="${esc(e.location)}" placeholder="Address or meeting link"></label>
        <label class="field full"><span>Details</span><textarea name="description" placeholder="Anything people should know">${esc(e.description)}</textarea></label>
      </div>
      <div class="field"><span>Who’s involved <span class="hint">· they’ll be notified, and reminded before it starts</span></span>${peoplePicker(e.participants || [])}</div>
      <label class="row" style="gap:8px"><span class="switch"><input type="checkbox" name="private" ${e.visibility === 'selected' ? 'checked' : ''}><i></i></span><span>Only show this to the people involved (and admins)</span></label>
      <div class="err-msg" data-err></div>
      <div class="sheet-foot">${ev && (isAdmin() || ev.createdBy === S.user.id) ? `<button type="button" class="btn danger" data-act="event-del" data-id="${ev.id}" style="margin-right:auto">${ic('trash')}Delete</button>` : ''}<button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${ev ? 'Save' : 'Add to calendar'}</button></div>
    </form>`);
}
C['ev-allday'] = (el) => $$('[data-time]', el.closest('form')).forEach((x) => x.classList.toggle('hidden', el.checked));
F.event = async (f, d, close) => {
  const allDay = !!d.allDay;
  if (d.endDate && d.endDate < d.date) throw new Error('The end date is before the start date');
  if (!allDay && d.end && d.end <= d.start && (!d.endDate || d.endDate === d.date)) throw new Error('The end time is before the start time');
  const startsAt = new Date(d.date + 'T' + (allDay ? '00:00' : (d.start || '00:00')) + ':00').getTime();
  const body = { title: d.title, date: d.date, endDate: d.endDate, allDay, start: allDay ? '' : d.start, end: allDay ? '' : d.end, startsAt, description: d.description, location: d.location,
    participants: picked(f), visibility: d.private ? 'selected' : 'all', jobId: d.jobId, projectId: d.projectId };
  await saveItem('events', f.dataset.id || null, body);
  close(); toast(f.dataset.id ? 'Event updated' : 'Added to the calendar');
};
A['new-event'] = (el) => eventSheet(null, { date: el.dataset.date || S.calDate || todayStr(), jobId: el.dataset.job || '', projectId: el.dataset.project || '' });
A['event-open'] = (el) => {
  const e = S.events[el.dataset.id]; if (!e) return;
  const canEdit = isAdmin() || e.createdBy === S.user.id;
  if (canEdit) return eventSheet(e);
  sheet(`${sheetHead(e.title)}<dl class="kv"><dt>When</dt><dd>${esc(fmtDate(e.date, true))}${e.endDate && e.endDate !== e.date ? ' – ' + esc(fmtDate(e.endDate, true)) : ''}${e.allDay ? ' · All day' : ` · ${esc(e.start)}${e.end ? '–' + esc(e.end) : ''}`}</dd>
    ${e.location ? `<dt>Where</dt><dd>${linkify(e.location)}</dd>` : ''}${S.jobs[e.jobId] ? `<dt>Job</dt><dd><a href="#/job/${e.jobId}" data-close>${esc(S.jobs[e.jobId].title)}</a></dd>` : ''}
    ${S.projects[e.projectId] ? `<dt>Project</dt><dd><a href="#/project/${e.projectId}" data-close>${esc(S.projects[e.projectId].name)}</a></dd>` : ''}
    <dt>People</dt><dd>${(e.participants || []).length ? e.participants.map((id) => personName(id)).join(', ') : '<span class="muted">Everyone</span>'}</dd>
    <dt>Added by</dt><dd>${personName(e.createdBy)}</dd></dl>${e.description ? `<p class="pre" style="margin-top:12px">${linkify(e.description)}</p>` : ''}
    <div class="sheet-foot"><button class="btn" data-close>Close</button></div>`);
};
A['event-del'] = async (el) => { const e = S.events[el.dataset.id]; closeSheets(); if (await confirmBox('Delete this event?', `“${e.title}” will be removed from everyone’s calendar.`)) { if (await deleteItem('events', e.id)) toast('Event deleted'); } };
