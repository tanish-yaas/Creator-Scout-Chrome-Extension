// ==========================================
// Creator Scout — Creator list (the built-in sheet)
// Your Creator Scout headings, with Sheets-style tools:
// sort, filter by values or ranges, hide / reorder columns, select and hide rows,
// and "Clear sheet", which only empties this view (never the team board or master database).
// Copy and export always follow the view you've set up.
// ==========================================

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Columns you can edit in place, mapped to the record field they change
const EDITABLE = {
  'Name': 'name', 'Category': 'category', 'Type': 'type',
  'Country': 'country', 'Brand': 'brand', 'Niche': 'niche', 'Campaign Type': 'festive'
};
const NUMERIC = new Set(['Followers', 'Avg Views (10)', 'Content Views', 'Content Likes']);
const TIER_ORDER = { 'Nano': 1, 'Micro': 2, 'Mid-Tier': 3, 'Macro': 4, 'Mega': 5 };
const COLS = new Map(SHEET_COLUMNS.map(c => [c[0], c]));

let rows = [];          // every saved row, oldest first (Sr. No. order)
let q = '';
let selected = new Set();

// ---------- view settings (kept on this browser) ----------

const VIEW_KEY = 'scoutSheetView';
let view = loadView();
function loadView() {
  let v = {};
  try { v = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}'); } catch (e) { v = {}; }
  const names = SHEET_COLUMNS.map(c => c[0]);
  // "Festive Tags" is now "Campaign Type"; keep its place in saved layouts
  const renamed = n => (n === 'Festive Tags' ? 'Campaign Type' : n);
  ['order', 'hidden'].forEach(k => { if (Array.isArray(v[k])) v[k] = v[k].map(renamed); });
  if (v.sort && v.sort.col) v.sort.col = renamed(v.sort.col);
  if (v.filters && v.filters['Festive Tags']) { v.filters['Campaign Type'] = v.filters['Festive Tags']; delete v.filters['Festive Tags']; }
  const order = (v.order || []).filter(n => names.includes(n));
  names.forEach(n => { if (!order.includes(n)) order.push(n); });
  return {
    order,
    hidden: (v.hidden || []).filter(n => names.includes(n)),
    sort: v.sort && names.includes(v.sort.col) ? v.sort : null,
    filters: v.filters || {},          // { col: { values: [...] } | { min, max } }
    hiddenRows: v.hiddenRows || [],
    clearedAt: v.clearedAt || null,
    showHidden: false
  };
}
function saveView() {
  const { showHidden, ...keep } = view;
  try { localStorage.setItem(VIEW_KEY, JSON.stringify(keep)); } catch (e) { /* ignore */ }
}
const visibleCols = () => view.order.filter(n => !view.hidden.includes(n)).map(n => COLS.get(n));

// ---------- data ----------

async function load() {
  rows = (await getRecords()).slice().sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0));
  render();
}
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c[SCOUT_KEYS.records]) load(); });

function cellText(r, name) {
  let v = COLS.get(name)[1](r);
  if (v === undefined || v === null || v === '--') return '';
  return String(v);
}
const isCleared = r => view.clearedAt && (r.lastSavedAt || r.savedAt || 0) <= view.clearedAt;

function passesFilter(r, name, f) {
  const v = cellText(r, name);
  if (f.values) return f.values.includes(v);
  const n = Number(v);
  if (f.min !== undefined && f.min !== '' && !(v !== '' && n >= Number(f.min))) return false;
  if (f.max !== undefined && f.max !== '' && !(v !== '' && n <= Number(f.max))) return false;
  return true;
}

function compare(a, b, name) {
  const x = cellText(a, name), y = cellText(b, name);
  if (x === '' && y !== '') return 1;
  if (y === '' && x !== '') return -1;
  if (NUMERIC.has(name)) return Number(x) - Number(y);
  if (name === 'Tier') return (TIER_ORDER[x] || 0) - (TIER_ORDER[y] || 0);
  return x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' });
}

// The rows you see, in the order you see them
function viewRows({ ignoreFilterOn } = {}) {
  let list = rows.filter(r => !isCleared(r));
  if (!view.showHidden) list = list.filter(r => !view.hiddenRows.includes(r.id));
  Object.entries(view.filters).forEach(([name, f]) => {
    if (name !== ignoreFilterOn && COLS.has(name)) list = list.filter(r => passesFilter(r, name, f));
  });
  if (q) {
    const s = q.toLowerCase();
    list = list.filter(r => SHEET_COLUMNS.some(c => cellText(r, c[0]).toLowerCase().includes(s)));
  }
  if (view.sort) {
    const dir = view.sort.dir === 'desc' ? -1 : 1;
    list = list.slice().sort((a, b) => {
      const c = compare(a, b, view.sort.col);
      // blanks always last
      if (cellText(a, view.sort.col) === '' || cellText(b, view.sort.col) === '') return c;
      return c * dir;
    });
  }
  return list;
}

// ---------- render ----------

function render() {
  const live = rows.filter(r => !isCleared(r));
  const list = viewRows();
  const cols = visibleCols();
  const fresh = list.filter(r => !r.exportedAt);
  selected = new Set([...selected].filter(id => list.some(r => r.id === id)));

  $('sub').textContent = live.length
    ? `${list.length} of ${live.length} ${live.length === 1 ? 'row' : 'rows'} shown, ${fresh.length ? fresh.length + ' not copied to a sheet yet' : 'all copied'}`
    : view.clearedAt && rows.length ? 'Sheet cleared. New scouts will show up here.' : 'Nothing saved yet';
  $('copy-new').textContent = fresh.length ? `Copy ${fresh.length} new row${fresh.length > 1 ? 's' : ''}` : 'No new rows';
  $('copy-new').disabled = !fresh.length;
  ['copy-sheets', 'export-xlsx', 'export-csv'].forEach(id => { $(id).disabled = !list.length; });
  $('clear-sheet').disabled = !live.length;
  if (selected.size) $('copy-sheets').textContent = `Copy ${selected.size} selected`;
  else $('copy-sheets').textContent = 'Copy for Google Sheets';

  renderViewBar(live);

  const allSel = list.length && list.every(r => selected.has(r.id));
  $('thead').innerHTML = `<tr>
    <th class="sel"><input type="checkbox" id="sel-all" aria-label="Select all rows" ${allSel ? 'checked' : ''}></th>
    <th class="sr">Sr. No.</th>
    ${cols.map(c => {
      const name = c[0];
      const sorted = view.sort && view.sort.col === name ? (view.sort.dir === 'desc' ? ' ↓' : ' ↑') : '';
      const filtered = view.filters[name] ? ' filtered' : '';
      return `<th class="${NUMERIC.has(name) ? 'num' : ''}${filtered}" draggable="true" data-col="${esc(name)}">
        <span class="th-in"><span class="th-name">${esc(name)}${sorted}</span><button class="th-btn" data-menu="${esc(name)}" aria-label="${esc(name)} column options">▾</button></span>
      </th>`;
    }).join('')}
    <th class="act"></th></tr>`;

  $('empty').classList.toggle('hidden', list.length > 0);
  $('table').classList.toggle('hidden', !list.length);
  if (!list.length) {
    $('empty').innerHTML = live.length
      ? `<p class="pixel">No rows match</p><p>Clear the search or a filter above to see more.</p>`
      : view.clearedAt && rows.length
        ? `<p class="pixel">Sheet cleared</p><p>Creators you scout from now on show up here. <button class="link" id="restore-inline">Restore the cleared rows</button></p>`
        : `<p class="pixel">No creators yet</p><p>Open a profile, reel or short, click Creator Scout and save. Rows show up here straight away.</p>`;
    if ($('restore-inline')) $('restore-inline').addEventListener('click', restoreCleared);
  }

  $('tbody').innerHTML = list.map(r => {
    const n = rows.indexOf(r) + 1;
    const hiddenRow = view.hiddenRows.includes(r.id);
    const cells = cols.map(([name, get]) => {
      let v = get(r);
      if (v === undefined || v === null || v === '--') v = '';
      const key = EDITABLE[name];
      if (/URL$/.test(name) && v) return `<td class="link"><a href="${esc(v)}" target="_blank" rel="noopener">${esc(String(v).replace(/^https?:\/\/(www\.)?/, ''))}</a></td>`;
      if (NUMERIC.has(name)) return `<td class="num">${v === '' ? '' : Number(v).toLocaleString('en-IN')}</td>`;
      if (name === 'Tier' && v) return `<td><span class="tier ${calculateTier(r.followers).class}">${esc(v)}</span></td>`;
      if (key) return `<td class="edit" contenteditable="true" spellcheck="false" data-id="${r.id}" data-key="${key}">${esc(v)}</td>`;
      return `<td>${esc(v)}</td>`;
    }).join('');
    return `<tr class="${r.exportedAt ? '' : 'fresh'}${selected.has(r.id) ? ' is-sel' : ''}${hiddenRow ? ' is-hidden' : ''}" data-id="${r.id}">
      <td class="sel"><input type="checkbox" data-sel="${r.id}" aria-label="Select row ${n}" ${selected.has(r.id) ? 'checked' : ''}></td>
      <td class="sr">${n}</td>${cells}
      <td class="act"><button class="del" data-del="${r.id}" title="Delete this row for everyone">×</button></td></tr>`;
  }).join('');
}

// Shows what's shaping the view, each with a one-click undo
function renderViewBar(live) {
  const chips = [];
  if (selected.size) {
    chips.push(`<span class="chip strong">${selected.size} selected
      <button data-act="hide-sel">Hide rows</button>
      <button data-act="copy-sel">Copy</button>
      <button data-act="clear-sel">Unselect</button></span>`);
  }
  if (view.sort) chips.push(`<span class="chip">Sorted by ${esc(view.sort.col)} ${view.sort.dir === 'desc' ? 'Z → A' : 'A → Z'}<button data-act="unsort" aria-label="Remove sort">×</button></span>`);
  Object.entries(view.filters).forEach(([name, f]) => {
    const what = f.values ? `${f.values.length} value${f.values.length === 1 ? '' : 's'}` : [f.min !== '' && f.min !== undefined ? '≥ ' + Number(f.min).toLocaleString('en-IN') : '', f.max !== '' && f.max !== undefined ? '≤ ' + Number(f.max).toLocaleString('en-IN') : ''].filter(Boolean).join(' and ');
    chips.push(`<span class="chip">${esc(name)}: ${what}<button data-act="unfilter" data-col="${esc(name)}" aria-label="Remove filter">×</button></span>`);
  });
  const hiddenCount = view.hiddenRows.filter(id => live.some(r => r.id === id)).length;
  if (hiddenCount) chips.push(`<span class="chip">${hiddenCount} hidden ${hiddenCount === 1 ? 'row' : 'rows'}<button data-act="toggle-hidden">${view.showHidden ? 'Hide again' : 'Show'}</button><button data-act="unhide-rows">Unhide all</button></span>`);
  if (view.hidden.length) chips.push(`<span class="chip">${view.hidden.length} hidden ${view.hidden.length === 1 ? 'column' : 'columns'}<button data-act="unhide-cols">Show all</button></span>`);
  if (view.clearedAt) {
    const n = rows.filter(isCleared).length;
    if (n) chips.push(`<span class="chip">Cleared ${new Date(view.clearedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}: ${n} ${n === 1 ? 'row' : 'rows'} out of view<button data-act="restore">Restore</button></span>`);
  }
  $('view-bar').innerHTML = chips.join('');
  $('view-bar').classList.toggle('hidden', !chips.length);
}

$('view-bar').addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'unsort') view.sort = null;
  if (act === 'unfilter') delete view.filters[b.dataset.col];
  if (act === 'toggle-hidden') view.showHidden = !view.showHidden;
  if (act === 'unhide-rows') { view.hiddenRows = []; view.showHidden = false; }
  if (act === 'unhide-cols') view.hidden = [];
  if (act === 'restore') return restoreCleared();
  if (act === 'hide-sel') { view.hiddenRows = [...new Set([...view.hiddenRows, ...selected])]; toast(`${selected.size} ${selected.size === 1 ? 'row' : 'rows'} hidden`); selected.clear(); }
  if (act === 'clear-sel') selected.clear();
  if (act === 'copy-sel') {
    const list = viewRows().filter(r => selected.has(r.id));
    return copyRows(list, true, `Copied ${list.length} selected ${list.length === 1 ? 'row' : 'rows'} with headings.`);
  }
  saveView();
  render();
});

// ---------- selecting rows ----------

$('table').addEventListener('change', e => {
  if (e.target.id === 'sel-all') {
    const list = viewRows();
    if (e.target.checked) list.forEach(r => selected.add(r.id)); else selected.clear();
    return render();
  }
  const id = e.target.dataset.sel;
  if (!id) return;
  if (e.target.checked) selected.add(id); else selected.delete(id);
  render();
});

// ---------- editing cells ----------

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
  try {
    await updateRecord(r.id, { [key]: value, exportedAt: null });
    toast('Saved');
  } catch (err) { toast('Couldn\'t save to the team board: ' + err.message); load(); }
});
$('tbody').addEventListener('click', async e => {
  const b = e.target.closest('[data-del]');
  if (!b) return;
  if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Delete for everyone?'; b.classList.add('confirm'); return; }
  try { await deleteRecord(b.dataset.del); toast('Row deleted'); }
  catch (err) { toast('Couldn\'t delete on the team board: ' + err.message); }
});

// ---------- column header menu: sort, filter, hide, move ----------

let menuCol = null;
function openColMenu(name, anchor) {
  menuCol = name;
  menuOpenedAt = Date.now();
  const isNum = NUMERIC.has(name);
  // Values available given the other filters, like Google Sheets
  const pool = viewRows({ ignoreFilterOn: name });
  const counts = new Map();
  pool.forEach(r => { const v = cellText(r, name); counts.set(v, (counts.get(v) || 0) + 1); });
  const values = [...counts.keys()].sort((a, b) => {
    if (a === '') return 1; if (b === '') return -1;
    return isNum ? Number(a) - Number(b) : a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });
  const f = view.filters[name] || {};
  const allowed = f.values ? new Set(f.values) : null;
  const idx = view.order.indexOf(name);

  $('col-menu').innerHTML = `
    <p class="cm-title">${esc(name)}</p>
    <button data-cm="asc">Sort A → Z${isNum ? ' (low to high)' : ''}</button>
    <button data-cm="desc">Sort Z → A${isNum ? ' (high to low)' : ''}</button>
    <div class="cm-row">
      <button data-cm="left" ${idx <= 0 ? 'disabled' : ''}>← Move left</button>
      <button data-cm="right" ${idx >= view.order.length - 1 ? 'disabled' : ''}>Move right →</button>
    </div>
    <button data-cm="hide">Hide column</button>
    <div class="cm-sep"></div>
    ${isNum ? `<p class="cm-label">Filter by range</p>
      <div class="cm-range"><input id="cm-min" type="number" placeholder="Min" value="${esc(f.min ?? '')}"><span>to</span><input id="cm-max" type="number" placeholder="Max" value="${esc(f.max ?? '')}"></div>
      <p class="cm-label">or by values</p>` : `<p class="cm-label">Filter by values</p>`}
    <input id="cm-search" class="cm-search" type="search" placeholder="Search values">
    <div class="cm-quick"><button data-cm="all">Select all</button><button data-cm="none">Clear</button></div>
    <div class="cm-values" id="cm-values">
      ${values.map(v => `<label class="cm-val" data-v="${esc(v.toLowerCase())}"><input type="checkbox" value="${esc(v)}" ${!allowed || allowed.has(v) ? 'checked' : ''}>
        <span>${v === '' ? '<i>(Blanks)</i>' : esc(isNum ? Number(v).toLocaleString('en-IN') : v)}</span><em>${counts.get(v)}</em></label>`).join('') || '<p class="cm-label">No values</p>'}
    </div>
    <div class="cm-actions"><button data-cm="cancel" class="ghost">Cancel</button><button data-cm="apply" class="primary glow-pill">OK</button></div>`;

  const box = anchor.getBoundingClientRect();
  const m = $('col-menu');
  m.classList.remove('hidden');
  const w = m.offsetWidth;
  m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, box.left)) + 'px';
  m.style.maxHeight = (window.innerHeight - 16) + 'px';
  m.style.top = Math.max(8, Math.min(box.bottom + 6, window.innerHeight - m.offsetHeight - 8)) + 'px';
  $('cm-search').addEventListener('input', e => {
    const s = e.target.value.trim().toLowerCase();
    m.querySelectorAll('.cm-val').forEach(l => { l.style.display = l.dataset.v.includes(s) ? '' : 'none'; });
  });
}
function closeColMenu() { $('col-menu').classList.add('hidden'); menuCol = null; }

$('thead').addEventListener('click', e => {
  const b = e.target.closest('[data-menu]');
  if (b) { e.stopPropagation(); openColMenu(b.dataset.menu, b.closest('th')); return; }
  const th = e.target.closest('th[data-col]');
  if (th && !e.target.closest('input')) {
    // Clicking a heading cycles its sort: A → Z, Z → A, off
    const name = th.dataset.col;
    if (!view.sort || view.sort.col !== name) view.sort = { col: name, dir: 'asc' };
    else if (view.sort.dir === 'asc') view.sort = { col: name, dir: 'desc' };
    else view.sort = null;
    saveView(); render();
  }
});

$('col-menu').addEventListener('click', e => {
  const b = e.target.closest('[data-cm]');
  if (!b || !menuCol) return;
  const act = b.dataset.cm;
  const name = menuCol;
  const boxes = [...$('col-menu').querySelectorAll('.cm-val input')];
  if (act === 'all') return boxes.forEach(x => { if (x.closest('.cm-val').style.display !== 'none') x.checked = true; });
  if (act === 'none') return boxes.forEach(x => { if (x.closest('.cm-val').style.display !== 'none') x.checked = false; });
  if (act === 'cancel') return closeColMenu();
  if (act === 'asc' || act === 'desc') view.sort = { col: name, dir: act };
  if (act === 'apply') {
    const min = $('cm-min') ? $('cm-min').value : '';
    const max = $('cm-max') ? $('cm-max').value : '';
    const checked = boxes.filter(x => x.checked).map(x => x.value);
    if (min !== '' || max !== '') view.filters[name] = { min, max };
    else if (checked.length === boxes.length) delete view.filters[name];
    else view.filters[name] = { values: checked };
  }
  if (act === 'hide') {
    if (visibleCols().length <= 1) { toast('Keep at least one column visible'); return; }
    view.hidden.push(name);
  }
  if (act === 'left' || act === 'right') {
    const i = view.order.indexOf(name);
    const j = act === 'left' ? i - 1 : i + 1;
    [view.order[i], view.order[j]] = [view.order[j], view.order[i]];
  }
  saveView();
  closeColMenu();
  render();
});

document.addEventListener('mousedown', e => {
  if (!$('col-menu').classList.contains('hidden') && !e.target.closest('#col-menu') && !e.target.closest('[data-menu]')) closeColMenu();
  if (!e.target.closest('.pop-wrap')) { $('more-menu').classList.add('hidden'); $('columns-menu').classList.add('hidden'); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeColMenu(); $('more-menu').classList.add('hidden'); $('columns-menu').classList.add('hidden'); closeClear(); }
});
let menuOpenedAt = 0;
$('table-wrap').addEventListener('scroll', () => { if (Date.now() - menuOpenedAt > 250) closeColMenu(); });

// Drag a heading onto another to move the column
let dragCol = null;
$('thead').addEventListener('dragstart', e => {
  const th = e.target.closest('th[data-col]');
  if (!th) return;
  dragCol = th.dataset.col;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragCol);
  th.classList.add('dragging');
});
$('thead').addEventListener('dragover', e => {
  const th = e.target.closest('th[data-col]');
  if (!th || !dragCol) return;
  e.preventDefault();
  $('thead').querySelectorAll('.drop-to').forEach(x => x.classList.remove('drop-to'));
  th.classList.add('drop-to');
});
$('thead').addEventListener('drop', e => {
  const th = e.target.closest('th[data-col]');
  if (!th || !dragCol || th.dataset.col === dragCol) return;
  e.preventDefault();
  // Dropping to the right puts the column after the target, to the left puts it before
  const from = view.order.indexOf(dragCol);
  const to = view.order.indexOf(th.dataset.col);
  view.order.splice(from, 1);
  const target = view.order.indexOf(th.dataset.col);
  view.order.splice(from < to ? target + 1 : target, 0, dragCol);
  dragCol = null;
  saveView(); render();
});
$('thead').addEventListener('dragend', () => { dragCol = null; $('thead').querySelectorAll('.dragging, .drop-to').forEach(x => x.classList.remove('dragging', 'drop-to')); });

// ---------- columns panel: show / hide / reorder ----------

function renderColumnsMenu() {
  $('columns-menu').innerHTML = `
    <p class="cm-title">Columns</p>
    <div class="cols-list">${view.order.map((n, i) => `
      <div class="col-item">
        <label><input type="checkbox" data-colvis="${esc(n)}" ${view.hidden.includes(n) ? '' : 'checked'}> ${esc(n)}</label>
        <span class="col-move">
          <button data-colmove="${esc(n)}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(n)} up">↑</button>
          <button data-colmove="${esc(n)}" data-dir="1" ${i === view.order.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(n)} down">↓</button>
        </span>
      </div>`).join('')}
    </div>
    <div class="cm-quick"><button data-colall="1">Show all</button><button data-colreset="1">Default order</button></div>`;
}
$('columns-btn').addEventListener('click', () => {
  $('more-menu').classList.add('hidden');
  renderColumnsMenu();
  $('columns-menu').classList.toggle('hidden');
});
$('columns-menu').addEventListener('change', e => {
  const n = e.target.dataset.colvis;
  if (!n) return;
  if (!e.target.checked) {
    if (visibleCols().length <= 1) { e.target.checked = true; return toast('Keep at least one column visible'); }
    view.hidden.push(n);
  } else view.hidden = view.hidden.filter(x => x !== n);
  saveView(); render();
});
$('columns-menu').addEventListener('click', e => {
  const mv = e.target.closest('[data-colmove]');
  if (mv) {
    const i = view.order.indexOf(mv.dataset.colmove);
    const j = i + Number(mv.dataset.dir);
    [view.order[i], view.order[j]] = [view.order[j], view.order[i]];
  } else if (e.target.closest('[data-colall]')) view.hidden = [];
  else if (e.target.closest('[data-colreset]')) view.order = SHEET_COLUMNS.map(c => c[0]);
  else return;
  saveView(); render(); renderColumnsMenu();
});

// ---------- copy & export (follow the current view) ----------

async function copyRows(list, withHeader, label) {
  if (!list.length) return;
  const cols = visibleCols();
  const ok = await copyToClipboard(toTSV(list, withHeader, cols), toHTMLTable(list, withHeader, cols));
  if (!ok) return toast('Copy was blocked. Click the page once and try again.');
  await markExported(list.map(r => r.id));
  toast(label);
}
function rowsForExport() {
  const list = viewRows();
  return selected.size ? list.filter(r => selected.has(r.id)) : list;
}

$('copy-sheets').addEventListener('click', () => {
  const list = rowsForExport();
  copyRows(list, true, `Copied ${list.length} ${list.length === 1 ? 'row' : 'rows'} with headings. Paste into cell A1 of your sheet.`);
});
$('copy-new').addEventListener('click', () => {
  const fresh = viewRows().filter(r => !r.exportedAt);
  copyRows(fresh, false, `Copied ${fresh.length} new row${fresh.length > 1 ? 's' : ''}. Paste under your last row.`);
});
$('export-xlsx').addEventListener('click', async () => {
  const list = rowsForExport();
  downloadBlob(toXLSX(list, visibleCols()), `creator-scout-${formatDate(Date.now()).slice(0, 10)}.xlsx`);
  await markExported(list.map(r => r.id));
  toast('Excel file downloaded');
});
$('export-csv').addEventListener('click', async () => {
  const list = rowsForExport();
  downloadText(toCSV(list, visibleCols()), `creator-scout-${formatDate(Date.now()).slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
  await markExported(list.map(r => r.id));
  toast('CSV downloaded');
});

// ---------- clear sheet (this extension only) ----------

function closeClear() { $('clear-modal').classList.add('hidden'); }
$('clear-sheet').addEventListener('click', () => $('clear-modal').classList.remove('hidden'));
$('clear-cancel').addEventListener('click', closeClear);
$('clear-modal').addEventListener('click', e => { if (e.target === $('clear-modal')) closeClear(); });
$('clear-confirm').addEventListener('click', () => {
  view.clearedAt = Date.now();
  view.hiddenRows = [];
  selected.clear();
  saveView();
  closeClear();
  render();
  toast('Sheet cleared on this extension. Nothing was deleted.');
});
function restoreCleared() {
  view.clearedAt = null;
  saveView();
  render();
  toast('Cleared rows are back');
}

// ---------- more menu ----------

$('more').addEventListener('click', () => { $('columns-menu').classList.add('hidden'); $('more-menu').classList.toggle('hidden'); });
$('open-gsheet').addEventListener('click', () => window.open('https://sheets.new', '_blank'));
$('mark-copied').addEventListener('click', async () => { await markExported(viewRows().map(r => r.id)); $('more-menu').classList.add('hidden'); toast('Rows marked as copied'); });
$('reset-view').addEventListener('click', () => {
  view = { ...loadView(), order: SHEET_COLUMNS.map(c => c[0]), hidden: [], sort: null, filters: {}, hiddenRows: [], clearedAt: view.clearedAt, showHidden: false };
  saveView();
  $('more-menu').classList.add('hidden');
  render();
  toast('Sorting, filters and columns reset');
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
startTeamSync();

// New version on GitHub + folder already allowed = install quietly (the sheet reopens after the restart)
autoUpdate({ onStart: v => toast(`Updating Creator Scout to ${v}…`) });
takeJustUpdated().then(u => { if (u) setTimeout(() => toast(`Creator Scout updated to ${u.to}`), 600); });
getTeamInfo().then(info => {
  if (teamOn() && info.sheetUrl) {
    $('open-team-sheet').classList.remove('hidden');
    $('open-team-sheet').addEventListener('click', () => window.open(info.sheetUrl, '_blank'));
  }
});
