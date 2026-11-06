const path = require('path');
// Records tutorial videos with captions. Usage: node rec.js <name> [desktop]
const { chromium, devices } = require('playwright'); const fs = require('fs');
const base = 'http://localhost:3998'; const OUT = __dirname + '/.work/raw'; const TILES = __dirname + '/.work/tiles';
const CSS = `#tut-cap{position:fixed;left:14px;right:14px;bottom:96px;z-index:99999;background:rgba(10,30,20,.86);color:#fff;font:600 16px/1.35 Inter,system-ui,sans-serif;padding:12px 16px;border-radius:14px;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.25);transition:opacity .35s,transform .35s;opacity:0;transform:translateY(8px);pointer-events:none}
#tut-cap.on{opacity:1;transform:none}
.tut-tap{position:fixed;z-index:99998;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(24,105,63,.35);border:3px solid rgba(24,105,63,.9);pointer-events:none;animation:tuttap .7s ease-out forwards}
@keyframes tuttap{from{transform:scale(.4);opacity:1}to{transform:scale(1.5);opacity:0}}
#tut-card{position:fixed;inset:0;z-index:100000;background:linear-gradient(160deg,#0f4f2f,#062a18);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px;font-family:Inter,system-ui,sans-serif;transition:opacity .5s}
#tut-card img{width:96px;height:96px;border-radius:24px;margin-bottom:22px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
#tut-card h1{font-size:30px;margin:0 0 10px;font-weight:800;letter-spacing:-.02em}#tut-card p{font-size:17px;opacity:.85;margin:0;max-width:640px;line-height:1.45}
.tut-desk #tut-cap{left:50%;right:auto;transform:translateX(-50%);bottom:40px;max-width:900px;font-size:22px;padding:14px 26px}.tut-desk #tut-cap.on{transform:translateX(-50%)}
.tut-desk #tut-card h1{font-size:52px}.tut-desk #tut-card p{font-size:24px}.tut-desk #tut-card img{width:140px;height:140px;border-radius:32px}`;
async function setup(name, desktop) {
  desktop = desktop || process.env.DESK === '1'; const outName = desktop ? name + '-desk' : name;
  const browser = await chromium.launch();
  const size = desktop ? { width: 1280, height: 720 } : { width: 390, height: 664 };
  const ctx = await browser.newContext(Object.assign({}, desktop ? { viewport: size } : devices['iPhone 13'], { deviceScaleFactor: desktop ? 1 : 2, recordVideo: { dir: OUT + '/' + outName, size: desktop ? size : { width: 390, height: 664 } } }));
  const page = await ctx.newPage(); page.on('pageerror', (e) => console.log('ERR', e.message)); const t0 = Date.now();
  // Narration: each card/caption is one spoken line; the video waits for the line before moving to the next one.
  const vf = path.join(__dirname, 'voice', name + '.json'); const voice = fs.existsSync(vf) ? JSON.parse(fs.readFileSync(vf, 'utf8')).segs : null;
  const starts = []; const seg = async () => { if (voice) { const i = starts.length; if (i > 0 && voice[i - 1]) { const need = starts[i - 1] + (voice[i - 1].end - voice[i - 1].start) * 1000 + 200; const left = need - (Date.now() - t0); if (left > 0) await page.waitForTimeout(left); } } starts.push(Date.now() - t0); };
  await ctx.grantPermissions(['geolocation']); await ctx.setGeolocation({ latitude: 54.77612, longitude: -1.58455, accuracy: 4 });
  // mock aerial imagery (this machine can't reach real map servers)
  const tile = (z, x, y) => { const f = TILES + `/${z}/${x}/${y}.jpg`; return fs.existsSync(f) ? fs.readFileSync(f) : fs.readFileSync(TILES + '/grass.jpg'); };
  await ctx.route(/arcgisonline\.com\/.*World_Imagery.*\/tile\/(\d+)\/(\d+)\/(\d+)/, (r) => { const m = /tile\/(\d+)\/(\d+)\/(\d+)/.exec(r.request().url()); r.fulfill({ status: 200, contentType: 'image/jpeg', body: tile(m[1], m[3], m[2]) }); });
  await ctx.route(/arcgisonline\.com\/.*Reference/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(TILES + '/clear.png') }));
  await ctx.route(/tile\.openstreetmap\.org\/(\d+)\/(\d+)\/(\d+)\.png/, (r) => { const m = /org\/(\d+)\/(\d+)\/(\d+)\.png/.exec(r.request().url()); r.fulfill({ status: 200, contentType: 'image/jpeg', body: tile(m[1], m[2], m[3]) }); });
  await ctx.route(/openfreemap\.org/, (r) => r.abort());
  const H = { 'X-Crewdesk': '1', 'Content-Type': 'application/json' };
  await page.request.post(base + '/api/login', { headers: H, data: { email: 'sam@northgate.demo', password: 'Correct-Horse-9-Battery' } });
  const inject = async () => page.evaluate(([css, desk]) => { if (document.getElementById('tut-style')) return; const s = document.createElement('style'); s.id = 'tut-style'; s.textContent = css; document.head.appendChild(s);
    const c = document.createElement('div'); c.id = 'tut-cap'; document.body.appendChild(c); if (desk) document.documentElement.classList.add('tut-desk'); }, [CSS, desktop]);
  page.on('load', () => inject().catch(() => {}));
  const w = (ms) => page.waitForTimeout(ms);
  const T = {
    page, H, w, base, desk: desktop,
    async go(hash, ms = 900) { await page.evaluate((h) => { location.hash = h; }, hash).catch(async () => { await page.goto(base + '/' + hash); }); await w(ms); await inject(); },
    async cap(text, ms = 2600) { await seg(); await inject(); await page.evaluate((t) => { const c = document.getElementById('tut-cap'); c.classList.remove('on'); setTimeout(() => { c.textContent = t; c.classList.add('on'); }, 120); }, text); await w(ms); },
    async nocap() { await page.evaluate(() => document.getElementById('tut-cap') && document.getElementById('tut-cap').classList.remove('on')); },
    async tap(sel, ms = 900) { const l = page.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); const b = await l.boundingBox();
      if (b) await page.evaluate(([x, y]) => { const d = document.createElement('div'); d.className = 'tut-tap'; d.style.left = x + 'px'; d.style.top = y + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 800); }, [b.x + b.width / 2, b.y + b.height / 2]);
      await w(250); await l.click(); await w(ms); },
    async type(sel, text) { await page.locator(sel).first().click(); await page.keyboard.type(text, { delay: 45 }); await w(300); },
    async card(title, sub, ms = 2600) { await seg(); await inject(); await page.evaluate(([t, s]) => { let c = document.getElementById('tut-card'); if (!c) { c = document.createElement('div'); c.id = 'tut-card'; document.body.appendChild(c); }
      c.style.opacity = 1; c.innerHTML = `<img src="/icon-512.png" alt=""><h1></h1><p></p>`; c.querySelector('h1').textContent = t; c.querySelector('p').textContent = s; }, [title, sub]); await w(ms); },
    async uncard() { await page.evaluate(() => { const c = document.getElementById('tut-card'); if (c) { c.style.opacity = 0; setTimeout(() => c.remove(), 500); } }); await w(600); },
    async scroll(y, ms = 900) { await page.evaluate((y) => { (document.scrollingElement).scrollBy({ top: y, behavior: 'smooth' }); }, y); await w(ms); },
    async done() { if (voice && starts.length && voice[starts.length - 1]) { const i = starts.length - 1; const left = starts[i] + (voice[i].end - voice[i].start) * 1000 + 300 - (Date.now() - t0); if (left > 0) await w(left); } fs.writeFileSync(OUT + '/' + outName + '.starts.json', JSON.stringify(starts)); await w(400); const v = page.video(); await ctx.close(); await browser.close(); const p = await v.path(); fs.renameSync(p, OUT + '/' + outName + '.webm'); fs.rmSync(OUT + '/' + outName, { recursive: true, force: true }); console.log('saved', outName); },
  };
  await page.goto(base + '/#/home'); await w(1200); await inject();
  return T;
}
module.exports = { setup };
if (require.main === module) { const name = process.argv[2]; require('./scenes/' + name)(setup).catch((e) => { console.error(e); process.exit(1); }); }
