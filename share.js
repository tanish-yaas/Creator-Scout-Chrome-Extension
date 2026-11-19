// ==========================================
// Creator Scout — client view
// When moodboard.html is opened from the web (a client link, #share=…) instead of inside the
// extension, this stands in for Chrome's extension storage so the same moodboard code runs,
// read-only, for the one brand the link was made for.
// ==========================================

(function () {
  if (location.protocol === 'chrome-extension:') return;
  const params = new URLSearchParams(location.hash.slice(1));
  globalThis.SCOUT_SHARE = params.get('share') || new URLSearchParams(location.search).get('share') || '';
  document.documentElement.classList.add('share-mode');

  const listeners = [];
  const copy = v => v === undefined ? v : JSON.parse(JSON.stringify(v));
  const area = name => {
    const mem = {};
    const keysOf = keys => keys == null ? Object.keys(mem) : Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys);
    return {
      get(keys, cb) {
        const out = {};
        keysOf(keys).forEach(k => { if (k in mem) out[k] = copy(mem[k]); });
        if (cb) setTimeout(() => cb(out));
        return Promise.resolve(out);
      },
      set(obj, cb) {
        const changes = {};
        Object.keys(obj).forEach(k => { changes[k] = { oldValue: mem[k], newValue: copy(obj[k]) }; mem[k] = copy(obj[k]); });
        setTimeout(() => listeners.forEach(f => f(changes, name)));
        if (cb) setTimeout(cb);
        return Promise.resolve();
      },
      remove(keys, cb) {
        [].concat(keys).forEach(k => { delete mem[k]; });
        if (cb) setTimeout(cb);
        return Promise.resolve();
      }
    };
  };
  const shim = {
    storage: { local: area('local'), sync: area('sync'), onChanged: { addListener: f => listeners.push(f) } },
    runtime: { getURL: p => p, getManifest: () => ({ name: 'Creator Scout', version: '' }), sendMessage: () => Promise.reject(new Error('Not in the extension')) },
    tabs: { create: ({ url }) => window.open(url, '_blank', 'noopener') }
  };
  Object.defineProperty(window, 'chrome', { value: shim, configurable: true, writable: true });
})();
