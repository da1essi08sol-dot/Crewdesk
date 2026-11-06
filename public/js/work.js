/* Projects (the bigger thing), made up of tasks (the smaller things): plan against actual, a timeline of who did what,
   photos and an optional chat. Then the shared calendar. */
'use strict';

const favFirst = (kind) => (a, b) => { const fa = S.favs[kind] || []; const ia = fa.indexOf(a.id), ib = fa.indexOf(b.id); return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib); };
function dirLink(p) {
  const dest = p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : p.address;
  return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest || '');
}
const workingOn = (pid) => Object.values(S.entries).filter((e) => !e.end && e.projectId === pid && S.members[e.userId]);
// Planned time against time logged, as a bar with a short verdict.
function planHtml(plan, actual, opts = {}) {
  if (!plan) return `${actual ? `<div class="small"><b>${esc(fmtDur(actual))}</b> <span class="muted">logged</span></div>` : ''}${opts.noPlanHint ? `<div class="tiny muted" style="margin-top:4px">${esc(opts.noPlanHint)}</div>` : ''}`;
  const pct = Math.min(100, (actual / plan) * 100); const over = actual > plan;
  const verdict = over ? `${fmtDur(actual - plan)} over plan` : actual >= plan * 0.85 ? `${fmtDur(plan - actual)} left — nearly there` : `${fmtDur(plan - actual)} left`;
  return `<div class="plan ${over ? 'over' : actual >= plan * 0.85 ? 'near' : ''}">
    <div class="row between small"><span><b>${esc(fmtDur(actual))}</b> <span class="muted">of ${esc(fmtDur(plan))} planned</span></span><span class="verdict">${esc(verdict)}</span></div>
    <div class="progress" role="progressbar" aria-valuenow="${Math.round(actual)}" aria-valuemax="${plan}" aria-label="Time logged against plan"><i style="width:${pct}%"></i></div></div>`;
}

// ============================================================ PROJECTS
function projectCard(p) {
  const ts = projectTasks(p.id); const done = ts.filter((t) => t.done).length;
  const now = workingOn(p.id).map((e) => e.userId);
  const plan = projectPlanMins(p); const act = plan ? projectPlanActual(p) : projectMins(p.id);
  const people = [...new Set(ts.flatMap((t) => t.assignees || []).concat(p.visibility === 'selected' ? [p.createdBy, ...(p.members || [])] : []))];
  return `<a class="projcard ${p.archived ? 'archived' : ''}${projFill(p)}" href="#/project/${p.id}">
    <div class="row between top"><div class="grow" style="min-width:0">${p.ref ? `<span class="ref">${esc(p.ref)}</span>` : ''}<h3>${esc(p.name)}</h3></div>${starBtn('projects', p.id)}</div>
    ${p.address || S.clients[p.clientId] ? `<div class="small muted ellipsis">${esc([S.clients[p.clientId] && S.clients[p.clientId].name, p.address].filter(Boolean).join(' · '))}</div>` : ''}
    <div class="row wrap tight">${lockPill(p)}${p.archived ? '<span class="pill">Archived</span>' : ''}${now.length ? `<span class="pill live">${plural(now.length, 'person', 'people')} working now</span>` : ''}${p.chat ? `<span class="pill">${icSize('chat', 12)}Chat</span>` : ''}</div>
    ${plan ? planHtml(plan, act) : ''}
    <div class="foot"><span>${ts.length ? `${done} of ${plural(ts.length, 'task')} done` : 'No tasks yet'}${!plan && act ? ' · ' + esc(fmtDur(act)) + ' logged' : ''}</span>${avatarStack(now.length ? now : people, 5)}</div></a>`;
}
VIEWS.projects = {
  render() {
    const all = Object.values(S.projects);
    const f = S.projFilter; const q = S.projSearch.trim().toLowerCase();
    let ps = all.filter((p) => (f === 'archived' ? p.archived : f === 'all' ? true : !p.archived));
    if (q) ps = ps.filter((p) => [p.name, p.ref, p.address, p.description, (S.clients[p.clientId] || {}).name].join(' ').toLowerCase().includes(q));
    ps.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
    const starred = ps.filter((p) => isFav('projects', p.id)).sort(favFirst('projects'));
    const rest = ps.filter((p) => !isFav('projects', p.id));
    return `<div class="page-head"><div><h1>Projects</h1><div class="sub">Each project is made of tasks. Log time against them from Home.</div></div>
        ${canCreateProjects() ? `<button class="btn primary" data-act="new-project">${ic('plus')}<span>New project</span></button>` : ''}</div>
      <div class="row wrap" style="margin-bottom:16px">
        <div class="seg">${[['active', 'Active'], ['archived', 'Archived'], ['all', 'All']].map(([k, l]) => `<button class="${f === k ? 'on' : ''}" data-act="proj-filter" data-f="${k}">${l} <span class="muted">${all.filter((p) => (k === 'archived' ? p.archived : k === 'all' ? true : !p.archived)).length}</span></button>`).join('')}</div>
        <label class="search grow" style="min-width:200px;max-width:360px"><input class="input" type="search" placeholder="Search name, job number, address" value="${esc(S.projSearch)}" data-input="proj-search" aria-label="Search projects">${ic('search')}</label>
      </div>
      <div id="projlist">${this.list(starred, rest, all.length)}</div>`;
  },
  list(starred, rest, total) {
    if (!starred.length && !rest.length) return `<div class="card empty">${ic('folder')}<h3>${total ? 'No projects match' : 'No projects yet'}</h3><div class="small">${total ? 'Try another filter or search.' : 'A project is one piece of work — a survey, a site, a client job — broken into tasks.'}</div>${!total && canCreateProjects() ? `<button class="btn primary" data-act="new-project">${ic('plus')}New project</button>` : ''}</div>`;
    return `${starred.length ? `<div class="section-head"><h2 class="row tight">${icSize('star', 17, 'color:#d29b0a;fill:currentColor')}Starred</h2></div><div class="cards" style="margin-bottom:24px">${starred.map(projectCard).join('')}</div>` : ''}
      ${rest.length ? `${starred.length ? '<div class="section-head"><h2>Everything else</h2></div>' : ''}<div class="cards">${rest.map(projectCard).join('')}</div>` : ''}`;
  },
};
A['proj-filter'] = (el) => { S.projFilter = el.dataset.f; renderView(false); };
I['proj-search'] = (el) => { S.projSearch = el.value; const box = $('#projlist'); if (!box) return; const tmp = document.createElement('div'); tmp.innerHTML = VIEWS.projects.render(); box.innerHTML = tmp.querySelector('#projlist').innerHTML; };

// All of a project's time, however old (the app only loads recent time to start with).
const projLoaded = {};
async function ensureProject(pid) {
  if (projLoaded[pid]) return;
  projLoaded[pid] = 'loading';
  try { const r = await capi('GET', `/entries?project=${encodeURIComponent(pid)}`); for (const e of r.items) S.entries[e.id] = e; projLoaded[pid] = true; scheduleRender(); }
  catch (_) { delete projLoaded[pid]; }
}
const canEditProject = (p) => isAdmin() || p.createdBy === S.user.id || p.visibility !== 'selected' || (p.members || []).includes(S.user.id);

VIEWS.project = {
  render(id, tab = 'tasks') {
    const p = S.projects[id];
    if (!p) return `<a class="back" href="#/projects">${ic('back')}Projects</a><div class="card empty"><h3>Project not found</h3><div class="small">It may have been deleted, or it isn’t shared with you.</div></div>`;
    if (tab === 'chat' && !p.chat) tab = 'tasks';
    return `<div id="proj-top">${this.top(p, tab)}</div><div id="proj-tab" style="margin-top:18px">${this.tab(p, tab)}</div>`;
  },
  mount(id, tab) { ensureProject(id); if (tab === 'chat') mountChat('project:' + id); },
  update(id, tab = 'tasks') {
    const p = S.projects[id];
    if (!p || !$('#proj-top')) return renderView(false);
    const sx = ($('#proj-top .tabs') || {}).scrollLeft || 0;
    const top = this.top(p, tab);
    if ($('#proj-top')._html !== top) { $('#proj-top').innerHTML = top; $('#proj-top')._html = top; if ($('#proj-top .tabs')) $('#proj-top .tabs').scrollLeft = sx; placeTabInk(null); }
    const box = $('#proj-tab');
    if (tab === 'chat') { refreshPanes('project:' + id); return; }
    if (box.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    const html = this.tab(p, tab);
    if (box._html !== html) { box.innerHTML = html; box._html = html; }
  },
  top(p, tab) {
    const nPh = Object.values(S.photos).filter((x) => x.projectId === p.id).length;
    const unread = S.unread['project:' + p.id] || 0;
    const ts = projectTasks(p.id);
    const tabs = [['tasks', `Tasks${ts.length ? ` <span class="muted">${ts.filter((t) => t.done).length}/${ts.length}</span>` : ''}`], ['timeline', 'Timeline'], ['photos', `Photos${nPh ? ` <span class="muted">${nPh}</span>` : ''}`]];
    if (p.chat) tabs.push(['chat', `Chat${unread ? ` <span class="count">${unread}</span>` : ''}`]);
    const canEdit = canEditProject(p); const canDel = isAdmin() || p.createdBy === S.user.id;
    const cur = myRunning(); const here = cur && cur.projectId === p.id;
    return `<a class="back" href="#/projects">${ic('back')}Projects</a>
      <div class="page-head" style="margin-bottom:10px"><div class="grow" style="min-width:0">
        <div class="row tight">${starBtn('projects', p.id)}${p.ref ? `<span class="mono muted">${esc(p.ref)}</span>` : ''}</div><h1>${esc(p.name)}</h1>
        <div class="row wrap tight" style="margin-top:6px">${lockPill(p)}${p.archived ? '<span class="pill">Archived</span>' : ''}${S.clients[p.clientId] ? `<a class="pill" href="#/client/${p.clientId}" style="text-decoration:none">${ic('contacts')}${esc(S.clients[p.clientId].name)}</a>` : ''}
          ${p.due ? dueHtml(p.due) : ''}</div></div>
        <div class="row tight wrap">
          ${p.archived ? '' : here ? `<a class="btn danger" href="#/home">${ic('stop')}<span>Timer running</span></a>` : `<button class="btn primary" data-act="work-here" data-id="${p.id}">${ic('play')}<span>Work on this</span></button>`}
          ${canEdit ? `<button class="btn sm" data-act="edit-project" data-id="${p.id}">${ic('edit')}<span>Edit</span></button>` : ''}
          <button class="btn sm icon" data-act="project-menu" data-id="${p.id}" aria-label="More for this project" aria-haspopup="menu">${ic('more')}</button>
          ${canDel ? '' : ''}</div></div>
      ${p.archived ? `<div class="info-box" style="margin-bottom:12px">This project is archived. Its tasks and time are kept — restore it to work on it again.</div>` : ''}
      <nav class="tabs" aria-label="Project sections">${tabs.map(([k, l]) => `<a class="tab ${tab === k ? 'on' : ''}" href="#/project/${p.id}/${k}" ${tab === k ? 'aria-current="page"' : ''}>${l}</a>`).join('')}
        ${!p.chat && canEdit ? `<button class="tab tab-add" data-act="open-chat" data-id="${p.id}">${icSize('plus', 14)}Open a chat</button>` : ''}</nav>`;
  },
  tab(p, tab) {
    if (tab === 'timeline') return projectTimeline(p);
    if (tab === 'photos') return `<div class="section-head"><div><h2>Photos</h2><div class="small muted">${isTouch() ? 'Take photos on site or pick from your camera roll.' : 'Click to add, or drag photos onto this page.'}</div></div>
      <button class="btn primary" data-act="photos-add" data-job="${p.id}">${ic('camera')}<span>Add photos</span></button></div>
      <div id="photo-gallery" data-job="${p.id}" data-drop="${p.id}">${photoGalleryInner(p.id)}</div>`;
    if (tab === 'chat') return chatPane('project:' + p.id, true);
    return projectTasksTab(p);
  },
};
function projectTasksTab(p) {
  const ts = projectTasks(p.id); const open = ts.filter((t) => !t.done), done = ts.filter((t) => t.done);
  const plan = projectPlanMins(p); const act = projectPlanActual(p); const all = projectMins(p.id);
  const now = workingOn(p.id);
  const today = todayStr();
  const todayMins = Object.values(S.entries).filter((e) => e.projectId === p.id && entryDay(e) === today && cat(e.category).paid).reduce((a, e) => a + entryMins(e), 0);
  const byPerson = {}; for (const e of Object.values(S.entries)) if (e.projectId === p.id && cat(e.category).paid) byPerson[e.userId] = (byPerson[e.userId] || 0) + entryMins(e);
  const crew = Object.entries(byPerson).sort((a, b) => b[1] - a[1]);
  const evs = Object.values(S.events).filter((e) => e.projectId === p.id && e.date >= today).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).slice(0, 4);
  return `<div class="grid two">
    <div class="stack loose">
      <div class="card"><div class="section-head" style="margin-bottom:8px"><h3>Plan and progress</h3><span class="tiny muted">${p.plannedHours ? 'Whole project' : plan ? 'Tasks with planned time' : ''}</span></div>
        ${planHtml(plan, plan ? act : all, { noPlanHint: 'Add planned time to tasks (or the project) to see if you’re on track.' })}
        <div class="row wrap small muted" style="gap:14px;margin-top:10px"><span>${done.length} of ${plural(ts.length, 'task')} done</span><span>Today: ${esc(fmtDur(todayMins))}</span>${plan && !p.plannedHours ? `<span>All time: ${esc(fmtDur(all))}</span>` : ''}${p.start ? `<span>Started ${esc(fmtDate(p.start))}</span>` : ''}</div></div>
      <div><div class="section-head"><h2>Tasks</h2></div>
        ${p.archived ? '' : `<form class="task-add" data-form="task-add" data-project="${p.id}"><input class="input" name="title" placeholder="Add a task… e.g. Control survey" required maxlength="200" aria-label="New task">
          <select class="input" name="plan" aria-label="Planned time"><option value="">Time?</option>${PLAN_OPTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
          <button class="btn primary">${ic('plus')}<span>Add</span></button></form>`}
        <div class="card flush" style="margin-top:10px">${open.length || done.length ? open.concat(done).map(taskRow).join('') : `<div class="empty">${ic('list')}<h3>No tasks yet</h3><div class="small">Break the project into tasks, with how long each should take. Then press ▶ on a task to start logging time.</div></div>`}</div></div>
    </div>
    <div class="stack">
      <div class="card"><h3 style="margin-bottom:8px">Working on it now</h3>${now.length ? `<div class="stack tight">${now.map((e) => `<div class="row">${avatar(member(e.userId), 'sm', { dot: true })}<div class="grow" style="min-width:0"><b class="ellipsis" style="display:block">${esc(member(e.userId).name)}</b><span class="tiny muted ellipsis" style="display:block">${esc(cat(e.category).label)}${e.taskId && S.tasks[e.taskId] ? ' · ' + esc(S.tasks[e.taskId].title) : ''} · since ${clock(e.start)}</span></div><span class="mono small" data-since="${e.start}">${fmtElapsed(Date.now() - e.start)}</span></div>`).join('')}</div>` : '<div class="small muted">Nobody right now.</div>'}</div>
      <div class="card"><div class="section-head" style="margin-bottom:8px"><h3>Who’s worked on it</h3><a class="small" href="#/project/${p.id}/timeline">Timeline</a></div>
        ${crew.length ? `<div class="stack tight">${crew.map(([id, m]) => `<div class="row">${avatar(member(id), 'xs')}<span class="grow ellipsis">${personName(id)}</span><span class="mono small">${esc(fmtDur(m, true))}</span></div>`).join('')}</div>` : '<div class="small muted">No time logged yet.</div>'}
        <a class="btn sm block" style="margin-top:12px" href="/api/c/${S.cid}/projects/${p.id}/timesheet" download="${esc(projFile(p))}">${ic('download')}Project timesheet (Excel)</a></div>
      <div class="card"><dl class="kv">
        <dt>Site</dt><dd>${p.address ? esc(p.address) : p.lat != null ? '<span class="muted">Pinned on map</span>' : '<span class="muted">No address</span>'}${p.address || p.lat != null ? `<div style="margin-top:6px"><a class="btn sm" target="_blank" rel="noopener noreferrer" href="${dirLink(p)}">${ic('nav')}Directions</a></div>` : ''}</dd>
        <dt>Dates</dt><dd>${p.start ? esc(fmtDate(p.start, true)) : '—'} → ${p.due ? esc(fmtDate(p.due, true)) : '—'}</dd>
        <dt>Visible to</dt><dd>${p.visibility === 'selected' ? `<span class="row wrap tight">${avatarStack([...new Set([p.createdBy, ...(p.members || [])])], 8)}<span class="small muted">+ admins</span></span>` : '<span class="muted">Everyone in the company</span>'}</dd>
        <dt>Started by</dt><dd>${personName(p.createdBy)} <span class="muted small">· ${timeAgo(p.createdAt)}</span></dd></dl>
        ${p.description ? `<div class="pre small" style="margin-top:12px">${linkify(p.description)}</div>` : ''}</div>
      <div class="card"><div class="section-head"><h3>Coming up</h3><button class="btn sm" data-act="new-event" data-project="${p.id}">${ic('plus')}Event</button></div>
        ${evs.length ? `<div class="stack tight">${evs.map((e) => `<a href="#/calendar/${e.date}" class="row small" style="text-decoration:none;color:inherit"><span class="pill">${esc(fmtDate(e.date, true))}${e.allDay ? '' : ' ' + esc(e.start)}</span><span class="ellipsis">${esc(e.title)}</span></a>`).join('')}</div>` : '<div class="small muted">No upcoming events.</div>'}</div>
    </div></div>`;
}
const PLAN_OPTS = [[15, '15 min'], [30, '30 min'], [60, '1 hour'], [90, '1½ hours'], [120, '2 hours'], [180, '3 hours'], [240, '4 hours'], [360, '6 hours'], [480, '1 day'], [960, '2 days'], [1440, '3 days'], [2400, '1 week']];
function taskRow(t) {
  const act = taskMins(t.id); const mine = myRunning();
  const running = Object.values(S.entries).filter((e) => !e.end && e.taskId === t.id);
  const me = mine && mine.taskId === t.id;
  const over = t.planMins && act > t.planMins;
  return `<div class="trow ${t.done ? 'done' : ''}" data-task="${t.id}">
    <button class="check round ${t.done ? 'on' : ''}" data-act="task-toggle" data-id="${t.id}" aria-pressed="${t.done}" aria-label="${t.done ? 'Mark not done' : 'Mark done'}: ${esc(t.title)}">${ic('check')}</button>
    <button class="task-main" data-act="task-open" data-id="${t.id}"><div class="t ${t.done ? 'struck' : ''}">${esc(t.title)}</div>
      <div class="row wrap small muted" style="gap:10px;margin-top:3px">${avatarStack(t.assignees, 3)}${t.date ? `<span class="row tight">${icSize('cal', 13)}${esc(fmtDate(t.date, true))}</span>` : ''}
        ${t.planMins || act ? `<span class="tplan ${over ? 'over' : ''}">${icSize('clock', 13)}${esc(fmtDur(act, true))}${t.planMins ? ' / ' + esc(fmtDur(t.planMins, true)) : ''}</span>` : ''}
        ${running.length ? `<span class="live-dot">${running.map((e) => esc(firstName(e.userId))).join(', ')} on it</span>` : ''}${t.notes ? '<span>Notes</span>' : ''}</div>
      ${t.planMins ? `<div class="progress thin ${over ? 'over' : ''}"><i style="width:${Math.min(100, (act / t.planMins) * 100)}%"></i></div>` : ''}</button>
    ${t.done ? '' : me ? `<button class="playbtn on" data-act="timer" aria-label="Stop the timer on ${esc(t.title)}">${ic('stop')}</button>` : `<button class="playbtn" data-act="task-start" data-id="${t.id}" aria-label="Start the timer on ${esc(t.title)}" title="Start the timer on this task">${ic('play')}</button>`}
  </div>`;
}
// The project's timeline: each day, who worked on it, when, on what.
function projectTimeline(p) {
  const list = Object.values(S.entries).filter((e) => e.projectId === p.id).sort((a, b) => b.start - a.start);
  if (!list.length) return `<div class="card empty">${ic('clock')}<h3>${projLoaded[p.id] === true ? 'No time logged yet' : 'Loading…'}</h3><div class="small">When people start the timer on this project, their time shows here day by day.</div></div>`;
  const byDay = {}; for (const e of list) (byDay[entryDay(e)] = byDay[entryDay(e)] || []).push(e);
  const total = list.filter((e) => cat(e.category).paid).reduce((a, e) => a + entryMins(e), 0);
  const days = Object.keys(byDay).sort().reverse();
  return `<div class="row wrap between" style="margin-bottom:12px"><div class="small muted">${plural(days.length, 'day')} · ${esc(fmtDur(total))} logged · ${plural(new Set(list.map((e) => e.userId)).size, 'person', 'people')}</div>
      <a class="btn sm" href="/api/c/${S.cid}/projects/${p.id}/timesheet" download="${esc(projFile(p))}">${ic('download')}Download timesheet</a></div>
    <div class="stack">${days.map((ds) => {
      const es = byDay[ds]; const people = [...new Set(es.map((e) => e.userId))];
      const mins = es.filter((e) => cat(e.category).paid).reduce((a, e) => a + entryMins(e), 0);
      return `<div class="card tl-day"><div class="row between" style="margin-bottom:10px"><h3>${esc(ds === todayStr() ? 'Today' : fmtDate(ds, true))}</h3><span class="small muted">${esc(fmtDur(mins))} · ${plural(people.length, 'person', 'people')}</span></div>
        ${people.map((uid) => { const mine = es.filter((e) => e.userId === uid).sort((a, b) => a.start - b.start); return `<div class="tl-person">
          <div class="row">${avatar(member(uid), 'xs')}<b class="grow ellipsis small">${personName(uid)}</b><span class="mono small">${esc(fmtDur(mine.filter((e) => cat(e.category).paid).reduce((a, e) => a + entryMins(e), 0), true))}</span></div>
          ${dayBar(mine)}
          <ul class="tl-entries">${mine.map((e) => `<li><span class="mono">${clock(e.start)}–${e.end ? clock(e.end) : 'now'}</span><i class="cdot" style="background:${cat(e.category).color}"></i><span class="grow">${e.taskId && S.tasks[e.taskId] ? esc(S.tasks[e.taskId].title) : e.tname ? esc(e.tname) : esc(cat(e.category).label)}${e.note ? `<span class="muted"> — ${esc(e.note)}</span>` : ''}</span></li>`).join('')}</ul></div>`; }).join('')}</div>`;
    }).join('')}</div>`;
}
// A horizontal bar of one person's day, 06:00–20:00 (stretched if they worked outside it), coloured by type of work.
function dayBar(list, opts = {}) {
  if (!list.length) return `<div class="daybar empty" aria-hidden="true"></div>`;
  let lo = 6 * 60, hi = 20 * 60;
  for (const e of list) { lo = Math.min(lo, minsOfDay(e.start)); hi = Math.max(hi, minsOfDay(e.start) + entryMins(e)); }
  lo = Math.floor(lo / 60) * 60; hi = Math.min(24 * 60, Math.ceil(hi / 60) * 60); const span = hi - lo;
  const nowM = minsOfDay(Date.now());
  const ds = (opts.date || entryDay(list[0]));
  const seg = list.map((e) => { const s = minsOfDay(e.start); const w = Math.max(0.6, (entryMins(e) / span) * 100);
    return `<i style="left:${((s - lo) / span) * 100}%;width:${w}%;background:${cat(e.category).color}" title="${esc(cat(e.category).label)} ${clock(e.start)}–${e.end ? clock(e.end) : 'now'}${e.pname ? ' · ' + esc(e.pname) : ''}" class="${e.end ? '' : 'live'}"></i>`; }).join('');
  const ticks = []; for (let h = lo / 60 + 2; h < hi / 60; h += 2) ticks.push(`<b style="left:${((h * 60 - lo) / span) * 100}%">${h}</b>`);
  return `<div class="daybar" role="img" aria-label="Time worked through the day">${seg}${ds === todayStr() && nowM > lo && nowM < hi ? `<em style="left:${((nowM - lo) / span) * 100}%"></em>` : ''}<span class="ticks">${ticks.join('')}</span></div>`;
}

// ---- project sheets and actions
function projectSheet(p) {
  const v = p || { name: '', ref: '', description: '', clientId: '', color: PROJECT_COLORS[Object.keys(S.projects).length % PROJECT_COLORS.length], visibility: 'all', members: [], start: '', due: '', address: '', plannedHours: '' };
  const canAccess = !p || canManageAccess(p);
  sheet(`${sheetHead(p ? 'Edit project' : 'New project')}
    <form class="stack" data-form="project" data-id="${p ? p.id : ''}">
      <div class="form-grid">
        <label class="field full"><span>Project name</span><input name="name" value="${esc(v.name)}" placeholder="e.g. Elm Road topographic survey" required maxlength="120"></label>
        <label class="field"><span>Job number</span><input name="ref" value="${esc(v.ref)}" placeholder="e.g. 1234" maxlength="30"><span class="hint">Goes in “Job No” on timesheets</span></label>
        <label class="field"><span>Client</span><div class="row tight"><select name="clientId" class="grow"><option value="">No client</option>${Object.values(S.clients).sort((a, b) => a.name.localeCompare(b.name)).map((c) => `<option value="${c.id}" ${c.id === v.clientId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><button type="button" class="btn sm icon" data-act="quick-client" aria-label="New client">${ic('plus')}</button></div></label>
        <label class="field full"><span>Site address</span><input name="address" value="${esc(v.address)}" placeholder="Street, town, postcode" autocomplete="street-address"></label>
        <label class="field"><span>Start</span><input type="date" name="start" value="${esc(v.start)}"></label>
        <label class="field"><span>Finish by</span><input type="date" name="due" value="${esc(v.due)}"></label>
        <label class="field"><span>Planned hours (optional)</span><input type="number" name="plannedHours" min="0" step="0.5" inputmode="decimal" value="${v.plannedHours || ''}" placeholder="Leave blank to add up the tasks"></label>
        <div class="field full"><span>Colour</span><div class="color-pick" role="radiogroup" aria-label="Colour">${[''].concat(PROJECT_COLORS).map((c) => `<label class="cp-opt ${c ? '' : 'none'}" title="${c ? c : 'No colour'}"><input type="radio" name="color" value="${c}" ${c === (v.color || '') ? 'checked' : ''} class="sr-only"><span style="${c ? `background:${c};color:${inkOn(c)}` : ''}">${c ? 'Aa' : 'None'}</span></label>`).join('')}</div><span class="hint">The whole project button takes this colour. Writing switches to black or white so it’s easy to read.</span></div>
        <label class="field full"><span>Description</span><textarea name="description" placeholder="What it is, who it’s for, access, equipment…">${esc(v.description)}</textarea></label>
      </div>
      ${canAccess ? visibilityField(v.visibility, v.members || [], 'Who can see this project') : `<div class="info-box small">${ic('lock')} Only the person who started this project, or an admin, can change who sees it.</div>`}
      <div class="err-msg" data-err></div>
      <div class="sheet-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${p ? 'Save changes' : 'Create project'}</button></div>
    </form>`, swatchPicker);
}
function swatchPicker() {} // the colour picker is styled with :checked, nothing to do
F.project = async (f, d, close) => {
  const body = { name: d.name, ref: d.ref, description: d.description, clientId: d.clientId, color: d.color, start: d.start, due: d.due, address: d.address, plannedHours: Number(d.plannedHours) || 0 };
  if (d.visibility) { body.visibility = d.visibility; body.members = picked(f, 'viewers'); }
  const item = await saveItem('projects', f.dataset.id || null, body);
  close(); if (!f.dataset.id) location.hash = '#/project/' + item.id;
};
A['new-project'] = () => projectSheet(null);
A['edit-project'] = (el) => projectSheet(S.projects[el.dataset.id]);
A['project-menu'] = (el) => {
  const p = S.projects[el.dataset.id]; if (!p) return;
  const canEdit = canEditProject(p); const canDel = isAdmin() || p.createdBy === S.user.id;
  popMenu(el, `${canEdit ? `<button class="mi" data-act="archive-project" data-id="${p.id}">${ic(p.archived ? 'restore' : 'archive')}${p.archived ? 'Restore project' : 'Archive project'}</button>` : ''}
    ${canEdit ? (p.chat ? `<button class="mi" data-act="close-chat" data-id="${p.id}">${ic('chat')}Close the project chat</button>` : `<button class="mi" data-act="open-chat" data-id="${p.id}">${ic('chat')}Open a project chat</button>`) : ''}
    ${canEdit ? `<button class="mi" data-act="project-here" data-id="${p.id}">${ic('locate')}${p.lat != null ? 'Re-pin the site here' : 'Pin the site at my location'}</button>` : ''}
    <a class="mi" href="/api/c/${S.cid}/projects/${p.id}/timesheet" download="${esc(projFile(p))}">${ic('download')}Download project timesheet</a>
    <button class="mi" data-act="new-event" data-project="${p.id}">${ic('cal')}Add to calendar</button>
    ${canDel ? `<div class="sep"></div><button class="mi danger" data-act="del-project" data-id="${p.id}">${ic('trash')}Delete project</button>` : ''}`);
};
A['archive-project'] = async (el) => {
  const p = S.projects[el.dataset.id]; const to = !p.archived;
  await saveItem('projects', p.id, { archived: to });
  toast(to ? `“${p.name}” archived` : `“${p.name}” restored`, false, '', to ? { label: 'Undo', fn: () => saveItem('projects', p.id, { archived: false }) } : null);
};
A['open-chat'] = async (el) => { const p = S.projects[el.dataset.id]; await saveItem('projects', p.id, { chat: true }); location.hash = `#/project/${p.id}/chat`; };
A['close-chat'] = async (el) => {
  const p = S.projects[el.dataset.id];
  if (!(await confirmBox('Close the project chat?', 'It disappears for everyone. The messages are kept, and come back if someone opens the chat again.', 'Close chat', false))) return;
  await saveItem('projects', p.id, { chat: false }); location.hash = `#/project/${p.id}`;
};
A['project-here'] = (el) => {
  if (!window.isSecureContext || !navigator.geolocation) return toast('Location needs a secure https:// link', true);
  toast('Getting your location…');
  navigator.geolocation.getCurrentPosition((pos) => saveItem('projects', el.dataset.id, { lat: pos.coords.latitude, lng: pos.coords.longitude }).then(() => toast('Site pinned on the map')),
    () => toast('Could not get your location', true), { enableHighAccuracy: true, timeout: 20000 });
};
A['del-project'] = async (el) => {
  const p = S.projects[el.dataset.id];
  if (!(await confirmBox('Delete this project?', `“${p.name}”, its ${plural(projectTasks(p.id).length, 'task')}, photos and chat will be deleted. Time people logged on it stays on their timesheets. To keep it for reference, archive it instead.`))) return;
  if (await deleteItem('projects', p.id)) location.hash = '#/projects';
};
A['quick-client'] = (el) => {
  const sel = el.closest('form').querySelector('select[name=clientId]');
  clientSheet(null, (c) => { sel.insertAdjacentHTML('beforeend', `<option value="${c.id}">${esc(c.name)}</option>`); sel.value = c.id; });
};
// "Work on this": make it the project you're on, and open Home with the timer ready.
A['work-here'] = (el) => { setCurrentProject(el.dataset.id); location.hash = '#/home'; setTimeout(() => openStartSheet({ projectId: el.dataset.id }), 350); };

// ---- tasks
F['task-add'] = async (f, d) => {
  await saveItem('tasks', null, { projectId: f.dataset.project, title: d.title, planMins: Number(d.plan) || 0, assignees: [] });
  f.reset(); renderView(false);
  const inp = $('form[data-form="task-add"] input'); if (inp && matchMedia('(hover:hover)').matches) inp.focus();
};
A['task-toggle'] = (el) => { const t = S.tasks[el.dataset.id]; if (!t) return; el.classList.toggle('on'); saveItem('tasks', t.id, { done: !t.done }).then(() => { if (!t.done) toast(`“${t.title}” done`); }); };
A['task-start'] = (el) => { const t = S.tasks[el.dataset.id]; if (!t) return; setCurrentProject(t.projectId); startTimer({ projectId: t.projectId, taskId: t.id, category: lastCategory(t.projectId) }); };
A['task-open'] = (el) => taskSheet(S.tasks[el.dataset.id]);
function taskSheet(t) {
  if (!t) return;
  const log = Object.values(S.entries).filter((e) => e.taskId === t.id).sort((a, b) => b.start - a.start);
  const planH = t.planMins ? Math.floor(t.planMins / 60) : '', planM = t.planMins ? t.planMins % 60 : '';
  sheet(`${sheetHead('Task')}
    <form class="stack" data-form="task-edit" data-id="${t.id}">
      <label class="field"><span>Task</span><input name="title" value="${esc(t.title)}" required maxlength="200"></label>
      <div class="form-grid">
        <div class="field"><span>Planned time</span><div class="row tight"><input class="input" type="number" name="planH" min="0" max="1000" value="${planH}" placeholder="0" aria-label="Hours" style="width:90px"><span class="small muted">h</span><input class="input" type="number" name="planM" min="0" max="59" step="5" value="${planM}" placeholder="0" aria-label="Minutes" style="width:80px"><span class="small muted">min</span></div></div>
        <label class="field"><span>Planned day</span><input type="date" name="date" value="${esc(t.date)}"></label>
      </div>
      <div class="field"><span>Who’s doing it</span>${peoplePicker(t.assignees || [])}</div>
      <label class="field"><span>Notes</span><textarea name="notes" placeholder="Details, equipment, measurements…">${esc(t.notes)}</textarea></label>
      <label class="row" style="gap:8px"><span class="switch"><input type="checkbox" name="done" ${t.done ? 'checked' : ''}><i></i></span><span>Done</span></label>
      ${log.length ? `<div><div class="label" style="margin-bottom:6px">Time logged · ${esc(fmtDur(taskMins(t.id)))}${t.planMins ? ' of ' + esc(fmtDur(t.planMins)) : ''}</div><ul class="tl-entries">${log.slice(0, 12).map((e) => `<li><span class="mono">${esc(fmtDate(entryDay(e)))} ${clock(e.start)}–${e.end ? clock(e.end) : 'now'}</span><span class="grow">${esc(member(e.userId).name.split(' ')[0])}${e.note ? `<span class="muted"> — ${esc(e.note)}</span>` : ''}</span></li>`).join('')}</ul></div>` : ''}
      <div class="err-msg" data-err></div>
      <div class="sheet-foot"><button type="button" class="btn danger" data-act="task-del" data-id="${t.id}" style="margin-right:auto">${ic('trash')}Delete</button><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div>
    </form>`);
}
F['task-edit'] = async (f, d, close) => {
  await saveItem('tasks', f.dataset.id, { title: d.title, notes: d.notes, date: d.date, planMins: (Number(d.planH) || 0) * 60 + (Number(d.planM) || 0), assignees: picked(f), done: !!d.done });
  close();
};
A['task-del'] = async (el) => {
  const t = S.tasks[el.dataset.id]; closeSheets();
  if (await confirmBox('Delete this task?', `“${t.title}” will be removed. Time already logged on it stays on timesheets.`)) deleteItem('tasks', t.id);
};

// ============================================================ CALENDAR
// Items from events, plus project start and finish dates and tasks planned for a day, between two dates (inclusive).
function calendarItems(from, to) {
  const out = [];
  for (const e of Object.values(S.events)) {
    const end = e.endDate && e.endDate > e.date ? e.endDate : e.date;
    if (end < from || e.date > to) continue;
    for (let d = e.date > from ? e.date : from; d <= end && d <= to; d = dstr(new Date(parseD(d).getTime() + 864e5 + 3600e3))) {
      out.push({ kind: 'event', id: e.id, date: d, time: e.allDay ? '' : e.start, title: e.title, sub: [S.projects[e.projectId] && S.projects[e.projectId].name, e.location].filter(Boolean).join(' · ') || (e.allDay ? 'All day' : `${e.start}${e.end ? '–' + e.end : ''}`), link: '#/calendar/' + d, ev: e });
    }
  }
  for (const p of Object.values(S.projects)) {
    if (p.archived) continue;
    if (p.start && p.start >= from && p.start <= to) out.push({ kind: 'start', id: p.id, date: p.start, title: 'Starts: ' + p.name, sub: p.ref || 'Project', link: '#/project/' + p.id });
    if (p.due && p.due >= from && p.due <= to) out.push({ kind: 'due', id: p.id, date: p.due, title: 'Due: ' + p.name, sub: p.ref || 'Project', link: '#/project/' + p.id });
  }
  for (const t of Object.values(S.tasks)) {
    if (t.done || !t.date || t.date < from || t.date > to || !S.projects[t.projectId] || S.projects[t.projectId].archived) continue;
    out.push({ kind: 'task', id: t.id, date: t.date, title: t.title, sub: S.projects[t.projectId].name + (t.planMins ? ' · ' + fmtDur(t.planMins, true) : ''), link: '#/project/' + t.projectId });
  }
  return out.filter(calShow).sort((a, b) => (a.date + (a.time || '00:00')).localeCompare(b.date + (b.time || '00:00')) || (a.kind === 'event' ? -1 : 1));
}
// Calendar filters: "Just me", and which kinds of thing to show (remembered on this device).
S.calMine = store.get('cd_calMine') === '1';
S.calHide = new Set((store.get('cd_calHide') || '').split(',').filter(Boolean));
const calKind = (it) => (it.kind === 'start' || it.kind === 'due' ? 'project' : it.kind);
function calShow(it) {
  if (S.calHide && S.calHide.has(calKind(it))) return false;
  if (!S.calMine) return true;
  const me = S.user.id;
  if (it.kind === 'event') { const e = it.ev; return e.createdBy === me || !(e.participants || []).length || e.participants.includes(me); }
  if (it.kind === 'task') return (S.tasks[it.id].assignees || []).includes(me);
  const p = S.projects[it.id];
  return !!p && (p.createdBy === me || (p.members || []).includes(me) || projectTasks(p.id).some((t) => (t.assignees || []).includes(me)));
}
A['cal-mine'] = () => { S.calMine = !S.calMine; store.set('cd_calMine', S.calMine ? '1' : null); renderView(false); };
A['cal-kind'] = (el) => { const k = el.dataset.k; S.calHide.has(k) ? S.calHide.delete(k) : S.calHide.add(k); store.set('cd_calHide', [...S.calHide].join(',') || null); renderView(false); };

// Colours, as in Apple Calendar: events blue (or their own colour), project starts green, due dates orange, tasks purple.
const CAL_C = { event: '#0a84ff', start: '#30b158', due: '#ff9500', task: '#af52de' };
const itColor = (it) => (it.kind === 'event' ? (it.ev.color || CAL_C.event) : CAL_C[it.kind]);
const itTitle = (it) => (it.kind === 'event' ? it.title : it.title.replace(/^(Due|Starts): /, ''));
function calPill(it) {
  const label = (it.kind === 'due' ? 'Due: ' : it.kind === 'start' ? 'Starts: ' : '') + itTitle(it);
  const inner = `${it.time ? `<span class="t">${esc(it.time)}</span>` : ''}<span class="x">${esc(label)}</span>`;
  return it.kind === 'event'
    ? `<button class="cal-pill" style="--c:${esc(itColor(it))}" data-act="event-open" data-id="${it.id}" title="${esc(label)}">${inner}</button>`
    : `<a class="cal-pill" style="--c:${itColor(it)}" href="${it.link}" title="${esc(label)}">${inner}</a>`;
}
function agItem(it) {
  const c = esc(itColor(it));
  const tm = it.kind === 'event' ? (it.time ? `<b>${esc(it.time)}</b>${it.ev.end ? esc(it.ev.end) : ''}` : '<b>All day</b>') : it.kind === 'task' ? '<b>Task</b>Planned' : `<b>${it.kind === 'due' ? 'Due' : 'Starts'}</b>Project`;
  const body = `<span class="bar" style="--c:${c}"></span><span class="tm">${tm}</span><span class="grow" style="min-width:0"><span class="ti ellipsis" style="display:block">${esc(itTitle(it))}</span><span class="tiny muted ellipsis" style="display:block">${esc(it.sub || '')}</span></span>${it.kind === 'event' && (it.ev.participants || []).length ? avatarStack(it.ev.participants, 3) : ''}`;
  return it.kind === 'event' ? `<button class="ag-item" data-act="event-open" data-id="${it.id}">${body}</button>` : `<a class="ag-item" href="${it.link}">${body}</a>`;
}
// Schedule rows (phones, week and list views): time on the left, a tinted card with a coloured edge on the right.
function schedItem(it) {
  const c = esc(itColor(it));
  const tm = it.kind === 'event' ? (it.time ? `<b>${esc(it.time)}</b>${it.ev.end ? `<span>${esc(it.ev.end)}</span>` : ''}` : '<b>All day</b>') : it.kind === 'task' ? '<b>Task</b>' : `<b>${it.kind === 'due' ? 'Due' : 'Starts'}</b>`;
  const people = it.kind === 'event' && (it.ev.participants || []).length ? avatarStack(it.ev.participants, 3) : it.kind === 'task' && (S.tasks[it.id].assignees || []).length ? avatarStack(S.tasks[it.id].assignees, 3) : '';
  const body = `<span class="si-time">${tm}</span><span class="si-card" style="--c:${c}"><span class="si-title">${esc(itTitle(it))}</span>${it.sub ? `<span class="si-sub">${esc(it.sub)}</span>` : ''}${people ? `<span class="si-people">${people}</span>` : ''}</span>`;
  return it.kind === 'event' ? `<button class="si" data-act="event-open" data-id="${it.id}">${body}</button>` : `<a class="si" href="${it.link}">${body}</a>`;
}
function dayLabel2(ds) { return ds === todayStr() ? 'Today' : days(ds) === 1 ? 'Tomorrow' : days(ds) === -1 ? 'Yesterday' : parseD(ds).toLocaleDateString('en-GB', { weekday: 'long' }); }
function dayGroup(ds, its, opts = {}) {
  const d = parseD(ds);
  return `<section class="cg ${ds === S.calDate && opts.mark !== false ? 'sel' : ''} ${ds === todayStr() ? 'today' : ''} ${ds < todayStr() ? 'past' : ''}" data-day="${ds}">
    <div class="cg-date" aria-hidden="true"><span>${d.toLocaleDateString('en-GB', { weekday: 'short' })}</span><b>${d.getDate()}</b></div>
    <div class="cg-main"><div class="cg-head"><h3>${esc(dayLabel2(ds))} <span>${esc(d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }))}</span></h3>
      <button class="btn sm ghost icon" data-act="new-event" data-date="${ds}" aria-label="Add something on ${esc(d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))}">${ic('plus')}</button></div>
      ${its.length ? `<div class="cg-items">${its.map(schedItem).join('')}</div>` : `<div class="cg-none">Nothing planned</div>`}</div></section>`;
}
// A run of days as a schedule. Empty days are skipped (unless `showEmpty`), with a note saying how many were skipped.
function schedule(from, to, opts = {}) {
  const its = calendarItems(from, to); const by = {};
  for (const it of its) (by[it.date] = by[it.date] || []).push(it);
  let html = ''; let gap = 0; let month = '';
  const flushGap = () => { if (gap && !opts.showEmpty) html += `<div class="cg-gap">${gap === 1 ? '1 day' : gap + ' days'} with nothing planned</div>`; gap = 0; };
  for (let d = parseD(from); dstr(d) <= to; d.setDate(d.getDate() + 1)) {
    const ds = dstr(d);
    if (opts.months && ds.slice(0, 7) !== month) { flushGap(); month = ds.slice(0, 7); html += `<h2 class="cg-month">${esc(monthLabel(month))}</h2>`; }
    const list = by[ds] || [];
    if (list.length || opts.showEmpty || ds === opts.keep || (ds === todayStr() && opts.keepToday)) { flushGap(); html += dayGroup(ds, list, opts); }
    else gap++;
  }
  flushGap();
  return html || `<div class="card empty small">${ic('cal')}<div>Nothing planned${S.calMine || S.calHide.size ? ' that matches your filters' : ''}.</div></div>`;
}
// Phones, month view: the selected day and the rest of the month, listed under the grid.
function monthSchedule(sel) {
  const cur = parseD(sel); const monthStart = dstr(new Date(cur.getFullYear(), cur.getMonth(), 1)); const mEnd = dstr(new Date(cur.getFullYear(), cur.getMonth() + 1, 0));
  const earlier = sel > monthStart ? calendarItems(monthStart, dstr(addDays(cur, -1))).length : 0;
  return `${earlier ? `<button class="cg-earlier" data-act="cal-pick" data-d="${monthStart}">${icSize('down', 14, 'transform:rotate(180deg)')} ${plural(earlier, 'earlier item')} this month</button>` : ''}${schedule(sel, mEnd, { keep: sel })}`;
}
// Picking another day in the month or week already on screen: move the highlight and update the list in place —
// no redraw of the page, so it's instant and smooth.
function calSelect(ds) {
  S.calDate = ds; history.replaceState(null, '', '#/calendar/' + ds); current.key = location.hash; current.args = [ds];
  $$('.cal-cell, .wk-day').forEach((c) => { const on = c.dataset.d === ds; c.classList.toggle('sel', on); c.setAttribute(c.classList.contains('wk-day') ? 'aria-pressed' : 'aria-selected', on); });
  const main = $('#view'); if (main) main._html = '';
  if (S.calView === 'week' && !calWide()) {
    $$('.cg').forEach((g) => g.classList.toggle('sel', g.dataset.day === ds));
    const g = $(`.cg[data-day="${ds}"]`);
    if (g) { const top = g.getBoundingClientRect().top + window.scrollY - (($('.topbar') || {}).offsetHeight || 56) - 10; window.scrollTo({ top: Math.max(0, top), behavior: motionOK() ? 'smooth' : 'auto' }); }
    return;
  }
  const box = calWide() ? $('.cal-agenda') : $('[data-msched]');
  if (!box) return renderView(false);
  if (calWide()) { const tmp = document.createElement('div'); tmp.innerHTML = dayAgenda(ds); box.replaceWith(tmp.firstElementChild); }
  else box.innerHTML = monthSchedule(ds);
  const nb = calWide() ? $('.cal-agenda') : box;
  if (nb && motionOK()) nb.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 170, easing: 'ease-out' });
}
function calFilters() {
  const kinds = [['event', 'Events', CAL_C.event], ['task', 'Tasks', CAL_C.task], ['project', 'Project dates', CAL_C.start]];
  return `<div class="cal-filters" role="toolbar" aria-label="Show">
    <button class="cf ${S.calMine ? 'on' : ''}" data-act="cal-mine" aria-pressed="${S.calMine}">${icSize('user', 14)}Just me</button>
    ${kinds.map(([k, l, c]) => `<button class="cf kind ${S.calHide.has(k) ? 'off' : 'on'}" data-act="cal-kind" data-k="${k}" aria-pressed="${!S.calHide.has(k)}" style="--c:${c}"><i></i>${l}</button>`).join('')}</div>`;
}
// Coloured bars under a date (one per item, up to three; with more, two bars and "+N") — easier to spot than dots.
function calMarks(its, always = false) {
  if (!its.length) return `<span class="cal-marks ${always ? 'always' : ''}"></span>`;
  const shown = its.length > 3 ? its.slice(0, 2) : its.slice(0, 3);
  return `<span class="cal-marks ${always ? 'always' : ''}" aria-hidden="true">${shown.map((it) => `<i style="--c:${esc(itColor(it))}"></i>`).join('')}${its.length > 3 ? `<em>+${its.length - 2}</em>` : ''}</span>`;
}
const monday = (d) => { const x = new Date(d); const k = (x.getDay() + 6) % 7; x.setDate(x.getDate() - k); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const calWide = () => matchMedia('(min-width: 700px)').matches;
function dayAgenda(ds) {
  const its = calendarItems(ds, ds);
  const d = parseD(ds);
  const label = ds === todayStr() ? 'Today' : days(ds) === 1 ? 'Tomorrow' : days(ds) === -1 ? 'Yesterday' : d.toLocaleDateString('en-GB', { weekday: 'long' });
  return `<div class="cal-agenda ${S.calAgAnim ? 'cal-anim' : ''}"><div class="cal-agenda-head"><h2>${esc(label)} <span class="muted" style="font-weight:500">${esc(d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }))}</span></h2>
    <button class="btn sm ghost" data-act="new-event" data-date="${ds}" style="color:var(--accent-text)">${ic('plus')}Add</button></div>
    <div class="card flush">${its.length ? its.map(agItem).join('') : `<div class="ag-empty">No events</div>`}</div></div>`;
}
function weekStrip(sel) {
  const st = monday(parseD(sel));
  return `<div class="wk-strip">${[0, 1, 2, 3, 4, 5, 6].map((i) => { const d = addDays(st, i); const ds = dstr(d); const n = calendarItems(ds, ds).length;
    return `<button class="wk-day ${ds === todayStr() ? 'today' : ''} ${ds === sel ? 'sel' : ''}" data-act="cal-pick" data-d="${ds}" aria-pressed="${ds === sel}" aria-label="${esc(d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))}${n ? ', ' + plural(n, 'item') : ''}">
      <span class="dw">${d.toLocaleDateString('en-GB', { weekday: 'narrow' })}</span><span class="dn">${d.getDate()}</span>${calMarks(calendarItems(ds, ds), true)}</button>`; }).join('')}</div>`;
}
// Hour-by-hour timeline for one or more days.
const HOUR_PX = 52;
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
function timeline(dayList) {
  const per = dayList.map((ds) => calendarItems(ds, ds));
  const timed = (it) => it.kind === 'event' && it.time && !(it.ev.endDate && it.ev.endDate > it.ev.date);
  let lo = 7, hi = 19;
  per.flat().filter(timed).forEach((it) => { const s = toMin(it.time); const e = toMin(it.ev.end) || s + 60; lo = Math.min(lo, Math.floor(s / 60)); hi = Math.max(hi, Math.ceil(e / 60)); });
  lo = Math.max(0, lo); hi = Math.min(24, Math.max(hi, lo + 6));
  const hours = []; for (let h = lo; h < hi; h++) hours.push(h);
  const cols = dayList.length;
  const now = new Date(); const nowMin = now.getHours() * 60 + now.getMinutes();
  const head = cols > 1 ? `<div class="tl-gutter-lbl" style="border:0"></div>${dayList.map((ds) => { const d = parseD(ds); return `<div class="tl-colhead ${ds === todayStr() ? 'today' : ''}" data-act="cal-goday" data-d="${ds}"><div class="dw">${d.toLocaleDateString('en-GB', { weekday: 'short' })}</div><div class="dn">${d.getDate()}</div></div>`; }).join('')}` : '';
  const allday = `<div class="tl-gutter-lbl">all-day</div>${per.map((its) => `<div class="tl-allday" style="border-left:${cols > 1 ? '.5px solid var(--line)' : '0'}">${its.filter((it) => !timed(it)).map(calPill).join('')}</div>`).join('')}`;
  const body = `<div class="tl-hours">${hours.map((h) => `<div class="tl-hour">${h === lo ? '' : String(h).padStart(2, '0') + ':00'}</div>`).join('')}</div>
    ${per.map((its, ci) => {
      const evs = its.filter(timed).map((it) => { const s = toMin(it.time); let e = toMin(it.ev.end); if (e == null || e <= s) e = s + 60; return { it, s, e }; }).sort((a, b) => a.s - b.s);
      const lanes = []; evs.forEach((x) => { let l = lanes.findIndex((end) => end <= x.s); if (l < 0) { l = lanes.length; lanes.push(0); } lanes[l] = x.e; x.lane = l; });
      const n = Math.max(1, lanes.length);
      const isToday = dayList[ci] === todayStr();
      return `<div class="tl-col ${isToday ? 'today' : ''}" data-act="cal-slot" data-d="${dayList[ci]}" data-lo="${lo}" style="height:${hours.length * HOUR_PX}px">
        ${evs.map((x) => `<button class="tl-ev" data-act="event-open" data-id="${x.it.id}" style="--c:${esc(itColor(x.it))};top:${(x.s - lo * 60) / 60 * HOUR_PX + 1}px;height:${Math.max(22, (x.e - x.s) / 60 * HOUR_PX - 2)}px;left:calc(${x.lane / n * 100}% + 3px);right:auto;width:calc(${100 / n}% - 6px)"><b>${esc(x.it.title)}</b><span>${esc(x.it.time)}${x.it.ev.end ? '–' + esc(x.it.ev.end) : ''}${x.it.ev.location ? ' · ' + esc(x.it.ev.location) : ''}</span></button>`).join('')}
        ${isToday && nowMin >= lo * 60 && nowMin <= hi * 60 ? `<div class="tl-now" style="top:${(nowMin - lo * 60) / 60 * HOUR_PX}px"></div>` : ''}</div>`;
    }).join('')}`;
  return `<div class="tl ${cols > 1 ? 'week' : ''}" style="${cols > 1 ? '' : ''}">${head}${allday}</div>
    <div class="tl-scroll"><div class="tl ${cols > 1 ? 'week' : ''}">${body}</div></div>`;
}
VIEWS.calendar = {
  render(day) {
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) S.calDate = day;
    const view = S.calView; const sel = S.calDate; const cur = parseD(sel);
    const anim = S.calAnim ? `cal-anim ${S.calAnim}` : ''; S.calAnim = '';
    let title, body;
    if (view === 'month') {
      title = `${cur.toLocaleDateString('en-GB', { month: 'long' })} <span class="yr">${cur.getFullYear()}</span>`;
      const first = new Date(cur.getFullYear(), cur.getMonth(), 1); const start = monday(first);
      const cells = []; for (let i = 0; i < 42; i++) cells.push(addDays(start, i));
      const lastRow = cells[35].getMonth() !== cur.getMonth() ? 35 : 42;
      const items = calendarItems(dstr(cells[0]), dstr(cells[lastRow - 1]));
      const max = calWide() ? 3 : 0;

      body = `<div class="cal-surface ${anim}" data-swipe="cal"><div class="cal-dows">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => `<span class="${i > 4 ? 'we' : ''}">${calWide() ? d : d[0]}</span>`).join('')}</div>
        <div class="cal-grid" role="grid">${cells.slice(0, lastRow).map((d) => { const ds = dstr(d); const its = items.filter((x) => x.date === ds); const wk = d.getDay() === 0 || d.getDay() === 6;
          return `<div class="cal-cell ${d.getMonth() !== cur.getMonth() ? 'other' : ''} ${ds === todayStr() ? 'today' : ''} ${ds === sel ? 'sel' : ''} ${wk ? 'we' : ''}" role="gridcell" data-act="cal-pick" data-d="${ds}" tabindex="0" aria-selected="${ds === sel}" aria-label="${esc(d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))}${its.length ? ', ' + plural(its.length, 'item') : ''}">
            <span class="dn">${d.getDate()}</span>
            <span class="evs">${its.slice(0, max).map(calPill).join('')}${its.length > max && max ? `<span class="cal-more">${its.length - max} more</span>` : ''}</span>
            ${calMarks(its)}</div>`; }).join('')}</div></div>
        ${calWide() ? dayAgenda(sel) : `<div class="sched ${S.calAgAnim ? 'cal-anim' : ''}" data-msched>${monthSchedule(sel)}</div>`}`;
    } else if (view === 'week') {
      const st = monday(cur); const en = addDays(st, 6);
      title = st.getMonth() === en.getMonth() ? `${st.getDate()}–${en.getDate()} ${en.toLocaleDateString('en-GB', { month: 'short' })} <span class="yr">${en.getFullYear()}</span>`
        : `${st.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${en.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} <span class="yr">${en.getFullYear()}</span>`;
      body = calWide()
        ? `<div class="cal-surface ${anim}" data-swipe="cal">${timeline([0, 1, 2, 3, 4, 5, 6].map((i) => dstr(addDays(st, i))))}</div>`
        : `<div class="cal-surface ${anim}" data-swipe="cal">${weekStrip(sel)}</div><div class="sched ${S.calAgAnim ? 'cal-anim' : ''}">${schedule(dstr(st), dstr(en), { showEmpty: true })}</div>`;
    } else if (view === 'list') {
      const st = monday(cur); const en = addDays(st, 55);
      title = `${st.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${en.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} <span class="yr">${en.getFullYear()}</span>`;
      body = `<div class="sched list ${anim}" data-swipe="cal">${schedule(dstr(st), dstr(en), { months: true, keepToday: true, mark: false })}</div>`;
    } else {
      title = `${cur.getDate()} ${cur.toLocaleDateString('en-GB', { month: 'long' })} <span class="yr">${cur.getFullYear()}</span>`;
      body = `<div class="cal-surface ${anim}" data-swipe="cal">${weekStrip(sel)}<div style="border-top:.5px solid var(--line)">${timeline([sel])}</div></div>`;
    }
    S.calAgAnim = false;
    return `<div class="cal-top"><div class="cal-title"><div class="sub">${view === 'day' ? esc(cur.toLocaleDateString('en-GB', { weekday: 'long' })) : 'Calendar'}</div><h1 aria-live="polite">${title}</h1></div>
        <button class="btn primary icon" data-act="new-event" data-date="${sel}" aria-label="New event" title="New event" style="border-radius:50%">${ic('plus')}</button>
        <div class="cal-ctrls"><div class="cal-nav"><button class="btn icon" data-act="cal-step" data-d="-1" aria-label="Previous ${view}">${ic('left')}</button><button class="btn sm today-btn" data-act="cal-today">Today</button><button class="btn icon" data-act="cal-step" data-d="1" aria-label="Next ${view}">${ic('right')}</button></div>
        <div class="seg" data-seg="calview">${[['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['list', 'List']].map(([k, l]) => `<button class="${view === k ? 'on' : ''}" data-act="cal-view" data-v="${k}">${l}</button>`).join('')}</div></div></div>
      ${calFilters()}
      ${body}
      <div class="cal-legend"><span><i style="--c:${CAL_C.event}"></i>Events</span><span><i style="--c:${CAL_C.task}"></i>Tasks</span><span><i style="--c:${CAL_C.start}"></i>Project starts</span><span><i style="--c:${CAL_C.due}"></i>Due dates</span><span class="grow"></span><span>Shared with ${esc(S.company.name)}</span></div>`;
  },
  mount() {
    if (S.calView === 'week' && !calWide() && S.calScrollTo) { const g = $(`.cg[data-day="${S.calScrollTo}"]`); if (g) g.scrollIntoView({ block: 'start', behavior: motionOK() ? 'smooth' : 'auto' }); }
    S.calScrollTo = null;
    const sc = $('.tl-scroll');
    if (sc && !sc.dataset.scrolled) { const now = $('.tl-now', sc); const first = $('.tl-ev', sc); const tgt = now || first; if (tgt) sc.scrollTop = Math.max(0, tgt.offsetTop - 80); sc.dataset.scrolled = '1'; }
    const sw = $('[data-swipe="cal"]'); if (!sw) return;
    let x0 = null, y0 = 0;
    sw.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') { x0 = e.clientX; y0 = e.clientY; } });
    sw.addEventListener('pointerup', (e) => { if (x0 == null) return; const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) calStep(dx < 0 ? 1 : -1); });
    sw.addEventListener('pointercancel', () => { x0 = null; });
  },
};
function calGo(ds, anim) { S.calDate = ds; S.calAnim = anim || ''; S.calAgAnim = !!anim && anim.trim() !== ''; history.replaceState(null, '', '#/calendar/' + ds); current.key = location.hash; current.args = [ds]; renderView(false); }
function calStep(n) {
  const d = parseD(S.calDate);
  if (S.calView === 'month') { const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
  else d.setDate(d.getDate() + (S.calView === 'week' ? 7 : S.calView === 'list' ? 28 : 1) * n);
  calGo(dstr(d), n > 0 ? 'from-right' : 'from-left');
}
A['cal-view'] = (el) => { S.calView = el.dataset.v; store.set('cd_calView', S.calView); S.calAnim = ' '; S.calAgAnim = true; renderView(false); };
A['cal-today'] = () => { const t = todayStr(); if (t === S.calDate) return; if ((S.calView === 'month' && t.slice(0, 7) === S.calDate.slice(0, 7)) || (S.calView === 'week' && !calWide() && dstr(monday(parseD(t))) === dstr(monday(parseD(S.calDate))))) return calSelect(t); calGo(t, t > S.calDate ? 'from-right' : 'from-left'); };
A['cal-step'] = (el) => calStep(Number(el.dataset.d));
A['cal-pick'] = (el, e) => {
  if (e && e.target.closest('.cal-pill')) return;
  const ds = el.dataset.d;
  if (ds === S.calDate && S.calView === 'month' && calWide()) { S.calView = 'day'; store.set('cd_calView', 'day'); return calGo(ds, ' '); } // second click opens the day
  const prev = S.calDate;
  const sameMonth = ds.slice(0, 7) === prev.slice(0, 7);
  const sameWeek = dstr(monday(parseD(ds))) === dstr(monday(parseD(prev)));
  if ((S.calView === 'month' && sameMonth) || (S.calView === 'week' && sameWeek && !calWide())) return calSelect(ds);
  const other = S.calView === 'month' && !sameMonth;
  if (S.calView === 'week' && !calWide()) S.calScrollTo = ds;
  calGo(ds, other ? (ds > prev ? 'from-right' : 'from-left') : '');
};
A['cal-goday'] = (el) => { S.calView = 'day'; store.set('cd_calView', 'day'); calGo(el.dataset.d, ' '); };
A['cal-slot'] = (el, e) => { // tap an empty hour to add an event then
  if (e.target !== el) return;
  const r = el.getBoundingClientRect(); const h = Math.min(23, Number(el.dataset.lo) + Math.floor((e.clientY - r.top) / HOUR_PX));
  eventSheet(null, { date: el.dataset.d, allDay: false, start: String(h).padStart(2, '0') + ':00', end: String(Math.min(23, h + 1)).padStart(2, '0') + ':00' });
};
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.cal-cell')) { e.preventDefault(); A['cal-pick'](e.target, e); }
  if (parseHash().name === 'calendar' && !e.target.closest('input,textarea,select,[contenteditable]') && !document.querySelector('.sheet-backdrop')) {
    if (e.key === 'ArrowRight' && e.altKey) calStep(1); else if (e.key === 'ArrowLeft' && e.altKey) calStep(-1);
  }
});

function eventSheet(ev, preset = {}) {
  const e = ev || Object.assign({ title: '', date: S.calDate || todayStr(), endDate: '', allDay: true, start: '09:00', end: '10:00', description: '', location: '', participants: [], visibility: 'all', projectId: '', color: '' }, preset);
  if (preset.projectId && !ev) { const p = S.projects[preset.projectId]; if (p) { e.title = e.title || p.name; e.location = e.location || p.address || ''; } }
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
        <label class="field full"><span>Project</span><select name="projectId"><option value="">None</option>${projs.map((p) => `<option value="${p.id}" ${p.id === e.projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
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
    participants: picked(f), visibility: d.private ? 'selected' : 'all', projectId: d.projectId };
  await saveItem('events', f.dataset.id || null, body);
  close(); toast(f.dataset.id ? 'Event updated' : 'Added to the calendar');
};
A['new-event'] = (el) => eventSheet(null, { date: el.dataset.date || S.calDate || todayStr(), projectId: el.dataset.project || '' });
A['event-open'] = (el) => {
  const e = S.events[el.dataset.id]; if (!e) return;
  const canEdit = isAdmin() || e.createdBy === S.user.id;
  if (canEdit) return eventSheet(e);
  sheet(`${sheetHead(e.title)}<dl class="kv"><dt>When</dt><dd>${esc(fmtDate(e.date, true))}${e.endDate && e.endDate !== e.date ? ' – ' + esc(fmtDate(e.endDate, true)) : ''}${e.allDay ? ' · All day' : ` · ${esc(e.start)}${e.end ? '–' + esc(e.end) : ''}`}</dd>
    ${e.location ? `<dt>Where</dt><dd>${linkify(e.location)}</dd>` : ''}
    ${S.projects[e.projectId] ? `<dt>Project</dt><dd><a href="#/project/${e.projectId}" data-close>${esc(S.projects[e.projectId].name)}</a></dd>` : ''}
    <dt>People</dt><dd>${(e.participants || []).length ? e.participants.map((id) => personName(id)).join(', ') : '<span class="muted">Everyone</span>'}</dd>
    <dt>Added by</dt><dd>${personName(e.createdBy)}</dd></dl>${e.description ? `<p class="pre" style="margin-top:12px">${linkify(e.description)}</p>` : ''}
    <div class="sheet-foot"><button class="btn" data-close>Close</button></div>`);
};
A['event-del'] = async (el) => { const e = S.events[el.dataset.id]; closeSheets(); if (await confirmBox('Delete this event?', `“${e.title}” will be removed from everyone’s calendar.`)) { if (await deleteItem('events', e.id)) toast('Event deleted'); } };
