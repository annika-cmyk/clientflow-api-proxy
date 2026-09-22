/**
 * Inkrementell Gmail-sync: history-merge, cache-serialisering, kapning.
 * Persistent lagring sker via store (Airtable); denna modul är ren logik.
 */

const MAX_CACHED_MESSAGES = 150;
const SYNC_CACHE_FIELD = 'Gmail Sync Cache';
/** Rullande fönster: hämta/spara bara mejl ≤ så här många dagar gamla. */
const SYNC_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function emptyCache() {
  return {
    historyId: null,
    syncedAt: null,
    labels: [],
    messages: []
  };
}

function syncWindowStartMs(nowMs = Date.now()) {
  return Number(nowMs) - SYNC_WINDOW_DAYS * DAY_MS;
}

/** Gmail q-klausul, t.ex. newer_than:30d */
function gmailNewerThanQuery(days = SYNC_WINDOW_DAYS) {
  const d = Math.max(1, Math.min(Math.floor(Number(days) || SYNC_WINDOW_DAYS), 365));
  return `newer_than:${d}d`;
}

function appendDateWindowToQuery(q, days = SYNC_WINDOW_DAYS) {
  const clause = gmailNewerThanQuery(days);
  const base = String(q || '').trim();
  if (!base) return clause;
  if (/\bnewer_than:\d+d\b/i.test(base) || /\bafter:\d{4}\/\d{2}\/\d{2}\b/i.test(base)) {
    return base;
  }
  return `${base} ${clause}`;
}

function messageInternalDateMs(msg) {
  if (!msg || typeof msg !== 'object') return null;
  if (msg.internalDate != null && Number.isFinite(Number(msg.internalDate))) {
    return Number(msg.internalDate);
  }
  if (msg.date) {
    const t = Date.parse(String(msg.date));
    if (Number.isFinite(t)) return t;
  }
  return null;
}

/** true om mejlet är inom rullande fönster (okänt/orimligt datum behålls). */
function isWithinSyncWindow(msg, nowMs = Date.now()) {
  const t = messageInternalDateMs(msg);
  if (t == null) return true;
  // Gmail internalDate är ms sedan epoch; värden före ~2000-01-01 är troligen
  // testdata eller trasiga och ska inte filteras bort som "för gamla".
  if (t < Date.UTC(2000, 0, 1)) return true;
  return t >= syncWindowStartMs(nowMs);
}

function filterMessagesToWindow(messages, nowMs = Date.now()) {
  return (messages || []).filter((m) => isWithinSyncWindow(m, nowMs));
}

function attachmentCountFromMsg(msg) {
  if (!msg || typeof msg !== 'object') return 0;
  if (typeof msg.attachmentCount === 'number' && Number.isFinite(msg.attachmentCount)) {
    return Math.max(0, Math.min(99, Math.floor(msg.attachmentCount)));
  }
  if (Array.isArray(msg.attachments)) {
    return Math.max(0, Math.min(99, msg.attachments.length));
  }
  if (Array.isArray(msg.attachmentMeta)) {
    return Math.max(0, Math.min(99, msg.attachmentMeta.length));
  }
  return 0;
}

function toCompactMessage(msg) {
  if (!msg || !msg.id) return null;
  return {
    id: String(msg.id),
    threadId: msg.threadId ? String(msg.threadId) : null,
    labelIds: Array.isArray(msg.labelIds) ? msg.labelIds.map(String) : [],
    internalDate: msg.internalDate != null ? Number(msg.internalDate) : null,
    snippet: String(msg.snippet || '').slice(0, 240),
    subject: String(msg.subject || '').slice(0, 300),
    from: String(msg.from || '').slice(0, 300),
    to: String(msg.to || '').slice(0, 400),
    cc: String(msg.cc || '').slice(0, 300),
    date: String(msg.date || '').slice(0, 80),
    messageIdHeader: String(msg.messageIdHeader || '').slice(0, 200),
    inReplyTo: String(msg.inReplyTo || '').slice(0, 200),
    attachmentCount: attachmentCountFromMsg(msg)
  };
}

function compactLabels(labels) {
  return (labels || [])
    .filter((l) => l && l.id)
    .map((l) => ({
      id: String(l.id),
      name: String(l.name || ''),
      type: l.type ? String(l.type) : undefined
    }));
}

function sortByInternalDateDesc(messages) {
  return [...(messages || [])].sort(
    (a, b) => Number(b.internalDate || 0) - Number(a.internalDate || 0)
  );
}

function capMessages(messages, max = MAX_CACHED_MESSAGES, nowMs = Date.now()) {
  const limit = Math.min(Math.max(Number(max) || MAX_CACHED_MESSAGES, 1), 300);
  return sortByInternalDateDesc(filterMessagesToWindow(messages, nowMs)).slice(0, limit);
}

function buildCacheFromFullSync({ historyId, labels, messages, syncedAt, nowMs } = {}) {
  const compact = (messages || []).map(toCompactMessage).filter(Boolean);
  return {
    historyId: historyId != null && historyId !== '' ? String(historyId) : null,
    syncedAt: syncedAt || new Date().toISOString(),
    labels: compactLabels(labels),
    messages: capMessages(compact, MAX_CACHED_MESSAGES, nowMs)
  };
}

/**
 * Samla message-id:n som påverkats i history-poster.
 */
function collectHistoryMessageIds(historyRecords) {
  const addedIds = new Set();
  const removedIds = new Set();
  const changedIds = new Set();

  for (const rec of historyRecords || []) {
    for (const item of rec.messagesAdded || []) {
      const id = item && item.message && item.message.id;
      if (id) {
        addedIds.add(String(id));
        removedIds.delete(String(id));
      }
    }
    for (const item of rec.messagesDeleted || []) {
      const id = item && item.message && item.message.id;
      if (id) {
        removedIds.add(String(id));
        addedIds.delete(String(id));
        changedIds.delete(String(id));
      }
    }
    for (const item of rec.labelsAdded || []) {
      const id = item && item.message && item.message.id;
      if (id) changedIds.add(String(id));
    }
    for (const item of rec.labelsRemoved || []) {
      const id = item && item.message && item.message.id;
      if (id) changedIds.add(String(id));
    }
  }

  for (const id of addedIds) changedIds.delete(id);
  for (const id of removedIds) changedIds.delete(id);

  return { addedIds, removedIds, changedIds };
}

function mergeHistoryIntoCache(cache, opts = {}) {
  const base = cache && typeof cache === 'object' ? cache : emptyCache();
  const byId = new Map();
  for (const msg of base.messages || []) {
    const compact = toCompactMessage(msg);
    if (compact) byId.set(compact.id, compact);
  }

  for (const id of opts.removedIds || []) {
    byId.delete(String(id));
  }

  for (const msg of opts.updatedMessages || []) {
    const compact = toCompactMessage(msg);
    if (!compact) continue;
    byId.set(compact.id, compact);
  }

  return {
    historyId:
      opts.historyId != null && opts.historyId !== ''
        ? String(opts.historyId)
        : base.historyId || null,
    syncedAt: opts.syncedAt || new Date().toISOString(),
    labels: opts.labels ? compactLabels(opts.labels) : compactLabels(base.labels),
    messages: capMessages([...byId.values()], MAX_CACHED_MESSAGES, opts.nowMs)
  };
}

function parseSyncCache(raw, nowMs = Date.now()) {
  if (!raw) return emptyCache();
  let data = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return emptyCache();
    try {
      data = JSON.parse(trimmed);
    } catch (_) {
      return emptyCache();
    }
  }
  if (!data || typeof data !== 'object') return emptyCache();
  const messages = Array.isArray(data.messages)
    ? data.messages.map(toCompactMessage).filter(Boolean)
    : [];
  return {
    historyId: data.historyId != null && data.historyId !== '' ? String(data.historyId) : null,
    syncedAt: data.syncedAt || null,
    labels: compactLabels(data.labels),
    messages: capMessages(messages, MAX_CACHED_MESSAGES, nowMs)
  };
}

function serializeSyncCache(cache) {
  const normalized = parseSyncCache(cache);
  return JSON.stringify({
    historyId: normalized.historyId,
    syncedAt: normalized.syncedAt,
    labels: normalized.labels,
    messages: normalized.messages
  });
}

function normalizeInboxMode(query = {}) {
  const mode = String(query.mode || '').trim().toLowerCase();
  if (mode === 'cache' || mode === 'none') return 'cache';
  if (mode === 'full') return 'full';
  if (mode === 'sync' || mode === 'incremental' || mode === 'auto') return 'sync';
  if (String(query.full || '') === '1' || String(query.full || '').toLowerCase() === 'true') {
    return 'full';
  }
  if (
    String(query.cacheOnly || '') === '1' ||
    String(query.cacheOnly || '').toLowerCase() === 'true'
  ) {
    return 'cache';
  }
  const sync = String(query.sync || '').trim().toLowerCase();
  if (sync === '0' || sync === 'false' || sync === 'none' || sync === 'cache') return 'cache';
  if (sync === 'full') return 'full';
  return 'sync';
}

function isHistoryExpiredError(err) {
  const status = err && (err.response?.status || err.status);
  if (status === 404) return true;
  const msg = String(
    (err &&
      err.response &&
      err.response.data &&
      err.response.data.error &&
      err.response.data.error.message) ||
      (err && err.message) ||
      ''
  ).toLowerCase();
  return (
    msg.includes('start history id') ||
    msg.includes('historyid') ||
    msg.includes('requested entity was not found')
  );
}

module.exports = {
  MAX_CACHED_MESSAGES,
  SYNC_CACHE_FIELD,
  SYNC_WINDOW_DAYS,
  DAY_MS,
  emptyCache,
  syncWindowStartMs,
  gmailNewerThanQuery,
  appendDateWindowToQuery,
  messageInternalDateMs,
  isWithinSyncWindow,
  filterMessagesToWindow,
  attachmentCountFromMsg,
  toCompactMessage,
  compactLabels,
  capMessages,
  sortByInternalDateDesc,
  buildCacheFromFullSync,
  collectHistoryMessageIds,
  mergeHistoryIntoCache,
  parseSyncCache,
  serializeSyncCache,
  normalizeInboxMode,
  isHistoryExpiredError
};
