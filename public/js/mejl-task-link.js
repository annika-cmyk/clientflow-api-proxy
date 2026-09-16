/**
 * Mejl ↔ uppgift-länk (Gmail message id + körning/uppdrag) – localStorage per användare.
 */
(function (global) {
  function storageBucketKey(userKey) {
    const key = String(userKey || 'anon')
      .trim()
      .toLowerCase();
    return 'cf-mejl-task-link:' + (key || 'anon');
  }

  function emptyStore() {
    return { byMessage: {}, byRun: {}, byUppdrag: {} };
  }

  function normalizeStore(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyStore();
    return {
      byMessage:
        raw.byMessage && typeof raw.byMessage === 'object' && !Array.isArray(raw.byMessage)
          ? raw.byMessage
          : {},
      byRun:
        raw.byRun && typeof raw.byRun === 'object' && !Array.isArray(raw.byRun) ? raw.byRun : {},
      byUppdrag:
        raw.byUppdrag && typeof raw.byUppdrag === 'object' && !Array.isArray(raw.byUppdrag)
          ? raw.byUppdrag
          : {}
    };
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

  function readStore() {
    try {
      const raw = global.localStorage && localStorage.getItem(storageBucketKey(resolveUserKey()));
      if (!raw) return emptyStore();
      return normalizeStore(JSON.parse(raw));
    } catch (_) {
      return emptyStore();
    }
  }

  function writeStore(store) {
    try {
      if (!global.localStorage) return;
      localStorage.setItem(storageBucketKey(resolveUserKey()), JSON.stringify(normalizeStore(store)));
    } catch (_) {}
  }

  function link({ messageId, runId, uppdragId }) {
    const mid = String(messageId || '').trim();
    const rid = String(runId || '').trim();
    const uid = String(uppdragId || '').trim();
    if (!mid || (!rid && !uid)) return null;
    const next = readStore();
    const prev = next.byMessage[mid] || {};
    const entry = {
      messageId: mid,
      runId: rid || String(prev.runId || '').trim(),
      uppdragId: uid || String(prev.uppdragId || '').trim(),
      createdAt: prev.createdAt || new Date().toISOString()
    };
    if (prev.runId && prev.runId !== entry.runId) delete next.byRun[prev.runId];
    if (prev.uppdragId && prev.uppdragId !== entry.uppdragId) {
      delete next.byUppdrag[prev.uppdragId];
    }
    next.byMessage[mid] = entry;
    if (entry.runId) next.byRun[entry.runId] = mid;
    if (entry.uppdragId) next.byUppdrag[entry.uppdragId] = mid;
    writeStore(next);
    return entry;
  }

  function getByMessage(messageId) {
    const mid = String(messageId || '').trim();
    if (!mid) return null;
    const entry = readStore().byMessage[mid];
    return entry && entry.messageId ? entry : null;
  }

  function getByRun(runId) {
    const rid = String(runId || '').trim();
    if (!rid) return null;
    const store = readStore();
    const mid = store.byRun[rid];
    return mid ? getByMessage(mid) : null;
  }

  function getByUppdrag(uppdragId) {
    const uid = String(uppdragId || '').trim();
    if (!uid) return null;
    const store = readStore();
    const mid = store.byUppdrag[uid];
    return mid ? getByMessage(mid) : null;
  }

  function findForKalender({ runId, uppdragId }) {
    return getByRun(runId) || getByUppdrag(uppdragId) || null;
  }

  function mejlReplyUrl(messageId, opts) {
    const mid = String(messageId || '').trim();
    if (!mid) return 'mejl.html';
    let url = 'mejl.html?messageId=' + encodeURIComponent(mid);
    if (opts && opts.reply) url += '&reply=1';
    return url;
  }

  /**
   * Markera mejl som hanterat efter klarmarkering och fråga om svar.
   * @returns {{ handled: boolean, navigated: boolean, link: object|null }}
   */
  function onKalenderKlar({ runId, uppdragId, confirmFn, navigateFn }) {
    const found = findForKalender({ runId, uppdragId });
    if (!found || !found.messageId) {
      return { handled: false, navigated: false, link: null };
    }
    try {
      const hs =
        global.MejlHandleStatus && MejlHandleStatus.createApi
          ? MejlHandleStatus.createApi()
          : null;
      if (hs) hs.set(found.messageId, hs.HANDLED || 'handled');
    } catch (_) {}
    const ask =
      typeof confirmFn === 'function'
        ? confirmFn
        : (msg) => (typeof global.confirm === 'function' ? global.confirm(msg) : false);
    const go =
      typeof navigateFn === 'function'
        ? navigateFn
        : (url) => {
            if (global.location) global.location.href = url;
          };
    const wantReply = !!ask('Vill du svara på kundens mejl?');
    if (wantReply) {
      go(mejlReplyUrl(found.messageId, { reply: true }));
      return { handled: true, navigated: true, link: found };
    }
    return { handled: true, navigated: false, link: found };
  }

  function createApi() {
    return {
      link,
      getByMessage,
      getByRun,
      getByUppdrag,
      findForKalender,
      mejlReplyUrl,
      onKalenderKlar
    };
  }

  global.MejlTaskLink = {
    createApi,
    storageBucketKey,
    emptyStore,
    normalizeStore,
    mejlReplyUrl
  };
})(typeof window !== 'undefined' ? window : globalThis);
