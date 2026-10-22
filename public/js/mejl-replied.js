/**
 * Mejl «svarat»-markering – localStorage per användare (messageId + threadId).
 * Kompletterar Gmail-flaggan `replied` från servern (tråd med SENT).
 */
(function (global) {
  function storageBucketKey(userKey) {
    const key = String(userKey || 'anon')
      .trim()
      .toLowerCase();
    return 'cf-mejl-replied:' + (key || 'anon');
  }

  function resolveUserKey() {
    try {
      const u =
        (global.AuthManager &&
          AuthManager.getCurrentUser &&
          AuthManager.getCurrentUser()) ||
        global.__clientFlowUser ||
        null;
      if (u && (u.email || u.id || u.name)) {
        return String(u.email || u.id || u.name);
      }
    } catch (_) {}
    return 'anon';
  }

  function readMap() {
    try {
      const raw = global.localStorage && localStorage.getItem(storageBucketKey(resolveUserKey()));
      if (!raw) return { messages: {}, threads: {} };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { messages: {}, threads: {} };
      }
      return {
        messages:
          parsed.messages && typeof parsed.messages === 'object' && !Array.isArray(parsed.messages)
            ? parsed.messages
            : {},
        threads:
          parsed.threads && typeof parsed.threads === 'object' && !Array.isArray(parsed.threads)
            ? parsed.threads
            : {}
      };
    } catch (_) {
      return { messages: {}, threads: {} };
    }
  }

  function writeMap(map) {
    try {
      if (!global.localStorage) return;
      localStorage.setItem(
        storageBucketKey(resolveUserKey()),
        JSON.stringify({
          messages: (map && map.messages) || {},
          threads: (map && map.threads) || {}
        })
      );
    } catch (_) {}
  }

  function mark({ messageId, threadId } = {}) {
    const mid = String(messageId || '').trim();
    const tid = String(threadId || '').trim();
    if (!mid && !tid) return false;
    const map = readMap();
    const now = Date.now();
    if (mid) map.messages[mid] = now;
    if (tid) map.threads[tid] = now;
    writeMap(map);
    return true;
  }

  function isReplied(message) {
    if (!message) return false;
    if (message.replied === true) return true;
    const mid = String(message.id || message.messageId || '').trim();
    const tid = String(message.threadId || '').trim();
    const map = readMap();
    if (mid && map.messages[mid]) return true;
    if (tid && map.threads[tid]) return true;
    return false;
  }

  function badgeHtml(message, opts) {
    if (!isReplied(message)) return '';
    const compact = opts && opts.compact;
    const title = 'Du har svarat';
    if (compact) {
      return (
        '<span class="mejl-item-replied" title="' +
        title +
        '" aria-label="' +
        title +
        '">' +
        '<i class="fas fa-reply" aria-hidden="true"></i>' +
        '</span>'
      );
    }
    return (
      '<span class="mejl-item-replied-badge" title="' +
      title +
      '">' +
      '<i class="fas fa-reply" aria-hidden="true"></i> Svarat' +
      '</span>'
    );
  }

  function createApi() {
    return { mark, isReplied, badgeHtml };
  }

  global.MejlReplied = {
    createApi,
    mark,
    isReplied,
    badgeHtml,
    storageBucketKey
  };
})(typeof window !== 'undefined' ? window : globalThis);
