// Timesheets: turns logged time into the company's own "Time & Overtime Sheet" template (one file per person per month),
// plus simple yearly and per-project workbooks. Plain Node, no dependencies.
'use strict';
const fs = require('fs');
const path = require('path');
const { readZip, writeZip } = require('./zip');

const TEMPLATE_FILE = path.join(__dirname, 'timesheet-template.xlsx');
let templateBuf = null;
const template = () => (templateBuf = templateBuf || fs.readFileSync(TEMPLATE_FILE));

// Types of time, matching the colour key along the top of the template.
// paid: counts towards the day's hours. job: goes against the project's job number (otherwise the "Non-Productive" row).
const CATS = {
  field: { label: 'Field', paid: true, job: true, fill: 2 },
  office: { label: 'Office', paid: true, job: true, fill: 4 },
  rework: { label: 'Rework', paid: true, job: true, fill: 9, font: 7 },
  training: { label: 'Training', paid: true, job: false, fill: 6 },
  nonprod: { label: 'Non-productive', paid: true, job: false, fill: 5 },
  lunch: { label: 'Lunch', paid: false, job: false, fill: 3 },
  holiday: { label: 'Holiday', paid: false, job: false, fill: 7, font: 7 },
  absent: { label: 'Absent', paid: false, job: false, fill: 8, font: 7 },
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ---------------------------------------------------------------- time helpers
const fmts = {};
function zoneParts(ts, tz = 'Europe/London') {
  const f = fmts[tz] = fmts[tz] || new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = {}; for (const x of f.formatToParts(new Date(ts))) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, mins: Number(p.hour) * 60 + Number(p.minute) };
}
const pad = (n) => String(n).padStart(2, '0');
const hm = (mins) => `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;
const isoDay = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const dayOfWeek = (ds) => (new Date(ds + 'T00:00:00Z').getUTCDay() + 6) % 7; // 0 = Monday
const serial = (ds) => (Date.parse(ds + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 864e5;
const round2 = (n) => Math.round(n * 100) / 100;
const hours = (mins) => round2(mins / 60);
function initials(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return 'XX';
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[w.length - 1][0]).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
}
const monthFileName = (name, y, m) => `${initials(name)}_${MONTHS[m - 1]}_${y}_Timesheet.xlsx`;
const yearFileName = (name, y) => `${initials(name)}_${y}_Timesheet.xlsx`;
const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 80) || 'file';

// One person's entries, grouped and totalled by day (in the company's time zone).
function dayTotals(entries, opts = {}) {
  const tz = opts.tz || 'Europe/London'; const now = opts.now || Date.now(); const dayHours = opts.dayHours || 8;
  const days = {};
  for (const e of entries) {
    const end = e.end || now; if (end <= e.start) continue;
    const a = zoneParts(e.start, tz); const mins = Math.round((end - e.start) / 60000);
    const d = days[a.date] = days[a.date] || { date: a.date, entries: [], paid: 0, nonprod: 0, byProject: {}, cats: {}, first: null, last: null };
    const cat = CATS[e.category] ? e.category : 'field';
    d.entries.push(Object.assign({ startMin: a.mins, endMin: a.mins + mins, mins }, e));
    d.cats[cat] = (d.cats[cat] || 0) + mins;
    if (CATS[cat].paid) {
      d.paid += mins;
      if (CATS[cat].job && e.projectId) d.byProject[e.projectId] = (d.byProject[e.projectId] || 0) + mins;
      else d.nonprod += mins;
    }
    if (d.first == null || a.mins < d.first) d.first = a.mins;
    if (d.last == null || a.mins + mins > d.last) d.last = a.mins + mins;
  }
  for (const d of Object.values(days)) {
    d.entries.sort((x, y) => x.start - y.start);
    const rate = dayOfWeek(d.date) >= 5 ? 1.5 : 1;
    d.ot = d.paid === 0 ? 0 : round2(hours(d.paid) - dayHours); // same rule as the template: hours over (or under) a standard day
    d.otRate = rate; d.otPay = round2(d.ot * rate);
  }
  return days;
}

// ---------------------------------------------------------------- sheet XML editing
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colNum = (c) => [...c].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
const colName = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
// edits: Map 'B4' -> { v (number|string), str (bool), keepF (keep the formula, set the cached value), s (style index) }
function applyEdits(xml, edits) {
  const byRow = new Map();
  for (const [ref, e] of edits) { const m = /^([A-Z]+)(\d+)$/.exec(ref); const r = Number(m[2]); if (!byRow.has(r)) byRow.set(r, new Map()); byRow.get(r).set(m[1], e); }
  const cellXml = (ref, attrs, inner, e) => {
    let a = attrs;
    if (e.s != null) a = /\ss="/.test(a) ? a.replace(/\ss="\d+"/, ` s="${e.s}"`) : a + ` s="${e.s}"`;
    if (!('v' in e)) return inner == null ? `<c r="${ref}"${a}/>` : `<c r="${ref}"${a}>${inner}</c>`;
    a = a.replace(/\s+t="[^"]*"/, '');
    if (e.keepF) { const f = (inner || '').match(/<f[^>]*\/>|<f[^>]*>[\s\S]*?<\/f>/); return `<c r="${ref}"${a}>${f ? f[0] : ''}<v>${e.v}</v></c>`; }
    if (e.v === '' || e.v == null) return `<c r="${ref}"${a}/>`;
    if (e.str || typeof e.v === 'string') return `<c r="${ref}"${a} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(e.v)}</t></is></c>`;
    return `<c r="${ref}"${a}><v>${e.v}</v></c>`;
  };
  return xml.replace(/<row r="(\d+)"([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g, (whole, rn, rattrs, tail, body) => {
    const ed = byRow.get(Number(rn)); if (!ed) return whole;
    const cells = []; const seen = new Set();
    for (const m of (body || '').matchAll(/<c r="([A-Z]+)(\d+)"((?:\s+[\w:]+="[^"]*")*)\s*(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const col = m[1]; seen.add(col);
      cells.push({ col, xml: ed.has(col) ? cellXml(col + rn, m[3], m[4], ed.get(col)) : m[0] });
    }
    for (const [col, e] of ed) if (!seen.has(col)) cells.push({ col, xml: cellXml(col + rn, '', null, e) });
    cells.sort((x, y) => colNum(x.col) - colNum(y.col));
    return `<row r="${rn}"${rattrs.replace(/\s*spans="[^"]*"/, '')}>${cells.map((c) => c.xml).join('')}</row>`;
  });
}

// New cell styles: an existing grid cell's border and font, with a category's fill.
function styleMaker(stylesXml) {
  const head = /<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/.exec(stylesXml);
  const xfs = head[2].match(/<xf [^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g);
  const added = []; const memo = new Map();
  return {
    styleFor(base, cat) {
      const key = base + '|' + cat; if (memo.has(key)) return memo.get(key);
      const c = CATS[cat]; let x = xfs[base] || xfs[0];
      x = x.replace(/fillId="\d+"/, `fillId="${c.fill}"`);
      if (!/applyFill=/.test(x)) x = x.replace('<xf ', '<xf applyFill="1" ');
      if (c.font) { x = x.replace(/fontId="\d+"/, `fontId="${c.font}"`); if (!/applyFont=/.test(x)) x = x.replace('<xf ', '<xf applyFont="1" '); }
      const idx = xfs.length + added.length; added.push(x); memo.set(key, idx); return idx;
    },
    finish() { return stylesXml.replace(head[0], `<cellXfs count="${xfs.length + added.length}">${head[2]}${added.join('')}</cellXfs>`); },
  };
}
const cellStyle = (xml, ref) => { const m = new RegExp(`<c r="${ref}"[^>]*?\\ss="(\\d+)"`).exec(xml); return m ? Number(m[1]) : 0; };

// Fill one copy of the "Time & Overtime Sheet" for the 21 days starting on `startDs` (a Monday).
function fillSheet(xml, st, o) {
  const { startDs, month, days, projects, approvals, dayHours, label, otTotalFormula, otTotalValue, approverList } = o;
  const E = new Map();
  E.set('D1', { v: o.name, str: true }); E.set('I1', { v: label, str: true });
  E.set('B4', { v: serial(startDs) }); E.set('B5', { v: 'Mon', str: true });
  for (let i = 0; i < 21; i++) {
    const col = colName(2 + i);
    const ds = isoDay(new Date(Date.parse(startDs + 'T00:00:00Z') + i * 864e5));
    if (i) E.set(col + '4', { v: serial(ds), keepF: true });
    const d = days[ds];
    const inMonth = ds.slice(0, 7) === month;
    const empty = { total: 0, ot: 0, otPay: 0 };
    if (!inMonth || !d) {
      E.set(col + '54', { v: 0, keepF: true }); E.set(col + '56', { v: 0, keepF: true }); E.set(col + '60', { v: 0, keepF: true });
      if (inMonth && approvals[ds]) E.set(col + '59', { v: approvals[ds], str: true });
      void empty; continue;
    }
    // 15-minute grid, 08:00–16:45 (rows 7–42), coloured by the type of time; before/after rows show times outside it.
    for (let k = 0; k < 36; k++) {
      const mid = 8 * 60 + k * 15 + 7.5;
      const e = d.entries.find((x) => x.startMin <= mid && x.endMin > mid);
      if (e) { const ref = col + (7 + k); E.set(ref, { s: st.styleFor(cellStyle(xml, ref), CATS[e.category] ? e.category : 'field') }); }
    }
    const early = d.entries.filter((x) => x.startMin < 8 * 60);
    if (early.length) { const ref = col + '6'; E.set(ref, { v: hm(early[0].startMin), str: true, s: st.styleFor(cellStyle(xml, ref), early[0].category || 'field') }); }
    const late = d.entries.filter((x) => x.endMin > 17 * 60);
    if (late.length) { const l = late[late.length - 1]; const ref = col + '43'; E.set(ref, { v: hm(l.endMin), str: true, s: st.styleFor(cellStyle(xml, ref), l.category || 'field') }); }
    // Job numbers and hours (four slots), then non-productive time.
    const jobs = Object.entries(d.byProject).sort((a, b) => b[1] - a[1]);
    const slots = jobs.slice(0, 4);
    if (jobs.length > 4) slots[3] = [jobs.slice(3).map(([pid]) => pid).join('+'), jobs.slice(3).reduce((a, j) => a + j[1], 0)];
    const ref = (pid) => pid.split('+').map((p) => (projects[p] && (projects[p].ref || projects[p].name)) || 'Deleted project').join(' + ');
    slots.forEach(([pid, mins], i2) => { E.set(col + (45 + i2 * 2), { v: ref(pid), str: true }); E.set(col + (46 + i2 * 2), { v: hours(mins) }); });
    if (d.nonprod) E.set(col + '53', { v: hours(d.nonprod) });
    E.set(col + '54', { v: hours(d.paid), keepF: true });
    E.set(col + '56', { v: d.ot, keepF: true });
    if (d.ot > 0) E.set(col + '57', { v: [...new Set(d.entries.filter((x) => x.endMin > 16 * 60 + 30 && x.projectId && projects[x.projectId]).map((x) => projects[x.projectId].ref || projects[x.projectId].name))].join(', ') || '', str: true });
    E.set(col + '59', { v: approvals[ds] || '-', str: true });
    E.set(col + '60', { v: d.otPay, keepF: true });
  }
  E.set('B63', { v: otTotalValue });
  E.set('B66', { v: otTotalValue, keepF: true });
  let out = applyEdits(xml, E);
  out = out.replace(/<c r="B63"([^>]*)><v>/, `<c r="B63"$1><f>${xmlEsc(otTotalFormula)}</f><v>`);
  if (dayHours !== 8) out = out.replace(/(SUM\(B46,B48,B50,B52,B53\))-8\)/, `$1-${dayHours})`);
  out = out.replace(/<formula1>"[^"]*"<\/formula1>/, `<formula1>"${xmlEsc([...new Set(approverList.concat('-'))].join(',')).slice(0, 250)}"</formula1>`);
  return out;
}

// The month's timesheet for one person, in the company's template. Returns { name, data }.
// opts: { person: {name}, year, month (1-12), entries, projects {id: {ref,name}}, approvals {date: initials}, dayHours, tz, approverList }
function monthWorkbook(opts) {
  const { year, month } = opts;
  const ym = `${year}-${pad(month)}`;
  const files = readZip(template());
  const st = styleMaker(files.get('xl/styles.xml').toString('utf8'));
  const sheet = files.get('xl/worksheets/sheet1.xml').toString('utf8');
  const first = new Date(Date.UTC(year, month - 1, 1));
  const start = new Date(first.getTime() - ((first.getUTCDay() + 6) % 7) * 864e5);
  const s2 = new Date(start.getTime() + 21 * 864e5);
  const lbl = (d, n) => { const e = new Date(d.getTime() + n * 864e5); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} - ${e.getUTCDate()} ${MONTHS[e.getUTCMonth()]}`; };
  const n1 = lbl(start, 20), n2 = lbl(s2, 20);
  const days = dayTotals(opts.entries, { tz: opts.tz, dayHours: opts.dayHours });
  const otMonth = round2(Object.values(days).filter((d) => d.date.slice(0, 7) === ym).reduce((a, d) => a + d.otPay, 0));
  const q = (n) => `'${n.replace(/'/g, "''")}'`;
  const common = { month: ym, days, projects: opts.projects || {}, approvals: opts.approvals || {}, dayHours: opts.dayHours || 8, name: opts.person.name,
    label: `${MONTHS[month - 1]}-${String(year).slice(2)}`, otTotalFormula: `SUM(${q(n1)}!B60:V60,${q(n2)}!B60:V60)`, otTotalValue: otMonth, approverList: opts.approverList || [] };
  const x1 = fillSheet(sheet, st, Object.assign({ startDs: isoDay(start) }, common));
  const x2 = fillSheet(sheet, st, Object.assign({ startDs: isoDay(s2) }, common)).replace(/\stabSelected="1"/, '');
  files.set('xl/worksheets/sheet1.xml', Buffer.from(x1));
  files.set('xl/worksheets/sheet3.xml', Buffer.from(x2));
  files.set('xl/styles.xml', Buffer.from(st.finish()));
  // Night shift form: name and month filled in, otherwise as the template.
  const ns = files.get('xl/worksheets/sheet2.xml').toString('utf8');
  files.set('xl/worksheets/sheet2.xml', Buffer.from(applyEdits(ns, new Map([['I1', { v: opts.person.name, str: true }], ['N1', { v: common.label, str: true }]])).replace(/\stabSelected="1"/, '')));
  // Workbook: three sheets, recalculated when opened; drop the old calculation chain.
  let wb = files.get('xl/workbook.xml').toString('utf8');
  wb = wb.replace(/<mc:AlternateContent[\s\S]*?<\/mc:AlternateContent>/, '')
    .replace(/<sheets>[\s\S]*?<\/sheets>/, `<sheets><sheet name="${xmlEsc(n1)}" sheetId="1" r:id="rId1"/><sheet name="${xmlEsc(n2)}" sheetId="3" r:id="rId8"/><sheet name="Night Shift Claim Form" sheetId="2" r:id="rId2"/></sheets>`)
    .replace(/<calcPr([^>]*?)\/>/, (m0, a) => `<calcPr${a.replace(/\sfullCalcOnLoad="\d"/, '')} fullCalcOnLoad="1"/>`);
  files.set('xl/workbook.xml', Buffer.from(wb));
  let rels = files.get('xl/_rels/workbook.xml.rels').toString('utf8');
  rels = rels.replace(/<Relationship [^>]*calcChain[^>]*\/>/, '').replace('</Relationships>', '<Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/></Relationships>');
  files.set('xl/_rels/workbook.xml.rels', Buffer.from(rels));
  let ct = files.get('[Content_Types].xml').toString('utf8');
  ct = ct.replace(/<Override PartName="\/xl\/calcChain.xml"[^>]*\/>/, '').replace('</Types>', '<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  files.set('[Content_Types].xml', Buffer.from(ct));
  files.delete('xl/calcChain.xml');
  files.set('docProps/app.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Excel</Application><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>3</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="3" baseType="lpstr"><vt:lpstr>${xmlEsc(n1)}</vt:lpstr><vt:lpstr>${xmlEsc(n2)}</vt:lpstr><vt:lpstr>Night Shift Claim Form</vt:lpstr></vt:vector></TitlesOfParts></Properties>`));
  files.set('docProps/core.xml', Buffer.from(coreXml(`${opts.person.name} — timesheet ${MONTHS[month - 1]} ${year}`)));
  // Put the parts back in a sensible order: content types first.
  const order = ['[Content_Types].xml', '_rels/.rels'];
  const names = order.concat([...files.keys()].filter((n) => !order.includes(n)));
  return { name: monthFileName(opts.person.name, year, month), data: writeZip(names.map((n) => ({ name: n, data: files.get(n) }))) };
}
function coreXml(title) {
  const t = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEsc(title)}</dc:title><dc:creator>Crewdesk</dc:creator><cp:lastModifiedBy>Crewdesk</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${t}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${t}</dcterms:modified></cp:coreProperties>`;
}

// ---------------------------------------------------------------- plain workbooks (yearly and project timesheets)
// sheets: [{ name, cols: [widths], rows: [[cell]] }], cell = value | { v, s: 'head'|'date'|'time'|'hrs'|'bold'|'title' }
const STY = { head: 1, date: 2, time: 3, hrs: 4, bold: 5, title: 6 };
function buildXlsx(sheets, title = 'Crewdesk') {
  const sheetXml = (sh) => {
    const rows = sh.rows.map((row, ri) => `<row r="${ri + 1}">${row.map((cell, ci) => {
      if (cell == null || cell === '') return '';
      const c = typeof cell === 'object' ? cell : { v: cell };
      const ref = colName(ci + 1) + (ri + 1);
      const s = c.s ? ` s="${STY[c.s]}"` : '';
      if (c.v == null || c.v === '') return c.s ? `<c r="${ref}"${s}/>` : '';
      if (typeof c.v === 'number' && Number.isFinite(c.v)) return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
      const v = String(c.v);
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(/^[=+\-@]/.test(v) ? "'" + v : v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    const cols = sh.cols ? `<cols>${sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">${sh.freeze ? `<pane ySplit="${sh.freeze}" topLeftCell="A${sh.freeze + 1}" activePane="bottomLeft" state="frozen"/>` : ''}</sheetView></sheetViews>${cols}<sheetData>${rows}</sheetData></worksheet>`;
  };
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="ddd d mmm yyyy"/><numFmt numFmtId="165" formatCode="hh:mm"/><numFmt numFmtId="166" formatCode="0.00"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9F2D0"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF999999"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const names = sheets.map((s, i) => safeName(s.name).replace(/[[\]]/g, '').slice(0, 31) || 'Sheet' + (i + 1));
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { name: 'docProps/core.xml', data: coreXml(title) },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: styles },
  ].concat(sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })));
  return writeZip(files);
}
const cellDate = (ds) => ({ v: serial(ds), s: 'date' });
const cellTime = (mins) => ({ v: round2(((mins % 1440) / 1440) * 1e6) / 1e6, s: 'time' });
const cellHrs = (mins) => ({ v: hours(mins), s: 'hrs' });
const H = (...labels) => labels.map((l) => ({ v: l, s: 'head' }));

// The whole year for one person: a summary by month, every entry, and their end-of-day notes.
function yearWorkbook(opts) {
  const { person, year, entries, projects = {}, tasks = {}, notes = {} } = opts;
  const days = dayTotals(entries, { tz: opts.tz, dayHours: opts.dayHours });
  const summary = [[{ v: `${person.name} — ${year} timesheet summary`, s: 'title' }], [],
    H('Month', 'Days worked', 'Field', 'Office', 'Rework', 'Training', 'Non-productive', 'Total hours', 'OT hours', 'OT × rate', 'Holiday (h)', 'Absent (h)', 'Lunch (h)')];
  const tot = Array(12).fill(0);
  for (let m = 1; m <= 12; m++) {
    const ds = Object.values(days).filter((d) => d.date.startsWith(`${year}-${pad(m)}`));
    const sum = (k) => ds.reduce((a, d) => a + (d.cats[k] || 0), 0);
    const row = [ds.filter((d) => d.paid > 0).length, hours(sum('field')), hours(sum('office')), hours(sum('rework')), hours(sum('training')), hours(sum('nonprod')),
      hours(ds.reduce((a, d) => a + d.paid, 0)), round2(ds.reduce((a, d) => a + d.ot, 0)), round2(ds.reduce((a, d) => a + d.otPay, 0)), hours(sum('holiday')), hours(sum('absent')), hours(sum('lunch'))];
    row.forEach((v, i) => { tot[i] += v; });
    summary.push([MONTHS[m - 1] + ' ' + year].concat(row));
  }
  summary.push([{ v: 'Total', s: 'bold' }].concat(tot.map((v) => ({ v: round2(v), s: 'bold' }))));
  const all = [H('Date', 'Start', 'End', 'Hours', 'Type', 'Job No', 'Project', 'Task', 'What was done', 'Edited')];
  for (const d of Object.values(days).sort((a, b) => a.date.localeCompare(b.date))) {
    for (const e of d.entries) {
      const p = projects[e.projectId]; const t = tasks[e.taskId];
      all.push([cellDate(d.date), cellTime(e.startMin), cellTime(e.endMin), cellHrs(e.mins), (CATS[e.category] || CATS.field).label,
        p ? p.ref || '' : e.pref || '', p ? p.name : e.pname || '', t ? t.title : e.tname || '', e.note || '', e.edited ? 'Yes' : '']);
    }
  }
  const nrows = [H('Date', 'What went well', 'What went wrong', 'How to improve')];
  for (const [ds, n] of Object.entries(notes).sort()) if (n.well || n.wrong || n.improve) nrows.push([cellDate(ds), n.well || '', n.wrong || '', n.improve || '']);
  return { name: yearFileName(person.name, year), data: buildXlsx([
    { name: 'Summary', cols: [16, 12, 9, 9, 9, 9, 14, 12, 10, 10, 11, 10, 9], rows: summary },
    { name: 'All entries', cols: [18, 8, 8, 8, 14, 10, 28, 28, 50, 8], rows: all, freeze: 1 },
    { name: 'Day notes', cols: [18, 50, 50, 50], rows: nrows, freeze: 1 },
  ], `${person.name} — ${year} timesheet`) };
}

// A project's timesheet and timeline: plan against actual for each task, every entry, and hours by person.
function projectWorkbook(opts) {
  const { project, tasks, entries, people, client } = opts;
  const now = Date.now();
  const mins = (e) => Math.max(0, Math.round(((e.end || now) - e.start) / 60000));
  const byTask = {}; const byPerson = {};
  for (const e of entries) { if (!CATS[e.category] || !CATS[e.category].paid) continue; byTask[e.taskId || ''] = (byTask[e.taskId || ''] || 0) + mins(e); byPerson[e.userId] = (byPerson[e.userId] || 0) + mins(e); }
  const planned = tasks.reduce((a, t) => a + (t.planMins || 0), 0);
  const actual = Object.values(byTask).reduce((a, b) => a + b, 0);
  const sum = [[{ v: project.name, s: 'title' }], ['Job No', project.ref || ''], ['Client', client || ''], ['Site', project.address || ''],
    ['Start', project.start ? cellDate(project.start) : ''], ['Finish by', project.due ? cellDate(project.due) : ''], ['Planned hours', cellHrs(planned)], ['Logged hours', cellHrs(actual)],
    ['Difference', { v: hours(actual - planned), s: 'hrs' }], [],
    H('Task', 'Planned (h)', 'Logged (h)', 'Difference (h)', 'Done', 'Planned day', 'Assigned to')];
  for (const t of tasks) sum.push([t.title, t.planMins ? cellHrs(t.planMins) : '', cellHrs(byTask[t.id] || 0), t.planMins ? { v: hours((byTask[t.id] || 0) - t.planMins), s: 'hrs' } : '', t.done ? 'Yes' : '', t.date ? cellDate(t.date) : '', (t.assignees || []).map((id) => (people[id] || {}).name || '').filter(Boolean).join(', ')]);
  if (byTask['']) sum.push(['(No task)', '', cellHrs(byTask['']), '', '', '', '']);
  const rows = [H('Date', 'Person', 'Start', 'End', 'Hours', 'Type', 'Task', 'What was done')];
  for (const e of entries.slice().sort((a, b) => a.start - b.start)) {
    const a = zoneParts(e.start, opts.tz);
    rows.push([cellDate(a.date), (people[e.userId] || {}).name || 'Former member', cellTime(a.mins), cellTime(a.mins + mins(e)), cellHrs(mins(e)), (CATS[e.category] || CATS.field).label,
      (tasks.find((t) => t.id === e.taskId) || {}).title || e.tname || '', e.note || '']);
  }
  const pr = [H('Person', 'Hours')].concat(Object.entries(byPerson).sort((a, b) => b[1] - a[1]).map(([id, m]) => [(people[id] || {}).name || 'Former member', cellHrs(m)]));
  return { name: safeName(`${project.ref ? project.ref + ' ' : ''}${project.name} timesheet`) + '.xlsx', data: buildXlsx([
    { name: 'Plan vs actual', cols: [36, 12, 12, 14, 8, 18, 30], rows: sum },
    { name: 'Timeline', cols: [18, 20, 8, 8, 8, 14, 30, 50], rows, freeze: 1 },
    { name: 'By person', cols: [26, 10], rows: pr, freeze: 1 },
  ], `${project.name} — project timesheet`) };
}

module.exports = { CATS, MONTHS, zoneParts, dayTotals, initials, monthFileName, yearFileName, monthWorkbook, yearWorkbook, projectWorkbook, safeName, writeZip };
