/**
 * Spara Gmail-bilagor / mejlsnapshot till kunddokumentation, uppdrag eller körning.
 *
 * Uppdragskörning i ClientFlow-UI läser dokumentation från **Uppdrag**-posten
 * (fält Dokumentation/Attachments), filtrerat på deadline i filnamnet
 * (`YYYY-MM-DD - fil.pdf`) — samma modell som POST /api/uppdrag/run-docs.
 * Vi skriver därför primärt dit, och dual-write:ar även till körningens egen
 * Dokumentation så filen syns på körningsraden i Airtable.
 */
const axios = require('axios');
const emailSnapshot = require('./email-snapshot');

const KUNDDATA_TABLE = process.env.AIRTABLE_TABLE_KUNDDATA_ID || 'tblOIuLQS2DqmOQWe';
const UPPDRAG_TABLE_NAME = 'Uppdrag';
const UPPDRAG_RUNS_TABLE_NAME = 'Uppdragskörningar';
const ATTACHMENT_FIELD_CANDIDATES = ['Dokumentation', 'Attachments'];

function airtableConfig() {
  return {
    token: process.env.AIRTABLE_ACCESS_TOKEN,
    baseId: process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50'
  };
}

const fieldIdCache = new Map();
const tableIdCache = new Map();

function airtableErrorMessage(err) {
  const api = err && err.response && err.response.data && err.response.data.error;
  if (api && typeof api === 'object') {
    return String(api.message || api.type || '');
  }
  return String((err && err.message) || '');
}

function isNotFoundOrPermissionsError(err) {
  const status = err && err.response && err.response.status;
  if (status === 403 || status === 404) return true;
  const msg = airtableErrorMessage(err);
  return /NOT_FOUND|INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND|Unknown field|Could not find/i.test(msg);
}

async function listTablesMeta(token, baseId) {
  const res = await axios.get(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000
  });
  return res.data.tables || [];
}

async function resolveTableId(token, baseId, { envId, tableName, fallbackId }) {
  const cacheKey = `${baseId}:${envId || ''}:${tableName || ''}:${fallbackId || ''}`;
  if (tableIdCache.has(cacheKey)) return tableIdCache.get(cacheKey);

  const forced = String(envId || '').trim();
  let tables = null;
  try {
    tables = await listTablesMeta(token, baseId);
  } catch (_) {
    tables = null;
  }

  if (tables && tables.length) {
    if (tableName) {
      const byName = tables.find(
        (t) => String(t.name || '').trim().toLowerCase() === String(tableName).trim().toLowerCase()
      );
      if (byName) {
        tableIdCache.set(cacheKey, byName.id);
        return byName.id;
      }
    }
    if (forced) {
      const byId = tables.find((t) => t.id === forced);
      if (byId) {
        tableIdCache.set(cacheKey, byId.id);
        return byId.id;
      }
    }
  }

  const resolved = forced || fallbackId || null;
  if (resolved) tableIdCache.set(cacheKey, resolved);
  return resolved;
}

async function resolveFieldId(token, baseId, tableId, fieldName) {
  const key = `${baseId}:${tableId}:${fieldName}`;
  if (fieldIdCache.has(key)) return fieldIdCache.get(key);
  try {
    const tables = await listTablesMeta(token, baseId);
    const table = (tables || []).find((t) => t.id === tableId || (t.name || '') === tableId);
    if (!table) return null;
    const field = (table.fields || []).find((f) => (f.name || '') === fieldName);
    if (field && field.id) {
      fieldIdCache.set(key, field.id);
      return field.id;
    }
  } catch (_) {}
  return null;
}

async function uploadAttachment(recordId, buffer, filename, contentType, tableId, fieldName) {
  const { token, baseId } = airtableConfig();
  if (!token) throw new Error('AIRTABLE_ACCESS_TOKEN saknas');
  let fieldId = null;
  if (tableId) fieldId = await resolveFieldId(token, baseId, tableId, fieldName);
  const url = fieldId
    ? `https://content.airtable.com/v0/${baseId}/${recordId}/${fieldId}/uploadAttachment`
    : `https://content.airtable.com/v0/${baseId}/${recordId}/${encodeURIComponent(fieldName)}/uploadAttachment`;
  const safeContentType = normalizeAirtableContentType(contentType, filename);
  try {
    const res = await axios.post(
      url,
      { contentType: safeContentType, file: buffer.toString('base64'), filename },
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 60000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      }
    );
    return res.data.attachment || res.data;
  } catch (err) {
    const msg = airtableErrorMessage(err) || err.message;
    const wrapped = new Error(msg);
    wrapped.cause = err;
    wrapped.response = err.response;
    wrapped.code = isNotFoundOrPermissionsError(err) ? 'AIRTABLE_NOT_FOUND' : 'AIRTABLE_UPLOAD';
    throw wrapped;
  }
}

async function uploadAttachmentWithFieldFallback(recordId, buffer, filename, contentType, tableId, label) {
  const errors = [];
  for (const fieldName of ATTACHMENT_FIELD_CANDIDATES) {
    try {
      const att = await uploadAttachment(recordId, buffer, filename, contentType, tableId, fieldName);
      if (att && (att.url || att.id)) {
        return { attachment: att, fieldName };
      }
    } catch (err) {
      errors.push(`${fieldName}: ${err.message}`);
      if (!isNotFoundOrPermissionsError(err) && err.code !== 'AIRTABLE_NOT_FOUND') {
        throw err;
      }
    }
  }
  const detail = errors.length ? ` (${errors.join('; ')})` : '';
  const err = new Error(
    `Kunde inte spara till ${label}: saknar bilagefältet Dokumentation/Attachments, eller fel tabell/behörighet.${detail}`
  );
  err.code = 'AIRTABLE_ATTACHMENT_FIELD';
  throw err;
}

function guessContentType(filename) {
  const lower = String(filename || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
  return 'application/octet-stream';
}

/**
 * Airtable Content API rejects MIME types with parameters
 * (e.g. `text/html; charset=utf-8` → misleading INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND).
 * Strip parameters and fall back to a guessed type from the filename.
 */
function normalizeAirtableContentType(contentType, filename) {
  const raw = String(contentType || '').trim();
  const base = raw.split(';')[0].trim().toLowerCase();
  if (base && /^[\w.+-]+\/[\w.+-]+$/.test(base)) return base;
  return guessContentType(filename);
}

function safeFilename(name, fallback = 'fil') {
  return String(name || fallback).replace(/[^\w\u00e5\u00e4\u00f6\u00c5\u00c4\u00d6 .\-()@]+/gi, '_').trim().slice(0, 120) || fallback;
}

/** Same naming as POST /api/uppdrag/run-docs so kundkort filters by deadline in filename. */
function buildRunDocFilename(deadline, filename) {
  const safeDeadline = String(deadline || '').slice(0, 10);
  const cleanName = safeFilename(filename);
  if (safeDeadline && /^\d{4}-\d{2}-\d{2}$/.test(safeDeadline)) {
    return `${safeDeadline} - ${cleanName}`;
  }
  return cleanName;
}

function buildRunLabel(fields) {
  const f = fields || {};
  const period = String(f['Period Label'] || f.PeriodKey || '').trim();
  const typ = String(f.Typ || '').trim();
  const deadline = String(f.Deadline || '').slice(0, 10);
  const parts = [];
  if (period) parts.push(period);
  if (typ) parts.push(typ);
  if (deadline) parts.push(deadline);
  return parts.join(' · ') || null;
}

function normalizeTargetType(type) {
  return String(type || 'dokumentation').toLowerCase();
}

function resolveSaveTargetSpec(target) {
  const type = normalizeTargetType(target && target.type);
  if (type === 'dokumentation' || type === 'kund' || type === 'customer') {
    return {
      type: 'dokumentation',
      recordId: (target && (target.customerId || target.recordId)) || null,
      tableEnv: 'AIRTABLE_TABLE_KUNDDATA_ID',
      tableName: 'KUNDDATA',
      fallbackTableId: KUNDDATA_TABLE,
      label: 'kundens Dokumentation'
    };
  }
  if (type === 'uppdrag') {
    return {
      type: 'uppdrag',
      recordId: (target && (target.uppdragId || target.recordId)) || null,
      tableEnv: 'AIRTABLE_TABLE_UPPDRAG_ID',
      tableName: UPPDRAG_TABLE_NAME,
      fallbackTableId: null,
      label: 'Uppdrag'
    };
  }
  if (type === 'korning' || type === 'run' || type === 'uppdragskorning') {
    return {
      type: 'korning',
      recordId: (target && (target.runId || target.recordId)) || null,
      tableEnv: 'AIRTABLE_TABLE_UPPDRAG_RUNS_ID',
      tableName: UPPDRAG_RUNS_TABLE_NAME,
      fallbackTableId: null,
      label: 'Uppdragskörning'
    };
  }
  return { type, recordId: null, tableEnv: null, tableName: null, fallbackTableId: null, label: type };
}

async function fetchAirtableRecord(token, baseId, tableRef, recordId) {
  const res = await axios.get(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableRef)}/${encodeURIComponent(recordId)}`,
    { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 }
  );
  return res.data;
}

/**
 * Resolve where ClientFlow UI expects körning-dokumentation:
 * Uppdrag-post + deadline-prefix (see /api/uppdrag/run-docs + kundkort filter).
 */
async function resolveKorningUploadTarget(runId) {
  const { token, baseId } = airtableConfig();
  if (!token) throw new Error('AIRTABLE_ACCESS_TOKEN saknas');
  const id = String(runId || '').trim();
  if (!id) throw new Error('runId saknas');

  const runsTableId = await resolveTableId(token, baseId, {
    envId: process.env.AIRTABLE_TABLE_UPPDRAG_RUNS_ID,
    tableName: UPPDRAG_RUNS_TABLE_NAME,
    fallbackId: null
  });
  if (!runsTableId) {
    const err = new Error(
      `Tabellen ${UPPDRAG_RUNS_TABLE_NAME} hittades inte i Airtable. Kontrollera setup eller env AIRTABLE_TABLE_UPPDRAG_RUNS_ID.`
    );
    err.code = 'AIRTABLE_TABLE_MISSING';
    throw err;
  }

  let run;
  try {
    run = await fetchAirtableRecord(token, baseId, runsTableId, id);
  } catch (err) {
    if (err.response && err.response.status === 404) {
      const e = new Error('Uppdragskörningen hittades inte');
      e.code = 'NOT_FOUND';
      throw e;
    }
    throw err;
  }

  const fields = (run && run.fields) || {};
  const uppdragId = String(fields['Uppdrag ID'] || '').trim();
  if (!uppdragId) {
    const e = new Error('Körningen saknar koppling till Uppdrag (fältet Uppdrag ID)');
    e.code = 'KORNING_MISSING_UPPDRAG';
    throw e;
  }

  const deadline = String(fields.Deadline || '').slice(0, 10);
  const typ = String(fields.Typ || '').trim();
  const periodLabel = String(fields['Period Label'] || fields.PeriodKey || '').trim();
  const customerId = String(fields['Kund ID'] || '').trim() || null;
  const runLabel = buildRunLabel(fields);

  const uppdragTableId = await resolveTableId(token, baseId, {
    envId: process.env.AIRTABLE_TABLE_UPPDRAG_ID,
    tableName: UPPDRAG_TABLE_NAME,
    fallbackId: null
  });

  return {
    runId: id,
    runsTableId,
    uppdragId,
    uppdragTableId,
    deadline: deadline || null,
    typ: typ || null,
    periodLabel: periodLabel || null,
    customerId,
    runLabel,
    uppdragName: typ || null
  };
}

async function saveBufferToTarget(buffer, filename, contentType, target) {
  const { token, baseId } = airtableConfig();
  if (!token) throw new Error('AIRTABLE_ACCESS_TOKEN saknas');

  const spec = resolveSaveTargetSpec(target);
  const name = safeFilename(filename);
  const ct = normalizeAirtableContentType(contentType, name);

  if (!spec.recordId) {
    if (spec.type === 'dokumentation') throw new Error('customerId saknas för dokumentation');
    if (spec.type === 'uppdrag') throw new Error('uppdragId saknas');
    if (spec.type === 'korning') throw new Error('runId saknas');
    throw new Error(`Okänt sparmål: ${spec.type}`);
  }

  if (spec.type === 'korning') {
    const korning = await resolveKorningUploadTarget(spec.recordId);
    const displayName = buildRunDocFilename(korning.deadline, name);

    if (!korning.uppdragTableId) {
      const err = new Error(
        `Tabellen ${UPPDRAG_TABLE_NAME} hittades inte i Airtable. Kontrollera setup eller env AIRTABLE_TABLE_UPPDRAG_ID.`
      );
      err.code = 'AIRTABLE_TABLE_MISSING';
      throw err;
    }

    const { attachment: att, fieldName } = await uploadAttachmentWithFieldFallback(
      korning.uppdragId,
      buffer,
      displayName,
      ct,
      korning.uppdragTableId,
      'Uppdrag (körningens dokumentation)'
    );

    let runAttachment = null;
    let runFieldName = null;
    try {
      const dual = await uploadAttachmentWithFieldFallback(
        korning.runId,
        buffer,
        displayName,
        ct,
        korning.runsTableId,
        'Uppdragskörning'
      );
      runAttachment = dual.attachment;
      runFieldName = dual.fieldName;
    } catch (err) {
      console.warn('mejl archive-save: dual-write till körning misslyckades:', err.message);
    }

    return {
      type: 'korning',
      runId: korning.runId,
      uppdragId: korning.uppdragId,
      customerId: korning.customerId || (target && target.customerId) || null,
      attachment: att,
      runAttachment,
      filename: displayName,
      fieldName,
      runFieldName,
      tableId: korning.uppdragTableId,
      runsTableId: korning.runsTableId,
      deadline: korning.deadline,
      runLabel: korning.runLabel,
      runName: korning.runLabel,
      uppdragName: korning.uppdragName,
      writePath: 'uppdrag+run'
    };
  }

  const tableId = await resolveTableId(token, baseId, {
    envId: process.env[spec.tableEnv],
    tableName: spec.tableName,
    fallbackId: spec.fallbackTableId
  });

  if (spec.type === 'uppdrag' && !tableId) {
    const err = new Error(
      `Tabellen ${spec.tableName} hittades inte i Airtable. Kontrollera setup eller env ${spec.tableEnv}.`
    );
    err.code = 'AIRTABLE_TABLE_MISSING';
    throw err;
  }

  const { attachment: att, fieldName } = await uploadAttachmentWithFieldFallback(
    spec.recordId,
    buffer,
    name,
    ct,
    tableId,
    spec.label
  );

  if (spec.type === 'dokumentation') {
    return { type: 'dokumentation', customerId: spec.recordId, attachment: att, filename: name, fieldName, tableId };
  }
  return { type: 'uppdrag', uppdragId: spec.recordId, attachment: att, filename: name, fieldName, tableId };
}

function buildEmailSnapshotFilename(message) {
  return emailSnapshot.buildEmailSnapshotFilename(message);
}

function stripHtml(html) {
  return emailSnapshot.stripHtml(html);
}

function buildEmailSnapshotText(message) {
  return emailSnapshot.buildEmailSnapshotText(message);
}

function buildEmailSnapshotHtml(message) {
  return emailSnapshot.buildEmailSnapshotHtml(message);
}

function formatSaveDestination(saved) {
  if (!saved || saved.error) return null;
  if (saved.type === 'korning') {
    const name = saved.runName || saved.runLabel || saved.deadline || saved.runId || '';
    return name ? `Uppdragskörning: ${name}` : 'Uppdragskörning';
  }
  if (saved.type === 'uppdrag') {
    const name = saved.uppdragName || saved.uppdragId || '';
    return name ? `Uppdrag: ${name}` : 'Uppdrag';
  }
  if (saved.type === 'dokumentation') return 'Dokumentation på kunden';
  return saved.type || null;
}

function clearCachesForTests() {
  fieldIdCache.clear();
  tableIdCache.clear();
}

module.exports = {
  uploadAttachment,
  uploadAttachmentWithFieldFallback,
  saveBufferToTarget,
  resolveSaveTargetSpec,
  resolveTableId,
  resolveKorningUploadTarget,
  buildRunDocFilename,
  buildRunLabel,
  formatSaveDestination,
  guessContentType,
  normalizeAirtableContentType,
  safeFilename,
  buildEmailSnapshotFilename,
  buildEmailSnapshotText,
  buildEmailSnapshotHtml,
  stripHtml,
  airtableErrorMessage,
  isNotFoundOrPermissionsError,
  clearCachesForTests,
  emailSnapshot,
  ATTACHMENT_FIELD_CANDIDATES,
  UPPDRAG_TABLE_NAME,
  UPPDRAG_RUNS_TABLE_NAME,
  KUNDDATA_TABLE
};
