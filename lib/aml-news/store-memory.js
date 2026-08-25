const { itemIdentity } = require('./hash');

function createMemoryStore(seed = []) {
  const rows = new Map();
  for (const row of seed) {
    const id = row.id || row.content_hash;
    rows.set(id, { ...row, id });
  }

  function findRow(row) {
    if (row.content_hash) {
      const byHash = [...rows.values()].find((r) => r.content_hash === row.content_hash);
      if (byHash) return byHash;
    }
    const key = itemIdentity(row);
    if (key) return [...rows.values()].find((r) => itemIdentity(r) === key) || null;
    return null;
  }

  return {
    async list() {
      return [...rows.values()];
    },
    async listUnclassified() {
      return [...rows.values()].filter((r) => !r.classified_at);
    },
    async upsertMany(incoming) {
      let inserted = 0;
      for (const row of incoming || []) {
        if (!row.content_hash) continue;
        const existing = findRow(row);
        if (existing) {
          if (String(row.raw_content || '').length > String(existing.raw_content || '').length) {
            existing.raw_content = row.raw_content;
            if (row.fetched_at) existing.fetched_at = row.fetched_at;
          }
          if (!existing.published_at && row.published_at) existing.published_at = row.published_at;
          continue;
        }
        const id = row.id || row.content_hash;
        rows.set(id, { ...row, id });
        inserted += 1;
      }
      return { inserted, total: rows.size };
    },
    async updateFields(id, partial) {
      const row = rows.get(id) || [...rows.values()].find((r) => r.content_hash === id);
      if (!row) throw new Error('Okänd nyhet: ' + id);
      Object.assign(row, partial || {});
      rows.set(row.id, row);
      return row;
    },
    async saveClassification(id, classification) {
      const row = rows.get(id) || [...rows.values()].find((r) => r.content_hash === id);
      if (!row) throw new Error('Okänd nyhet: ' + id);
      Object.assign(row, classification, {
        classification_json: JSON.stringify(classification)
      });
      rows.set(row.id, row);
      return row;
    }
  };
}

module.exports = { createMemoryStore };
