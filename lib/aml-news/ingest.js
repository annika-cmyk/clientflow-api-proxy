const { contentHash } = require('./hash');
const { SOURCES } = require('./sources');

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

  return {
    items: [...byHash.values()],
    errors,
    fetchedAt
  };
}

function upsertItems(existing, incoming) {
  const byHash = new Map();
  for (const row of existing || []) {
    if (row && row.content_hash) byHash.set(row.content_hash, row);
  }
  let inserted = 0;
  for (const row of incoming || []) {
    if (!row || !row.content_hash) continue;
    if (byHash.has(row.content_hash)) continue;
    byHash.set(row.content_hash, { ...row, id: row.id || row.content_hash });
    inserted += 1;
  }
  return { items: [...byHash.values()], inserted };
}

module.exports = { normalizeRawItem, ingestSources, upsertItems };
