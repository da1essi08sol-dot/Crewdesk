// Splits voice/<scene>.mp3 (one line of narration.json per paragraph) into timed segments using the pauses between paragraphs.
// Usage: node voice-split.js <scene>   → writes voice/<scene>.json  { segs: [{ start, end }] }
const { execFileSync } = require('child_process'); const fs = require('fs'); const path = require('path');
const scene = process.argv[2]; const mp3 = path.join(__dirname, 'voice', scene + '.mp3');
const lines = require('./narration.json')[scene]; if (!lines) throw new Error('No narration for ' + scene);
const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3]).toString());
const log = execFileSync('ffmpeg', ['-hide_banner', '-i', mp3, '-af', 'silencedetect=noise=-38dB:d=0.25', '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString() || '';
const err = require('child_process').spawnSync('ffmpeg', ['-hide_banner', '-i', mp3, '-af', 'silencedetect=noise=-38dB:d=0.25', '-f', 'null', '-']).stderr.toString();
const sil = []; let s = null;
for (const l of (log + err).split('\n')) { let m; if ((m = /silence_start: ([\d.]+)/.exec(l))) s = Number(m[1]); if ((m = /silence_end: ([\d.]+)/.exec(l)) && s != null) { sil.push({ a: s, b: Number(m[1]) }); s = null; } }
// expected boundaries by share of characters; snap each to the nearest unused pause
const total = lines.reduce((t, x) => t + x.length, 0); let acc = 0; const cuts = [];
for (let i = 0; i < lines.length - 1; i++) { acc += lines[i].length; const guess = (acc / total) * dur;
  const cands = sil.filter((x) => x.a > (cuts.length ? cuts[cuts.length - 1] + 0.3 : 0.3) && x.b < dur - 0.2);
  const best = cands.sort((p, q) => Math.abs((p.a + p.b) / 2 - guess) - Math.abs((q.a + q.b) / 2 - guess) || (q.b - q.a) - (p.b - p.a))[0];
  cuts.push(best ? (best.a + best.b) / 2 : guess); }
const pts = [0].concat(cuts, [dur]); const segs = [];
for (let i = 0; i < lines.length; i++) segs.push({ start: +pts[i].toFixed(3), end: +pts[i + 1].toFixed(3) });
fs.writeFileSync(path.join(__dirname, 'voice', scene + '.json'), JSON.stringify({ segs }, null, 1));
console.log(scene, segs.map((x) => (x.end - x.start).toFixed(1)).join(' '));
