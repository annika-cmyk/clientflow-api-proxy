/**
 * Lokalt dolda mejl i ClientFlow (raderas inte i Gmail).
 */
(function (global) {
  function storageKey(userKey) {
    const key = String(userKey || 'anon')
      .trim()
      .toLowerCase();
    return 'cf-mejl-hidden:' + (key || 'anon');
  }

  function resolveUserKey() {
    try {
      const u =
        (global.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser()) ||
        global.__clientFlowUser ||
        null;
      if (u && (u.email || u.id || u.name)) return String(u.email || u.id || u.name);
    } catch (_) {}
    return 'anon';
  }

  function readSet() {
    try {
      const raw = global.localStorage && localStorage.getItem(storageKey(resolveUserKey()));
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.map((x) => String(x || '').trim()).filter(Boolean));
    } catch (_) {
      return new Set();
    }
  }

  function writeSet(set) {
    try {
      if (!global.localStorage) return;
      localStorage.setItem(storageKey(resolveUserKey()), JSON.stringify([...set]));
    } catch (_) {}
  }

  function isHidden(messageId) {
    const id = String(messageId || '').trim();
    if (!id) return false;
    return readSet().has(id);
  }

  function hide(messageId) {
    const id = String(messageId || '').trim();
    if (!id) return false;
    const set = readSet();
    set.add(id);
    writeSet(set);
    return true;
  }

  function unhide(messageId) {
    const id = String(messageId || '').trim();
    if (!id) return false;
    const set = readSet();
    if (!set.delete(id)) return false;
    writeSet(set);
    return true;
  }

  function createApi() {
    return { isHidden, hide, unhide };
  }

  global.MejlHidden = { createApi, isHidden, hide, unhide };
})(typeof window !== 'undefined' ? window : globalThis);
