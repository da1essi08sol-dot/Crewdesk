// Tiny PDF writer (no dependencies): A4 pages, Helvetica text, rules and filled boxes. Enough for clean reports.
'use strict';
const zlib = require('zlib');

const W = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,
  667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,
  556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const MAP = { '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '…': '...', '•': '*', '→': '->', '·': '-', '×': 'x', '€': 'EUR', ' ': ' ' };
const clean = (s) => String(s == null ? '' : s).replace(/[‘’“”–—…•→·×€ ]/g, (c) => MAP[c]).replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7e£©°à-ÿ]/g, '?');
const esc = (s) => clean(s).replace(/[\\()]/g, '\\$&');
const wid = (s, size, bold) => { let w = 0; for (const ch of clean(s)) { const c = ch.charCodeAt(0); w += (c >= 32 && c <= 126 ? W[c - 32] : 556); } return w * size / 1000 * (bold ? 1.06 : 1); };
const hex = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)).join(' '); };

class Doc {
  constructor(opts = {}) {
    this.w = 595.28; this.h = 841.89; this.m = 44; this.pages = []; this.footer = opts.footer || ''; this.images = [];
    this.newPage();
  }
  newPage() { this.ops = []; this.pages.push(this.ops); this.y = this.h - this.m; }
  get inner() { return this.w - this.m * 2; }
  ensure(h) { if (this.y - h < this.m + 18) this.newPage(); }
  rect(x, y, w, h, fill) { this.ops.push(`${hex(fill)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); }
  line(x1, y1, x2, y2, color = '#d8dcd9', lw = 0.6) { this.ops.push(`${hex(color)} RG ${lw} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`); }
  textWidth(s, size = 10, bold) { return wid(s, size, bold); }
  circle(cx, cy, r, fill, stroke, lw = 1) { const k = 0.5523 * r; const f = (n) => n.toFixed(2);
    const path = `${f(cx + r)} ${f(cy)} m ${f(cx + r)} ${f(cy + k)} ${f(cx + k)} ${f(cy + r)} ${f(cx)} ${f(cy + r)} c ${f(cx - k)} ${f(cy + r)} ${f(cx - r)} ${f(cy + k)} ${f(cx - r)} ${f(cy)} c ${f(cx - r)} ${f(cy - k)} ${f(cx - k)} ${f(cy - r)} ${f(cx)} ${f(cy - r)} c ${f(cx + k)} ${f(cy - r)} ${f(cx + r)} ${f(cy - k)} ${f(cx + r)} ${f(cy)} c`;
    this.ops.push(`${hex(fill)} rg ${stroke ? `${hex(stroke)} RG ${lw} w ` : ''}${path} ${stroke ? 'B' : 'f'}`); }
  // A JPEG drawn into a box; with cover, it fills the box and the overflow is cropped.
  // an image placed at (dx,dy,dw,dh) but only visible inside the clip box
  clipImage(buf, iw, ih, cx, cy, cw, ch, dx, dy, dw, dh) {
    let idx = this.images.findIndex((im) => im.buf === buf); if (idx < 0) { this.images.push({ buf, w: iw, h: ih }); idx = this.images.length - 1; }
    this.ops.push(`q ${cx.toFixed(2)} ${cy.toFixed(2)} ${cw.toFixed(2)} ${ch.toFixed(2)} re W n ${dw.toFixed(3)} 0 0 ${dh.toFixed(3)} ${dx.toFixed(3)} ${dy.toFixed(3)} cm /Im${idx} Do Q`);
  }
  image(buf, iw, ih, x, y, w, h, cover) {
    let idx = this.images.findIndex((im) => im.buf === buf); if (idx < 0) { this.images.push({ buf, w: iw, h: ih }); idx = this.images.length - 1; }
    let dw = w, dh = h, dx = x, dy = y;
    if (cover) { const s = Math.max(w / iw, h / ih); dw = iw * s; dh = ih * s; dx = x + (w - dw) / 2; dy = y + (h - dh) / 2; }
    this.ops.push(`q ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re W n ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${dx.toFixed(2)} ${dy.toFixed(2)} cm /Im${idx} Do Q`);
  }
  text(s, x, y, size = 10, o = {}) {
    this.ops.push(`BT /${o.bold ? 'F2' : 'F1'} ${size} Tf ${hex(o.color || '#1d2421')} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${esc(s)}) Tj ET`);
  }
  fit(s, width, size, bold) { s = clean(s); if (wid(s, size, bold) <= width) return s; while (s.length > 1 && wid(s + '...', size, bold) > width) s = s.slice(0, -1); return s + '...'; }
  wrap(s, width, size, bold) {
    const out = []; let cur = '';
    for (const word of clean(s).split(' ')) {
      const t = cur ? cur + ' ' + word : word;
      if (wid(t, size, bold) <= width) cur = t; else { if (cur) out.push(cur); cur = wid(word, size, bold) > width ? this.fit(word, width, size, bold) : word; }
    }
    if (cur) out.push(cur); return out.length ? out : [''];
  }
  para(s, size = 10, o = {}) {
    for (const ln of this.wrap(s, o.width || this.inner, size, o.bold)) { this.ensure(size * 1.5); this.y -= size * 1.35; this.text(ln, this.m + (o.indent || 0), this.y, size, o); }
    this.y -= o.after == null ? 4 : o.after;
  }
  heading(s, color = '#18693f') { this.ensure(40); this.y -= 22; this.text(s.toUpperCase(), this.m, this.y, 9, { bold: true, color }); this.y -= 5; this.line(this.m, this.y, this.w - this.m, this.y, color, 0.8); this.y -= 3; }
  // cols: [{ label, w (fraction), align }]; rows: arrays of strings
  table(cols, rows, o = {}) {
    const total = cols.reduce((a, c) => a + c.w, 0); const widths = cols.map((c) => c.w / total * this.inner); const size = o.size || 9; const pad = 4;
    const cell = (r, bold, fill) => {
      this.ensure(size + 9); const top = this.y; if (fill) this.rect(this.m, top - size - 7, this.inner, size + 7, fill);
      let x = this.m; r.forEach((v, i) => { const s = this.fit(v, widths[i] - pad * 2, size, bold); const tw = wid(s, size, bold);
        this.text(s, cols[i].align === 'r' ? x + widths[i] - pad - tw : x + pad, top - size - 2, size, { bold, color: bold ? '#53625a' : '#1d2421' }); x += widths[i]; });
      this.y = top - size - 7;
    };
    cell(cols.map((c) => c.label), true, '#eef2ef');
    rows.forEach((r, i) => { cell(r, false, i % 2 ? '#f8f9f8' : null); });
    this.y -= 4;
  }
  stats(items) { // row of big numbers
    this.ensure(54); const gap = 8; const w = (this.inner - gap * (items.length - 1)) / items.length; const top = this.y - 4;
    items.forEach(([label, val], i) => { const x = this.m + i * (w + gap); this.rect(x, top - 46, w, 46, '#f1f5f2');
      this.text(val, x + 9, top - 22, 15, { bold: true, color: '#0f4f2f' }); this.text(label, x + 9, top - 37, 8, { color: '#667a6f' }); });
    this.y = top - 54;
  }
  build() {
    const objs = []; const add = (s) => { objs.push(s); return objs.length; };
    add('<< /Type /Catalog /Pages 2 0 R >>'); add(''); // 2 = pages, filled later
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'); add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const imgRefs = this.images.map((im) => add({ stream: im.buf, dict: `/Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode` }));
    const xo = imgRefs.length ? ` /XObject << ${imgRefs.map((r, i) => `/Im${i} ${r} 0 R`).join(' ')} >>` : '';
    const kids = [];
    this.pages.forEach((ops, i) => {
      const foot = [`BT /F1 8 Tf ${hex('#8a988f')} rg ${this.m} 24 Td (${esc(this.footer)}) Tj ET`, `BT /F1 8 Tf ${hex('#8a988f')} rg ${this.w - this.m - 40} 24 Td (Page ${i + 1} of ${this.pages.length}) Tj ET`];
      const data = zlib.deflateSync(Buffer.from(ops.concat(foot).join('\n'), 'latin1'));
      const c = add({ stream: data, dict: '/Filter /FlateDecode' });
      kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.w} ${this.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xo} >> /Contents ${c} 0 R >>`));
    });
    objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
    const parts = [Buffer.from('%PDF-1.4\n')]; const offs = []; let pos = parts[0].length;
    objs.forEach((o, i) => {
      offs.push(pos);
      const b = typeof o === 'string' ? Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, 'latin1')
        : Buffer.concat([Buffer.from(`${i + 1} 0 obj\n<< ${o.dict} /Length ${o.stream.length} >>\nstream\n`), o.stream, Buffer.from('\nendstream\nendobj\n')]);
      parts.push(b); pos += b.length;
    });
    const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    parts.push(Buffer.from(xref + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF`));
    return Buffer.concat(parts);
  }
}
module.exports = { Doc, wid, clean };
