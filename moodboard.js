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
  niche: null,
  festive: new Set(),
  platform: 'all',
  q: '',
  index: -1,
  homeIndex: -1,
  layout: 'carousel',
  items: [],
  itemsKey: '',
  chipsOpen: false,
  playerIndex: -1
};

const UNFILED = '__unfiled';
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
  const a = document.activeElement;
  return a && a.matches('input, textarea, select') && (a.closest('#info') || a.closest('.modal') || a.closest('#add-links'));
};

async function load() {
  const all = (await getRecords()).map(normalizeRecord);
  S.records = all.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  S.taxonomy = await getTaxonomy();
  S.taxonomy.meta = S.taxonomy.meta || {};
  if (isEditing()) { renderQueued = true; return; }
  render();
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
    (!S.niche || (r.niche || NO_NICHE) === S.niche) &&
    passesFilters(r) && matchesQuery(r, q)
  ).map(r => ({ kind: 'reel', key: r.id, rec: r }));
}

// ---------- hero & filters ----------

function renderHero() {
  const inBrand = S.brand !== null;
  $('back').classList.toggle('hidden', !inBrand);
  $('view-tabs').classList.toggle('hidden', !inBrand);
  $('brand-actions').classList.toggle('hidden', !inBrand || S.brand === UNFILED);
  $('reel-tools').classList.toggle('hidden', !inBrand || S.tab !== 'reels');
  if (!inBrand || S.tab !== 'reels') $('add-links').classList.add('hidden');
  document.body.classList.toggle('in-brand', inBrand);
  $('search').placeholder = !inBrand ? 'Search brands, creators, captions' : S.tab === 'creators' ? 'Search creators' : 'Search creators, captions, niches';

  if (!inBrand) {
    const brands = brandNames().filter(b => b !== UNFILED).length;
    $('title').innerHTML = 'Everything you scouted,<br>filed by brand';
    $('title').removeAttribute('title');
    $('sub').textContent = S.records.length
      ? `${S.records.length} saved${brands ? ` across ${brands} ${brands === 1 ? 'brand' : 'brands'}` : ', none filed under a brand yet'}. Swipe, drag or use the arrow keys, and open a card to see its reels and creators.`
      : 'Open a reel or a creator, click Creator Scout and save. It lands here for the whole team straight away.';
  } else {
    const all = brandRecords();
    const reels = all.filter(isContent).length;
    const creators = creatorsOf(all).length;
    $('title').textContent = brandLabel(S.brand);
    $('title').title = S.brand === UNFILED ? '' : 'Double-click to rename';
    $('sub').textContent = S.brand === UNFILED
      ? `${all.length} saved without a brand. Give them a brand to file them.`
      : `${reels} ${reels === 1 ? 'reel' : 'reels'} and ${creators} ${creators === 1 ? 'creator' : 'creators'}.`;
    $('count-reels').textContent = reels;
    $('count-creators').textContent = creators;
    document.querySelectorAll('#view-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  }
}

function renderFilters() {
  if (S.brand !== null && S.tab === 'creators') { $('filters').innerHTML = ''; return; }
  const scope = (S.brand === null ? S.records : brandRecords()).filter(r => S.brand === null || isContent(r));
  let html = '';

  if (S.brand !== null) {
    const niches = nicheCounts(scope);
    if (niches.length > 1 || S.niche) {
      html += `<div class="pill-row">
        <button class="fpill ${!S.niche ? 'on' : ''}" data-niche="">All niches <span>${scope.length}</span></button>
        ${niches.map(([n, c]) => `<button class="fpill ${S.niche === n ? 'on' : ''}" data-niche="${esc(n)}">${esc(n)} <span>${c}</span></button>`).join('')}
      </div>`;
    }
  }

  const fc = {};
  scope.forEach(r => (r.festive || []).forEach(f => { fc[f] = (fc[f] || 0) + 1; }));
  const tags = S.taxonomy.festive.filter(f => fc[f.name] || S.festive.has(f.name));
  const platforms = new Set(scope.map(r => r.platform));
  const showPlat = platforms.size > 1 || S.platform !== 'all';
  if (tags.length || showPlat) {
    html += `<div class="pill-row">
      ${tags.map(f => `<button class="fpill festive ${S.festive.has(f.name) ? 'on' : ''}" data-festive="${esc(f.name)}" style="--c:${f.color}">${f.emoji} ${esc(f.name)} <span>${fc[f.name] || 0}</span></button>`).join('')}
      ${showPlat ? `${tags.length ? '<span class="sep"></span>' : ''}
        ${['all', 'Instagram', 'YouTube'].map(p => `<button class="fpill ${S.platform === p ? 'on' : ''}" data-platform="${p}">${p === 'all' ? 'Both' : p}</button>`).join('')}` : ''}
    </div>`;
  }
  $('filters').innerHTML = html;
}

$('filters').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if ('niche' in b.dataset) S.niche = b.dataset.niche || null;
  if ('festive' in b.dataset) { const f = b.dataset.festive; S.festive.has(f) ? S.festive.delete(f) : S.festive.add(f); }
  if ('platform' in b.dataset) S.platform = b.dataset.platform;
  S.index = -1;
  render();
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
    if (meta.logo) return `<div class="logo-cover"><img src="${esc(meta.logo)}" alt="" draggable="false"></div>`;
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
  const inner = coverHTML(item);
  const mosaic = item.kind === 'brand' && !metaOf(item.name).logo && !metaOf(item.name).color && thumbsFor(item).length >= 4 ? 'mosaic' : '';
  return `<div class="media">
    <div class="layer color ${mosaic}">${inner}</div>
    <div class="layer tone ${mosaic}">${inner}</div>
    <span class="scan" aria-hidden="true"></span>
  </div>`;
}

function cardHTML(item, i) {
  if (item.kind === 'brand') {
    const meta = metaOf(item.name);
    const reels = item.recs.filter(isContent).length;
    const creators = creatorsOf(item.recs).length;
    const fest = [...new Set(item.recs.flatMap(r => r.festive || []))].slice(0, 4).map(f => festiveMeta(f).emoji).join(' ');
    return `<article class="card brand-card" data-i="${i}" tabindex="-1" aria-label="${esc(brandLabel(item.name))}" style="${cardStyle(meta.color)}">
      ${mediaHTML(item)}
      ${fest ? `<span class="fest">${fest}</span>` : ''}
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
    <div class="cap">
      <h2>${esc(handleOf(r) || (r.platform === 'YouTube' ? 'YouTube video' : 'Instagram reel'))}</h2>
      <p>${[stat, r.niche].filter(Boolean).map(esc).join(', ')}</p>
    </div>
  </article>`;
}

// ---------- carousel geometry ----------

let pos = 0;
let cardEls = [];

function geometry() {
  const w = window.innerWidth;
  const reel = S.brand !== null;
  const cardW = reel ? Math.max(140, Math.min(190, w * 0.13)) : Math.max(170, Math.min(250, w * 0.17));
  const cardH = reel ? cardW * 16 / 9 : cardW * 1.32;
  const gap = Math.max(18, w * 0.016);
  const R = Math.max(900, w * 0.95);
  return { cardW, cardH, gap, R, step: Math.asin(Math.min(0.9, (cardW + gap) / R)) };
}

const looping = () => S.items.length >= 5;
function wrapD(d) {
  const n = S.items.length;
  if (!looping()) return d;
  return ((d % n) + n * 1.5) % n - n / 2;
}
const norm = i => {
  const n = S.items.length;
  return looping() ? ((Math.round(i) % n) + n) % n : Math.max(0, Math.min(n - 1, Math.round(i)));
};

function layout(p = S.index, animate = true) {
  const g = geometry();
  const ring = $('ring');
  ring.style.setProperty('--cw', g.cardW + 'px');
  ring.style.setProperty('--ch', g.cardH + 'px');
  ring.style.height = (g.cardH * 1.16 + 16) + 'px';
  ring.classList.toggle('no-anim', !animate);
  const active = norm(p);
  cardEls.forEach((c, i) => {
    const d = wrapD(i - p);
    const ad = Math.abs(d);
    if (c._d !== undefined && Math.abs(d - c._d) > S.items.length / 2) {
      c.style.transition = 'none';
      requestAnimationFrame(() => requestAnimationFrame(() => { c.style.transition = ''; }));
    }
    c._d = d;
    const t = d * g.step;
    const x = g.R * Math.sin(t);
    const z = g.R * (1 - Math.cos(t)) * 0.85;
    const ry = -t * (180 / Math.PI) * 1.05;
    c.style.transform = `translate3d(${x}px, 0, ${z}px) rotateY(${ry}deg)`;
    const hide = ad > 3.6;
    c.style.opacity = hide ? 0 : 1;
    c.style.visibility = ad > 4.2 ? 'hidden' : '';
    c.style.pointerEvents = hide ? 'none' : '';
    c.style.zIndex = String(100 - Math.round(ad * 10));
    c.classList.toggle('active', i === active);
  });
  $('counter').textContent = S.items.length ? `${String(active + 1).padStart(2, '0')} / ${String(S.items.length).padStart(2, '0')}` : '';
  $('prev').disabled = !looping() && active <= 0;
  $('next').disabled = !looping() && active >= S.items.length - 1;
}

function go(i, animate = true) {
  if (!S.items.length) return;
  const target = looping() ? i : Math.max(0, Math.min(S.items.length - 1, i));
  const n = norm(target);
  const changed = n !== S.index;
  S.index = n;
  pos = looping() ? target : n;
  layout(pos, animate);
  if (changed || !animate) renderInfo();
}

function buildStage() {
  const key = (S.brand ?? '~') + '|' + S.items.map(it => it.key + ':' + (it.kind === 'brand'
    ? it.recs.length + ':' + JSON.stringify(metaOf(it.name)) + ':' + thumbsFor(it).join('').length
    : (it.rec.thumb || '').length + ':' + (it.rec.festive || []).join() + ':' + it.rec.niche)).join(',');
  const ring = $('ring');
  if (key !== S.itemsKey) {
    S.itemsKey = key;
    ring.innerHTML = S.items.map(cardHTML).join('');
    cardEls = [...ring.querySelectorAll('.card')];
    cardEls.forEach(c => c.querySelectorAll('img').forEach(img => img.addEventListener('error', () => img.remove(), { once: true })));
  }
  if (S.index < 0) S.index = Math.floor(S.items.length / 2);
  S.index = Math.min(S.index, Math.max(0, S.items.length - 1));
  pos = S.index;
  layout(S.index, false);
  requestAnimationFrame(() => $('ring').classList.remove('no-anim'));
}

// ---------- grid ----------

function buildGrid() {
  $('grid').innerHTML = S.items.map(cardHTML).join('');
}
$('grid').addEventListener('click', e => {
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

// ---------- interaction (drag, wheel, keys) ----------

const stage = $('stage');
let drag = null;

function endDrag(e, cancelled) {
  if (!drag) return;
  const wasDrag = drag.moved;
  drag = null;
  stage.classList.remove('dragging');
  if (wasDrag) { go(Math.round(pos)); return; }
  if (cancelled || !e) return;
  const c = e.target.closest && e.target.closest('.card');
  if (!c || !stage.contains(c)) return;
  const i = +c.dataset.i;
  if (i !== S.index) go(Math.round(pos) + Math.round(wrapD(i - pos)));
  else activate(S.items[i]);
}

stage.addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.target.closest('.arrow')) return;
  drag = { x: e.clientX, y: e.clientY, start: pos, moved: false, id: e.pointerId };
});
window.addEventListener('pointermove', e => {
  if (!drag) return;
  // The button was released somewhere we didn't hear about: stop dragging
  if (e.pointerType === 'mouse' && e.buttons === 0) { endDrag(null, true); return; }
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  if (!drag.moved) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // vertical swipe: let the page scroll
    if (Math.abs(dx) < 6) return;
    drag.moved = true;
    try { stage.setPointerCapture(drag.id); } catch (err) { /* ignore */ }
    stage.classList.add('dragging');
  }
  const g = geometry();
  pos = drag.start - dx / (g.cardW + g.gap);
  if (!looping()) pos = Math.max(-0.4, Math.min(S.items.length - 0.6, pos));
  layout(pos, false);
});
window.addEventListener('pointerup', e => endDrag(e, false));
window.addEventListener('pointercancel', () => endDrag(null, true));
window.addEventListener('blur', () => endDrag(null, true));

// Only sideways scrolling (trackpad swipe or Shift + wheel) moves the carousel; normal scrolling scrolls the page
let wheelAcc = 0, wheelLock = false;
stage.addEventListener('wheel', e => {
  const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.2;
  if (!sideways && !e.shiftKey) return;
  e.preventDefault();
  if (wheelLock) return;
  wheelAcc += sideways ? e.deltaX : e.deltaY;
  if (Math.abs(wheelAcc) > 40) {
    go(Math.round(pos) + Math.sign(wheelAcc));
    wheelAcc = 0;
    wheelLock = true;
    setTimeout(() => { wheelLock = false; }, 280);
  }
}, { passive: false });

$('prev').addEventListener('click', () => go(Math.round(pos) - 1));
$('next').addEventListener('click', () => go(Math.round(pos) + 1));

document.addEventListener('keydown', e => {
  if (!$('player').classList.contains('hidden')) {
    if (e.key === 'Escape') closePlayer();
    if (e.key === 'ArrowRight') stepPlayer(1);
    if (e.key === 'ArrowLeft') stepPlayer(-1);
    return;
  }
  if (!$('brand-modal').classList.contains('hidden')) { if (e.key === 'Escape') closeBrandModal(); return; }
  if (e.target.matches('input, textarea, select')) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  const carousel = !$('stage').classList.contains('hidden');
  if (carousel && e.key === 'ArrowRight') { e.preventDefault(); go(Math.round(pos) + 1); }
  else if (carousel && e.key === 'ArrowLeft') { e.preventDefault(); go(Math.round(pos) - 1); }
  else if (carousel && e.key === 'Enter' && S.items[S.index]) activate(S.items[S.index]);
  else if (e.key === 'Escape' && S.brand !== null) goHome();
  else if (e.key === '/') { e.preventDefault(); $('search').focus(); }
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (!$('stage').classList.contains('hidden')) layout(S.index, false); }, 80);
});

function activate(item) {
  if (!item) return;
  if (item.kind === 'brand') openBrand(item.name);
  else openPlayer(S.index);
}

function openBrand(name) {
  S.homeIndex = S.index;
  S.brand = name;
  S.tab = brandRecordsFor(name).some(isContent) ? 'reels' : 'creators';
  S.niche = null;
  S.q = '';
  $('search').value = '';
  S.index = -1;
  render();
  window.scrollTo({ top: 0 });
}
const brandRecordsFor = name => S.records.filter(r => brandOf(r) === name);

function goHome() {
  S.brand = null;
  S.niche = null;
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
  if (S.brand === null || S.brand === UNFILED) return;
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

// ---------- info row under the carousel ----------

function renderInfo() {
  const info = $('info');
  const item = S.items[S.index];
  if (!item || S.layout === 'grid' || (S.brand !== null && S.tab === 'creators')) { info.innerHTML = ''; return; }

  if (item.kind === 'brand') {
    const recs = item.recs;
    const niches = nicheCounts(recs.filter(isContent));
    const fc = {};
    recs.forEach(r => (r.festive || []).forEach(f => { fc[f] = (fc[f] || 0) + 1; }));
    const fest = Object.entries(fc).sort((a, b) => b[1] - a[1]);
    const creators = creatorsOf(recs).slice(0, 3);
    info.innerHTML = `
      <div class="feat">
        <h3>Niches</h3>
        <p>${niches.length ? niches.map(([n, c]) => `${esc(n)} <b>${c}</b>`).join('<br>') : 'None yet. Add a niche when you save a reel.'}</p>
      </div>
      <div class="feat">
        <h3>Festive</h3>
        <p>${fest.length ? fest.map(([f, c]) => `${festiveMeta(f).emoji} ${esc(f)} <b>${c}</b>`).join('<br>') : 'No festive tags here yet.'}</p>
      </div>
      <div class="feat">
        <h3>Top creators</h3>
        <p>${creators.length ? creators.map(c => `${esc(handleOf(c))} <b>${formatCount(c.followers)}</b>`).join('<br>') : 'No creators yet.'}</p>
      </div>
      <div class="cta-row">
        <button class="open-cta glow-pill" id="open-brand">Open ${esc(brandLabel(item.name))} <span aria-hidden="true">→</span></button>
        ${item.name !== UNFILED ? '<button class="ghost-btn" id="edit-this-card">Edit card</button>' : ''}
      </div>`;
    $('open-brand').addEventListener('click', () => openBrand(item.name));
    if ($('edit-this-card')) $('edit-this-card').addEventListener('click', () => openBrandModal(item.name));
    return;
  }

  const r = item.rec;
  const tier = calculateTier(r.followers);
  const headline = r.contentViews ? `${formatCount(r.contentViews)} views` : (r.contentLikes ? `${formatCount(r.contentLikes)} likes` : 'No stats yet');
  const brands = brandNames().filter(b => b !== UNFILED);
  const niches = r.brand ? (S.taxonomy.brands[r.brand] || []) : [];
  info.innerHTML = `
    <div class="feat">
      <h3>${esc(handleOf(r) || 'Unknown creator')}</h3>
      <p>${esc(r.name && r.name !== r.username ? r.name : '')}<br>
        ${r.followers ? `${formatCount(r.followers)} ${r.platform === 'YouTube' ? 'subscribers' : 'followers'}` : ''}${tier.class ? `, <span class="tier ${tier.class}">${tier.name}</span>` : ''}<br>
        ${[r.type, r.savedBy ? 'saved by ' + r.savedBy : ''].filter(Boolean).map(esc).join(', ')}</p>
      <p class="links">
        <button class="link-btn play-btn" id="play-this">Play ▶</button>
        <a href="${esc(r.contentUrl)}" target="_blank" rel="noopener">Open ↗</a>
        ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Profile ↗</a>` : ''}
      </p>
    </div>
    <div class="feat">
      <h3>${headline}</h3>
      <p class="caption">${esc(r.caption || 'No caption saved.')}</p>
      <p class="small">${[r.contentComments ? formatCount(r.contentComments) + ' comments' : '', r.postedAt, 'saved ' + formatDate(r.savedAt).slice(0, 10)].filter(Boolean).map(esc).join(', ')}</p>
    </div>
    <div class="feat edit">
      <h3>Filed under</h3>
      <div class="edit-row">
        <input id="e-brand" list="e-brands" value="${esc(r.brand)}" aria-label="Brand" placeholder="Brand">
        <input id="e-niche" list="e-niches" value="${esc(r.niche)}" aria-label="Niche" placeholder="Niche">
      </div>
      <datalist id="e-brands">${brands.map(b => `<option value="${esc(b)}">`).join('')}</datalist>
      <datalist id="e-niches">${niches.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <div class="chips">${chipList(r).map(f => `
        <button class="chip ${(r.festive || []).includes(f.name) ? 'on' : ''}" data-f="${esc(f.name)}" style="--c:${f.color}" title="${esc(f.name)}">${f.emoji} ${esc(f.name)}</button>`).join('')}
        ${S.taxonomy.festive.length > 5 ? `<button class="chip more" id="e-more">${S.chipsOpen ? 'Show less' : '+' + (S.taxonomy.festive.length - chipList(r).length) + ' more'}</button>` : ''}
      </div>
      <button class="remove" id="e-remove">Remove from board</button>
    </div>`;

  $('play-this').addEventListener('click', () => openPlayer(S.index));
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
  info.querySelectorAll('.chip[data-f]').forEach(b => b.addEventListener('click', async () => {
    const f = b.dataset.f;
    const cur = r.festive || [];
    b.classList.toggle('on');
    try { await updateRecord(r.id, { festive: cur.includes(f) ? cur.filter(x => x !== f) : [...cur, f] }); }
    catch (err) { toast('Couldn\'t save: ' + err.message); load(); }
  }));
  if ($('e-more')) $('e-more').addEventListener('click', () => { S.chipsOpen = !S.chipsOpen; renderInfo(); });
  const rm = $('e-remove');
  rm.addEventListener('click', async () => {
    if (rm.dataset.confirm !== '1') { rm.dataset.confirm = '1'; rm.textContent = 'Click again to remove for everyone'; return; }
    try { await deleteRecord(r.id); toast('Removed from board'); }
    catch (err) { toast('Couldn\'t remove: ' + err.message); }
  });
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
      <button id="copy-creators" class="ghost-btn">Copy list for Sheets</button>
    </div>
    <div class="ctable-wrap"><table class="ctable">
      <thead><tr><th>Creator</th><th class="num">Followers</th><th>Tier</th><th>Category</th><th>Type</th><th>Niches</th><th class="num">Reels</th><th>Saved by</th><th></th></tr></thead>
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
          <td>${esc(c.category || '--')}</td>
          <td>${esc(c.type || '--')}</td>
          <td>${esc([...c.niches].join(', ') || '--')}</td>
          <td class="num">${c.reels}</td>
          <td>${esc([...c.savedBy].join(', ') || '--')}</td>
          <td>${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">Profile ↗</a>` : ''}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  $('creators').querySelectorAll('.ava img').forEach(img => img.addEventListener('error', () => img.remove(), { once: true }));
  $('copy-creators').addEventListener('click', async () => {
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
    $('links-niche').value = S.niche && S.niche !== NO_NICHE ? S.niche : '';
    $('links-input').focus();
  }
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
      const { creator, content } = found;
      const thumb = content.thumbUrl ? await thumbToDataUrl(content.thumbUrl) : '';
      const avatar = creator.avatarUrl ? await thumbToDataUrl(creator.avatarUrl, 240) : '';
      const followers = Number(creator.followers) || 0;
      const { record } = await upsertRecord({
        platform: creator.platform || (content.kind === 'short' || content.kind === 'video' ? 'YouTube' : 'Instagram'),
        username: creator.username || '', name: creator.name || '', followers,
        category: creator.category || '--', tier: calculateTier(followers).name, type: '',
        url: creator.url || '', avgViews: creator.avgViews || '--', country: creator.country || '--',
        contentUrl: content.url, contentKind: content.kind, thumb, thumbUrl: content.thumbUrl || '', avatar,
        caption: content.caption || '', contentViews: content.views || 0, contentLikes: content.likes || 0,
        contentComments: content.comments || 0, postedAt: content.postedAt || '',
        brand, niche, festive: [], savedBy
      });
      sendToMaster(record);
      done++;
    } catch (err) { failed++; }
  }
  btn.disabled = false;
  $('links-progress').textContent = failed
    ? `Added ${done}. ${failed} ${failed === 1 ? 'link' : 'links'} couldn't be read. Check they're public reels, posts, shorts or videos.`
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
  const tier = calculateTier(r.followers);
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
    <p class="pl-meta">${[brandLabel(brandOf(r)), r.niche, ...(r.festive || []).map(f => festiveMeta(f).emoji + ' ' + f)].filter(Boolean).map(esc).join('<br>')}</p>
    <p class="pl-meta">${[r.savedBy ? 'Saved by ' + r.savedBy : '', formatDate(r.savedAt).slice(0, 10)].filter(Boolean).map(esc).join(', ')}</p>
    <div class="pl-links">
      <a href="${esc(r.contentUrl)}" target="_blank" rel="noopener">Open on ${esc(r.platform || 'Instagram')} ↗</a>
      ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Creator profile ↗</a>` : ''}
    </div>
    <p class="pl-count">${i + 1} / ${S.items.length}</p>`;
  $('player').classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closePlayer() {
  $('player').classList.add('hidden');
  $('player-frame').innerHTML = '';
  document.body.classList.remove('modal-open');
  if (S.playerIndex >= 0 && S.layout === 'carousel' && S.playerIndex !== S.index) go(S.playerIndex, false);
  S.playerIndex = -1;
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

let bm = null; // { original, name, logo, color }

function openBrandModal(name) {
  const meta = name ? metaOf(name) : {};
  bm = { original: name || '', name: name || '', logo: meta.logo || '', color: meta.color || '' };
  $('bm-title').textContent = name ? 'Edit card' : 'New brand';
  $('bm-save').textContent = name ? 'Save card' : 'Create brand';
  $('bm-name').value = bm.name;
  $('bm-error').textContent = '';
  renderSwatches();
  renderBrandPreview();
  $('brand-modal').classList.remove('hidden');
  document.body.classList.add('modal-open');
  setTimeout(() => (name ? $('bm-logo').parentElement : $('bm-name')).focus(), 30);
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
  card.className = 'card brand-card preview-card active';
  const inner = bm.logo
    ? `<div class="logo-cover"><img src="${esc(bm.logo)}" alt=""></div>`
    : `<div class="logo-cover"><span class="initial">${esc(name.charAt(0).toUpperCase())}</span></div>`;
  card.innerHTML = `<div class="media"><div class="layer color">${inner}</div><div class="layer tone">${inner}</div><span class="scan"></span></div>
    <div class="cap"><h2>${esc(name)}</h2><p>Preview</p></div>`;
}
$('bm-name').addEventListener('input', renderBrandPreview);

// Logos are resized to 400px before upload so they load fast for the whole team
$('bm-logo').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 400 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bm.logo = canvas.toDataURL('image/png');
    if (bm.logo.length > 300000) bm.logo = canvas.toDataURL('image/jpeg', 0.85);
    renderBrandPreview();
  } catch (err) {
    $('bm-error').textContent = 'That file couldn\'t be read as an image. Try a PNG or JPG.';
  }
});
$('bm-logo-clear').addEventListener('click', () => { bm.logo = ''; renderBrandPreview(); });
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
  if (S.brand !== null && S.brand !== UNFILED && !brandNames().includes(S.brand)) S.brand = null;
  const creatorsTab = S.brand !== null && S.tab === 'creators';
  S.items = S.brand === null ? brandItems() : creatorsTab ? [] : reelItems();
  renderHero();
  renderFilters();

  const empty = !S.items.length;
  const grid = S.layout === 'grid' && S.brand !== null && !creatorsTab;
  $('stage').classList.toggle('hidden', grid || empty || creatorsTab);
  $('grid').classList.toggle('hidden', !grid || empty || creatorsTab);
  $('creators').classList.toggle('hidden', !creatorsTab);
  document.body.classList.toggle('is-empty', empty && !creatorsTab);

  if (creatorsTab) { S.itemsKey = ''; $('ring').innerHTML = ''; cardEls = []; renderCreators(); $('info').innerHTML = ''; return; }
  if (empty) {
    S.itemsKey = '';
    $('ring').innerHTML = '';
    cardEls = [];
    $('info').innerHTML = (S.q || S.festive.size || S.platform !== 'all' || S.niche)
      ? `<p class="empty">Nothing matches. Clear the search or a filter to see more.</p>`
      : S.brand !== null ? `<p class="empty">No reels for ${esc(brandLabel(S.brand))} yet. Use “+ Add reel links”, or open a reel and save it with the extension.</p>` : '';
    return;
  }
  if (grid) buildGrid(); else buildStage();
  renderInfo();
}

load();
startTeamSync();
