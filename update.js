// ==========================================
// Creator Scout — update page
// Pick the Creator Scout folder once, allow editing ("Allow on every visit" makes later updates automatic),
// then the newest version from GitHub is written into it and the extension restarts with your data intact.
// ==========================================

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let info = null;

function step(text) {
  const ol = $('steps');
  ol.classList.remove('hidden');
  const last = ol.lastElementChild;
  if (last && last.dataset.state === 'doing') last.dataset.state = 'done';
  const li = document.createElement('li');
  li.dataset.state = 'doing';
  li.textContent = text;
  ol.appendChild(li);
}
function failWith(msg) {
  const last = $('steps').lastElementChild;
  if (last && last.dataset.state === 'doing') last.dataset.state = 'failed';
  $('error').textContent = msg;
  $('error').classList.remove('hidden');
  $('fallback').classList.remove('hidden');
  $('update-btn').disabled = false;
  $('update-btn').textContent = 'Try again';
}

function folderLine(dir, verb) {
  $('folder-line').innerHTML = dir
    ? `${verb} the folder <b>${esc(dir.name)}</b>. <button class="link" id="change-folder">Use a different folder</button>`
    : '';
}

// Uses the remembered folder, asking Chrome for edit access again if needed; otherwise opens the folder picker.
async function chooseFolder(forcePick) {
  let dir = forcePick ? null : await savedFolder();
  if (dir) {
    let perm = await folderAccess(dir);
    if (perm !== 'granted') {
      try { perm = await dir.requestPermission({ mode: 'readwrite' }); } catch (e) { perm = 'denied'; }
    }
    if (perm !== 'granted') throw new Error('Creator Scout needs permission to edit its folder to install the update. Press Update now and choose Allow (“Allow on every visit” makes future updates automatic).');
    return dir;
  }
  try {
    dir = await window.showDirectoryPicker({ id: 'creator-scout', mode: 'readwrite' });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('No folder picked. Press Update now and choose your Creator Scout folder.');
    throw new Error('Chrome didn\'t allow that folder (' + (e.message || e.name) + '). Move Creator Scout into its own folder, for example Documents/creator-scout, load it from there, and try again.');
  }
  await checkFolder(dir);
  await rememberFolder(dir);
  return dir;
}

async function runUpdate(forcePick = false) {
  $('update-btn').disabled = true;
  $('update-btn').textContent = 'Updating…';
  $('error').classList.add('hidden');
  $('fallback').classList.add('hidden');
  $('steps').innerHTML = '';
  try {
    step('Opening your Creator Scout folder');
    const dir = await chooseFolder(forcePick);
    folderLine(dir, 'Updating');
    $('first-time').classList.add('hidden');
    const to = await installUpdate(dir, step);
    step(`Restarting Creator Scout on ${to}`);
    $('title').textContent = `Updated to ${to}`;
    $('versions').textContent = 'Creator Scout is restarting. Your moodboard opens again in a moment.';
    setTimeout(() => restartOnNewVersion(info.current, to), 700);
  } catch (e) {
    failWith(e.message || String(e));
  }
}

$('update-btn').addEventListener('click', () => (info && info.available ? runUpdate(false) : location.reload()));
document.addEventListener('click', e => { if (e.target.id === 'change-folder') runUpdate(true); });

$('auto-toggle').addEventListener('change', e => chromeSet({ scoutAutoUpdate: e.target.checked }));

async function loadNotes() {
  try {
    const res = await fetch(updateUrls().commits, { credentials: 'omit' });
    if (!res.ok) return;
    const lines = (await res.json()).map(c => String(c.commit && c.commit.message || '').split('\n')[0])
      .filter(l => l && !/^Merge /.test(l));
    if (!lines.length) return;
    $('notes-list').innerHTML = lines.slice(0, 6).map(l => `<li>${esc(l)}</li>`).join('');
    $('notes').classList.remove('hidden');
  } catch (e) { /* notes are optional */ }
}

async function init() {
  $('zip-link').href = updateUrls().zip;
  $('auto-toggle').checked = await autoUpdateOn();
  const dir = await savedFolder();
  const access = await folderAccess(dir);
  $('auto-state').textContent = access === 'granted'
    ? `On. Updates install by themselves when the moodboard or sheet opens.`
    : dir ? 'Waiting for permission. Press Update now once and choose “Allow on every visit”.'
    : 'Starts after your first update here.';

  info = await checkForUpdate(true);
  if (info.error && !info.available) {
    $('title').textContent = 'Couldn\'t check for updates';
    $('versions').textContent = `You're on ${info.current}. ${info.error}.`;
    $('fallback').classList.remove('hidden');
    return;
  }
  if (!info.available) {
    $('title').textContent = 'You\'re up to date';
    $('versions').textContent = `Creator Scout ${info.current} is the latest version. New versions show up here a few minutes after they're pushed to GitHub.`;
    $('actions').classList.remove('hidden');
    $('update-btn').textContent = 'Check again';
    return;
  }
  $('title').textContent = `Update to ${info.latest}`;
  $('versions').textContent = `You're on ${info.current}. Your saved creators, sheet and settings stay as they are.`;
  $('actions').classList.remove('hidden');
  if (dir) folderLine(dir, 'Will update');
  else $('first-time').classList.remove('hidden');
  loadNotes();
  // Opened from an "Update" button with ?go=1: start straight away when no picker is needed
  if (new URLSearchParams(location.search).get('go') === '1' && access === 'granted') runUpdate(false);
}
init();
