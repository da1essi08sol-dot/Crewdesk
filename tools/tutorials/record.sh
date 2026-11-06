#!/bin/bash
# Records the tutorial videos (phone portrait + computer landscape) from the mock company and
# encodes them into public/tutorials/ (phone) and public/tutorials/desk/ (computer).
#   tools/tutorials/record.sh                 # all of them
#   tools/tutorials/record.sh manholes team   # just these
# Needs Node with Playwright + Chromium, Python 3 with Pillow, and ffmpeg.
set -e
T="$(cd "$(dirname "$0")" && pwd)"; APP="$(cd "$T/../.." && pwd)"; W="$T/.work"; mkdir -p "$W/raw"
[ -d "$W/tiles/20" ] || python3 "$T/mktiles.py"
LIST="$*"; [ -z "$LIST" ] && LIST="promo home projects timesheet calendar chat team suggest admin mhplot manholes sheets settings"
for s in $LIST; do for d in 0 1; do
  pkill -f crewdesk-tutorials 2>/dev/null || true; sleep 0.5
  node "$T/demo-data.js" "$W/data" >/dev/null
  (cd "$APP" && DATA_DIR="$W/data" PORT=3998 exec -a crewdesk-tutorials node server.js > "$W/server.log" 2>&1 &)
  for i in $(seq 1 50); do sleep 0.2; curl -s localhost:3998/api/health >/dev/null && break; done
  DESK=$d node "$T/rec.js" "$s"
done; done
pkill -f crewdesk-tutorials 2>/dev/null || true
mkdir -p "$APP/public/tutorials/desk"
for s in $LIST; do
  ffmpeg -loglevel error -y -ss 1.3 -i "$W/raw/$s.webm" -vf "crop=390:664:0:0,fps=30" -c:v libx264 -preset veryfast -crf 26 -pix_fmt yuv420p -movflags +faststart -an "$APP/public/tutorials/$s.mp4"
  ffmpeg -loglevel error -y -i "$APP/public/tutorials/$s.mp4" -ss 6 -frames:v 1 -q:v 4 "$APP/public/tutorials/$s.jpg"
  ffmpeg -loglevel error -y -ss 1.3 -i "$W/raw/$s-desk.webm" -vf fps=30 -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p -movflags +faststart -an "$APP/public/tutorials/desk/$s.mp4"
  ffmpeg -loglevel error -y -i "$APP/public/tutorials/desk/$s.mp4" -ss 6 -frames:v 1 -vf scale=640:-2 -q:v 4 "$APP/public/tutorials/desk/$s.jpg"
  echo "encoded $s"
done
