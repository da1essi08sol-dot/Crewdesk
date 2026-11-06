// Builds a fake survey company (Northgate Geomatics) for one real person to try things on.
// Everyone except the owner is fake: their accounts can't sign in and are never emailed (addresses end in .invalid).
'use strict';
const crypto = require('crypto');
function build(owner, mkId) {
  const id = mkId; let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const now = Date.now(); const day = 864e5;
  const PEOPLE = [['Sam Hartley', 'Survey Manager', 'owner'], ['Priya Shah', 'Senior Land Surveyor', 'admin'], ['Tom Fletcher', 'Land Surveyor', 'member'], ['Ellie Moore', 'Junior Surveyor', 'member'],
    ['Daniel Okafor', 'Engineering Surveyor', 'member'], ['Hannah Price', 'Measured Building Surveyor', 'member'], ['Josh Riley', 'Apprentice Surveyor', 'member'], ['Megan Doyle', 'CAD Technician', 'member'],
    ['Ryan Clarke', 'Utility Surveyor', 'member'], ['Aisha Begum', 'Geospatial Analyst', 'member'], ['Luke Bennett', 'Field Surveyor', 'member'], ['Chloe Walsh', 'Office Manager', 'admin'],
    ['Marcus Lee', 'Drone Pilot', 'member'], ['Olivia Grant', 'Graduate Surveyor', 'member']];
  const users = {}, members = {}, U = [];
  PEOPLE.forEach(([name, title, role], i) => { const uid = i === 0 ? owner.id : id();
    if (i === 0) { members[uid] = { role: 'owner', joinedAt: now - 400 * day }; U.push(uid); return; }
    users[uid] = { id: uid, email: name.toLowerCase().replace(/[^a-z]+/g, '.') + '.' + id().slice(0, 5).toLowerCase() + '@demo.invalid', name, salt: crypto.randomBytes(16).toString('hex'), hash: crypto.randomBytes(32).toString('hex'), kdf: owner.kdf, verified: true, demo: true, title, dept: '', phone: '07700 900' + String(100 + i * 7), bio: '', avatar: '', shareLocation: false,
      reads: {}, favs: {}, prefs: { popups: false, tour: true, onboarded: true }, privacy: { showPhone: true, showEmail: true, showCompanies: true, profilePublic: false }, createdAt: now - 400 * day, lastSeen: now };
    members[uid] = { role, joinedAt: now - 400 * day }; U.push(uid); });
  const d = { teams: {}, clients: {}, pings: {}, files: {}, finance: {}, chats: {}, inbox: {}, projects: {}, tasks: {}, photos: {}, events: {}, messages: {}, entries: {}, days: {}, suggestions: {}, sheetUploads: {} };
  const CL = ['Tyne Homes', 'Network Rail', 'Durham County Council', 'Quayside Developments', 'Northumbria Water', 'St Mary’s Academy Trust', 'Harbour Energy'].map((n) => { const c = id(); d.clients[c] = { id: c, name: n, company: '', phone: '', email: '', address: '', notes: '', createdAt: now }; return c; });
  const PRJ = [ // name, ref, client, address, lat, lng, colour, plannedHours, tasks, archived (days ago), folder
    ['Topographic survey — Elm Road plot', '2614', 0, '14 Elm Road, Durham DH1 3LE', 54.776, -1.585, '#18693f', 60, ['Site walk & control', 'Detail survey', 'Levels & spot heights', 'Draw up topo', 'Check & issue']],
    ['A1 Junction 65 — setting out', '2620', 2, 'A1(M) J65, Birtley', 54.905, -1.583, '#1f57a4', 120, ['Control network', 'Set out drainage', 'Set out kerb lines', 'As-built checks']],
    ['Quayside Tower — measured building', '2622', 3, 'Quayside, Newcastle NE1 3DX', 54.969, -1.605, '#7b3fa8', 90, ['Floor plans L0–L4', 'Floor plans L5–L9', 'Elevations', 'Sections', 'Model in Revit']],
    ['Kielder pipeline — utility survey', '2625', 4, 'Kielder Water, Hexham', 55.19, -2.5, '#0b7285', 80, ['PAS 128 desktop', 'GPR sweep', 'Trial holes', 'Utility drawing']],
    ['St Mary’s Academy — extension topo', '2627', 5, 'Front Street, Chester-le-Street', 54.857, -1.574, '#f7c548', 30, ['Detail survey', 'Tree survey points', 'Draw up']],
    ['East Coast Main Line — monitoring', '2630', 1, 'Durham Viaduct', 54.779, -1.58, '#b0284f', 160, ['Install prisms', 'Baseline readings', 'Weekly monitoring', 'Monthly report']],
    ['Harbour Energy — drone orthophoto', '2633', 6, 'Port of Blyth', 55.127, -1.507, '#8ec5ff', 40, ['Flight plan & permissions', 'Fly site', 'Process orthophoto', 'Deliver']],
    ['Tyne Homes — plot 40 setting out', '2634', 0, 'Lamesley Meadows, Gateshead', 54.92, -1.62, '#a35200', 35, ['Building corners', 'Drainage runs', 'Road edges']],
    ['Riverside flats — as-built', '2601', 3, 'Riverside, Sunderland', 54.91, -1.38, '#57564f', 45, ['Detail survey', 'Draw up'], 40, '2026'],
    ['B1288 resurfacing — levels', '2598', 2, 'B1288, Washington', 54.9, -1.52, '#7fd1ae', 25, ['Levels', 'Report'], 55, '2026'],
    ['Seaham harbour wall — monitoring', '2575', 2, 'Seaham Harbour', 54.84, -1.33, '#0b7285', 70, ['Readings', 'Report'], 150, '2026'],
    ['Gateshead library — measured survey', '2550', 2, 'Prince Consort Rd, Gateshead', 54.95, -1.6, '#7b3fa8', 50, ['Plans', 'Elevations'], 260, '2025'],
    ['Hexham bypass — control', '2531', 2, 'A69 Hexham', 54.97, -2.1, '#1f57a4', 40, ['Control', 'Report'], 330, '2025'],
    ['Old mill conversion — topo', '2604', 0, 'Mill Lane, Morpeth', 55.17, -1.69, '#18693f', 20, ['Detail survey'], 20, ''],
  ];
  const P = [];
  PRJ.forEach(([name, ref, ci, address, lat, lng, color, ph, tasks, archAgo, folder], i) => {
    const pid = id(); const arch = archAgo != null; const s = now - (arch ? archAgo + 40 : 30 - i) * day;
    const members2 = [U[0], U[1], ...[2, 3, 4, 5, 6, 8, 10, 12, 13].filter((_, k) => (k + i) % 3 === 0).map((k) => U[k])];
    const p = { id: pid, name, ref, description: arch ? '' : `${name.split(' — ')[1] || name} for ${d.clients[CL[ci]].name}. Site access via the main gate; hi-vis and boots on site at all times.`, clientId: CL[ci], color, start: new Date(s).toISOString().slice(0, 10),
      due: new Date(s + (arch ? 35 : 45) * day).toISOString().slice(0, 10), address, lat, lng, visibility: 'all', members: [], archived: arch, archivedAt: arch ? now - archAgo * day : 0, folder: folder || '', chat: i < 3, plannedHours: ph,
      createdBy: U[i % 2], createdAt: s, updatedAt: s, _team: members2, _tasks: [] };
    d.projects[pid] = p; P.push(p);
    tasks.forEach((t, k) => { const tid = id(); const done = arch || (k < Math.floor(tasks.length * 0.45));
      d.tasks[tid] = { id: tid, projectId: pid, title: t, notes: '', assignees: [members2[(k + 2) % members2.length], members2[(k + 3) % members2.length]].filter((v, j, a) => a.indexOf(v) === j), date: done ? '' : new Date(now + (k - 1) * day).toISOString().slice(0, 10),
        planMins: Math.round(ph * 60 / tasks.length / 30) * 30, done, doneAt: done ? now - 3 * day : 0, order: k, createdBy: p.createdBy, createdAt: s, updatedAt: s }; p._tasks.push(tid); });
  });
  // Time for the last ~10 weeks, every working day except today (today is left for the videos).
  const NOTES = ['Control established, 6 stations', 'Detail along north boundary', 'Levels on drainage runs', 'Drew up first floor', 'Checked against design', 'Set out 12 pegs', 'Prism readings all within tolerance', 'GPR along main road', 'Processed point cloud'];
  const today = new Date(); const t0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  for (let back = 70; back >= 1; back--) {
    const base = t0 - back * day; const dow = new Date(base).getUTCDay(); if (dow === 0 || dow === 6) continue;
    const live = P.filter((p) => !p.archived || p.archivedAt > base); if (!live.length) continue;
    U.forEach((uid, ui) => {
      if (rnd() < 0.05) { const e = id(); d.entries[e] = { id: e, userId: uid, projectId: '', taskId: '', category: 'holiday', note: '', start: base + 8 * 3600e3, end: base + 16.5 * 3600e3, pname: '', pref: '', tname: '', source: 'manual', edited: true, createdAt: base, updatedAt: base }; return; }
      const mine = live.filter((p) => p._team.includes(uid)); const p1 = pick(mine.length ? mine : live), p2 = pick(mine.length ? mine : live);
      const ot = rnd() < 0.12 ? 3600e3 : 0;
      for (const [a, b, cat, p] of [[8, 12, 'field', p1], [12, 12.5, 'lunch', null], [12.5, 16.5 + ot / 3600e3, ui === 7 || ui === 9 ? 'office' : pick(['field', 'office']), p2]]) {
        const e = id(); const tid = p ? pick(p._tasks) : '';
        d.entries[e] = { id: e, userId: uid, projectId: p ? p.id : '', taskId: tid, category: cat, note: p && rnd() < 0.5 ? pick(NOTES) : '', start: base + a * 3600e3, end: base + b * 3600e3,
          pname: p ? p.name : '', pref: p ? p.ref : '', tname: tid ? d.tasks[tid].title : '', source: 'timer', edited: false, createdAt: base, updatedAt: base };
      }
      if (rnd() < 0.35) { const k = uid + '_' + new Date(base).toISOString().slice(0, 10); d.days[k] = { id: k, userId: uid, date: new Date(base).toISOString().slice(0, 10), well: pick(['Good progress, control all closed', 'Finished the detail on the east side', 'Client happy with the drawings']), wrong: pick(['', 'Rain stopped play after lunch', 'Base station battery died']), improve: pick(['', 'Charge batteries the night before', 'Book site access earlier']), finishedAt: base + 16.5 * 3600e3, approvedBy: '', approvedById: '', approvedAt: 0, createdAt: base, updatedAt: base }; }
    });
  }
  // Others already working today (live on the dashboard), but not Sam, who films.
  [2, 3, 4, 6, 8, 10, 12].forEach((ui) => { const uid = U[ui]; const p = pick(P.filter((x) => !x.archived && x._team.includes(uid))) || P[0]; const e = id();
    d.entries[e] = { id: e, userId: uid, projectId: p.id, taskId: pick(p._tasks), category: 'field', note: '', start: t0 + 8 * 3600e3 + ui * 60e3, end: 0, pname: p.name, pref: p.ref, tname: '', source: 'timer', edited: false, createdAt: now, updatedAt: now }; });
  const M = (ch, uid, text, ago) => ({ id: id(), channel: ch, userId: uid, text, images: [], files: [], at: now - ago * 60e3, system: false });
  d.messages.general = [M('general', U[1], 'Morning all — GPS rovers are charged and in the van', 180), M('general', U[2], 'Heading to Elm Road with Ellie', 150), M('general', U[11], 'Reminder: timesheets for October need finishing by Friday', 95), M('general', U[4], 'A1 J65 control is all closed 👍', 40), M('general', U[3], 'Can someone bring a spare prism pole to Durham viaduct?', 12)];
  d.messages['project:' + P[0].id] = [M('project:' + P[0].id, U[1], 'Client wants spot heights on the driveway too', 300), M('project:' + P[0].id, U[2], 'No problem, adding them today', 280), M('project:' + P[0].id, U[3], 'Detail on the north side done', 30)];
  d.messages['project:' + P[1].id] = [M('project:' + P[1].id, U[4], 'Drainage set out for chainage 0–200', 200)];
  const crew = id(); d.chats[crew] = { id: crew, kind: 'group', name: 'Durham field crew', members: [U[0], U[2], U[3], U[6], U[10]], createdBy: U[0], createdAt: now - 60 * day };
  d.messages['chat:' + crew] = [M('chat:' + crew, U[6], 'Van’s outside the office', 70), M('chat:' + crew, U[10], 'Grabbing the total station now', 65), M('chat:' + crew, U[2], 'See you on site', 60)];
  const ev = (title, off, extra = {}) => { const e = id(); const dt = new Date(t0 + off * day).toISOString().slice(0, 10); d.events[e] = Object.assign({ id: e, title, date: dt, endDate: '', allDay: false, start: '09:00', end: '10:30', startsAt: Date.parse(dt + 'T09:00:00Z'), description: '', location: '', participants: [U[0], U[1]], visibility: 'all', projectId: '', createdBy: U[0], createdAt: now, updatedAt: now }, extra); };
  ev('Client meeting — Quayside Tower', 0, { projectId: P[2].id, start: '14:00', end: '15:00' }); ev('Total station calibration', 1, { allDay: true }); ev('CSCS card renewal — Josh', 3); ev('Site visit — Kielder pipeline', 4, { projectId: P[3].id }); ev('Team toolbox talk', 6, { start: '08:00', end: '08:30' }); ev('Network Rail possession', 9, { allDay: true, projectId: P[5].id }); ev('Monthly report due', 12, { allDay: true });
  [['idea', 'Could we get a second drone battery for long flights?', 'new', 3], ['bug', 'Calendar on my phone didn’t show Monday’s site visit', 'seen', 5], ['idea', 'Add a checklist for van kit before leaving the office', 'new', 1], ['question', 'Can I carry over 2 days holiday into next year?', 'done', 9]]
    .forEach(([kind, text, status, ago], i) => { const s = id(); const u = U[[3, 6, 10, 13][i]]; d.suggestions[s] = { id: s, kind, text, status, reply: status === 'done' ? 'Yes — up to 5 days. Chloe' : '', repliedBy: status === 'done' ? U[11] : '', repliedAt: 0, userId: u, createdBy: u, createdAt: now - ago * day, updatedAt: now }; });
  const pg = id(); d.pings[pg] = { id: pg, title: 'New site safety rules', body: 'Hi-vis and boots on every site from Monday. Rail sites need your PTS card.', pinned: true, files: [], readBy: {}, createdBy: U[0], createdAt: now - 2 * day, updatedAt: now - 2 * day };
  // A manhole map on the Elm Road job, part done.
  {
    const pr = {}; const PRE = [['Fire water', '#e5484d', 'hydrant', 'Fire Hydrant'], ['Clean water', '#2f7de1', 'tap', 'Water Tap'], ['Surface water', '#30a46c', 'drop', 'Water Drop'], ['Foul water', '#8d5a33', 'drain', 'Drain'], ['Combined sewer', '#8e4ec6', 'pipe', 'Sewer Pipe'], ['Unknown', '#868e96', 'question', 'Question Mark']];
    d.mhPresets = {}; PRE.forEach(([name, color, icon, iconName], i) => { const pid = id(); pr[name] = pid; d.mhPresets[pid] = { id: pid, cid: '', name, color, icon, iconName, description: '', category: 'Drainage & water', order: i, builtIn: true, createdBy: U[0], createdAt: now - 90 * day, updatedBy: '', updatedAt: now - 90 * day }; });
    d.mhSeeded = true; d.manholes = {}; d.mhMaps = {};
    const elm = P[0]; elm.lat = 54.7762; elm.lng = -1.5849;
    const mapId = id(); d.mhMaps[mapId] = { id: mapId, projectId: elm.id, name: 'Drainage survey', description: 'All chambers on Elm Road and the car park', area: 'Elm Road, Durham', center: { lat: 54.7762, lng: -1.5849 }, zoom: 18.3, layer: 'satellite', seq: 0, createdBy: U[2], createdAt: now - 6 * day, updatedBy: U[2], updatedAt: now - day, log: [] };
    const m = 0.0859, LAT = 54.7762, LNG = -1.5849; const at = (px, py) => ({ lat: Math.round((LAT - ((py - 3072) * m) / 111320) * 1e7) / 1e7, lng: Math.round((LNG + ((px - 3072) * m) / 64180) * 1e7) / 1e7 });
    const SPOTS = [[900, 3043, 'Foul water', 'completed', 1.62], [1500, 3060, 'Surface water', 'completed', 1.1], [2100, 3072, 'Foul water', 'completed', 1.85], [2960, 2400, 'Clean water', 'in_progress', null], [2975, 1500, 'Fire water', 'completed', null],
      [3700, 3093, 'Surface water', 'in_progress', 1.3], [4300, 3105, 'Foul water', 'not_started', null], [5000, 3118, 'Combined sewer', 'not_started', null], [4200, 3480, 'Surface water', 'not_started', null], [2990, 4300, 'Unknown', 'not_started', null], [1400, 4640, 'Foul water', 'in_progress', 2.05]];
    SPOTS.forEach(([px, py, type, status, depth], i) => { const rid = id(); const ref = 'MH' + String(i + 1).padStart(3, '0'); const who = U[[2, 3, 6][i % 3]]; const t = now - (6 - (i % 5)) * day;
      d.manholes[rid] = Object.assign({ id: rid, mapId, projectId: elm.id, ref, presetId: pr[type], type: { name: type, color: d.mhPresets[pr[type]].color, icon: d.mhPresets[pr[type]].icon }, description: i % 3 === 0 ? 'Cast iron cover in the footpath' : '', status,
        survey: { coverLevel: depth ? Math.round((48.2 - i * 0.12) * 100) / 100 : null, invertLevel: depth ? Math.round((48.2 - i * 0.12 - depth) * 100) / 100 : null, depth, diameter: depth ? 1050 : null, material: depth ? (i % 2 ? 'Brick' : 'Precast concrete') : null, pipeDirection: depth ? ['E', 'W', 'N', 'S'][i % 4] : null, pipeDiameter: depth ? 150 : null, pipesIn: depth ? 1 + (i % 2) : null, pipesOut: depth ? 1 : null, condition: depth ? (i % 3 ? 'Good' : 'Fair') : null, accessibility: status === 'not_started' ? null : 'Accessible', observations: depth && i % 4 === 0 ? 'Light silt in the channel' : null },
        photos: [], notes: status === 'in_progress' ? [{ id: id(), by: who, at: t + 3600e3, text: 'Cover seized — coming back with a lifter tomorrow' }] : [], createdBy: who, createdAt: t, updatedBy: who, updatedAt: t + 3600e3, editors: [who], v: 2, fv: {},
        history: [{ at: t, by: who, action: 'created', detail: `Added ${ref} (${type})` }].concat(status !== 'not_started' ? [{ at: t + 3600e3, by: who, action: 'status', detail: `Status: not started → ${status.replace('_', ' ')}` }] : []) }, at(px, py));
      d.mhMaps[mapId].seq = i + 1; });
  }
  // Two office teams.
  d.teams = {};
  [['Gateshead office', '#1f57a4', [0, 1, 2, 3, 6, 7, 11]], ['Warrington office', '#b0284f', [4, 5, 8, 9, 10, 12, 13]]].forEach(([name, color, ix]) => { const tid = id(); d.teams[tid] = { id: tid, name, color, members: ix.map((i) => U[i]), createdBy: U[0], createdAt: now - 200 * day, updatedAt: now - 200 * day }; });
  // Realistic plans: most projects on track, one a little over.
  const act = {}, tact = {}; for (const e of Object.values(d.entries)) if (e.projectId && e.category !== 'lunch') { const m = ((e.end || now) - e.start) / 60000; act[e.projectId] = (act[e.projectId] || 0) + m; tact[e.taskId] = (tact[e.taskId] || 0) + m; }
  P.forEach((p, i) => { const a = act[p.id] || 0; const f = i === 1 ? 0.92 : p.archived ? 1.05 : 1.25 + (i % 3) * 0.12; p.plannedHours = Math.round(a / 60 * f / 5) * 5 || p.plannedHours;
    for (const tid of p._tasks) d.tasks[tid].planMins = Math.round(((tact[tid] || 0) * (d.tasks[tid].done ? 1.05 : f + 0.2)) / 30) * 30 || 120; });
  for (const p of P) { delete p._team; delete p._tasks; }
  return { users, members, data: d };
}
module.exports = { build };
