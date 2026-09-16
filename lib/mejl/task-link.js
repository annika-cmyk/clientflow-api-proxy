/**
 * Länk mejl ↔ uppgift/körning (Gmail message id + run/uppdrag id).
 * Ren logik – persistence sker i klienten (localStorage).
 */
'use strict';

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

/**
 * Lägg till eller uppdatera länk. Minst messageId + (runId eller uppdragId).
 * @returns {{ store: object, link: object } | null}
 */
function link(store, { messageId, runId, uppdragId }) {
  const mid = String(messageId || '').trim();
  const rid = String(runId || '').trim();
  const uid = String(uppdragId || '').trim();
  if (!mid || (!rid && !uid)) return null;
  const next = normalizeStore(store);
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
  return { store: next, link: entry };
}

function getByMessage(store, messageId) {
  const mid = String(messageId || '').trim();
  if (!mid) return null;
  const s = normalizeStore(store);
  const entry = s.byMessage[mid];
  return entry && entry.messageId ? entry : null;
}

function getByRun(store, runId) {
  const rid = String(runId || '').trim();
  if (!rid) return null;
  const s = normalizeStore(store);
  const mid = s.byRun[rid];
  return mid ? getByMessage(s, mid) : null;
}

function getByUppdrag(store, uppdragId) {
  const uid = String(uppdragId || '').trim();
  if (!uid) return null;
  const s = normalizeStore(store);
  const mid = s.byUppdrag[uid];
  return mid ? getByMessage(s, mid) : null;
}

/** Hitta länk via körning eller uppdrag (kalender har båda). */
function findForKalender(store, { runId, uppdragId }) {
  return getByRun(store, runId) || getByUppdrag(store, uppdragId) || null;
}

function mejlReplyUrl(messageId, { reply } = {}) {
  const mid = String(messageId || '').trim();
  if (!mid) return 'mejl.html';
  let url = 'mejl.html?messageId=' + encodeURIComponent(mid);
  if (reply) url += '&reply=1';
  return url;
}

module.exports = {
  storageBucketKey,
  emptyStore,
  normalizeStore,
  link,
  getByMessage,
  getByRun,
  getByUppdrag,
  findForKalender,
  mejlReplyUrl
};
