# Crewdesk — notes for working on this repo

- Node 22 server in `server.js` (one in-memory `db`, saved to Postgres/Neon or `data/`), plain JS front end in `public/js/*.js` sharing globals; actions via `data-act` (`A[...]`), forms `F[...]`, inputs `I[...]`, changes `C[...]`.
- Bump the `?v=` cache-buster in `public/index.html` after front-end changes.
- Work on branch `timesheets-redesign`, fast-forward `main`, push both (Render deploys `main`).

## Tutorials must stay current
The app has a Tutorials page (More → Tutorials) with a written guide and two videos per section: a phone video (portrait,
`public/tutorials/<name>.mp4`) and a computer video (landscape, `public/tutorials/desk/<name>.mp4`); the page picks by screen width.
**Whenever a feature is added or changed, update the matching written guide in `TUTORIALS` (`public/js/admin.js`) and the video scene in
`tools/tutorials/scenes/<name>.js`, then re-record with `tools/tutorials/record.sh <name>`** (add a new scene + `TUTORIALS` entry for a new area).
Videos use the mock company in `tools/tutorials/demo-data.js` (Northgate Geomatics) and mock aerial tiles; keep them short with captions.
