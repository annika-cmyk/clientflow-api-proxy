const { contentHash, itemIdentity } = require('./hash');
const { SOURCES } = require('./sources');
const { enrichItemsWithArticleBodies } = require('./enrich');

function normalizeRawItem(item, fetchedAt) {
  const raw = {
    source: String(item.source || '').trim(),
    source_url: String(item.source_url || '').trim(),
    title: String(item.title || '').replace(/\s+/g, ' ').trim(),
    published_at: String(item.published_at || '').trim(),
    raw_content: String(item.raw_content || item.title || '').trim(),
    fetched_at: fetchedAt
  };
  raw.content_hash = contentHash(raw);
  return raw;
}

async function ingestSources(opts = {}) {
  const fetchText = opts.fetchText;
  if (typeof fetchText !== 'function') throw new Error('ingestSources kräver fetchText');
  const sources = opts.sources || SOURCES;
  const fetchedAt = opts.fetchedAt || new Date().toISOString();
  const byHash = new Map();
  const errors = [];

  for (const source of sources) {
    try {
      const rows = await source.fetch({ fetchText });
      for (const row of rows || []) {
        const item = normalizeRawItem({ ...row, source: row.source || source.id }, fetchedAt);
        if (!item.title || !item.source_url) continue;
        if (!byHash.has(item.content_hash)) byHash.set(item.content_hash, item);
      }
    } catch (err) {
      errors.push({ source: source.id, error: err.message || String(err) });
    }
  }

  const collected = [...byHash.values()];
  const enriched = opts.skipEnrich
    ? collected
    : await enrichItemsWithArticleBodies(collected, fetchText);
  return {
    items: enriched,
    errors,
    fetchedAt
  };
}

function findStored(byHash, byIdentity, row) {
  if (row.content_hash && byHash.has(row.content_hash)) return byHash.get(row.content_hash);
  const key = itemIdentity(row);
  if (key && byIdentity.has(key)) return byIdentity.get(key);
  return null;
}

function mergeLongerContent(prev, next) {
  const prevRaw = String(prev.raw_content || '');
  const nextRaw = String(next.raw_content || '');
  if (nextRaw.length <= prevRaw.length) return prev;
  return { ...prev, raw_content: nextRaw, fetched_at: next.fetched_at || prev.fetched_at };
}

function upsertItems(existing, incoming) {
  const byHash = new Map();
  const byIdentity = new Map();
  const items = [];
  function remember(row) {
    items.push(row);
    if (row.content_hash) byHash.set(row.content_hash, row);
    const key = itemIdentity(row);
    if (key) byIdentity.set(key, row);
  }
  for (const row of existing || []) {
    if (row) remember(row);
  }
  let inserted = 0;
  for (const row of incoming || []) {
    if (!row || !row.content_hash) continue;
    const prev = findStored(byHash, byIdentity, row);
    if (prev) {
      const merged = mergeLongerContent(prev, row);
      if (merged !== prev) {
        const idx = items.indexOf(prev);
        if (idx >= 0) items[idx] = merged;
        if (prev.content_hash) byHash.set(prev.content_hash, merged);
        const key = itemIdentity(merged);
        if (key) byIdentity.set(key, merged);
      }
      continue;
    }
    const stored = { ...row, id: row.id || row.content_hash };
    remember(stored);
    inserted += 1;
  }
  return { items, inserted };
}

module.exports = { normalizeRawItem, ingestSources, upsertItems };
