// ==========================================
// Instagram page scraper.
// This function is injected into the Instagram tab with chrome.scripting.executeScript({ func }),
// so it must be fully self-contained (no outside variables or helpers).
// Returns { kind: 'profile' | 'content', creator: {...}, content: {...} | null }
// ==========================================

async function scoutScrapeInstagram() {
  const meta = (doc, key) => {
    if (!doc) return '';
    const el = doc.querySelector(`meta[property="${key}"], meta[name="${key}"]`);
    return el ? (el.getAttribute('content') || '').trim() : '';
  };
  const fetchDoc = async (path) => {
    try {
      const res = await fetch(path, { credentials: 'include' });
      if (!res.ok) return null;
      return new DOMParser().parseFromString(await res.text(), 'text/html');
    } catch (e) { return null; }
  };
  const decode = (s) => {
    const t = document.createElement('textarea');
    t.innerHTML = s || '';
    return t.value;
  };

  // "1.2M Followers, 310 Following, 1,024 Posts - See Instagram photos and videos from Name (@user)"
  const parseProfileMeta = (desc) => {
    const out = {};
    const f = desc.match(/([\d.,]+\s*[KMBkmb]?)\s+Followers/i);
    if (f) out.followers = f[1].replace(/\s/g, '');
    const n = desc.match(/from\s+(.+?)\s+\(@([\w.]+)\)/i);
    if (n) { out.name = decode(n[1]); out.username = n[2]; }
    return out;
  };

  const scrapeProfileHeader = () => {
    const data = { name: '', followers: '', category: '' };
    const header = document.querySelector('header');
    if (!header) return data;
    const lines = header.innerText.split('\n').map(l => l.trim()).filter(Boolean);
    const firstStat = lines.findIndex(l => /posts|followers/i.test(l));
    if (firstStat > 0) {
      let cand = lines[firstStat - 1];
      if (cand.toLowerCase() === 'verified' && firstStat > 1) cand = lines[firstStat - 2];
      data.name = cand;
    }
    const fi = lines.findIndex(l => /followers/i.test(l));
    if (fi !== -1) {
      // Prefer the exact number from the title attribute when Instagram provides it
      const exact = header.querySelector('a[href$="/followers/"] span[title]');
      data.followers = (exact && /^[\d,]+$/.test(exact.getAttribute('title') || ''))
        ? exact.getAttribute('title')
        : lines[fi].split(' ')[0];
      let ci = fi + 1;
      while (ci < lines.length && /following|followed by|mutual/i.test(lines[ci])) ci++;
      if (ci < lines.length) {
        const next = lines[ci];
        const words = next.split(/\s+/).length;
        const emoji = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(next);
        data.category = (next.length <= 40 && words <= 5 && !emoji) ? next : 'None';
      }
    }
    return data;
  };

  const parts = location.pathname.split('/').filter(Boolean);
  const ci = parts.findIndex(p => ['reel', 'reels', 'p', 'tv'].includes(p));

  // ---------- Reel / post page ----------
  if (ci !== -1 && parts[ci + 1]) {
    const code = parts[ci + 1];
    const kind = parts[ci] === 'p' ? 'post' : 'reel';
    const contentUrl = `https://www.instagram.com/${kind === 'post' ? 'p' : 'reel'}/${code}/`;

    // Instagram is a single-page app, so the live <head> can be stale after navigating.
    // Fetching the content URL gives fresh meta tags.
    let doc = await fetchDoc(contentUrl);
    if (!meta(doc, 'og:description') && meta(document, 'og:url').includes(code)) doc = document;

    const ogDesc = decode(meta(doc, 'og:description'));
    let ogImage = meta(doc, 'og:image');
    const ogTitle = decode(meta(doc, 'og:title'));

    const content = { code, kind, url: contentUrl, thumbUrl: ogImage, caption: '', likes: '', comments: '', postedAt: '' };
    let username = (ci > 0) ? parts[0] : '';

    // "12K likes, 340 comments - username on November 3, 2025: "caption""
    const m = ogDesc.match(/^([\d.,]+\s*[KMBkmb]?)\s+likes?,\s*([\d.,]+\s*[KMBkmb]?)\s+comments?\s*-\s*([\w.]+)\s+on\s+([^:]+?):\s*([\s\S]*)$/i);
    if (m) {
      content.likes = m[1].replace(/\s/g, '');
      content.comments = m[2].replace(/\s/g, '');
      username = username || m[3];
      content.postedAt = m[4].trim();
      content.caption = m[5].replace(/^["“]|["”]\.?$/g, '').trim();
    } else if (ogTitle) {
      const t = ogTitle.match(/on Instagram:\s*["“]?([\s\S]*?)["”]?$/i);
      if (t) content.caption = t[1];
    }

    // DOM fallbacks for anything the meta tags didn't give us
    if (!username) {
      const scope = document.querySelector('article') || document.querySelector('main') || document;
      const link = Array.from(scope.querySelectorAll('a[href^="/"]')).find(a => {
        const segs = a.getAttribute('href').split('/').filter(Boolean);
        return segs.length === 1 && !['explore', 'reels', 'direct', 'accounts', 'stories'].includes(segs[0]);
      });
      if (link) username = link.getAttribute('href').split('/').filter(Boolean)[0];
    }
    if (!content.thumbUrl) {
      const v = document.querySelector('article video, main video');
      if (v && v.poster) content.thumbUrl = v.poster;
      else {
        const img = document.querySelector('article img[src*="cdninstagram"], main img[src*="fbcdn"]');
        if (img) content.thumbUrl = img.src;
      }
    }

    // Pull the creator's follower count from their profile page
    const creator = { username, name: '', followers: '', category: '', url: username ? `https://www.instagram.com/${username}/` : '' };
    if (username) {
      const pdoc = await fetchDoc(`/${username}/`);
      const pm = parseProfileMeta(decode(meta(pdoc, 'og:description') || meta(pdoc, 'description')));
      creator.name = pm.name || '';
      creator.followers = pm.followers || '';
      creator.avatarUrl = meta(pdoc, 'og:image');
    }
    return { kind: 'content', creator, content };
  }

  // ---------- Profile page ----------
  const username = parts[0] || '';
  const h = scrapeProfileHeader();
  const creator = {
    username,
    name: h.name || '',
    followers: h.followers || '',
    category: h.category || '',
    url: `https://www.instagram.com/${username}/`
  };
  // Fresh copy of the profile page for the profile picture (and stats, if the header didn't have them)
  const pdoc = await fetchDoc(`/${username}/`);
  const liveFresh = meta(document, 'og:url').toLowerCase().includes(`/${username.toLowerCase()}/`);
  const src = meta(pdoc, 'og:description') ? pdoc : (liveFresh ? document : null);
  creator.avatarUrl = meta(src, 'og:image');
  if (!creator.avatarUrl) {
    const img = document.querySelector('header img[alt*="profile picture" i], header img');
    if (img) creator.avatarUrl = img.src;
  }
  if (!creator.followers || !creator.name) {
    const pm = parseProfileMeta(decode(meta(src, 'og:description') || meta(src, 'description')));
    creator.followers = creator.followers || pm.followers || '';
    creator.name = creator.name || pm.name || '';
  }
  if (!creator.name) creator.name = username;
  return { kind: 'profile', creator, content: null };
}
