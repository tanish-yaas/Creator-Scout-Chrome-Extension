// ==========================================
// Creator Scout — updates from GitHub
// Checks manifest.json in the GitHub repo for a newer version. When there is one, it downloads the
// repo zip and writes it over the folder this extension was loaded from (the person picks that folder
// once and allows editing), then restarts the extension. Same folder = same extension = data kept.
// With "Allow on every visit" granted, updates install by themselves when the moodboard or sheet opens.
// ==========================================

const UPDATE_KEY = 'scoutUpdate';
const UPDATE_EVERY = 15 * 60 * 1000;   // look at GitHub at most every 15 minutes

const chromeGet = keys => new Promise(r => chrome.storage.local.get(keys, r));
const chromeSet = obj => new Promise(r => chrome.storage.local.set(obj, r));
const chromeRemove = keys => new Promise(r => chrome.storage.local.remove(keys, r));

function updateUrls() {
  // Falls back to the team repo, so an older config.js without these lines still gets updates
  const repo = (typeof UPDATE_REPO !== 'undefined' && UPDATE_REPO) || 'tanish-yaas/Creator-Scout-Chrome-Extension';
  const branch = (typeof UPDATE_BRANCH !== 'undefined' && UPDATE_BRANCH) || 'main';
  return {
    repo,
    // GitHub's API answers with the newest file straight away; raw.githubusercontent.com can lag ~5 minutes
    manifestApi: `https://api.github.com/repos/${repo}/contents/manifest.json?ref=${branch}`,
    manifest: `https://raw.githubusercontent.com/${repo}/${branch}/manifest.json`,
    head: `https://api.github.com/repos/${repo}/commits/${branch}`,
    zipAt: sha => `https://codeload.github.com/${repo}/zip/${sha}`,
    zip: `https://codeload.github.com/${repo}/zip/refs/heads/${branch}`,
    commits: `https://api.github.com/repos/${repo}/commits?sha=${branch}&per_page=8`,
    page: `https://github.com/${repo}`
  };
}

// "4.10" is newer than "4.9"
function newerVersion(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

async function checkForUpdate(force = false) {
  const current = chrome.runtime.getManifest().version;
  const urls = updateUrls();
  if (!urls.repo) return { current, latest: current, available: false };
  const saved = (await chromeGet([UPDATE_KEY]))[UPDATE_KEY] || {};
  if (!force && saved.checkedAt && Date.now() - saved.checkedAt < UPDATE_EVERY && saved.latest) {
    return { current, latest: saved.latest, available: newerVersion(saved.latest, current) };
  }
  try {
    let m = null;
    try {
      const api = await fetch(urls.manifestApi, { cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/vnd.github.raw+json' } });
      if (api.ok) m = await api.json();
    } catch (e) { /* fall back to the raw file */ }
    if (!m) {
      const res = await fetch(urls.manifest + '?t=' + Date.now(), { cache: 'no-store', credentials: 'omit' });
      if (!res.ok) throw new Error('GitHub answered ' + res.status);
      m = await res.json();
    }
    const latest = String(m.version || current);
    await chromeSet({ [UPDATE_KEY]: { checkedAt: Date.now(), latest } });
    return { current, latest, available: newerVersion(latest, current) };
  } catch (e) {
    return { current, latest: saved.latest || current, available: saved.latest ? newerVersion(saved.latest, current) : false, error: e.message };
  }
}

function openUpdatePage() {
  chrome.tabs.create({ url: chrome.runtime.getURL('update.html') });
}

// Shown once after an update finishes
async function takeJustUpdated() {
  const u = (await chromeGet(['scoutJustUpdated'])).scoutJustUpdated;
  if (!u || u.to !== chrome.runtime.getManifest().version) return null;
  await chromeRemove('scoutJustUpdated');
  return u;
}

// Automatic updates are on unless someone turns them off on the update page
async function autoUpdateOn() {
  return (await chromeGet(['scoutAutoUpdate'])).scoutAutoUpdate !== false;
}

// ---------- the remembered folder (folder handles can live in IndexedDB) ----------

function updaterDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('scout-updater', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function savedFolder() {
  try {
    const db = await updaterDb();
    return await new Promise(res => { const t = db.transaction('kv').objectStore('kv').get('folder'); t.onsuccess = () => res(t.result || null); t.onerror = () => res(null); });
  } catch (e) { return null; }
}
async function rememberFolder(dir) {
  const db = await updaterDb();
  await new Promise(res => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(dir, 'folder'); t.oncomplete = res; t.onerror = res; });
}
// 'granted' means the update can install with no clicks
async function folderAccess(dir) {
  try { return dir ? await dir.queryPermission({ mode: 'readwrite' }) : 'none'; } catch (e) { return 'none'; }
}

// ---------- reading GitHub's zip without a library ----------

async function unzip(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('The download isn\'t a valid zip file.');
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const files = [];
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(off, true) !== 0x02014b50) throw new Error('The zip file looks damaged.');
    const method = dv.getUint16(off + 10, true);
    const csize = dv.getUint32(off + 20, true);
    const nlen = dv.getUint16(off + 28, true), xlen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nlen));
    off += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    const comp = u8.subarray(start, start + csize);
    let data;
    if (method === 0) data = comp.slice();
    else if (method === 8) data = new Uint8Array(await new Response(new Blob([comp]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else throw new Error('The zip uses a compression this updater can\'t read.');
    files.push({ name, data });
  }
  return files;
}

// GitHub wraps everything in "<Repo>-<branch>/"; drop that and anything hidden (.git, .github…)
function extensionFiles(files) {
  return files.map(f => ({ path: f.name.split('/').slice(1), data: f.data }))
    .filter(f => f.path.length && f.path.every(p => p && !p.startsWith('.') && p !== '..'));
}

async function readFolderText(dir, path) {
  let d = dir;
  for (const seg of path.slice(0, -1)) d = await d.getDirectoryHandle(seg);
  return (await (await d.getFileHandle(path[path.length - 1])).getFile()).text();
}

async function writeFolderFile(dir, path, data) {
  let d = dir;
  for (const seg of path.slice(0, -1)) d = await d.getDirectoryHandle(seg, { create: true });
  const w = await (await d.getFileHandle(path[path.length - 1], { create: true })).createWritable();
  await w.write(data);
  await w.close();
}

// Makes sure a folder is the copy of Creator Scout that's actually running
async function checkFolder(dir) {
  const running = chrome.runtime.getManifest();
  let m;
  try { m = JSON.parse(await readFolderText(dir, ['manifest.json'])); }
  catch (e) { throw new Error(`“${dir.name}” isn't a Creator Scout folder (there's no manifest.json in it). Pick the folder you loaded in chrome://extensions.`); }
  if (m.name !== running.name) throw new Error(`“${dir.name}” holds a different extension (${m.name}). Pick your Creator Scout folder.`);
  if (m.version !== running.version) {
    throw new Error(`“${dir.name}” has Creator Scout ${m.version}, but the one running is ${running.version}, so it's a different copy. Open chrome://extensions, check where Creator Scout is loaded from, and pick that folder.`);
  }
}

// Download, check and write the newest version into the folder. Returns the new version.
async function installUpdate(dir, step = () => {}) {
  const running = chrome.runtime.getManifest();
  step('Checking your Creator Scout folder');
  await checkFolder(dir);

  step('Downloading the new version from GitHub');
  // Download the exact latest commit, so a cached copy of the branch can't hand over an older version
  const urls = updateUrls();
  let zipUrl = urls.zip + '?t=' + Date.now();
  try {
    const h = await fetch(urls.head, { cache: 'no-store', credentials: 'omit' });
    if (h.ok) { const c = await h.json(); if (c && c.sha) zipUrl = urls.zipAt(c.sha); }
  } catch (e) { /* use the branch download */ }
  const res = await fetch(zipUrl, { cache: 'no-store', credentials: 'omit' });
  if (!res.ok) throw new Error('GitHub didn\'t send the update (' + res.status + '). Check your connection and try again.');
  const files = extensionFiles(await unzip(await res.arrayBuffer()));

  step('Checking the new version');
  const mf = files.find(f => f.path.join('/') === 'manifest.json');
  if (!mf) throw new Error('The download has no manifest.json, so nothing was changed.');
  const next = JSON.parse(new TextDecoder().decode(mf.data));
  if (next.name !== running.name) throw new Error('The download is a different extension, so nothing was changed.');
  if (!newerVersion(next.version, running.version)) throw new Error(`The download is ${next.version}, which isn't newer than ${running.version}. Nothing to install.`);

  // Never swap working team settings for blank ones
  const cfg = files.find(f => f.path.join('/') === 'config.js');
  if (cfg && /const TEAM_DB_URL = '';/.test(new TextDecoder().decode(cfg.data)) && typeof TEAM_DB_URL !== 'undefined' && TEAM_DB_URL) {
    files.splice(files.indexOf(cfg), 1);
  }

  step(`Installing ${files.length} files`);
  // manifest.json goes last, so a half-finished install never claims to be the new version
  for (const f of files) if (f !== mf) await writeFolderFile(dir, f.path, f.data);
  await writeFolderFile(dir, mf.path, mf.data);
  return next.version;
}

// Restart on the new files and bring back the Creator Scout tabs that were open
async function restartOnNewVersion(from, to) {
  let urls = [];
  try {
    const ctx = await chrome.runtime.getContexts({ contextTypes: ['TAB'] });
    urls = ctx.map(c => c.documentUrl).filter(u => u && !u.includes('/update.html'));
  } catch (e) {
    if (typeof location !== 'undefined' && !location.pathname.endsWith('update.html')) urls = [location.href];
  }
  if (!urls.length) urls.push(chrome.runtime.getURL('moodboard.html'));
  await chromeSet({ scoutJustUpdated: { from, to, at: Date.now() }, scoutReopen: { urls: [...new Set(urls)], at: Date.now() } });
  await chromeRemove(UPDATE_KEY);
  chrome.runtime.reload();
}

// Used by the moodboard and the sheet. Installs straight away when the folder is already allowed;
// otherwise returns the update so the page can show its button. onStart(version) runs before installing.
let autoUpdating = false;
async function autoUpdate({ force = false, onStart } = {}) {
  const u = await checkForUpdate(force);
  if (!u.available || autoUpdating || !(await autoUpdateOn())) return u;
  const dir = await savedFolder();
  if ((await folderAccess(dir)) !== 'granted') return u;
  autoUpdating = true;
  try {
    if (onStart) await onStart(u.latest);
    const to = await installUpdate(dir);
    await restartOnNewVersion(u.current, to);
    return { ...u, installing: true };
  } catch (e) {
    autoUpdating = false;
    return { ...u, autoError: e.message };
  }
}
