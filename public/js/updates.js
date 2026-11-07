/* What's new: the update log (More → What's new). Newest first. Written from every version Render has deployed.
   Add an entry at the top whenever a change goes live — the red dot in More shows people there's something new.
   Each item: [kind, text] where kind is 'new', 'better' or 'fix'. */
'use strict';

const UPDATES = [
  { id: '3.6', date: '2026-11-07', title: 'Stay safe, rebuilt — and the Android app', icon: 'shield', color: '#c92a2a',
    intro: 'Still being tested: keep using the StaySafe app alongside Crewdesk for now.',
    items: [
      ['new', 'A round Help button you press and hold for 2 seconds, right on the Stay safe start screen, even before you start a session.'],
      ['new', 'Raising an alert posts a ping for everyone with your location, how to call you and directions, and shows a red pin on the team map. It stays up until you tap I’m safe.'],
      ['new', '“Alert active” shows on the person everywhere they appear: their picture, their name and their profile.'],
      ['new', 'Notifications 10 and 5 minutes before each check-in, with a Check in button right on the notification.'],
      ['new', 'The Crewdesk Android app: full-screen emergency alerts with the phone’s alarm sound until someone responds, check-in buttons on the lock screen, and battery-friendly location while you work alone.'],
      ['new', 'On phones, Crewdesk offers to add itself to your Home Screen (one tap on Android, simple steps on iPhone).'],
      ['better', 'Pick your finish time in 5-minute steps with a proper time picker.'],
      ['better', 'Everyone checks in every hour unless admins change it. Admins look after everyone working alone (no more buddies).'],
      ['better', 'A missed check-in sounds the alarm on your own phone only. Admins get a message.'],
      ['better', 'Stay safe isn’t available on iPhone, because iOS doesn’t support web app alerts or live location tracking.'],
    ] },
  { id: '3.5', date: '2026-11-07', title: 'Stay safe: lone working', icon: 'shield', color: '#c92a2a',
    intro: 'Nobody works alone unseen. Check in, and get help fast if something goes wrong.',
    items: [
      ['new', 'Stay safe tab: start a session before working alone. Say where you are, how often to check in, when you’ll finish and who your buddy is.'],
      ['new', 'A countdown dial to your next check-in. Your phone buzzes on the lock screen when it’s due, and one tap on I’m safe checks you in.'],
      ['new', 'Miss a check-in by 10 minutes and your buddy and admins get an urgent alert that stays on screen until they deal with it.'],
      ['new', 'Hold the red help button for 2 seconds to raise an alert with a loud siren, or send a silent alert when noise could make things worse.'],
      ['new', 'Buddies and admins see everyone working alone, can call them, open their location on a map and tap I’m responding.'],
      ['new', 'Location is only shared from the Crewdesk Android app, never from a browser or iPhone.'],
      ['better', 'Lock-screen notifications: only the device you’re actually looking at stays quiet. Your phone still buzzes if Crewdesk is open on your computer.'],
      ['better', 'My settings shows whether this phone is signed up for notifications and when the last one arrived, with a clear fix if not.'],
      ['fix', 'The “is typing” bubble in chat now lines up with the messages above it.'],
    ] },
  { id: '3.4', date: '2026-11-07', title: 'Lock-screen notifications', icon: 'bell', color: '#e8590c',
    intro: 'Crewdesk can now reach you when it’s closed — on your lock screen, with a buzz.',
    items: [
      ['new', 'Lock-screen notifications for messages, pings and things assigned to you. Your phone buzzes even when Crewdesk is closed. Switch them on in My settings → Notifications.'],
      ['new', 'iPhone: add Crewdesk to your Home Screen (Safari → Share → Add to Home Screen), open it from there, then switch notifications on.'],
      ['new', 'The Crewdesk icon on your Home Screen shows how many unread messages and pings you have.'],
      ['new', 'Tabs you’ve moved into More show their own red count, and the More tab adds them all up, so nothing gets missed.'],
      ['new', 'This What’s new page, with a red dot whenever there’s an update you haven’t seen.'],
      ['better', 'No double buzzing: if you’re already looking at Crewdesk on any device, your phone stays quiet.'],
    ] },
  { id: '3.3', date: '2026-11-06', time: 'Evening', title: 'Files, resources and voiced tutorials', icon: 'folder', color: '#1971c2',
    intro: 'A home for training documents, and tutorials you can listen to.',
    items: [
      ['new', 'Files: training documents and resources for everyone, with cover photos, descriptions, attachments, categories and search.'],
      ['better', 'Manhole maps now live in a Maps folder inside Files.'],
      ['new', 'Tutorial videos now have a British voiceover, for both phone and computer, paced to each spoken line.'],
      ['new', 'New Files & resources tutorial.'],
    ] },
  { id: '3.2', date: '2026-11-06', time: 'Evening', title: 'Google 3D and sharper maps', icon: 'layers', color: '#5f3dc4',
    intro: 'Manhole maps go 3D, and the team map gets Google Maps.',
    items: [
      ['new', 'Photorealistic Google 3D (Google Earth style) on manhole maps, with coloured pins you can tap, and new manholes added by tapping the 3D ground.'],
      ['new', '3D camera controls: closer, further, turn, tilt, face north and fly-around, with smooth hold-to-move buttons.'],
      ['new', 'The team map uses Google Maps (Map, Satellite or Terrain) when your company has a key, with the same project pins and site cards.'],
      ['better', 'Redesigned clean water, foul water and combined sewer icons.'],
      ['better', 'PDFs: a proper surveyor’s scale bar with the printed A4 ratio and grid size, on the sharpest satellite imagery.'],
      ['better', 'Client reports no longer show work status anywhere, just the manhole totals and types.'],
      ['better', 'New Plotting manholes tutorial, and a refreshed Manhole maps tutorial.'],
      ['fix', 'If Google billing or the key has a problem, maps switch to the free satellite map instead of breaking.'],
      ['fix', 'Long icon names (like Telecommunications) wrap instead of being cut off.'],
    ] },
  { id: '3.1', date: '2026-11-06', time: 'Afternoon', title: 'Manhole maps', icon: 'pin', color: '#2b8a3e',
    intro: 'Plot, record and export manholes on a satellite map, together, live.',
    items: [
      ['new', 'Manhole maps: satellite map, add, drag and delete manholes with full history and restore.'],
      ['new', 'Manhole records with status, photos, notes and survey fields, plus company-wide presets with an icon library.'],
      ['new', 'Filters, search, coordinates and postcode search, with live sync when several people edit and protection against clashing changes.'],
      ['new', 'Exports: index, labelled map, report, Excel and a client handover zip.'],
      ['new', '3D buildings switch on the map.'],
      ['new', 'Chat: delete your own messages by pressing and holding (admins can delete any, or clear a whole chat).'],
      ['new', 'Data & free allowance page for admins, showing storage and map use against the free limits, with a hard stop at 95% so nothing is ever charged.'],
      ['better', 'Tutorials for phone and computer, shown as tiles with prev/next and a written guide.'],
      ['fix', 'Markers no longer jump when tapped, and no more false “someone else changed this” after your own saves.'],
    ] },
  { id: '3.0', date: '2026-11-06', time: 'Afternoon', title: 'Timesheet status, calendars and the project map', icon: 'timesheet', color: '#0b7285',
    intro: 'Know where every timesheet stands, and find every site on the map.',
    items: [
      ['new', 'Timesheet status for each month (future, in progress, complete, not complete), with reminders at month start and on Mondays.'],
      ['new', 'Undo “Finish for today”: reopens the day and restarts the timer.'],
      ['new', 'Named calendars (e.g. Gateshead, Warrington), each with its own colour, that you can show or hide.'],
      ['new', 'Project chooser with colour tiles, job numbers, who’s on site now and plan progress.'],
      ['new', 'Spreadsheets: Hours and Performance charts.'],
      ['new', 'Map pins for each project with job number and live head count, and directions in Apple Maps, Google Maps or Waze.'],
      ['new', 'Archive with year and month folders, and a PDF report for each project.'],
      ['new', 'Video tutorials for every section, and a Demo practice company in More.'],
      ['better', 'Team page: map first, with full-screen view; people and teams as tidy dropdowns.'],
      ['better', 'Search also finds parts of the app, like Tutorials, timesheets and settings.'],
      ['better', 'Kinder wording for short days, with no red minus overtime.'],
      ['fix', 'The timer button no longer pulses or flashes on every live update.'],
    ] },
  { id: '2.5', date: '2026-11-06', time: 'Morning', title: 'Time tracking and timesheets', icon: 'clock', color: '#c2255c',
    intro: 'One big button to log your day. Timesheets fill themselves in.',
    items: [
      ['new', 'Home is one big Start / Stop button: pick your project and go. Lunch and switching task are one tap, and today’s log builds itself.'],
      ['new', 'Projects are now made of tasks with planned time, and existing jobs were moved across automatically.'],
      ['new', 'Timesheets filled into the company’s Time & Overtime template each month. You can edit times and add overtime, and admins approve them.'],
      ['new', 'Upload your own finished timesheet for a month if you prefer.'],
      ['new', 'Admin dashboard: who’s working now, everyone’s days and notes, a timesheets folder with zip and Google Drive copy.'],
      ['new', 'Suggestions page for bugs, ideas and HR questions.'],
      ['new', 'Paperclip in chat: send photos and documents, which open inside the app.'],
      ['better', 'Full-colour project cards, a phone-friendly calendar with a List view, and spreadsheets previewed in the app.'],
      ['better', 'Much faster under load: tested with 50 people at once, using less than half the memory.'],
      ['better', 'New Crewdesk logo and app icons.'],
    ] },
  { id: '2.2', date: '2026-11-03', time: 'Evening', title: 'A cleaner, smoother redesign', icon: 'sparkle', color: '#7048e8',
    intro: 'Everything feels quicker and more natural on a phone.',
    items: [
      ['new', 'Rebuilt calendar: month, week and day timeline, swipe between months, coloured bars for busy days.'],
      ['new', 'Notification banners with the sender’s picture and a one-line preview; tap to open the chat.'],
      ['new', 'Live “is typing” in chat, and messages appear instantly.'],
      ['new', 'Edit your tab bar: drag buttons on and off, the rest live in More.'],
      ['new', 'Projects show their jobs as a numbered flow with ticks and a progress bar.'],
      ['new', 'Choose whether people outside your companies can see your profile.'],
      ['better', 'Smooth page transitions, springy buttons, glass top and tab bars.'],
      ['better', 'Photo viewer with pinch and double-tap zoom; documents open in the app.'],
      ['fix', 'No more accidental zooming on double-tap, and no flicker when ticking jobs.'],
    ] },
  { id: '2.1', date: '2026-11-03', time: 'Afternoon', title: 'Company directory', icon: 'building', color: '#495057',
    intro: 'Find your company and ask to join.',
    items: [
      ['new', 'Create a company, or find yours in a searchable directory and ask to join. Owners accept in one click.'],
      ['new', 'Company profiles with picture, description, trade, area and banner image.'],
      ['better', 'Team map style picker (Detailed, Bright, Light, Dark).'],
      ['better', 'Forgot password explains when there’s no account and reminds you to check spam.'],
    ] },
  { id: '2.0', date: '2026-11-03', time: 'Afternoon', title: 'Crewdesk 2.0', icon: 'rocket', color: '#18693f',
    intro: 'Secure accounts, projects, chats, pings and a shared calendar.',
    items: [
      ['new', 'Secure sign-in: email verification, password reset, strong passwords and lockouts after wrong guesses.'],
      ['new', 'Projects with stars and archiving, and private jobs.'],
      ['new', 'Direct and group chats, and pings with attachments and read status.'],
      ['new', 'Shared calendar with reminders, invite links and clickable profiles.'],
      ['new', 'Admin spreadsheets with charts and Excel export.'],
      ['better', 'Daily backups and access-checked uploads.'],
    ] },
  { id: '1.1', date: '2026-11-03', time: 'Morning', title: 'Green look and job photos', icon: 'camera', color: '#2f9e44',
    intro: 'A fresh look, and photos on every job.',
    items: [
      ['new', 'New green look, logo and app icons.'],
      ['new', 'Job photos: take or pick several, add captions, swipe through full screen.'],
      ['new', 'Up to 6 photos per chat message.'],
      ['new', 'Privacy policy, terms, download your data and delete your account.'],
      ['better', 'Fits phone screens properly, with better contrast and labels.'],
    ] },
  { id: '1.0', date: '2026-11-03', time: 'Morning', title: 'The first Crewdesk', icon: 'flag', color: '#868e96',
    intro: 'Where it started: a job tracker and team chat.',
    items: [
      ['new', 'Job tracker and team chat for small companies.'],
      ['new', 'Hosted online, close to the database, and kept awake so it opens fast.'],
    ] },
];

const UPD_KIND = { new: ['New', 'ok'], better: ['Improved', 'blue'], fix: ['Fixed', 'amber'] };
const updIdx = (id) => UPDATES.findIndex((u) => u.id === id);
// How many updates this person hasn't opened yet. New accounts only count what came out after they joined.
function unseenUpdates() {
  if (!S.user) return 0;
  const seen = S.user.prefs && S.user.prefs.seenUpdate;
  if (seen) { const i = updIdx(seen); return i < 0 ? 0 : i; }
  const joined = S.user.createdAt ? new Date(S.user.createdAt).toISOString().slice(0, 10) : '';
  return UPDATES.filter((u) => joined && u.date > joined).length;
}
function markUpdatesSeen() {
  if (!S.user || !UPDATES.length || (S.user.prefs && S.user.prefs.seenUpdate === UPDATES[0].id)) return;
  S.user.prefs = Object.assign({}, S.user.prefs, { seenUpdate: UPDATES[0].id }); updateChrome();
  api('PUT', '/api/me', { prefs: { seenUpdate: UPDATES[0].id } }).then((r) => { S.user = r.user; updateChrome(); }).catch(() => {});
}
const updDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

VIEWS.updates = {
  render(arg) {
    const fresh = VIEWS.updates._snap != null ? VIEWS.updates._snap : unseenUpdates();
    const filter = ['new', 'better', 'fix'].includes(arg) ? arg : '';
    const totals = { new: 0, better: 0, fix: 0 }; for (const u of UPDATES) for (const [k] of u.items) totals[k]++;
    const latest = UPDATES[0];
    const card = (u, i) => {
      const items = u.items.filter(([k]) => !filter || k === filter); if (!items.length) return '';
      return `<article class="upd ${i < fresh ? 'unseen' : ''}" style="--c:${u.color};--i:${Math.min(i, 8)}">
        <div class="upd-rail"><span class="upd-dot">${icSize(u.icon, 16)}</span></div>
        <div class="upd-body">
          <div class="upd-meta"><span class="upd-ver">v${esc(u.id)}</span><time datetime="${u.date}">${esc(updDate(u.date))}${u.time ? ' · ' + esc(u.time) : ''}</time>${i < fresh ? '<span class="upd-new">New for you</span>' : ''}</div>
          <h2>${esc(u.title)}</h2>${u.intro && i > 0 ? `<p class="upd-intro">${esc(u.intro)}</p>` : ''}
          <ul class="upd-list">${items.map(([k, t]) => `<li><span class="upd-tag ${UPD_KIND[k][1]}">${UPD_KIND[k][0]}</span><span>${esc(t)}</span></li>`).join('')}</ul>
        </div></article>`;
    };
    return `<div class="upd-page">
      <section class="upd-hero" style="--c:${latest.color}">
        <div class="upd-hero-ico">${icSize('sparkle', 28)}</div>
        <div class="upd-hero-txt"><span class="upd-kicker">What’s new · v${esc(latest.id)}</span><h1>${esc(latest.title)}</h1><p>${esc(latest.intro || '')}</p></div>
        <div class="upd-stats"><div><b>${UPDATES.length}</b><span>updates</span></div><div><b>${totals.new}</b><span>new features</span></div><div><b>${totals.better + totals.fix}</b><span>improvements &amp; fixes</span></div></div>
      </section>
      <div class="seg upd-filter" role="tablist" aria-label="Show">
        <a href="#/updates" class="${filter ? '' : 'on'}">All</a><a href="#/updates/new" class="${filter === 'new' ? 'on' : ''}">New</a><a href="#/updates/better" class="${filter === 'better' ? 'on' : ''}">Improved</a><a href="#/updates/fix" class="${filter === 'fix' ? 'on' : ''}">Fixed</a>
      </div>
      <div class="upd-timeline">${UPDATES.map(card).join('')}</div>
      <p class="tiny muted" style="text-align:center;margin:18px 0 8px">Crewdesk updates itself — just reopen the app to get the latest version.</p>
    </div>`;
  },
  mount() { if (VIEWS.updates._snap == null) VIEWS.updates._snap = unseenUpdates(); setTimeout(markUpdatesSeen, 1200); },
};
window.addEventListener('hashchange', () => { if (!/^#\/updates/.test(location.hash)) VIEWS.updates._snap = null; });
