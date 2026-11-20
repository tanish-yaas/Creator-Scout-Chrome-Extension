// ==========================================
// Creator Scout — Moodboard (team dashboard)
// Home: a curved carousel with one card per brand (logo + colour you can edit).
// Inside a brand: a Reels moodboard (carousel / grid, embedded player, paste links)
// and a Creators list. Shared with the team through the team database (config.js).
// ==========================================

const S = {
  records: [],
  taxonomy: { brands: {}, meta: {}, festive: [] },
  brand: null,            // null = brands view; otherwise brand name or '__unfiled'
  tab: 'reels',           // inside a brand: 'reels' | 'creators'
  niches: new Set(),
  festive: new Set(),
  platform: 'all',
  q: '',
  index: -1,
  homeIndex: -1,
  layout: 'carousel',
  items: [],
  itemsKey: '',
  chipsOpen: false,
  playerIndex: -1,
  playerId: null
};

const UNFILED = '__unfiled';
// Opened from a client link: read-only, one brand (see share.js)
const SHARE = typeof globalThis.SCOUT_SHARE === 'string';
const NO_NICHE = 'No niche yet';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const handleOf = r => (r.platform === 'Instagram' ? '@' : '') + String(r.username || '').replace(/^@/, '');
const brandLabel = b => b === UNFILED ? 'Unfiled' : b;
const isContent = r => !!r.contentUrl;
const brandOf = r => r.brand || UNFILED;
const metaOf = b => (S.taxonomy.meta && S.taxonomy.meta[b]) || {};

const CARD_COLORS = ['', '#FC2779', '#E23744', '#FF6B00', '#F2A93B', '#FFD400', '#A6FF3D', '#1DB954', '#00B2A9', '#2F80ED', '#5B4BDB', '#9B51E0', '#FFFFFF', '#1A1A1A'];

// ---------- data ----------

let renderQueued = false;
// Don't re-render under someone's cursor while they type; catch up when they leave the field
const isEditing = () => {
  if (!$('player').classList.contains('hidden')) return true;
  const a = document.activeElement;
  return a && a.matches('input, textarea, select') && (a.closest('#info') || a.closest('.modal') || a.closest('#add-links') || a.closest('#creators'));
};

async function load() {
  const all = (await getRecords()).filter(onMoodboard).map(normalizeRecord);
  S.records = all.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  S.taxonomy = await getTaxonomy();
  S.taxonomy.meta = S.taxonomy.meta || {};
  if (S.playerId && !$('player').classList.contains('hidden')) {
    const a = document.activeElement;
    if (!(a && a.closest('#player-side') && a.matches('input'))) renderPlayerSide();
    renderQueued = true;
    return;
  }
  if (isEditing()) { renderQueued = true; return; }
  render();
  if (S.playerId && !$('player').classList.contains('hidden')) renderPlayerSide();
  renderSyncState();
}
document.addEventListener('focusout', () => setTimeout(() => { if (renderQueued && !isEditing()) { renderQueued = false; render(); } }, 50));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[SCOUT_KEYS.records] || changes[SCOUT_KEYS.taxonomy]) load();
  if (changes.scoutTeamInfo) renderSyncState();
});

async function renderSyncState() {
  const el = $('sync-state');
  if (!teamOn()) { el.textContent = 'Only on this browser'; el.className = 'sync-state local'; el.title = 'Connect the team database in config.js to share this board.'; return; }
  const info = await getTeamInfo();
  el.textContent = info.error ? 'Team board offline' : 'Team board live';
  el.className = 'sync-state ' + (info.error ? 'off' : 'on');
  el.title = info.error || (info.pulledAt ? 'Last synced ' + new Date(info.pulledAt).toLocaleTimeString() : '');
}

function festiveMeta(name) {
  return S.taxonomy.festive.find(f => f.name === name) || { name, emoji: '✨', color: '#9A9A9A' };
}

function matchesQuery(r, q) {
  if (!q) return true;
  return [r.username, r.name, r.caption, r.type, r.niche, r.category, r.savedBy, ...(r.festive || [])].join(' ').toLowerCase().includes(q);
}

function passesFilters(r) {
  if (S.platform !== 'all' && r.platform !== S.platform) return false;
  if (S.festive.size && !(r.festive || []).some(f => S.festive.has(f))) return false;
  return true;
}

function brandNames() {
  const set = new Set(Object.keys(S.taxonomy.brands));
  S.records.forEach(r => set.add(brandOf(r)));
  return [...set];
}

function nicheCounts(list) {
  const c = {};
  list.forEach(r => { const n = r.niche || NO_NICHE; c[n] = (c[n] || 0) + 1; });
  return Object.entries(c).sort((a, b) => b[1] - a[1]);
}

function creatorsOf(list) {
  const map = new Map();
  list.forEach(r => {
    if (!r.username) return;
    const k = r.platform + ':' + String(r.username).toLowerCase().replace(/^@/, '');
    const c = map.get(k) || { platform: r.platform, username: r.username, name: '', followers: 0, category: '', type: '', url: '', avatar: '', niches: new Set(), reels: 0, savedBy: new Set(), avgViews: '' };
    c.name = c.name || (r.name !== r.username ? r.name : '') || '';
    c.followers = Math.max(c.followers, Number(r.followers) || 0);
    if (r.category && !['--', 'None'].includes(r.category)) c.category = c.category || r.category;
    c.type = c.type || r.type || '';
    c.url = c.url || r.url || '';
    c.avatar = c.avatar || r.avatar || (!isContent(r) ? r.thumb : '') || '';
    if (r.avgViews && r.avgViews !== '--') c.avgViews = r.avgViews;
    if (r.niche) c.niches.add(r.niche);
    if (isContent(r)) c.reels++;
    if (r.savedBy) c.savedBy.add(r.savedBy);
    map.set(k, c);
  });
  return [...map.values()].sort((a, b) => b.followers - a.followers);
}

function brandItems() {
  const q = S.q.toLowerCase();
  const filtering = S.festive.size || S.platform !== 'all';
  return brandNames().map(name => {
    const all = S.records.filter(r => brandOf(r) === name);
    const nameHit = q && brandLabel(name).toLowerCase().includes(q);
    const recs = all.filter(r => passesFilters(r) && (nameHit || matchesQuery(r, q)));
    return { kind: 'brand', key: name, name, recs, total: all.length, nameHit };
  }).filter(b => {
    if (b.name === UNFILED && !b.total) return false;
    if (S.q && !b.nameHit && !b.recs.length) return false;
    if (filtering && !b.recs.length) return false;
    return true;
  }).sort((a, b) => b.recs.length - a.recs.length || a.name.localeCompare(b.name));
}

function brandRecords() {
  return S.records.filter(r => brandOf(r) === S.brand);
}

function reelItems() {
  const q = S.q.toLowerCase();
  return brandRecords().filter(r =>
    isContent(r) &&
    (!S.niches.size || S.niches.has(r.niche || NO_NICHE)) &&
    passesFilters(r) && matchesQuery(r, q)
  ).map(r => ({ kind: 'reel', key: r.id, rec: r }));
}

// ---------- hero & filters ----------

function renderHero() {
  const inBrand = S.brand !== null;
  $('back').classList.toggle('hidden', !inBrand);
  $('view-tabs').classList.toggle('hidden', !inBrand);
  $('brand-actions').classList.toggle('hidden', !inBrand || S.brand === UNFILED);
  // "+ Add links" works on both tabs; filters and carousel / grid only make sense for reels
  $('reel-tools').classList.toggle('hidden', !inBrand);
  $('reel-tools').classList.toggle('creators-tab', S.tab === 'creators');
  if (!inBrand) $('add-links').classList.add('hidden');
  document.body.classList.toggle('in-brand', inBrand);
  $('search').placeholder = !inBrand ? 'Search brands, creators, captions' : S.tab === 'creators' ? 'Search creators' : 'Search creators, captions, niches';

  if (!inBrand) {
    renderBrandIcon(null);
    const brands = brandNames().filter(b => b !== UNFILED).length;
    $('title').textContent = 'Everything you scouted as a team, all in one place';
    $('title').removeAttribute('title');
    // Only a hint when the board is empty; otherwise the tagline stands alone
    $('sub').textContent = S.records.length ? '' : 'Open a reel or a creator, click Creator Scout and save. It lands here for the whole team straight away.';
  } else {
    const all = brandRecords();
    const reels = all.filter(isContent).length;
    const creators = creatorsOf(all).length;
    $('title').textContent = brandLabel(S.brand);
    renderBrandIcon(S.brand === UNFILED ? null : S.brand);
    $('title').title = S.brand === UNFILED || SHARE ? '' : 'Double-click to rename';
    $('sub').textContent = S.brand === UNFILED
      ? `${all.length} saved without a brand. Give them a brand to file them.`
      : `${reels} ${reels === 1 ? 'reel' : 'reels'} and ${creators} ${creators === 1 ? 'creator' : 'creators'}.`;
    $('count-reels').textContent = reels;
    $('count-creators').textContent = creators;
    document.querySelectorAll('#view-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  }
}

// The brand's logo as a rounded square next to its name: a card-shaped image is cropped to its
// centre (where the logo sits), a plain logo is fitted inside; no logo shows the initial.
function renderBrandIcon(name) {
  const el = $('brand-icon');
  if (!name) { el.classList.add('hidden'); el.dataset.key = ''; return; }
  const meta = metaOf(name);
  const key = `${name}|${meta.logo || ''}|${meta.color || ''}`;
  el.classList.remove('hidden');
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  const size = el.style.getPropertyValue('--icon-size');
  el.style.cssText = cardStyle(meta.color);
  if (size) el.style.setProperty('--icon-size', size);
  el.innerHTML = meta.logo
    ? `<img src="${esc(meta.logo)}" alt="" draggable="false" class="${framed.get(meta.logo) ? 'full' : ''}">`
    : `<span>${esc(brandLabel(name).charAt(0).toUpperCase())}</span>`;
  const img = el.querySelector('img');
  if (img) img.addEventListener('error', () => { el.innerHTML = `<span>${esc(brandLabel(name).charAt(0).toUpperCase())}</span>`; }, { once: true });
}

// Keep the icon as tall as the brand name's letters, whatever size the title is at
new ResizeObserver(() => {
  const fs = parseFloat(getComputedStyle($('title')).fontSize) || 56;
  $('brand-icon').style.setProperty('--icon-size', Math.round(fs * 0.95) + 'px');
}).observe($('title'));

// Filters live in one menu next to Carousel / Grid: niches, campaign types and platform
function activeFilterCount() {
  return S.niches.size + S.festive.size + (S.platform !== 'all' ? 1 : 0);
}

function renderFilters() {
  $('filters').innerHTML = '';
  const btn = $('filters-btn');
  if (!btn) return;
  const n = activeFilterCount();
  btn.innerHTML = `Filters${n ? ` <span class="fcount">${n}</span>` : ''}`;
  btn.classList.toggle('on', n > 0);
  if (!$('filters-pop').classList.contains('hidden')) renderFiltersPop();
}

function renderFiltersPop() {
  const scope = brandRecords().filter(isContent);
  const niches = nicheCounts(scope);
  const fc = {};
  scope.forEach(r => (r.festive || []).forEach(f => { fc[f] = (fc[f] || 0) + 1; }));
  const tags = [...S.taxonomy.festive].sort((a, b) => (fc[b.name] || 0) - (fc[a.name] || 0));
  const platforms = new Set(scope.map(r => r.platform));
  const showing = reelItems().length;
  $('filters-pop').innerHTML = `
    <div class="fp-sec">
      <p class="fp-label">Niche</p>
      <div class="fp-chips">${niches.length ? niches.map(([nm, c]) => `<button class="fpill ${S.niches.has(nm) ? 'on' : ''}" data-niche="${esc(nm)}">${esc(nm)} <span>${c}</span></button>`).join('') : '<span class="fp-none">No niches yet</span>'}</div>
    </div>
    <div class="fp-sec">
      <p class="fp-label">Campaign type</p>
      <div class="fp-chips">${tags.map(f => `<button class="fpill festive ${S.festive.has(f.name) ? 'on' : ''} ${fc[f.name] ? '' : 'zero'}" data-festive="${esc(f.name)}" style="--c:${f.color}">${f.emoji} ${esc(f.name)} <span>${fc[f.name] || 0}</span></button>`).join('')}</div>
    </div>
    ${platforms.size > 1 || S.platform !== 'all' ? `<div class="fp-sec">
      <p class="fp-label">Platform</p>
      <div class="fp-chips">${['all', 'Instagram', 'YouTube'].map(pl => `<button class="fpill ${S.platform === pl ? 'on' : ''}" data-platform="${pl}">${pl === 'all' ? 'Both' : pl}</button>`).join('')}</div>
    </div>` : ''}
    <div class="fp-foot">
      <span>${showing} of ${scope.length} ${scope.length === 1 ? 'reel' : 'reels'} shown</span>
      <button class="link-btn" data-clear="1" ${activeFilterCount() ? '' : 'disabled'}>Clear filters</button>
    </div>`;
}

$('more-btn').addEventListener('click', e => { e.stopPropagation(); $('more-pop').classList.toggle('hidden'); });
document.addEventListener('mousedown', e => {
  if (!e.target.closest('#more-pop') && !e.target.closest('#more-btn')) $('more-pop').classList.add('hidden');
});
$('more-pop').addEventListener('click', () => setTimeout(() => $('more-pop').classList.add('hidden'), 0));

$('filters-btn').addEventListener('click', e => {
  e.stopPropagation();
  const pop = $('filters-pop');
  pop.classList.toggle('hidden');
  if (!pop.classList.contains('hidden')) renderFiltersPop();
});
document.addEventListener('mousedown', e => {
  if (!e.target.closest('#filters-pop') && !e.target.closest('#filters-btn')) $('filters-pop').classList.add('hidden');
});
$('filters-pop').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if ('niche' in b.dataset) { const nm = b.dataset.niche; S.niches.has(nm) ? S.niches.delete(nm) : S.niches.add(nm); }
  if ('festive' in b.dataset) { const f = b.dataset.festive; S.festive.has(f) ? S.festive.delete(f) : S.festive.add(f); }
  if ('platform' in b.dataset) S.platform = b.dataset.platform;
  if (b.dataset.clear) { S.niches.clear(); S.festive.clear(); S.platform = 'all'; }
  S.index = -1;
  render();
  renderFiltersPop();
});

let qTimer;
$('search').addEventListener('input', e => {
  clearTimeout(qTimer);
  qTimer = setTimeout(() => { S.q = e.target.value.trim(); S.index = -1; render(); }, 120);
});

$('view-tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  S.tab = b.dataset.tab;
  S.index = -1;
  render();
});

// ---------- cards ----------

function thumbsFor(item) {
  if (item.kind === 'reel') return item.rec.thumb ? [item.rec.thumb] : [];
  const pool = item.recs.length ? item.recs : S.records.filter(r => brandOf(r) === item.name);
  return pool.filter(isContent).concat(pool.filter(r => !isContent(r))).map(r => r.thumb).filter(Boolean).slice(0, 4);
}

// Light card colours get dark text
function inkFor(hex) {
  const m = String(hex || '').match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!m) return '#fff';
  const [r, g, b] = m.slice(1).map(x => parseInt(x, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#0b0b0b' : '#fff';
}
function cardStyle(color) {
  return color ? `--bc:${esc(color)};--ink:${inkFor(color)}` : '';
}

// Brand cover: logo on the card colour, else the initial on the colour, else a mosaic of the brand's reels
function coverHTML(item) {
  if (item.kind === 'brand') {
    const meta = metaOf(item.name);
    const initial = `<div class="logo-cover"><span class="initial">${esc(brandLabel(item.name).charAt(0).toUpperCase())}</span></div>`;
    if (meta.logo) return `<div class="logo-cover"><img src="${esc(meta.logo)}" alt="" draggable="false" class="${framed.get(meta.logo) ? 'full' : ''}"></div>`;
    if (meta.color) return initial;
    const thumbs = thumbsFor(item);
    if (!thumbs.length) return initial;
    return (thumbs.length >= 4 ? thumbs : thumbs.slice(0, 1)).map(t => `<img src="${esc(t)}" alt="" draggable="false" loading="lazy">`).join('');
  }
  const r = item.rec;
  return r.thumb
    ? `<img src="${esc(r.thumb)}" alt="" draggable="false" loading="lazy">`
    : `<span class="ph">${esc(String(r.username || '?').replace(/^@/, '').charAt(0).toUpperCase() || '▶')}</span>`;
}

function mediaHTML(item) {
  const mosaic = item.kind === 'brand' && !metaOf(item.name).logo && !metaOf(item.name).color && thumbsFor(item).length >= 4 ? 'mosaic' : '';
  return `<div class="media"><div class="layer ${mosaic}">${coverHTML(item)}</div></div>`;
}

// ---------- glow colour taken from each card's cover ----------

const glowCache = new Map();
try { Object.entries(JSON.parse(localStorage.getItem('scoutGlow2') || '{}')).forEach(([k, v]) => glowCache.set(k, v)); } catch (e) { /* ignore */ }
const glowKey = src => src.length > 200 ? src.slice(0, 80) + src.length + src.slice(-80) : src;
function saveGlowCache() {
  try { localStorage.setItem('scoutGlow2', JSON.stringify(Object.fromEntries([...glowCache].slice(-400)))); } catch (e) { /* ignore */ }
}
function hexToRgb(hex) {
  const m = String(hex || '').match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  return m ? m.slice(1).map(x => parseInt(x, 16)).join(', ') : '';
}

// Picks the most vivid colour in an image (not just the average, which tends to be muddy)
async function coverColor(src) {
  if (!src) return '';
  const key = glowKey(src);
  if (glowCache.has(key)) return glowCache.get(key);
  let out = '';
  try {
    const res = await fetch(src, { credentials: 'omit' });
    if (!res.ok) throw new Error('image ' + res.status);
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob, { resizeWidth: 36, resizeHeight: 36, resizeQuality: 'low' });
    const c = new OffscreenCanvas(36, 36);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, 36, 36).data;
    const buckets = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
    let ar = 0, ag = 0, ab = 0, an = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
      const max = Math.max(r, gg, b), min = Math.min(r, gg, b), v = max, sat = max ? (max - min) / max : 0;
      ar += d[i]; ag += d[i + 1]; ab += d[i + 2]; an++;
      if (v < 0.18 || sat < 0.22) continue;
      let h = 0;
      if (max !== min) {
        if (max === r) h = ((gg - b) / (max - min) + 6) % 6;
        else if (max === gg) h = (b - r) / (max - min) + 2;
        else h = (r - gg) / (max - min) + 4;
      }
      const bk = buckets[Math.floor(h * 2) % 12];
      const w = sat * sat * v;
      bk.w += w; bk.r += d[i] * w; bk.g += d[i + 1] * w; bk.b += d[i + 2] * w;
    }
    const best = buckets.reduce((a, b) => (b.w > a.w ? b : a));
    if (best.w > 1.5) out = [best.r / best.w, best.g / best.w, best.b / best.w].map(Math.round).join(', ');
    else if (an) {
      // Mostly grey / black & white cover: use a soft version of its average tone
      const avg = [ar / an, ag / an, ab / an].map(x => Math.round(Math.min(255, x * 0.6 + 90)));
      out = avg.join(', ');
    }
  } catch (e) { out = ''; }
  // Only remember colours we actually read, so a failed load is retried next time
  if (out) { glowCache.set(key, out); saveGlowCache(); }
  return out;
}

function glowSource(item) {
  if (item.kind === 'reel') return { rgb: '', src: item.rec.thumb || '' };
  const meta = metaOf(item.name);
  const rgb = hexToRgb(meta.color);
  if (rgb) {
    const [r, g, b] = rgb.split(',').map(Number);
    const neutral = Math.max(r, g, b) - Math.min(r, g, b) < 30;
    // A white / black / grey card glows in its logo's colour instead
    if (!(neutral && meta.logo)) return { rgb, src: '' };
  }
  return { rgb: '', src: meta.logo || thumbsFor(item)[0] || '' };
}

const DEFAULT_GLOW = '166, 255, 61';
// Gives every card its own glow colour, then updates the stage halo for the card in the middle
function applyGlows(root) {
  root.querySelectorAll('.card[data-i]').forEach(async el => {
    const item = S.items[+el.dataset.i];
    if (!item) return;
    const { rgb, src } = glowSource(item);
    const colour = rgb || (await coverColor(src)) || DEFAULT_GLOW;
    if (S.items[+el.dataset.i] !== item) return;
    el.style.setProperty('--glow', colour);
    if (el.classList.contains('active')) setHalo(colour);
  });
}
function setHalo(rgb) {
  document.documentElement.style.setProperty('--halo', `rgb(${rgb || DEFAULT_GLOW})`);
}

function cardHTML(item, i) {
  if (item.kind === 'brand') {
    const meta = metaOf(item.name);
    const reels = item.recs.filter(isContent).length;
    const creators = creatorsOf(item.recs).length;
    return `<article class="card brand-card" data-i="${i}" tabindex="-1" aria-label="${esc(brandLabel(item.name))}" style="${cardStyle(meta.color)}">
      ${mediaHTML(item)}
      <div class="cap">
        <h2>${esc(brandLabel(item.name))}</h2>
        <p>${item.recs.length ? `${reels} ${reels === 1 ? 'reel' : 'reels'}, ${creators} ${creators === 1 ? 'creator' : 'creators'}` : 'Nothing saved yet'}</p>
      </div>
    </article>`;
  }
  const r = item.rec;
  const stat = r.contentViews ? `${formatCount(r.contentViews)} views` : (r.contentLikes ? `${formatCount(r.contentLikes)} likes` : '');
  const fest = (r.festive || []).slice(0, 3).map(f => festiveMeta(f).emoji).join(' ');
  return `<article class="card reel-card" data-i="${i}" tabindex="-1" aria-label="${esc(handleOf(r) || 'Reel')}">
    ${mediaHTML(item)}
    ${fest ? `<span class="fest">${fest}</span>` : ''}
    <span class="plat">${r.platform === 'YouTube' ? 'YT' : 'IG'}</span>
    <span class="play" aria-hidden="true">▶</span>
    <button class="card-del" data-del="${r.id}" title="Delete this reel" aria-label="Delete this reel">×</button>
    <div class="cap">
      <h2>${esc(handleOf(r) || (r.platform === 'YouTube' ? 'YouTube video' : 'Instagram reel'))}</h2>
      <p>${[stat, r.niche].filter(Boolean).map(esc).join(', ')}</p>
    </div>
  </article>`;
}

// ---------- carousel: a wheel that loops forever ----------
// Cards sit on a ring of "slots". With only a few items the ring repeats them, so scrolling past
// the last card flows straight into the first one with no gap. pos / target are in slot units.

let pos = 0;          // where the wheel is right now (fractional while moving)
let target = 0;       // where it's heading
let raf = 0;
let cardEls = [];
let slots = 0;
let G = null;         // cached geometry
let activeSlot = -1;

const PERSPECTIVE = 1500;
const ACTIVE_SCALE = 1.07;   // the card in the middle is drawn a little bigger
const MIN_SLOTS = 11;   // enough slots that a card never shows twice in view at the same time... unless there are very few items

// Card size comes from the space the stage actually has, so the whole carousel fits on screen
function geometry() {
  const w = window.innerWidth;
  const reel = S.brand !== null;
  const ratio = reel ? 16 / 9 : 1.32;
  const R = Math.max(900, w * 0.95);
  // Height left for the cards once the top bar, heading, counter and buttons are placed
  const fit = document.body.classList.contains('fit');
  const above = (document.querySelector('.top') || {}).offsetHeight + (document.querySelector('.hero') || {}).offsetHeight || 0;
  const avail = fit
    ? Math.max(220, window.innerHeight - above - 150)
    : Math.max(220, ($('stage').clientHeight || window.innerHeight * 0.55) - 40);
  let cardW = reel ? Math.max(130, Math.min(210, w * 0.14)) : Math.max(160, Math.min(290, w * 0.185));
  const gap = Math.max(18, w * 0.016);
  let cardH = 0;
  for (let k = 0; k < 4; k++) {
    cardH = cardW * ratio;
    const step = Math.asin(Math.min(0.9, (cardW + gap) / R));
    // Outer cards come closer and look bigger; make sure they fit too
    const z = R * (1 - Math.cos(2.6 * step)) * 0.85;
    const grow = Math.max(ACTIVE_SCALE, PERSPECTIVE / (PERSPECTIVE - z));
    if (cardH * grow <= avail) break;
    cardW = cardW * (avail / (cardH * grow)) * 0.98;
  }
  cardH = cardW * ratio;
  const step = Math.asin(Math.min(0.9, (cardW + gap) / R));
  const grow = Math.max(ACTIVE_SCALE, PERSPECTIVE / (PERSPECTIVE - R * (1 - Math.cos(2.6 * step)) * 0.85));
  // The ring is only as tall as the cards need, so the page has no empty bands around it
  const ringH = Math.ceil(cardH * grow + 28);
  return { cardW, cardH, gap, R, step, avail, ringH, px: cardW + gap };
}

const looping = () => slots > 1;
function wrapD(d) {
  if (!looping()) return d;
  return ((d % slots) + slots * 1.5) % slots - slots / 2;
}
const slotOf = p => looping() ? ((Math.round(p) % slots) + slots) % slots : 0;

function layout(p = pos) {
  if (!G || !cardEls.length) return;
  const ring = $('ring');
  ring.style.setProperty('--cw', G.cardW + 'px');
  ring.style.setProperty('--ch', G.cardH + 'px');
  ring.style.height = (document.body.classList.contains('fit') ? G.ringH : G.avail) + 'px';
  const act = slotOf(p);
  cardEls.forEach((c, k) => {
    const d = wrapD(k - p);
    const ad = Math.abs(d);
    const t = d * G.step;
    const x = G.R * Math.sin(t);
    const z = G.R * (1 - Math.cos(t)) * 0.85;
    const ry = -t * (180 / Math.PI) * 1.05;
    // grows smoothly as it nears the middle, so the switch from card to card reads clearly
    const s = 1 + (ACTIVE_SCALE - 1) * Math.max(0, 1 - ad);
    c.style.transform = `translate3d(${x}px, 0, ${z}px) rotateY(${ry}deg) scale(${s.toFixed(4)})`;
    // Smooth fade at the edges of the wheel and a gentle dim away from the middle
    const op = Math.max(0, Math.min(1, (3.7 - ad) / 0.9));
    c.style.opacity = op;
    c.style.visibility = op <= 0.01 ? 'hidden' : '';
    c.style.pointerEvents = op < 0.5 ? 'none' : '';
    c.style.zIndex = String(1000 - Math.round(ad * 100));
    c.style.setProperty('--dim', (1 - Math.min(ad, 1.6) * 0.24).toFixed(3));
    c.classList.toggle('active', k === act);
  });
  if (act !== activeSlot) {
    activeSlot = act;
    const n = S.items.length;
    S.index = n ? act % n : 0;
    const el = cardEls[act];
    if (el && el.style.getPropertyValue('--glow')) setHalo(el.style.getPropertyValue('--glow'));
    renderInfo();
  }
  const n = S.items.length;
  $('counter').textContent = n ? `${String(S.index + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}` : '';
  $('prev').disabled = $('next').disabled = n < 2;
}

// Ease toward the target every frame (fast at first, settling softly)
function tick() {
  raf = 0;
  if (!(drag && drag.moved)) {
    const diff = target - pos;
    const was = pos;
    pos = Math.abs(diff) < 0.0008 ? target : pos + diff * 0.14;
    if (pos === target && was !== target) landed();
  }
  layout(pos);
  if (pos !== target && !(drag && drag.moved)) raf = requestAnimationFrame(tick);
}
// A short glow when the wheel settles on a card
function landed() {
  requestAnimationFrame(() => {
    const el = cardEls[activeSlot];
    if (!el) return;
    el.classList.remove('landed');
    void el.offsetWidth;
    el.classList.add('landed');
    setTimeout(() => el.classList.remove('landed'), 700);
  });
}

function animateTo(t) {
  target = looping() ? t : 0;
  if (!raf) raf = requestAnimationFrame(tick);
}
// Move by whole cards from wherever the wheel is heading
function step(delta) { animateTo(Math.round(target) + delta); }

// Bring item i to the middle, going the short way round the wheel
function go(i, animate = true) {
  const n = S.items.length;
  if (!n) return;
  i = ((i % n) + n) % n;
  let best = null;
  for (let k = i; k < slots; k += n) {
    const d = wrapD(k - target);
    if (best === null || Math.abs(d) < Math.abs(best)) best = d;
  }
  const t = Math.round(target + (best || 0));
  if (animate) animateTo(t);
  else { target = pos = looping() ? t : 0; activeSlot = -1; layout(pos); }
}

function buildStage() {
  const key = (S.brand ?? '~') + '|' + S.items.map(it => it.key + ':' + (it.kind === 'brand'
    ? it.recs.length + ':' + JSON.stringify(metaOf(it.name)) + ':' + thumbsFor(it).join('').length
    : (it.rec.thumb || '').length + ':' + (it.rec.festive || []).join() + ':' + it.rec.niche)).join(',');
  const ring = $('ring');
  const n = S.items.length;
  if (S.index < 0) S.index = Math.floor(n / 2);
  S.index = Math.min(S.index, Math.max(0, n - 1));
  if (key !== S.itemsKey) {
    S.itemsKey = key;
    slots = n <= 1 ? n : n * Math.ceil(MIN_SLOTS / n);
    const html = [];
    for (let k = 0; k < slots; k++) html.push(cardHTML(S.items[k % n], k % n).replace('<article class="card', `<article data-slot="${k}" class="card`));
    ring.innerHTML = html.join('');
    cardEls = [...ring.querySelectorAll('.card')];
    cardEls.forEach(c => c.querySelectorAll('img').forEach(img => img.addEventListener('error', () => img.remove(), { once: true })));
    applyGlows(ring);
    pos = target = S.index;
    activeSlot = -1;
  }
  G = geometry();
  layout(pos);
}

// ---------- grid ----------

function buildGrid() {
  $('grid').innerHTML = S.items.map(cardHTML).join('');
  applyGlows($('grid'));
}
$('grid').addEventListener('click', e => {
  const del = e.target.closest('.card-del');
  if (del) { deleteReel(del.dataset.del); return; }
  const c = e.target.closest('.card');
  if (c) openPlayer(+c.dataset.i);
});

function setLayout(l) {
  S.layout = l;
  document.querySelectorAll('#layout-toggle button').forEach(b => b.classList.toggle('on', b.dataset.layout === l));
  render();
}
$('layout-toggle').addEventListener('click', e => {
  const b = e.target.closest('[data-layout]');
  if (b) setLayout(b.dataset.layout);
});

// ---------- interaction: drag with momentum, wheel / trackpad glide, keys ----------

const stage = $('stage');
let drag = null;

function endDrag(e, cancelled) {
  if (!drag) return;
  const wasDrag = drag.moved;
  const d = drag;
  drag = null;
  stage.classList.remove('dragging');
  if (wasDrag) {
    // Fling: carry the release speed for a moment, then settle on a card
    const v = d.v || 0;
    animateTo(Math.round(pos + Math.max(-4, Math.min(4, v * 240))));
    return;
  }
  if (cancelled || !e) return;
  const c = e.target.closest && e.target.closest('.card');
  if (!c || !stage.contains(c)) return;
  const k = +c.dataset.slot;
  if (k !== activeSlot) animateTo(Math.round(target + wrapD(k - target)));
  else activate(S.items[S.index]);
}

stage.addEventListener('click', e => {
  const del = e.target.closest('.card-del');
  if (del) { e.stopPropagation(); deleteReel(del.dataset.del); }
});
stage.addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.target.closest('.arrow') || e.target.closest('.card-del')) return;
  drag = { x: e.clientX, y: e.clientY, start: pos, moved: false, id: e.pointerId, lastX: e.clientX, lastT: performance.now(), v: 0 };
});
window.addEventListener('pointermove', e => {
  if (!drag) return;
  if (e.pointerType === 'mouse' && e.buttons === 0) { endDrag(null, true); return; }
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  if (!drag.moved) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
    if (Math.abs(dx) < 6) return;
    drag.moved = true;
    try { stage.setPointerCapture(drag.id); } catch (err) { /* ignore */ }
    stage.classList.add('dragging');
    cancelAnimationFrame(raf); raf = 0;
  }
  const px = (G && G.px) || 220;
  const now = performance.now();
  const dt = Math.max(1, now - drag.lastT);
  // speed in cards per millisecond, smoothed
  drag.v = drag.v * 0.6 + (-(e.clientX - drag.lastX) / px / dt) * 0.4;
  drag.lastX = e.clientX; drag.lastT = now;
  pos = target = looping() ? drag.start - dx / px : 0;
  layout(pos);
});
window.addEventListener('pointerup', e => endDrag(e, false));
window.addEventListener('pointercancel', () => endDrag(null, true));
window.addEventListener('blur', () => endDrag(null, true));

// Trackpad and mouse wheel glide the wheel, then it settles on the nearest card
let snapTimer = 0;
stage.addEventListener('wheel', e => {
  if (!looping()) return;
  e.preventDefault();
  let d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (e.deltaMode === 1) d *= 40;            // scrolling by lines
  const px = (G && G.px) || 220;
  target += d / Math.max(120, px * 0.55);
  // never let a hard flick race too far ahead
  target = Math.max(pos - 5, Math.min(pos + 5, target));
  if (!raf) raf = requestAnimationFrame(tick);
  clearTimeout(snapTimer);
  snapTimer = setTimeout(() => animateTo(Math.round(target)), 120);
}, { passive: false });

$('prev').addEventListener('click', () => step(-1));
$('next').addEventListener('click', () => step(1));

document.addEventListener('keydown', e => {
  if (!$('confirm').classList.contains('hidden')) { if (e.key === 'Escape') closeConfirm(false); return; }
  if (!$('share-modal').classList.contains('hidden')) return;
  if (!$('player').classList.contains('hidden')) {
    if (e.key === 'Escape') closePlayer();
    if (e.key === 'ArrowRight') stepPlayer(1);
    if (e.key === 'ArrowLeft') stepPlayer(-1);
    return;
  }
  if (!$('brand-modal').classList.contains('hidden')) { if (e.key === 'Escape') closeBrandModal(); return; }
  if (!$('filters-pop').classList.contains('hidden') && e.key === 'Escape') { $('filters-pop').classList.add('hidden'); return; }
  if (e.target.matches('input, textarea, select')) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  const carousel = !$('stage').classList.contains('hidden');
  if (carousel && e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  else if (carousel && e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  else if (carousel && e.key === 'Enter' && S.items[S.index]) activate(S.items[S.index]);
  else if (e.key === 'Escape' && S.brand !== null) goHome();
  else if (e.key === '/') { e.preventDefault(); $('search').focus(); }
});

// Re-fit the carousel whenever its space changes (window resize, paste box opening, filters wrapping)
let fitFrame = 0;
new ResizeObserver(() => {
  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(() => { if (!$('stage').classList.contains('hidden') && cardEls.length) { G = geometry(); layout(pos); } });
}).observe($('stage'));

function activate(item) {
  if (!item) return;
  if (item.kind === 'brand') openBrand(item.name);
  else openPlayer(S.index);
}

function openBrand(name) {
  S.homeIndex = S.index;
  S.brand = name;
  S.tab = brandRecordsFor(name).some(isContent) ? 'reels' : 'creators';
  S.niches.clear();
  S.festive.clear();
  S.platform = 'all';
  S.q = '';
  $('search').value = '';
  S.index = -1;
  render();
  window.scrollTo({ top: 0 });
}
const brandRecordsFor = name => S.records.filter(r => brandOf(r) === name);

function goHome() {
  if (SHARE) return;
  S.brand = null;
  S.niches.clear();
  S.festive.clear();
  S.platform = 'all';
  $('filters-pop').classList.add('hidden');
  S.tab = 'reels';
  S.layout = 'carousel';
  S.q = '';
  $('search').value = '';
  S.index = S.homeIndex;
  document.querySelectorAll('#layout-toggle button').forEach(b => b.classList.toggle('on', b.dataset.layout === 'carousel'));
  render();
}
$('back').addEventListener('click', goHome);
$('home-link').addEventListener('click', e => { e.preventDefault(); goHome(); });

// Double-click the brand title to rename it for everyone
$('title').addEventListener('dblclick', () => {
  if (SHARE || S.brand === null || S.brand === UNFILED) return;
  const t = $('title');
  const old = S.brand;
  t.contentEditable = 'true';
  t.focus();
  document.getSelection().selectAllChildren(t);
  const onKey = e => {
    if (e.key === 'Enter') { e.preventDefault(); t.blur(); }
    if (e.key === 'Escape') { t.textContent = old; t.blur(); }
  };
  t.addEventListener('keydown', onKey);
  t.addEventListener('blur', async () => {
    t.contentEditable = 'false';
    t.removeEventListener('keydown', onKey);
    const name = t.textContent.trim();
    if (!name || name === old) { t.textContent = brandLabel(S.brand); return; }
    try {
      S.brand = name;
      await renameBrandEverywhere(old, name);
      toast(`Renamed to ${name}`);
    } catch (err) { S.brand = old; toast('Couldn\'t rename: ' + err.message); load(); }
  }, { once: true });
});

// ---------- row under the carousel ----------

function renderInfo() {
  const info = $('info');
  const item = S.items[S.index];
  if (!item || S.layout === 'grid' || (S.brand !== null && S.tab === 'creators')) { info.innerHTML = ''; return; }
  if (item.kind === 'brand') {
    info.innerHTML = `
      <button class="open-cta glow-pill" id="open-brand">Open ${esc(brandLabel(item.name))} <span aria-hidden="true">→</span></button>
      ${item.name !== UNFILED ? '<button class="ghost-btn" id="edit-this-card">Edit card</button>' : ''}`;
    $('open-brand').addEventListener('click', () => openBrand(item.name));
    if ($('edit-this-card')) $('edit-this-card').addEventListener('click', () => openBrandModal(item.name));
    return;
  }
  const r = item.rec;
  info.innerHTML = `
    <button class="open-cta glow-pill" id="play-this" title="${SHARE ? 'Play this reel' : 'Play it and edit its brand, niche and campaign type'}">Play ${esc(handleOf(r) || 'reel')} <span aria-hidden="true">▶</span></button>`;
  $('play-this').addEventListener('click', () => openPlayer(S.index));
}

function chipList(r) {
  const sel = S.taxonomy.festive.filter(f => (r.festive || []).includes(f.name));
  const rest = S.taxonomy.festive.filter(f => !(r.festive || []).includes(f.name));
  return S.chipsOpen ? [...sel, ...rest] : [...sel, ...rest].slice(0, Math.max(5, sel.length));
}

// ---------- creators list ----------

function renderCreators() {
  const q = S.q.toLowerCase();
  const list = creatorsOf(brandRecords()).filter(c => !q ||
    [c.username, c.name, c.category, c.type, ...c.niches].join(' ').toLowerCase().includes(q));
  if (!list.length) {
    $('creators').innerHTML = `<p class="empty">${q ? 'No creators match your search.' : 'No creators yet. Save a profile or a reel from the extension.'}</p>`;
    return;
  }
  $('creators').innerHTML = `
    <div class="creators-head">
      <p>${list.length} ${list.length === 1 ? 'creator' : 'creators'}</p>
      ${SHARE ? '' : '<button id="copy-creators" class="ghost-btn">Copy list for Sheets</button>'}
    </div>
    <div class="ctable-wrap"><table class="ctable">
      <thead><tr><th>Creator</th><th class="num">Followers</th><th>Tier</th><th>Category</th><th>Type</th><th>Niches</th><th class="num">Reels</th>${SHARE ? '' : '<th>Saved by</th>'}<th></th></tr></thead>
      <tbody>${list.map(c => {
        const tier = calculateTier(c.followers);
        const ini = String(c.username).replace(/^@/, '').charAt(0).toUpperCase();
        return `<tr>
          <td><div class="who">
            <span class="ava">${c.avatar ? `<img src="${esc(c.avatar)}" alt="" loading="lazy">` : esc(ini)}</span>
            <span><b>${esc(handleOf(c))}</b>${c.name ? `<small>${esc(c.name)}</small>` : ''}</span>
          </div></td>
          <td class="num">${c.followers ? Number(c.followers).toLocaleString('en-IN') : '--'}</td>
          <td>${tier.class ? `<span class="tier ${tier.class}">${tier.name}</span>` : '--'}</td>
          ${editCell('category', c, c.category)}
          ${editCell('type', c, c.type)}
          ${editCell('niche', c, [...c.niches].join(', '))}
          <td class="num">${c.reels}</td>
          ${SHARE ? '' : `<td>${esc([...c.savedBy].join(', ') || '--')}</td>`}
          <td class="row-acts">${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">Profile ↗</a>` : ''}${SHARE ? '' : `<button class="c-del" data-user="${esc(c.platform + ':' + c.username)}" title="Remove ${esc(handleOf(c))} from ${esc(brandLabel(S.brand))}" aria-label="Remove ${esc(handleOf(c))}">×</button>`}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  $('creators').querySelectorAll('td.ed').forEach(td => td.addEventListener('click', () => openCellEditor(td)));
  $('creators').querySelectorAll('.c-del').forEach(b => b.addEventListener('click', () => removeCreator(b.dataset.user)));
  $('creators').querySelectorAll('.ava img').forEach(img => img.addEventListener('error', () => img.remove(), { once: true }));
  if ($('copy-creators')) $('copy-creators').addEventListener('click', async () => {
    const head = ['Username', 'Name', 'Platform', 'Followers', 'Tier', 'Category', 'Type', 'Niches', 'Reels saved', 'Saved by', 'URL'];
    const rows = list.map(c => [c.username, c.name, c.platform, c.followers || '', calculateTier(c.followers).name, c.category, c.type, [...c.niches].join(', '), c.reels, [...c.savedBy].join(', '), c.url]);
    const text = [head, ...rows].map(r => r.map(v => String(v ?? '').replace(/[\t\n]/g, ' ')).join('\t')).join('\n');
    const html = '<meta charset="utf-8"><table>' + [head, ...rows].map((r, i) => '<tr>' + r.map(v => i ? `<td>${esc(v)}</td>` : `<th>${esc(v)}</th>`).join('') + '</tr>').join('') + '</table>';
    const ok = await copyToClipboard(text, html);
    toast(ok ? `Copied ${list.length} creators. Paste into a Google Sheet.` : 'Copy was blocked. Click the page once and try again.');
  });
}

// ---------- add reel links ----------

$('add-links-btn').addEventListener('click', () => {
  const f = $('add-links');
  f.classList.toggle('hidden');
  if (!f.classList.contains('hidden')) {
    $('links-niches').innerHTML = (S.taxonomy.brands[S.brand] || []).map(n => `<option value="${esc(n)}">`).join('');
    const one = S.niches.size === 1 ? [...S.niches][0] : '';
    $('links-niche').value = one && one !== NO_NICHE ? one : '';
    S.linkTags = new Set(S.festive);
    S.linkTagsOpen = false;
    renderLinkTags();
    $('links-input').focus();
  }
});

// Adds a tag to the shared list (if it's new) and returns its exact name
async function addCustomTag(name) {
  const tax = await registerTaxonomy({ festive: [name] });
  if (teamOn()) await saveFestiveList(tax.festive);
  S.taxonomy = await getTaxonomy();
  return (tax.festive.find(f => f.name.toLowerCase() === name.toLowerCase()) || { name }).name;
}

// Campaign types to put on everything added in one go
function renderLinkTags() {
  const all = S.taxonomy.festive || [];
  const on = S.linkTags || new Set();
  const ordered = [...all.filter(f => on.has(f.name)), ...all.filter(f => !on.has(f.name))];
  const shown = S.linkTagsOpen ? ordered : ordered.slice(0, Math.max(6, on.size));
  $('links-tags').innerHTML = shown.map(f => `<button type="button" class="chip ${on.has(f.name) ? 'on' : ''}" data-lt="${esc(f.name)}" style="--c:${f.color}">${f.emoji} ${esc(f.name)}</button>`).join('')
    + (ordered.length > 6 ? `<button type="button" class="chip more" data-lt-more>${S.linkTagsOpen ? 'Show less' : '+' + (ordered.length - shown.length) + ' more'}</button>` : '')
    + `<input class="chip-input" id="lt-new" placeholder="+ Add your own tag" aria-label="Add your own tag" autocomplete="off">`;
  $('lt-new').addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const name = e.target.value.trim();
    if (!name) return;
    try { S.linkTags.add(await addCustomTag(name)); } catch (err) { toast('Couldn\'t add the tag: ' + err.message); }
    renderLinkTags();
    $('lt-new').focus();
  });
}
$('links-tags').addEventListener('click', e => {
  const b = e.target.closest('[data-lt]');
  if (b) { const n = b.dataset.lt; S.linkTags.has(n) ? S.linkTags.delete(n) : S.linkTags.add(n); renderLinkTags(); return; }
  if (e.target.closest('[data-lt-more]')) { S.linkTagsOpen = !S.linkTagsOpen; renderLinkTags(); }
});

// Click anywhere outside the box to fold it away (not while links are still being added)
document.addEventListener('pointerdown', e => {
  const f = $('add-links');
  if (f.classList.contains('hidden') || $('links-submit').disabled) return;
  if (e.target.closest('#add-links, #add-links-btn, .modal')) return;
  f.classList.add('hidden');
});

$('add-links').addEventListener('submit', async e => {
  e.preventDefault();
  const links = [...new Set($('links-input').value.split(/[\s,]+/).map(s => s.trim()).filter(s => /^https?:\/\//.test(s)))];
  if (!links.length) { $('links-progress').textContent = 'Paste at least one Instagram or YouTube link.'; return; }
  const niche = $('links-niche').value.trim();
  const brand = S.brand === UNFILED ? '' : S.brand;
  const savedBy = await new Promise(res => chrome.storage.sync.get(['savedBy'], r => res(r.savedBy || '')));
  const btn = $('links-submit');
  btn.disabled = true;
  let done = 0, failed = 0;
  for (const link of links) {
    $('links-progress').textContent = `Adding ${done + failed + 1} of ${links.length}…`;
    try {
      const found = await lookupLink(link);
      if (!found) { failed++; continue; }
      const { creator } = found;
      const profileOnly = !found.content;
      const content = found.content || {};
      const avatar = creator.avatarUrl ? await thumbToDataUrl(creator.avatarUrl, 240) : '';
      const thumb = content.thumbUrl ? await thumbToDataUrl(content.thumbUrl) : (profileOnly ? avatar : '');
      const followers = Number(creator.followers) || 0;
      const { record } = await upsertRecord({
        platform: creator.platform || (content.kind === 'short' || content.kind === 'video' ? 'YouTube' : 'Instagram'),
        username: creator.username || '', name: creator.name || '', followers,
        category: creator.category || '--', tier: calculateTier(followers).name, type: '',
        url: creator.url || '', avgViews: creator.avgViews || '--', country: creator.country || '--',
        contentUrl: content.url || '', contentKind: content.kind || '', thumb, thumbUrl: content.thumbUrl || (profileOnly ? creator.avatarUrl || '' : ''), avatar,
        caption: content.caption || '', contentViews: content.views || 0, contentLikes: content.likes || 0,
        contentComments: content.comments || 0, postedAt: content.postedAt || '',
        brand, niche, festive: [...(S.linkTags || [])], savedBy
      });
      sendToMaster(record);
      done++;
    } catch (err) { failed++; }
  }
  btn.disabled = false;
  $('links-progress').textContent = failed
    ? `Added ${done}. ${failed} ${failed === 1 ? 'link' : 'links'} couldn't be read. Check they're public reels, posts, videos or profiles.`
    : `Added ${done} to ${brandLabel(S.brand)}.`;
  if (done) $('links-input').value = '';
});

// ---------- player (embedded reel) ----------

function embedFor(r) {
  const u = r.contentUrl || '';
  let m;
  if ((m = u.match(/instagram\.com\/(?:[\w.]+\/)?(reel|reels|p|tv)\/([\w-]+)/))) {
    return `https://www.instagram.com/${m[1] === 'p' ? 'p' : 'reel'}/${m[2]}/embed/`;
  }
  if ((m = u.match(/(?:youtube\.com\/(?:shorts\/|watch\?v=|live\/)|youtu\.be\/)([\w-]{6,})/))) {
    return `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0`;
  }
  return '';
}

function openPlayer(i) {
  const item = S.items[i];
  if (!item || item.kind !== 'reel') return;
  S.playerIndex = i;
  const r = item.rec;
  const src = embedFor(r);
  const tall = r.platform === 'Instagram' || r.contentKind === 'short';
  $('player-frame').className = 'player-frame' + (tall ? ' tall' : ' wide');
  $('player-frame').innerHTML = src
    ? `<iframe src="${esc(src)}" allow="autoplay; encrypted-media; picture-in-picture; clipboard-write" allowfullscreen loading="lazy" title="${esc(handleOf(r))}"></iframe>`
    : `<p class="empty">This link can't be embedded. <a href="${esc(r.contentUrl)}" target="_blank" rel="noopener">Open it ↗</a></p>`;
  S.playerId = r.id;
  renderPlayerSide();
  $('player').classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function renderPlayerSide() {
  const i = S.playerIndex;
  const r = S.records.find(x => x.id === S.playerId);
  if (!r) { closePlayer(); return; }
  const tier = calculateTier(r.followers);
  if (SHARE) { renderPlayerSideReadOnly(r, i, tier); return; }
  const brands = brandNames().filter(b => b !== UNFILED);
  const niches = r.brand ? (S.taxonomy.brands[r.brand] || []) : [];
  $('player-side').innerHTML = `
    <p class="pl-handle">${esc(handleOf(r) || 'Unknown creator')}</p>
    <p class="pl-name">${esc(r.name && r.name !== r.username ? r.name : '')}</p>
    <div class="pl-stats">
      ${r.followers ? `<div><span>${r.platform === 'YouTube' ? 'Subscribers' : 'Followers'}</span><b>${formatCount(r.followers)}</b></div>` : ''}
      ${tier.class ? `<div><span>Tier</span><b class="tier ${tier.class}">${tier.name}</b></div>` : ''}
      ${r.contentViews ? `<div><span>Views</span><b>${formatCount(r.contentViews)}</b></div>` : ''}
      ${r.contentLikes ? `<div><span>Likes</span><b>${formatCount(r.contentLikes)}</b></div>` : ''}
    </div>
    ${r.caption ? `<p class="pl-caption">${esc(r.caption)}</p>` : ''}
    <p class="pl-meta">${[r.type, r.savedBy ? 'Saved by ' + r.savedBy : '', formatDate(r.savedAt).slice(0, 10)].filter(Boolean).map(esc).join(', ')}</p>

    <p class="pl-label">Filed under</p>
    <div class="edit-row">
      <input id="e-brand" list="e-brands" value="${esc(r.brand)}" aria-label="Brand" placeholder="Brand">
      <input id="e-niche" list="e-niches" value="${esc(r.niche)}" aria-label="Niche" placeholder="Niche">
    </div>
    <datalist id="e-brands">${brands.map(b => `<option value="${esc(b)}">`).join('')}</datalist>
    <datalist id="e-niches">${niches.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <div class="chips">${chipList(r).map(f => `
      <button class="chip ${(r.festive || []).includes(f.name) ? 'on' : ''}" data-f="${esc(f.name)}" style="--c:${f.color}" title="${esc(f.name)}">${f.emoji} ${esc(f.name)}</button>`).join('')}
      ${S.taxonomy.festive.length > 5 ? `<button class="chip more" id="e-more">${S.chipsOpen ? 'Show less' : '+' + (S.taxonomy.festive.length - chipList(r).length) + ' more'}</button>` : ''}
      <input class="chip-input" id="e-newtag" placeholder="+ Add your own tag" aria-label="Add your own tag" autocomplete="off">
    </div>

    <div class="pl-links">
      <a href="${esc(r.contentUrl)}" target="_blank" rel="noopener">Open on ${esc(r.platform || 'Instagram')} ↗</a>
      ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Creator profile ↗</a>` : ''}
    </div>
    <button class="remove" id="e-remove">Delete this reel</button>
    <p class="pl-count">${i + 1} / ${S.items.length}</p>`;

  const save = async (key, v) => {
    v = v.trim();
    if (v === (r[key] || '')) return;
    try {
      await updateRecord(r.id, { [key]: v });
      toast(key === 'brand' ? (v ? `Moved to ${v}` : 'Moved to Unfiled') : 'Saved');
    } catch (err) { toast('Couldn\'t save: ' + err.message); load(); }
  };
  $('e-brand').addEventListener('change', e => save('brand', e.target.value));
  $('e-niche').addEventListener('change', e => save('niche', e.target.value));
  $('player-side').querySelectorAll('.chip[data-f]').forEach(b => b.addEventListener('click', async () => {
    const f = b.dataset.f;
    const cur = r.festive || [];
    b.classList.toggle('on');
    try { await updateRecord(r.id, { festive: cur.includes(f) ? cur.filter(x => x !== f) : [...cur, f] }); }
    catch (err) { toast('Couldn\'t save: ' + err.message); load(); }
  }));
  if ($('e-more')) $('e-more').addEventListener('click', () => { S.chipsOpen = !S.chipsOpen; renderPlayerSide(); });
  // Your own tag: added to the team's tag list and put on this reel
  $('e-newtag').addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const name = e.target.value.trim();
    if (!name) return;
    e.target.disabled = true;
    try {
      const tag = await addCustomTag(name);
      const cur = r.festive || [];
      if (!cur.includes(tag)) await updateRecord(r.id, { festive: [...cur, tag] });
      toast(`Tagged ${tag}`);
    } catch (err) { toast('Couldn\'t add the tag: ' + err.message); }
    S.taxonomy = await getTaxonomy();
    e.target.value = '';
    e.target.blur();
    renderPlayerSide();
  });
  $('e-remove').addEventListener('click', () => deleteReel(r.id));
}

// Client view of the side panel: the same details, nothing to edit
function renderPlayerSideReadOnly(r, i, tier) {
  const tags = (r.festive || []).map(festiveMeta);
  $('player-side').innerHTML = `
    <p class="pl-handle">${esc(handleOf(r) || 'Unknown creator')}</p>
    <p class="pl-name">${esc(r.name && r.name !== r.username ? r.name : '')}</p>
    <div class="pl-stats">
      ${r.followers ? `<div><span>${r.platform === 'YouTube' ? 'Subscribers' : 'Followers'}</span><b>${formatCount(r.followers)}</b></div>` : ''}
      ${tier.class ? `<div><span>Tier</span><b class="tier ${tier.class}">${tier.name}</b></div>` : ''}
      ${r.contentViews ? `<div><span>Views</span><b>${formatCount(r.contentViews)}</b></div>` : ''}
      ${r.contentLikes ? `<div><span>Likes</span><b>${formatCount(r.contentLikes)}</b></div>` : ''}
    </div>
    ${r.caption ? `<p class="pl-caption">${esc(r.caption)}</p>` : ''}
    ${r.niche || tags.length ? `<p class="pl-label">Filed under</p>
    <div class="chips">
      ${r.niche ? `<span class="chip on static">${esc(r.niche)}</span>` : ''}
      ${tags.map(f => `<span class="chip on static" style="--c:${f.color}">${f.emoji} ${esc(f.name)}</span>`).join('')}
    </div>` : ''}
    <div class="pl-links">
      <a href="${esc(r.contentUrl)}" target="_blank" rel="noopener">Open on ${esc(r.platform || 'Instagram')} ↗</a>
      ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Creator profile ↗</a>` : ''}
    </div>
    <p class="pl-count">${i + 1} / ${S.items.length}</p>`;
}

function closePlayer() {
  $('player').classList.add('hidden');
  $('player-frame').innerHTML = '';
  document.body.classList.remove('modal-open');
  if (S.playerIndex >= 0 && S.layout === 'carousel' && S.playerIndex !== S.index) go(S.playerIndex, false);
  S.playerIndex = -1;
  S.playerId = null;
  if (renderQueued) { renderQueued = false; render(); }
}
function stepPlayer(d) {
  if (S.playerIndex < 0 || !S.items.length) return;
  openPlayer((S.playerIndex + d + S.items.length) % S.items.length);
}
$('player-close').addEventListener('click', closePlayer);
$('player-prev').addEventListener('click', () => stepPlayer(-1));
$('player-next').addEventListener('click', () => stepPlayer(1));
$('player').addEventListener('click', e => { if (e.target === $('player')) closePlayer(); });

// ---------- brand card editor (logo + colour) ----------

let bm = null; // { original, name, logo, color, src, zoom, panX, panY, dirty }

// ---- card image sizing ----
// The card image is saved already framed at the card's shape (BAKE_W × BAKE_H), so it looks the same
// for everyone and on every screen. Older logos keep their small centred look until they're edited.
const CARD_RATIO = 1.32;
const BAKE_W = 600, BAKE_H = Math.round(600 * CARD_RATIO);
const ZOOM_MIN = 0.15;
const framed = new Map();   // image URL -> true when it was saved at the card's shape

const isFramedSize = (w, h) => w && h && Math.abs(h / w - CARD_RATIO) / CARD_RATIO < 0.015;
document.addEventListener('load', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.closest('.logo-cover, .brand-icon')) return;
  const full = isFramedSize(img.naturalWidth, img.naturalHeight);
  framed.set(img.getAttribute('src'), full);
  img.classList.toggle('full', full);
}, true);

// "Logo size" (zoom 1) matches the old look: the image fits inside 64% × 40% of the card
const logoFit = (src, W, H) => Math.min(0.64 * W / src.width, 0.40 * H / src.height);
const zoomFor = {
  logo: () => 1,
  fit: src => Math.min(BAKE_W / src.width, BAKE_H / src.height) / logoFit(src, BAKE_W, BAKE_H),
  fill: src => Math.max(BAKE_W / src.width, BAKE_H / src.height) / logoFit(src, BAKE_W, BAKE_H)
};
const zoomMax = src => Math.max(8, zoomFor.fill(src) * 3);

function drawFramed(ctx, W, H) {
  ctx.clearRect(0, 0, W, H);
  if (!bm || !bm.src) return;
  const s = logoFit(bm.src, W, H) * bm.zoom;
  const dw = bm.src.width * s, dh = bm.src.height * s;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bm.src, W / 2 - dw / 2 + bm.panX * W, H / 2 - dh / 2 + bm.panY * H, dw, dh);
}

function paintPreview() {
  const c = $('bm-canvas');
  if (!c) return;
  const r = c.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.max(1, Math.round(r.width * dpr));
  c.height = Math.max(1, Math.round(r.height * dpr));
  drawFramed(c.getContext('2d'), c.width, c.height);
  const max = zoomMax(bm.src);
  $('bm-zoom').value = Math.round(1000 * Math.log(bm.zoom / ZOOM_MIN) / Math.log(max / ZOOM_MIN));
  document.querySelectorAll('#bm-crop [data-preset]').forEach(b => b.classList.toggle('on', Math.abs(bm.zoom - zoomFor[b.dataset.preset](bm.src)) < 0.01 && !bm.panX && !bm.panY));
}

function setZoom(z, keepPan = true) {
  bm.zoom = Math.min(zoomMax(bm.src), Math.max(ZOOM_MIN, z));
  if (!keepPan) { bm.panX = 0; bm.panY = 0; }
  bm.dirty = true;
  paintPreview();
}

// Big photos are kept at up to 1600px so zooming in stays sharp
async function loadSource(blob) {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  if (k === 1) return bmp;
  return createImageBitmap(bmp, { resizeWidth: Math.round(bmp.width * k), resizeHeight: Math.round(bmp.height * k), resizeQuality: 'high' });
}

// Saved image: PNG when it has see-through parts (logos), JPEG otherwise (photos)
function bakeLogo() {
  const c = document.createElement('canvas');
  c.width = BAKE_W; c.height = BAKE_H;
  const ctx = c.getContext('2d');
  drawFramed(ctx, BAKE_W, BAKE_H);
  const px = ctx.getImageData(0, 0, BAKE_W, BAKE_H).data;
  let clear = false;
  for (let i = 3; i < px.length; i += 4 * 37) if (px[i] < 250) { clear = true; break; }
  if (!clear) return c.toDataURL('image/jpeg', 0.88);
  const png = c.toDataURL('image/png');
  return png.length < 900000 ? png : c.toDataURL('image/webp', 0.9);
}

async function openBrandModal(name) {
  const meta = name ? metaOf(name) : {};
  bm = { original: name || '', name: name || '', logo: meta.logo || '', color: meta.color || '', src: null, zoom: 1, panX: 0, panY: 0, dirty: false };
  $('bm-title').textContent = name ? 'Edit card' : 'New brand';
  $('bm-save').textContent = name ? 'Save card' : 'Create brand';
  $('bm-name').value = bm.name;
  $('bm-error').textContent = '';
  $('bm-danger').classList.toggle('hidden', !name);
  renderSwatches();
  renderBrandPreview();
  $('brand-modal').classList.remove('hidden');
  document.body.classList.add('modal-open');
  setTimeout(() => (name ? $('bm-logo').parentElement : $('bm-name')).focus(), 30);
  if (bm.logo) {
    // Load the current image so it can be resized; a card-shaped image starts filled to the card
    const mine = bm;
    try {
      const blob = await (await fetch(bm.logo)).blob();
      const src = await loadSource(blob);
      if (bm === mine) {
        bm.src = src;
        bm.zoom = isFramedSize(src.width, src.height) ? zoomFor.fit(src) : 1;
        renderBrandPreview();
      }
    } catch (e) { /* can't be resized until uploaded again */ }
  }
}
function closeBrandModal() {
  $('brand-modal').classList.add('hidden');
  document.body.classList.remove('modal-open');
  bm = null;
  if (renderQueued) { renderQueued = false; render(); }
}

function renderSwatches() {
  $('bm-swatches').innerHTML = CARD_COLORS.map(c => `
    <button type="button" class="swatch ${bm.color.toLowerCase() === c.toLowerCase() ? 'on' : ''}" data-color="${c}" title="${c || 'No colour'}" style="${c ? `--sw:${c}` : ''}">${c ? '' : '∅'}</button>`).join('') +
    `<label class="swatch custom ${bm.color && !CARD_COLORS.map(x => x.toLowerCase()).includes(bm.color.toLowerCase()) ? 'on' : ''}" title="Pick any colour" style="${bm.color ? `--sw:${bm.color}` : ''}">+<input type="color" id="bm-color" value="${bm.color || '#a6ff3d'}"></label>`;
  $('bm-color').addEventListener('input', e => { bm.color = e.target.value; renderBrandPreview(); });
  $('bm-color').addEventListener('change', () => renderSwatches());
}
$('bm-swatches').addEventListener('click', e => {
  const b = e.target.closest('[data-color]');
  if (!b) return;
  bm.color = b.dataset.color;
  renderSwatches();
  renderBrandPreview();
});

function renderBrandPreview() {
  const name = $('bm-name').value.trim() || 'Brand';
  const card = $('bm-card');
  card.style.cssText = cardStyle(bm.color);
  card.className = 'card brand-card preview-card active' + (bm.src ? ' can-frame' : '');
  const inner = bm.src
    ? `<div class="logo-cover"><canvas id="bm-canvas"></canvas></div>`
    : bm.logo
      ? `<div class="logo-cover"><img src="${esc(bm.logo)}" alt="" class="${framed.get(bm.logo) ? 'full' : ''}"></div>`
      : `<div class="logo-cover"><span class="initial">${esc(name.charAt(0).toUpperCase())}</span></div>`;
  card.style.setProperty('--glow', hexToRgb(bm.color) || DEFAULT_GLOW);
  card.innerHTML = `<div class="media"><div class="layer">${inner}</div></div>
    <div class="cap"><h2>${esc(name)}</h2><p>Preview</p></div>`;
  $('bm-crop').classList.toggle('hidden', !bm.src);
  $('bm-logo-hint').textContent = bm.src || !bm.logo
    ? 'A logo PNG with a transparent background, or any photo.'
    : 'Upload the image again to resize it.';
  if (bm.src) paintPreview();
}

// Resize and move the card image
$('bm-zoom').addEventListener('input', e => {
  if (!bm || !bm.src) return;
  const max = zoomMax(bm.src);
  setZoom(ZOOM_MIN * Math.pow(max / ZOOM_MIN, e.target.value / 1000));
});
$('bm-crop').addEventListener('click', e => {
  if (!bm || !bm.src) return;
  const stepBtn = e.target.closest('[data-step]');
  if (stepBtn) setZoom(bm.zoom * (stepBtn.dataset.step === '1' ? 1.15 : 1 / 1.15));
  const preset = e.target.closest('[data-preset]');
  if (preset) setZoom(zoomFor[preset.dataset.preset](bm.src), false);
});
let frameDrag = null;
$('bm-card').addEventListener('pointerdown', e => {
  if (!bm || !bm.src) return;
  e.preventDefault();
  $('bm-card').setPointerCapture(e.pointerId);
  const r = $('bm-card').getBoundingClientRect();
  frameDrag = { x: e.clientX, y: e.clientY, panX: bm.panX, panY: bm.panY, w: r.width, h: r.height };
  $('bm-card').classList.add('framing');
});
$('bm-card').addEventListener('pointermove', e => {
  if (!frameDrag) return;
  bm.panX = frameDrag.panX + (e.clientX - frameDrag.x) / frameDrag.w;
  bm.panY = frameDrag.panY + (e.clientY - frameDrag.y) / frameDrag.h;
  bm.dirty = true;
  paintPreview();
});
const endFrameDrag = () => { frameDrag = null; $('bm-card').classList.remove('framing'); };
$('bm-card').addEventListener('pointerup', endFrameDrag);
$('bm-card').addEventListener('pointercancel', endFrameDrag);
$('bm-card').addEventListener('wheel', e => {
  if (!bm || !bm.src) return;
  e.preventDefault();
  setZoom(bm.zoom * Math.exp(-e.deltaY * 0.0015));
}, { passive: false });
document.addEventListener('keydown', e => {
  if (!bm || !bm.src || $('brand-modal').classList.contains('hidden') || document.activeElement === $('bm-name')) return;
  const moves = { ArrowLeft: [-0.02, 0], ArrowRight: [0.02, 0], ArrowUp: [0, -0.02], ArrowDown: [0, 0.02] };
  if (document.activeElement === $('bm-card') && moves[e.key]) {
    e.preventDefault();
    bm.panX += moves[e.key][0]; bm.panY += moves[e.key][1]; bm.dirty = true; paintPreview();
  }
});
$('bm-name').addEventListener('input', renderBrandPreview);

// Logos are resized to 400px before upload so they load fast for the whole team
$('bm-logo').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    bm.src = await loadSource(file);
    bm.zoom = 1; bm.panX = 0; bm.panY = 0; bm.dirty = true;
    $('bm-error').textContent = '';
    renderBrandPreview();
  } catch (err) {
    $('bm-error').textContent = 'That file couldn\'t be read as an image. Try a PNG or JPG.';
  }
});
$('bm-logo-clear').addEventListener('click', () => { bm.logo = ''; bm.src = null; bm.dirty = false; renderBrandPreview(); });
$('bm-cancel').addEventListener('click', closeBrandModal);
$('brand-modal').addEventListener('click', e => { if (e.target === $('brand-modal')) closeBrandModal(); });

$('bm-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('bm-name').value.trim();
  if (!name) { $('bm-error').textContent = 'Give the brand a name.'; return; }
  if (name.toLowerCase() === 'unfiled') { $('bm-error').textContent = 'Pick another name. "Unfiled" is used for saves without a brand.'; return; }
  if (!bm.original && brandNames().some(b => b.toLowerCase() === name.toLowerCase())) { $('bm-error').textContent = 'That brand already exists.'; return; }
  const btn = $('bm-save');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    if (bm.original && name !== bm.original) {
      await renameBrandEverywhere(bm.original, name);
      if (S.brand === bm.original) S.brand = name;
    }
    if (bm.src && bm.dirty) bm.logo = bakeLogo();
    const before = bm.original ? metaOf(name) : {};
    const patch = {};
    if (bm.logo !== (before.logo || '')) patch.logo = bm.logo;
    if (bm.color !== (before.color || '')) patch.color = bm.color;
    if (Object.keys(patch).length || !bm.original) await setBrandMeta(name, patch);
    const created = !bm.original;
    closeBrandModal();
    toast(created ? `${name} added` : 'Card saved');
    await load();
    if (created) {
      const i = S.items.findIndex(it => it.name === name);
      if (i !== -1) go(i);
    }
  } catch (err) {
    $('bm-error').textContent = 'Couldn\'t save: ' + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = bm && bm.original ? 'Save card' : 'Create brand';
  }
});

$('new-brand').addEventListener('click', () => openBrandModal(''));
$('edit-card').addEventListener('click', () => { if (S.brand && S.brand !== UNFILED) openBrandModal(S.brand); });

// ---------- confirm dialog ----------

let confirmResolve = null;
// Simple "Are you sure?" or, with typeText, the GitHub-style "type the name to confirm"
function confirmDialog({ title, html, okLabel = 'Delete', typeText = '' }) {
  $('cf-title').textContent = title;
  $('cf-text').innerHTML = html;
  $('cf-ok').textContent = okLabel;
  $('cf-type-wrap').classList.toggle('hidden', !typeText);
  $('cf-type').value = '';
  $('cf-type-label').innerHTML = typeText ? `Type <b>${esc(typeText)}</b> to confirm.` : '';
  $('cf-ok').disabled = !!typeText;
  $('cf-ok').dataset.need = typeText;
  $('confirm').classList.remove('hidden');
  document.body.classList.add('modal-open');
  setTimeout(() => (typeText ? $('cf-type') : $('cf-cancel')).focus(), 30);
  return new Promise(res => { confirmResolve = res; });
}
function closeConfirm(answer) {
  $('confirm').classList.add('hidden');
  if (!$('player').classList.contains('hidden') || !$('brand-modal').classList.contains('hidden')) { /* another dialog is still open */ }
  else document.body.classList.remove('modal-open');
  if (confirmResolve) { confirmResolve(answer); confirmResolve = null; }
}
$('cf-type').addEventListener('input', e => { $('cf-ok').disabled = e.target.value !== $('cf-ok').dataset.need; });
$('cf-form').addEventListener('submit', e => { e.preventDefault(); if (!$('cf-ok').disabled) closeConfirm(true); });
$('cf-cancel').addEventListener('click', () => closeConfirm(false));
$('confirm').addEventListener('click', e => { if (e.target === $('confirm')) closeConfirm(false); });

// ---------- deleting ----------

async function deleteReel(id) {
  const r = S.records.find(x => x.id === id);
  if (!r) return;
  const ok = await confirmDialog({
    title: 'Delete this reel?',
    html: `<p>${esc(handleOf(r) || 'This reel')}'s reel is removed from ${esc(brandLabel(brandOf(r)))} on the board for everyone.</p>`,
    okLabel: 'Delete reel'
  });
  if (!ok) return;
  try {
    await deleteRecord(id);
    if (S.playerId === id) closePlayer();
    toast('Reel deleted');
  } catch (err) { toast('Couldn\'t delete: ' + err.message); }
}

// ---------- editing Category / Type / Niche in the creators list ----------
// Each cell opens a dropdown; the value is saved on every row of that creator in this brand.

const CREATOR_TYPES = ['Beauty', 'Business & Finance', 'Cinematographer / Photographer', 'Comedy & Memes', 'Dance', 'Education', 'Fashion', 'Fitness', 'Food', 'Gaming', 'Lifestyle & Vlogs', 'Motivation & Self-help', 'Music', 'News & Commentary', 'Tech & Gadgets', 'Travel'];

function editCell(field, c, value) {
  const shown = value && value !== '--' && value !== 'None' ? value : '';
  if (SHARE) return `<td>${esc(shown || '--')}</td>`;
  return `<td class="ed" data-k="${field}" data-user="${esc(c.platform + ':' + c.username)}" data-v="${esc(shown)}" title="Click to edit"><span class="ed-v">${esc(shown || '--')}</span><span class="ed-caret" aria-hidden="true">▾</span></td>`;
}

function rowsOfCreator(key) {
  const [platform, ...rest] = key.split(':');
  const user = rest.join(':').toLowerCase().replace(/^@/, '');
  return brandRecords().filter(r => r.platform === platform && String(r.username).toLowerCase().replace(/^@/, '') === user);
}

function openCellEditor(td) {
  if (td.querySelector('.cell-in')) return;
  const field = td.dataset.k;
  const cur = field === 'niche' ? (td.dataset.v.split(', ')[0] || '') : td.dataset.v;
  let html;
  if (field === 'type') {
    const opts = CREATOR_TYPES.includes(cur) || !cur ? CREATOR_TYPES : [cur, ...CREATOR_TYPES];
    html = `<select class="cell-in"><option value="">--</option>${opts.map(t => `<option value="${esc(t)}" ${t === cur ? 'selected' : ''}>${esc(t)}</option>`).join('')}<option value="__other">Other…</option></select>`;
  } else {
    const pool = field === 'niche'
      ? (S.taxonomy.brands[S.brand] || [])
      : [...new Set(S.records.map(r => r.category).filter(x => x && !['--', 'None'].includes(x)))].sort();
    html = `<input class="cell-in" list="dl-${field}" value="${esc(cur)}" placeholder="${field === 'niche' ? 'Pick or type a niche' : 'Pick or type a category'}">
      <datalist id="dl-${field}">${pool.map(o => `<option value="${esc(o)}">`).join('')}</datalist>`;
  }
  td.innerHTML = html;
  let closed = false;
  const save = async v => {
    if (closed) return;
    closed = true;
    v = String(v || '').trim();
    if (v === cur) { renderCreators(); return; }
    try {
      for (const r of rowsOfCreator(td.dataset.user)) if ((r[field] || '') !== v) await updateRecord(r.id, { [field]: v });
      toast('Saved');
    } catch (err) { toast('Couldn\'t save: ' + err.message); }
    renderCreators();
  };
  const cancel = () => { if (closed) return; closed = true; renderCreators(); };
  const bind = el => {
    el.focus();
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); save(el.value); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
    });
    if (el.tagName === 'SELECT') {
      el.addEventListener('change', () => {
        if (el.value !== '__other') return save(el.value);
        // a type that isn't in the list: switch to a text box
        td.innerHTML = '<input class="cell-in" placeholder="Type a creator type">';
        bind(td.querySelector('.cell-in'));
      });
      el.addEventListener('blur', () => setTimeout(() => { if (td.contains(el) && el.value !== '__other') cancel(); }, 120));
    } else {
      el.select();
      el.addEventListener('blur', () => save(el.value));
    }
  };
  bind(td.querySelector('.cell-in'));
}

// Removes a creator from this brand: their profile row and any of their reels filed here
async function removeCreator(key) {
  const [platform, ...rest] = key.split(':');
  const user = rest.join(':').toLowerCase().replace(/^@/, '');
  const rows = brandRecords().filter(r => r.platform === platform && String(r.username).toLowerCase().replace(/^@/, '') === user);
  if (!rows.length) return;
  const reels = rows.filter(isContent).length;
  const ok = await confirmDialog({
    title: `Remove ${handleOf(rows[0])}?`,
    html: `<p>${esc(handleOf(rows[0]))} is removed from ${esc(brandLabel(S.brand))} for everyone${reels ? `, with ${reels} ${reels === 1 ? 'reel' : 'reels'}` : ''}. The master database isn't touched.</p>`,
    okLabel: 'Remove'
  });
  if (!ok) return;
  try {
    for (const r of rows) await deleteRecord(r.id);
    toast(`${handleOf(rows[0])} removed`);
  } catch (err) { toast('Couldn\'t remove: ' + err.message); }
}

async function deleteBrand(name) {
  const recs = S.records.filter(r => r.brand === name);
  const reels = recs.filter(isContent).length;
  const creators = creatorsOf(recs).length;
  const ok = await confirmDialog({
    title: `Delete ${name}?`,
    html: `<p>This permanently deletes the <b>${esc(name)}</b> card and everything filed under it for the whole team: ${reels} ${reels === 1 ? 'reel' : 'reels'} and ${creators} ${creators === 1 ? 'creator' : 'creators'}.</p>
      <p>It can't be undone. Copies already sent to the master database stay there.</p>`,
    okLabel: 'Delete this brand',
    typeText: name
  });
  if (!ok) return;
  try {
    await deleteBrandEverywhere(name);
    closeBrandModal();
    if (S.brand === name) goHome();
    toast(`${name} deleted`);
  } catch (err) { toast('Couldn\'t delete: ' + err.message); }
}
$('bm-delete').addEventListener('click', () => { if (bm && bm.original) deleteBrand(bm.original); });

// ---------- copy links ----------

$('copy-links').addEventListener('click', async () => {
  const recs = S.brand === null ? S.items.flatMap(b => b.recs) : brandRecords();
  if (!recs.length) return toast('Nothing to copy in this view');
  const tree = {};
  recs.forEach(r => {
    const b = brandLabel(brandOf(r));
    const n = isContent(r) ? (r.niche || NO_NICHE) : 'Creators';
    ((tree[b] = tree[b] || {})[n] = tree[b][n] || []).push(r);
  });
  const lines = [];
  Object.entries(tree).forEach(([b, ns]) => {
    lines.push(b);
    Object.entries(ns).forEach(([n, rs]) => {
      lines.push(`  ${n}`);
      rs.forEach(r => lines.push(`    ${handleOf(r)}${(r.festive || []).length ? ' [' + r.festive.join(', ') + ']' : ''}: ${r.contentUrl || r.url}`));
    });
    lines.push('');
  });
  const ok = await copyToClipboard(lines.join('\n').trim());
  toast(ok ? `Copied ${recs.length} link${recs.length > 1 ? 's' : ''}` : 'Copy was blocked. Click the page once and try again.');
});

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------- render ----------

function render() {
  $('share-btn').classList.toggle('hidden', SHARE || !teamOn() || S.brand === null || S.brand === UNFILED);
  if (S.brand !== null && S.brand !== UNFILED && !brandNames().includes(S.brand)) S.brand = null;
  const creatorsTab = S.brand !== null && S.tab === 'creators';
  S.items = S.brand === null ? brandItems() : creatorsTab ? [] : reelItems();
  renderHero();
  renderFilters();

  const empty = !S.items.length;
  const grid = S.layout === 'grid' && S.brand !== null && !creatorsTab;
  // Carousel views fit in one screen; the grid and the creators list scroll
  document.body.classList.toggle('fit', !grid && !creatorsTab);
  $('stage').classList.toggle('hidden', grid || empty || creatorsTab);
  $('grid').classList.toggle('hidden', !grid || empty || creatorsTab);
  $('creators').classList.toggle('hidden', !creatorsTab);
  document.body.classList.toggle('is-empty', empty && !creatorsTab);

  if (creatorsTab) { S.itemsKey = ''; $('ring').innerHTML = ''; cardEls = []; renderCreators(); $('info').innerHTML = ''; return; }
  if (empty) {
    S.itemsKey = '';
    $('ring').innerHTML = '';
    cardEls = [];
    $('info').innerHTML = (S.q || activeFilterCount())
      ? `<p class="empty">Nothing matches. Clear the search or a filter to see more.</p>`
      : S.brand !== null ? `<p class="empty">No reels for ${esc(brandLabel(S.brand))} yet. Use “+ Add links”, or open a reel and save it with the extension.</p>` : '';
    return;
  }
  if (grid) buildGrid(); else buildStage();
  renderInfo();
}

load();
if (SHARE) startShareView();
else startTeamSync();

// ---------- client link: what the client sees ----------

async function loadShared(first) {
  const msg = $('share-msg');
  if (!SCOUT_SHARE) { msg.textContent = 'This link isn\'t complete. Check you copied all of it.'; return; }
  try {
    const res = await fetch(`${TEAM_DB_URL}?action=shared&t=${encodeURIComponent(SCOUT_SHARE)}&_=${Date.now()}`, { credentials: 'omit' });
    const d = await res.json();
    if (!d.ok) throw new Error(d.error || 'This moodboard couldn\'t be loaded.');
    const b = d.brand;
    await setTaxonomy({
      brands: { [b.name]: b.niches || [] },
      meta: { [b.name]: { logo: b.logo || '', color: b.color || '' } },
      festive: withDefaultTypes(d.festive && d.festive.length ? d.festive : DEFAULT_FESTIVE.slice()),
      shares: {}
    });
    await setRecords((d.records || []).map(r => ({ ...normalizeRecord(r), synced: true })));
    document.title = `${b.name} · Moodboard`;
    if (first) {
      await load();
      openBrand(b.name);
      document.body.classList.add('share-ready');
      msg.textContent = '';
    }
  } catch (e) {
    if (first) msg.textContent = e.message && !/Failed to fetch|JSON/.test(e.message) ? e.message : 'This moodboard couldn\'t be loaded. Check your connection and refresh.';
  }
}

function startShareView() {
  $('share-msg').textContent = 'Loading the moodboard…';
  $('home-link').removeAttribute('href');
  loadShared(true);
  // Stays live: new reels the team adds show up without a refresh
  setInterval(() => { if (!document.hidden) loadShared(false); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadShared(false); });
}

// ---------- client link: creating it (team side) ----------

async function renderShareModal() {
  const name = S.brand;
  const token = (S.taxonomy.shares || {})[name];
  const url = shareUrl(token);
  $('sh-title').textContent = `Share ${brandLabel(name)} with a client`;
  $('sh-text').textContent = token
    ? `Anyone with this link sees the ${brandLabel(name)} moodboard, its reels and creators, the way you see it here. It updates as the team adds reels. They can't edit anything or see other brands.`
    : `Create a private link to the ${brandLabel(name)} moodboard. Whoever you send it to sees this brand's reels and creators, the way you see them here, and nothing else. They can't edit anything.`;
  $('sh-link').classList.toggle('hidden', !token);
  $('sh-manage').classList.toggle('hidden', !token);
  $('sh-create').classList.toggle('hidden', !!token);
  $('sh-url').value = url;
  $('sh-error').textContent = '';
}

function openShareModal() {
  if (S.brand === null || S.brand === UNFILED) return;
  renderShareModal();
  $('share-modal').classList.remove('hidden');
  document.body.classList.add('modal-open');
  setTimeout(() => ($('sh-create').classList.contains('hidden') ? $('sh-copy') : $('sh-create')).focus(), 30);
}
function closeShareModal() {
  $('share-modal').classList.add('hidden');
  document.body.classList.remove('modal-open');
}

async function shareAction(btn, fn) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Working…';
  try { await fn(); S.taxonomy = await getTaxonomy(); renderShareModal(); }
  catch (err) { $('sh-error').textContent = err.message || String(err); }
  finally { btn.disabled = false; btn.textContent = label; }
}

$('share-btn').addEventListener('click', openShareModal);
$('sh-close').addEventListener('click', closeShareModal);
$('share-modal').addEventListener('click', e => { if (e.target === $('share-modal')) closeShareModal(); });
$('sh-create').addEventListener('click', () => shareAction($('sh-create'), async () => {
  const token = await shareBrand(S.brand);
  if (await copyToClipboard(shareUrl(token))) toast('Link created and copied');
}));
$('sh-copy').addEventListener('click', async () => {
  $('sh-url').select();
  toast(await copyToClipboard($('sh-url').value) ? 'Link copied' : 'Copy was blocked. Select the link and copy it.');
});
$('sh-open').addEventListener('click', () => window.open($('sh-url').value, '_blank', 'noopener'));
$('sh-new').addEventListener('click', async () => {
  closeShareModal();
  const ok = await confirmDialog({ title: 'Make a new link?', html: `<p>The current link for ${esc(brandLabel(S.brand))} stops working. Anyone you sent it to will need the new one.</p>`, okLabel: 'Make new link' });
  openShareModal();
  if (ok) shareAction($('sh-new'), async () => { const token = await shareBrand(S.brand, true); if (await copyToClipboard(shareUrl(token))) toast('New link created and copied'); });
});
$('sh-off').addEventListener('click', async () => {
  closeShareModal();
  const ok = await confirmDialog({ title: 'Turn off this link?', html: `<p>Anyone with the link to ${esc(brandLabel(S.brand))} won't be able to open it any more. You can create a new link later.</p>`, okLabel: 'Turn off' });
  openShareModal();
  if (ok) shareAction($('sh-off'), async () => { await unshareBrand(S.brand); toast('Link turned off'); });
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('share-modal').classList.contains('hidden')) closeShareModal(); });

// ---------- updates ----------
// Installs by itself when the folder is already allowed (on open, or later while the tab is in the background);
// otherwise shows an "Update to x" button that opens the update page.
async function updateCheck({ force = false, install = true } = {}) {
  const u = install
    ? await autoUpdate({ force, onStart: v => toast(`Updating Creator Scout to ${v}…`) })
    : await checkForUpdate(force);
  if (u.installing) return;
  const b = $('update-btn');
  b.classList.toggle('hidden', !u.available);
  if (u.available) b.textContent = `Update to ${u.latest}`;
}
$('update-btn').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('update.html?go=1') }));
$('check-updates').textContent = `Check for updates (you're on ${chrome.runtime.getManifest().version})`;
$('check-updates').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('update.html') }));
if (!SHARE) {
  updateCheck({ force: true });
  setInterval(() => updateCheck({ install: document.hidden }), 15 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) updateCheck({ install: false }); });
}
if (!SHARE) takeJustUpdated().then(u => { if (u) setTimeout(() => toast(`Creator Scout updated to ${u.to}`), 600); });
