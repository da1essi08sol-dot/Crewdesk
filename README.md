# Crewdesk

Projects, jobs, a shared calendar, pings and team chat for small companies — on phones and computers.

**What it does**
- Accounts with email confirmation, strong-password rules (12+ characters, checked against known breaches), forgotten-password emails, and lock-outs after repeated wrong passwords
- Companies that people join with an **invite link** (the company is filled in for them) or a code + join password
- **Projects** that group jobs; star the ones you use most (stars are personal) and archive finished ones
- **Jobs** with client, site, dates, priority, status, tasks with checklists, photos, money, history, and a choice of who can see them (everyone, or selected people)
- **Chat**: a company chat, a chat per job, direct messages and group chats
- **Pings**: company-wide updates anyone can post, with photos and documents attached and a red dot until each person has read them. Plus a personal notifications list
- A shared **calendar** (month, week and day) with events, job start dates and deadlines, and reminders
- **Profiles** you can open by tapping anyone’s picture or name, with a picture cropper
- **Spreadsheets** for admins: editable income and expense records, charts, a clearly-labelled projection, and CSV/Excel export
- A team map with optional live GPS, search everything (Ctrl/⌘ K), light and dark mode, installs on phones like an app
- Privacy policy, terms, “download my data” and “delete my account” built in (UK GDPR)

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

**Email.** Render’s free plan blocks normal email (SMTP) ports, so Crewdesk sends through Brevo’s web API (free: 300 emails a day). Until `BREVO_API_KEY` and `EMAIL_FROM` are set, confirmation and reset links are written to Render’s **Logs** instead, so you can still test. Resend also works (`RESEND_API_KEY`), but needs your own domain.

**Keep-awake.** Render’s free plan sleeps after 15 minutes without visitors. Crewdesk visits its own address every 10 minutes so it stays awake. That uses about 744 of the 750 free hours each workspace gets per month, so keep it as your only free service, or set `KEEP_AWAKE=off`.

**Backups.** A copy of the whole database is saved once a day in the `crewdesk_backups` table; the last 14 are kept. Neon’s free plan also keeps its own history.

## Run it on your own computer

You need **Node.js 18 or newer**.

1. Double-click **`start.bat`** (or run `node server.js`).
2. Open **http://localhost:3000**.

Data is saved in the `data` folder (backups in `data/backups`). Without email set up, links appear in the window.

## Roles

| | Owner | Admin | Member |
|---|---|---|---|
| Create projects, jobs, events, pings | ✓ | ✓ | ✓ (each can be switched off) |
| See every project and job, including private ones | ✓ | ✓ | Only ones shared with them |
| Delete jobs and projects | ✓ | ✓ | Only their own |
| Spreadsheets, prices and costs | ✓ | ✓ | Money only if you turn it on |
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
