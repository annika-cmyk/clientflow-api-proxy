'use strict';

const { filterAuditLogs, forbidDelete, forbidUpdate } = require('./audit-log');

const TABLE_NAME = 'Audit logg';
const TABLE_ALIASES = ['Audit logg', 'Audit log', 'Revisionslogg'];

const FIELDS = Object.freeze({
  actionType: 'Action type',
  timestamp: 'Timestamp',
  actorId: 'Actor id',
  actorName: 'Actor name',
  entityType: 'Entity type',
  entityId: 'Entity id',
  fieldChanged: 'Field changed',
  valueBefore: 'Value before',
  valueAfter: 'Value after',
  motivering: 'Motivering',
  metadata: 'Metadata',
  byraId: 'Byrå ID',
  relatedLogId: 'Related log id',
  requiresReview: 'Requires review'
});

function stringifyJson(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function fromRecord(rec) {
  const f = rec.fields || {};
  return {
    id: rec.id,
    timestamp: f[FIELDS.timestamp] || rec.createdTime || '',
    actorId: f[FIELDS.actorId] || '',
    actorName: f[FIELDS.actorName] || '',
    entityType: f[FIELDS.entityType] || '',
    entityId: f[FIELDS.entityId] || '',
    actionType: f[FIELDS.actionType] || '',
    fieldChanged: f[FIELDS.fieldChanged] || '',
    valueBefore: parseJson(f[FIELDS.valueBefore], f[FIELDS.valueBefore] || null),
    valueAfter: parseJson(f[FIELDS.valueAfter], f[FIELDS.valueAfter] || null),
    motivering: f[FIELDS.motivering] || '',
    metadata: parseJson(f[FIELDS.metadata], {}),
    byraId: f[FIELDS.byraId] != null ? String(f[FIELDS.byraId]) : '',
    relatedLogId: f[FIELDS.relatedLogId] || '',
    requiresReview: !!f[FIELDS.requiresReview]
  };
}

function toFields(entry) {
  const fields = {
    [FIELDS.actionType]: String(entry.actionType || '').slice(0, 80),
    [FIELDS.timestamp]: entry.timestamp || new Date().toISOString(),
    [FIELDS.actorId]: String(entry.actorId || 'system').slice(0, 120),
    [FIELDS.actorName]: String(entry.actorName || 'System').slice(0, 120),
    [FIELDS.entityType]: String(entry.entityType || '').slice(0, 80),
    [FIELDS.entityId]: String(entry.entityId || '').slice(0, 80),
    [FIELDS.fieldChanged]: String(entry.fieldChanged || '').slice(0, 120),
    [FIELDS.valueBefore]: stringifyJson(entry.valueBefore).slice(0, 80000),
    [FIELDS.valueAfter]: stringifyJson(entry.valueAfter).slice(0, 80000),
    [FIELDS.motivering]: String(entry.motivering || '').slice(0, 20000),
    [FIELDS.metadata]: stringifyJson(entry.metadata || {}).slice(0, 80000),
    [FIELDS.byraId]: String(entry.byraId || '').slice(0, 40),
    [FIELDS.relatedLogId]: String(entry.relatedLogId || '').slice(0, 80),
    [FIELDS.requiresReview]: !!entry.requiresReview
  };
  return fields;
}

function tableCreatePayload() {
  return {
    name: TABLE_NAME,
    description: 'Append-only revisionslogg enligt PTL 4 kap. och 6 kap. 1 §. Appen blockerar UPDATE/DELETE. Airtable saknar tabellnivå-spärr: ge mänskliga collaborators bara läsbehörighet till den här tabellen. Se docs/audit-log-airtable-skydd.md.',
    fields: [
      { name: FIELDS.actionType, type: 'singleLineText' },
      { name: FIELDS.timestamp, type: 'singleLineText' },
      { name: FIELDS.actorId, type: 'singleLineText' },
      { name: FIELDS.actorName, type: 'singleLineText' },
      { name: FIELDS.entityType, type: 'singleLineText' },
      { name: FIELDS.entityId, type: 'singleLineText' },
      { name: FIELDS.fieldChanged, type: 'singleLineText' },
      { name: FIELDS.valueBefore, type: 'multilineText' },
      { name: FIELDS.valueAfter, type: 'multilineText' },
      { name: FIELDS.motivering, type: 'multilineText' },
      { name: FIELDS.metadata, type: 'multilineText' },
      { name: FIELDS.byraId, type: 'singleLineText' },
      { name: FIELDS.relatedLogId, type: 'singleLineText' },
      { name: FIELDS.requiresReview, type: 'checkbox', options: { color: 'yellowBright', icon: 'check' } }
    ]
  };
}

function findTable(tables) {
  const list = Array.isArray(tables) ? tables : [];
  return list.find((t) => TABLE_ALIASES.includes(String(t.name || '').trim())) || null;
}

function escapeFormula(value) {
  return String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function createAirtableStore({ axios, token, baseId, tableName = TABLE_NAME }) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  let resolvedName = tableName;
  let ensured = false;

  function recordsUrl() {
    return `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(resolvedName)}`;
  }

  async function ensureTable() {
    if (ensured) return resolvedName;
    const metaUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
    const meta = await axios.get(metaUrl, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
    const existing = findTable(meta.data.tables || []);
    if (existing) {
      resolvedName = existing.name;
      ensured = true;
      return resolvedName;
    }
    const created = await axios.post(metaUrl, tableCreatePayload(), { headers, timeout: 20000 });
    resolvedName = (created.data && created.data.name) || TABLE_NAME;
    ensured = true;
    return resolvedName;
  }

  async function insert(entry) {
    await ensureTable();
    const res = await axios.post(recordsUrl(), { fields: toFields(entry), typecast: true }, { headers, timeout: 15000 });
    return fromRecord(res.data);
  }

  async function list(query) {
    await ensureTable();
    const params = { pageSize: 100 };
    const formulaParts = [];
    if (query && query.byraId) formulaParts.push(`{${FIELDS.byraId}}="${escapeFormula(query.byraId)}"`);
    if (query && query.entityType) formulaParts.push(`{${FIELDS.entityType}}="${escapeFormula(query.entityType)}"`);
    if (query && query.entityId) formulaParts.push(`{${FIELDS.entityId}}="${escapeFormula(query.entityId)}"`);
    if (query && query.actionType) formulaParts.push(`{${FIELDS.actionType}}="${escapeFormula(query.actionType)}"`);
    if (query && query.requiresReview === true) formulaParts.push(`{${FIELDS.requiresReview}}=TRUE()`);
    if (formulaParts.length === 1) params.filterByFormula = formulaParts[0];
    if (formulaParts.length > 1) params.filterByFormula = `AND(${formulaParts.join(',')})`;
    const out = [];
    let offset;
    do {
      const res = await axios.get(recordsUrl(), {
        headers,
        params: { ...params, offset },
        timeout: 20000
      });
      (res.data.records || []).forEach((rec) => out.push(fromRecord(rec)));
      offset = res.data.offset;
    } while (offset && out.length < 800);
    return filterAuditLogs(out, query);
  }

  async function getById(id) {
    if (!id) return null;
    await ensureTable();
    try {
      const res = await axios.get(`${recordsUrl()}/${encodeURIComponent(id)}`, { headers, timeout: 15000 });
      return fromRecord(res.data);
    } catch (err) {
      if (err.response && err.response.status === 404) return null;
      throw err;
    }
  }

  return {
    ensureTable,
    insert,
    list,
    getById,
    update: forbidUpdate,
    delete: forbidDelete,
    patch: forbidUpdate,
    remove: forbidDelete
  };
}

module.exports = {
  TABLE_NAME,
  FIELDS,
  fromRecord,
  toFields,
  tableCreatePayload,
  findTable,
  createAirtableStore
};
