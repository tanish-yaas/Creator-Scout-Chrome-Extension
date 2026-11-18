// Creator Scout popup. Settings (master webhook, YouTube key, team database) live in config.js.

const $ = id => document.getElementById(id);

const fetchBtn = $('fetch-btn');
const sendBtn = $('send-btn');
const statusMsg = $('status-msg');
const statusDot = $('status-dot');
const typeSelect = $('creator-type');
const customTypeInput = $('custom-type');
const brandInput = $('mb-brand');
const nicheInput = $('mb-niche');
const toggleIg = $('toggle-ig');
const toggleYt = $('toggle-yt');
const igOnlyRows = document.querySelectorAll('.ig-only');
const ytOnlyRows = document.querySelectorAll('.yt-only');

let currentPlatform = 'Instagram';
let current = null;          // { creator, content } from the last fetch
let taxonomy = { brands: {}, festive: [] };
let selectedFestive = [];
let festiveExpanded = false;
const FESTIVE_VISIBLE = 4;

// ---------- status ----------

function showStatus(text, className = '') {
  statusMsg.innerText = text;
  statusMsg.title = text;
  statusMsg.className = className;
}
function setDot(state) {
  statusDot.className = 'brand-dot' + (state ? ' dot-' + state : '');
}
function fail(text) {
  if (!current) {
    const box = $('preview-empty');
    box.classList.remove('hidden');
    box.innerHTML = `<p class="pixel">Couldn't fetch this page</p><p></p>`;
    box.lastElementChild.textContent = text;
  }
  showStatus(text, 'error-text');
  setDot('');
}

$('open-moodboard').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('moodboard.html') });
});
$('open-sheet').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('sheet.html') });
});

// ---------- platform ----------

function setPlatform(platform) {
  currentPlatform = platform;
  chrome.storage.sync.set({ savedPlatform: platform });
  const ig = platform === 'Instagram';
  toggleIg.classList.toggle('active', ig);
  toggleYt.classList.toggle('active', !ig);
  $('label-followers').innerText = ig ? 'Followers' : 'Subscribers';
  igOnlyRows.forEach(el => el.classList.toggle('hidden', !ig));
  ytOnlyRows.forEach(el => el.classList.toggle('hidden', ig));
}
toggleIg.addEventListener('click', () => setPlatform('Instagram'));
toggleYt.addEventListener('click', () => setPlatform('YouTube'));

// ---------- init ----------

async function init() {
  chrome.storage.sync.get(['savedType', 'savedCustomType', 'savedIp', 'savedPlatform', 'savedBrand', 'savedNiche', 'savedFestive', 'savedBy'], (r) => {
    if (r.savedPlatform) setPlatform(r.savedPlatform);
    brandInput.value = r.savedBrand || r.savedIp || '';
    savedBy = r.savedBy || '';
    renderWho();
    if (r.savedNiche) nicheInput.value = r.savedNiche;
    if (r.savedFestive) selectedFestive = r.savedFestive;
    if (r.savedType) {
      typeSelect.value = r.savedType;
      if (r.savedType === 'Others') {
        customTypeInput.classList.remove('hidden');
        if (r.savedCustomType) customTypeInput.value = r.savedCustomType;
      }
    }
    renderFestiveChips();
  });

  taxonomy = await getTaxonomy();
  renderFestiveChips();
  updateSavedCount();
  renderTeamState();

  // Refresh brands and counts from the team board in the background
  pullTeam().then(async () => {
    taxonomy = await getTaxonomy();
    renderFestiveChips();
    updateSavedCount();
    renderTeamState();
  });

  // Capture the page straight away when the popup opens on Instagram or YouTube
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && /instagram\.com|youtube\.com|youtu\.be/.test(tab.url)) fetchBtn.click();
}

// ---------- who is saving ----------

let savedBy = '';
function renderWho() {
  $('who-btn').innerText = savedBy ? `as ${savedBy}` : 'Add your name';
}
$('who-btn').addEventListener('click', () => {
  $('who-form').classList.remove('hidden');
  $('who-input').value = savedBy;
  $('who-input').focus();
});
$('who-form').addEventListener('submit', (e) => {
  e.preventDefault();
  savedBy = $('who-input').value.trim();
  chrome.storage.sync.set({ savedBy });
  $('who-form').classList.add('hidden');
  renderWho();
});

async function renderTeamState() {
  const el = $('team-state');
  if (!teamOn()) { el.innerText = 'This browser only'; el.className = 'team-state'; return; }
  const info = await getTeamInfo();
  el.innerText = info.error ? 'Team offline' : 'Team live';
  el.className = 'team-state ' + (info.error ? 'off' : 'on');
  el.title = info.error || '';
}

// ---------- type / IP ----------

typeSelect.addEventListener('change', () => {
  chrome.storage.sync.set({ savedType: typeSelect.value });
  customTypeInput.classList.toggle('hidden', typeSelect.value !== 'Others');
});
customTypeInput.addEventListener('input', () => {
  chrome.storage.sync.set({ savedCustomType: customTypeInput.value });
});


// Generic dropdown autocomplete used for IP, Brand and Niche
function attachAutocomplete(input, dropdown, getOptions, onPick) {
  const render = () => {
    const val = input.value.trim().toLowerCase();
    const opts = getOptions().filter(o => o.toLowerCase().includes(val) && o.toLowerCase() !== val);
    dropdown.innerHTML = '';
    if (!opts.length) { dropdown.classList.add('hidden'); return; }
    opts.forEach(o => {
      const li = document.createElement('li');
      li.innerText = o;
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = o;
        dropdown.classList.add('hidden');
        onPick(o);
      });
      dropdown.appendChild(li);
    });
    dropdown.classList.remove('hidden');
  };
  input.addEventListener('focus', render);
  input.addEventListener('input', () => { onPick(input.value.trim(), true); render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); dropdown.classList.add('hidden'); input.blur(); }
  });
  input.addEventListener('blur', () => { dropdown.classList.add('hidden'); onPick(input.value.trim()); });
}

attachAutocomplete(brandInput, $('brand-dropdown'), () => Object.keys(taxonomy.brands).sort(), (v) => {
  chrome.storage.sync.set({ savedBrand: v });
});
attachAutocomplete(nicheInput, $('niche-dropdown'), () => {
  const b = Object.keys(taxonomy.brands).find(k => k.toLowerCase() === brandInput.value.trim().toLowerCase());
  return b ? taxonomy.brands[b] : [...new Set(Object.values(taxonomy.brands).flat())].sort();
}, (v) => {
  chrome.storage.sync.set({ savedNiche: v });
});

// ---------- festive chips ----------

function renderFestiveChips() {
  const row = $('festive-chips');
  row.innerHTML = '';
  // Selected tags first, then the rest; collapse to a short row so the popup stays compact
  const ordered = [
    ...taxonomy.festive.filter(f => selectedFestive.includes(f.name)),
    ...taxonomy.festive.filter(f => !selectedFestive.includes(f.name))
  ];
  const limit = Math.max(FESTIVE_VISIBLE, selectedFestive.length);
  const shown = festiveExpanded ? ordered : ordered.slice(0, limit);
  shown.forEach(f => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (selectedFestive.includes(f.name) ? ' on' : '');
    b.style.setProperty('--chip', f.color);
    b.innerText = `${f.emoji} ${f.name}`;
    b.addEventListener('click', () => {
      selectedFestive = selectedFestive.includes(f.name)
        ? selectedFestive.filter(x => x !== f.name)
        : [...selectedFestive, f.name];
      chrome.storage.sync.set({ savedFestive: selectedFestive });
      renderFestiveChips();
    });
    row.appendChild(b);
  });
  if (ordered.length > shown.length || festiveExpanded) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'chip more';
    more.innerText = festiveExpanded ? 'Show less' : `+${ordered.length - shown.length} more`;
    more.addEventListener('click', () => { festiveExpanded = !festiveExpanded; renderFestiveChips(); });
    row.appendChild(more);
  }
  // Add a custom tag inline
  const add = document.createElement('input');
  add.type = 'text';
  add.className = 'chip-input';
  add.placeholder = '+ tag';
  add.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const name = add.value.trim();
    if (!name) return;
    taxonomy = await registerTaxonomy({ festive: [name] });
    if (teamOn()) saveFestiveList(taxonomy.festive).catch(() => {});
    const canon = taxonomy.festive.find(x => x.name.toLowerCase() === name.toLowerCase()).name;
    if (!selectedFestive.includes(canon)) selectedFestive.push(canon);
    chrome.storage.sync.set({ savedFestive: selectedFestive });
    renderFestiveChips();
  });
  row.appendChild(add);
}

// ---------- YouTube ----------

async function handleYouTubeFetch(tab) {
  if (!YOUTUBE_API_KEY) return fail('Add a YouTube API key to fetch channels.');
  if (!/youtube\.com|youtu\.be/.test(tab.url)) return fail('Open a YouTube channel, short or video first.');

  const parsed = parseYouTubeUrl(tab.url);
  let content = null;
  let channelRef = parsed;

  if (parsed.videoId) {
    const dv = await yt(`videos?part=snippet,statistics&id=${parsed.videoId}`);
    if (!dv.items || !dv.items.length) return fail('Couldn\'t find this video. Check it is public.');
    const v = dv.items[0];
    const th = v.snippet.thumbnails || {};
    const isShort = parsed.kind === 'short';
    content = {
      kind: isShort ? 'short' : 'video',
      url: isShort ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`,
      thumbUrl: (th.maxres || th.standard || th.high || th.medium || th.default || {}).url || '',
      caption: v.snippet.title,
      views: parseInt(v.statistics.viewCount) || 0,
      likes: parseInt(v.statistics.likeCount) || 0,
      comments: parseInt(v.statistics.commentCount) || 0,
      postedAt: (v.snippet.publishedAt || '').slice(0, 10)
    };
    channelRef = { channelId: v.snippet.channelId };
  } else if (!parsed.handle && !parsed.channelId && !parsed.legacyUser) {
    return fail('Open a channel (/@handle) or a video. Old /c/ links aren\'t supported.');
  }

  const creator = await fetchChannel(channelRef);
  if (!creator) return fail('Channel not found.');
  return { creator, content };
}

// ---------- Instagram ----------

async function handleInstagramFetch(tab) {
  if (!tab.url.includes('instagram.com')) return fail('Open an Instagram profile, reel or post first.');
  if (/instagram\.com\/?(\?|#|$)/.test(tab.url) || /instagram\.com\/(explore|direct|accounts)\b/.test(tab.url)) {
    return fail('Open a creator\'s profile, a reel or a post. The home feed, Explore and DMs don\'t point to one creator.');
  }
  let res;
  try {
    const run = chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scoutScrapeInstagram });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 20000));
    const [inj] = await Promise.race([run, timeout]);
    res = inj && inj.result;
  } catch (e) {
    const msg = String(e && e.message || e);
    if (msg === 'timeout') return fail('Instagram took too long to answer. Refresh the Instagram tab and try again.');
    if (/permission|Cannot access|host/i.test(msg)) {
      return fail('Chrome is blocking Creator Scout on Instagram. Right-click the extension icon, choose "This can read and change site data", pick "On all sites", then refresh Instagram.');
    }
    if (/Frame|tab was closed|No tab/i.test(msg)) return fail('The Instagram tab changed while reading it. Try again.');
    return fail('Couldn\'t read the page (' + msg + '). Refresh Instagram and try again.');
  }
  if (!res || !res.creator || !res.creator.username) return fail('Couldn\'t find a creator on this page. Open their profile, a reel or a post.');

  let followers = parseCount(res.creator.followers);
  let category = res.creator.category || '--';
  let name = res.creator.name || res.creator.username;
  // Reel pages don't show follower counts reliably, so reuse what we saved earlier for this creator
  if (!followers || category === '--') {
    const known = await findCreator('Instagram', res.creator.username);
    if (known) {
      followers = followers || known.followers;
      if (category === '--' && known.category) category = known.category;
      if (name === res.creator.username && known.name) name = known.name;
    }
  }

  const creator = {
    platform: 'Instagram',
    username: res.creator.username,
    name,
    followers,
    category,
    url: res.creator.url,
    avatarUrl: res.creator.avatarUrl || '',
    avgViews: '--',
    country: '--'
  };
  let content = null;
  if (res.content) {
    content = {
      kind: res.content.kind,
      url: res.content.url,
      thumbUrl: res.content.thumbUrl,
      caption: res.content.caption,
      views: 0,
      likes: parseCount(res.content.likes),
      comments: parseCount(res.content.comments),
      postedAt: res.content.postedAt
    };
  }
  return { creator, content };
}

// ---------- preview ----------

function updateUI({ creator, content }) {
  const tier = calculateTier(creator.followers);
  $('preview-empty').classList.add('hidden');
  $('preview').classList.remove('hidden');
  const handle = String(creator.username || '--').replace(/^@/, '');
  $('prev-handle').innerText = (creator.platform === 'Instagram' ? '@' : '') + handle;
  $('prev-name').innerText = creator.name && creator.name !== creator.username ? creator.name : '';
  $('prev-followers').innerText = formatCount(creator.followers);
  $('prev-category').innerText = creator.category || '--';
  $('prev-views').innerText = formatCount(creator.avgViews);
  const tierEl = $('prev-tier');
  tierEl.innerText = tier.name;
  tierEl.className = 'tier ' + tier.class;

  const box = $('content-preview');
  if (content) {
    box.classList.remove('hidden');
    $('prev-thumb').src = content.thumb || content.thumbUrl || '';
    $('prev-content-kind').innerText = { reel: 'Reel', post: 'Post', short: 'Short', video: 'Video' }[content.kind] || 'Content';
    $('prev-caption').innerText = content.caption || 'No caption';
    const bits = [];
    if (content.views) bits.push(formatCount(content.views) + ' views');
    if (content.likes) bits.push(formatCount(content.likes) + ' likes');
    if (content.postedAt) bits.push(content.postedAt);
    $('prev-content-stats').innerText = bits.join('  ·  ');
    sendBtn.innerText = 'Save to moodboard';
  } else {
    box.classList.add('hidden');
    sendBtn.innerText = 'Save creator';
  }
  $('moodboard-fields').classList.remove('hidden');
}

let fetching = false;
fetchBtn.addEventListener('click', async () => {
  if (fetching) return;
  fetching = true;
  fetchBtn.disabled = true;
  fetchBtn.textContent = 'Fetching…';
  try { await doFetch(); } finally {
    fetching = false;
    fetchBtn.disabled = false;
    fetchBtn.textContent = 'Fetch page';
  }
});

async function doFetch() {
  showStatus('Reading this page…');
  setDot('yellow');
  if (!current) {
    $('preview-empty').classList.remove('hidden');
    $('preview-empty').innerHTML = '<p class="pixel">Reading this page…</p><p>Getting the reel, the creator and their stats.</p>';
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return fail('No open tab to read.');

  // Follow the tab: switch platform automatically
  if (/youtube\.com|youtu\.be/.test(tab.url)) setPlatform('YouTube');
  else if (tab.url.includes('instagram.com')) setPlatform('Instagram');

  try {
    const result = currentPlatform === 'YouTube' ? await handleYouTubeFetch(tab) : await handleInstagramFetch(tab);
    if (!result) return;
    current = result;
    updateUI(current);
    showStatus(current.content ? 'Content fetched. Tag it and save.' : 'Profile fetched.', 'success-text');
    setDot('');

    // Save a permanent copy of the thumbnail in the background
    if (current.content && current.content.thumbUrl) {
      const ref = current;
      thumbToDataUrl(current.content.thumbUrl).then(d => {
        if (current === ref) { ref.content.thumb = d; $('prev-thumb').src = d; }
      });
    }
  } catch (e) {
    fail('Fetch failed (' + (e && e.message || 'unknown error') + '). Check your connection and try again.');
  }
}

// ---------- save ----------

sendBtn.addEventListener('click', async () => {
  if (!current) return fail('Fetch a page first.');
  const { creator, content } = current;
  const type = typeSelect.value === 'Others' ? customTypeInput.value.trim() : typeSelect.value;

  const brand = brandInput.value.trim();
  const niche = nicheInput.value.trim();

  // Make sure permanent copies of the thumbnail / profile picture are ready before saving
  sendBtn.innerText = 'Saving...';
  if (content && !content.thumb && content.thumbUrl) content.thumb = await thumbToDataUrl(content.thumbUrl);
  if (creator.avatarUrl && !creator.avatar) creator.avatar = await thumbToDataUrl(creator.avatarUrl, 240);

  const record = {
    platform: creator.platform,
    username: creator.username,
    name: creator.name,
    followers: creator.followers || 0,
    category: creator.category || '--',
    tier: calculateTier(creator.followers).name,
    type,
    url: creator.url,
    avgViews: creator.avgViews || '--',
    country: creator.country || '--',
    contentUrl: content ? content.url : '',
    contentKind: content ? content.kind : '',
    thumb: content ? (content.thumb || content.thumbUrl || '') : (creator.avatar || ''),
    thumbUrl: content ? content.thumbUrl : (creator.avatarUrl || ''),
    avatar: creator.avatar || '',
    caption: content ? content.caption : '',
    contentViews: content ? content.views : 0,
    contentLikes: content ? content.likes : 0,
    contentComments: content ? content.comments : 0,
    postedAt: content ? content.postedAt : '',
    brand,
    niche,
    festive: selectedFestive.slice(),
    savedBy
  };

  sendBtn.innerText = 'Saving...';
  try {
    const { record: saved, updated, offline } = await upsertRecord(record);
    taxonomy = await getTaxonomy();

    // Master database (Make.com) — same webhook and fields as before
    sendToMaster(saved);

    showStatus(offline ? 'Saved on this browser. It uploads to the team board once it can connect.'
      : updated ? 'Already saved, so the row was updated.'
      : brand ? `Saved to ${brand} on the moodboard and the sheet.` : 'Saved to the sheet and the moodboard.', 'success-text');
    renderTeamState();
    setDot('green');
    updateSavedCount();
  } catch (e) {
    fail('Couldn\'t save. ' + (e.message || ''));
  } finally {
    sendBtn.innerText = content ? 'Save to moodboard' : 'Save creator';
  }
});

// ---------- sheet count ----------

async function updateSavedCount() {
  const records = await getRecords();
  const fresh = records.filter(r => !r.exportedAt).length;
  const el = $('sheet-count');
  el.innerText = `${records.length} ${records.length === 1 ? 'creator' : 'creators'}${fresh ? `, ${fresh} new` : ''}`;
  el.classList.toggle('has-new', fresh > 0);
}

init();
