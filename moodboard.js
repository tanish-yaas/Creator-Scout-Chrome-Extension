// ==========================================
// Creator Scout — Moodboard
// Home: a curved carousel with one card per brand.
// Inside a brand: the same carousel, one card per reel / short.
// Reads what the popup saves (chrome.storage.local) and updates live.
// ==========================================

const S = {
  records: [],
  taxonomy: { brands: {}, festive: [] },
  brand: null,            // null = brands view; otherwise brand name or '__unfiled'
  niche: null,
  festive: new Set(),
  platform: 'all',
  q: '',
  index: -1,
  homeIndex: -1,
  layout: 'carousel',
  items: [],
  itemsKey: ''
};

const UNFILED = '__unfiled';
const NO_NICHE = 'No niche yet';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const handleOf = r => (r.platform === 'Instagram' ? '@' : '') + String(r.username || '').replace(/^@/, '');
const brandLabel = b => b === UNFILED ? 'Unfiled' : b;

// ---------- data ----------

async function load() {
  const all = await getRecords();
  S.records = all.slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  S.taxonomy = await getTaxonomy();
  render();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[SCOUT_KEYS.records] || changes[SCOUT_KEYS.taxonomy])) load();
});

function festiveMeta(name) {
  return S.taxonomy.festive.find(f => f.name === name) || { name, emoji: '✨', color: '#9A9A9A' };
}

function matchesQuery(r, q) {
  if (!q) return true;
  return [r.username, r.name, r.caption, r.ip, r.type, r.niche, ...(r.festive || [])].join(' ').toLowerCase().includes(q);
}

function passesFilters(r) {
  if (S.platform !== 'all' && r.platform !== S.platform) return false;
  if (S.festive.size && !(r.festive || []).some(f => S.festive.has(f))) return false;
  return true;
}

function brandNames() {
  const set = new Set(Object.keys(S.taxonomy.brands));
  S.records.forEach(r => set.add(r.brand || UNFILED));
  return [...set];
}

function nicheCounts(list) {
  const c = {};
  list.forEach(r => { const n = r.niche || NO_NICHE; c[n] = (c[n] || 0) + 1; });
  return Object.entries(c).sort((a, b) => b[1] - a[1]);
}

function brandItems() {
  const q = S.q.toLowerCase();
  const filtering = S.festive.size || S.platform !== 'all';
  return brandNames().map(name => {
    const all = S.records.filter(r => (r.brand || UNFILED) === name);
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

function reelItems() {
  const q = S.q.toLowerCase();
  return S.records.filter(r =>
    (r.brand || UNFILED) === S.brand &&
    (!S.niche || (r.niche || NO_NICHE) === S.niche) &&
    passesFilters(r) && matchesQuery(r, q)
  ).map(r => ({ kind: 'reel', key: r.id, rec: r }));
}

// ---------- hero & filters ----------

function renderHero() {
  const inBrand = S.brand !== null;
  $('back').classList.toggle('hidden', !inBrand);
  $('layout-toggle').classList.toggle('hidden', !inBrand);
  document.body.classList.toggle('in-brand', inBrand);
  $('search').placeholder = inBrand ? 'Search creators, captions, IPs' : 'Search brands, creators, captions';

  if (!inBrand) {
    const brands = brandNames().filter(b => b !== UNFILED).length;
    $('title').innerHTML = 'Everything you scouted,<br>filed by brand';
    $('title').removeAttribute('title');
    $('sub').textContent = S.records.length
      ? `${S.records.length} saved${brands ? ` across ${brands} ${brands === 1 ? 'brand' : 'brands'}` : ', none filed under a brand yet'}. Swipe, drag or use the arrow keys, and open a card to see what's inside.`
      : 'Open a creator, reel or short, click Creator Scout, pick a brand and save. It lands here straight away.';
  } else {
    const all = S.records.filter(r => (r.brand || UNFILED) === S.brand);
    const niches = new Set(all.map(r => r.niche || NO_NICHE)).size;
    $('title').textContent = brandLabel(S.brand);
    $('title').title = S.brand === UNFILED ? '' : 'Double-click to rename';
    $('sub').textContent = S.brand === UNFILED
      ? `${all.length} saved without a brand. Give one a brand below to file it.`
      : `${all.length} saved in ${niches} ${niches === 1 ? 'niche' : 'niches'}.`;
  }
}

function renderFilters() {
  const scope = S.brand === null ? S.records : S.records.filter(r => (r.brand || UNFILED) === S.brand);
  let html = '';

  if (S.brand !== null) {
    const niches = nicheCounts(scope);
    html += `<div class="pill-row">
      <button class="fpill ${!S.niche ? 'on' : ''}" data-niche="">All niches <span>${scope.length}</span></button>
      ${niches.map(([n, c]) => `<button class="fpill ${S.niche === n ? 'on' : ''}" data-niche="${esc(n)}">${esc(n)} <span>${c}</span></button>`).join('')}
    </div>`;
  }

  const fc = {};
  scope.forEach(r => (r.festive || []).forEach(f => { fc[f] = (fc[f] || 0) + 1; }));
  const tags = S.taxonomy.festive.filter(f => fc[f.name] || S.festive.has(f.name));
  const platforms = new Set(scope.map(r => r.platform));
  html += `<div class="pill-row">
    ${tags.map(f => `<button class="fpill festive ${S.festive.has(f.name) ? 'on' : ''}" data-festive="${esc(f.name)}" style="--c:${f.color}">${f.emoji} ${esc(f.name)} <span>${fc[f.name] || 0}</span></button>`).join('')}
    ${platforms.size > 1 || S.platform !== 'all' ? `<span class="sep"></span>
      ${['all', 'Instagram', 'YouTube'].map(p => `<button class="fpill ${S.platform === p ? 'on' : ''}" data-platform="${p}">${p === 'all' ? 'Both' : p}</button>`).join('')}` : ''}
  </div>`;
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

// ---------- cards ----------

function thumbsFor(item) {
  if (item.kind === 'reel') return item.rec.thumb ? [item.rec.thumb] : [];
  return (item.recs.length ? item.recs : S.records.filter(r => (r.brand || UNFILED) === item.name))
    .map(r => r.thumb).filter(Boolean).slice(0, 4);
}

function mediaHTML(thumbs, fallback) {
  const imgs = thumbs.length
    ? thumbs.map(t => `<img src="${esc(t)}" alt="" draggable="false" loading="lazy">`).join('')
    : `<span class="ph">${esc(fallback)}</span>`;
  const cls = thumbs.length >= 4 ? 'mosaic' : '';
  return `<div class="media">
    <div class="layer color ${cls}">${imgs}</div>
    <div class="layer tone ${cls}">${imgs}</div>
    <span class="scan" aria-hidden="true"></span>
  </div>`;
}

function cardHTML(item, i) {
  if (item.kind === 'brand') {
    const niches = new Set(item.recs.map(r => r.niche || NO_NICHE)).size;
    const fest = [...new Set(item.recs.flatMap(r => r.festive || []))].slice(0, 4).map(f => festiveMeta(f).emoji).join(' ');
    const count = item.recs.length;
    return `<article class="card brand-card" data-i="${i}" tabindex="-1" aria-label="${esc(brandLabel(item.name))}">
      ${mediaHTML(thumbsFor(item), brandLabel(item.name).charAt(0))}
      ${fest ? `<span class="fest">${fest}</span>` : ''}
      <div class="cap">
        <h2>${esc(brandLabel(item.name))}</h2>
        <p>${count ? `${count} saved, ${niches} ${niches === 1 ? 'niche' : 'niches'}` : 'Nothing saved yet'}</p>
      </div>
    </article>`;
  }
  const r = item.rec;
  const stat = !r.contentUrl ? `${formatCount(r.followers)} ${r.platform === 'YouTube' ? 'subs' : 'followers'}`
    : r.contentViews ? `${formatCount(r.contentViews)} views` : (r.contentLikes ? `${formatCount(r.contentLikes)} likes` : '');
  const fest = (r.festive || []).slice(0, 3).map(f => festiveMeta(f).emoji).join(' ');
  return `<article class="card reel-card" data-i="${i}" tabindex="-1" aria-label="${esc(handleOf(r))}">
    ${mediaHTML(thumbsFor(item), String(r.username || '?').replace(/^@/, '').charAt(0).toUpperCase())}
    ${fest ? `<span class="fest">${fest}</span>` : ''}
    <span class="plat">${r.platform === 'YouTube' ? 'YT' : 'IG'}</span>
    <div class="cap">
      <h2>${esc(handleOf(r))}</h2>
      <p>${[stat, r.niche].filter(Boolean).map(esc).join(', ')}</p>
    </div>
  </article>`;
}

// ---------- carousel geometry ----------

let pos = 0;            // fractional position while dragging
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

// Loop the ring when there are enough cards to fill both sides of the arc
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
    // A card that wraps from one end of the ring to the other jumps instead of flying across
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
    c.style.pointerEvents = hide ? 'none' : '';
    c.style.zIndex = String(100 - Math.round(ad * 10));
    c.classList.toggle('active', i === active);
  });
  $('counter').textContent = S.items.length ? `${String(active + 1).padStart(2, '0')} / ${String(S.items.length).padStart(2, '0')}` : '';
  $('prev').disabled = !looping() && active <= 0;
  $('next').disabled = !looping() && active >= S.items.length - 1;
}

// i may run past either end; the ring keeps a continuous position so it slides the short way round
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
  const key = (S.brand ?? '~') + '|' + S.items.map(it => it.key + ':' + (it.kind === 'brand' ? it.recs.length : (it.rec.thumb || '').length)).join(',');
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
  if (!c) return;
  setLayout('carousel');
  go(+c.dataset.i, false);
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

// ---------- interaction ----------

const stage = $('stage');
let drag = null;

stage.addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.target.closest('.arrow')) return;
  drag = { x: e.clientX, start: pos, moved: false, id: e.pointerId };
});
window.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (!drag.moved && Math.abs(dx) < 6) return;
  if (!drag.moved) { drag.moved = true; stage.setPointerCapture?.(drag.id); stage.classList.add('dragging'); }
  const g = geometry();
  pos = drag.start - dx / (g.cardW + g.gap);
  if (!looping()) pos = Math.max(-0.4, Math.min(S.items.length - 0.6, pos));
  layout(pos, false);
});
window.addEventListener('pointerup', e => {
  if (!drag) return;
  const wasDrag = drag.moved;
  drag = null;
  stage.classList.remove('dragging');
  if (wasDrag) { go(Math.round(pos)); return; }
  const c = e.target.closest && e.target.closest('.card');
  if (!c) return;
  const i = +c.dataset.i;
  if (i !== S.index) go(Math.round(pos) + Math.round(wrapD(i - pos)));
  else activate(S.items[i]);
});

let wheelAcc = 0, wheelLock = false;
stage.addEventListener('wheel', e => {
  e.preventDefault();
  if (wheelLock) return;
  wheelAcc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (Math.abs(wheelAcc) > 40) {
    go(Math.round(pos) + Math.sign(wheelAcc));
    wheelAcc = 0;
    wheelLock = true;
    setTimeout(() => { wheelLock = false; }, 260);
  }
}, { passive: false });

$('prev').addEventListener('click', () => go(Math.round(pos) - 1));
$('next').addEventListener('click', () => go(Math.round(pos) + 1));

document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea, select')) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if (e.key === 'ArrowRight') { e.preventDefault(); go(Math.round(pos) + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); go(Math.round(pos) - 1); }
  else if (e.key === 'Enter' && S.items[S.index]) activate(S.items[S.index]);
  else if ((e.key === 'Escape' || e.key === 'Backspace') && S.brand !== null) goHome();
  else if (e.key === '/') { e.preventDefault(); $('search').focus(); }
});

window.addEventListener('resize', () => { if (S.layout === 'carousel') layout(S.index, false); });

function activate(item) {
  if (!item) return;
  if (item.kind === 'brand') openBrand(item.name);
  else window.open(item.rec.contentUrl || item.rec.url, '_blank', 'noopener');
}

function openBrand(name) {
  S.homeIndex = S.index;
  S.brand = name;
  S.niche = null;
  S.q = '';
  $('search').value = '';
  S.index = -1;
  render();
  window.scrollTo({ top: 0 });
}

function goHome() {
  S.brand = null;
  S.niche = null;
  S.layout = 'carousel';
  S.q = '';
  $('search').value = '';
  S.index = S.homeIndex;
  document.querySelectorAll('#layout-toggle button').forEach(b => b.classList.toggle('on', b.dataset.layout === 'carousel'));
  render();
}
$('back').addEventListener('click', goHome);
$('home-link').addEventListener('click', e => { e.preventDefault(); goHome(); });

// Double-click the brand title to rename it everywhere
$('title').addEventListener('dblclick', () => {
  if (S.brand === null || S.brand === UNFILED) return;
  const t = $('title');
  const old = S.brand;
  t.contentEditable = 'true';
  t.focus();
  document.getSelection().selectAllChildren(t);
  const done = async (save) => {
    t.contentEditable = 'false';
    t.removeEventListener('keydown', onKey);
    const name = t.textContent.trim();
    if (!save || !name || name === old) { t.textContent = brandLabel(S.brand); return; }
    await renameBrand(old, name);
  };
  const onKey = e => {
    if (e.key === 'Enter') { e.preventDefault(); t.blur(); }
    if (e.key === 'Escape') { t.textContent = old; t.blur(); }
  };
  t.addEventListener('keydown', onKey);
  t.addEventListener('blur', () => done(true), { once: true });
});

async function renameBrand(oldName, newName) {
  const records = await getRecords();
  const tax = await getTaxonomy();
  records.forEach(r => { if (r.brand === oldName) r.brand = newName; });
  tax.brands[newName] = [...new Set([...(tax.brands[newName] || []), ...(tax.brands[oldName] || [])])];
  delete tax.brands[oldName];
  S.brand = newName;
  await setRecords(records);
  await setTaxonomy(tax);
  toast(`Renamed to ${newName}`);
}

// ---------- info row under the carousel ----------

function renderInfo() {
  const info = $('info');
  const item = S.items[S.index];
  if (!item || S.layout === 'grid') { info.innerHTML = ''; return; }

  if (item.kind === 'brand') {
    const recs = item.recs;
    const niches = nicheCounts(recs);
    const fc = {};
    recs.forEach(r => (r.festive || []).forEach(f => { fc[f] = (fc[f] || 0) + 1; }));
    const fest = Object.entries(fc).sort((a, b) => b[1] - a[1]);
    const creators = [...new Map(recs.map(r => [r.username, r])).values()].sort((a, b) => (b.followers || 0) - (a.followers || 0)).slice(0, 3);
    info.innerHTML = `
      <div class="feat">
        <h3>Niches</h3>
        <p>${niches.length ? niches.map(([n, c]) => `${esc(n)} <b>${c}</b>`).join('<br>') : 'None yet. Tag a niche when you save a reel.'}</p>
      </div>
      <div class="feat">
        <h3>Festive</h3>
        <p>${fest.length ? fest.map(([f, c]) => `${festiveMeta(f).emoji} ${esc(f)} <b>${c}</b>`).join('<br>') : 'No festive tags here yet.'}</p>
      </div>
      <div class="feat">
        <h3>Top creators</h3>
        <p>${creators.length ? creators.map(r => `${esc(handleOf(r))} <b>${formatCount(r.followers)}</b>`).join('<br>') : 'No creators yet.'}</p>
      </div>
      <button class="open-cta glow-pill" id="open-brand">Open ${esc(brandLabel(item.name))} <span aria-hidden="true">→</span></button>`;
    $('open-brand').addEventListener('click', () => openBrand(item.name));
    return;
  }

  const r = item.rec;
  const tier = calculateTier(r.followers);
  const isProfile = !r.contentUrl;
  const headline = isProfile ? (r.platform === 'YouTube' && r.avgViews && r.avgViews !== '--' ? `${formatCount(r.avgViews)} avg views` : 'Creator profile')
    : r.contentViews ? `${formatCount(r.contentViews)} views` : (r.contentLikes ? `${formatCount(r.contentLikes)} likes` : 'No stats');
  const brands = brandNames().filter(b => b !== UNFILED);
  const niches = r.brand ? (S.taxonomy.brands[r.brand] || []) : [];
  info.innerHTML = `
    <div class="feat">
      <h3>${esc(handleOf(r))}</h3>
      <p>${esc(r.name || '')}<br>
        ${formatCount(r.followers)} ${r.platform === 'YouTube' ? 'subscribers' : 'followers'}${tier.class ? `, <span class="tier ${tier.class}">${tier.name}</span>` : ''}<br>
        ${[r.type, r.ip ? 'IP: ' + r.ip : ''].filter(Boolean).map(esc).join(', ')}</p>
      <p class="links">
        ${isProfile ? '' : `<a href="${esc(r.contentUrl)}" target="_blank" rel="noopener">Open ${r.contentKind || 'reel'} ↗</a>`}
        <a href="${esc(r.url)}" target="_blank" rel="noopener">Profile ↗</a>
      </p>
    </div>
    <div class="feat">
      <h3>${headline}</h3>
      <p class="caption">${isProfile ? esc([r.category && r.category !== '--' && r.category !== 'None' ? r.category : '', r.country && r.country !== '--' ? r.country : ''].filter(Boolean).join(', ') || 'Saved from their profile page.') : esc(r.caption || 'No caption saved.')}</p>
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

  const save = async (key, v) => {
    v = v.trim();
    if (v === (r[key] || '')) return;
    await updateRecord(r.id, { [key]: v });
    toast(key === 'brand' ? (v ? `Moved to ${v}` : 'Moved to Unfiled') : 'Saved');
  };
  $('e-brand').addEventListener('change', e => save('brand', e.target.value));
  $('e-niche').addEventListener('change', e => save('niche', e.target.value));
  info.querySelectorAll('.chip[data-f]').forEach(b => b.addEventListener('click', async () => {
    const f = b.dataset.f;
    const cur = r.festive || [];
    b.classList.toggle('on');
    await updateRecord(r.id, { festive: cur.includes(f) ? cur.filter(x => x !== f) : [...cur, f] });
  }));
  if ($('e-more')) $('e-more').addEventListener('click', () => { S.chipsOpen = !S.chipsOpen; renderInfo(); });
  const rm = $('e-remove');
  rm.addEventListener('click', async () => {
    if (rm.dataset.confirm !== '1') { rm.dataset.confirm = '1'; rm.textContent = 'Click again to remove'; return; }
    await deleteRecord(r.id);
    toast('Removed from board');
  });
}

// Selected festive tags first, then enough others to fill one short row
function chipList(r) {
  const sel = S.taxonomy.festive.filter(f => (r.festive || []).includes(f.name));
  const rest = S.taxonomy.festive.filter(f => !(r.festive || []).includes(f.name));
  return S.chipsOpen ? [...sel, ...rest] : [...sel, ...rest].slice(0, Math.max(5, sel.length));
}

// ---------- copy links ----------

$('copy-links').addEventListener('click', async () => {
  const recs = S.brand === null ? S.items.flatMap(b => b.recs) : S.items.map(i => i.rec);
  if (!recs.length) return toast('Nothing to copy in this view');
  const tree = {};
  recs.forEach(r => {
    const b = brandLabel(r.brand || UNFILED);
    const n = r.niche || NO_NICHE;
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
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- render ----------

function render() {
  if (S.brand !== null && S.brand !== UNFILED && !brandNames().includes(S.brand)) S.brand = null;
  S.items = S.brand === null ? brandItems() : reelItems();
  renderHero();
  renderFilters();

  const empty = !S.items.length;
  const grid = S.layout === 'grid' && S.brand !== null;
  $('stage').classList.toggle('hidden', grid || empty);
  $('grid').classList.toggle('hidden', !grid || empty);
  document.body.classList.toggle('is-empty', empty);

  if (empty) {
    S.itemsKey = '';
    $('ring').innerHTML = '';
    cardEls = [];
    $('info').innerHTML = (S.q || S.festive.size || S.platform !== 'all' || S.niche)
      ? `<p class="empty">Nothing matches. Clear the search or a filter to see more.</p>` : '';
    return;
  }
  if (grid) buildGrid(); else buildStage();
  renderInfo();
}

load();
