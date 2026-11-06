/* Spreadsheets (admins), company settings and invites, my profile and settings, More menu, legal pages. */
'use strict';

// ============================================================ SPREADSHEETS (admins only)
const FIN = { range: 'year', from: '', to: '', type: 'all', q: '', sort: { key: 'date', dir: -1 } };
function finRange() {
  const t = new Date(); const y = t.getFullYear(), m = t.getMonth();
  switch (FIN.range) {
    case 'month': return [dstr(new Date(y, m, 1)), dstr(new Date(y, m + 1, 0))];
    case '3m': return [dstr(new Date(y, m - 2, 1)), dstr(new Date(y, m + 1, 0))];
    case 'year': return [`${y}-01-01`, `${y}-12-31`];
    case 'lastyear': return [`${y - 1}-01-01`, `${y - 1}-12-31`];
    case 'custom': return [FIN.from || '1900-01-01', FIN.to || '2999-12-31'];
    default: return ['1900-01-01', '2999-12-31'];
  }
}
const monthKey = (s) => s.slice(0, 7);
function monthsBack(n, end = new Date()) { const out = []; for (let i = n - 1; i >= 0; i--) { const d = new Date(end.getFullYear(), end.getMonth() - i, 1); out.push(dstr(d).slice(0, 7)); } return out; }
const mLabel = (k) => new Date(k + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'short' });
function sumBy(records, type, key) { const o = {}; for (const r of records) if (r.type === type) { const k = key(r); o[k] = (o[k] || 0) + (Number(r.amount) || 0); } return o; }
// The clearly-labelled projection: the average of recent months, following the trend only when there are
// at least 4 months with income, and never more than double the average (so one big month can't run away).
function trend(values) {
  const n = values.length; const my = values.reduce((a, b) => a + b, 0) / (n || 1);
  if (values.filter((v) => v > 0).length < 4) return () => my;
  const mx = (n - 1) / 2; let num = 0, den = 0;
  values.forEach((v, x) => { num += (x - mx) * (v - my); den += (x - mx) ** 2; });
  const slope = den ? num / den : 0;
  return (x) => Math.min(my * 2, Math.max(0, my + slope * (x - mx)));
}
function niceMax(v) { if (v <= 0) return 100; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
const shortMoney = (v) => { const c = (S.company.settings.currency || '£'); return v >= 1e6 ? c + (v / 1e6).toFixed(1) + 'm' : v >= 1e3 ? c + Math.round(v / 1e3) + 'k' : c + Math.round(v); };
// A small, dependency-free SVG chart: grouped bars and/or lines over month labels.
function svgChart({ labels, bars = [], lines = [], height = 230, title, width = 720 }) {
  const W = width, H = height, L = 52, R = 10, T = 12, B = 26;
  const all = bars.flatMap((s) => s.values).concat(lines.flatMap((s) => s.values.filter((v) => v != null)));
  const max = niceMax(Math.max(0, ...all));
  const n = labels.length; const cw = (W - L - R) / n;
  const y = (v) => T + (H - T - B) * (1 - v / max);
  let g = `<g class="grid">`;
  for (let i = 0; i <= 4; i++) { const v = (max / 4) * i; g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${esc(shortMoney(v))}</text>`; }
  g += '</g>';
  labels.forEach((lb, i) => { g += `<text x="${L + cw * i + cw / 2}" y="${H - 8}" text-anchor="middle">${esc(lb)}</text>`; });
  const bw = Math.min(22, (cw - 8) / Math.max(1, bars.length));
  bars.forEach((s, si) => s.values.forEach((v, i) => {
    if (!v) return;
    const x = L + cw * i + cw / 2 - (bw * bars.length) / 2 + si * bw;
    g += `<rect x="${x}" y="${y(v)}" width="${bw - 2}" height="${Math.max(0, y(0) - y(v))}" rx="2" fill="${s.color}" opacity="${s.opacity || 1}"><title>${esc(s.name)} ${esc(labels[i])}: ${esc(money(v))}</title></rect>`;
  }));
  lines.forEach((s) => {
    let d = ''; s.values.forEach((v, i) => { if (v == null) return; d += `${d ? 'L' : 'M'}${L + cw * i + cw / 2},${y(v)}`; });
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.25" ${s.dash ? 'stroke-dasharray="6 5"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
    s.values.forEach((v, i) => { if (v != null) g += `<circle cx="${L + cw * i + cw / 2}" cy="${y(v)}" r="3" fill="${s.dash ? 'var(--surface)' : s.color}" stroke="${s.color}" stroke-width="1.5"><title>${esc(s.name)} ${esc(labels[i])}: ${esc(money(v))}</title></circle>`; });
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title || 'Chart')}">${g}</svg>`;
}
VIEWS.sheets = {
  manual: true,
  render() {
    if (!isAdmin()) return `<div class="card empty">${ic('lock')}<h3>Admins only</h3><div class="small">Spreadsheets show company finances, so only owners and admins can open them.</div></div>`;
    const all = Object.values(S.finance);
    const [from, to] = finRange();
    let rows = all.filter((r) => r.date >= from && r.date <= to && (FIN.type === 'all' || r.type === FIN.type));
    const q = FIN.q.trim().toLowerCase();
    if (q) rows = rows.filter((r) => [r.category, r.description, (S.projects[r.projectId] || {}).name, (S.clients[r.clientId] || {}).name].join(' ').toLowerCase().includes(q));
    const k = FIN.sort.key, dir = FIN.sort.dir;
    rows.sort((a, b) => { const va = k === 'amount' ? Number(a.amount) : String(a[k] || ''), vb = k === 'amount' ? Number(b.amount) : String(b[k] || ''); return va < vb ? -dir : va > vb ? dir : (b.createdAt - a.createdAt); }); // newest first on ties
    const inc = rows.filter((r) => r.type === 'income').reduce((a, r) => a + Number(r.amount), 0);
    const exp = rows.filter((r) => r.type === 'expense').reduce((a, r) => a + Number(r.amount), 0);
    // charts: last 12 months actuals + 6 months projected (from the trend)
    const months = monthsBack(12);
    const incM = sumBy(all, 'income', (r) => monthKey(r.date)); const expM = sumBy(all, 'expense', (r) => monthKey(r.date));
    const incV = months.map((m) => incM[m] || 0), expV = months.map((m) => expM[m] || 0);
    const f = trend(incV.slice(-6));
    const future = []; for (let i = 1; i <= 6; i++) { const d = new Date(); future.push(dstr(new Date(d.getFullYear(), d.getMonth() + i, 1)).slice(0, 7)); }
    const labels = months.concat(future).map(mLabel);
    const actualLine = incV.concat(future.map(() => null));
    const projLine = months.map((_, i) => (i === months.length - 1 ? incV[i] : null)).concat(future.map((_, i) => Math.round(f(5 + i + 1))));
    const projTotal = projLine.slice(months.length).reduce((a, b) => a + (b || 0), 0);
    const y0 = new Date().getFullYear();
    const thisY = monthsBack(12, new Date(y0, 11, 1)).map((m) => incM[m] || 0), lastY = monthsBack(12, new Date(y0 - 1, 11, 1)).map((m) => incM[m] || 0);
    const ytd = thisY.slice(0, new Date().getMonth() + 1).reduce((a, b) => a + b, 0), lytd = lastY.slice(0, new Date().getMonth() + 1).reduce((a, b) => a + b, 0);
    const cats = [...new Set(all.map((r) => r.category).filter(Boolean))].sort();
    const projOpts = Object.values(S.projects).sort((a, b) => a.name.localeCompare(b.name));
    return `<div class="page-head"><div><h1>Spreadsheets</h1><div class="sub">${icSize('lock', 13, 'vertical-align:-2px')} Only owners and admins can see this page.</div></div>
        <div class="row tight wrap"><button class="btn" data-act="fin-csv">${ic('download')}<span>CSV</span></button><button class="btn" data-act="fin-xlsx">${ic('download')}<span>Excel</span></button><button class="btn primary" data-act="fin-add">${ic('plus')}<span>Add row</span></button></div></div>
      <div class="kpis">
        <div class="kpi"><span class="v pos">${esc(money(inc))}</span><span class="l">Income · ${esc(rangeLabel())}</span></div>
        <div class="kpi"><span class="v neg">${esc(money(exp))}</span><span class="l">Expenses · ${esc(rangeLabel())}</span></div>
        <div class="kpi"><span class="v ${inc - exp >= 0 ? 'pos' : 'neg'}">${esc(money(inc - exp))}</span><span class="l">Net · ${esc(rangeLabel())}</span></div>
        <div class="kpi"><span class="v">${esc(money(projTotal))}</span><span class="l">Projected income, next 6 months <b>(estimate)</b></span></div>
      </div>
      <div class="grid halves section">
        <div class="card"><div class="section-head"><h3>Income and expenses, last 12 months</h3></div>
          ${svgChart({ labels: months.map(mLabel), bars: [{ name: 'Income', color: 'var(--ok)', values: incV }, { name: 'Expenses', color: 'var(--red)', values: expV, opacity: 0.75 }], title: 'Monthly income and expenses', width: 480, height: 260 })}
          <div class="legend"><span><i style="background:var(--ok)"></i>Income (actual)</span><span><i style="background:var(--red)"></i>Expenses (actual)</span></div></div>
        <div class="card"><div class="section-head"><h3>Income trend and projection</h3></div>
          ${svgChart({ labels, lines: [{ name: 'Actual income', color: 'var(--ok)', values: actualLine }, { name: 'Projected (estimate)', color: 'var(--accent)', values: projLine, dash: true }], title: 'Income trend with projection', width: 480, height: 260 })}
          <div class="legend"><span><i style="background:var(--ok)"></i>Actual income</span><span><i class="dash"></i>Projection — an estimate based on the last 6 months</span></div></div>
      </div>
      <div class="card section"><div class="section-head"><h3>${y0} compared with ${y0 - 1}</h3><span class="small ${ytd >= lytd ? 'pos' : 'neg'}">Year to date ${esc(money(ytd))} vs ${esc(money(lytd))}${lytd ? ` (${ytd >= lytd ? '+' : ''}${Math.round(((ytd - lytd) / lytd) * 100)}%)` : ''}</span></div>
        ${svgChart({ labels: monthsBack(12, new Date(y0, 11, 1)).map(mLabel), lines: [{ name: String(y0 - 1), color: 'var(--slate)', values: lastY, dash: false }, { name: String(y0), color: 'var(--ok)', values: thisY.map((v, i) => (i <= new Date().getMonth() ? v : null)) }], height: 220, width: 980, title: 'Income this year compared with last year' })}
        <div class="legend"><span><i style="background:var(--ok)"></i>${y0}</span><span><i style="background:var(--slate)"></i>${y0 - 1}</span></div></div>
      <div class="section">
        <div class="row wrap" style="margin-bottom:10px">
          <div class="seg">${[['month', 'This month'], ['3m', '3 months'], ['year', 'This year'], ['lastyear', 'Last year'], ['all', 'All'], ['custom', 'Custom']].map(([k2, l]) => `<button class="${FIN.range === k2 ? 'on' : ''}" data-act="fin-range" data-r="${k2}">${l}</button>`).join('')}</div>
          ${FIN.range === 'custom' ? `<input type="date" class="input" style="width:auto" value="${esc(FIN.from)}" data-change="fin-from" aria-label="From"><input type="date" class="input" style="width:auto" value="${esc(FIN.to)}" data-change="fin-to" aria-label="To">` : ''}
          <select class="input" style="width:auto" data-change="fin-type" aria-label="Type"><option value="all">Income and expenses</option><option value="income" ${FIN.type === 'income' ? 'selected' : ''}>Income only</option><option value="expense" ${FIN.type === 'expense' ? 'selected' : ''}>Expenses only</option></select>
          <label class="search grow" style="min-width:180px"><input class="input" type="search" placeholder="Search rows" value="${esc(FIN.q)}" data-change="fin-q" aria-label="Search rows">${ic('search')}</label>
        </div>
        <datalist id="fin-cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        <div class="sheet-table-wrap"><table class="sheet-table"><thead><tr>
          ${[['date', 'Date'], ['type', 'Type'], ['category', 'Category'], ['description', 'Description'], ['projectId', 'Project'], ['amount', 'Amount']].map(([k2, l]) => `<th data-act="fin-sort" data-k="${k2}" aria-sort="${FIN.sort.key === k2 ? (dir > 0 ? 'ascending' : 'descending') : 'none'}">${l}${FIN.sort.key === k2 ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}<th><span class="sr-only">Delete</span></th></tr></thead>
          <tbody>${rows.length ? rows.map((r) => `<tr class="${r.type}" data-row="${r.id}">
            <td><input type="date" value="${esc(r.date)}" data-change="fin-field" data-k="date" aria-label="Date"></td>
            <td><select data-change="fin-field" data-k="type" aria-label="Type"><option value="income">Income</option><option value="expense" ${r.type === 'expense' ? 'selected' : ''}>Expense</option></select></td>
            <td><input value="${esc(r.category)}" list="fin-cats" data-change="fin-field" data-k="category" placeholder="e.g. Materials" aria-label="Category"></td>
            <td><input value="${esc(r.description)}" data-change="fin-field" data-k="description" placeholder="What it was for" aria-label="Description"></td>
            <td><select data-change="fin-field" data-k="projectId" aria-label="Project"><option value="">—</option>${projOpts.map((p) => `<option value="${p.id}" ${p.id === r.projectId ? 'selected' : ''}>${esc((p.ref ? p.ref + ' ' : '') + p.name.slice(0, 30))}</option>`).join('')}</select></td>
            <td class="num"><input type="number" step="0.01" min="0" inputmode="decimal" value="${Number(r.amount) || ''}" placeholder="0.00" data-change="fin-field" data-k="amount" aria-label="Amount"></td>
            <td class="act"><button class="btn ghost sm icon" data-act="fin-del" data-id="${r.id}" aria-label="Delete row">${ic('trash')}</button></td></tr>`).join('')
            : `<tr><td colspan="7"><div class="empty small">${all.length ? 'No rows match these filters.' : 'No records yet. Add rows by hand, or import them from a spreadsheet.'}</div></td></tr>`}</tbody>
          ${rows.length ? `<tfoot><tr><td colspan="5">${plural(rows.length, 'row')} · income ${esc(money(inc))} · expenses ${esc(money(exp))}</td><td class="num" style="text-align:right">${esc(money(inc - exp))}</td><td></td></tr></tfoot>` : ''}
        </table></div>
        <p class="small muted" style="margin-top:8px">Changes save as soon as you leave a cell. Amounts are always positive — the Type column decides whether it’s money in or out.</p>
      </div>`;
  },
};
function rangeLabel() { return { month: 'this month', '3m': 'last 3 months', year: 'this year', lastyear: 'last year', all: 'all time', custom: 'chosen dates' }[FIN.range]; }
A['fin-range'] = (el) => { FIN.range = el.dataset.r; renderView(false); };
A['fin-sort'] = (el) => { const k = el.dataset.k; FIN.sort = { key: k, dir: FIN.sort.key === k ? -FIN.sort.dir : k === 'date' || k === 'amount' ? -1 : 1 }; renderView(false); };
C['fin-from'] = (el) => { FIN.from = el.value; renderView(false); };
C['fin-to'] = (el) => { FIN.to = el.value; renderView(false); };
C['fin-type'] = (el) => { FIN.type = el.value; renderView(false); };
C['fin-q'] = (el) => { FIN.q = el.value; renderView(false); };
C['fin-field'] = async (el) => {
  const id = el.closest('tr').dataset.row; const k = el.dataset.k;
  try { await saveItem('finance', id, { [k]: el.value }); if (k === 'type' || k === 'amount' || k === 'date') renderView(false); } catch (_) { renderView(false); }
};
A['fin-add'] = async () => {
  const item = await saveItem('finance', null, { date: todayStr(), type: 'income', amount: 0, category: '', description: '' });
  FIN.range = 'all'; FIN.sort = { key: 'date', dir: -1 }; renderView(false);
  const row = $(`tr[data-row="${item.id}"] input[data-k="description"]`); if (row) row.focus();
};
A['fin-del'] = async (el) => { const r = S.finance[el.dataset.id]; if (await confirmBox('Delete this row?', `${r.type === 'income' ? 'Income' : 'Expense'} of ${money(r.amount)} on ${fmtDate(r.date)} will be removed.`)) { await deleteItem('finance', r.id); renderView(false); } };
function finRowsForExport() {
  return Object.values(S.finance).sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ Date: r.date, Type: r.type === 'income' ? 'Income' : 'Expense', Category: r.category, Description: r.description,
    Project: S.projects[r.projectId] ? `${S.projects[r.projectId].ref ? S.projects[r.projectId].ref + ' ' : ''}${S.projects[r.projectId].name}` : '', Client: (S.clients[r.clientId] || {}).name || '', Amount: Number(r.amount) || 0 }));
}
function download(name, blob) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); }
const safeCell = (v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : v); // stops spreadsheet formula injection
A['fin-csv'] = () => {
  const rows = finRowsForExport(); if (!rows.length) return toast('Nothing to export yet', true);
  const cols = Object.keys(rows[0]);
  const csv = [cols.join(',')].concat(rows.map((r) => cols.map((c) => { const v = safeCell(r[c]); return typeof v === 'number' ? v.toFixed(2) : `"${String(v).replace(/"/g, '""')}"`; }).join(','))).join('\r\n');
  download(`${S.company.name.replace(/[^\w -]/g, '')} finances ${todayStr()}.csv`, new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
};
A['fin-xlsx'] = () => {
  const rows = finRowsForExport(); if (!rows.length) return toast('Nothing to export yet', true);
  const byMonth = {};
  for (const r of rows) { const k = r.Date.slice(0, 7); byMonth[k] = byMonth[k] || { Month: k, Income: 0, Expenses: 0, Net: 0 }; if (r.Type === 'Income') byMonth[k].Income += r.Amount; else byMonth[k].Expenses += r.Amount; byMonth[k].Net = byMonth[k].Income - byMonth[k].Expenses; }
  const blob = makeXlsx([{ name: 'Records', rows }, { name: 'By month', rows: Object.values(byMonth) }]);
  download(`${S.company.name.replace(/[^\w -]/g, '')} finances ${todayStr()}.xlsx`, blob);
};
// Minimal .xlsx writer (an Office Open XML zip, stored without compression).
function makeXlsx(sheets) {
  const enc = new TextEncoder(); const x = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const col = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const sheetXml = (rows) => {
    const cols = Object.keys(rows[0] || {});
    const line = (vals, r, bold) => `<row r="${r}">${vals.map((v, i) => (typeof v === 'number' ? `<c r="${col(i)}${r}" s="${bold ? 1 : 2}"><v>${v}</v></c>` : `<c r="${col(i)}${r}" t="inlineStr"${bold ? ' s="1"' : ''}><is><t xml:space="preserve">${x(safeCell(v ?? ''))}</t></is></c>`)).join('')}</row>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c === 'Description' || c === 'Job' ? 36 : 14}" customWidth="1"/>`).join('')}</cols><sheetData>${line(cols, 1, true)}${rows.map((r, i) => line(cols.map((c) => r[c]), i + 2)).join('')}</sheetData></worksheet>`;
  };
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${x(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
  ].concat(sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows)]));
  return zipStore(files.map(([n, s]) => [n, enc.encode(s)]));
}
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zipStore(entries) {
  const enc = new TextEncoder(); const chunks = []; const central = []; let offset = 0;
  const d = new Date(); const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1); const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const [name, data] of entries) {
    const nb = enc.encode(name); const crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, time, true); h.setUint16(12, date, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nb.length, true); h.setUint16(28, 0, true);
    chunks.push(new Uint8Array(h.buffer), nb, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, time, true); c.setUint16(14, date, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nb.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nb);
    offset += 30 + nb.length + data.length;
  }
  const cSize = central.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, cSize, true); e.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ============================================================ COMPANY SETTINGS & INVITES
VIEWS.settings = {
  manual: true,
  mount(sub) { if (sub === 'requests') setTimeout(() => { const el = $('#requests'); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60); },
  render() {
    const c = S.company; const admin = isAdmin();
    const invites = S.invites.filter((i) => i.state === 'ok');
    const toggle = (k, title, desc) => `<label class="setting"><span><b>${title}</b><br><span class="d">${desc}</span></span><span class="switch"><input type="checkbox" data-change="co-setting" data-k="${k}" ${c.settings[k] ? 'checked' : ''} aria-label="${esc(title)}"><i></i></span></label>`;
    return `<div class="page-head"><div><h1>Company settings</h1><div class="sub">${esc(c.name)} · you’re ${S.role === 'owner' ? 'the owner' : S.role === 'admin' ? 'an admin' : 'a member'}</div></div></div>
    <div class="grid halves">
      <div class="stack">
        ${admin ? `<div class="card stack" id="requests"><h2>Requests to join ${c.requests && c.requests.length ? `<span class="count">${c.requests.length}</span>` : ''}</h2>
          ${c.requests && c.requests.length ? c.requests.map((r) => `<div class="att-row" style="flex-wrap:wrap;align-items:flex-start">${avatar(r, '', { link: false })}<div class="grow" style="min-width:160px"><b>${esc(r.name)}</b><div class="tiny muted">${esc(r.email || '')} · ${timeAgo(r.at)}</div>${r.message ? `<div class="small pre" style="margin-top:4px">“${esc(r.message)}”</div>` : ''}</div>
            <div class="row tight"><button class="btn sm" data-act="req-answer" data-id="${r.id}" data-a="0">Decline</button><button class="btn sm primary" data-act="req-answer" data-id="${r.id}" data-a="1">${ic('check')}Accept</button></div></div>`).join('')
            : `<p class="small muted" style="margin:0">${c.profile.visibility === 'public' ? 'No requests right now. When someone finds your company and asks to join, they’ll appear here.' : 'Your company is private, so nobody can find it or ask to join. Make it public in the profile settings to allow requests.'}</p>`}</div>` : ''}
        ${canInvite() ? `<div class="card stack"><div class="row between"><div><h2>Invite people</h2><p class="small muted" style="margin:4px 0 0">Send someone a link. When they open it, the company is filled in for them, and they join once they’ve confirmed their email.</p></div></div>
          <button class="btn primary" data-act="invite-new">${ic('link')}Create invite link</button>
          ${invites.length ? `<div class="stack tight"><div class="label">Active links</div>${invites.map((i) => `<div class="att-row" style="flex-wrap:wrap">
            <div class="grow" style="min-width:180px"><div class="small bold">${i.email ? 'For ' + esc(i.email) : 'Anyone with the link'}</div><div class="tiny muted">${i.expiresAt ? 'Expires ' + esc(fmtDateTime(i.expiresAt)) : 'Never expires'} · used ${i.uses}${i.maxUses ? '/' + i.maxUses : ''} · by ${esc(firstName(i.createdBy))}</div></div>
            <button class="btn sm" data-act="copy-text" data-text="${esc(i.url)}">${ic('copy')}Copy</button><button class="btn sm danger" data-act="invite-revoke" data-id="${i.id}">Revoke</button></div>`).join('')}</div>` : ''}</div>` : ''}
        <div class="card stack"><h2>Join with a code</h2>
          ${c.code ? `<p class="small muted" style="margin:0">People can also join by entering this code and your join password.</p><div class="code-box">${esc(c.code)}</div>` : '<p class="small muted" style="margin:0">Joining with a code is switched off. Ask an admin for an invite link.</p>'}
          ${admin ? `<label class="setting" style="border-top:0;padding-top:0"><span><b>Allow joining with code + password</b><br><span class="d">Turn off so people can only join with an invite link</span></span><span class="switch"><input type="checkbox" data-change="co-setting" data-k="allowCodeJoin" ${c.settings.allowCodeJoin ? 'checked' : ''} aria-label="Allow joining with code"><i></i></span></label>
          <div class="row wrap tight"><button class="btn sm" data-act="copy-invite">${ic('copy')}Copy join instructions</button><button class="btn sm" data-act="new-code">${ic('refresh')}New code</button></div>
          <form class="stack tight" data-form="co-pass"><label class="field"><span>Change join password</span><div class="inline-add"><input class="input" name="password" type="text" autocomplete="off" minlength="6" placeholder="New join password" required><button class="btn">Save</button></div></label><div class="err-msg" data-err></div></form>` : ''}</div>
      </div>
      <div class="stack">
        ${admin ? `<form class="card stack" data-form="co-name"><h2>Details</h2>
          <div class="form-grid"><label class="field"><span>Company name</span><input name="name" value="${esc(c.name)}" required maxlength="80"></label>
          <label class="field"><span>Currency symbol</span><input name="currency" value="${esc(c.settings.currency || '£')}" maxlength="3"></label></div>
          <div class="err-msg" data-err></div><button class="btn">Save details</button></form>
        <form class="card stack" data-form="co-profile"><h2>Company profile</h2>
          <p class="small muted" style="margin:0">What people see when they find your company. <a href="#/company/${c.id}">Preview it</a></p>
          <div class="row">${coLogo(c, 64)}<div class="row wrap tight"><button type="button" class="btn sm" data-act="logo-upload">${ic('camera')}${c.logo ? 'Change picture' : 'Add a profile picture'}</button>${c.logo ? '<button type="button" class="btn sm ghost" data-act="logo-remove">Remove</button>' : ''}</div></div>
          <label class="field"><span>Description</span><textarea name="description" maxlength="2000" placeholder="What you do, where you work, what you’re known for">${esc(c.profile.description)}</textarea></label>
          <div class="form-grid"><label class="field"><span>Trade or industry</span><input name="industry" value="${esc(c.profile.industry)}" maxlength="60" placeholder="e.g. Building, Electrical"></label>
          <label class="field"><span>Town or area</span><input name="location" value="${esc(c.profile.location)}" maxlength="100" placeholder="e.g. Newcastle"></label>
          <label class="field full"><span>Website</span><input name="website" type="url" value="${esc(c.profile.website)}" maxlength="200" placeholder="https://"></label></div>
          <div class="field"><span>Who can find your company</span>
            <div class="seg" role="radiogroup"><button type="button" class="${c.profile.visibility !== 'public' ? 'on' : ''}" data-act="co-vis" data-v="private" role="radio" aria-checked="${c.profile.visibility !== 'public'}">${icSize('lock', 14, 'vertical-align:-2px;margin-right:4px')}Private</button><button type="button" class="${c.profile.visibility === 'public' ? 'on' : ''}" data-act="co-vis" data-v="public" role="radio" aria-checked="${c.profile.visibility === 'public'}">${icSize('search', 14, 'vertical-align:-2px;margin-right:4px')}Public</button></div>
            <input type="hidden" name="visibility" value="${c.profile.visibility === 'public' ? 'public' : 'private'}">
            <span class="hint">Private: only people you invite can join. Public: anyone on Crewdesk can find your profile and ask to join — you still choose who gets in. Your projects, chats, files and timesheets are never public.</span></div>
          <div class="err-msg" data-err></div><button class="btn">Save profile</button></form>
        <div class="card stack"><h2>Banner</h2>
          <p class="small muted" style="margin:0">A picture shown across the top bar, to the right of your company name — your logo, a finished job, your vans. Wide photos work best (about 1600 × 300).</p>
          <div class="banner-preview" id="banner-preview" style="${c.banner ? `background-image:url('${esc(c.banner)}');background-position:center ${c.bannerPos != null ? c.bannerPos : 50}%` : ''}">${c.banner ? '' : 'No banner yet'}</div>
          ${c.banner ? `<label class="field"><span>Move the picture up or down</span><input type="range" min="0" max="100" value="${c.bannerPos != null ? c.bannerPos : 50}" data-input="banner-pos" data-change="banner-pos" aria-label="Banner position"></label>` : ''}
          <div class="row wrap tight"><button class="btn sm" data-act="banner-upload">${ic('image')}${c.banner ? 'Change banner' : 'Upload banner'}</button>${c.banner ? `<button class="btn sm ghost" data-act="banner-remove">Remove</button>` : ''}</div></div>
        <div class="card"><h2 style="margin-bottom:6px">What members can do</h2>
          ${toggle('membersCreateProjects', 'Create projects', 'Otherwise only admins can')}
          ${toggle('membersPing', 'Send pings', 'Company-wide updates with attachments')}
          ${toggle('membersInvite', 'Invite people', 'Create invite links themselves')}
          <div class="tiny muted" style="margin-top:8px">Make someone an admin from their profile on the Team page. Admins can always see every project, and everyone’s time.</div></div>
        <form class="card stack" data-form="co-hours"><h2>Working day</h2>
          <p class="small muted" style="margin:0">Used to show people how their day is going, and for overtime on timesheets: anything over a standard day counts as overtime (as in your timesheet template).</p>
          <div class="form-grid"><label class="field"><span>Usual start</span><input type="time" name="dayStart" value="${esc(c.settings.dayStart || '08:00')}" required></label>
          <label class="field"><span>Usual finish</span><input type="time" name="dayEnd" value="${esc(c.settings.dayEnd || '16:30')}" required></label>
          <label class="field"><span>Paid hours in a standard day</span><input type="number" name="dayHours" min="1" max="24" step="0.25" value="${esc(c.settings.dayHours || 8)}" required><span class="hint">Lunch isn’t counted. 8:00–16:30 with 30 minutes for lunch is 8 hours.</span></label></div>
          <div class="err-msg" data-err></div><button class="btn">Save working day</button></form>`
        : `<div class="card"><h2>${esc(c.name)}</h2><p class="small muted" style="margin:6px 0 0">Admins manage company settings. Ask an admin if something needs changing.</p></div>`}
        <div class="card stack"><h2>Leave or delete</h2>
          ${S.role === 'owner' ? `<p class="small muted" style="margin:0">To leave, first make someone else the owner from their profile. Deleting the company removes every project, timesheet, photo, chat and record for everyone.</p><button class="btn danger" data-act="del-company">${ic('trash')}Delete company</button>`
            : `<button class="btn danger" data-act="leave-company">${ic('logout')}Leave ${esc(c.name)}</button>`}</div>
      </div>
    </div>`;
  },
};
C['co-setting'] = async (el) => { try { const r = await capi('PATCH', '', { settings: { [el.dataset.k]: el.checked } }); S.company = r.company; toast('Saved'); } catch (e) { toast(e.message, true); el.checked = !el.checked; } };
F['co-hours'] = async (f, d) => { const r = await capi('PATCH', '', { settings: { dayStart: d.dayStart, dayEnd: d.dayEnd, dayHours: Number(d.dayHours) } }); S.company = r.company; toast('Working day saved'); };
F['co-name'] = async (f, d) => { const r = await capi('PATCH', '', { name: d.name, settings: { currency: d.currency } }); S.company = r.company; updateChrome(); toast('Saved'); };
A['co-vis'] = (el) => {
  const f = el.closest('.field');
  $$('[data-act="co-vis"]', f).forEach((b) => { b.classList.toggle('on', b === el); b.setAttribute('aria-checked', b === el); });
  f.querySelector('input[name=visibility]').value = el.dataset.v;
};
F['co-profile'] = async (f, d) => {
  const r = await capi('PATCH', '', { profile: { description: d.description, industry: d.industry, location: d.location, website: d.website, visibility: d.visibility } });
  S.company = r.company; renderView(false); toast(d.visibility === 'public' ? 'Profile saved — your company can now be found' : 'Profile saved');
};
A['logo-upload'] = async () => {
  const [file] = await choosePhotos({ multiple: false, title: 'Company picture' });
  if (!file) return;
  const data = await cropAvatar(file); if (!data) return;
  try { const r = await sendWithProgress('PATCH', `/api/c/${S.cid}`, { logo: data }); S.company = r.company; renderShell(); route(); toast('Company picture updated'); }
  catch (e) { toast(e.message, true); }
};
A['logo-remove'] = async () => { try { const r = await capi('PATCH', '', { logo: '' }); S.company = r.company; renderShell(); route(); } catch (e) { toast(e.message, true); } };
A['req-answer'] = async (el) => {
  const yes = el.dataset.a === '1';
  try { await capi('POST', `/requests/${el.dataset.id}`, { accept: yes }); toast(yes ? 'Accepted — they’re in the company now' : 'Request declined'); await loadCompany(true); }
  catch (e) { toast(e.message, true); }
};
A['banner-upload'] = async (el) => {
  const [file] = await choosePhotos({ multiple: false, title: 'Company banner' });
  if (!file) return;
  el.classList.add('busy');
  try {
    const p = await processPhoto(file, { max: 2000, thumb: 0 });
    const r = await sendWithProgress('PATCH', `/api/c/${S.cid}`, { banner: p.data, bannerPos: 50 });
    S.company = r.company; updateChrome(); renderView(false); toast('Banner updated');
  } catch (e) { toast(e.message, true); el.classList.remove('busy'); }
};
A['banner-remove'] = async () => { try { const r = await capi('PATCH', '', { banner: '' }); S.company = r.company; updateChrome(); renderView(false); toast('Banner removed'); } catch (e) { toast(e.message, true); } };
I['banner-pos'] = (el) => { const pv = $('#banner-preview'); if (pv) pv.style.backgroundPosition = `center ${el.value}%`; applyBanner(el.value); };
C['banner-pos'] = async (el) => { try { const r = await capi('PATCH', '', { bannerPos: Number(el.value) }); S.company = r.company; } catch (e) { toast(e.message, true); } };
F['co-pass'] = async (f, d) => { await capi('PATCH', '', { password: d.password }); f.reset(); toast('Join password changed'); };
A['copy-text'] = async (el) => { try { await navigator.clipboard.writeText(el.dataset.text); toast('Link copied'); } catch { sheet(`${sheetHead('Copy this link')}<input class="input" readonly value="${esc(el.dataset.text)}" onfocus="this.select()">`); } };
A['copy-invite'] = async () => {
  const text = `Join ${S.company.name} on Crewdesk:\n1. Open ${location.origin}\n2. Create an account and confirm your email\n3. Choose “Join with a company code” and enter ${S.company.code}\n(Ask me for the join password.)`;
  try { await navigator.clipboard.writeText(text); toast('Copied — paste it into a text or WhatsApp'); } catch { sheet(`${sheetHead('Join instructions')}<textarea class="input" rows="6" readonly>${esc(text)}</textarea>`); }
};
A['new-code'] = async () => { if (!(await confirmBox('Make a new code?', 'The old code will stop working for new joiners. People already in the company stay in.', 'Make new code', false))) return; try { const r = await capi('PATCH', '', { newCode: true }); S.company = r.company; renderView(false); } catch (e) { toast(e.message, true); } };
A['invite-new'] = () => sheet(`${sheetHead('Create an invite link')}<form class="stack" data-form="invite">
    <p class="small muted" style="margin:0">Anyone who opens the link can sign up and join ${esc(S.company.name)} — the company is filled in for them. You can revoke it at any time.</p>
    <div class="form-grid"><label class="field"><span>Link works for</span><select name="days"><option value="1">1 day</option><option value="7" selected>7 days</option><option value="30">30 days</option><option value="0">Until revoked</option></select></label>
    <label class="field"><span>How many people</span><select name="maxUses"><option value="1">1 person</option><option value="10">Up to 10</option><option value="0" selected>No limit</option></select></label>
    <label class="field full"><span>Email it to (optional)</span><input name="email" type="email" placeholder="new.starter@example.com"><span class="hint">If you add an email, only that person can use the link, and we’ll email it to them.</span></label></div>
    <div class="err-msg" data-err></div>
    <div data-invite-out></div>
    <div class="sheet-foot"><button type="button" class="btn" data-close>Done</button><button class="btn primary">Create link</button></div></form>`);
F.invite = async (f, d) => {
  const r = await capi('POST', '/invites', { days: Number(d.days), maxUses: Number(d.maxUses), email: d.email || undefined });
  S.invites.unshift(r.invite);
  f.querySelector('[data-invite-out]').innerHTML = `<div class="info-box stack tight"><b>Your invite link</b><div class="linkbox"><input readonly value="${esc(r.invite.url)}" aria-label="Invite link"><button type="button" class="btn sm primary" data-act="copy-text" data-text="${esc(r.invite.url)}">${ic('copy')}Copy</button></div>
    <span class="tiny muted">${d.email ? (r.emailed ? `We’ve emailed it to ${esc(d.email)}. Ask them to check their spam folder if it doesn’t arrive.` : `Email isn’t set up on this server, so send it to ${esc(d.email)} yourself.`) : 'Send it by text, WhatsApp or email.'}</span></div>`;
  if (parseHash().name === 'settings') renderView(false);
};
A['invite-revoke'] = async (el) => {
  if (!(await confirmBox('Revoke this invite link?', 'Anyone who hasn’t used it yet won’t be able to join with it.', 'Revoke'))) return;
  try { const r = await capi('DELETE', `/invites/${el.dataset.id}`); S.invites = S.invites.map((i) => (i.id === r.invite.id ? r.invite : i)); renderView(false); toast('Invite revoked'); } catch (e) { toast(e.message, true); }
};
A['del-company'] = async () => {
  const pw = await confirmBox('Delete the whole company?', `Every project, task, photo, ping, chat, timesheet and record in ${S.company.name} will be permanently deleted for everyone. This can’t be undone.`, 'Delete everything', true,
    `<label class="field" style="margin-top:12px"><span>Type your password to confirm</span><input type="password" autocomplete="current-password" data-confirm-value></label>`);
  if (!pw) return;
  try { const r = await capi('DELETE', '', { password: pw }); S.companies = r.companies; S.cid = null; resetCompanyState(); enterApp(); toast('Company deleted'); } catch (e) { toast(e.message, true); }
};
A['leave-company'] = async () => { if (!(await confirmBox(`Leave ${S.company.name}?`, 'You’ll lose access to its projects and chats. Your time stays on the company’s timesheets. You’ll need a new invite to come back.', 'Leave'))) return; try { const r = await capi('POST', '/leave'); S.companies = r.companies; S.cid = null; resetCompanyState(); enterApp(); } catch (e) { toast(e.message, true); } };

// ============================================================ MY PROFILE & SETTINGS
VIEWS.profile = {
  manual: true,
  render() {
    const u = Object.assign({}, S.user, S.members[S.user.id] || {}, { prefs: S.user.prefs || {}, privacy: S.user.privacy || {} });
    const theme = store.get('cd_theme') || 'auto';
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    const sw = (name, on, label, desc, attrs = '') => `<label class="setting"><span><b>${label}</b><br><span class="d">${desc}</span></span><span class="switch"><input type="checkbox" ${on ? 'checked' : ''} ${attrs} aria-label="${esc(label)}"><i></i></span></label>`;
    return `<div class="page-head"><div><h1>My profile &amp; settings</h1><div class="sub">${esc(u.email)}</div></div><a class="btn" href="#/person/${u.id}">${ic('eye')}See my profile</a></div>
    <div class="grid halves">
      <div class="stack">
        <div class="card row wrap">${avatar(Object.assign({}, u, { online: true }), 'xl', { link: false })}<div class="stack tight"><b>${esc(u.name)}</b>
          <div class="row wrap tight"><button class="btn sm" data-act="avatar">${ic('camera')}${u.avatar ? 'Change picture' : 'Add a picture'}</button>${u.avatar ? `<button class="btn ghost sm" data-act="avatar-remove">Remove</button>` : ''}</div>
          <span class="tiny muted">You can move and zoom the picture before saving.</span></div></div>
        <form class="card stack" data-form="profile"><h2>About me</h2>
          <div class="form-grid"><label class="field"><span>Name</span><input name="name" value="${esc(u.name)}" required maxlength="80" autocomplete="name"></label>
          <label class="field"><span>Job title</span><input name="title" value="${esc(u.title)}" placeholder="e.g. Site manager" maxlength="80"></label>
          <label class="field"><span>Department</span><input name="dept" value="${esc(u.dept)}" placeholder="e.g. Electrical" maxlength="80"></label>
          <label class="field"><span>Phone</span><input name="phone" type="tel" value="${esc(u.phone)}" placeholder="So your colleagues can call you" maxlength="80" autocomplete="tel"></label>
          <label class="field full"><span>About</span><textarea name="bio" placeholder="Trades, skills, certifications…" maxlength="500">${esc(u.bio)}</textarea></label></div>
          <div class="err-msg" data-err></div><button class="btn primary">Save profile</button></form>
        <div class="card"><h2 style="margin-bottom:4px">Privacy</h2>
          ${sw('showPhone', u.privacy.showPhone !== false, 'Show my phone number', 'To people in my companies', 'data-change="privacy" data-k="showPhone"')}
          ${sw('showEmail', u.privacy.showEmail !== false, 'Show my email address', 'To people in my companies', 'data-change="privacy" data-k="showEmail"')}
          ${sw('profilePublic', !!u.privacy.profilePublic, 'Let people outside my companies see my profile', 'Anyone signed in to Crewdesk can see your name, picture, job title, bio and public companies — never your phone, email or location', 'data-change="privacy" data-k="profilePublic"')}
          ${sw('showCompanies', u.privacy.showCompanies !== false, 'Show the companies I’m in on my profile', 'Public companies are shown to anyone who can see your profile; private ones only to people who are in them too', 'data-change="privacy" data-k="showCompanies"')}
          ${sw('share', !!u.shareLocation, 'Share my live location', 'While Crewdesk is open on my phone. Positions are deleted after 12 hours.', 'data-change="share-loc"')}</div>
      </div>
      <div class="stack">
        <div class="card"><h2 style="margin-bottom:4px">Notifications</h2>
          ${sw('popups', u.prefs.popups !== false, 'Show notifications', 'Pop-ups for new pings, messages and things assigned to you. Red dots always show what’s unread.', 'data-change="pref" data-k="popups"')}
          ${sw('desktop', !!u.prefs.desktop && perm === 'granted', 'Alerts when the app is in the background', perm === 'denied' ? 'Blocked in your browser settings' : perm === 'unsupported' ? 'Not supported on this browser' : 'Uses your device’s notifications', `data-change="pref" data-k="desktop" ${perm === 'denied' || perm === 'unsupported' ? 'disabled' : ''}`)}
          ${sw('sound', !!u.prefs.sound, 'Play a sound', 'A short tone with each notification', 'data-change="pref" data-k="sound"')}</div>
        <div class="card stack"><h2>Appearance</h2>
          <div class="row between"><div><b style="display:block">Tab bar</b><span class="small muted">Choose and arrange the buttons along the bottom of the app on your phone.</span></div><button class="btn sm" data-act="edit-tabs">${ic('edit')}Edit</button></div>
          <label class="field"><span>Theme</span><select data-change="theme"><option value="auto" ${theme === 'auto' ? 'selected' : ''}>Match my device</option><option value="light" ${theme === 'light' ? 'selected' : ''}>Light</option><option value="dark" ${theme === 'dark' ? 'selected' : ''}>Dark</option></select></label></div>
        <form class="card stack" data-form="password"><h2>Change password</h2>
          ${pwField('currentPassword', 'Current password')}
          ${pwField('newPassword', 'New password', { meter: true, autocomplete: 'new-password' })}
          <div class="err-msg" data-err role="alert"></div>
          <button class="btn">Update password</button><span class="tiny muted">Changing it signs you out on your other devices.</span></form>
        <div class="card stack"><h2>Security</h2>
          <p class="small muted" style="margin:0">Signed in somewhere you shouldn’t be? Sign out everywhere except here.</p>
          <button class="btn" data-act="logout-others">${ic('logout')}Sign out of other devices</button></div>
        <div class="card stack"><h2>Your data</h2>
          <p class="small muted" style="margin:0">Download a copy of everything Crewdesk holds about you, or delete your account. See the <a href="#/privacy">Privacy Policy</a>.</p>
          <div class="row wrap tight"><button class="btn sm" data-act="export-data">${ic('download')}Download my data</button><button class="btn sm danger" data-act="delete-account">${ic('trash')}Delete my account</button></div></div>
        <button class="btn" data-act="logout">${ic('logout')}Sign out</button>
      </div>
    </div>`;
  },
};
F.profile = async (f, d) => { const r = await api('PUT', '/api/me', d); updateMe(r.user); toast('Profile saved'); };
F.password = async (f, d) => {
  if (!rulesOk(d.newPassword || '')) throw new Error('Your new password needs at least 12 characters, with a lowercase letter, a capital, a number and a symbol.');
  await api('PUT', '/api/me', { currentPassword: d.currentPassword, newPassword: d.newPassword });
  f.reset(); toast('Password updated. Other devices have been signed out.');
};
function updateMe(u) { S.user = u; S.members[u.id] = Object.assign(S.members[u.id] || {}, u); updateChrome(); renderView(false); }
C.pref = async (el) => {
  const k = el.dataset.k; let on = el.checked;
  if (k === 'desktop' && on && 'Notification' in window && Notification.permission !== 'granted') {
    try { on = (await Notification.requestPermission()) === 'granted'; } catch { on = false; }
    if (!on) { el.checked = false; return toast('Your browser didn’t allow notifications', true); }
  }
  try { const r = await api('PUT', '/api/me', { prefs: { [k]: on } }); S.user = r.user; toast('Saved'); } catch (e) { toast(e.message, true); el.checked = !on; }
};
C.privacy = async (el) => { try { const r = await api('PUT', '/api/me', { privacy: { [el.dataset.k]: el.checked } }); S.user = r.user; toast('Saved'); } catch (e) { toast(e.message, true); el.checked = !el.checked; } };
C.theme = (el) => { store.set('cd_theme', el.value === 'auto' ? null : el.value); applyTheme(); };
A.avatar = async () => {
  const [file] = await choosePhotos({ multiple: false, title: 'Profile picture', selfie: true });
  if (!file) return;
  const data = await cropAvatar(file); if (!data) return;
  try { const r = await api('PUT', '/api/me', { avatar: data }); updateMe(r.user); toast('Picture updated'); } catch (e) { toast(e.message, true); }
};
A['avatar-remove'] = async () => { try { const r = await api('PUT', '/api/me', { avatar: '' }); updateMe(r.user); } catch (e) { toast(e.message, true); } };
A['logout-others'] = async () => { try { await api('POST', '/api/logout-others'); toast('Signed out of your other devices'); } catch (e) { toast(e.message, true); } };
A['export-data'] = async () => {
  try {
    const r = await fetch('/api/me/export', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('Could not prepare your data');
    download('crewdesk-my-data.json', await r.blob()); toast('Your data is downloading');
  } catch (e) { toast(e.message, true); }
};
A['delete-account'] = () => sheet(`${sheetHead('Delete your account?')}
  <form class="stack" data-form="delete-account">
    <p class="small" style="margin:0">This permanently deletes your profile, picture, sign-ins and location. Messages, photos and pings you posted stay in your companies’ records, shown as from a “Former member”. If you’re the only person in a company, that company is deleted too.</p>
    ${pwField('password', 'Type your password to confirm')}
    <div class="err-msg" data-err role="alert"></div>
    <div class="sheet-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn danger solid">Delete my account</button></div>
  </form>`);
F['delete-account'] = async (f, d, close) => { await api('DELETE', '/api/me', { password: d.password }); close(); signOutLocal('Your account has been deleted'); };

// ============================================================ MORE (phones)
// Already added to the home screen? Then there's no need to explain how.
const installedApp = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
VIEWS.more = {
  render() {
    return `<h1 style="margin-bottom:14px">More</h1>
      <div class="card" style="padding:6px"><div class="menu">
        ${moreTabs().map((k) => `<a href="#/${k}">${ic(TAB_ITEMS[k][1])}<span class="grow">${({ sheets: 'Spreadsheets', team: 'Team &amp; map', admin: 'Admin dashboard', suggest: 'Suggestions', timesheet: 'My timesheet' })[k] || TAB_ITEMS[k][0]}</span>${k === 'sheets' || k === 'admin' ? '<span class="tiny muted">Admins</span>' : ''}${k === 'admin' ? '<span class="count hidden" data-badge="admin"></span>' : ''}${ic('right')}</a>`).join('')}
        <button data-act="edit-tabs">${ic('edit')}<span class="grow">Edit tab bar</span>${ic('right')}</button>
      </div></div>
      <div class="card section" style="padding:6px"><div class="menu">
        ${canInvite() ? `<button data-act="invite-new">${ic('userplus')}<span class="grow">Invite people</span>${ic('right')}</button>` : ''}
        <a href="#/settings">${ic('settings')}<span class="grow">Company settings</span>${ic('right')}</a>
        <a href="#/profile">${ic('user')}<span class="grow">My settings</span>${ic('right')}</a>
        ${S.companies.length > 1 ? `<button data-act="co-menu">${ic('building')}<span class="grow">Switch company</span>${ic('right')}</button>` : ''}
        <a href="#/companies">${ic('search')}<span class="grow">Find or create a company</span>${ic('right')}</a>
      </div></div>
      <div class="card section" style="padding:6px"><div class="menu">
        <a href="#/privacy">${ic('shield')}<span class="grow">Privacy policy</span>${ic('right')}</a>
        <a href="#/terms">${ic('file')}<span class="grow">Terms of use</span>${ic('right')}</a>
        <a href="mailto:${esc(S.info.supportEmail || '')}">${ic('mail')}<span class="grow">Contact support</span>${ic('right')}</a>
        <button data-act="logout">${ic('logout')}<span class="grow">Sign out</span></button>
      </div></div>
      ${installedApp() ? '' : `<div class="card section row">${icSize('phoneapp', 24, 'color:var(--accent-text);flex:none')}<div class="small"><b>Install on your phone</b><br><span class="muted">iPhone: Safari → Share → Add to Home Screen. Android: Chrome menu → Install app.</span></div></div>`}`;
  },
};

// ============================================================ PRIVACY & TERMS
const LEGAL_DATE = '6 November 2026';
function operatorLine() {
  const o = (S.info && S.info.operator) || {};
  if (o.name) return `${esc(o.name)}${o.address ? ', ' + esc(o.address) : ''}${o.email ? ` — <a href="mailto:${esc(o.email)}">${esc(o.email)}</a>` : ''}`;
  return 'the person or business that runs this copy of Crewdesk';
}
function supportBlock() {
  const e = (S.info && S.info.supportEmail) || 'da1essi08sol@gmail.com';
  return `<div class="support"><h2 style="margin-top:0">Support and contact</h2><p style="margin:0">Questions about your data, this policy or your account? Email our support team at <a href="mailto:${esc(e)}?subject=${encodeURIComponent('Crewdesk support')}"><b>${esc(e)}</b></a>.</p></div>`;
}
function legalHtml(kind) {
  const op = operatorLine();
  if (kind === 'terms') return `<article class="legal">
    <h1>Terms of use</h1><p class="updated">Last updated ${LEGAL_DATE}</p>
    <p>These terms cover your use of Crewdesk, a project, timesheet and team-communication app run by ${op} (“we”).</p>
    <h2>The service</h2>
    <p>Crewdesk is currently offered free of charge. It may change, have downtime, or lose data, so keep your own copies of anything critical. Because nothing is paid for, there are no charges to refund. If paid plans are added later, prices and a refund policy will be shown before you pay.</p>
    <h2>Your account</h2>
    <ul><li>Use your real name and an email address you control, and keep your password private.</li>
    <li>You’re responsible for what happens under your account.</li>
    <li>Company owners and admins control their company: they can change settings, see every project and everyone’s time, invite and remove members, and delete the company and its content.</li></ul>
    <h2>What you put in Crewdesk</h2>
    <ul><li>You keep ownership of your photos, files, messages and work details. You let us store them and show them to the people your company allows to see them, so the app can work.</li>
    <li>Only upload photos and documents you have the right to share, and don’t photograph people without their permission.</li>
    <li>If you add customer details, make sure you’re allowed to use them for the work.</li>
    <li>Don’t use Crewdesk for anything illegal or abusive, or to harass anyone, and don’t try to break, overload or get around its security.</li></ul>
    <h2>Location sharing</h2>
    <p>Sharing your live location is optional and off by default. Only switch it on if you’re happy for your company to see where you are while the app is open. Employers should agree this with staff and must not use it to track people outside working time.</p>
    <h2>Ending your account</h2>
    <p>You can delete your account at any time from your profile. We may suspend accounts that break these terms.</p>
    <h2>Liability</h2>
    <p>We provide Crewdesk “as is” and can’t promise it will always be available or free of errors. We aren’t liable for indirect losses, such as lost profits or business, arising from use of the app. Nothing in these terms limits liability that can’t be limited by law, including for death or personal injury caused by negligence, or for fraud.</p>
    <h2>Changes and law</h2>
    <p>We may update these terms and will show the date of the latest version here. These terms are governed by the law of England and Wales.</p>
    ${supportBlock()}
  </article>`;
  return `<article class="legal">
    <h1>Privacy policy</h1><p class="updated">Last updated ${LEGAL_DATE}</p>
    <p>This explains what personal information Crewdesk collects, why, how it’s protected, and your rights under UK data protection law (UK GDPR). Crewdesk is run by ${op}, who is responsible for your data.</p>
    <h2>What we collect</h2>
    <ul><li><b>Account:</b> your name, email address and password. The password is stored only as a scrypt hash, which can’t be turned back into the password.</li>
    <li><b>Profile (optional):</b> phone number, job title, department, a short bio and a profile picture.</li>
    <li><b>Your work:</b> projects, tasks, calendar events, photos, documents, messages, pings, and any customer details your company adds. Admins can also keep financial records in Spreadsheets.</li>
    <li><b>Your working time:</b> the times you start and stop work, what type of work it was, which project and task it was for, any notes you add, your end-of-day notes (what went well, what went wrong, what could improve), overtime approvals, and suggestions or questions you send to your admins. These make up your timesheets.</li>
    <li><b>Live location (optional, off by default):</b> only if you switch on location sharing, and only while Crewdesk is open on your device.</li>
    <li><b>Security records:</b> sign-ins, failed sign-ins, lockouts and password changes, with the email address and IP address involved, to protect accounts from attacks.</li>
    <li><b>Technical:</b> when you were last online, and a list of your signed-in devices (browser type and IP address).</li></ul>
    <p>We don’t use advertising, analytics or tracking tools, and we never sell your data.</p>
    <h2>Why we use it</h2>
    <ul><li>To run the app for you and your company — this is necessary to provide the service you signed up for.</li>
    <li>To keep accounts secure and stop misuse — this is in our legitimate interests.</li>
    <li>Your company uses your working time to produce timesheets and pay overtime, and to see how projects are going against their plan.</li>
    <li>Live location is used only because you chose to switch it on (your consent), which you can withdraw at any time.</li></ul>
    <h2>Who can see it</h2>
    <ul><li>People in the same company see your name, profile picture, title and department. Your phone number and email are shown to them unless you hide them in your settings.</li>
    <li>Projects and events can be limited to selected people; otherwise everyone in the company can see them. Owners and admins can see all projects. Direct messages and group chats can only be read by the people in them.</li>
    <li><b>Your time:</b> owners and admins can see all of your time entries, timesheets, end-of-day notes and suggestions, and approve your overtime. People who can see a project can see who logged time on it, when, and the notes on that time. Time not on a project (lunch, holiday, absence and so on) and your end-of-day notes are only seen by you and the admins.</li>
    <li>Pings are visible to everyone in the company. The person who posted a ping, and admins, can see how many people have read it.</li>
    <li>Uploaded photos and documents can only be opened by signed-in people who are allowed to see the item they’re attached to.</li>
    <li><b>Company profiles</b> are private by default. If an owner or admin makes one public, its name, picture, banner, description, trade, area, website and member count can be found by anyone signed in to Crewdesk. A company’s projects, chats, files, timesheets and member list are never public.</li>
    <li>If you ask to join a company, its owners and admins see your name, email address, profile picture and any message you add.</li>
    <li>Your profile is only visible to people in your companies, unless you choose to let people outside them see it. If you do, anyone signed in to Crewdesk can see your name, picture, job title, department, bio and public companies — never your phone number, email address, location or when you’re online.</li>
    <li>Your profile can show which companies you’re in: public ones to people who can see your profile, private ones only to people who are in them too. You can turn this off in your settings.</li></ul>
    <h2>Services we use</h2>
    <ul><li><b>Hosting:</b> Render (web hosting) and Neon (database), both in the EU (Frankfurt), store data for us under contract.</li>
    <li><b>Email:</b> confirmation, password-reset, security and invite emails are sent through our email provider (Brevo or Resend), which processes your email address to deliver them.</li>
    <li><b>Password breach check:</b> when you choose a password, we send the first 5 characters of its SHA-1 hash to the Have I Been Pwned service. The password itself never leaves our server and can’t be worked out from what’s sent.</li>
    <li><b>Google Drive (only if your company turns it on):</b> an admin can connect the company’s Google Drive so timesheets are copied into a folder there automatically. Google then stores those timesheets under the company’s own Google account and terms.</li>
    <li><b>Maps:</b> the team map loads map data from OpenFreeMap (or OpenStreetMap as a backup), which sees your IP address and this site’s address. “Directions” opens Google Maps, whose own privacy policy applies.</li></ul>
    <h2>Cookies and storage</h2>
    <p>Crewdesk uses one cookie: a sign-in cookie that keeps you signed in. It’s strictly necessary, can’t be read by scripts, and isn’t used for tracking, so no cookie banner is needed. Your browser also remembers your chosen company, theme and list filters on your device. Signing out removes the sign-in.</p>
    <h2>How long we keep it</h2>
    <ul><li>Your account data is kept while your account is open. Sign-ins expire after 30 days without use.</li>
    <li>Accounts that never confirm their email are deleted after 7 days.</li>
    <li>Live positions are deleted when you turn sharing off, and automatically after 12 hours.</li>
    <li>Your notification list keeps the latest 200 items. Security records keep the latest 1,500 events across the service.</li>
    <li>Time entries, timesheets and day notes are kept as your company’s payroll records while the company uses Crewdesk, including after you leave the company.</li>
    <li>Daily backups of the database are kept for 14 days, then deleted.</li>
    <li>If you delete your account, your profile, picture, sign-ins and location are deleted. Messages, photos and pings you posted stay part of your company’s records, shown as from a “Former member”, unless the company deletes them. Deleting a company deletes all of its data (backups expire within 14 days).</li></ul>
    <h2>Security</h2>
    <p>What we do: connections are encrypted (https). Passwords are hashed with scrypt and must meet strength rules and pass a breach check. Accounts lock after 5 wrong passwords (for 1 hour, then 24 hours, doubling each time), and sign-in, sign-up and reset requests are rate-limited. New accounts must confirm their email, and reset links work once and expire after 30 minutes. Sign-in cookies are HTTP-only and same-site, requests from other websites are blocked, and every request is checked on the server against your company and your access. Uploads are checked for type and size. No system is completely secure, so please use a unique password, and tell us straight away if you think something’s wrong.</p>
    <h2>Your rights</h2>
    <ul><li><b>See your data:</b> use “Download my data” in your settings.</li>
    <li><b>Correct it:</b> edit your profile at any time.</li>
    <li><b>Delete it:</b> use “Delete my account” in your settings.</li>
    <li>You can also object to how we use your data, or ask us to limit it, by emailing support.</li>
    <li>If you’re unhappy with how we handle your data, you can complain to the Information Commissioner’s Office: <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener noreferrer">ico.org.uk</a>.</li></ul>
    <h2>Children</h2><p>Crewdesk is a work tool and isn’t meant for anyone under 16.</p>
    ${supportBlock()}
  </article>`;
}
VIEWS.privacy = { manual: true, render() { return `<a class="back" href="#/more">${ic('back')}Back</a>${legalHtml('privacy')}`; } };
VIEWS.terms = { manual: true, render() { return `<a class="back" href="#/more">${ic('back')}Back</a>${legalHtml('terms')}`; } };
function renderLegalStandalone(kind) {
  stopAll();
  $('#app').innerHTML = `<div class="legal-wrap"><main class="stack" style="max-width:720px;width:100%" id="view" tabindex="-1">
    <div class="row">${brand()}<b>Crewdesk</b></div>
    <a class="back" href="${S.user ? '#/home' : '#/login'}">${ic('back')}Back</a>${legalHtml(kind)}${footLinks()}</main></div>`;
  window.scrollTo(0, 0);
}
