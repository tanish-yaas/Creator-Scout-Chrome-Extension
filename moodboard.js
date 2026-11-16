// ==========================================
// Creator Scout — Moodboard
// Reads everything the popup saves (chrome.storage.local) and updates live.
// ==========================================

const state = {
  records: [],
  taxonomy: { brands: {}, festive: [] },
  brand: null,      // null = all brands, '__unfiled' = no brand
  niche: null,
  platform: 'all',
  festive: new Set(),
  q: '',
  sort: 'new',
  openId: null
};

const NO_NICHE = 'No niche yet';
const el = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON_IG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.3" cy="6.7" r="1.2" fill="currentColor"/></svg>';
const ICON_YT = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="4" fill="currentColor"/><path d="M10 9l5 3-5 3z" fill="#000"/></svg>';

// ---------- data ----------

async function load() {
  const all = await getRecords();
  state.records = all.filter(r => r.contentUrl); // the board is for content; creator-only rows stay in Saved
  state.taxonomy = await getTaxonomy();
  render();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[SCOUT_KEYS.records] || changes[SCOUT_KEYS.taxonomy])) load();
});

function festiveMeta(name) {
  return state.taxonomy.festive.find(f => f.name === name) || { name, emoji: '✨', color: '#7A6FF0' };
}

function allBrands() {
  const counts = {};
  state.records.forEach(r => { if (r.brand) counts[r.brand] = (counts[r.brand] || 0) + 1; });
  Object.keys(state.taxonomy.brands).forEach(b => { counts[b] = counts[b] || 0; });
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b)).map(b => ({ name: b, count: counts[b] }));
}

function nichesOf(brand) {
  const counts = {};
  (state.taxonomy.brands[brand] || []).forEach(n => { counts[n] = 0; });
  state.records.forEach(r => { if (r.brand === brand && r.niche) counts[r.niche] = (counts[r.niche] || 0) + 1; });
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b)).map(n => ({ name: n, count: counts[n] }));
}

function filtered() {
  const q = state.q.toLowerCase();
  let list = state.records.filter(r => {
    if (state.platform !== 'all' && r.platform !== state.platform) return false;
    if (state.festive.size && !(r.festive || []).some(f => state.festive.has(f))) return false;
    if (q) {
      const hay = [r.username, r.name, r.caption, r.ip, r.type, r.brand, r.niche, ...(r.festive || [])].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const by = {
    new: (a, b) => (b.savedAt || 0) - (a.savedAt || 0),
    views: (a, b) => ((b.contentViews || b.contentLikes || 0) - (a.contentViews || a.contentLikes || 0)),
    followers: (a, b) => (b.followers || 0) - (a.followers || 0)
  }[state.sort];
  return list.sort(by);
}

// ---------- rail ----------

function renderRail() {
  const nav = el('rail-nav');
  const total = state.records.length;
  const unfiled = state.records.filter(r => !r.brand).length;

  let html = `<button class="rail-item ${state.brand === null ? 'on' : ''}" data-brand="">
      <span>Everything</span><span class="n">${total}</span></button>`;
  if (unfiled) {
    html += `<button class="rail-item ${state.brand === '__unfiled' ? 'on' : ''}" data-brand="__unfiled" data-drop-brand="">
      <span>Unfiled</span><span class="n">${unfiled}</span></button>`;
  }
  html += `<p class="rail-label">Brands</p>`;
  const brands = allBrands();
  if (!brands.length) html += `<p class="rail-empty">Brands you tag in the popup show up here.</p>`;
  brands.forEach(b => {
    const open = state.brand === b.name;
    html += `<div class="rail-brand ${open ? 'open' : ''}">
      <button class="rail-item ${open && !state.niche ? 'on' : ''}" data-brand="${esc(b.name)}" data-drop-brand="${esc(b.name)}" data-rename="brand">
        <span>${esc(b.name)}</span><span class="n">${b.count || ''}</span>
        ${b.count === 0 ? `<span class="x" data-remove-brand="${esc(b.name)}" title="Remove empty brand">×</span>` : ''}
      </button>`;
    if (open) {
      nichesOf(b.name).forEach(n => {
        html += `<button class="rail-item niche ${state.niche === n.name ? 'on' : ''}" data-brand="${esc(b.name)}" data-niche="${esc(n.name)}"
          data-drop-brand="${esc(b.name)}" data-drop-niche="${esc(n.name)}" data-rename="niche">
          <span>${esc(n.name)}</span><span class="n">${n.count || ''}</span></button>`;
      });
      html += `<form class="new-niche" data-brand="${esc(b.name)}"><input type="text" placeholder="Add a niche" aria-label="New niche for ${esc(b.name)}"></form>`;
    }
    html += `</div>`;
  });
  nav.innerHTML = html;
}

el('rail-nav').addEventListener('click', async (e) => {
  const rm = e.target.closest('[data-remove-brand]');
  if (rm) {
    e.stopPropagation();
    delete state.taxonomy.brands[rm.dataset.removeBrand];
    await setTaxonomy(state.taxonomy);
    if (state.brand === rm.dataset.removeBrand) { state.brand = null; state.niche = null; }
    return;
  }
  const item = e.target.closest('.rail-item');
  if (!item) return;
  const brand = item.dataset.brand;
  state.brand = brand === '' ? null : brand;
  state.niche = item.dataset.niche || null;
  render();
  el('board').scrollTo({ top: 0 });
});

el('rail-nav').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target.closest('.new-niche');
  const input = form.querySelector('input');
  const name = input.value.trim();
  if (!name) return;
  state.niche = name;
  await registerTaxonomy({ brand: form.dataset.brand, niche: name });
});

el('new-brand-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = el('new-brand-input').value.trim();
  if (!name) return;
  el('new-brand-input').value = '';
  state.brand = name;
  state.niche = null;
  await registerTaxonomy({ brand: name });
});

// Double-click to rename a brand or niche everywhere
el('rail-nav').addEventListener('dblclick', (e) => {
  const item = e.target.closest('[data-rename]');
  if (!item) return;
  const kind = item.dataset.rename;
  const oldName = kind === 'brand' ? item.dataset.brand : item.dataset.niche;
  const brand = item.dataset.brand;
  const label = item.querySelector('span');
  const input = document.createElement('input');
  input.type = 'text';
  input.value = oldName;
  input.className = 'rename';
  label.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const commit = async (save) => {
    if (done) return;
    done = true;
    const newName = input.value.trim();
    if (!save || !newName || newName === oldName) return render();
    await renameTaxonomy(kind, brand, oldName, newName);
  };
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') commit(true);
    if (ev.key === 'Escape') commit(false);
  });
  input.addEventListener('blur', () => commit(true));
});

async function renameTaxonomy(kind, brand, oldName, newName) {
  const records = await getRecords();
  const tax = await getTaxonomy();
  if (kind === 'brand') {
    records.forEach(r => { if (r.brand === oldName) r.brand = newName; });
    const merged = [...new Set([...(tax.brands[newName] || []), ...(tax.brands[oldName] || [])])];
    delete tax.brands[oldName];
    tax.brands[newName] = merged;
    if (state.brand === oldName) state.brand = newName;
  } else {
    records.forEach(r => { if (r.brand === brand && r.niche === oldName) r.niche = newName; });
    tax.brands[brand] = [...new Set((tax.brands[brand] || []).map(n => n === oldName ? newName : n))];
    if (state.niche === oldName) state.niche = newName;
  }
  await setRecords(records);
  await setTaxonomy(tax);
  toast(`Renamed to ${newName}`);
}

// ---------- festive filter ----------

function renderFestiveFilter() {
  const counts = {};
  state.records.forEach(r => (r.festive || []).forEach(f => { counts[f] = (counts[f] || 0) + 1; }));
  const used = state.taxonomy.festive.filter(f => counts[f.name] || state.festive.has(f.name));
  const box = el('festive-filter');
  if (!used.length) { box.innerHTML = ''; box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = used.map(f => `
    <button class="tape-btn ${state.festive.has(f.name) ? 'on' : ''}" data-festive="${esc(f.name)}" style="--tape:${f.color}">
      ${f.emoji} ${esc(f.name)} <span class="n">${counts[f.name] || 0}</span>
    </button>`).join('') +
    (state.festive.size ? `<button class="clear-festive" data-festive="">Show all</button>` : '');
}

el('festive-filter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-festive]');
  if (!b) return;
  const f = b.dataset.festive;
  if (!f) state.festive.clear();
  else state.festive.has(f) ? state.festive.delete(f) : state.festive.add(f);
  render();
});

// ---------- board ----------

function frameHTML(r) {
  const tapes = (r.festive || []).slice(0, 2).map((f, i) => {
    const m = festiveMeta(f);
    return `<span class="tape t${i}" style="--tape:${m.color}">${m.emoji} ${esc(m.name)}</span>`;
  }).join('');
  const more = (r.festive || []).length > 2 ? `<span class="tape t2 more">+${r.festive.length - 2}</span>` : '';
  const stat = r.contentViews ? `${formatCount(r.contentViews)} views` : (r.contentLikes ? `${formatCount(r.contentLikes)} likes` : '');
  const tier = calculateTier(r.followers);
  const img = r.thumb
    ? `<img src="${esc(r.thumb)}" alt="" loading="lazy" data-fallback="${esc((r.username || '?').replace(/^@/, '').charAt(0).toUpperCase())}">`
    : `<span class="ph">${esc((r.username || '?').replace(/^@/, '').charAt(0).toUpperCase())}</span>`;
  return `<article class="frame" draggable="true" data-id="${r.id}" tabindex="0" aria-label="${esc(r.username)} ${esc(r.contentKind || 'reel')}">
    <div class="tapes">${tapes}${more}</div>
    <div class="photo">
      ${img}
      <span class="plat">${r.platform === 'YouTube' ? ICON_YT : ICON_IG}</span>
      ${stat ? `<span class="stat">${stat}</span>` : ''}
    </div>
    <footer>
      <span class="handle">${r.platform === 'Instagram' ? '@' : ''}${esc((r.username || '').replace(/^@/, ''))}</span>
      ${tier.class ? `<span class="tier ${tier.class}" title="${formatCount(r.followers)} ${r.platform === 'YouTube' ? 'subscribers' : 'followers'}">${tier.name}</span>` : ''}
    </footer>
  </article>`;
}

function laneHTML(brand, niche, items) {
  return `<section class="lane" data-drop-brand="${esc(brand)}" data-drop-niche="${esc(niche === NO_NICHE ? '' : niche)}">
    <h3 class="lane-title">${esc(niche)} <span class="n">${items.length}</span></h3>
    <div class="frames">${items.length ? items.map(frameHTML).join('') : '<p class="lane-empty">Drop frames here</p>'}</div>
  </section>`;
}

function brandSectionHTML(brand, items, onlyNiche) {
  const groups = {};
  items.forEach(r => { const n = r.niche || NO_NICHE; (groups[n] = groups[n] || []).push(r); });
  let niches = onlyNiche ? [onlyNiche] : nichesOf(brand).map(n => n.name);
  if (!onlyNiche && groups[NO_NICHE]) niches.push(NO_NICHE);
  if (!onlyNiche && (state.festive.size || state.q || state.platform !== 'all')) niches = niches.filter(n => groups[n]);
  const isAll = state.brand === null;
  return `<section class="brand-block">
    <header class="brand-head">
      <h2 class="${isAll ? 'link' : ''}" ${isAll ? `data-goto="${esc(brand)}"` : ''}>${esc(brand)}</h2>
      <p class="brand-count">${items.length} ${items.length === 1 ? 'piece' : 'pieces'}${onlyNiche ? ` in ${esc(onlyNiche)}` : ''}</p>
    </header>
    ${niches.map(n => laneHTML(brand, n, groups[n] || [])).join('')}
  </section>`;
}

function renderBoard() {
  const board = el('board');
  const list = filtered();

  if (!state.records.length) {
    board.innerHTML = `<div class="empty">
      <h2>Your board is empty</h2>
      <p>Open a reel or a YouTube short, click Creator Scout, pick a brand and a niche, then save. It lands here straight away.</p>
    </div>`;
    return;
  }

  let html = '';
  if (state.brand === '__unfiled') {
    const items = list.filter(r => !r.brand);
    html = `<section class="brand-block"><header class="brand-head"><h2>Unfiled</h2>
      <p class="brand-count">Drag these onto a brand in the sidebar.</p></header>
      <section class="lane"><div class="frames">${items.map(frameHTML).join('')}</div></section></section>`;
  } else if (state.brand) {
    const items = list.filter(r => r.brand === state.brand && (!state.niche || r.niche === state.niche));
    html = brandSectionHTML(state.brand, items, state.niche);
  } else {
    allBrands().forEach(b => {
      const items = list.filter(r => r.brand === b.name);
      if (items.length) html += brandSectionHTML(b.name, items, null);
    });
  }
  board.innerHTML = html || `<div class="empty"><h2>Nothing matches</h2><p>Clear the search or the festive filter to see more.</p></div>`;

  board.querySelectorAll('img[data-fallback]').forEach(img => {
    img.addEventListener('error', () => {
      const s = document.createElement('span');
      s.className = 'ph';
      s.textContent = img.dataset.fallback;
      img.replaceWith(s);
    }, { once: true });
  });
}

el('board').addEventListener('click', (e) => {
  const go = e.target.closest('[data-goto]');
  if (go) { state.brand = go.dataset.goto; state.niche = null; render(); return; }
  const f = e.target.closest('.frame');
  if (f) openDrawer(f.dataset.id);
});
el('board').addEventListener('keydown', (e) => {
  const f = e.target.closest('.frame');
  if (f && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDrawer(f.dataset.id); }
});

// ---------- drag & drop ----------

let dragId = null;
document.addEventListener('dragstart', (e) => {
  const f = e.target.closest('.frame');
  if (!f) return;
  dragId = f.dataset.id;
  e.dataTransfer.setData('text/plain', dragId);
  e.dataTransfer.effectAllowed = 'move';
  f.classList.add('dragging');
  document.body.classList.add('is-dragging');
});
document.addEventListener('dragend', (e) => {
  const f = e.target.closest('.frame');
  if (f) f.classList.remove('dragging');
  document.body.classList.remove('is-dragging');
  document.querySelectorAll('.drop-over').forEach(x => x.classList.remove('drop-over'));
  dragId = null;
});
document.addEventListener('dragover', (e) => {
  const t = e.target.closest('[data-drop-brand]');
  if (!t || !dragId) return;
  e.preventDefault();
  document.querySelectorAll('.drop-over').forEach(x => { if (x !== t) x.classList.remove('drop-over'); });
  t.classList.add('drop-over');
});
document.addEventListener('drop', async (e) => {
  const t = e.target.closest('[data-drop-brand]');
  if (!t || !dragId) return;
  e.preventDefault();
  const brand = t.dataset.dropBrand;
  const niche = t.dataset.dropNiche || '';
  const rec = state.records.find(r => r.id === dragId);
  if (!rec || (rec.brand === brand && (rec.niche || '') === niche)) return;
  await updateRecord(dragId, { brand, niche });
  toast(brand ? `Moved to ${brand}${niche ? ' / ' + niche : ''}` : 'Moved to Unfiled');
});

// ---------- drawer ----------

function openDrawer(id) {
  state.openId = id;
  renderDrawer();
  el('drawer').classList.add('open');
  el('drawer').setAttribute('aria-hidden', 'false');
}
function closeDrawer() {
  state.openId = null;
  el('drawer').classList.remove('open');
  el('drawer').setAttribute('aria-hidden', 'true');
}
el('drawer-close').addEventListener('click', closeDrawer);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.openId) closeDrawer(); });

function renderDrawer() {
  const r = state.records.find(x => x.id === state.openId);
  if (!r) { closeDrawer(); return; }
  const tier = calculateTier(r.followers);
  const brands = allBrands().map(b => b.name);
  const niches = r.brand ? nichesOf(r.brand).map(n => n.name) : [];
  const stats = [
    r.contentViews ? [formatCount(r.contentViews), 'views'] : null,
    r.contentLikes ? [formatCount(r.contentLikes), 'likes'] : null,
    r.contentComments ? [formatCount(r.contentComments), 'comments'] : null,
    [formatCount(r.followers), r.platform === 'YouTube' ? 'subscribers' : 'followers']
  ].filter(Boolean);

  el('drawer-body').innerHTML = `
    <div class="d-photo">${r.thumb ? `<img src="${esc(r.thumb)}" alt="">` : '<span class="ph">No thumbnail</span>'}</div>
    <div class="d-who">
      <p class="d-name">${esc(r.name || r.username)}</p>
      <p class="d-handle">${r.platform === 'Instagram' ? '@' : ''}${esc((r.username || '').replace(/^@/, ''))}
        ${tier.class ? `<span class="tier ${tier.class}">${tier.name}</span>` : ''}</p>
    </div>
    <dl class="d-stats">${stats.map(s => `<div><dt>${s[1]}</dt><dd>${s[0]}</dd></div>`).join('')}</dl>
    ${r.caption ? `<p class="d-caption">${esc(r.caption)}</p>` : ''}
    <p class="d-meta">${[r.type, r.ip ? 'IP: ' + r.ip : '', r.postedAt, 'Saved ' + formatDate(r.savedAt)].filter(Boolean).map(esc).join('<br>')}</p>

    <label class="d-label" for="d-brand">Brand</label>
    <input id="d-brand" list="d-brand-list" value="${esc(r.brand)}">
    <datalist id="d-brand-list">${brands.map(b => `<option value="${esc(b)}">`).join('')}</datalist>

    <label class="d-label" for="d-niche">Niche</label>
    <input id="d-niche" list="d-niche-list" value="${esc(r.niche)}">
    <datalist id="d-niche-list">${niches.map(n => `<option value="${esc(n)}">`).join('')}</datalist>

    <p class="d-label">Festive tags</p>
    <div class="d-chips">${state.taxonomy.festive.map(f => `
      <button class="d-chip ${(r.festive || []).includes(f.name) ? 'on' : ''}" data-toggle-festive="${esc(f.name)}" style="--tape:${f.color}">${f.emoji} ${esc(f.name)}</button>`).join('')}
    </div>

    <div class="d-actions">
      <a class="d-open" href="${esc(r.contentUrl)}" target="_blank" rel="noopener">Open on ${r.platform}</a>
      <a class="d-open ghost" href="${esc(r.url)}" target="_blank" rel="noopener">Creator profile</a>
    </div>
    <button class="d-delete" id="d-delete">Remove from board</button>
  `;

  const saveField = async (key, input) => {
    const v = input.value.trim();
    if (v === (r[key] || '')) return;
    await updateRecord(r.id, { [key]: v });
    toast('Saved');
  };
  el('d-brand').addEventListener('change', e => saveField('brand', e.target));
  el('d-niche').addEventListener('change', e => saveField('niche', e.target));
  el('drawer-body').querySelectorAll('[data-toggle-festive]').forEach(b => b.addEventListener('click', async () => {
    const f = b.dataset.toggleFestive;
    const cur = r.festive || [];
    await updateRecord(r.id, { festive: cur.includes(f) ? cur.filter(x => x !== f) : [...cur, f] });
  }));
  const del = el('d-delete');
  del.addEventListener('click', async () => {
    if (del.dataset.confirm !== '1') {
      del.dataset.confirm = '1';
      del.textContent = 'Click again to remove';
      return;
    }
    await deleteRecord(r.id);
    closeDrawer();
    toast('Removed from board');
  });
}

// ---------- toolbar ----------

el('search').addEventListener('input', e => { state.q = e.target.value.trim(); renderBoard(); });
el('sort').addEventListener('change', e => { state.sort = e.target.value; renderBoard(); });
document.querySelector('.seg').addEventListener('click', e => {
  const b = e.target.closest('[data-platform]');
  if (!b) return;
  state.platform = b.dataset.platform;
  document.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b));
  render();
});

el('copy-links').addEventListener('click', async () => {
  const list = filtered().filter(r => {
    if (state.brand === '__unfiled') return !r.brand;
    if (state.brand) return r.brand === state.brand && (!state.niche || r.niche === state.niche);
    return true;
  });
  if (!list.length) return toast('Nothing to copy in this view');
  const tree = {};
  list.forEach(r => {
    const b = r.brand || 'Unfiled';
    const n = r.niche || NO_NICHE;
    ((tree[b] = tree[b] || {})[n] = tree[b][n] || []).push(r);
  });
  const lines = [];
  Object.entries(tree).forEach(([b, ns]) => {
    lines.push(b);
    Object.entries(ns).forEach(([n, rs]) => {
      lines.push(`  ${n}`);
      rs.forEach(r => lines.push(`    ${r.username}${(r.festive || []).length ? ' [' + r.festive.join(', ') + ']' : ''}: ${r.contentUrl}`));
    });
    lines.push('');
  });
  await navigator.clipboard.writeText(lines.join('\n').trim());
  toast(`Copied ${list.length} link${list.length > 1 ? 's' : ''}`);
});

let toastTimer;
function toast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function render() {
  renderRail();
  renderFestiveFilter();
  renderBoard();
  if (state.openId) renderDrawer();
}

load();
