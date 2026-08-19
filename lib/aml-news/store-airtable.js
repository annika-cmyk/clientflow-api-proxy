const { NEWS_TABLE, NEWS_FIELDS } = require('./schema');

function parseJsonList(v) {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return String(v).split(',').map((s) => s.trim()).filter(Boolean);
  }
}

function fromRecord(rec) {
  const f = rec.fields || {};
  return {
    id: rec.id,
    source: f.source || '',
    source_url: f.source_url || '',
    title: f.title || '',
    published_at: f.published_at || '',
    raw_content: f.raw_content || '',
    fetched_at: f.fetched_at || '',
    content_hash: f.content_hash || '',
    category: f.category || '',
    severity: f.severity || '',
    summary_sv: f.summary_sv || '',
    affected_industries: parseJsonList(f.affected_industries),
    affected_geography: parseJsonList(f.affected_geography),
    classified_at: f.classified_at || '',
    classification_json: f.classification_json || ''
  };
}

function toFields(row) {
  const fields = {
    source: row.source || '',
    source_url: row.source_url || '',
    title: String(row.title || '').slice(0, 200),
    published_at: row.published_at || '',
    raw_content: String(row.raw_content || '').slice(0, 8000),
    fetched_at: row.fetched_at || '',
    content_hash: row.content_hash || ''
  };
  if (row.category) fields.category = row.category;
  if (row.severity) fields.severity = row.severity;
  if (row.summary_sv) fields.summary_sv = row.summary_sv;
  if (row.affected_industries) fields.affected_industries = JSON.stringify(row.affected_industries);
  if (row.affected_geography) fields.affected_geography = JSON.stringify(row.affected_geography);
  if (row.classified_at) fields.classified_at = row.classified_at;
  if (row.classification_json) fields.classification_json = row.classification_json;
  return fields;
}

function createAirtableStore({ axios, token, baseId, tableName = NEWS_TABLE }) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;

  async function listAll() {
    const out = [];
    let offset;
    do {
      const res = await axios.get(url, { headers, params: { pageSize: 100, offset }, timeout: 20000 });
      (res.data.records || []).forEach((r) => out.push(fromRecord(r)));
      offset = res.data.offset;
    } while (offset);
    return out;
  }

  return {
    async ensureTable(metaAxios) {
      const metaUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
      const meta = await (metaAxios || axios).get(metaUrl, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
      const tables = meta.data.tables || [];
      const existing = tables.find((t) => String(t.name || '').trim() === tableName);
      if (existing) return existing;
      const created = await axios.post(metaUrl, {
        name: tableName,
        fields: NEWS_FIELDS.map((f) => ({ name: f.name, type: f.type }))
      }, { headers, timeout: 15000 });
      return created.data;
    },
    async list() {
      return listAll();
    },
    async listUnclassified() {
      const all = await listAll();
      return all.filter((r) => !r.classified_at);
    },
    async upsertMany(incoming) {
      let existing;
      try {
        existing = await listAll();
      } catch (err) {
        const msg = err.response?.data?.error?.message || err.message || '';
        if (!/NOT_FOUND|Unknown table|Could not find table/i.test(String(msg))) throw err;
        await this.ensureTable();
        existing = [];
      }
      const hashes = new Set(existing.map((r) => r.content_hash));
      let inserted = 0;
      for (const row of incoming || []) {
        if (!row.content_hash || hashes.has(row.content_hash)) continue;
        await axios.post(url, { fields: toFields(row) }, { headers, timeout: 15000 });
        hashes.add(row.content_hash);
        inserted += 1;
      }
      return { inserted, total: hashes.size };
    },
    async saveClassification(id, classification) {
      await axios.patch(`${url}/${encodeURIComponent(id)}`, {
        fields: toFields({ ...classification, classification_json: JSON.stringify(classification) })
      }, { headers, timeout: 15000 });
      return { id, ...classification };
    }
  };
}

module.exports = { createAirtableStore, fromRecord, toFields };
