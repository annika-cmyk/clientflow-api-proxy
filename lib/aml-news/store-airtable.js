const { NEWS_TABLE, NEWS_FIELDS } = require('./schema');
const { itemIdentity } = require('./hash');

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

/** Endast klassificeringsfält — får aldrig nollställa title/source/content_hash. */
function toClassificationFields(classification) {
  const cls = classification && typeof classification === 'object' ? classification : {};
  return {
    category: cls.category || '',
    severity: cls.severity || '',
    summary_sv: String(cls.summary_sv || '').slice(0, 4000),
    affected_industries: JSON.stringify(Array.isArray(cls.affected_industries) ? cls.affected_industries : []),
    affected_geography: JSON.stringify(Array.isArray(cls.affected_geography) ? cls.affected_geography : []),
    classified_at: cls.classified_at || new Date().toISOString(),
    classification_json: cls.classification_json || JSON.stringify(cls)
  };
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
      const hashes = new Set(existing.map((r) => r.content_hash).filter(Boolean));
      const byIdentity = new Map(existing.map((r) => [itemIdentity(r), r]).filter(([k]) => k));
      let inserted = 0;
      for (const row of incoming || []) {
        if (!row.content_hash) continue;
        const prev = (row.content_hash && existing.find((r) => r.content_hash === row.content_hash))
          || byIdentity.get(itemIdentity(row));
        if (prev) {
          const fields = {};
          if (String(row.raw_content || '').length > String(prev.raw_content || '').length) {
            fields.raw_content = String(row.raw_content).slice(0, 8000);
            fields.fetched_at = row.fetched_at || prev.fetched_at || '';
          }
          if (!prev.published_at && row.published_at) fields.published_at = String(row.published_at);
          if (prev.id && Object.keys(fields).length) {
            await axios.patch(`${url}/${encodeURIComponent(prev.id)}`, { fields }, { headers, timeout: 15000 });
          }
          continue;
        }
        await axios.post(url, { fields: toFields(row) }, { headers, timeout: 15000 });
        hashes.add(row.content_hash);
        inserted += 1;
      }
      return { inserted, total: hashes.size };
    },
    async updateFields(id, partial) {
      const fields = {};
      if (partial && partial.raw_content != null) fields.raw_content = String(partial.raw_content).slice(0, 8000);
      if (partial && partial.summary_sv != null) fields.summary_sv = String(partial.summary_sv).slice(0, 4000);
      if (partial && partial.fetched_at != null) fields.fetched_at = String(partial.fetched_at);
      if (partial && partial.published_at != null) fields.published_at = String(partial.published_at);
      if (!Object.keys(fields).length) return { id };
      await axios.patch(`${url}/${encodeURIComponent(id)}`, { fields }, { headers, timeout: 15000 });
      return { id, ...partial };
    },
    async saveClassification(id, classification) {
      await axios.patch(`${url}/${encodeURIComponent(id)}`, {
        fields: toClassificationFields(classification)
      }, { headers, timeout: 15000 });
      return { id, ...classification };
    }
  };
}

module.exports = { createAirtableStore, fromRecord, toFields, toClassificationFields };
