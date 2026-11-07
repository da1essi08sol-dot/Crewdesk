# Crewdesk

Log your work as you go and get your timesheets made for you — plus projects, a shared calendar, pings and team chat for small companies, on phones and computers.

**What it does**
- **One big + button.** Pick the project you’re on, tap **+** to start logging what you’re doing (task, type of work, a note), and tap the red square to stop. Lunch and “switch task” are one tap. Home shows today’s log, how your day is going against the schedule, and whether the task you’re on is running over its planned time.
- **Finish for today** stops the timer and asks (optionally) what went well, what went wrong and how it could be better.
- **Timesheets made for you**, in the company’s own *Time & Overtime Sheet* template (`lib/timesheet-template.xlsx`): one file per person per month, named with their initials (e.g. `AS_Nov_2026_Timesheet.xlsx`), plus a yearly workbook. Anything over a standard day is overtime; people can fix times and add overtime themselves, on phone or computer.
- **Projects made of tasks** (no separate “jobs”): job number, site, dates, planned hours per task, plan against actual, a day-by-day timeline of who did what, photos, and a downloadable project timesheet. Several people can work on a project at once.
- **Admin dashboard**: who’s working on what right now, everyone’s days, notes and overtime (with approval — your initials go in “OT Approved By”), a timesheets folder with “download all” as a zip, optional automatic copy to Google Drive, and the suggestions inbox.
- **Suggestions**: anyone can report a bug, suggest an idea or ask HR a question; admins reply.
- Accounts with email confirmation, strong-password rules (12+ characters, checked against known breaches), forgotten-password emails, and lock-outs after repeated wrong passwords
- Companies that people join with an **invite link** or a code + join password
- **Chat**: a company chat, direct messages, group chats, and a project chat only if someone opens one
- **Pings**, a shared **calendar**, **profiles**, admin **spreadsheets** for income and expenses, a team map with optional live GPS, search (Ctrl/⌘ K), light and dark mode, installs on phones like an app
- Privacy policy, terms, “download my data” and “delete my account” built in (UK GDPR)

**Upgrading from the jobs version.** On first start, each job inside a project becomes a task of that project (its old tasks and checklists go into the task’s notes); each job on its own becomes a project, with its tasks. Photos, events, money records, stars and job chats move with them. The old records are kept untouched in the database under `legacy`, and the daily backups still have them.

---

## Hosted (Render + Neon) — how the live site runs

1. The code is on GitHub. Render rebuilds the site automatically every time it changes.
2. Render settings (**Environment** on the service):

| Key | What it is |
|---|---|
| `DATABASE_URL` | Your Neon connection string (`postgresql://…`). Required. |
| `BREVO_API_KEY` | Brevo API key, for sending emails. |
| `EMAIL_FROM` | Who emails come from, e.g. `Crewdesk <crewdesk.alerts@gmail.com>` — must be a sender you’ve verified in Brevo. |
| `OPERATOR_NAME`, `OPERATOR_EMAIL`, `OPERATOR_ADDRESS` | Optional: your business details for the Privacy and Terms pages. |
| `SUPPORT_EMAIL` | Optional: support address shown at the bottom of the Privacy Policy (default da1essi08sol@gmail.com). |
| `KEEP_AWAKE` | Set to `off` to let the free plan sleep. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional: lets an admin connect Google Drive so timesheets are copied there automatically (see below). |

**Email.** Render’s free plan blocks normal email (SMTP) ports, so Crewdesk sends through Brevo’s web API (free: 300 emails a day). Until `BREVO_API_KEY` and `EMAIL_FROM` are set, confirmation and reset links are written to Render’s **Logs** instead, so you can still test. Resend also works (`RESEND_API_KEY`), but needs your own domain.

**Keep-awake.** Render’s free plan sleeps after 15 minutes without visitors. Crewdesk visits its own address every 10 minutes so it stays awake. That uses about 744 of the 750 free hours each workspace gets per month, so keep it as your only free service, or set `KEEP_AWAKE=off`.

**Google Drive (optional).** In Google Cloud Console: create a project → *APIs & Services* → enable the **Google Drive API** → *OAuth consent screen* (External, add your email as a test user, or publish it) → *Credentials* → **Create OAuth client ID** → *Web application*, with authorised redirect URI `https://<your-site>.onrender.com/api/gdrive/callback`. Put the client ID and secret in Render as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Then an admin opens **Admin dashboard → Timesheets → Connect Google Drive**. Crewdesk only gets access to the files it creates (a “… — Crewdesk timesheets” folder, by year and month).

**Backups.** A copy of the whole database is saved once a day in the `crewdesk_backups` table; the last 14 are kept. Neon’s free plan also keeps its own history.

## Run it on your own computer

You need **Node.js 18 or newer**.

1. Double-click **`start.bat`** (or run `node server.js`).
2. Open **http://localhost:3000**.

Data is saved in the `data` folder (backups in `data/backups`). Without email set up, links appear in the window.

## Roles

| | Owner | Admin | Member |
|---|---|---|---|
| Create projects, tasks, events, pings | ✓ | ✓ | ✓ (projects and pings can be switched off) |
| See every project, including private ones | ✓ | ✓ | Only ones shared with them |
| See everyone’s time, day notes and suggestions; approve overtime; download all timesheets | ✓ | ✓ | Only their own |
| Delete projects | ✓ | ✓ | Only their own |
| Spreadsheets (income and expenses) | ✓ | ✓ | |
| Invite people, change join code and password, remove people | ✓ | ✓ | Invites if you turn it on |
| Delete the company, hand over ownership | ✓ | | |

Direct messages and group chats are private to the people in them — admins can’t read them.

## Security

- Passwords: scrypt hashing, 12+ characters with mixed character types, common-password list, and a Have I Been Pwned breach check (only 5 characters of a hash are sent).
- Sign-in: HTTP-only, same-site session cookies (only a hash is stored), new session on each sign-in, other devices signed out after a password change or reset.
- Lock-outs: 5 wrong passwords → 1 hour; the next wrong one → 24 hours, then doubling. The owner is emailed. A password reset unlocks the account, so nobody can be locked out for good. Sign-in and lockouts behave the same for unknown emails. “Forgot password” does say when an email has no account (an owner choice), limited to 8 tries an hour per device.
- Rate limits on sign-in, sign-up, resets, invites and uploads. Requests from other websites are blocked (CSRF).
- Every request is checked on the server against the person’s company, role and access. Uploads need sign-in and the right access, and file types are checked by their contents.
- Strict Content Security Policy, HSTS, no third-party scripts. Map data comes from OpenFreeMap (vector maps), with OpenStreetMap as a fallback.
- Security events (sign-ins, failures, locks, resets) are logged.


## Manhole maps

Projects can have any number of **manhole maps** (project → Maps, project → Add attachment → Manhole map, or More → Files → Create manhole map).
Only people who can see the project can open its maps, records and photos — this is checked on the server for every request.
Manhole types (presets) are shared company-wide and anyone can add or edit them.

| Setting | What it does |
| --- | --- |
| `GOOGLE_MAPS_KEY` | Optional. A Google Maps Platform key with **Maps JavaScript API** and **Geocoding API** enabled (add **Maps Static API** for satellite backgrounds in the PDF exports). Restrict it to your site's address (HTTP referrers) in Google Cloud. Without a key the maps use free Esri satellite imagery and OpenStreetMap search. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Optional. Cloudflare R2 for photos and uploaded files, so they don't fill the database. Create a bucket and an API token with Object Read & Write on it. Files uploaded before this was set keep working. |

**Site Administrator (testing account, optional).** Set `SITE_ADMIN_PASSWORD` in Render, then sign in with `Admin` as the email and that password. The account shows only as "Site Administrator" (no photo, details or clickable profile, but it is listed as a member), joins public companies without approval (private ones need an invite), and can message real accounts to test features. After the first sign-in the password is stored hashed in the database — change it in My settings; changing the Render setting later has no effect. Leave the setting out and the Admin sign-in is switched off.
