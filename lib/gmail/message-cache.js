/**
 * Airtable-lagring av Gmail-mejl (metadata + body) för senaste månaden.
 * Separat från Mejlarkiv (spara/dela/privat) — detta är sync-cache per användare.
 */
'use strict';

const axios = require('axios');
const { htmlToPlainText } = require('../html-plain-text');
const syncCache = require('./sync-cache');

const TABLE_NAME = 'Gmail Mejlcache';

const REQUIRED_FIELDS = [
  { name: 'Owner User ID', type: 'singleLineText', description: 'Application Users record id' },
  { name: 'Gmail Message ID', type: 'singleLineText' },
  { name: 'Thread ID', type: 'singleLineText' },
  { name: 'Label Ids', type: 'multilineText', description: 'JSON-array' },
  { name: 'Internal Date', type: 'singleLineText', description: 'ms sedan epoch' },
  { name: 'Subject', type: 'singleLineText' },
  { name: 'From', type: 'singleLineText' },
  { name: 'To', type: 'singleLineText' },
  { name: 'Cc', type: 'singleLineText' },
  { name: 'Date', type: 'singleLineText' },
  { name: 'Snippet', type: 'singleLineText' },
  { name: 'Body Text', type: 'multilineText' },
  { name: 'Body Html', type: 'multilineText' },
  { name: 'Attachment Meta', type: 'multilineText', description: 'JSON attachment metadata' },
  { name: 'Message Id Header', type: 'singleLineText' },
  { name: 'In Reply To', type: 'singleLineText' },
  { name: 'Synced At', type: 'singleLineText' }
];

let cachedTableId = null;

function airtableConfig() {
  return {
    token: process.env.AIRTABLE_ACCESS_TOKEN,
    baseId: process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50'
  };
}

function tableRef() {
  if (cachedTableId) return cachedTableId;
  const envId = String(process.env.AIRTABLE_TABLE_GMAIL_MEJLCACHE_ID || '').trim();
  if (envId) return envId;
  return encodeURIComponent(TABLE_NAME);
}

function clearCachedTableId() {
  cachedTableId = null;
}

function setCachedTableId(tableId) {
  const id = String(tableId || '').trim();
  if (id) cachedTableId = id;
}

function isMissingTableError(err) {
  const status = err && err.response && err.response.status;
  if (status === 404 || status === 403) return true;
  const apiType = err && err.response && err.response.data && err.response.data.error;
  const type = typeof apiType === 'object' ? apiType.type || apiType.message : apiType;
  const msg = String(
    (typeof apiType === 'object' && (apiType.message || apiType.type)) ||
      (err && err.message) ||
      ''
  );
  return /NOT_FOUND|Unknown table|Could not find table|INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND/i.test(
    String(type || '') + ' ' + msg
  );
}

async function listTablesMeta(token, baseId) {
  const res = await axios.get(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000
  });
  return res.data.tables || [];
}

async function ensureMejlcacheFields(tableId) {
  const { token, baseId } = airtableConfig();
  if (!token) return { created: [], error: 'token saknas' };
  const tables = await listTablesMeta(token, baseId);
  const table =
    tables.find((t) => t.id === tableId) || tables.find((t) => (t.name || '') === TABLE_NAME);
  if (!table) return { created: [], error: 'Gmail Mejlcache hittades inte' };
  const existing = new Set((table.fields || []).map((f) => (f.name || '').trim()));
  const created = [];
  const url = `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${table.id}/fields`;
  for (const field of REQUIRED_FIELDS) {
    if (existing.has(field.name)) continue;
    try {
      const body = { name: field.name, type: field.type };
      if (field.description) body.description = field.description;
      await axios.post(url, body, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 10000
      });
      created.push(field.name);
    } catch (err) {
      console.warn(
        'Gmail Mejlcache field',
        field.name,
        err.response?.data?.error?.message || err.message
      );
    }
  }
  return { created, tableId: table.id };
}

async function ensureMejlcacheTable() {
  const { token, baseId } = airtableConfig();
  if (!token) return { ok: false, error: 'AIRTABLE_ACCESS_TOKEN saknas' };
  try {
    const tables = await listTablesMeta(token, baseId);
    let table = tables.find((t) => (t.name || '') === TABLE_NAME);
    let created = false;
    if (!table) {
      const createRes = await axios.post(
        `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
        {
          name: TABLE_NAME,
          description:
            'Cache av kundmejl från Gmail (senaste 30 dagarna) — metadata + body per användare (ClientFlow)',
          fields: REQUIRED_FIELDS.map((f) => {
            const body = { name: f.name, type: f.type };
            if (f.description) body.description = f.description;
            return body;
          })
        },
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          timeout: 20000
        }
      );
      table = createRes.data;
      created = true;
    }
    setCachedTableId(table.id);
    const ensured = await ensureMejlcacheFields(table.id);
    return { ok: true, created, tableId: table.id, createdFields: ensured.created || [] };
  } catch (err) {
    return { ok: false, error: err.response?.data?.error?.message || err.message };
  }
}

function parseJson(raw, fallback) {
  try {
    return JSON.parse(raw || JSON.stringify(fallback));
  } catch (_) {
    return fallback;
  }
}

function fieldsToRecord(id, fields) {
  const f = fields || {};
  const labelIds = parseJson(f['Label Ids'], []);
  const attachmentMeta = parseJson(f['Attachment Meta'], []);
  const internalDateRaw = f['Internal Date'];
  const internalDate =
    internalDateRaw != null && String(internalDateRaw).trim() !== ''
      ? Number(internalDateRaw)
      : null;
  return {
    id,
    ownerUserId: f['Owner User ID'] || '',
    gmailMessageId: f['Gmail Message ID'] || '',
    threadId: f['Thread ID'] || '',
    labelIds: Array.isArray(labelIds) ? labelIds.map(String) : [],
    internalDate: Number.isFinite(internalDate) ? internalDate : null,
    subject: f.Subject || '',
    from: f.From || '',
    to: f.To || '',
    cc: f.Cc || '',
    date: f.Date || '',
    snippet: f.Snippet || '',
    bodyText: f['Body Text'] || '',
    bodyHtml: f['Body Html'] || '',
    attachmentMeta: Array.isArray(attachmentMeta) ? attachmentMeta : [],
    messageIdHeader: f['Message Id Header'] || '',
    inReplyTo: f['In Reply To'] || '',
    syncedAt: f['Synced At'] || ''
  };
}

function recordToFields(data) {
  const internalDate =
    data.internalDate != null && Number.isFinite(Number(data.internalDate))
      ? String(Math.floor(Number(data.internalDate)))
      : '';
  return {
    'Owner User ID': String(data.ownerUserId || ''),
    'Gmail Message ID': String(data.gmailMessageId || ''),
    'Thread ID': String(data.threadId || ''),
    'Label Ids': JSON.stringify(Array.isArray(data.labelIds) ? data.labelIds.map(String) : []),
    'Internal Date': internalDate,
    Subject: String(data.subject || '').slice(0, 200),
    From: String(data.from || '').slice(0, 500),
    To: String(data.to || '').slice(0, 500),
    Cc: String(data.cc || '').slice(0, 500),
    Date: String(data.date || '').slice(0, 100),
    Snippet: String(data.snippet || '').slice(0, 500),
    'Body Text': String(data.bodyText || '').slice(0, 90000),
    'Body Html': String(data.bodyHtml || '').slice(0, 90000),
    'Attachment Meta': JSON.stringify(
      Array.isArray(data.attachmentMeta) ? data.attachmentMeta : []
    ),
    'Message Id Header': String(data.messageIdHeader || '').slice(0, 300),
    'In Reply To': String(data.inReplyTo || '').slice(0, 300),
    'Synced At': String(data.syncedAt || new Date().toISOString()).slice(0, 40)
  };
}

/** Konvertera cache-rad till samma form som api.summarizeMessage (+ body). */
function recordToSummary(record) {
  if (!record) return null;
  const attachments = Array.isArray(record.attachmentMeta) ? record.attachmentMeta : [];
  return {
    id: record.gmailMessageId,
    threadId: record.threadId || null,
    labelIds: Array.isArray(record.labelIds) ? record.labelIds : [],
    internalDate: record.internalDate,
    snippet: record.snippet || '',
    subject: record.subject || '(utan ämne)',
    from: record.from || '',
    to: record.to || '',
    cc: record.cc || '',
    date: record.date || '',
    messageIdHeader: record.messageIdHeader || '',
    inReplyTo: record.inReplyTo || '',
    text: record.bodyText || '',
    html: record.bodyHtml || '',
    attachments,
    attachmentCount: attachments.length,
    fromCache: true,
    syncedAt: record.syncedAt || null
  };
}

function messageToPayload(ownerUserId, message) {
  const bodyHtml = message.html || message.bodyHtml || '';
  const bodyText =
    message.text ||
    message.bodyText ||
    (bodyHtml ? htmlToPlainText(bodyHtml) : '') ||
    '';
  const attachmentMeta = Array.isArray(message.attachments)
    ? message.attachments
    : Array.isArray(message.attachmentMeta)
      ? message.attachmentMeta
      : [];
  return {
    ownerUserId,
    gmailMessageId: message.id || message.gmailMessageId,
    threadId: message.threadId || '',
    labelIds: Array.isArray(message.labelIds) ? message.labelIds : [],
    internalDate: message.internalDate != null ? Number(message.internalDate) : null,
    subject: message.subject || '',
    from: message.from || '',
    to: message.to || '',
    cc: message.cc || '',
    date: message.date || '',
    snippet: message.snippet || '',
    bodyText,
    bodyHtml,
    attachmentMeta,
    messageIdHeader: message.messageIdHeader || '',
    inReplyTo: message.inReplyTo || '',
    syncedAt: new Date().toISOString()
  };
}

function hasUsableBody(record) {
  if (!record) return false;
  return !!(
    (record.bodyHtml && String(record.bodyHtml).trim()) ||
    (record.bodyText && String(record.bodyText).trim())
  );
}

async function writeWithEnsure(doWrite) {
  const { token, baseId } = airtableConfig();
  if (!token) {
    const err = new Error('AIRTABLE_ACCESS_TOKEN saknas');
    err.code = 'AIRTABLE_CONFIG';
    throw err;
  }
  const ensured = await ensureMejlcacheTable();
  if (!ensured.ok) {
    const err = new Error(ensured.error || 'Kunde inte skapa Gmail Mejlcache');
    err.code = 'MEJLCACHE_SETUP';
    throw err;
  }
  try {
    return await doWrite(token, baseId, tableRef());
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
    clearCachedTableId();
    const retry = await ensureMejlcacheTable();
    if (!retry.ok) {
      const setupErr = new Error(retry.error || err.message);
      setupErr.code = 'MEJLCACHE_SETUP';
      throw setupErr;
    }
    return doWrite(token, baseId, tableRef());
  }
}

async function findByOwnerAndMessageId(ownerUserId, gmailMessageId) {
  const { token, baseId } = airtableConfig();
  const uid = String(ownerUserId || '').trim().replace(/"/g, '');
  const mid = String(gmailMessageId || '').trim().replace(/"/g, '');
  if (!token || !uid || !mid) return null;
  try {
    const res = await axios.get(`https://api.airtable.com/v0/${baseId}/${tableRef()}`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        filterByFormula: `AND({Owner User ID}="${uid}",{Gmail Message ID}="${mid}")`,
        maxRecords: 1
      },
      timeout: 15000
    });
    const rec = (res.data.records || [])[0];
    return rec ? fieldsToRecord(rec.id, rec.fields) : null;
  } catch (err) {
    if (isMissingTableError(err)) {
      clearCachedTableId();
      return null;
    }
    throw err;
  }
}

/**
 * Lista cachade mejl för användare inom datumfönster (lista utan body-fält i praktiken
 * — Airtable returnerar alla fält; anroparen kan strippa body).
 */
async function listByOwner(ownerUserId, { maxRecords = 100, withinWindow = true } = {}) {
  const { token, baseId } = airtableConfig();
  const uid = String(ownerUserId || '').trim().replace(/"/g, '');
  if (!token || !uid) return [];
  try {
    const res = await axios.get(`https://api.airtable.com/v0/${baseId}/${tableRef()}`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        filterByFormula: `{Owner User ID}="${uid}"`,
        maxRecords: Math.min(Math.max(Number(maxRecords) || 100, 1), 100)
      },
      timeout: 25000
    });
    let rows = (res.data.records || []).map((r) => fieldsToRecord(r.id, r.fields));
    if (withinWindow) {
      rows = syncCache.filterMessagesToWindow(
        rows.map((r) => ({
          ...r,
          internalDate: r.internalDate,
          date: r.date
        }))
      );
    }
    return syncCache.sortByInternalDateDesc(rows);
  } catch (err) {
    if (isMissingTableError(err)) {
      clearCachedTableId();
      return [];
    }
    throw err;
  }
}

async function createRecord(data) {
  return writeWithEnsure(async (token, baseId, ref) => {
    const res = await axios.post(
      `https://api.airtable.com/v0/${baseId}/${ref}`,
      { fields: recordToFields(data), typecast: true },
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 20000
      }
    );
    return fieldsToRecord(res.data.id, res.data.fields);
  });
}

async function updateRecord(recordId, data) {
  return writeWithEnsure(async (token, baseId, ref) => {
    const res = await axios.patch(
      `https://api.airtable.com/v0/${baseId}/${ref}/${encodeURIComponent(recordId)}`,
      { fields: recordToFields(data), typecast: true },
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 20000
      }
    );
    return fieldsToRecord(res.data.id, res.data.fields);
  });
}

/**
 * Spara eller uppdatera ett mejl. Hoppar över skrivning om body redan finns
 * och internalDate är oförändrad (undviker onödig Gmail→Airtable-trafik).
 */
async function upsertMessage(ownerUserId, message, opts = {}) {
  if (!ownerUserId || !message || !(message.id || message.gmailMessageId)) return null;
  if (!syncCache.isWithinSyncWindow(message) && opts.force !== true) return null;

  const payload = messageToPayload(ownerUserId, message);
  if (!payload.gmailMessageId) return null;

  const existing = await findByOwnerAndMessageId(ownerUserId, payload.gmailMessageId);
  if (existing && opts.skipIfUnchanged !== false) {
    const sameDate =
      existing.internalDate != null &&
      payload.internalDate != null &&
      Number(existing.internalDate) === Number(payload.internalDate);
    if (sameDate && hasUsableBody(existing) && opts.force !== true) {
      return { record: existing, written: false, reason: 'unchanged' };
    }
  }

  if (existing) {
    const updated = await updateRecord(existing.id, { ...payload, id: existing.id });
    return { record: updated, written: true, reason: 'updated' };
  }
  const created = await createRecord(payload);
  return { record: created, written: true, reason: 'created' };
}

/**
 * Batch-upsert. Kör sekventiellt i små grupper för att respektera Airtable-gränser.
 * @returns {{ written: number, skipped: number, errors: number }}
 */
async function upsertMessages(ownerUserId, messages, opts = {}) {
  const list = (messages || []).filter(Boolean);
  let written = 0;
  let skipped = 0;
  let errors = 0;
  for (const msg of list) {
    try {
      const result = await upsertMessage(ownerUserId, msg, opts);
      if (!result) skipped += 1;
      else if (result.written) written += 1;
      else skipped += 1;
    } catch (err) {
      errors += 1;
      console.warn(
        'Gmail Mejlcache upsert',
        msg && (msg.id || msg.gmailMessageId),
        err.message
      );
    }
  }
  return { written, skipped, errors };
}

/**
 * Hitta vilka message-id:n som redan har body sparad (för att undvika full fetch).
 * Returnerar Map<gmailMessageId, { internalDate, hasBody }>.
 */
async function indexBodiesForOwner(ownerUserId, messageIds) {
  const ids = [...new Set((messageIds || []).map(String).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;
  // Airtable formula OR är begränsad — hämta owner-lista och filtrera lokalt
  // när antalet id:n är stort; för små set gör per-id lookup.
  if (ids.length <= 5) {
    for (const id of ids) {
      try {
        const row = await findByOwnerAndMessageId(ownerUserId, id);
        if (row) {
          map.set(String(row.gmailMessageId), {
            internalDate: row.internalDate,
            hasBody: hasUsableBody(row),
            record: row
          });
        }
      } catch (_) {
        /* ignore */
      }
    }
    return map;
  }
  try {
    const rows = await listByOwner(ownerUserId, { maxRecords: 100, withinWindow: false });
    const want = new Set(ids);
    for (const row of rows) {
      const mid = String(row.gmailMessageId || '');
      if (!want.has(mid)) continue;
      map.set(mid, {
        internalDate: row.internalDate,
        hasBody: hasUsableBody(row),
        record: row
      });
    }
  } catch (err) {
    console.warn('Gmail Mejlcache indexBodies:', err.message);
  }
  return map;
}

module.exports = {
  TABLE_NAME,
  REQUIRED_FIELDS,
  ensureMejlcacheTable,
  ensureMejlcacheFields,
  findByOwnerAndMessageId,
  listByOwner,
  createRecord,
  updateRecord,
  upsertMessage,
  upsertMessages,
  indexBodiesForOwner,
  messageToPayload,
  recordToSummary,
  recordToFields,
  fieldsToRecord,
  hasUsableBody,
  isMissingTableError,
  clearCachedTableId,
  setCachedTableId,
  tableRef
};
