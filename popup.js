// ==========================================
// 🏢 CONFIGURATION (master database — unchanged)
// ==========================================
const MASTER_WEBHOOK_URL = "https://hook.eu1.make.com/3lub8lb24862yx9odq1d1avlkronthhu";
const YOUTUBE_API_KEY = "AIzaSyCtq8nF3PxPLS4dNBBX5JsUakBbK5Kyj-8";

const $ = id => document.getElementById(id);

const fetchBtn = $('fetch-btn');
const sendBtn = $('send-btn');
const statusMsg = $('status-msg');
const statusDot = $('status-dot');
const typeSelect = $('creator-type');
const customTypeInput = $('custom-type');
const ipInput = $('creator-ip');
const brandInput = $('mb-brand');
const nicheInput = $('mb-niche');
const toggleIg = $('toggle-ig');
const toggleYt = $('toggle-yt');
const igOnlyRows = document.querySelectorAll('.ig-only');
const ytOnlyRows = document.querySelectorAll('.yt-only');

let currentPlatform = 'Instagram';
let current = null;          // { creator, content } from the last fetch
let savedIpHistory = [];
let taxonomy = { brands: {}, festive: [] };
let selectedFestive = [];
let festiveExpanded = false;
const FESTIVE_VISIBLE = 6;

// ---------- status ----------

function showStatus(text, className = '') {
  statusMsg.innerText = text;
  statusMsg.className = className;
}
function setDot(state) {
  statusDot.className = 'brand-dot' + (state ? ' dot-' + state : '');
}
function fail(text) {
  showStatus(text, 'error-text');
  setDot('');
}

// ---------- view tabs ----------

function showView(name) {
  $('view-scout').classList.toggle('hidden', name !== 'scout');
  $('view-saved').classList.toggle('hidden', name !== 'saved');
  $('tab-scout').classList.toggle('active', name === 'scout');
  $('tab-saved').classList.toggle('active', name === 'saved');
  if (name === 'saved') renderSaved();
}
$('tab-scout').addEventListener('click', () => showView('scout'));
$('tab-saved').addEventListener('click', () => showView('saved'));

$('open-moodboard').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('moodboard.html') });
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
  chrome.storage.sync.get(['savedType', 'savedCustomType', 'savedIp', 'ipHistory', 'savedPlatform', 'savedBrand', 'savedNiche', 'savedFestive'], (r) => {
    if (r.savedIp) ipInput.value = r.savedIp;
    if (r.ipHistory) savedIpHistory = r.ipHistory;
    if (r.savedPlatform) setPlatform(r.savedPlatform);
    if (r.savedBrand) brandInput.value = r.savedBrand;
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

  // Auto-pick the platform from the open tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url) {
    if (tab.url.includes('youtube.com') || tab.url.includes('youtu.be')) setPlatform('YouTube');
    else if (tab.url.includes('instagram.com')) setPlatform('Instagram');
  }
}

// ---------- type / IP ----------

typeSelect.addEventListener('change', () => {
  chrome.storage.sync.set({ savedType: typeSelect.value });
  customTypeInput.classList.toggle('hidden', typeSelect.value !== 'Others');
});
customTypeInput.addEventListener('input', () => {
  chrome.storage.sync.set({ savedCustomType: customTypeInput.value });
});

function saveIpToHistory(ipVal) {
  if (!ipVal) return;
  chrome.storage.sync.set({ savedIp: ipVal });
  if (!savedIpHistory.includes(ipVal)) {
    savedIpHistory.push(ipVal);
    chrome.storage.sync.set({ ipHistory: savedIpHistory });
  }
}

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

attachAutocomplete(ipInput, $('ip-dropdown'), () => savedIpHistory, (v, typing) => {
  if (typing) chrome.storage.sync.set({ savedIp: v });
  else saveIpToHistory(v);
});
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
    const canon = taxonomy.festive.find(x => x.name.toLowerCase() === name.toLowerCase()).name;
    if (!selectedFestive.includes(canon)) selectedFestive.push(canon);
    chrome.storage.sync.set({ savedFestive: selectedFestive });
    renderFestiveChips();
  });
  row.appendChild(add);
}

// ---------- YouTube ----------

const yt = (path) => fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${YOUTUBE_API_KEY}`).then(r => r.json());

function parseYouTubeUrl(raw) {
  const u = new URL(raw);
  const path = u.pathname;
  let m;
  if (u.hostname.includes('youtu.be')) return { videoId: path.split('/')[1] };
  if ((m = path.match(/^\/shorts\/([\w-]{6,})/))) return { videoId: m[1], kind: 'short' };
  if ((m = path.match(/^\/live\/([\w-]{6,})/))) return { videoId: m[1] };
  if (path === '/watch' && u.searchParams.get('v')) return { videoId: u.searchParams.get('v') };
  if ((m = path.match(/^\/@([^/]+)/))) return { handle: decodeURIComponent(m[1]) };
  if ((m = path.match(/^\/channel\/([\w-]+)/))) return { channelId: m[1] };
  if ((m = path.match(/^\/user\/([^/]+)/))) return { legacyUser: m[1] };
  return {};
}

async function fetchChannel({ handle, channelId, legacyUser }) {
  const q = handle ? `forHandle=${encodeURIComponent(handle)}`
    : channelId ? `id=${channelId}` : `forUsername=${encodeURIComponent(legacyUser)}`;
  const d1 = await yt(`channels?part=snippet,statistics,contentDetails&${q}`);
  if (!d1.items || !d1.items.length) return null;
  const ch = d1.items[0];
  const subs = parseInt(ch.statistics.subscriberCount) || 0;

  let avgViews = 0;
  const uploads = ch.contentDetails.relatedPlaylists.uploads;
  if (uploads) {
    const d2 = await yt(`playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=10`);
    if (d2.items && d2.items.length) {
      const ids = d2.items.map(i => i.contentDetails.videoId).join(',');
      const d3 = await yt(`videos?part=statistics&id=${ids}`);
      if (d3.items && d3.items.length) {
        avgViews = Math.round(d3.items.reduce((s, v) => s + (parseInt(v.statistics.viewCount) || 0), 0) / d3.items.length);
      }
    }
  }
  return {
    platform: 'YouTube',
    username: ch.snippet.customUrl || ch.id,
    name: ch.snippet.title,
    followers: subs,
    category: '--',
    url: `https://youtube.com/${ch.snippet.customUrl || ('channel/' + ch.id)}`,
    avgViews,
    country: ch.snippet.country || '--'
  };
}

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
  let res;
  try {
    const [inj] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scoutScrapeInstagram });
    res = inj && inj.result;
  } catch (e) {
    return fail('Couldn\'t read the page. Refresh Instagram and try again.');
  }
  if (!res || !res.creator || !res.creator.username) return fail('Couldn\'t find a creator on this page.');

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
  $('prev-name').innerText = creator.name || '--';
  $('prev-handle').innerText = creator.username || '--';
  $('prev-followers').innerText = formatCount(creator.followers);
  $('prev-category').innerText = creator.category || '--';
  $('prev-views').innerText = formatCount(creator.avgViews);
  const tierEl = $('prev-tier');
  tierEl.innerText = tier.name;
  tierEl.className = 'pill ' + tier.class;

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
  $('moodboard-fields').classList.toggle('hidden', !content);
}

fetchBtn.addEventListener('click', async () => {
  showStatus('Scanning...');
  setDot('yellow');
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
    fail('Fetch failed. Check your connection and try again.');
  }
});

// ---------- save ----------

sendBtn.addEventListener('click', async () => {
  if (!current) return fail('Fetch a page first.');
  const { creator, content } = current;
  const type = typeSelect.value === 'Others' ? customTypeInput.value.trim() : typeSelect.value;
  const ip = ipInput.value.trim();
  saveIpToHistory(ip);

  const brand = content ? brandInput.value.trim() : '';
  const niche = content ? nicheInput.value.trim() : '';
  if (content && !brand) {
    brandInput.focus();
    return fail('Pick a brand so this lands on the moodboard.');
  }

  // Make sure the permanent thumbnail is ready before saving
  if (content && !content.thumb && content.thumbUrl) {
    sendBtn.innerText = 'Saving...';
    content.thumb = await thumbToDataUrl(content.thumbUrl);
  }

  const record = {
    platform: creator.platform,
    username: creator.username,
    name: creator.name,
    followers: creator.followers || 0,
    category: creator.category || '--',
    tier: calculateTier(creator.followers).name,
    type,
    ip,
    url: creator.url,
    avgViews: creator.avgViews || '--',
    country: creator.country || '--',
    contentUrl: content ? content.url : '',
    contentKind: content ? content.kind : '',
    thumb: content ? (content.thumb || content.thumbUrl || '') : '',
    thumbUrl: content ? content.thumbUrl : '',
    caption: content ? content.caption : '',
    contentViews: content ? content.views : 0,
    contentLikes: content ? content.likes : 0,
    contentComments: content ? content.comments : 0,
    postedAt: content ? content.postedAt : '',
    brand,
    niche,
    festive: content ? selectedFestive.slice() : []
  };

  sendBtn.innerText = 'Saving...';
  try {
    const { record: saved, updated } = await upsertRecord(record);
    taxonomy = await getTaxonomy();

    // Master database (Make.com) — same webhook as before, fire-and-forget
    if (MASTER_WEBHOOK_URL) {
      const { thumb, id, exportedAt, ...payload } = saved;
      fetch(MASTER_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, festive: (saved.festive || []).join(', ') })
      }).catch(err => console.log('Master DB silent fail:', err));
    }

    showStatus(updated ? 'Already saved, so the row was updated.' : (content ? 'Saved to moodboard.' : 'Creator saved.'), 'success-text');
    setDot('green');
    updateSavedCount();
  } catch (e) {
    fail('Couldn\'t save. ' + (e.message || ''));
  } finally {
    sendBtn.innerText = content ? 'Save to moodboard' : 'Save creator';
  }
});

// ---------- saved / sheets ----------

async function updateSavedCount() {
  const records = await getRecords();
  $('saved-count').innerText = records.length;
}

async function renderSaved() {
  const records = await getRecords();
  const fresh = records.filter(r => !r.exportedAt);
  $('saved-count').innerText = records.length;
  $('saved-summary').innerText = records.length
    ? `${records.length} saved. ${fresh.length ? fresh.length + ' not copied to a sheet yet.' : 'All copied.'}`
    : 'Nothing saved yet. Scout a creator to start.';
  $('copy-new-btn').innerText = fresh.length ? `Copy ${fresh.length} new row${fresh.length > 1 ? 's' : ''}` : 'No new rows';
  $('copy-new-btn').disabled = !fresh.length;
  $('clear-btn').classList.toggle('hidden', !records.length);

  const list = $('saved-list');
  list.innerHTML = '';
  records.slice(0, 40).forEach(r => {
    const li = document.createElement('li');
    li.className = 'saved-item' + (r.exportedAt ? '' : ' is-new');
    const thumb = r.thumb
      ? `<img src="${r.thumb}" alt="">`
      : `<span class="avatar">${(r.username || '?').replace(/^@/, '').charAt(0).toUpperCase()}</span>`;
    const where = [r.brand, r.niche].filter(Boolean).join(' / ');
    li.innerHTML = `${thumb}
      <div class="saved-text">
        <span class="saved-handle"></span>
        <span class="saved-sub"></span>
      </div>
      <button class="del" title="Delete this row">×</button>`;
    li.querySelector('.saved-handle').innerText = (r.platform === 'YouTube' ? '▶ ' : '') + (r.username || r.name);
    li.querySelector('.saved-sub').innerText = where || `${formatCount(r.followers)} ${r.platform === 'YouTube' ? 'subs' : 'followers'}`;
    li.querySelector('.del').addEventListener('click', async () => {
      await deleteRecord(r.id);
      renderSaved();
    });
    list.appendChild(li);
  });
}

async function copyRows(rows, withHeader) {
  await navigator.clipboard.writeText(toTSV(rows, withHeader));
  await markExported(rows.map(r => r.id));
}

$('copy-new-btn').addEventListener('click', async () => {
  const rows = (await getRecords()).filter(r => !r.exportedAt).reverse(); // oldest first
  if (!rows.length) return;
  try {
    await copyRows(rows, false);
    showStatus(`Copied ${rows.length} row${rows.length > 1 ? 's' : ''}. Paste under your last row.`, 'success-text');
    renderSaved();
  } catch (e) { fail('Couldn\'t copy. Click inside the popup and try again.'); }
});

$('copy-all-btn').addEventListener('click', async () => {
  const rows = (await getRecords()).slice().reverse();
  if (!rows.length) return fail('Nothing saved yet.');
  try {
    await copyRows(rows, true);
    showStatus(`Copied ${rows.length} rows with headers. Paste into cell A1.`, 'success-text');
    renderSaved();
  } catch (e) { fail('Couldn\'t copy. Click inside the popup and try again.'); }
});

$('csv-btn').addEventListener('click', async () => {
  const rows = (await getRecords()).slice().reverse();
  if (!rows.length) return fail('Nothing saved yet.');
  downloadText(toCSV(rows), `creator-scout-${formatDate(Date.now()).slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
  await markExported(rows.map(r => r.id));
  showStatus('CSV downloaded. Import it in Sheets with File > Import.', 'success-text');
  renderSaved();
});

$('open-sheets-btn').addEventListener('click', () => chrome.tabs.create({ url: 'https://sheets.new' }));

$('clear-btn').addEventListener('click', async () => {
  const btn = $('clear-btn');
  if (btn.dataset.confirm !== '1') {
    btn.dataset.confirm = '1';
    btn.innerText = 'Click again to delete everything';
    setTimeout(() => { btn.dataset.confirm = ''; btn.innerText = 'Delete all saved rows'; }, 3000);
    return;
  }
  await setRecords([]);
  btn.dataset.confirm = '';
  btn.innerText = 'Delete all saved rows';
  showStatus('All saved rows deleted.');
  renderSaved();
});

init();
