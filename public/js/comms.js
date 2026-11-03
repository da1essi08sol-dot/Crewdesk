/* Chat (company, job, direct and group chats), pings and notifications, team and map, profiles, clients. */
'use strict';

// ============================================================ CHAT
function chatName(c) {
  if (!c) return 'Chat';
  if (c.kind === 'dm') { const other = c.members.find((id) => id !== S.user.id); return other ? member(other).name : 'Just you'; }
  return c.name;
}
function channelInfo(ch) {
  if (ch === 'general') return { name: S.company.name, sub: `Everyone · ${plural(Object.keys(S.members).length, 'member')}`, icon: 'hash', kind: 'general' };
  if (ch.startsWith('job:')) { const j = S.jobs[ch.slice(4)]; return j ? { name: j.title, sub: `${j.ref} · ${STATUS[j.status]}`, icon: 'jobs', job: j, kind: 'job' } : null; }
  if (ch.startsWith('chat:')) {
    const c = S.chats[ch.slice(5)]; if (!c) return null;
    if (c.kind === 'dm') { const other = c.members.find((id) => id !== S.user.id); const m = member(other); return { name: m.name, sub: m.online ? 'Online' : 'Last seen ' + timeAgo(m.lastSeen), icon: 'user', chat: c, other, kind: 'dm' }; }
    return { name: c.name, sub: plural(c.members.length, 'person', 'people'), icon: 'users', chat: c, kind: 'group' };
  }
  return null;
}
function channelList(active) {
  const row = (ch, info) => {
    const lm = S.lastMsg[ch]; const un = S.unread[ch] || 0;
    const preview = lm ? (lm.system ? lm.text : `${lm.userId === S.user.id ? 'You' : firstName(lm.userId)}: ${lm.text}`) : info.sub;
    const icon = info.kind === 'dm' ? avatar(member(info.other), 'sm', { link: false, dot: true }) : `<span class="chan-ico" ${info.job ? `style="color:${STATUS_COLOR[info.job.status]}"` : ''}>${ic(info.icon)}</span>`;
    return `<a class="chan ${active === ch ? 'on' : ''}" href="#/chat/${ch}" ${active === ch ? 'aria-current="page"' : ''}>${icon}
      <div class="grow"><div class="row between"><b class="ellipsis">${esc(info.name)}</b>${lm ? `<span class="tiny muted" style="flex:none">${timeAgo(lm.at)}</span>` : ''}</div>
        <div class="row between"><span class="small muted ellipsis">${esc(preview)}</span>${un ? `<span class="count">${un}</span>` : ''}</div></div></a>`;
  };
  const recent = (ch) => (S.lastMsg[ch] || {}).at || 0;
  const chats = Object.values(S.chats);
  const dms = chats.filter((c) => c.kind === 'dm').sort((a, b) => (recent('chat:' + b.id) || b.createdAt) - (recent('chat:' + a.id) || a.createdAt));
  const groups = chats.filter((c) => c.kind !== 'dm').sort((a, b) => (recent('chat:' + b.id) || b.createdAt) - (recent('chat:' + a.id) || a.createdAt));
  const jobs = Object.values(S.jobs).filter((j) => j.status !== 'done' || S.lastMsg['job:' + j.id]).sort((a, b) => (recent('job:' + b.id) || b.createdAt) - (recent('job:' + a.id) || a.createdAt));
  return `<div class="row between" style="padding:12px 16px"><b>Chats</b><button class="btn sm primary" data-act="new-chat">${ic('plus')}New chat</button></div>
    ${row('general', channelInfo('general'))}
    ${dms.length ? `<div class="chan-group label">Direct messages</div>${dms.map((c) => row('chat:' + c.id, channelInfo('chat:' + c.id))).join('')}` : ''}
    ${groups.length ? `<div class="chan-group label">Groups</div>${groups.map((c) => row('chat:' + c.id, channelInfo('chat:' + c.id))).join('')}` : ''}
    ${jobs.length ? `<div class="chan-group label">Job chats</div>${jobs.map((j) => row('job:' + j.id, channelInfo('job:' + j.id))).join('')}` : ''}`;
}
function chatPane(ch, embedded = false) {
  const t = channelInfo(ch) || { name: 'Chat', sub: '', icon: 'chat' };
  const icon = t.kind === 'dm' ? avatar(member(t.other), '', { dot: true }) : `<span class="chan-ico" style="width:36px;height:36px">${ic(t.icon)}</span>`;
  return `<div class="chat-pane ${embedded ? 'embedded' : ''}" data-ch="${esc(ch)}">
    ${embedded ? '' : `<div class="chat-top"><a class="btn ghost sm icon" href="#/chat" aria-label="All chats" style="${wide() ? 'display:none' : ''}">${ic('back')}</a>
      ${icon}<div class="grow"><b class="ellipsis" style="display:block">${t.kind === 'dm' ? personName(t.other) : esc(t.name)}</b><span class="tiny muted" data-chat-sub>${esc(t.sub)}</span></div>
      ${t.kind === 'group' ? `<span class="row tight">${avatarStack(t.chat.members, 4)}<button class="btn sm" data-act="chat-manage" data-id="${t.chat.id}">${ic('users')}<span>People</span></button></span>` : ''}
      ${t.job ? `<a class="btn sm" href="#/job/${t.job.id}">Open job</a>` : ''}</div>`}
    <div class="msgs" data-msgs role="log" aria-live="polite" aria-label="Messages"><div class="empty small">Loading…</div></div>
    <div class="attach-preview hidden" data-attach></div>
    <form class="composer" data-form="send" data-ch="${esc(ch)}">
      <button type="button" class="btn ghost icon" data-act="attach" data-ch="${esc(ch)}" aria-label="Add photos">${ic('camera')}</button>
      <textarea name="text" rows="1" placeholder="Message ${esc(t.kind === 'dm' ? t.name.split(' ')[0] : t.kind === 'general' ? 'everyone' : t.kind === 'job' ? 'the job crew' : t.name)}…" data-input="autosize" enterkeyhint="send" aria-label="Message"></textarea>
      <button class="btn primary" aria-label="Send">${ic('send')}</button>
    </form>
  </div>`;
}
async function mountChat(ch) {
  const pane = $(`.chat-pane[data-ch="${CSS.escape(ch)}"]`); if (!pane) return;
  if (!S.msgs[ch]) {
    try { const r = await capi('GET', `/messages?channel=${encodeURIComponent(ch)}`); S.msgs[ch] = r.items; S.msgsMore[ch] = r.more; }
    catch (e) { $('[data-msgs]', pane).innerHTML = `<div class="empty small">${esc(e.message)}</div>`; return; }
  }
  renderMsgs(pane, ch, true); paintAttach(ch);
  if (S.unread[ch]) { markRead(ch); scheduleRender(); }
}
function refreshPanes(ch) { $$('.chat-pane').forEach((pane) => { if (pane.dataset.ch === ch && S.msgs[ch]) renderMsgs(pane, ch); }); }
const msgImages = (m) => (m.images && m.images.length ? m.images : m.image ? [m.image] : []);
function msgPreview(m) { const n = msgImages(m).length; return m.text || (n > 1 ? `📷 ${n} photos` : n ? '📷 Photo' : ''); }
function renderMsgs(pane, ch, forceBottom = false) {
  const box = $('[data-msgs]', pane);
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  const arr = S.msgs[ch] || [];
  let html = S.msgsMore[ch] ? `<button class="btn sm" style="align-self:center;margin-bottom:8px" data-act="older" data-ch="${esc(ch)}">Load earlier messages</button>` : '';
  if (!arr.length) html += `<div class="empty small" style="margin:auto">${ic('chat')}<div>No messages yet — say hello.</div></div>`;
  let lastDay = '';
  arr.forEach((m, i) => {
    const day = new Date(m.at).toDateString();
    if (day !== lastDay) { html += `<div class="daysep">${esc(dayLabel(m.at))}</div>`; lastDay = day; }
    if (m.system) { html += `<div class="sys">${esc(m.text)} · ${clock(m.at)}</div>`; return; }
    const prev = arr[i - 1], next = arr[i + 1];
    const startRun = !prev || prev.system || prev.userId !== m.userId || m.at - prev.at > 300000 || new Date(prev.at).toDateString() !== day;
    const endRun = !next || next.system || next.userId !== m.userId || next.at - m.at > 300000 || new Date(next.at).toDateString() !== day;
    const mine = m.userId === S.user.id; const who = member(m.userId);
    if (startRun && !mine) html += `<div class="msg-who">${personName(m.userId)}</div>`;
    const imgs = msgImages(m);
    html += `<div class="msg ${mine ? 'mine' : ''} ${endRun ? 'last' : ''}" style="${startRun && mine ? 'margin-top:8px' : ''}">
      ${mine ? '' : avatar(who, 'sm')}
      <div class="bubble">${imgs.length ? `<div class="bubble-photos ${imgs.length === 1 ? 'one' : ''}">${imgs.map((u, k) => `<button type="button" data-act="chat-photo" data-ch="${esc(ch)}" data-msg="${m.id}" data-i="${k}" aria-label="Open photo ${k + 1} from ${esc(who.name)}"><img src="${esc(u)}" alt="Photo from ${esc(who.name)}" loading="lazy" decoding="async"></button>`).join('')}</div>` : ''}${m.text ? linkify(m.text) : ''}</div>
      <span class="msg-time" title="${esc(fmtDateTime(m.at))}">${clock(m.at)}</span></div>`;
  });
  box.innerHTML = html;
  $$('img', box).forEach((img) => img.addEventListener('load', () => { if (forceBottom || nearBottom) box.scrollTop = box.scrollHeight; }, { once: true }));
  if (forceBottom || nearBottom) box.scrollTop = box.scrollHeight;
  const sub = $('[data-chat-sub]', pane); const info = channelInfo(ch); if (sub && info) sub.textContent = info.sub;
}
function onMessage(m) {
  const arr = S.msgs[m.channel];
  if (arr && !arr.some((x) => x.id === m.id)) arr.push(m);
  S.lastMsg[m.channel] = { at: m.at, text: msgPreview(m), userId: m.userId, system: m.system };
  const viewing = currentChannel() === m.channel && !document.hidden;
  if (m.userId !== S.user.id && !m.system) {
    if (viewing) markRead(m.channel);
    else {
      S.unread[m.channel] = (S.unread[m.channel] || 0) + 1;
      const info = channelInfo(m.channel);
      const where = info ? (info.kind === 'dm' ? 'Direct message' : info.name) : 'Chat';
      if (parseHash().name !== 'chat') alertUser(`${firstName(m.userId)} · ${where}: ${msgPreview(m)}`.slice(0, 140), '#/chat/' + m.channel, m.text);
    }
  }
  refreshPanes(m.channel); scheduleRender();
}
function currentChannel() { const p = $('.chat-pane'); return p ? p.dataset.ch : null; }
const readTimers = {};
function markRead(ch) {
  S.unread[ch] = 0;
  clearTimeout(readTimers[ch]);
  readTimers[ch] = setTimeout(() => capi('POST', '/read', { channel: ch }).catch(() => {}), 400);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.company) { const ch = currentChannel(); if (ch && S.unread[ch]) { markRead(ch); scheduleRender(); } } });
VIEWS.chat = {
  render(ch) {
    if (!ch && wide()) ch = 'general';
    if (ch && !channelInfo(ch)) ch = wide() ? 'general' : null;
    if (!ch) return `<h1 class="sr-only">Chat</h1><div class="card flush" id="chanlist">${channelList(null)}</div>`;
    return `<h1 class="sr-only">Chat</h1><div class="chat-layout">${wide() ? `<div class="card flush" id="chanlist">${channelList(ch)}</div>` : ''}${chatPane(ch)}</div>`;
  },
  mount() { const p = $('.chat-pane'); if (p) mountChat(p.dataset.ch); },
  update() {
    const pane = $('.chat-pane');
    const cl = $('#chanlist'); if (cl) { const st = cl.scrollTop; cl.innerHTML = channelList(pane ? pane.dataset.ch : null); cl.scrollTop = st; }
    if (pane) { const info = channelInfo(pane.dataset.ch); if (!info) return renderView(false); const sub = $('[data-chat-sub]', pane); if (sub) sub.textContent = info.sub; }
  },
};
A.older = async (el) => {
  const ch = el.dataset.ch; const first = (S.msgs[ch] || [])[0]; if (!first) return;
  el.disabled = true;
  try {
    const r = await capi('GET', `/messages?channel=${encodeURIComponent(ch)}&before=${first.at}`);
    S.msgs[ch] = r.items.concat(S.msgs[ch]); S.msgsMore[ch] = r.more;
    const pane = el.closest('.chat-pane'); const box = $('[data-msgs]', pane); const h = box.scrollHeight;
    renderMsgs(pane, ch); box.scrollTop = box.scrollHeight - h;
  } catch (e) { toast(e.message, true); el.disabled = false; }
};
A['chat-photo'] = (el) => {
  const m = (S.msgs[el.dataset.ch] || []).find((x) => x.id === el.dataset.msg); if (!m) return;
  const info = channelInfo(el.dataset.ch);
  openViewer(msgImages(m).map((u, k) => ({ url: u, by: m.userId, at: m.at, caption: k === 0 ? m.text : '', where: info ? info.name : 'Chat', alt: `Photo from ${member(m.userId).name}` })), Number(el.dataset.i) || 0);
};
F.send = async (f, d) => {
  const ch = f.dataset.ch; const text = (d.text || '').trim(); const imgs = pendingImgs[ch] || [];
  if (!text && !imgs.length) return;
  const ta = f.querySelector('textarea'); const btn = f.querySelector('button:not([type=button])');
  btn.disabled = true;
  try {
    const r = imgs.length
      ? await sendWithProgress('POST', `/api/c/${S.cid}/messages`, { channel: ch, text, images: imgs.map((p) => p.data) }, (x) => { btn.style.opacity = String(0.4 + x * 0.6); })
      : await capi('POST', '/messages', { channel: ch, text });
    ta.value = ''; ta.style.height = ''; delete pendingImgs[ch]; paintAttach(ch);
    onMessage(r.item);
    const box = $('[data-msgs]', f.closest('.chat-pane')); box.scrollTop = box.scrollHeight;
  } finally { btn.disabled = false; btn.style.opacity = ''; if (matchMedia('(hover:hover)').matches) ta.focus(); }
};
I.autosize = (el) => { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 140) + 'px'; };
// New chat: a direct message with one person, or a named group.
A['new-chat'] = (el) => {
  const preset = el && el.dataset && el.dataset.with;
  if (preset) return startDm(preset);
  sheet(`${sheetHead('New chat')}
    <form class="stack" data-form="new-chat">
      <div class="seg" role="radiogroup"><button type="button" class="on" data-act="chat-kind" data-k="dm" role="radio" aria-checked="true">Direct message</button><button type="button" data-act="chat-kind" data-k="group" role="radio" aria-checked="false">Group chat</button></div>
      <input type="hidden" name="kind" value="dm">
      <label class="field hidden" data-groupname><span>Group name</span><input name="name" placeholder="e.g. Office team, Weekend crew" maxlength="80"></label>
      <div class="field"><span data-pick-label>Who do you want to message?</span>${peoplePicker([], 'people', { exclude: [S.user.id] })}</div>
      <div class="err-msg" data-err></div>
      <div class="sheet-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Start chat</button></div>
    </form>`, (sh) => {
    sh.addEventListener('click', (e) => { // a direct message is with one person: picking someone clears the others
      const chip = e.target.closest('.person-chip'); if (!chip || sh.querySelector('input[name=kind]').value !== 'dm') return;
      $$('.person-chip', sh).forEach((c) => { if (c !== chip) { c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); } });
    });
  });
};
A['chat-kind'] = (el) => {
  const f = el.closest('form');
  $$('[data-act="chat-kind"]', f).forEach((b) => { b.classList.toggle('on', b === el); b.setAttribute('aria-checked', b === el); });
  f.querySelector('input[name=kind]').value = el.dataset.k;
  f.querySelector('[data-groupname]').classList.toggle('hidden', el.dataset.k !== 'group');
  f.querySelector('[data-pick-label]').textContent = el.dataset.k === 'group' ? 'Who’s in the group?' : 'Who do you want to message?';
  if (el.dataset.k === 'dm') { const on = $$('.person-chip.on', f); on.slice(1).forEach((c) => c.classList.remove('on')); }
};
F['new-chat'] = async (f, d, close) => {
  const people = picked(f);
  if (!people.length) throw new Error('Pick at least one person');
  if (d.kind === 'group' && !d.name.trim()) throw new Error('Give the group a name');
  const r = await capi('POST', '/chats', d.kind === 'dm' ? { kind: 'dm', members: people.slice(0, 1) } : { kind: 'group', name: d.name, members: people });
  S.chats[r.item.id] = r.item; close(); location.hash = '#/chat/chat:' + r.item.id;
};
async function startDm(uid) {
  try { const r = await capi('POST', '/chats', { kind: 'dm', members: [uid] }); S.chats[r.item.id] = r.item; closeSheets(); location.hash = '#/chat/chat:' + r.item.id; }
  catch (e) { toast(e.message, true); }
}
A['message-person'] = (el) => startDm(el.dataset.id);
A['chat-manage'] = (el) => {
  const c = S.chats[el.dataset.id]; if (!c) return;
  const manage = c.createdBy === S.user.id || isAdmin();
  sheet(`${sheetHead(c.name)}
    ${manage ? `<form class="stack" data-form="chat-edit" data-id="${c.id}">
      <label class="field"><span>Group name</span><input name="name" value="${esc(c.name)}" required maxlength="80"></label>
      <div class="field"><span>People in this group</span>${peoplePicker(c.members.filter((id) => id !== S.user.id), 'people', { exclude: [S.user.id] })}</div>
      <div class="err-msg" data-err></div>
      <div class="sheet-foot"><button type="button" class="btn danger" data-act="chat-delete" data-id="${c.id}" style="margin-right:auto">${ic('trash')}Delete group</button><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div></form>`
    : `<div class="stack tight">${c.members.map((id) => `<div class="row">${avatar(member(id), 'sm')}${personName(id)}${id === c.createdBy ? '<span class="tiny muted">made the group</span>' : ''}</div>`).join('')}</div>
      <p class="small muted" style="margin-top:12px">Only ${personName(c.createdBy)} or an admin can change who’s in this group.</p>
      <div class="sheet-foot"><button type="button" class="btn danger" data-act="chat-leave" data-id="${c.id}">${ic('logout')}Leave group</button><button type="button" class="btn" data-close>Close</button></div>`}`);
};
F['chat-edit'] = async (f, d, close) => {
  const r = await capi('PATCH', `/chats/${f.dataset.id}`, { name: d.name, members: picked(f) });
  S.chats[r.item.id] = r.item; close(); scheduleRender(); toast('Group updated');
};
A['chat-leave'] = async (el) => {
  if (!(await confirmBox('Leave this group?', 'You won’t see new messages unless someone adds you back.', 'Leave'))) return;
  try { await capi('POST', `/chats/${el.dataset.id}/leave`); delete S.chats[el.dataset.id]; closeSheets(); location.hash = '#/chat'; } catch (e) { toast(e.message, true); }
};
A['chat-delete'] = async (el) => {
  closeSheets();
  if (!(await confirmBox('Delete this group?', 'The group and all its messages will be deleted for everyone.'))) return;
  try { await capi('DELETE', `/chats/${el.dataset.id}`); delete S.chats[el.dataset.id]; location.hash = '#/chat'; } catch (e) { toast(e.message, true); }
};

// ============================================================ PINGS & NOTIFICATIONS
function pingRow(p, compact = false) {
  const canSeeReads = p.createdBy === S.user.id || isAdmin();
  return `<div class="ping ${p.read ? '' : 'unread'}" data-act="open-ping" data-id="${p.id}" role="link" tabindex="0" aria-label="${esc(p.title)}${p.read ? '' : ', unread'}">
    ${p.read ? '' : '<span class="dot-unread corner" title="Unread"></span>'}
    <div class="row tight">${p.pinned ? `<span class="pill st-active">${icSize('pin', 11)}Pinned</span>` : ''}<h3 class="ellipsis">${esc(p.title)}</h3></div>
    ${p.body ? `<div class="body ${compact ? 'clamp2' : 'clamp2'}">${esc(p.body)}</div>` : ''}
    ${attStrip(p.files, compact ? 4 : 6)}
    <div class="by">${avatar(member(p.createdBy), 'xs')}${personName(p.createdBy)}<span>·</span><time datetime="${new Date(p.createdAt).toISOString()}">${esc(fmtDateTime(p.createdAt))}</time>${canSeeReads && !compact ? `<span>·</span><span>Seen by ${p.readCount}</span>` : ''}</div>
  </div>`;
}
VIEWS.pings = {
  render(tab) {
    S.pingTab = tab === 'activity' ? 'activity' : 'pings';
    const unreadN = unreadPings(); const inboxN = S.inbox.filter((n) => !n.read).length;
    const head = `<div class="page-head"><div><h1>Pings</h1><div class="sub">Company-wide updates anyone can post, plus your own notifications.</div></div>
      <div class="row tight">${canPing() ? `<button class="btn primary" data-act="new-ping">${ic('plus')}<span>New ping</span></button>` : ''}</div></div>
      <div class="row between wrap" style="margin-bottom:14px"><div class="seg"><a href="#/pings" class="${S.pingTab === 'pings' ? 'on' : ''}">Pings${unreadN ? ` <span class="count">${unreadN}</span>` : ''}</a><a href="#/pings/activity" class="${S.pingTab === 'activity' ? 'on' : ''}">My notifications${inboxN ? ` <span class="count">${inboxN}</span>` : ''}</a></div>
      ${S.pingTab === 'pings' && unreadN ? `<button class="btn sm ghost" data-act="pings-read-all">${ic('check')}Mark all read</button>` : ''}
      ${S.pingTab === 'activity' && S.inbox.length ? `<span class="row tight">${inboxN ? `<button class="btn sm ghost" data-act="inbox-read-all">${ic('check')}Mark all read</button>` : ''}<button class="btn sm ghost" data-act="inbox-clear">Clear</button></span>` : ''}</div>`;
    if (S.pingTab === 'activity') {
      const items = S.inbox.slice().reverse();
      return head + `<div class="card flush">${items.length ? `<div class="list">${items.map((n) => `<a class="item" href="${esc(n.link || '#/home')}" data-act="inbox-open" data-id="${n.id}">${n.read ? '<span style="width:9px;flex:none"></span>' : '<span class="dot-unread" title="Unread"></span>'}
        <span class="grow"><span style="display:block;${n.read ? '' : 'font-weight:600'}">${esc(n.text)}</span><span class="tiny muted">${esc(fmtDateTime(n.at))}</span></span>${icSize('right', 16, 'color:var(--muted)')}</a>`).join('')}</div>`
        : `<div class="empty">${ic('bell')}<h3>No notifications</h3><div class="small">When someone assigns you to a job, gives you a task or adds you to an event, it shows up here.</div></div>`}</div>
        <p class="small muted" style="margin-top:12px">Turn pop-up alerts on or off in <a href="#/profile">your settings</a>.</p>`;
    }
    const list = Object.values(S.pings).sort((a, b) => (b.pinned - a.pinned) || (b.createdAt - a.createdAt));
    return head + `<div class="card flush">${list.length ? list.map((p) => pingRow(p)).join('') : `<div class="empty">${ic('ping')}<h3>No pings yet</h3><div class="small">Pings are company-wide updates — a new rule on site, a photo of finished work, a document everyone needs.</div>${canPing() ? `<button class="btn primary" data-act="new-ping">${ic('plus')}New ping</button>` : ''}</div>`}</div>`;
  },
};
VIEWS.ping = {
  render(id) {
    const p = S.pings[id];
    if (!p) return `<a class="back" href="#/pings">${ic('back')}Pings</a><div class="card empty"><h3>Ping not found</h3><div class="small">It may have been deleted.</div></div>`;
    const imgs = (p.files || []).filter((f) => f.kind === 'image'); const docs = (p.files || []).filter((f) => f.kind !== 'image');
    const canEdit = isAdmin() || p.createdBy === S.user.id;
    return `<a class="back" href="#/pings">${ic('back')}Pings</a>
      <article class="card stack">
        <div class="row between top"><div class="grow"><div class="row tight">${p.pinned ? `<span class="pill st-active">${icSize('pin', 11)}Pinned</span>` : ''}</div><h1 style="margin-top:4px">${esc(p.title)}</h1></div>
          ${canEdit ? `<div class="row tight">${isAdmin() ? `<button class="btn sm" data-act="ping-pin" data-id="${p.id}">${p.pinned ? 'Unpin' : 'Pin'}</button>` : ''}<button class="btn sm icon" data-act="edit-ping" data-id="${p.id}" aria-label="Edit ping">${ic('edit')}</button><button class="btn sm icon danger" data-act="del-ping" data-id="${p.id}" aria-label="Delete ping">${ic('trash')}</button></div>` : ''}</div>
        <div class="row small muted">${avatar(member(p.createdBy), 'sm')}<span>${personName(p.createdBy)} · <time datetime="${new Date(p.createdAt).toISOString()}">${esc(fmtDateTime(p.createdAt))}</time>${p.updatedAt && p.updatedAt - p.createdAt > 60000 ? ' · edited' : ''}</span></div>
        ${p.body ? `<div class="pre">${linkify(p.body)}</div>` : ''}
        ${imgs.length ? `<div><div class="label" style="margin-bottom:6px">Photos (${imgs.length})</div><div class="att-grid">${imgs.map((f) => `<button type="button" data-act="att-view" data-file="${f.id}" aria-label="View ${esc(f.name)}"><img src="${esc(f.thumb || f.url)}" alt="${esc(f.name)}" loading="lazy"></button>`).join('')}</div></div>` : ''}
        ${docs.length ? `<div><div class="label" style="margin-bottom:6px">Documents (${docs.length})</div><div class="stack tight">${docs.map((f) => `<div class="att-row"><span class="att-doc" style="height:auto;border:0;padding:0"><span class="ext ${esc(f.ext)}">${esc(f.ext)}</span></span><div class="grow"><div class="ellipsis bold small">${esc(f.name)}</div><div class="tiny muted">${fileSize(f.size)}</div></div>
          ${f.ext === 'pdf' ? `<a class="btn sm" href="${esc(f.url)}?view=1" target="_blank" rel="noopener">${ic('eye')}View</a>` : ''}<a class="btn sm" href="${esc(f.url)}" download="${esc(f.name)}">${ic('download')}Download</a></div>`).join('')}</div></div>` : ''}
        ${p.createdBy === S.user.id || isAdmin() ? `<div class="tiny muted">${ic('eye').replace('<svg', '<svg width="13" height="13" style="vertical-align:-2px"')} Seen by ${p.readCount} of ${Object.keys(S.members).length}</div>` : ''}
      </article>`;
  },
  mount(id) {
    const p = S.pings[id];
    if (p && !p.read) { p.read = true; updateChrome(); capi('POST', `/pings/${id}/read`).then((r) => { S.pings[id] = r.item; }).catch(() => {}); }
  },
};
A['open-ping'] = (el, e) => { if (e && e.target.closest('a,button,[data-person]') && e.target.closest('a,button,[data-person]') !== el) return; location.hash = '#/ping/' + el.dataset.id; };
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches && e.target.matches('.ping[data-act="open-ping"]')) location.hash = '#/ping/' + e.target.dataset.id; });
A['att-view'] = (el) => {
  const p = Object.values(S.pings).find((x) => (x.files || []).some((f) => f.id === el.dataset.file)); if (!p) return;
  const imgs = p.files.filter((f) => f.kind === 'image');
  openViewer(imgs.map((f) => ({ url: f.url, by: p.createdBy, at: p.createdAt, caption: f.name, where: p.title, alt: f.name })), imgs.findIndex((f) => f.id === el.dataset.file));
};
A['pings-read-all'] = async () => { for (const p of Object.values(S.pings)) p.read = true; scheduleRender(); try { await capi('POST', '/pings/read-all'); } catch (e) { toast(e.message, true); } };
A['inbox-open'] = (el) => { const n = S.inbox.find((x) => x.id === el.dataset.id); if (n && !n.read) { n.read = true; capi('POST', '/inbox/read', { ids: [n.id] }).catch(() => {}); updateChrome(); } location.hash = el.getAttribute('href'); };
A['inbox-read-all'] = async () => { S.inbox.forEach((n) => { n.read = true; }); scheduleRender(); try { await capi('POST', '/inbox/read', {}); } catch (e) { toast(e.message, true); } };
A['inbox-clear'] = async () => { S.inbox = []; scheduleRender(); try { await capi('DELETE', '/inbox'); } catch (e) { toast(e.message, true); } };
A['ping-pin'] = (el) => saveItem('pings', el.dataset.id, { pinned: !S.pings[el.dataset.id].pinned });
A['del-ping'] = async (el) => { const p = S.pings[el.dataset.id]; if (await confirmBox('Delete this ping?', `“${p.title}” and its attachments will be removed for everyone.`)) { if (await deleteItem('pings', p.id)) location.hash = '#/pings'; } };
function pingSheet(p) {
  const v = p || { title: '', body: '', pinned: false, files: [] };
  sheet(`${sheetHead(p ? 'Edit ping' : 'New ping')}<form class="stack" data-form="ping" data-id="${p ? p.id : ''}">
    <label class="field"><span>Title</span><input name="title" value="${esc(v.title)}" required maxlength="150" placeholder="e.g. New site rules from Monday"></label>
    <label class="field"><span>Message</span><textarea name="body" rows="6" placeholder="Write your update…">${esc(v.body)}</textarea></label>
    ${attachmentBox(v.files || [])}
    ${isAdmin() ? `<label class="row" style="gap:8px"><span class="switch"><input type="checkbox" name="pinned" ${v.pinned ? 'checked' : ''}><i></i></span><span>Pin to the top</span></label>` : ''}
    <p class="small muted" style="margin:0">Everyone in ${esc(S.company.name)} will see this ping, with a red dot until they’ve read it.</p>
    <div class="err-msg" data-err></div>
    <div class="sheet-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${p ? 'Save' : 'Send ping'}</button></div></form>`, null, { wide: true });
}
A['new-ping'] = () => pingSheet(null);
A['edit-ping'] = (el) => pingSheet(S.pings[el.dataset.id]);
F.ping = async (f, d, close) => {
  if (f._pending) throw new Error('Wait for your attachments to finish uploading');
  const body = { title: d.title, body: d.body, files: attachedIds(f) };
  if (isAdmin()) body.pinned = !!d.pinned;
  const item = await saveItem('pings', f.dataset.id || null, body);
  close(); toast(f.dataset.id ? 'Ping updated' : 'Ping sent to everyone'); if (!f.dataset.id) location.hash = '#/ping/' + item.id;
};

// ============================================================ TEAM & MAP
VIEWS.team = {
  render() {
    const sharing = !!S.user.shareLocation;
    return `<div class="page-head"><div><h1>Team</h1><div class="sub">${plural(Object.keys(S.members).length, 'person', 'people')} in ${esc(S.company.name)}</div></div>${canInvite() ? `<button class="btn primary" data-act="invite-new">${ic('userplus')}<span>Invite people</span></button>` : ''}</div>
      <div class="stack">
        <label class="loc-banner">${ic('locate')}<div class="grow"><b>Share my live location</b><div class="small muted">Your company sees where you are while Crewdesk is open on your phone. Turn it off any time.</div></div>
          <span class="switch"><input type="checkbox" ${sharing ? 'checked' : ''} data-change="share-loc" aria-label="Share my live location"><i></i></span></label>
        ${!window.isSecureContext ? `<div class="warn">Location needs a secure <b>https://</b> link.</div>` : ''}
        <div class="row between wrap" style="gap:8px"><span class="small muted">Zoom right in to see buildings, house numbers and footpaths.</span>
          <div class="seg" role="radiogroup" aria-label="Map style">${Object.entries(MAP_STYLES).map(([k, l]) => `<button type="button" class="${mapStyle() === k ? 'on' : ''}" data-act="map-style" data-s="${k}" role="radio" aria-checked="${mapStyle() === k}">${l}</button>`).join('')}</div></div>
        <div id="map" role="region" aria-label="Map of people and job sites"></div>
        <div class="grid halves">
          <div><div class="section-head"><h2>People</h2></div><div class="card flush" id="team-people">${this.people()}</div></div>
          <div><div class="section-head"><h2>Teams</h2>${isAdmin() ? `<button class="btn sm" data-act="team-edit">${ic('plus')}New team</button>` : ''}</div><div id="team-teams">${this.teams()}</div></div>
        </div>
      </div>`;
  },
  mount() { drawMap(); },
  update() { const a = $('#team-people'), b = $('#team-teams'); if (a) a.innerHTML = this.people(); if (b) b.innerHTML = this.teams(); updateMap(); },
  people() {
    const ms = Object.values(S.members).sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name));
    return `<div class="list">${ms.map((m) => `<a class="item" href="#/person/${m.id}">${avatar(m, '', { dot: true, link: false })}
      <div class="grow"><div class="row tight"><b class="ellipsis">${esc(m.name)}</b>${m.id === S.user.id ? '<span class="tiny muted">(you)</span>' : ''}</div>
      <div class="small muted ellipsis">${esc([m.title, m.dept, m.online ? 'Online' : 'Last seen ' + timeAgo(m.lastSeen)].filter(Boolean).join(' · '))}</div></div>
      ${S.locations[m.id] ? `<span class="muted" title="Sharing location">${icSize('pin', 16)}</span>` : ''}
      ${m.role !== 'member' ? `<span class="pill">${ROLE[m.role]}</span>` : ''}</a>`).join('')}</div>`;
  },
  teams() {
    const ts = Object.values(S.teams).sort((a, b) => a.name.localeCompare(b.name));
    if (!ts.length) return `<div class="card empty small">${ic('layers')}<div>No teams yet.${isAdmin() ? ' Create teams like “Electrical” or “North crew”, then people can join them.' : ''}</div></div>`;
    return `<div class="stack tight">${ts.map((t) => { const inT = (t.members || []).includes(S.user.id); return `<div class="card" style="padding:12px 14px">
      <div class="row"><span class="team-swatch" style="background:${esc(t.color)}"></span><b class="grow ellipsis">${esc(t.name)}</b>
      <button class="btn sm ${inT ? '' : 'primary'}" data-act="team-${inT ? 'leave' : 'join'}" data-id="${t.id}">${inT ? 'Leave' : 'Join'}</button>
      ${isAdmin() ? `<button class="btn ghost sm icon" data-act="team-edit" data-id="${t.id}" aria-label="Edit team">${ic('edit')}</button>` : ''}</div>
      <div class="row" style="margin-top:8px">${(t.members || []).length ? avatarStack(t.members, 8) + `<span class="small muted">${plural(t.members.length, 'member')}</span>` : '<span class="small muted">No one yet</span>'}</div></div>`; }).join('')}</div>`;
  },
};
C['share-loc'] = (el) => enableSharing(el.checked, el);
A['team-join'] = async (el) => { try { const r = await capi('POST', `/teams/${el.dataset.id}/join`); S.teams[r.item.id] = r.item; scheduleRender(); } catch (e) { toast(e.message, true); } };
A['team-leave'] = async (el) => { try { const r = await capi('POST', `/teams/${el.dataset.id}/leave`); S.teams[r.item.id] = r.item; scheduleRender(); } catch (e) { toast(e.message, true); } };
A['team-edit'] = (el) => teamSheet(el.dataset.id);
A['team-del'] = async (el) => { const t = S.teams[el.dataset.id]; closeSheets(); if (await confirmBox('Delete this team?', `“${t.name}” will be removed. Jobs stay, just without a team.`)) deleteItem('teams', t.id); };
function teamSheet(id) {
  const t = id ? S.teams[id] : { name: '', color: PALETTE[Object.keys(S.teams).length % PALETTE.length], members: [] };
  sheet(`${sheetHead(id ? 'Edit team' : 'New team')}<form class="stack" data-form="team" data-id="${id || ''}">
    <label class="field"><span>Team name</span><input name="name" value="${esc(t.name)}" placeholder="e.g. Electrical, North crew" required maxlength="60"></label>
    <div class="field"><span>Colour</span><div class="row wrap tight">${PALETTE.map((c) => `<label style="cursor:pointer"><input type="radio" name="color" value="${c}" ${c === t.color ? 'checked' : ''} class="sr-only"><span class="team-swatch" style="width:26px;height:26px;border-radius:7px;display:block;background:${c};outline:${c === t.color ? '2px solid var(--ink)' : 'none'};outline-offset:2px" data-swatch></span></label>`).join('')}</div></div>
    <div class="field"><span>Members</span>${peoplePicker(t.members || [])}</div>
    <div class="err-msg" data-err></div>
    <div class="sheet-foot">${id ? `<button type="button" class="btn danger" data-act="team-del" data-id="${id}" style="margin-right:auto">Delete</button>` : ''}<button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${id ? 'Save' : 'Create team'}</button></div>
  </form>`, swatchPicker);
}
F.team = async (f, d, close) => { await saveItem('teams', f.dataset.id || null, { name: d.name, color: d.color, members: picked(f) }); close(); };

// ---- map: sharp vector maps from OpenFreeMap (free, no key), falling back to OpenStreetMap tiles.
let map = null, mapKind = '', mapMarkers = [], mapFitted = false, glP = null, leafP = null;
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Map could not load')); document.head.appendChild(s); }); }
function loadCss(href) { if ($(`link[href="${href}"]`)) return; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); }
function webglOK() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }
// OpenFreeMap styles: "liberty" is the most detailed (buildings, shops, house numbers, paths).
const MAP_STYLES = { liberty: 'Detailed', bright: 'Bright', positron: 'Light', dark: 'Dark' };
const mapStyle = () => { const s = store.get('cd_mapStyle'); return MAP_STYLES[s] ? s : 'liberty'; };
const styleUrl = () => `https://tiles.openfreemap.org/styles/${mapStyle()}`;
A['map-style'] = (el) => {
  store.set('cd_mapStyle', el.dataset.s);
  $$('[data-act="map-style"]').forEach((b) => { b.classList.toggle('on', b === el); b.setAttribute('aria-checked', b === el); });
  if (map && mapKind === 'gl') map.setStyle(styleUrl()); // markers are separate, so they stay put
};
const darkMode = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
async function drawMap() {
  const el = $('#map'); if (!el) return;
  if (map && map.getContainer() !== el) destroyMap();
  if (map) return updateMap();
  el.innerHTML = '<div class="map-msg">Loading map…</div>';
  if (!webglOK()) return drawLeaflet(el);
  try {
    if (!window.maplibregl) { loadCss('/vendor/maplibre/maplibre-gl.css'); await (glP = glP || loadScript('/vendor/maplibre/maplibre-gl-csp.js')); maplibregl.setWorkerUrl('/vendor/maplibre/maplibre-gl-csp-worker.js'); }
    if (!el.isConnected) return;
    el.innerHTML = '';
    let ok = false, gaveUp = false;
    const m = new maplibregl.Map({ container: el, style: styleUrl(), center: [-3, 54.5], zoom: 4.6, maxZoom: 20,
      attributionControl: { compact: true }, cooperativeGestures: isTouch(), dragRotate: false, pitchWithRotate: false });
    map = m; mapKind = 'gl'; mapFitted = false;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.touchZoomRotate.disableRotation();
    m.on('load', () => { ok = true; updateMap(); });
    const giveUp = () => { if (ok || gaveUp || map !== m) return; gaveUp = true; try { m.remove(); } catch (_) {} map = null; drawLeaflet(el); };
    m.on('error', (e) => { if (!ok && /style|fetch|network|load/i.test(String((e && e.error && e.error.message) || ''))) giveUp(); });
    setTimeout(giveUp, 12000);
    updateMap();
  } catch (_) { drawLeaflet(el); }
}
async function drawLeaflet(el) {
  try {
    if (!window.L) { loadCss('/vendor/leaflet/leaflet.css'); await (leafP = leafP || loadScript('/vendor/leaflet/leaflet.js')); }
    if (!el.isConnected) return;
    el.innerHTML = '';
    map = L.map(el, { zoomControl: true, attributionControl: true }).setView([54.5, -3], 5); mapKind = 'leaflet'; mapFitted = false;
    let errors = 0;
    const layer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin', attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' }).addTo(map);
    layer.on('tileerror', () => { if (++errors === 6) el.insertAdjacentHTML('beforeend', '<div class="map-msg" style="background:color-mix(in srgb, var(--surface) 85%, transparent);z-index:500">The map couldn’t load. Check your internet connection and try again.</div>'); });
    updateMap();
  } catch (_) { el.innerHTML = '<div class="map-msg">The map couldn’t load. Check your internet connection and try again.</div>'; }
}
function destroyMap() { if (map) { try { map.remove(); } catch (_) {} } map = null; mapMarkers = []; mapKind = ''; }
function personMarkerEl(m) {
  const d = document.createElement('div'); d.className = 'mk-person'; d.style.background = colorFor(m.id);
  d.setAttribute('aria-label', m.name); d.setAttribute('role', 'img');
  if (m.avatar) { const img = document.createElement('img'); img.src = m.avatar; img.alt = ''; img.width = 32; img.height = 32; d.appendChild(img); } else d.textContent = initials(m.name);
  return d;
}
function jobMarkerEl() { const d = document.createElement('div'); d.className = 'mk-job'; d.innerHTML = ic('jobs'); return d; }
function updateMap() {
  if (!map || !$('#map')) return;
  mapMarkers.forEach((mk) => mk.remove()); mapMarkers = [];
  const pts = [];
  const add = (lat, lng, el, html, z) => {
    if (mapKind === 'gl') { const mk = new maplibregl.Marker({ element: el, anchor: el.classList.contains('mk-job') ? 'bottom' : 'center' }).setLngLat([lng, lat]).setPopup(new maplibregl.Popup({ offset: 22, closeButton: false }).setHTML(html)).addTo(map); mapMarkers.push(mk); }
    else { const icon = L.divIcon({ className: '', html: el.outerHTML, iconSize: el.classList.contains('mk-job') ? [30, 30] : [38, 38], iconAnchor: el.classList.contains('mk-job') ? [15, 30] : [19, 19] }); mapMarkers.push(L.marker([lat, lng], { icon, zIndexOffset: z }).addTo(map).bindPopup(html)); }
    pts.push([lng, lat]);
  };
  for (const j of Object.values(S.jobs)) {
    if (j.lat == null || j.lng == null || j.status === 'done') continue;
    add(j.lat, j.lng, jobMarkerEl(), `<b>${esc(j.title)}</b><br><span style="color:#6a6963">${esc(j.ref)} · ${STATUS[j.status]}</span><br><a href="#/job/${j.id}">Open job</a>`, 0);
  }
  for (const [id, loc] of Object.entries(S.locations)) {
    const m = S.members[id]; if (!m) continue;
    add(loc.lat, loc.lng, personMarkerEl(m), `<b>${esc(m.name)}</b><br><span style="color:#6a6963">${m.online ? 'Online' : 'Offline'} · updated ${timeAgo(loc.at)}${loc.acc ? ` · ±${loc.acc}m` : ''}</span><br><a href="#/person/${m.id}">View profile</a>`, 1000);
  }
  if (!mapFitted && pts.length) {
    mapFitted = true;
    if (mapKind === 'gl') { const b = pts.reduce((bb, p) => bb.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0])); map.fitBounds(b, { padding: 50, maxZoom: 14, duration: 0 }); }
    else map.fitBounds(pts.map(([lng, lat]) => [lat, lng]), { padding: [40, 40], maxZoom: 15 });
  }
}
function focusMap(lat, lng) { if (!map) return; if (mapKind === 'gl') map.jumpTo({ center: [lng, lat], zoom: 15 }); else map.setView([lat, lng], 16); }
A['map-focus'] = (el) => { const l = S.locations[el.dataset.id]; if (!l) return; mapFitted = true; if (parseHash().name !== 'team') location.hash = '#/team'; setTimeout(() => focusMap(l.lat, l.lng), 600); };

// ============================================================ PERSON PROFILE
VIEWS.person = {
  render(id) {
    const m = S.members[id];
    if (!m) return `<a class="back" href="#/team">${ic('back')}Team</a><div class="card empty"><h3>Person not found</h3><div class="small">They may have left the company.</div></div>`;
    const me = id === S.user.id; const loc = S.locations[id];
    const projects = Object.values(S.projects).filter((p) => !p.archived && (p.createdBy === id || (p.members || []).includes(id) || projectJobs(p.id).some((j) => (j.assignees || []).includes(id))));
    const jobs = Object.values(S.jobs).filter((j) => j.status !== 'done' && (j.assignees || []).includes(id)).sort(byDeadline);
    const activity = Object.values(S.jobs).flatMap((j) => (j.history || []).filter((h) => h.by === id).map((h) => Object.assign({ job: j }, h)))
      .concat(Object.values(S.pings).filter((p) => p.createdBy === id).map((p) => ({ at: p.createdAt, text: `Posted the ping “${p.title}”`, ping: p })))
      .sort((a, b) => b.at - a.at).slice(0, 10);
    const canManage = isAdmin() && m.role !== 'owner' && !me;
    return `<a class="back" href="#/team">${ic('back')}Team</a>
      <div class="card" style="margin-bottom:16px"><div class="row top wrap" style="gap:18px">${avatar(m, 'xl', { dot: true, link: false })}
        <div class="grow stack tight"><h1>${esc(m.name)}</h1>
          <div class="muted">${esc([m.title, m.dept].filter(Boolean).join(' · ') || ROLE[m.role])}</div>
          <div class="row wrap tight"><span class="pill">${ROLE[m.role]}</span><span class="small muted">${m.online ? '● Online now' : 'Last seen ' + timeAgo(m.lastSeen)}</span>${me ? '<span class="small muted">· This is you</span>' : ''}</div>
          ${m.bio ? `<p class="pre" style="margin:6px 0 0">${esc(m.bio)}</p>` : ''}
          <div class="row wrap tight" style="margin-top:8px">
            ${me ? `<a class="btn sm primary" href="#/profile">${ic('edit')}Edit my profile</a>` : `<button class="btn sm primary" data-act="message-person" data-id="${id}">${ic('chat')}Message</button>`}
            ${m.phone ? `<a class="btn sm" href="tel:${esc(m.phone)}">${ic('phone')}Call</a>` : ''}
            ${m.email ? `<a class="btn sm" href="mailto:${esc(m.email)}">${ic('mail')}Email</a>` : ''}
            ${loc ? `<button class="btn sm" data-act="map-focus" data-id="${id}">${ic('pin')}On map</button>` : ''}</div></div></div>
        ${m.phone || m.email ? `<dl class="kv" style="margin-top:16px">${m.phone ? `<dt>Phone</dt><dd><a href="tel:${esc(m.phone)}">${esc(m.phone)}</a></dd>` : ''}${m.email ? `<dt>Email</dt><dd><a href="mailto:${esc(m.email)}">${esc(m.email)}</a></dd>` : ''}</dl>` : !me ? '<p class="small muted" style="margin:12px 0 0">Contact details are private.</p>' : ''}
      </div>
      <div class="grid two">
        <div class="stack loose">
          <div><div class="section-head"><h2>Working on</h2></div>${jobs.length ? `<div class="cards">${jobs.map(jobCard).join('')}</div>` : '<div class="card empty small">Not assigned to any open jobs you can see.</div>'}</div>
          <div><div class="section-head"><h2>Recent activity</h2></div><div class="card">${activity.length ? `<ul class="hist">${activity.map((a) => `<li><span class="grow">${esc(a.text)}${a.job ? ` · <a href="#/job/${a.job.id}">${esc(a.job.title)}</a>` : a.ping ? ` · <a href="#/ping/${a.ping.id}">Open</a>` : ''}</span><time title="${esc(fmtDateTime(a.at))}">${timeAgo(a.at)}</time></li>`).join('')}</ul>` : '<div class="small muted">Nothing recent you can see.</div>'}</div></div>
        </div>
        <div class="stack">
          <div class="card"><h3 style="margin-bottom:8px">Projects</h3>${projects.length ? `<div class="stack tight">${projects.map((p) => `<a href="#/project/${p.id}" class="row" style="text-decoration:none;color:inherit"><span class="team-swatch" style="background:${esc(p.color || '#18693f')}"></span><span class="ellipsis">${esc(p.name)}</span></a>`).join('')}</div>` : '<div class="small muted">None.</div>'}</div>
          <div class="card"><h3 style="margin-bottom:8px">Teams</h3>${Object.values(S.teams).filter((t) => (t.members || []).includes(id)).map((t) => `<div class="row tight small"><span class="team-swatch" style="background:${esc(t.color)}"></span>${esc(t.name)}</div>`).join('') || '<div class="small muted">None.</div>'}</div>
          ${canManage || (S.role === 'owner' && !me) ? `<div class="card"><h3 style="margin-bottom:8px">Manage</h3><div class="row wrap tight">
            ${canManage ? `<button class="btn sm" data-act="set-role" data-id="${id}" data-role="${m.role === 'admin' ? 'member' : 'admin'}">${m.role === 'admin' ? 'Make member' : 'Make admin'}</button>` : ''}
            ${S.role === 'owner' && !me ? `<button class="btn sm" data-act="make-owner" data-id="${id}">Make owner</button>` : ''}
            ${canManage ? `<button class="btn sm danger" data-act="remove-member" data-id="${id}">Remove from company</button>` : ''}</div></div>` : ''}
        </div>
      </div>`;
  },
};
A['set-role'] = async (el) => { try { await capi('PATCH', `/members/${el.dataset.id}`, { role: el.dataset.role }); toast('Role updated'); } catch (e) { toast(e.message, true); } };
A['make-owner'] = async (el) => { if (!(await confirmBox('Hand over ownership?', `${member(el.dataset.id).name} will become the owner. You’ll become an admin.`, 'Make owner', false))) return; try { await capi('PATCH', `/members/${el.dataset.id}`, { role: 'owner' }); toast('Ownership transferred'); } catch (e) { toast(e.message, true); } };
A['remove-member'] = async (el) => { const m = member(el.dataset.id); if (!(await confirmBox('Remove from the company?', `${m.name} will lose access to all projects, jobs and chats.`, 'Remove'))) return; try { await capi('DELETE', `/members/${m.id}`); delete S.members[m.id]; location.hash = '#/team'; toast(`${m.name} removed`); } catch (e) { toast(e.message, true); } };

// ============================================================ CLIENTS
VIEWS.clients = {
  render() {
    return `<div class="page-head"><div><h1>Clients</h1><div class="sub">Every customer’s phone, email and address in one place.</div></div><button class="btn primary" data-act="client-edit">${ic('plus')}<span>Add client</span></button></div>
      <label class="search"><input class="input" type="search" placeholder="Search name, company, phone…" value="${esc(S.clientSearch)}" data-input="client-search" aria-label="Search clients">${ic('search')}</label>
      <div class="section" id="clientlist" style="margin-top:14px">${this.list()}</div>`;
  },
  list() {
    const q = S.clientSearch.trim().toLowerCase();
    let cs = Object.values(S.clients).sort((a, b) => a.name.localeCompare(b.name));
    if (q) cs = cs.filter((c) => [c.name, c.company, c.phone, c.email, c.address].join(' ').toLowerCase().includes(q));
    if (!cs.length) return `<div class="card empty">${ic('contacts')}<h3>${Object.keys(S.clients).length ? 'No matches' : 'No clients yet'}</h3><div class="small">Add a client to link them to projects and jobs.</div></div>`;
    return `<div class="card flush"><div class="list">${cs.map((c) => { const n = Object.values(S.jobs).filter((j) => j.clientId === c.id && j.status !== 'done').length; return `
      <a class="item" href="#/client/${c.id}"><span class="avatar" style="--c:${colorFor(c.id)};border-radius:9px">${esc(initials(c.name))}</span>
      <div class="grow"><b class="ellipsis" style="display:block">${esc(c.name)}</b><span class="small muted ellipsis" style="display:block">${esc([c.company, c.phone].filter(Boolean).join(' · ') || c.email || '—')}</span></div>
      ${n ? `<span class="pill st-active">${n} open</span>` : ''}</a>`; }).join('')}</div></div>`;
  },
};
I['client-search'] = (el) => { S.clientSearch = el.value; const l = $('#clientlist'); if (l) l.innerHTML = VIEWS.clients.list(); };
VIEWS.client = {
  render(id) {
    const c = S.clients[id];
    if (!c) return `<a class="back" href="#/clients">${ic('back')}Clients</a><div class="card empty"><h3>Client not found</h3></div>`;
    const jobs = Object.values(S.jobs).filter((j) => j.clientId === id).sort(byDeadline);
    const projs = Object.values(S.projects).filter((p) => p.clientId === id);
    return `<a class="back" href="#/clients">${ic('back')}Clients</a>
      <div class="page-head"><div class="row"><span class="avatar lg" style="--c:${colorFor(c.id)};border-radius:12px">${esc(initials(c.name))}</span><div><h1>${esc(c.name)}</h1>${c.company ? `<div class="muted">${esc(c.company)}</div>` : ''}</div></div>
      <div class="row tight"><button class="btn sm" data-act="client-edit" data-id="${c.id}">${ic('edit')}Edit</button>${isAdmin() ? `<button class="btn sm icon danger" data-act="client-del" data-id="${c.id}" aria-label="Delete client">${ic('trash')}</button>` : ''}</div></div>
      <div class="row wrap tight" style="margin-bottom:16px">${c.phone ? `<a class="btn primary" href="tel:${esc(c.phone)}">${ic('phone')}Call</a><a class="btn" href="sms:${esc(c.phone)}">${ic('chat')}Text</a>` : ''}${c.email ? `<a class="btn" href="mailto:${esc(c.email)}">${ic('mail')}Email</a>` : ''}${c.address ? `<a class="btn" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(c.address)}">${ic('nav')}Directions</a>` : ''}</div>
      <div class="grid two">
        <div class="card"><dl class="kv"><dt>Phone</dt><dd>${esc(c.phone) || '<span class="muted">—</span>'}</dd><dt>Email</dt><dd>${esc(c.email) || '<span class="muted">—</span>'}</dd>
          <dt>Address</dt><dd>${esc(c.address) || '<span class="muted">—</span>'}</dd><dt>Notes</dt><dd class="pre">${c.notes ? linkify(c.notes) : '<span class="muted">—</span>'}</dd></dl></div>
        <div class="stack">
          ${projs.length ? `<div><div class="section-head"><h2>Projects</h2></div><div class="stack tight">${projs.map(projectCard).join('')}</div></div>` : ''}
          <div><div class="section-head"><h2>Jobs</h2>${canCreateJobs() ? `<button class="btn sm" data-act="new-job" data-client="${c.id}">${ic('plus')}New job</button>` : ''}</div>
          ${jobs.length ? `<div class="stack tight">${jobs.map(jobCard).join('')}</div>` : '<div class="card empty small">No jobs for this client yet.</div>'}</div></div>
      </div>`;
  },
};
function clientSheet(id, onSaved) {
  const c = id ? S.clients[id] : { name: '', company: '', phone: '', email: '', address: '', notes: '' };
  sheet(`${sheetHead(id ? 'Edit client' : 'New client')}<form class="stack" data-form="client" data-id="${id || ''}">
    <div class="form-grid">
      <label class="field"><span>Name</span><input name="name" value="${esc(c.name)}" autocomplete="off" required maxlength="120"></label>
      <label class="field"><span>Company</span><input name="company" value="${esc(c.company)}" autocomplete="off"></label>
      <label class="field"><span>Phone</span><input name="phone" type="tel" value="${esc(c.phone)}" autocomplete="off"></label>
      <label class="field"><span>Email</span><input name="email" type="email" value="${esc(c.email)}" autocomplete="off"></label>
      <label class="field full"><span>Address</span><input name="address" value="${esc(c.address)}" autocomplete="off"></label>
      <label class="field full"><span>Notes</span><textarea name="notes" placeholder="Gate code, parking, preferred contact times…">${esc(c.notes)}</textarea></label>
    </div><div class="err-msg" data-err></div>
    <div class="sheet-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${id ? 'Save' : 'Add client'}</button></div>
  </form>`, (sh) => { sh.querySelector('form')._onSaved = onSaved; });
}
A['client-edit'] = (el) => clientSheet(el.dataset.id);
A['client-del'] = async (el) => { const c = S.clients[el.dataset.id]; if (await confirmBox('Delete this client?', `${c.name} will be removed. Their jobs and projects stay.`)) { if (await deleteItem('clients', c.id)) location.hash = '#/clients'; } };
F.client = async (f, d, close) => {
  const item = await saveItem('clients', f.dataset.id || null, d);
  close(); if (f._onSaved) f._onSaved(item); else if (!f.dataset.id) location.hash = '#/client/' + item.id;
};
