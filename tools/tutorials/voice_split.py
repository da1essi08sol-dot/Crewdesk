#!/usr/bin/env python3
# Splits voice/<scene>.mp3 into one segment per narration line: picks pauses closest to where each line should end
# (by share of characters), preferring longer pauses. Usage: python3 voice_split.py <scene> [<scene> ...]
import json, re, subprocess, sys, os
D = os.path.dirname(os.path.abspath(__file__)); N = json.load(open(os.path.join(D, 'narration.json')))
for s in sys.argv[1:]:
    lines = N[s]; mp3 = os.path.join(D, 'voice', s + '.mp3')
    dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3]))
    err = subprocess.run(['ffmpeg', '-hide_banner', '-i', mp3, '-af', 'silencedetect=noise=-40dB:d=0.15', '-f', 'null', '-'], capture_output=True, text=True).stderr
    st = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', err)]; en = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', err)]
    sil = [(a, b) for a, b in zip(st, en) if a > 0.3 and b < dur - 0.2]
    k = len(lines) - 1; tot = sum(len(l) + 12 for l in lines); acc = 0; exp = []
    for l in lines[:-1]: acc += len(l) + 12; exp.append(acc / tot * dur)
    INF = float('inf'); m = len(sil)
    cost = lambda i, j: ((sil[j][0] + sil[j][1]) / 2 - exp[i]) ** 2 - 6 * (sil[j][1] - sil[j][0])
    dp = [[INF] * m for _ in range(k)]; bk = [[-1] * m for _ in range(k)]
    for j in range(m): dp[0][j] = cost(0, j)
    for i in range(1, k):
        best = INF; bj = -1
        for j in range(m):
            if j > 0 and dp[i - 1][j - 1] < best: best = dp[i - 1][j - 1]; bj = j - 1
            if best < INF: dp[i][j] = best + cost(i, j); bk[i][j] = bj
    j = min(range(m), key=lambda x: dp[k - 1][x]); cuts = []
    for i in range(k - 1, -1, -1): cuts.append((sil[j][0] + sil[j][1]) / 2); j = bk[i][j]
    pts = [0] + cuts[::-1] + [dur]
    json.dump({'segs': [{'start': round(pts[i], 3), 'end': round(pts[i + 1], 3)} for i in range(len(lines))]}, open(os.path.join(D, 'voice', s + '.json'), 'w'))
    print(s, ' '.join('%.1f/%.1f' % (pts[i + 1] - pts[i], (len(lines[i]) + 12) / tot * dur) for i in range(len(lines))))
