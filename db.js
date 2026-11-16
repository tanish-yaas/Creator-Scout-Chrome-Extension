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
  (festive || []).forEach(f => {
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
