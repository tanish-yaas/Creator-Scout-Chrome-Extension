/**
 * Creator Scout — team database
 * Paste this into Extensions > Apps Script on a new Google Sheet, then deploy it as a web app
 * (Execute as: Me, Who has access: Anyone). See team-backend/SETUP.md.
 *
 * The sheet gets three tabs:
 *   Records  — every creator / reel the team saves (readable as a normal sheet)
 *   Brands   — logo and card colour for each brand on the moodboard, plus its niches
 *   Settings — shared festive tags
 */

// Must match TEAM_KEY in config.js of the extension. Change both to the same random text.
const TEAM_KEY = 'change-me-to-a-long-random-phrase';

const IMAGE_FOLDER_NAME = 'Creator Scout images';

// [record field, sheet heading]
const RECORD_COLUMNS = [
  ['id', 'ID'],
  ['date', 'Date'],
  ['platform', 'Platform'],
  ['username', 'Username'],
  ['name', 'Name'],
  ['followers', 'Followers'],
  ['category', 'Category'],
  ['tier', 'Tier'],
  ['type', 'Type'],
  ['brand', 'Brand'],
  ['url', 'URL'],
  ['avgViews', 'Avg Views (10)'],
  ['country', 'Country'],
  ['contentUrl', 'Content URL'],
  ['contentKind', 'Content Type'],
  ['niche', 'Niche'],
  ['festive', 'Festive Tags'],
  ['contentViews', 'Content Views'],
  ['contentLikes', 'Content Likes'],
  ['contentComments', 'Content Comments'],
  ['postedAt', 'Posted'],
  ['caption', 'Caption'],
  ['thumb', 'Thumbnail'],
  ['avatar', 'Profile Picture'],
  ['savedBy', 'Saved By'],
  ['savedAt', 'Saved At'],
  ['updatedAt', 'Updated At'],
  ['lastSavedAt', 'Last Saved At']
];
const BRAND_COLUMNS = [['name', 'Brand'], ['logo', 'Logo'], ['color', 'Color'], ['niches', 'Niches'], ['updatedAt', 'Updated At']];
const NUMBER_FIELDS = ['followers', 'avgViews', 'contentViews', 'contentLikes', 'contentComments', 'savedAt', 'updatedAt', 'lastSavedAt'];

// ---------------------------------------------------------------- web app entry points

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.key !== TEAM_KEY) return json_({ ok: false, error: 'Wrong team key' });
  try {
    if (p.action === 'list') return json_(Object.assign({ ok: true }, listAll_()));
    if (p.action === 'ping') return json_({ ok: true, sheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl() });
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Bad JSON' }); }
  if (body.key !== TEAM_KEY) return json_({ ok: false, error: 'Wrong team key' });

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    switch (body.action) {
      case 'upsert': return json_(Object.assign({ ok: true }, upsertRecord_(body.record || {})));
      case 'update': return json_({ ok: true, record: updateRecord_(body.id, body.patch || {}) });
      case 'delete': deleteRecord_(body.id); return json_({ ok: true });
      case 'brand': return json_({ ok: true, brand: saveBrand_(body.name, body.patch || {}) });
      case 'renameBrand': renameBrand_(body.from, body.to); return json_({ ok: true });
      case 'deleteBrand': return json_({ ok: true, deleted: deleteBrand_(body.name) });
      case 'festive': return json_({ ok: true, festive: saveFestive_(body.festive || []) });
      default: return json_({ ok: false, error: 'Unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- sheets

function sheet_(name, columns) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, columns.length).setValues([columns.map(function (c) { return c[1]; })]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function readObjects_(sh, columns) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, columns.length).getValues();
  return values.map(function (row, i) {
    const o = { _row: i + 2 };
    columns.forEach(function (c, j) { o[c[0]] = row[j]; });
    return o;
  });
}

function toRow_(obj, columns) {
  return columns.map(function (c) {
    const v = obj[c[0]];
    if (v === undefined || v === null) return '';
    if (Array.isArray(v)) return v.join(', ');
    // Text that starts like a formula is stored as plain text
    if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
    return v;
  });
}

function cleanRecord_(o) {
  const r = {};
  RECORD_COLUMNS.forEach(function (c) {
    let v = o[c[0]];
    // Sheets turns date-looking text into Date objects; read them back as text
    if (Object.prototype.toString.call(v) === '[object Date]') {
      v = Utilities.formatDate(v, Session.getScriptTimeZone(), c[0] === 'date' ? 'yyyy-MM-dd HH:mm' : 'MMMM d, yyyy');
    }
    if (c[0] === 'festive') v = String(v || '').split(',').map(function (s) { return s.trim(); }).filter(String);
    else if (NUMBER_FIELDS.indexOf(c[0]) !== -1) v = (v === '' || v === null || isNaN(Number(v))) ? (c[0] === 'avgViews' ? '--' : 0) : Number(v);
    else v = v === undefined || v === null ? '' : String(v);
    r[c[0]] = v;
  });
  return r;
}

function keyOf_(r) {
  return String(r.contentUrl || r.url || '').toLowerCase().replace(/\/+$/, '').replace(/^https?:\/\/(www\.)?/, '');
}

// ---------------------------------------------------------------- reading

function listAll_() {
  const records = readObjects_(sheet_('Records', RECORD_COLUMNS), RECORD_COLUMNS).map(cleanRecord_);
  const brands = readObjects_(sheet_('Brands', BRAND_COLUMNS), BRAND_COLUMNS).map(function (b) {
    return {
      name: String(b.name),
      logo: String(b.logo || ''),
      color: String(b.color || ''),
      niches: String(b.niches || '').split(',').map(function (s) { return s.trim(); }).filter(String),
      updatedAt: Number(b.updatedAt) || 0
    };
  }).filter(function (b) { return b.name; });
  return {
    records: records,
    brands: brands,
    festive: getFestive_(),
    sheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl(),
    serverTime: Date.now()
  };
}

// ---------------------------------------------------------------- records

function upsertRecord_(rec) {
  const sh = sheet_('Records', RECORD_COLUMNS);
  const rows = readObjects_(sh, RECORD_COLUMNS);
  const now = Date.now();
  const k = keyOf_(rec);
  const existing = k ? rows.filter(function (r) { return keyOf_(r) === k; })[0] : null;

  rec.thumb = storeImage_(rec.thumb, 'thumb');
  rec.avatar = storeImage_(rec.avatar, 'avatar');

  let out;
  if (existing) {
    const merged = cleanRecord_(existing);
    Object.keys(rec).forEach(function (f) {
      const v = rec[f];
      // A re-save only fills in or refreshes values; it never blanks what a teammate already added
      const empty = v === undefined || v === null || v === '' || v === '--' || v === 0 || (Array.isArray(v) && !v.length);
      if (!empty) merged[f] = v;
    });
    merged.id = existing.id;
    merged.savedAt = Number(existing.savedAt) || now;
    merged.date = existing.date;
    merged.savedBy = existing.savedBy || rec.savedBy || '';
    merged.updatedAt = now;
    sh.getRange(existing._row, 1, 1, RECORD_COLUMNS.length).setValues([toRow_(merged, RECORD_COLUMNS)]);
    out = { record: cleanRecord_(merged), updated: true };
  } else {
    rec.id = rec.id || Utilities.getUuid();
    rec.savedAt = Number(rec.savedAt) || now;
    rec.date = rec.date || Utilities.formatDate(new Date(rec.savedAt), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    rec.updatedAt = now;
    sh.appendRow(toRow_(rec, RECORD_COLUMNS));
    out = { record: cleanRecord_(rec), updated: false };
  }
  if (out.record.brand) ensureBrand_(out.record.brand, out.record.niche);
  return out;
}

function findRow_(sh, id) {
  const rows = readObjects_(sh, RECORD_COLUMNS);
  return rows.filter(function (r) { return String(r.id) === String(id); })[0] || null;
}

function updateRecord_(id, patch) {
  const sh = sheet_('Records', RECORD_COLUMNS);
  const row = findRow_(sh, id);
  if (!row) throw new Error('Row not found. Someone may have deleted it.');
  const merged = cleanRecord_(row);
  Object.keys(patch).forEach(function (f) {
    if (f === 'id' || f === 'savedAt' || f === 'savedBy') return;
    merged[f] = (f === 'thumb' || f === 'avatar') ? storeImage_(patch[f], f) : patch[f];
  });
  merged.updatedAt = Date.now();
  sh.getRange(row._row, 1, 1, RECORD_COLUMNS.length).setValues([toRow_(merged, RECORD_COLUMNS)]);
  if (merged.brand) ensureBrand_(merged.brand, merged.niche);
  return cleanRecord_(merged);
}

function deleteRecord_(id) {
  const sh = sheet_('Records', RECORD_COLUMNS);
  const row = findRow_(sh, id);
  if (row) sh.deleteRow(row._row);
}

// ---------------------------------------------------------------- brands

function ensureBrand_(name, niche) {
  const sh = sheet_('Brands', BRAND_COLUMNS);
  const rows = readObjects_(sh, BRAND_COLUMNS);
  const b = rows.filter(function (r) { return String(r.name).toLowerCase() === String(name).toLowerCase(); })[0];
  if (!b) {
    sh.appendRow(toRow_({ name: name, logo: '', color: '', niches: niche ? [niche] : [], updatedAt: Date.now() }, BRAND_COLUMNS));
    return;
  }
  const niches = String(b.niches || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  if (niche && niches.indexOf(niche) === -1) {
    niches.push(niche);
    b.niches = niches;
    b.updatedAt = Date.now();
    sh.getRange(b._row, 1, 1, BRAND_COLUMNS.length).setValues([toRow_(b, BRAND_COLUMNS)]);
  }
}

function saveBrand_(name, patch) {
  if (!name) throw new Error('Brand name is missing');
  ensureBrand_(name, '');
  const sh = sheet_('Brands', BRAND_COLUMNS);
  const b = readObjects_(sh, BRAND_COLUMNS).filter(function (r) { return String(r.name).toLowerCase() === String(name).toLowerCase(); })[0];
  if (patch.logo !== undefined) b.logo = patch.logo ? storeImage_(patch.logo, 'logo') : '';
  if (patch.color !== undefined) b.color = patch.color;
  if (patch.niches !== undefined) b.niches = patch.niches;
  b.updatedAt = Date.now();
  sh.getRange(b._row, 1, 1, BRAND_COLUMNS.length).setValues([toRow_(b, BRAND_COLUMNS)]);
  return { name: String(b.name), logo: String(b.logo || ''), color: String(b.color || ''), niches: String(b.niches || '').split(',').map(function (s) { return s.trim(); }).filter(String) };
}

function renameBrand_(from, to) {
  if (!from || !to) throw new Error('Both names are needed');
  const rs = sheet_('Records', RECORD_COLUMNS);
  const brandCol = RECORD_COLUMNS.map(function (c) { return c[0]; }).indexOf('brand') + 1;
  readObjects_(rs, RECORD_COLUMNS).forEach(function (r) {
    if (String(r.brand) === from) rs.getRange(r._row, brandCol, 1, 1).setValues([[to]]);
  });
  const bs = sheet_('Brands', BRAND_COLUMNS);
  const rows = readObjects_(bs, BRAND_COLUMNS);
  const old = rows.filter(function (r) { return String(r.name) === from; })[0];
  const clash = rows.filter(function (r) { return String(r.name) === to; })[0];
  if (old && clash) {
    const niches = String(clash.niches || '').split(',').concat(String(old.niches || '').split(','))
      .map(function (s) { return s.trim(); }).filter(String);
    clash.niches = niches.filter(function (n, i) { return niches.indexOf(n) === i; });
    clash.logo = clash.logo || old.logo;
    clash.color = clash.color || old.color;
    bs.getRange(clash._row, 1, 1, BRAND_COLUMNS.length).setValues([toRow_(clash, BRAND_COLUMNS)]);
    bs.deleteRow(old._row);
  } else if (old) {
    old.name = to;
    old.updatedAt = Date.now();
    bs.getRange(old._row, 1, 1, BRAND_COLUMNS.length).setValues([toRow_(old, BRAND_COLUMNS)]);
  }
}

// Deletes a brand and everything filed under it (the Make.com master database is separate and untouched)
function deleteBrand_(name) {
  if (!name) throw new Error('Brand name is missing');
  const rs = sheet_('Records', RECORD_COLUMNS);
  const rows = readObjects_(rs, RECORD_COLUMNS).filter(function (r) { return String(r.brand) === String(name); });
  // bottom-up so row numbers stay valid while deleting
  rows.sort(function (a, b) { return b._row - a._row; }).forEach(function (r) { rs.deleteRow(r._row); });
  const bs = sheet_('Brands', BRAND_COLUMNS);
  const b = readObjects_(bs, BRAND_COLUMNS).filter(function (r) { return String(r.name) === String(name); })[0];
  if (b) bs.deleteRow(b._row);
  return rows.length;
}

// ---------------------------------------------------------------- festive tags

function getFestive_() {
  const sh = sheet_('Settings', [['key', 'Key'], ['value', 'Value']]);
  const row = readObjects_(sh, [['key', 'Key'], ['value', 'Value']]).filter(function (r) { return r.key === 'festive'; })[0];
  if (!row || !row.value) return null;
  try { return JSON.parse(row.value); } catch (e) { return null; }
}

function saveFestive_(list) {
  const cols = [['key', 'Key'], ['value', 'Value']];
  const sh = sheet_('Settings', cols);
  const row = readObjects_(sh, cols).filter(function (r) { return r.key === 'festive'; })[0];
  const value = JSON.stringify(list);
  if (row) sh.getRange(row._row, 2, 1, 1).setValues([[value]]);
  else sh.appendRow(['festive', value]);
  return list;
}

// ---------------------------------------------------------------- images

// Saves a data: URL image to Drive and returns a link anyone on the team can load.
// If Drive sharing is blocked by your Google Workspace, small images are kept in the cell instead.
function storeImage_(value, label) {
  const s = String(value || '');
  const m = s.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  if (!m) return s;
  try {
    const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], label + '-' + Date.now());
    const file = imageFolder_().createFile(blob);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      file.setTrashed(true);
      throw shareErr;
    }
    return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w800';
  } catch (err) {
    return s.length < 48000 ? s : '';
  }
}

function imageFolder_() {
  const it = DriveApp.getFoldersByName(IMAGE_FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(IMAGE_FOLDER_NAME);
}

// Run this once from the editor (select "setup" and press Run) to create the tabs and grant Drive access.
function setup() {
  sheet_('Records', RECORD_COLUMNS);
  sheet_('Brands', BRAND_COLUMNS);
  sheet_('Settings', [['key', 'Key'], ['value', 'Value']]);
  imageFolder_();
}
