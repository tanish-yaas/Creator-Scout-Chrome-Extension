// ==========================================
// Creator Scout — shared data layer
// Used by popup.html and moodboard.html
// Everything lives in chrome.storage.local (no external sheet needed).
// ==========================================

const SCOUT_KEYS = { records: 'scoutRecords', taxonomy: 'scoutTaxonomy' };

const DEFAULT_FESTIVE = [
  { name: 'Diwali', emoji: '🪔', color: '#F2A93B' },
  { name: 'Holi', emoji: '🎨', color: '#E5489A' },
  { name: 'Navratri', emoji: '💃', color: '#D94F2B' },
  { name: 'Durga Puja', emoji: '🌺', color: '#C0392B' },
  { name: 'Ganesh Chaturthi', emoji: '🐘', color: '#E07B24' },
  { name: 'Raksha Bandhan', emoji: '🧵', color: '#C44AB5' },
  { name: 'Eid', emoji: '🌙', color: '#2E9C78' },
  { name: 'Onam', emoji: '🌼', color: '#D9B422' },
  { name: 'Pongal', emoji: '🌾', color: '#B78A2E' },
  { name: 'Christmas', emoji: '🎄', color: '#2F8F4E' },
  { name: 'New Year', emoji: '🎆', color: '#5468D4' },
  { name: "Valentine's", emoji: '❤️', color: '#E0435A' },
  { name: 'Independence Day', emoji: '🇮🇳', color: '#3A7BD5' }
];

const TAPE_FALLBACK_COLORS = ['#7A6FF0', '#2BA6A0', '#D46A6A', '#8C9B3A', '#C77D3A', '#5C8FD6'];

// The first 12 columns match the old Apps Script sheet exactly, so old sheets keep lining up.
const SHEET_COLUMNS = [
  ['Date', r => formatDate(r.savedAt)],
  ['Platform', r => r.platform],
  ['Username', r => r.username],
  ['Name', r => r.name],
  ['Followers', r => r.followers || ''],
  ['Category', r => r.category],
  ['Tier', r => r.tier],
  ['Type', r => r.type],
  ['IP', r => r.ip],
  ['URL', r => r.url],
  ['Avg Views (10)', r => (r.avgViews && r.avgViews !== '--') ? r.avgViews : ''],
  ['Country', r => r.country],
  ['Content URL', r => r.contentUrl],
  ['Brand', r => r.brand],
  ['Niche', r => r.niche],
  ['Festive Tags', r => (r.festive || []).join(', ')],
  ['Content Views', r => r.contentViews || ''],
  ['Content Likes', r => r.contentLikes || '']
];

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- storage ----------

function storageGet(keys) {
  return new Promise(res => chrome.storage.local.get(keys, res));
}
function storageSet(obj) {
  return new Promise(res => chrome.storage.local.set(obj, res));
}

async function getRecords() {
  const r = await storageGet([SCOUT_KEYS.records]);
  return r[SCOUT_KEYS.records] || [];
}
async function setRecords(records) {
  await storageSet({ [SCOUT_KEYS.records]: records });
}

async function getTaxonomy() {
  const r = await storageGet([SCOUT_KEYS.taxonomy]);
  const t = r[SCOUT_KEYS.taxonomy] || {};
  return {
    brands: t.brands || {},            // { "Brand": ["Niche", ...] }
    festive: t.festive || DEFAULT_FESTIVE.slice()
  };
}
async function setTaxonomy(tax) {
  await storageSet({ [SCOUT_KEYS.taxonomy]: tax });
}

// Make sure a brand / niche / festive tag used on a record exists in the taxonomy.
async function registerTaxonomy({ brand, niche, festive }) {
  const tax = await getTaxonomy();
  if (brand) {
    tax.brands[brand] = tax.brands[brand] || [];
    if (niche && !tax.brands[brand].includes(niche)) tax.brands[brand].push(niche);
  }
  (festive || []).filter(Boolean).forEach(f => {
    if (!tax.festive.some(x => x.name.toLowerCase() === f.toLowerCase())) {
      tax.festive.push({ name: f, emoji: '✨', color: TAPE_FALLBACK_COLORS[tax.festive.length % TAPE_FALLBACK_COLORS.length] });
    }
  });
  await setTaxonomy(tax);
  return tax;
}

// Same content (or same profile when there is no content) = same row. Returns { record, updated }.
async function upsertRecord(rec) {
  const records = await getRecords();
  const key = r => (r.contentUrl || r.url || '').toLowerCase().replace(/\/+$/, '');
  const k = key(rec);
  const idx = k ? records.findIndex(r => key(r) === k) : -1;
  let updated = false;
  if (idx !== -1) {
    rec = { ...records[idx], ...rec, id: records[idx].id, savedAt: records[idx].savedAt, exportedAt: null };
    records[idx] = rec;
    updated = true;
  } else {
    rec = { ...rec, id: uid(), savedAt: Date.now(), exportedAt: null };
    records.unshift(rec);
  }
  await setRecords(records);
  await registerTaxonomy(rec);
  return { record: rec, updated };
}

async function updateRecord(id, patch) {
  const records = await getRecords();
  const i = records.findIndex(r => r.id === id);
  if (i === -1) return null;
  records[i] = { ...records[i], ...patch };
  await setRecords(records);
  await registerTaxonomy(records[i]);
  return records[i];
}

async function deleteRecord(id) {
  const records = await getRecords();
  await setRecords(records.filter(r => r.id !== id));
}

async function findCreator(platform, username) {
  if (!username) return null;
  const u = username.toLowerCase().replace(/^@/, '');
  const records = await getRecords();
  return records.find(r => r.platform === platform && (r.username || '').toLowerCase().replace(/^@/, '') === u && r.followers) || null;
}

// ---------- sheets export ----------

function cleanCell(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[\t\r\n]+/g, ' ').trim();
}

// Tab-separated text pastes straight into Google Sheets / Excel as rows & columns.
function toTSV(records, withHeader) {
  const lines = [];
  if (withHeader) lines.push(SHEET_COLUMNS.map(c => c[0]).join('\t'));
  records.forEach(r => lines.push(SHEET_COLUMNS.map(c => cleanCell(c[1](r))).join('\t')));
  return lines.join('\n');
}

function toCSV(records) {
  const esc = v => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [SHEET_COLUMNS.map(c => esc(c[0])).join(',')];
  records.forEach(r => lines.push(SHEET_COLUMNS.map(c => esc(c[1](r))).join(',')));
  return '﻿' + lines.join('\r\n'); // BOM so Excel reads emoji / Hindi names correctly
}

function downloadText(text, filename, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function markExported(ids) {
  const set = new Set(ids);
  const now = Date.now();
  const records = await getRecords();
  records.forEach(r => { if (set.has(r.id)) r.exportedAt = now; });
  await setRecords(records);
}

// ---------- number helpers ----------

function parseCount(str) {
  if (str === null || str === undefined || str === '--' || str === '') return 0;
  if (typeof str === 'number') return str;
  let s = String(str).trim().replace(/,/g, '').toLowerCase();
  let mult = 1;
  if (s.endsWith('k')) { mult = 1e3; s = s.slice(0, -1); }
  else if (s.endsWith('m')) { mult = 1e6; s = s.slice(0, -1); }
  else if (s.endsWith('b')) { mult = 1e9; s = s.slice(0, -1); }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.round(n * mult);
}

function formatCount(num) {
  if (!num) return '--';
  if (num >= 1e6) return +(num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return +(num / 1e3).toFixed(1) + 'K';
  return String(num);
}

function calculateTier(num) {
  if (!num) return { name: 'Unknown', class: '' };
  if (num < 10000) return { name: 'Nano', class: 'tier-nano' };
  if (num < 50000) return { name: 'Micro', class: 'tier-micro' };
  if (num < 100000) return { name: 'Mid-Tier', class: 'tier-mid' };
  if (num < 500000) return { name: 'Macro', class: 'tier-macro' };
  return { name: 'Mega', class: 'tier-mega' };
}

// Shrinks a remote thumbnail into a small JPEG data URL so it never expires
// (Instagram CDN links die after a few days).
async function thumbToDataUrl(url, width = 360) {
  if (!url) return '';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('thumb ' + res.status);
    const bmp = await createImageBitmap(await res.blob());
    const scale = Math.min(1, width / bmp.width);
    const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.75 });
    return await new Promise(res2 => {
      const fr = new FileReader();
      fr.onload = () => res2(fr.result);
      fr.readAsDataURL(blob);
    });
  } catch (e) {
    return url; // fall back to the live URL
  }
}

// ---------- clipboard ----------

// Writes rich HTML (Google Sheets pastes it as a real table) plus plain text.
// Falls back to execCommand when the async Clipboard API is blocked.
async function copyToClipboard(text, html) {
  try {
    if (html && window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' })
      })]);
      return true;
    }
  } catch (e) { /* try the next method */ }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) { /* try the next method */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:-1000px;opacity:0;';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  return ok;
}

function toHTMLTable(records, withHeader) {
  const e = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let h = '<meta charset="utf-8"><table>';
  if (withHeader) h += '<tr>' + SHEET_COLUMNS.map(c => `<th>${e(c[0])}</th>`).join('') + '</tr>';
  records.forEach(r => {
    h += '<tr>' + SHEET_COLUMNS.map(c => {
      const v = cleanCell(c[1](r));
      return /^https?:\/\//.test(v) ? `<td><a href="${e(v)}">${e(v)}</a></td>` : `<td>${e(v)}</td>`;
    }).join('') + '</tr>';
  });
  return h + '</table>';
}

// ---------- Excel (.xlsx) export, no libraries ----------

const NUMERIC_COLUMNS = new Set(['Followers', 'Avg Views (10)', 'Content Views', 'Content Likes']);

function toXLSX(records) {
  const x = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const colName = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const cell = (ref, v, header) => {
    const style = header ? ' s="1"' : '';
    if (!header && typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${style}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${x(v)}</t></is></c>`;
  };
  let rows = '<row r="1">' + SHEET_COLUMNS.map((c, i) => cell(colName(i) + '1', c[0], true)).join('') + '</row>';
  records.forEach((r, ri) => {
    const n = ri + 2;
    rows += `<row r="${n}">` + SHEET_COLUMNS.map((c, i) => {
      let v = cleanCell(c[1](r));
      if (NUMERIC_COLUMNS.has(c[0]) && v !== '' && !isNaN(Number(v))) v = Number(v);
      return cell(colName(i) + n, v, false);
    }).join('') + '</row>';
  });
  const widths = SHEET_COLUMNS.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${/URL/.test(c[0]) ? 42 : 16}" customWidth="1"/>`).join('');
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Creators" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${rows}</sheetData></worksheet>`
  };
  return new Blob([zipStore(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// Minimal ZIP writer (stored, no compression) — enough for an .xlsx
function zipStore(files) {
  const enc = new TextEncoder();
  const crcTable = zipStore.t || (zipStore.t = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  }));
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const parts = [], central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameB = enc.encode(name), data = enc.encode(content), crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true); local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, nameB.length, true);
    parts.push(new Uint8Array(local.buffer), nameB, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true);
    cen.setUint16(28, nameB.length, true); cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cenSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, Object.keys(files).length, true); end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)]);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
