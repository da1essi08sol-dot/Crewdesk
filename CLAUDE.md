# Crewdesk — notes for working on this repo

- Node 22 server in `server.js` (one in-memory `db`, saved to Postgres/Neon or `data/`), plain JS front end in `public/js/*.js` sharing globals; actions via `data-act` (`A[...]`), forms `F[...]`, inputs `I[...]`, changes `C[...]`.
- Bump the `?v=` cache-buster in `public/index.html` after front-end changes.
- Work on branch `timesheets-redesign`, fast-forward `main`, push both (Render deploys `main`).

## Update log
More → What's new reads `UPDATES` in `public/js/updates.js` (newest first). **Every time a change goes live, add an entry at the top**
(bump the version, plain user-facing wording, items tagged new / better / fix) — people get a red dot in More until they open it.

## Lock-screen notifications
Web Push is built in (`lib/webpush.js`, `public/sw.js`, no packages, VAPID keys kept in `db.meta.vapid`). Server sends via `pushUser()`
from `notify()`, `postMessage()` and new pings; it skips anyone looking at the app (`/api/looking` heartbeat).

## Tutorials must stay current
The app has a Tutorials page (More → Tutorials) with a written guide and two videos per section: a phone video (portrait,
`public/tutorials/<name>.mp4`) and a computer video (landscape, `public/tutorials/desk/<name>.mp4`); the page picks by screen width.
**Whenever a feature is added or changed, update the matching written guide in `TUTORIALS` (`public/js/admin.js`) and the video scene in
`tools/tutorials/scenes/<name>.js`, then re-record with `tools/tutorials/record.sh <name>`** (add a new scene + `TUTORIALS` entry for a new area).
Videos use the mock company in `tools/tutorials/demo-data.js` (Northgate Geomatics) and mock aerial tiles; keep them short with captions.

## Tutorial voiceovers
Narration lines live in `tools/tutorials/narration.json` (one line per `T.card`/`T.cap`, in order). Put each scene's ElevenLabs audio (one paragraph per line) at `tools/tutorials/voice/<name>.mp3`, run `python3 tools/tutorials/voice_split.py <name>`, then `record.sh <name>`: the video waits for each spoken line and the audio is mixed in.
