/* Time: the big + button on Home (start, stop, lunch, switch), today's log, finishing the day with notes,
   timesheets (edit times, add overtime, download in the company's template), the admin dashboard and suggestions. */
'use strict';

// ============================================================ the project you're on (remembered on this device)
const curKey = () => 'cd_proj_' + S.cid;
function currentProjectId() { // '' = not on a project, null = not chosen yet
  const id = store.get(curKey());
  if (id === 'none') return '';
  return id && S.projects[id] && !S.projects[id].archived ? id : null;
}
function setCurrentProject(id) { store.set(curKey(), id ? id : 'none'); }
function lastCategory(pid) {
  const mine = userEntries(S.user.id).filter((e) => (e.projectId || '') === (pid || '') && WORK_CATS.includes(e.category)).sort((a, b) => b.start - a.start)[0];
  return mine ? mine.category : (store.get('cd_lastcat') || (pid ? 'field' : 'office'));
}
// Projects in a helpful order: starred, then ones you've logged time on recently, then the rest.
function projectChoices() {
  const recent = {}; for (const e of userEntries(S.user.id)) if (e.projectId) recent[e.projectId] = Math.max(recent[e.projectId] || 0, e.start);
  return Object.values(S.projects).filter((p) => !p.archived).sort((a, b) => {
    const fa = isFav('projects', a.id) ? 1 : 0, fb = isFav('projects', b.id) ? 1 : 0;
    return fb - fa || (recent[b.id] || 0) - (recent[a.id] || 0) || a.name.localeCompare(b.name);
  });
}

// ============================================================ starting and stopping
async function startTimer(body, quiet = false) {
  try {
    const r = await capi('POST', '/entries/start', body);
    if (r.stopped) S.entries[r.stopped.id] = r.stopped;
    if (r.task) S.tasks[r.task.id] = r.task;
    S.entries[r.item.id] = r.item;
    if (WORK_CATS.includes(r.item.category)) store.set('cd_lastcat', r.item.category);
    syncTimerChrome(); scheduleRender(); pulseTimer();
    if (!quiet) toast(r.item.category === 'lunch' ? 'Lunch started — enjoy it' : `Timer started${r.item.tname ? ': ' + r.item.tname : ''}`);
    return r.item;
  } catch (e) { toast(e.message, true); throw e; }
}
async function stopTimer(id, body = {}) {
  const r = await capi('POST', `/entries/${id}/stop`, body);
  S.entries[r.item.id] = r.item;
  if (body.taskDone && S.tasks[r.item.taskId]) S.tasks[r.item.taskId].done = true;
  syncTimerChrome(); scheduleRender();
  return r.item;
}
function syncTimerChrome() { if (S.company) updateChrome(); }
function pulseTimer() { const b = $('.bigbtn'); if (b && motionOK()) b.animate([{ transform: 'scale(.9)' }, { transform: 'scale(1.06)' }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.34,1.4,.64,1)' }); }
A.timer = () => { const run = myRunning(); if (run) openStopSheet(run); else openStartSheet({}); };

function taskChips(pid, sel) {
  const p = S.projects[pid];
  if (!p) return `<div class="small muted">Not on a project — pick the type of work below.</div><input type="hidden" name="taskId" value="">`;
  const me = S.user.id; const today = todayStr();
  const tasks = projectTasks(pid).filter((t) => !t.done).sort((a, b) => ((b.assignees || []).includes(me) - (a.assignees || []).includes(me)) || ((b.date === today) - (a.date === today)));
  return `<div class="chips wrap" role="radiogroup" aria-label="Task">${tasks.map((t) => `<button type="button" class="chip ${t.id === sel ? 'on' : ''}" data-act="pick-chip" data-v="${t.id}" role="radio" aria-checked="${t.id === sel}">${esc(t.title)}${t.planMins ? `<span class="n">${esc(fmtDur(t.planMins, true))}</span>` : ''}</button>`).join('')}
    <button type="button" class="chip ${!sel ? 'on' : ''}" data-act="pick-chip" data-v="" role="radio" aria-checked="${!sel}">No particular task</button>
    <button type="button" class="chip add" data-act="pick-chip" data-v="__new" role="radio" aria-checked="false">${icSize('plus', 13)}New task</button></div>
    <input type="hidden" name="taskId" value="${esc(sel || '')}"><input class="input hidden" name="newTask" placeholder="What’s the new task?" maxlength="200" style="margin-top:8px" aria-label="New task name">`;
}
function suggestedTask(pid) {
  if (!pid) return '';
  const last = userEntries(S.user.id).filter((e) => e.projectId === pid && e.taskId).sort((a, b) => b.start - a.start)[0];
  if (last && S.tasks[last.taskId] && !S.tasks[last.taskId].done) return last.taskId;
  const mine = projectTasks(pid).find((t) => !t.done && (t.assignees || []).includes(S.user.id) && t.date === todayStr());
  return mine ? mine.id : '';
}
function openStartSheet(opts = {}) {
  let pid = opts.projectId !== undefined ? opts.projectId : currentProjectId();
  if (pid == null) pid = '';
  const sel = opts.taskId !== undefined ? opts.taskId : suggestedTask(pid);
  const catSel = opts.category || lastCategory(pid);
  const run = myRunning();
  sheet(`${sheetHead(run ? 'Switch to something else' : 'What are you doing?')}
    <form class="stack" data-form="timer-start">
      <label class="field"><span>Project</span><select name="projectId" data-change="start-proj"><option value="">Not on a project (office, training…)</option>${projectChoices().map((p) => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(projLabel(p))}</option>`).join('')}</select></label>
      <div class="field"><span>Task</span><div data-taskfield>${taskChips(pid, sel)}</div></div>
      <div class="field"><span>Type of work</span><div class="chips wrap" role="radiogroup" aria-label="Type of work">${WORK_CATS.map((k) => `<button type="button" class="chip ${k === catSel ? 'on' : ''}" data-act="pick-chip" data-v="${k}" role="radio" aria-checked="${k === catSel}"><i class="cdot" style="background:${CATS[k].color}"></i>${CATS[k].label}</button>`).join('')}</div><input type="hidden" name="category" value="${catSel}"></div>
      <label class="field"><span>Note <span class="hint">· optional</span></span><input name="note" placeholder="e.g. Setting out drainage runs" maxlength="1000" autocomplete="off"></label>
      <details class="earlier"><summary>Started a bit earlier?</summary><label class="field" style="margin-top:8px"><span>Start time</span><input type="time" name="at" value="${clock(Date.now())}" data-orig="${clock(Date.now())}"></label></details>
      ${run ? `<div class="tiny muted">This stops “${esc(run.tname || cat(run.category).label)}” (started ${clock(run.start)}).</div>` : ''}
      <div class="err-msg" data-err></div>
      <button class="btn primary block xl">${ic('play')}<span>Start</span></button>
    </form>`);
}
C['start-proj'] = (el) => { const f = el.closest('form'); $('[data-taskfield]', f).innerHTML = taskChips(el.value, suggestedTask(el.value)); };
// A row of chips that behaves like radio buttons, feeding the hidden input after it.
A['pick-chip'] = (el) => {
  const group = el.closest('.chips'); const input = group.parentElement.querySelector('input[type=hidden]');
  $$('.chip', group).forEach((c) => { c.classList.toggle('on', c === el); c.setAttribute('aria-checked', c === el); });
  input.value = el.dataset.v;
  const nt = group.parentElement.querySelector('input[name=newTask]');
  if (nt) { nt.classList.toggle('hidden', el.dataset.v !== '__new'); if (el.dataset.v === '__new') nt.focus(); }
};
F['timer-start'] = async (f, d, close) => {
  let start;
  if (d.at && d.at !== f.querySelector('[name=at]').dataset.orig) { start = atTime(todayStr(), d.at); if (start > Date.now()) throw new Error('That start time hasn’t happened yet'); }
  const body = { projectId: d.projectId || '', category: d.category || 'field', note: d.note || '', start };
  if (d.taskId === '__new') { if (!d.newTask || !d.newTask.trim()) throw new Error('Name the new task, or pick another'); if (!body.projectId) throw new Error('Pick a project for the new task'); body.newTask = d.newTask.trim(); }
  else body.taskId = d.taskId || '';
  setCurrentProject(body.projectId);
  await startTimer(body);
  close();
};
function openStopSheet(e) {
  const t = S.tasks[e.taskId]; const p = S.projects[e.projectId];
  sheet(`${sheetHead(e.category === 'lunch' ? 'End lunch' : 'Stop the timer')}
    <div class="stop-sum"><i class="cdot lg" style="background:${cat(e.category).color}"></i><div class="grow" style="min-width:0"><b class="ellipsis" style="display:block">${esc(t ? t.title : e.tname || cat(e.category).label)}</b>
      <div class="small muted">${p ? esc(projLabel(p)) + ' · ' : ''}${esc(cat(e.category).label)} · from ${clock(e.start)}</div></div><span class="mono big" data-since="${e.start}">${fmtElapsed(Date.now() - e.start)}</span></div>
    ${t && t.planMins ? planHtml(t.planMins, taskMins(t.id)) : ''}
    <form class="stack" data-form="timer-stop" data-id="${e.id}">
      ${e.category === 'lunch' ? '' : `<label class="field"><span>What did you do? <span class="hint">· goes on your timesheet</span></span><textarea name="note" rows="2" placeholder="e.g. Surveyed the north boundary — 46 points">${esc(e.note)}</textarea></label>`}
      ${t && !t.done ? `<label class="row" style="gap:10px"><span class="switch"><input type="checkbox" name="taskDone"><i></i></span><span>“${esc(t.title)}” is finished</span></label>` : ''}
      <label class="field"><span>Finished at</span><input type="time" name="end" value="${clock(Date.now())}" data-orig="${clock(Date.now())}"></label>
      <div class="err-msg" data-err></div>
      <div class="stop-actions"><button type="button" class="btn" data-act="stop-next">${ic('refresh')}<span>Stop &amp; start something else</span></button><button class="btn danger solid">${ic('stop')}<span>Stop</span></button></div>
    </form>`);
}
A['stop-next'] = (el) => { const f = el.closest('form'); f.dataset.next = '1'; f.requestSubmit(); };
F['timer-stop'] = async (f, d, close) => {
  const e = S.entries[f.dataset.id]; if (!e) return close();
  let end;
  if (d.end && d.end !== f.querySelector('[name=end]').dataset.orig) {
    end = atTime(entryDay(e), d.end);
    if (end <= e.start) end += 864e5; // worked past midnight
    if (end > Date.now() + 60e3) throw new Error('That finish time hasn’t happened yet');
  }
  const body = { end, taskDone: !!d.taskDone };
  if ('note' in d) body.note = d.note;
  const item = await stopTimer(e.id, body);
  close();
  if (f.dataset.next) setTimeout(() => openStartSheet({ projectId: item.projectId }), 250);
  else toast(`Logged ${fmtDur(entryMins(item))}${item.tname ? ' on ' + item.tname : ''}`);
};
A.lunch = () => startTimer({ projectId: '', category: 'lunch' });
A['back-to-work'] = () => {
  const prev = userEntries(S.user.id).filter((e) => e.end && e.category !== 'lunch' && entryDay(e) === todayStr()).sort((a, b) => b.start - a.start)[0];
  const pid = currentProjectId();
  const body = prev ? { projectId: prev.projectId, taskId: prev.taskId && S.tasks[prev.taskId] && !S.tasks[prev.taskId].done ? prev.taskId : '', category: prev.category } : { projectId: pid || '', category: lastCategory(pid) };
  startTimer(body);
};
A['switch-task'] = () => openStartSheet({});

// Choosing the project you're on.
A['choose-project'] = () => {
  const cur = currentProjectId();
  sheet(`${sheetHead('Which project are you on?')}
    <label class="search" style="margin-bottom:10px"><input class="input" type="search" placeholder="Search projects" data-input="cp-search" aria-label="Search projects" autocomplete="off">${ic('search')}</label>
    <div class="card flush cp-list" data-cp-list>${cpList('', cur)}</div>
    ${canCreateProjects() ? `<button class="btn block" style="margin-top:12px" data-act="new-project" data-close>${ic('plus')}New project</button>` : ''}`);
};
function cpList(q, cur) {
  const ps = projectChoices().filter((p) => !q || [p.name, p.ref, p.address].join(' ').toLowerCase().includes(q.toLowerCase()));
  return `<div class="list">${ps.map((p) => `<button class="item ${p.id === cur ? 'on' : ''}${projFill(p)}" data-act="cp-pick" data-id="${p.id}"><span class="grow" style="min-width:0"><b class="ellipsis" style="display:block">${esc(p.name)}</b><span class="tiny muted ellipsis" style="display:block">${esc([p.ref, p.address].filter(Boolean).join(' · ') || 'No job number')}</span></span>${p.id === cur ? icSize('check', 20, 'flex:none') : ''}</button>`).join('') || '<div class="empty small">No projects match.</div>'}
    <button class="item ${cur === '' ? 'on' : ''}" data-act="cp-pick" data-id=""><span class="grow"><b>Not on a project</b><span class="tiny muted" style="display:block">Office, training, admin, holiday…</span></span>${cur === '' ? icSize('check', 20, 'flex:none') : ''}</button></div>`;
}
I['cp-search'] = (el) => { const box = $('[data-cp-list]'); if (box) box.innerHTML = cpList(el.value, currentProjectId()); };
A['cp-pick'] = (el) => {
  setCurrentProject(el.dataset.id); closeSheets(); renderView(false);
  const run = myRunning();
  if (run && (run.projectId || '') !== el.dataset.id && run.category !== 'lunch') setTimeout(() => openStartSheet({ projectId: el.dataset.id }), 300);
};

// ============================================================ HOME: one big button
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
function scheduleVerdict(st, running, rec) {
  const s = S.company.settings;
  if (rec && rec.finishedAt && !running) return st.paid >= dayHours() * 60 ? { cls: 'ok', text: `Day finished${st.ot > 0 ? ` · ${fmtSigned(st.ot)} overtime` : ''}` } : { cls: 'short', text: `Day finished · ${fmtDur(dayHours() * 60 - st.paid)} short of a full day` }; const startM = hhmmToMin(s.dayStart || '08:00'), endM = hhmmToMin(s.dayEnd || '16:30');
  const target = dayHours() * 60; const nowM = minsOfDay(Date.now());
  if (isWeekend(todayStr())) return st.paid ? { cls: 'over', text: `Weekend work — ${fmtDur(st.paid)} so far (overtime rate 1.5×)` } : { cls: '', text: 'It’s the weekend.' };
  if (st.paid >= target) return { cls: st.paid - target >= 15 ? 'over' : 'ok', text: st.paid - target >= 15 ? `Full day done · ${fmtDur(st.paid - target)} overtime` : 'Full day done' };
  if (nowM >= endM) return { cls: running ? 'warn' : 'short', text: `${fmtDur(target - st.paid)} short of a full day${running ? '' : ' — add time if you forgot something'}` };
  if (nowM <= startM) return { cls: '', text: `Your day starts at ${s.dayStart || '08:00'}` };
  const expected = target * Math.min(1, (nowM - startM) / Math.max(1, endM - startM));
  const diff = st.paid - expected;
  if (diff >= -20) return { cls: 'ok', text: running ? `On schedule · about ${fmtDur(target - st.paid)} to go` : `On schedule · ${fmtDur(target - st.paid)} to go` };
  return { cls: 'warn', text: `${fmtDur(-diff)} behind schedule${running ? '' : ' — is the timer off by mistake?'}` };
}
function runningPlanMsg(run) {
  const t = S.tasks[run.taskId];
  if (!t || !t.planMins) return '';
  const act = taskMins(t.id); const left = t.planMins - act;
  return left >= 0 ? `<div class="plan-msg ${left < t.planMins * 0.15 ? 'near' : 'ok'}">${esc(fmtDur(left))} left of the ${esc(fmtDur(t.planMins))} planned</div>`
    : `<div class="plan-msg over">${icSize('flag', 14)}Running ${esc(fmtDur(-left))} over the ${esc(fmtDur(t.planMins))} planned</div>`;
}
function logRow(e, opts = {}) {
  const t = S.tasks[e.taskId]; const p = S.projects[e.projectId]; const c = cat(e.category);
  const title = t ? t.title : e.tname || (p ? c.label : c.label);
  const sub = [p ? projLabel(p) : e.pname, t || e.tname ? c.label : (p ? '' : '')].filter(Boolean).join(' · ');
  const canEdit = opts.edit !== false && (e.userId === S.user.id || isAdmin());
  return `<div class="logrow ${e.end ? '' : 'live'}"><span class="when mono">${clock(e.start)}<span>${e.end ? clock(e.end) : 'now'}</span></span><i class="cbar" style="background:${c.color}" title="${esc(c.label)}"></i>
    <div class="grow" style="min-width:0"><b class="ellipsis" style="display:block">${esc(title)}</b>${sub ? `<div class="tiny muted ellipsis">${esc(sub)}</div>` : ''}${e.note ? `<div class="small note">${esc(e.note)}</div>` : ''}</div>
    <span class="mono small dur" ${e.end ? '' : `data-since-dur="${e.start}"`}>${fmtDur(entryMins(e), true)}${e.edited ? '<span class="edited" title="Times were changed by hand">✎</span>' : ''}</span>
    ${canEdit ? `<button class="btn ghost sm icon" data-act="entry-edit" data-id="${e.id}" aria-label="Change this entry">${ic('edit')}</button>` : ''}</div>`;
}
VIEWS.home = {
  render() {
    const run = myRunning(); let pid = currentProjectId(); if (pid === null && run) pid = S.projects[run.projectId] ? run.projectId : ''; const p = pid ? S.projects[pid] : null;
    const today = todayStr(); const list = entriesOn(S.user.id, today); const st = dayStats(list);
    const rec = dayRec(S.user.id, today); const v = scheduleVerdict(st, !!run, rec);
    const runP = run && S.projects[run.projectId]; const runT = run && S.tasks[run.taskId];
    const chosen = pid !== null || !!run;
    const runningBase = list.filter((e) => e.end && cat(e.category).paid).reduce((a, e) => a + entryMins(e), 0);
    const target = dayHours() * 60;
    const head = `<div class="home-head"><div class="sub">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div><h1>${greeting()}, ${esc(S.user.name.split(' ')[0])}</h1></div>`;
    const picker = `<button class="proj-pick${projFill(p)}" data-act="choose-project" aria-label="Change the project you’re on"><span class="grow" style="min-width:0"><span class="pp-label">Project</span><span class="pp-name">${esc(p ? projLabel(p) : 'Not on a project')}</span></span><span class="pp-change">Change</span></button>`;
    let timer;
    if (!chosen) {
      const ps = projectChoices().slice(0, 6);
      timer = `<div class="card choose-card"><h2>Which project are you on?</h2><p class="small muted" style="margin:4px 0 12px">Pick one and the big <b>+</b> appears — tap it whenever you start something.</p>
        <div class="choose-grid">${ps.map((x) => `<button class="choose-btn${projFill(x)}" data-act="cp-pick" data-id="${x.id}"><span class="grow" style="min-width:0"><b class="ellipsis" style="display:block">${esc(x.name)}</b><span class="tiny muted ellipsis" style="display:block">${esc(x.ref || x.address || 'Project')}</span></span></button>`).join('')}
          <button class="choose-btn" data-act="choose-project">${icSize('search', 18, 'color:var(--muted)')}<span class="grow"><b>${ps.length ? 'Another project…' : 'Choose a project…'}</b></span></button>
          <button class="choose-btn" data-act="cp-pick" data-id=""><span class="grow"><b>Not on a project</b><span class="tiny muted" style="display:block">Office, training…</span></span></button></div></div>`;
    } else {
      timer = `<div class="timer-card ${run ? 'is-running' : ''} ${run && run.category === 'lunch' ? 'is-lunch' : ''}">${picker}
        <div class="timer">
          ${run ? `<div class="state live"><i></i>${run.category === 'lunch' ? 'On lunch' : 'Logging time'}</div>` : `<div class="state">Not logging time</div>`}
          <button class="bigbtn ${run ? 'running' : ''}" data-act="timer" aria-label="${run ? 'Stop the timer' : 'Start logging what you’re doing'}">${run ? ic('stop') : ic('plus')}<span class="bb-label">${run ? 'Stop' : 'Start'}</span></button>
          <div class="timer-info" aria-live="polite">${run ? `<div class="elapsed" data-since="${run.start}">${fmtElapsed(Date.now() - run.start)}</div>
              <div class="what">${esc(runT ? runT.title : run.tname || cat(run.category).label)}</div>
              <div class="meta"><i class="cdot" style="background:${cat(run.category).color}"></i>${run.category === 'lunch' ? 'Lunch' : esc([cat(run.category).label, runP && runP.id !== pid ? projLabel(runP) : ''].filter(Boolean).join(' · '))} · started ${clock(run.start)}</div>${runningPlanMsg(run)}`
            : `<div class="explain">Press <b>Start</b> when you begin something, and <b>Stop</b> when you finish. Your timesheet fills itself in.</div>`}</div>
        </div>
        ${run ? `<div class="quick">${run.category === 'lunch' ? `<button class="btn" data-act="back-to-work">${ic('play')}<span>Back to work</span></button>` : `<button class="btn" data-act="lunch">${ic('coffee')}<span>Lunch</span></button><button class="btn" data-act="switch-task">${ic('refresh')}<span>Switch task</span></button>`}</div>` : ''}
      </div>`;
    }
    const tasks = p ? projectTasks(p.id).filter((t) => !t.done).sort((a, b) => ((b.assignees || []).includes(S.user.id) - (a.assignees || []).includes(S.user.id)) || ((b.date === today) - (a.date === today))).slice(0, 6) : [];
    const todays = Object.values(S.tasks).filter((t) => t.date === today && (t.assignees || []).includes(S.user.id) && S.projects[t.projectId]);
    const planToday = todays.reduce((a, t) => a + (t.planMins || 0), 0);
    return `${head}<div class="home-grid">
      <div class="stack loose">${timer}
        <div class="card day-card"><div class="row between top wrap" style="gap:8px"><div><div class="label">Today</div>
            <div class="day-total"><b ${run && cat(run.category).paid ? `data-base="${runningBase}" data-run="${run.start}"` : ''}>${fmtDur(st.paid)}</b> <span class="muted">of ${fmtHrs(dayHours())}h</span></div></div>
            <div class="verdict ${v.cls}">${esc(v.text)}</div></div>
          <div class="progress day ${st.paid > target ? 'over' : ''}"><i style="width:${Math.min(100, (st.paid / target) * 100)}%"></i></div>
          ${list.length ? dayBar(list, { date: today }) : ''}
          ${planToday ? `<div class="small muted" style="margin-top:8px">${icSize('flag', 13, 'vertical-align:-2px')} Planned for you today: ${plural(todays.length, 'task')}, ${esc(fmtDur(planToday))} — ${esc(fmtDur(todays.reduce((a, t) => a + taskMins(t.id), 0)))} done so far</div>` : ''}</div>
        <div><div class="section-head"><h2>Today’s log</h2><button class="btn sm" data-act="add-time" data-date="${today}">${ic('plus')}<span>Add time</span></button></div>
          <div class="card flush">${list.length ? list.map((e) => logRow(e)).join('') : `<div class="empty small">${ic('clock')}<div>Nothing yet today. Everything you start and stop shows here, ready for your timesheet.</div></div>`}</div></div>
        <div class="finish-wrap">${rec && rec.finishedAt ? `<div class="card finished row">${icSize('check', 20, 'color:var(--ok);flex:none')}<div class="grow"><b>Day finished at ${clock(rec.finishedAt)}</b><div class="small muted">${esc(fmtDur(st.paid))} logged${st.ot > 0 ? ` · ${fmtSigned(st.ot)} overtime` : ''}</div></div><button class="btn sm" data-act="finish-day">${rec.well || rec.wrong || rec.improve ? 'Edit notes' : 'Add notes'}</button></div>`
          : `<button class="btn block xl finish" data-act="finish-day">${ic('moon')}<span>Finish for today</span></button>`}</div>
      </div>
      <div class="stack">
        ${p ? `<div><div class="section-head"><h2 class="ellipsis">${esc(p.name)}</h2><a class="small" href="#/project/${p.id}">Open project</a></div>
          ${projectPlanMins(p) ? `<div class="card" style="margin-bottom:10px">${planHtml(projectPlanMins(p), projectPlanActual(p))}</div>` : ''}
          <div class="card flush">${tasks.length ? tasks.map(taskRow).join('') : `<div class="empty small">No open tasks. <a href="#/project/${p.id}">Add some to the project</a> to log time against them and plan the work.</div>`}</div></div>` : ''}
        <div class="card"><div class="section-head"><h3>This month</h3><a class="small" href="#/timesheet">My timesheet</a></div>${monthMini(S.user.id)}</div>
        ${homePings()}
      </div></div>`;
  },
};
function homePings() {
  const unread = Object.values(S.pings).filter((x) => !x.read).sort((a, b) => b.createdAt - a.createdAt).slice(0, 3);
  if (!unread.length) return '';
  return `<div><div class="section-head"><h2>Unread pings</h2><a class="small" href="#/pings">All pings</a></div><div class="card flush">${unread.map((x) => pingRow(x, true)).join('')}</div></div>`;
}
function monthStats(uid, ym) {
  const byDay = {};
  for (const e of userEntries(uid)) { const ds = entryDay(e); if (ds.slice(0, 7) === ym) (byDay[ds] = byDay[ds] || []).push(e); }
  let paid = 0, ot = 0, otPay = 0, days = 0, edited = 0;
  for (const [ds, list] of Object.entries(byDay)) {
    list.sort((a, b) => a.start - b.start);
    const st = dayStats(list); paid += st.paid; if (st.paid) days++; edited += list.filter((e) => e.edited).length;
    const o = dayOT(uid, ds, st); ot += o; otPay += o * otRate(ds);
  }
  return { byDay, paid, ot: Math.round(ot * 100) / 100, otPay: Math.round(otPay * 100) / 100, days, edited };
}
// Overtime for a day, like the timesheet — but a day still in progress isn't shown as hours short until it's finished.
function dayOT(uid, ds, st) {
  if (ds !== todayStr() || st.ot >= 0) return st.ot;
  const rec = dayRec(uid, ds); const after = minsOfDay(Date.now()) >= hhmmToMin(S.company.settings.dayEnd || '16:30') + 60;
  return (rec && rec.finishedAt) || (after && !st.running) ? st.ot : 0;
}
function monthMini(uid) {
  const ym = thisMonth(); const m = monthStats(uid, ym);
  return `<div class="mini-kpis"><div><b>${esc(fmtDur(m.paid, true))}</b><span>logged</span></div><div><b>${m.days}</b><span>${m.days === 1 ? 'day' : 'days'}</span></div><div><b class="${m.ot > 0 ? 'pos' : m.ot < 0 ? 'neg' : ''}">${fmtSigned(m.ot)}</b><span>overtime</span></div></div>
    <a class="btn sm block" style="margin-top:10px" href="/api/c/${S.cid}/timesheet/${uid}/${ym}" download="${esc(monthFile(member(uid).name, ym))}">${ic('download')}${esc(monthFile(member(uid).name, ym))}</a>`;
}

// ============================================================ adding and changing time
function entrySheet(e, preset = {}) {
  const uid = e ? e.userId : preset.userId || S.user.id;
  const ds = e ? entryDay(e) : preset.date || todayStr();
  const v = e || { projectId: currentProjectId() || '', taskId: '', category: lastCategory(currentProjectId()), note: '', start: 0, end: 0 };
  const running = e && !e.end;
  const other = uid !== S.user.id;
  sheet(`${sheetHead(e ? 'Change time' : other ? `Add time for ${member(uid).name.split(' ')[0]}` : 'Add time')}
    <form class="stack" data-form="entry" data-id="${e ? e.id : ''}" data-user="${uid}">
      <div class="form-grid">
        <label class="field"><span>Date</span><input type="date" name="date" value="${ds}" max="${todayStr()}" required></label>
        <div class="field"><span>From – to</span><div class="row tight"><input class="input" type="time" name="from" value="${e ? clock(e.start) : ''}" required aria-label="Start time"><span class="muted">–</span><input class="input" type="time" name="to" value="${e && e.end ? clock(e.end) : ''}" ${running ? '' : 'required'} aria-label="Finish time"></div>${running ? '<span class="hint">Still running — leave the finish time empty to keep it going</span>' : ''}</div>
        <label class="field"><span>Type</span><select name="category">${Object.entries(CATS).map(([k, c]) => `<option value="${k}" ${k === v.category ? 'selected' : ''}>${c.label}${c.paid ? '' : ' (not counted in hours)'}</option>`).join('')}</select></label>
        <label class="field"><span>Project</span><select name="projectId" data-change="entry-proj"><option value="">No project</option>${Object.values(S.projects).filter((p) => !p.archived || p.id === v.projectId).sort((a, b) => a.name.localeCompare(b.name)).map((p) => `<option value="${p.id}" ${p.id === v.projectId ? 'selected' : ''}>${esc(projLabel(p))}</option>`).join('')}</select></label>
        <label class="field full"><span>Task</span><select name="taskId" data-taskselect>${taskOptions(v.projectId, v.taskId)}</select></label>
        <label class="field full"><span>What was done <span class="hint">· optional</span></span><input name="note" value="${esc(v.note)}" maxlength="1000" autocomplete="off"></label>
      </div>
      ${e ? '' : `<div class="info-box small">${icSize('clock', 14, 'vertical-align:-2px')} Working late or at the weekend? Add the extra time here. Anything over ${fmtHrs(dayHours())} hours in a day shows as overtime on the timesheet (weekends at 1.5×).</div>`}
      ${e && e.edited ? '<div class="tiny muted">These times have been changed by hand before. Admins can see that on the timesheet.</div>' : ''}
      <div class="err-msg" data-err></div>
      <div class="sheet-foot">${e ? `<button type="button" class="btn danger" data-act="entry-del" data-id="${e.id}" style="margin-right:auto">${ic('trash')}Delete</button>` : ''}<button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${e ? 'Save' : 'Add time'}</button></div>
    </form>`);
}
function taskOptions(pid, sel) {
  const ts = pid ? projectTasks(pid).filter((t) => !t.done || t.id === sel) : [];
  return `<option value="">${pid ? 'No particular task' : '—'}</option>${ts.map((t) => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.title)}</option>`).join('')}`;
}
C['entry-proj'] = (el) => { const s = $('[data-taskselect]', el.closest('form')); if (s) s.innerHTML = taskOptions(el.value, ''); };
A['entry-edit'] = (el) => { const e = S.entries[el.dataset.id]; if (e) entrySheet(e); };
A['add-time'] = (el) => entrySheet(null, { date: el.dataset.date || todayStr(), userId: el.dataset.user || S.user.id });
F.entry = async (f, d, close) => {
  const start = atTime(d.date, d.from);
  let end = d.to ? atTime(d.date, d.to) : 0;
  if (end && end <= start) end += 864e5;
  const body = { start, end, category: d.category, projectId: d.projectId, taskId: d.taskId, note: d.note };
  let r;
  if (f.dataset.id) r = await capi('PATCH', `/entries/${f.dataset.id}`, body);
  else { if (!end) throw new Error('Enter a finish time'); r = await capi('POST', '/entries', Object.assign(body, f.dataset.user !== S.user.id ? { userId: f.dataset.user } : {})); }
  S.entries[r.item.id] = r.item; syncTimerChrome(); scheduleRender(); close();
  toast(f.dataset.id ? 'Time updated' : `Added ${fmtDur(entryMins(r.item))}`);
};
A['entry-del'] = async (el) => {
  const e = S.entries[el.dataset.id]; closeSheets();
  if (!(await confirmBox('Delete this time?', `${clock(e.start)}–${e.end ? clock(e.end) : 'now'} on ${fmtDate(entryDay(e), true)} will be removed from the timesheet.`))) return;
  try { await capi('DELETE', `/entries/${e.id}`); delete S.entries[e.id]; syncTimerChrome(); scheduleRender(); toast('Deleted'); } catch (err) { toast(err.message, true); }
};

// ============================================================ finishing the day
A['finish-day'] = () => {
  const today = todayStr(); const list = entriesOn(S.user.id, today); const st = dayStats(list); const rec = dayRec(S.user.id, today) || {};
  const run = myRunning();
  const byP = Object.entries(st.byProject).sort((a, b) => b[1] - a[1]);
  sheet(`${sheetHead(rec.finishedAt ? 'Your day' : 'Finish for today')}
    <div class="finish-sum"><div><b>${esc(fmtDur(st.paid))}</b><span>logged today</span></div><div><b class="${st.ot > 0 ? 'pos' : st.ot < 0 ? 'neg' : ''}">${fmtSigned(st.ot)}</b><span>${st.ot < 0 ? 'short of a full day' : 'overtime'}</span></div><div><b>${list.length}</b><span>${list.length === 1 ? 'entry' : 'entries'}</span></div></div>
    ${byP.length || st.nonprod ? `<div class="stack tight small" style="margin:4px 0 12px">${byP.map(([pid, m]) => `<div class="row"><span class="grow ellipsis">${esc(projLabel(S.projects[pid]) || 'Deleted project')}</span><span class="mono">${esc(fmtDur(m, true))}</span></div>`).join('')}${st.nonprod ? `<div class="row"><span class="grow">Non-productive</span><span class="mono">${esc(fmtDur(st.nonprod, true))}</span></div>` : ''}</div>` : ''}
    <form class="stack" data-form="finish-day">
      <p class="small muted" style="margin:0">Quick notes for you and your manager — all optional. They go with today’s timesheet.</p>
      <label class="field"><span>${icSize('sun', 14, 'vertical-align:-2px')} What went well?</span><textarea name="well" rows="2" placeholder="e.g. Finished the boundary survey early">${esc(rec.well || '')}</textarea></label>
      <label class="field"><span>${icSize('flag', 14, 'vertical-align:-2px')} What went wrong?</span><textarea name="wrong" rows="2" placeholder="e.g. GPS lost signal near the trees">${esc(rec.wrong || '')}</textarea></label>
      <label class="field"><span>${icSize('bulb', 14, 'vertical-align:-2px')} How could it go better?</span><textarea name="improve" rows="2" placeholder="e.g. Bring the total station for wooded areas">${esc(rec.improve || '')}</textarea></label>
      ${run ? `<div class="info-box small">${icSize('stop', 14, 'vertical-align:-2px')} Your timer will stop now (${clock(Date.now())}).</div>` : ''}
      <div class="err-msg" data-err></div>
      <div class="sheet-foot"><button type="button" class="btn" data-close>Not yet</button><button class="btn primary">${rec.finishedAt ? 'Save notes' : `${ic('moon')}<span>Finish my day</span>`}</button></div>
    </form>`);
};
F['finish-day'] = async (f, d, close) => {
  const today = todayStr(); const rec = dayRec(S.user.id, today) || {};
  const r = await capi('PUT', `/days/${today}`, { well: d.well, wrong: d.wrong, improve: d.improve, finished: rec.finishedAt ? undefined : true });
  S.days[r.item.id] = r.item; if (r.stopped) S.entries[r.stopped.id] = r.stopped;
  close(); syncTimerChrome(); scheduleRender();
  if (!rec.finishedAt) { const st = dayStats(entriesOn(S.user.id, today)); toast(`Day finished — ${fmtDur(st.paid)} logged. Nice work!`); }
  else toast('Notes saved');
};

// ============================================================ TIMESHEETS
VIEWS.timesheet = {
  render(ym, uid) {
    if (!/^\d{4}-\d{2}$/.test(ym || '')) ym = thisMonth();
    if (!uid || (uid !== S.user.id && !isAdmin())) uid = S.user.id;
    const loading = S.loaded[uid + '|' + ym] !== true;
    if (loading && !S.loaded[uid + '|' + ym]) ensureMonth(uid, ym).then((changed) => { if (changed !== false) scheduleRender(); });
    const m = member(uid); const me = uid === S.user.id;
    const ms = monthStats(uid, ym);
    const all = []; const end = monthEnd(ym);
    for (let d = parseD(ym + '-01'); dstr(d) <= end; d.setDate(d.getDate() + 1)) all.push(dstr(d));
    const shown = all.filter((ds) => ds <= todayStr() && (ms.byDay[ds] || dayRec(uid, ds) || !isWeekend(ds))).reverse();
    const approved = Object.keys(ms.byDay).filter((ds) => (dayRec(uid, ds) || {}).approvedBy).length;
    const up = S.sheetUploads[uid + '_' + ym];
    const base = `#/timesheet/`;
    return `${me ? '' : `<a class="back" href="#/admin/people">${ic('back')}Admin · People</a>`}
      <div class="page-head"><div class="row" style="min-width:0">${me ? '' : avatar(m, 'lg')}<div style="min-width:0"><h1>${me ? 'My timesheet' : esc(m.name)}</h1><div class="sub">${me ? 'Filled in from what you log. Change anything that’s wrong, or add overtime.' : 'Timesheet, notes and overtime approvals'}</div></div></div>
        <div class="month-nav"><a class="btn icon" href="${base}${shiftMonth(ym, -1)}${me ? '' : '/' + uid}" aria-label="Previous month">${ic('left')}</a><b>${esc(monthLabel(ym))}</b><a class="btn icon ${ym >= thisMonth() ? 'disabled' : ''}" href="${base}${shiftMonth(ym, 1)}${me ? '' : '/' + uid}" aria-label="Next month" ${ym >= thisMonth() ? 'aria-disabled="true" tabindex="-1"' : ''}>${ic('right')}</a></div></div>
      <div class="kpis">
        <div class="kpi"><span class="v">${esc(fmtDur(ms.paid, true))}</span><span class="l">Hours logged</span></div>
        <div class="kpi"><span class="v">${ms.days}</span><span class="l">Days worked</span></div>
        <div class="kpi"><span class="v ${ms.ot > 0 ? 'pos' : ms.ot < 0 ? 'neg' : ''}">${fmtSigned(ms.ot)}</span><span class="l">Overtime (${fmtSigned(ms.otPay)} at rate)</span></div>
        <div class="kpi"><span class="v">${approved}</span><span class="l">Days approved</span></div>
      </div>
      ${sheetUploadCard(uid, ym, me)}
      <div class="ts-actions">
        <a class="btn primary" href="/api/c/${S.cid}/timesheet/${uid}/${ym}${up ? '?generated=1' : ''}" download="${esc(monthFile(m.name, ym))}">${ic('download')}<span>${up ? 'Automatic: ' : ''}${esc(monthFile(m.name, ym))}</span></a>
        <a class="btn" href="/api/c/${S.cid}/timesheet/${uid}/${ym.slice(0, 4)}" download="${esc(yearFile(m.name, ym.slice(0, 4)))}">${ic('download')}<span>Whole year (${ym.slice(0, 4)})</span></a>
        <button class="btn" data-act="add-time" data-date="${ym === thisMonth() ? todayStr() : end}" data-user="${uid}">${ic('plus')}<span>Add time</span></button>
      </div>
      ${loading && !Object.keys(ms.byDay).length ? '<div class="skeleton" style="height:240px;margin-top:16px"></div>' : `<div class="card flush ts-days" style="margin-top:16px">${shown.length ? shown.map((ds) => tsDay(uid, ds, ms.byDay[ds] || [])).join('') : '<div class="empty small">Nothing in this month yet.</div>'}</div>`}
      <p class="tiny muted" style="margin-top:10px">${icSize('clock', 12, 'vertical-align:-1px')} Paid hours include field, office, rework, training and non-productive time. Lunch, holiday and absence are shown on the timesheet but not counted. Overtime is anything over ${fmtHrs(dayHours())} hours a day (or under it, as a minus), like the template. ✎ marks times changed by hand.</p>`;
  },
};
// Upload your own timesheet for the month: admins then get that file instead of the automatic one.
function sheetUploadCard(uid, ym, me) {
  const up = S.sheetUploads[uid + '_' + ym]; const nm = member(uid).name.split(' ')[0];
  const fileName = up ? monthFile(member(uid).name, ym).replace(/\.xlsx$/, '.' + up.ext) : '';
  if (up) return `<div class="card upl-card on"><span class="xl-ico ${up.ext === 'pdf' ? 'pdf' : ''}" aria-hidden="true">${esc(up.ext.toUpperCase())}</span>
    <div class="grow" style="min-width:0"><b>${me ? 'You’re using your own timesheet for ' : `${esc(nm)} uploaded their own timesheet for `}${esc(monthLabel(ym))}</b>
      <div class="small muted">${esc(up.name)} · ${fileSize(up.size)} · ${esc(fmtDateTime(up.at))}. ${me ? 'Admins get this file instead of the automatic one.' : 'This is the file in the Timesheets folder.'}</div>
      <div class="row wrap tight" style="margin-top:10px"><a class="btn sm primary" href="/api/c/${S.cid}/timesheet/${uid}/${ym}" download="${esc(fileName)}">${ic('eye')}Open it</a>
        <label class="btn sm">${ic('upload')}Replace<input type="file" class="sr-only" accept=".xlsx,.xls,.ods,.pdf" data-change="sheet-upload" data-user="${uid}" data-ym="${ym}"></label>
        <button class="btn sm ghost" data-act="sheet-unupload" data-user="${uid}" data-ym="${ym}">Use the automatic one again</button></div></div></div>`;
  return `<div class="card upl-card"><span class="upl-ico" aria-hidden="true">${ic('upload')}</span><div class="grow" style="min-width:0"><b>${me ? 'Prefer to fill in your own?' : `Upload ${esc(nm)}’s own timesheet`}</b>
    <div class="small muted">Upload a finished timesheet for ${esc(monthLabel(ym))} (Excel or PDF) and admins get that file instead of the automatic one.</div></div>
    <label class="btn sm">${ic('upload')}Upload<input type="file" class="sr-only" accept=".xlsx,.xls,.ods,.pdf" data-change="sheet-upload" data-user="${uid}" data-ym="${ym}"></label></div>`;
}
C['sheet-upload'] = async (el) => {
  const file = el.files && el.files[0]; if (!file) return;
  const lbl = el.closest('label'); lbl.classList.add('busy');
  try {
    const data = await readAsDataURL(file);
    const r = await sendWithProgress('POST', `/api/c/${S.cid}/timesheet/${el.dataset.user}/${el.dataset.ym}/upload`, { name: file.name, data });
    S.sheetUploads[el.dataset.user + '_' + el.dataset.ym] = r.item; renderView(false); toast('Uploaded — admins will get your file for this month');
  } catch (e) { toast(e.message, true); lbl.classList.remove('busy'); }
};
A['sheet-unupload'] = async (el) => {
  if (!(await confirmBox('Use the automatic timesheet again?', 'Your uploaded file is removed, and admins get the timesheet made from your logged time instead.', 'Use automatic', false))) return;
  try { await capi('DELETE', `/timesheet/${el.dataset.user}/${el.dataset.ym}/upload`); delete S.sheetUploads[el.dataset.user + '_' + el.dataset.ym]; renderView(false); toast('Back to the automatic timesheet'); }
  catch (e) { toast(e.message, true); }
};
function tsDay(uid, ds, list) {
  list = list.slice().sort((a, b) => a.start - b.start);
  const st = dayStats(list); const rec = dayRec(uid, ds) || {}; st.ot = dayOT(uid, ds, st);
  const open = S.openDay === uid + ds;
  const hasNotes = rec.well || rec.wrong || rec.improve;
  const otChip = st.paid ? `<span class="ot ${st.ot > 0 ? 'pos' : st.ot < 0 ? 'neg' : ''}">${st.ot ? fmtSigned(st.ot) : '±0'}</span>` : '';
  return `<div class="tsday ${open ? 'open' : ''} ${isWeekend(ds) ? 'we' : ''}">
    <button class="tsday-head" data-act="ts-open" data-k="${uid + ds}" aria-expanded="${open}">
      <span class="d"><b>${esc(parseD(ds).toLocaleDateString('en-GB', { weekday: 'short' }))}</b> ${parseD(ds).getDate()}</span>
      <span class="grow small muted ellipsis">${list.length ? `${clock(st.first)}–${st.running ? 'now' : clock(st.last)}${list.some((e) => e.edited) ? ' ✎' : ''}` : 'No time logged'}${hasNotes ? ' · 📝' : ''}</span>
      <span class="mono">${st.paid ? esc(fmtDur(st.paid, true)) : ''}</span>${otChip}
      ${rec.approvedBy ? `<span class="appr" title="Approved by ${esc(rec.approvedBy)}">${icSize('check', 12)}${esc(rec.approvedBy)}</span>` : ''}
      <span class="chev" aria-hidden="true">${icSize('right', 16)}</span></button>
    ${open ? `<div class="tsday-body">
      ${list.length ? `<div class="card flush" style="margin-bottom:10px">${list.map((e) => logRow(e)).join('')}</div>` : ''}
      ${hasNotes ? `<div class="day-notes">${rec.well ? `<div><span class="label">Went well</span><p>${esc(rec.well)}</p></div>` : ''}${rec.wrong ? `<div><span class="label">Went wrong</span><p>${esc(rec.wrong)}</p></div>` : ''}${rec.improve ? `<div><span class="label">Could improve</span><p>${esc(rec.improve)}</p></div>` : ''}</div>` : ''}
      <div class="row wrap tight"><button class="btn sm" data-act="add-time" data-date="${ds}" data-user="${uid}">${ic('plus')}Add time</button>
        ${isAdmin() && st.paid ? `<button class="btn sm ${rec.approvedBy ? '' : 'primary'}" data-act="ts-approve" data-user="${uid}" data-date="${ds}" data-on="${rec.approvedBy ? 0 : 1}">${ic('check')}${rec.approvedBy ? 'Remove approval' : st.ot > 0 ? 'Approve overtime' : 'Approve day'}</button>` : ''}
        ${uid === S.user.id && ds === todayStr() ? `<button class="btn sm" data-act="finish-day">${ic('moon')}${rec.finishedAt ? 'Day notes' : 'Finish for today'}</button>` : ''}</div>
    </div>` : ''}</div>`;
}
A['ts-open'] = (el) => { S.openDay = S.openDay === el.dataset.k ? null : el.dataset.k; renderView(false); };
A['ts-approve'] = async (el) => {
  try { const r = await capi('POST', `/days/${el.dataset.date}/approve`, { userId: el.dataset.user, approve: el.dataset.on === '1' }); S.days[r.item.id] = r.item; scheduleRender(); toast(el.dataset.on === '1' ? 'Approved' : 'Approval removed'); }
  catch (e) { toast(e.message, true); }
};

// ============================================================ ADMIN DASHBOARD
S.adminMonth = thisMonth();
async function ensureAllMonth(ym) {
  const key = 'all|' + ym;
  if (S.loaded[key]) return;
  S.loaded[key] = 'loading';
  try {
    const r = await capi('GET', `/entries?user=all&from=${ym}-01&to=${monthEnd(ym)}`);
    for (const e of r.items) S.entries[e.id] = e; for (const d of r.days) S.days[d.id] = d;
    S.loaded[key] = true; for (const id of Object.keys(S.members)) S.loaded[id + '|' + ym] = true;
    scheduleRender();
  } catch (e) { delete S.loaded[key]; toast(e.message, true); }
}
const ADMIN_TABS = [['today', 'Today'], ['people', 'People'], ['timesheets', 'Timesheets'], ['suggestions', 'Suggestions']];
VIEWS.admin = {
  render(tab = 'today', arg) {
    if (!isAdmin()) return `<div class="card empty">${ic('lock')}<h3>Admins only</h3><div class="small">The admin dashboard shows everyone’s time, so only owners and admins can open it.</div></div>`;
    if (!ADMIN_TABS.some(([k]) => k === tab)) tab = 'today';
    const newSug = Object.values(S.suggestions).filter((x) => x.status === 'new' && x.createdBy !== S.user.id).length;
    let body = '';
    if (tab === 'today') body = adminToday();
    if (tab === 'people') body = adminPeople();
    if (tab === 'timesheets') body = adminFolder(arg);
    if (tab === 'suggestions') body = adminSuggestions();
    return `<div class="page-head"><div><h1>Admin dashboard</h1><div class="sub">${icSize('lock', 13, 'vertical-align:-2px')} Only owners and admins can see this.</div></div></div>
      <nav class="tabs" aria-label="Admin sections">${ADMIN_TABS.map(([k, l]) => `<a class="tab ${tab === k ? 'on' : ''}" href="#/admin/${k}" ${tab === k ? 'aria-current="page"' : ''}>${l}${k === 'suggestions' && newSug ? ` <span class="count">${newSug}</span>` : ''}</a>`).join('')}</nav>
      <div style="margin-top:18px">${body}</div>`;
  },
  mount(tab, arg) {
    if (tab === 'people' || tab === 'timesheets') ensureAllMonth(S.adminMonth);
    if (tab === 'timesheets' && arg && ['connected', 'failed', 'cancelled', 'expired', 'denied'].includes(arg)) {
      toast({ connected: 'Google Drive connected — timesheets will be copied there automatically', failed: 'Couldn’t connect Google Drive. Please try again.', cancelled: 'Google Drive wasn’t connected', expired: 'That took too long — please try connecting again', denied: 'Only admins can connect Google Drive' }[arg], arg !== 'connected');
      history.replaceState(null, '', '#/admin/timesheets'); current.key = location.hash; current.args = ['timesheets'];
      if (arg === 'connected') loadCompany(true);
    }
  },
};
function adminToday() {
  const today = todayStr(); const ids = Object.keys(S.members);
  const rows = ids.map((id) => { const list = entriesOn(id, today); return { id, list, st: dayStats(list), run: runningOf(id), rec: dayRec(id, today) }; });
  rows.sort((a, b) => (!!b.run - !!a.run) || (b.st.paid - a.st.paid) || member(a.id).name.localeCompare(member(b.id).name));
  const working = rows.filter((r) => r.run && r.run.category !== 'lunch').length, lunch = rows.filter((r) => r.run && r.run.category === 'lunch').length;
  const notStarted = rows.filter((r) => !r.list.length).length;
  const total = rows.reduce((a, r) => a + r.st.paid, 0);
  const notes = Object.values(S.days).filter((d) => (d.well || d.wrong || d.improve)).sort((a, b) => b.date.localeCompare(a.date) || (b.updatedAt - a.updatedAt)).slice(0, 8);
  const status = (r) => {
    if (r.run) { const t = S.tasks[r.run.taskId]; const p = S.projects[r.run.projectId]; return r.run.category === 'lunch' ? `<span class="st lunch">On lunch</span> since ${clock(r.run.start)}` : `<span class="st live">${esc(cat(r.run.category).label)}</span> ${esc([p && projLabel(p), t && t.title].filter(Boolean).join(' · ') || 'Not on a project')} · since ${clock(r.run.start)}`; }
    if (r.rec && r.rec.finishedAt) return `<span class="st done">Finished</span> at ${clock(r.rec.finishedAt)}`;
    if (r.list.length) return `<span class="st">Stopped</span> at ${clock(r.st.last)}`;
    return '<span class="st off">Not started</span>';
  };
  return `<div class="kpis"><div class="kpi"><span class="v pos">${working}</span><span class="l">Working now</span></div><div class="kpi"><span class="v">${lunch}</span><span class="l">On lunch</span></div>
      <div class="kpi ${notStarted && minsOfDay(Date.now()) > hhmmToMin(S.company.settings.dayStart || '08:00') + 30 && !isWeekend(today) ? 'alert' : ''}"><span class="v">${notStarted}</span><span class="l">Not started today</span></div><div class="kpi"><span class="v">${esc(fmtDur(total, true))}</span><span class="l">Logged today, everyone</span></div></div>
    <div class="grid two section"><div class="card flush"><div class="list">${rows.map((r) => `<a class="item who-row" href="#/timesheet/${thisMonth()}/${r.id}">${avatar(member(r.id), '', { dot: true, link: false })}
        <div class="grow" style="min-width:0"><div class="row between"><b class="ellipsis">${esc(member(r.id).name)}</b><span class="mono small">${r.st.paid ? esc(fmtDur(r.st.paid, true)) : ''}</span></div>
          <div class="small muted ellipsis">${status(r)}</div>${dayBar(r.list, { date: today })}</div></a>`).join('')}</div></div>
      <div class="stack"><div class="card"><div class="section-head"><h3>Latest day notes</h3></div>${notes.length ? `<div class="stack">${notes.map((n) => `<div class="note-card"><div class="row tight small">${avatar(member(n.userId), 'xs')}<b>${personName(n.userId, true)}</b><span class="muted">· ${esc(fmtDate(n.date, true))}</span></div>
          ${n.well ? `<p><span class="nk good">Went well</span>${esc(n.well)}</p>` : ''}${n.wrong ? `<p><span class="nk bad">Went wrong</span>${esc(n.wrong)}</p>` : ''}${n.improve ? `<p><span class="nk">Improve</span>${esc(n.improve)}</p>` : ''}</div>`).join('')}</div>` : '<div class="small muted">When people finish their day with notes, they show here.</div>'}</div>
        <div class="card"><div class="section-head"><h3>Suggestions</h3><a class="small" href="#/admin/suggestions">All</a></div>${Object.values(S.suggestions).filter((x) => x.status === 'new').length ? `${plural(Object.values(S.suggestions).filter((x) => x.status === 'new').length, 'new message')} from your team.` : '<span class="small muted">Nothing new.</span>'}</div></div></div>`;
}
const adminMonthNav = (tab) => `<div class="month-nav"><button class="btn icon" data-act="admin-month" data-n="-1" data-tab="${tab}" aria-label="Previous month">${ic('left')}</button><b>${esc(monthLabel(S.adminMonth))}</b><button class="btn icon" data-act="admin-month" data-n="1" data-tab="${tab}" aria-label="Next month" ${S.adminMonth >= thisMonth() ? 'disabled' : ''}>${ic('right')}</button></div>`;
A['admin-month'] = (el) => { S.adminMonth = shiftMonth(S.adminMonth, Number(el.dataset.n)); ensureAllMonth(S.adminMonth); renderView(false); };
function peopleForMonth(ym) {
  const ids = new Set(Object.keys(S.members));
  for (const e of Object.values(S.entries)) if (entryDay(e).slice(0, 7) === ym) ids.add(e.userId);
  return [...ids].sort((a, b) => member(a).name.localeCompare(member(b).name));
}
function adminPeople() {
  const ym = S.adminMonth; const loading = S.loaded['all|' + ym] !== true;
  const rows = peopleForMonth(ym).map((id) => ({ id, m: monthStats(id, ym) }));
  return `<div class="row between wrap" style="margin-bottom:12px">${adminMonthNav('people')}<span class="small muted">Tap someone to see their days, notes and overtime, and to approve or change their time.</span></div>
    ${loading ? '<div class="skeleton" style="height:200px"></div>' : `<div class="card flush"><div class="list">${rows.map(({ id, m }) => { const last = userEntries(id).sort((a, b) => b.start - a.start)[0]; const pending = Object.keys(m.byDay).filter((ds) => dayStats(m.byDay[ds]).ot > 0 && !(dayRec(id, ds) || {}).approvedBy).length;
      return `<a class="item" href="#/timesheet/${ym}/${id}">${avatar(member(id), 'sm', { link: false })}<div class="grow" style="min-width:0"><b class="ellipsis" style="display:block">${esc(member(id).name)}</b><span class="tiny muted">${last ? 'Last logged ' + timeAgo(last.end || Date.now()) : 'No time logged yet'}${pending ? ` · <b class="neg">${plural(pending, 'day')} of overtime to approve</b>` : ''}</span></div>
        <div class="num-cols"><span><b>${esc(fmtDur(m.paid, true))}</b><i>hours</i></span><span><b>${m.days}</b><i>days</i></span><span><b class="${m.ot > 0 ? 'pos' : m.ot < 0 ? 'neg' : ''}">${fmtSigned(m.ot)}</b><i>OT</i></span></div>${icSize('right', 18, 'color:var(--muted);flex:none')}</a>`; }).join('')}</div></div>`}`;
}
function adminFolder() {
  const ym = S.adminMonth; const loading = S.loaded['all|' + ym] !== true; const y = ym.slice(0, 4);
  const ids = peopleForMonth(ym); const g = S.gdrive || {};
  const drive = !g.ready ? `<div class="card stack"><div class="row">${icSize('upload', 22, 'color:var(--muted);flex:none')}<div><h3>Copy to Google Drive automatically</h3><p class="small muted" style="margin:4px 0 0">Not set up on this server yet. The owner adds a Google “OAuth client” (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET) in Render — the README explains how. Until then, download the files here.</p></div></div></div>`
    : !g.connected ? `<div class="card stack"><div class="row">${icSize('upload', 22, 'color:var(--accent-text);flex:none')}<div class="grow"><h3>Copy to Google Drive automatically</h3><p class="small muted" style="margin:4px 0 0">Connect your Google Drive once. Every time someone’s time changes, their timesheet is updated in a “Crewdesk timesheets” folder, sorted by year and month. Crewdesk can only see the files it puts there.</p></div></div><button class="btn primary" data-act="drive-connect">${ic('link')}Connect Google Drive</button></div>`
    : `<div class="card stack"><div class="row wrap">${icSize('check', 22, 'color:var(--ok);flex:none')}<div class="grow" style="min-width:0"><h3>Google Drive connected</h3><p class="small muted" style="margin:4px 0 0">${esc(g.email || 'Google account')} · ${g.lastSync ? 'last copied ' + timeAgo(g.lastSync) : 'not copied yet'}${g.lastError ? ` · <span class="neg">${esc(g.lastError)}</span>` : ''}</p></div></div>
        <div class="row wrap tight">${g.folderUrl ? `<a class="btn sm" href="${esc(g.folderUrl)}" target="_blank" rel="noopener noreferrer">${ic('folder')}Open folder</a>` : ''}<button class="btn sm" data-act="drive-sync">${ic('refresh')}Copy this month now</button><button class="btn sm ghost" data-act="drive-off">Disconnect</button></div></div>`;
  return `<div class="row between wrap" style="margin-bottom:12px">${adminMonthNav('timesheets')}<a class="btn primary" href="/api/c/${S.cid}/timesheets/${ym}" download="Timesheets_${MONTHS_SHORT[Number(ym.slice(5, 7)) - 1]}_${ym.slice(0, 4)}.zip">${ic('download')}<span>Download all (.zip)</span></a></div>
    ${loading ? '<div class="skeleton" style="height:200px"></div>' : `<div class="files">${ids.map((id) => { const m = monthStats(id, ym); const name = member(id).name; const up = S.sheetUploads[id + '_' + ym];
      const fname = up ? monthFile(name, ym).replace(/\.xlsx$/, '.' + up.ext) : monthFile(name, ym);
      return `<div class="filecard"><span class="xl-ico ${up && up.ext === 'pdf' ? 'pdf' : ''}" aria-hidden="true">${up ? esc(up.ext.toUpperCase()) : 'XLS'}</span><div class="grow" style="min-width:0"><b class="ellipsis" style="display:block">${esc(fname)}</b><span class="tiny muted ellipsis" style="display:block">${esc(name)} · ${up ? `<b class="upl-tag">Their own upload</b>` : `${esc(fmtDur(m.paid, true))} · OT ${fmtSigned(m.ot)}`}</span></div>
        <a class="btn sm icon" href="#/timesheet/${ym}/${id}" aria-label="Open ${esc(name)}’s timesheet">${ic('eye')}</a><a class="btn sm icon primary" href="/api/c/${S.cid}/timesheet/${id}/${ym}" download="${esc(fname)}" aria-label="Download ${esc(fname)}">${ic('download')}</a></div>`; }).join('')}</div>`}
    <div class="section"><div class="section-head"><h2>Whole year ${y}</h2></div><div class="files">${ids.map((id) => `<a class="filecard" href="/api/c/${S.cid}/timesheet/${id}/${y}" download="${esc(yearFile(member(id).name, y))}"><span class="xl-ico" aria-hidden="true">XLS</span><div class="grow" style="min-width:0"><b class="ellipsis" style="display:block">${esc(yearFile(member(id).name, y))}</b><span class="tiny muted">${esc(member(id).name)} · summary, every entry, day notes</span></div>${ic('download')}</a>`).join('')}</div></div>
    <div class="section">${drive}</div>
    <p class="tiny muted">Monthly files use your company’s “Time &amp; Overtime Sheet” template, named with each person’s initials. They’re made fresh each time you download, so they always include the latest changes — unless someone has uploaded their own timesheet for the month, in which case you get theirs.</p>`;
}
A['drive-connect'] = async () => { try { const r = await capi('POST', '/gdrive/connect'); location.href = r.url; } catch (e) { toast(e.message, true); } };
A['drive-sync'] = async (el) => { el.classList.add('busy'); try { const r = await capi('POST', '/gdrive/sync'); S.gdrive = r.gdrive; toast(`Copied ${plural(r.files, 'timesheet')} to Google Drive`); renderView(false); } catch (e) { toast(e.message, true); el.classList.remove('busy'); } };
A['drive-off'] = async () => { if (!(await confirmBox('Disconnect Google Drive?', 'Timesheets stop being copied. Files already in Drive stay there.', 'Disconnect', false))) return; try { const r = await capi('DELETE', '/gdrive'); S.gdrive = r.gdrive; renderView(false); } catch (e) { toast(e.message, true); } };

// ============================================================ SUGGESTIONS
const SUG_KIND = { idea: ['Suggestion', 'bulb'], bug: ['Bug report', 'bug'], question: ['Question for HR', 'help'] };
const SUG_STATUS = { new: 'New', seen: 'Seen', doing: 'Looking into it', done: 'Done' };
function sugCard(s, adminView) {
  const [kl, ki] = SUG_KIND[s.kind] || SUG_KIND.idea;
  return `<div class="card sug ${s.status}"><div class="row between wrap tight"><span class="row tight small"><span class="sug-ico k-${s.kind}">${ic(ki)}</span><b>${kl}</b>${adminView ? `<span class="muted">from</span> ${avatar(member(s.createdBy), 'xs')}${personName(s.createdBy)}` : ''}</span>
      <span class="row tight"><span class="pill st-${s.status}">${SUG_STATUS[s.status] || 'New'}</span><span class="tiny muted">${timeAgo(s.createdAt)}</span></span></div>
    <p class="pre" style="margin:10px 0 0">${linkify(s.text)}</p>
    ${s.reply ? `<div class="reply"><div class="tiny muted">${personName(s.repliedBy, true)} replied · ${timeAgo(s.repliedAt)}</div><p class="pre">${linkify(s.reply)}</p></div>` : ''}
    ${adminView ? `<form class="stack tight" data-form="sug-reply" data-id="${s.id}" style="margin-top:12px"><textarea name="reply" rows="2" placeholder="Reply to ${esc(firstName(s.createdBy))} (they’ll get a notification)">${esc(s.reply || '')}</textarea>
        <div class="row wrap tight"><select class="input" name="status" style="width:auto" aria-label="Status">${Object.entries(SUG_STATUS).map(([k, l]) => `<option value="${k}" ${s.status === k || (s.status === 'new' && k === 'seen') ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn sm primary">Save</button>${s.status === 'new' ? `<button type="button" class="btn sm" data-act="sug-seen" data-id="${s.id}">Mark as seen</button>` : ''}</div></form>`
      : s.status === 'new' ? `<div class="row" style="margin-top:8px"><button class="btn sm ghost danger" data-act="sug-del" data-id="${s.id}">${ic('trash')}Delete</button></div>` : ''}</div>`;
}
function adminSuggestions() {
  const f = S.sugFilter;
  const all = Object.values(S.suggestions).sort((a, b) => b.createdAt - a.createdAt);
  const list = all.filter((s) => (f === 'open' ? s.status !== 'done' : f === 'all' ? true : s.status === f));
  return `<div class="row wrap" style="margin-bottom:12px"><div class="seg">${[['open', 'Open'], ['new', 'New'], ['done', 'Done'], ['all', 'All']].map(([k, l]) => `<button class="${f === k ? 'on' : ''}" data-act="sug-filter" data-f="${k}">${l} <span class="muted">${all.filter((s) => (k === 'open' ? s.status !== 'done' : k === 'all' ? true : s.status === k)).length}</span></button>`).join('')}</div>
      <span class="small muted">Bug reports, ideas and questions for HR from your team.</span></div>
    ${list.length ? `<div class="stack">${list.map((s) => sugCard(s, true)).join('')}</div>` : `<div class="card empty">${ic('bulb')}<h3>Nothing here</h3><div class="small">When someone sends a suggestion, a bug report or a question for HR, it appears here.</div></div>`}`;
}
A['sug-filter'] = (el) => { S.sugFilter = el.dataset.f; renderView(false); };
A['sug-seen'] = (el) => saveItem('suggestions', el.dataset.id, { status: 'seen' });
F['sug-reply'] = async (f, d) => { await saveItem('suggestions', f.dataset.id, { reply: d.reply, status: d.status }); toast(d.reply ? 'Reply sent' : 'Saved'); };
A['sug-del'] = async (el) => { if (await confirmBox('Delete this message?', 'Your admins won’t see it any more.')) deleteItem('suggestions', el.dataset.id); };
VIEWS.suggest = {
  render() {
    const mine = Object.values(S.suggestions).filter((s) => s.createdBy === S.user.id).sort((a, b) => b.createdAt - a.createdAt);
    return `<div class="page-head"><div><h1>Suggestions</h1><div class="sub">Help improve the site: report a bug, suggest an idea, or ask your administrators or HR a question.</div></div>${isAdmin() ? `<a class="btn" href="#/admin/suggestions">${ic('admin')}<span>See everyone’s</span></a>` : ''}</div>
      <div class="grid two"><form class="card stack" data-form="suggest">
        <div class="field"><span>What is it?</span><div class="chips wrap" role="radiogroup">${Object.entries(SUG_KIND).map(([k, [l, i]], n) => `<button type="button" class="chip ${n === 0 ? 'on' : ''}" data-act="pick-chip" data-v="${k}" role="radio" aria-checked="${n === 0}">${icSize(i, 14)}${l}</button>`).join('')}</div><input type="hidden" name="kind" value="idea"></div>
        <label class="field"><span>Your message</span><textarea name="text" rows="5" required maxlength="4000" placeholder="What’s your idea, what went wrong, or what would you like to ask? For a bug, say what you pressed and what happened."></textarea></label>
        <div class="err-msg" data-err></div>
        <div class="row between wrap"><span class="tiny muted">${icSize('lock', 12, 'vertical-align:-1px')} Only you and your company’s admins can see this.</span><button class="btn primary">${ic('send')}Send</button></div></form>
        <div class="stack"><div class="section-head"><h2>What you’ve sent</h2></div>${mine.length ? mine.map((s) => sugCard(s, false)).join('') : '<div class="card small muted">Nothing yet. Replies from your admins will show here.</div>'}</div></div>`;
  },
};
F.suggest = async (f, d) => { await saveItem('suggestions', null, { kind: d.kind, text: d.text }); f.reset(); toast('Sent — thank you!'); renderView(false); };

// ============================================================ live clocks
setInterval(() => {
  if (!S.company || document.hidden) return;
  const n = Date.now();
  $$('[data-since]').forEach((el) => { el.textContent = fmtElapsed(n - Number(el.dataset.since)); });
  $$('[data-since-dur]').forEach((el) => { const ed = el.querySelector('.edited'); el.textContent = fmtDur((n - Number(el.dataset.sinceDur)) / 60000, true); if (ed) el.appendChild(ed); });
  $$('[data-run]').forEach((el) => { el.textContent = fmtDur(Number(el.dataset.base) + (n - Number(el.dataset.run)) / 60000); });
}, 1000);
