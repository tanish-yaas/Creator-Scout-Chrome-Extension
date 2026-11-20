// ==========================================
// Creator Scout — Instagram & YouTube lookups shared by the popup and the dashboard
// ==========================================

// ---------- master database (Make.com) ----------

function sendToMaster(saved) {
  if (typeof MASTER_WEBHOOK_URL === 'undefined' || !MASTER_WEBHOOK_URL) return;
  const { thumb, avatar, id, exportedAt, pending, synced, localOnly, ...payload } = saved;
  // "ip" is kept as a copy of brand so the existing Make.com mapping keeps working
  const body = JSON.stringify({ ...payload, ip: saved.brand || '', festive: (saved.festive || []).join(', ') });
  fetch(MASTER_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: body.length < 60000   // still arrives if the popup closes right after saving
  }).catch(err => console.log('Master DB silent fail:', err));
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
    avatarUrl: ((ch.snippet.thumbnails || {}).high || (ch.snippet.thumbnails || {}).medium || (ch.snippet.thumbnails || {}).default || {}).url || '',
    avgViews,
    country: ch.snippet.country || '--'
  };
}


async function fetchYouTubeVideo(videoId, kindHint) {
  const dv = await yt(`videos?part=snippet,statistics&id=${videoId}`);
  if (!dv.items || !dv.items.length) return null;
  const v = dv.items[0];
  const th = v.snippet.thumbnails || {};
  const isShort = kindHint === 'short';
  return {
    channelId: v.snippet.channelId,
    content: {
      kind: isShort ? 'short' : 'video',
      url: isShort ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`,
      thumbUrl: (th.maxres || th.standard || th.high || th.medium || th.default || {}).url || '',
      caption: v.snippet.title,
      views: parseInt(v.statistics.viewCount) || 0,
      likes: parseInt(v.statistics.likeCount) || 0,
      comments: parseInt(v.statistics.commentCount) || 0,
      postedAt: (v.snippet.publishedAt || '').slice(0, 10)
    }
  };
}

// ---------- Instagram (from an extension page, using the signed-in Instagram session) ----------

function igMeta(doc, key) {
  if (!doc) return '';
  const el = doc.querySelector(`meta[property="${key}"], meta[name="${key}"]`);
  return el ? (el.getAttribute('content') || '').trim() : '';
}

async function igDoc(url, ms = 8000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { credentials: 'include', signal: ctl.signal });
    if (!res.ok) return null;
    return new DOMParser().parseFromString(await res.text(), 'text/html');
  } catch (e) { return null; } finally { clearTimeout(timer); }
}

// Reads a reel / post link and its creator. Returns null if the link isn't an Instagram reel or post.
async function igLookupContent(link) {
  let u;
  try { u = new URL(link); } catch (e) { return null; }
  if (!/instagram\.com$/.test(u.hostname.replace(/^www\./, '')) && !u.hostname.endsWith('instagram.com')) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  const ci = parts.findIndex(p => ['reel', 'reels', 'p', 'tv'].includes(p));
  if (ci === -1 || !parts[ci + 1]) return null;
  const code = parts[ci + 1];
  const kind = parts[ci] === 'p' ? 'post' : 'reel';
  const contentUrl = `https://www.instagram.com/${kind === 'post' ? 'p' : 'reel'}/${code}/`;

  const doc = await igDoc(contentUrl);
  const desc = igMeta(doc, 'og:description');
  // If Instagram didn't send a cover image, its public media link often still works
  const content = { kind, url: contentUrl, thumbUrl: igMeta(doc, 'og:image') || `https://www.instagram.com/p/${code}/media/?size=l`, caption: '', likes: 0, comments: 0, views: 0, postedAt: '' };
  let username = ci > 0 ? parts[0] : '';
  const m = desc.match(/^([\d.,]+\s*[KMBkmb]?)\s+likes?,\s*([\d.,]+\s*[KMBkmb]?)\s+comments?\s*-\s*([\w.]+)\s+on\s+([^:]+?):\s*([\s\S]*)$/i);
  if (m) {
    content.likes = parseCount(m[1].replace(/\s/g, ''));
    content.comments = parseCount(m[2].replace(/\s/g, ''));
    username = username || m[3];
    content.postedAt = m[4].trim();
    content.caption = m[5].replace(/^["“]|["”]\.?$/g, '').trim();
  }
  const creator = { platform: 'Instagram', username, name: '', followers: 0, url: username ? `https://www.instagram.com/${username}/` : '', avatarUrl: '' };
  if (username) Object.assign(creator, await igLookupProfile(username));
  return { creator, content };
}

async function igLookupProfile(username) {
  const doc = await igDoc(`https://www.instagram.com/${username}/`);
  const desc = igMeta(doc, 'og:description') || igMeta(doc, 'description');
  const out = { avatarUrl: igMeta(doc, 'og:image') };
  const f = desc.match(/([\d.,]+\s*[KMBkmb]?)\s+Followers/i);
  if (f) out.followers = parseCount(f[1].replace(/\s/g, ''));
  const n = desc.match(/from\s+(.+?)\s+\(@([\w.]+)\)/i);
  if (n) out.name = n[1];
  return out;
}

// Instagram profile link (instagram.com/username/) -> the username, else ''
const IG_NOT_PROFILES = ['p', 'reel', 'reels', 'tv', 'explore', 'direct', 'accounts', 'stories', 'about', 'legal', 'developer'];
function igProfileName(link) {
  let u;
  try { u = new URL(link); } catch (e) { return ''; }
  if (!u.hostname.endsWith('instagram.com')) return '';
  const parts = u.pathname.split('/').filter(Boolean);
  return parts.length === 1 && /^[\w.]{1,30}$/.test(parts[0]) && !IG_NOT_PROFILES.includes(parts[0].toLowerCase()) ? parts[0] : '';
}

// Builds a full record from any Instagram or YouTube link: a reel / post / short / video,
// or a profile / channel (then content is null and only the creator is saved)
async function lookupLink(link) {
  const igUser = igProfileName(link);
  if (igUser) {
    const p = await igLookupProfile(igUser);
    return { creator: { platform: 'Instagram', username: igUser, name: p.name || igUser, followers: p.followers || 0, category: '--', url: `https://www.instagram.com/${igUser}/`, avatarUrl: p.avatarUrl || '' }, content: null };
  }
  if (/youtube\.com|youtu\.be/.test(link)) {
    const p = parseYouTubeUrl(link);
    if (!p.videoId && (p.handle || p.channelId || p.legacyUser)) {
      const creator = await fetchChannel(p);
      return creator ? { creator, content: null } : null;
    }
    if (!p.videoId) return null;
    const v = await fetchYouTubeVideo(p.videoId, p.kind);
    if (!v) return null;
    const creator = await fetchChannel({ channelId: v.channelId });
    return { creator, content: v.content };
  }
  return igLookupContent(link);
}
