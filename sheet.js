// ==========================================
// Creator Scout — Creator list (the built-in sheet)
// Shows every saved row with the Creator Scout column headings,
// lets you edit text cells, and copies / exports to Google Sheets, Excel or CSV.
// ==========================================

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Columns you can edit in place, mapped to the record field they change
const EDITABLE = {
  'Name': 'name', 'Category': 'category', 'Type': 'type', 'IP': 'ip',
  'Country': 'country', 'Brand': 'brand', 'Niche': 'niche', 'Festive Tags': 'festive'
};
const NUMERIC = new Set(['Followers', 'Avg Views (10)', 'Content Views', 'Content Likes']);

let rows = [];   // oldest first, like a sheet
let q = '';

async function load() {
  rows = (await getRecords()).slice().sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0));
  render();
}
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c[SCOUT_KEYS.records]) load(); });

function visible() {
  if (!q) return rows;
  const s = q.toLowerCase();
  return rows.filter(r => SHEET_COLUMNS.some(c => String(c[1](r) ?? '').toLowerCase().includes(s)));
}

function render() {
  const fresh = rows.filter(r => !r.exportedAt).length;
  $('sub').textContent = rows.length
    ? `${rows.length} ${rows.length === 1 ? 'creator' : 'creators'}, ${fresh ? fresh + ' not copied to a sheet yet' : 'all copied'}`
    : 'Nothing saved yet';
  $('copy-new').textContent = fresh ? `Copy ${fresh} new row${fresh > 1 ? 's' : ''}` : 'No new rows';
  $('copy-new').disabled = !fresh;
  ['copy-sheets', 'export-xlsx', 'export-csv'].forEach(id => { $(id).disabled = !rows.length; });

  $('thead').innerHTML = '<tr><th class="sr">Sr. No.</th>' +
    SHEET_COLUMNS.map(c => `<th class="${NUMERIC.has(c[0]) ? 'num' : ''}">${esc(c[0])}</th>`).join('') + '<th class="act"></th></tr>';

  const list = visible();
  $('empty').classList.toggle('hidden', rows.length > 0);
  $('table').classList.toggle('hidden', !rows.length);

  $('tbody').innerHTML = list.map(r => {
    const n = rows.indexOf(r) + 1;
    const cells = SHEET_COLUMNS.map(([name, get]) => {
      let v = get(r);
      if (v === undefined || v === null || v === '--') v = '';
      const key = EDITABLE[name];
      if (/URL$/.test(name) && v) return `<td class="link"><a href="${esc(v)}" target="_blank" rel="noopener">${esc(String(v).replace(/^https?:\/\/(www\.)?/, ''))}</a></td>`;
      if (NUMERIC.has(name)) return `<td class="num">${v === '' ? '' : Number(v).toLocaleString('en-IN')}</td>`;
      if (name === 'Tier' && v) return `<td><span class="tier ${calculateTier(r.followers).class}">${esc(v)}</span></td>`;
      if (key) return `<td class="edit" contenteditable="true" spellcheck="false" data-id="${r.id}" data-key="${key}">${esc(v)}</td>`;
      return `<td>${esc(v)}</td>`;
    }).join('');
    return `<tr class="${r.exportedAt ? '' : 'fresh'}"><td class="sr">${n}</td>${cells}<td class="act"><button class="del" data-del="${r.id}" title="Delete row">×</button></td></tr>`;
  }).join('') || (rows.length ? `<tr><td class="none" colspan="${SHEET_COLUMNS.length + 2}">No rows match “${esc(q)}”.</td></tr>` : '');
}

// ---------- editing ----------

$('tbody').addEventListener('keydown', e => {
  if (e.target.matches('.edit') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  if (e.target.matches('.edit') && e.key === 'Escape') { e.target.blur(); load(); }
});
$('tbody').addEventListener('focusout', async e => {
  const td = e.target.closest('.edit');
  if (!td) return;
  const r = rows.find(x => x.id === td.dataset.id);
  if (!r) return;
  const key = td.dataset.key;
  const text = td.textContent.trim();
  const value = key === 'festive' ? text.split(',').map(s => s.trim()).filter(Boolean) : text;
  const before = key === 'festive' ? (r.festive || []).join(', ') : (r[key] || '');
  if ((key === 'festive' ? value.join(', ') : value) === before) return;
  await updateRecord(r.id, { [key]: value, exportedAt: null });
  toast('Saved');
});
$('tbody').addEventListener('click', async e => {
  const b = e.target.closest('[data-del]');
  if (!b) return;
  if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Delete?'; b.classList.add('confirm'); return; }
  await deleteRecord(b.dataset.del);
  toast('Row deleted');
});

// ---------- copy & export ----------

async function copyRows(list, withHeader, label) {
  if (!list.length) return;
  const ok = await copyToClipboard(toTSV(list, withHeader), toHTMLTable(list, withHeader));
  if (!ok) return toast('Copy was blocked. Click the page once and try again.');
  await markExported(list.map(r => r.id));
  toast(label);
}

$('copy-sheets').addEventListener('click', () =>
  copyRows(rows, true, `Copied ${rows.length} rows with headings. Paste into cell A1 of your sheet.`));
$('copy-new').addEventListener('click', () => {
  const fresh = rows.filter(r => !r.exportedAt);
  copyRows(fresh, false, `Copied ${fresh.length} new row${fresh.length > 1 ? 's' : ''}. Paste under your last row.`);
});
$('export-xlsx').addEventListener('click', async () => {
  downloadBlob(toXLSX(rows), `creator-scout-${formatDate(Date.now()).slice(0, 10)}.xlsx`);
  await markExported(rows.map(r => r.id));
  toast('Excel file downloaded');
});
$('export-csv').addEventListener('click', async () => {
  downloadText(toCSV(rows), `creator-scout-${formatDate(Date.now()).slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
  await markExported(rows.map(r => r.id));
  toast('CSV downloaded');
});

// ---------- more menu ----------

$('more').addEventListener('click', e => { e.stopPropagation(); $('more-menu').classList.toggle('hidden'); });
document.addEventListener('click', e => { if (!e.target.closest('.more-wrap')) $('more-menu').classList.add('hidden'); });
$('open-gsheet').addEventListener('click', () => window.open('https://sheets.new', '_blank'));
$('mark-copied').addEventListener('click', async () => { await markExported(rows.map(r => r.id)); toast('All rows marked as copied'); });
$('delete-all').addEventListener('click', async () => {
  const b = $('delete-all');
  if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Click again to delete every row'; return; }
  await setRecords([]);
  b.dataset.confirm = ''; b.textContent = 'Delete all rows';
  $('more-menu').classList.add('hidden');
  toast('All rows deleted');
});

$('search').addEventListener('input', e => { q = e.target.value.trim(); render(); });

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

load();
