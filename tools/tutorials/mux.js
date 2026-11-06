// Puts each narration line under the moment its caption appeared. Usage: node mux.js <scene> <video.mp4> <starts.json> <trimSeconds>
const { execFileSync } = require('child_process'); const fs = require('fs'); const path = require('path');
const [scene, video, startsFile, trim] = process.argv.slice(2);
const mp3 = path.join(__dirname, 'voice', scene + '.mp3'); const segs = JSON.parse(fs.readFileSync(path.join(__dirname, 'voice', scene + '.json'), 'utf8')).segs;
const starts = JSON.parse(fs.readFileSync(startsFile, 'utf8'));
const parts = []; const labels = [];
segs.forEach((g, i) => { if (starts[i] == null) return; const at = Math.max(0, Math.round(starts[i] - Number(trim) * 1000));
  parts.push(`[1:a]atrim=${g.start}:${g.end},asetpts=PTS-STARTPTS,adelay=${at}|${at}[a${i}]`); labels.push(`[a${i}]`); });
const filter = parts.join(';') + `;${labels.join('')}amix=inputs=${labels.length}:normalize=0[aout]`;
const tmp = video.replace(/\.mp4$/, '.voiced.mp4');
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', video, '-i', mp3, '-filter_complex', filter, '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', tmp]);
fs.renameSync(tmp, video); console.log('voiced', path.basename(video));
