function createMemoryStore(seed = []) {
  const rows = new Map();
  for (const row of seed) {
    const id = row.id || row.content_hash;
    rows.set(id, { ...row, id });
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
        const existing = [...rows.values()].find((r) => r.content_hash === row.content_hash);
        if (existing) continue;
        const id = row.id || row.content_hash;
        rows.set(id, { ...row, id });
        inserted += 1;
      }
      return { inserted, total: rows.size };
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
