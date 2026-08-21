'use strict';

const { canonicalizeAvvikelseStatus, needsStatusMigration, CANONICAL_FM_STATUS, AVVIKELSE_STATUS } = require('./avvikelse-status');

const AVVIKELSER_TABLE = 'tblywoL6wHuErTWBK';

function recordSummary(rec) {
  const f = (rec && rec.fields) || {};
  return {
    id: rec.id,
    fromStatus: f.Status || '',
    toStatus: CANONICAL_FM_STATUS,
    orgnr: f.orgnr || '',
    foretagsnamn: f['Företagsnamn'] || '',
    typ: f['Typ av avvikelse'] || '',
    byraId: f.ByråID != null ? String(f.ByråID) : ''
  };
}

async function listAvvikelseRecords({ axios, token, baseId, table = AVVIKELSER_TABLE }) {
  const headers = { Authorization: `Bearer ${token}` };
  const url = `https://api.airtable.com/v0/${baseId}/${table}`;
  const records = [];
  let offset;
  do {
    const res = await axios.get(url, {
      headers,
      params: { pageSize: 100, offset },
      timeout: 20000
    });
    (res.data.records || []).forEach((rec) => records.push(rec));
    offset = res.data.offset;
  } while (offset);
  return records;
}

async function ensureStatusSelectChoices({ axios, token, baseId, tableName = 'Avvikelser' }) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const meta = await axios.get(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000
  });
  const tables = meta.data.tables || [];
  const table = tables.find((t) => t.id === AVVIKELSER_TABLE || t.name === tableName)
    || tables.find((t) => (t.fields || []).some((f) => f.name === 'Status' && /avvik/i.test(t.name || '')));
  if (!table) return { ok: false, reason: 'tabell saknas' };
  const field = (table.fields || []).find((f) => f.name === 'Status');
  if (!field) return { ok: false, reason: 'Status-fält saknas' };
  if (field.type !== 'singleSelect') return { ok: true, skipped: true, type: field.type };
  const existing = ((field.options && field.options.choices) || []).map((c) => c.name);
  const missing = AVVIKELSE_STATUS.filter((name) => !existing.includes(name));
  if (!missing.length) return { ok: true, already: true, choices: existing };
  const choices = [
    ...((field.options && field.options.choices) || []),
    ...missing.map((name) => ({ name }))
  ];
  await axios.patch(
    `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${table.id}/fields/${field.id}`,
    { options: { choices } },
    { headers, timeout: 15000 }
  );
  return { ok: true, added: missing, choices: choices.map((c) => c.name) };
}

async function migrateAvvikelseStatuses(opts = {}) {
  const axios = opts.axios;
  const token = opts.token;
  const baseId = opts.baseId;
  if (!axios || !token || !baseId) throw new Error('migrateAvvikelseStatuses kräver axios, token och baseId');
  const dryRun = !!opts.dryRun;
  const records = await listAvvikelseRecords(opts);
  const candidates = records.filter((rec) => needsStatusMigration((rec.fields || {}).Status));
  const changed = [];
  const errors = [];
  if (!dryRun && candidates.length) {
    try {
      await ensureStatusSelectChoices(opts);
    } catch (err) {
      errors.push({ step: 'ensureChoices', error: err.message });
    }
  }
  for (const rec of candidates) {
    const next = canonicalizeAvvikelseStatus((rec.fields || {}).Status);
    const summary = recordSummary(rec);
    summary.toStatus = next;
    if (dryRun) {
      changed.push(summary);
      continue;
    }
    try {
      await axios.patch(
        `https://api.airtable.com/v0/${baseId}/${opts.table || AVVIKELSER_TABLE}/${rec.id}`,
        { fields: { Status: next }, typecast: true },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 }
      );
      changed.push(summary);
    } catch (err) {
      errors.push({ id: rec.id, error: err.message, fromStatus: summary.fromStatus });
    }
  }
  return {
    scanned: records.length,
    changed,
    errors,
    dryRun
  };
}

module.exports = {
  AVVIKELSER_TABLE,
  listAvvikelseRecords,
  ensureStatusSelectChoices,
  migrateAvvikelseStatuses,
  recordSummary
};
