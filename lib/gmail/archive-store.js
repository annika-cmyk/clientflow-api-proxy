/**
 * Airtable-lagring för Mejlarkiv.
 */
const axios = require('axios');
const { encryptJson, decryptJson } = require('./crypto');
const archiveAccess = require('./archive-access');
const { htmlToPlainText } = require('../html-plain-text');

const TABLE_NAME = 'Mejlarkiv';

const REQUIRED_FIELDS = [
  { name: 'Kund ID', type: 'singleLineText', description: 'Record-id i KUNDDATA' },
  { name: 'Gmail Message ID', type: 'singleLineText' },
  { name: 'Thread ID', type: 'singleLineText' },
  { name: 'Visibility', type: 'singleSelect', options: { choices: [{ name: 'byra' }, { name: 'privat' }] } },
  { name: 'Shared With', type: 'multilineText', description: 'JSON-array user ids' },
  { name: 'Owner User ID', type: 'singleLineText' },
  { name: 'Subject', type: 'singleLineText' },
  { name: 'From', type: 'singleLineText' },
  { name: 'To', type: 'singleLineText' },
  { name: 'Cc', type: 'singleLineText' },
  { name: 'Date', type: 'singleLineText' },
  { name: 'Snippet', type: 'singleLineText' },
  { name: 'Body Text', type: 'multilineText' },
  { name: 'Body Html', type: 'multilineText' },
  { name: 'Body Encrypted', type: 'multilineText', description: 'AES original body vid maskning' },
  { name: 'Masked Ranges', type: 'multilineText' },
  { name: 'Saved To', type: 'multilineText' },
  { name: 'Attachment Meta', type: 'multilineText' }
];

/** Resolved Airtable table id after ensure (avoids stale AIRTABLE_TABLE_MEJLARKIV_ID). */
let cachedTableId = null;

function airtableConfig() {
  return {
    token: process.env.AIRTABLE_ACCESS_TOKEN,
    baseId: process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50'
  };
}

function tableRef() {
  if (cachedTableId) return cachedTableId;
  const envId = String(process.env.AIRTABLE_TABLE_MEJLARKIV_ID || '').trim();
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

/**
 * Airtable returns 403/404 (NOT_FOUND) when the Mejlarkiv table/id is missing.
 * Axios surfaces that as "Request failed with status code 403".
 */
function isMissingMejlarkivError(err) {
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

function formatArchiveStoreError(err) {
  if (!err) return 'Okänt fel i Mejlarkiv';
  if (isMissingMejlarkivError(err)) {
    return 'Mejlarkiv-tabellen saknas eller är inte tillgänglig. Försök igen – den skapas automatiskt vid sparning.';
  }
  const apiMsg =
    err.response &&
    err.response.data &&
    err.response.data.error &&
    (err.response.data.error.message || err.response.data.error.type);
  const msg = String(apiMsg || err.message || 'Okänt fel');
  if (/^Request failed with status code \d+$/i.test(msg)) {
    return 'Kunde inte nå Mejlarkiv (Airtable ' + (err.response && err.response.status) + ').';
  }
  return msg;
}

async function listTablesMeta(token, baseId) {
  const res = await axios.get(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000
  });
  return res.data.tables || [];
}

async function ensureMejlarkivFields(tableId) {
  const { token, baseId } = airtableConfig();
  if (!token) return { created: [], error: 'token saknas' };
  const tables = await listTablesMeta(token, baseId);
  const table = tables.find((t) => t.id === tableId) || tables.find((t) => (t.name || '') === TABLE_NAME);
  if (!table) return { created: [], error: 'Mejlarkiv hittades inte' };
  const existing = new Set((table.fields || []).map((f) => (f.name || '').trim()));
  const created = [];
  const url = `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${table.id}/fields`;
  for (const field of REQUIRED_FIELDS) {
    if (existing.has(field.name)) continue;
    try {
      const body = { name: field.name, type: field.type };
      if (field.description) body.description = field.description;
      if (field.options) body.options = field.options;
      await axios.post(url, body, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 10000
      });
      created.push(field.name);
    } catch (err) {
      console.warn('Mejlarkiv field', field.name, err.response?.data?.error?.message || err.message);
    }
  }
  return { created, tableId: table.id };
}

async function ensureMejlarkivTable() {
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
          description: 'Arkiv för sparade/delade/privata kundmejl från Gmail (ClientFlow)',
          fields: REQUIRED_FIELDS.map((f) => {
            const body = { name: f.name, type: f.type };
            if (f.description) body.description = f.description;
            if (f.options) body.options = f.options;
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
    const ensured = await ensureMejlarkivFields(table.id);
    return { ok: true, created, tableId: table.id, createdFields: ensured.created || [] };
  } catch (err) {
    return { ok: false, error: err.response?.data?.error?.message || err.message };
  }
}

function fieldsToRecord(id, fields) {
  const f = fields || {};
  const parseJson = (raw, fallback) => {
    try { return JSON.parse(raw || JSON.stringify(fallback)); } catch (_) { return fallback; }
  };
  let bodyText = f['Body Text'] || '';
  let bodyHtml = f['Body Html'] || '';
  if (f['Body Encrypted']) {
    try {
      const decrypted = decryptJson(f['Body Encrypted']);
      if (decrypted && typeof decrypted === 'object') {
        if (decrypted.text != null) bodyText = decrypted.text;
        if (decrypted.html != null) bodyHtml = decrypted.html;
      }
    } catch (err) {
      console.warn('Mejlarkiv decrypt:', err.message);
    }
  }
  return {
    id,
    customerId: f['Kund ID'] || '',
    gmailMessageId: f['Gmail Message ID'] || '',
    threadId: f['Thread ID'] || '',
    visibility: archiveAccess.normalizeVisibility(f.Visibility),
    sharedWith: archiveAccess.parseSharedWith(f['Shared With']),
    ownerUserId: f['Owner User ID'] || '',
    subject: f.Subject || '',
    from: f.From || '',
    to: f.To || '',
    cc: f.Cc || '',
    date: f.Date || '',
    snippet: f.Snippet || '',
    bodyText,
    bodyHtml,
    maskedRanges: archiveAccess.normalizeMaskedRanges(parseJson(f['Masked Ranges'], [])),
    savedTo: Array.isArray(parseJson(f['Saved To'], [])) ? parseJson(f['Saved To'], []) : [],
    attachmentMeta: Array.isArray(parseJson(f['Attachment Meta'], [])) ? parseJson(f['Attachment Meta'], []) : []
  };
}

function recordToFields(data) {
  const fields = {
    'Kund ID': String(data.customerId || ''),
    'Gmail Message ID': String(data.gmailMessageId || ''),
    'Thread ID': String(data.threadId || ''),
    Visibility: archiveAccess.normalizeVisibility(data.visibility),
    'Shared With': JSON.stringify(archiveAccess.parseSharedWith(data.sharedWith)),
    'Owner User ID': String(data.ownerUserId || ''),
    Subject: String(data.subject || '').slice(0, 200),
    From: String(data.from || '').slice(0, 500),
    To: String(data.to || '').slice(0, 500),
    Cc: String(data.cc || '').slice(0, 500),
    Date: String(data.date || '').slice(0, 100),
    Snippet: String(data.snippet || '').slice(0, 500),
    'Masked Ranges': JSON.stringify(archiveAccess.normalizeMaskedRanges(data.maskedRanges)),
    'Saved To': JSON.stringify(Array.isArray(data.savedTo) ? data.savedTo : []),
    'Attachment Meta': JSON.stringify(Array.isArray(data.attachmentMeta) ? data.attachmentMeta : [])
  };
  const text = String(data.bodyText || '');
  const html = String(data.bodyHtml || '');
  if (data.maskedRanges && data.maskedRanges.length) {
    try {
      fields['Body Encrypted'] = encryptJson({ text, html });
      fields['Body Text'] = archiveAccess.applyMaskToText(text, data.maskedRanges, 'text').slice(0, 90000);
      fields['Body Html'] = archiveAccess.applyMaskToText(html, data.maskedRanges, 'html').slice(0, 90000);
    } catch (_) {
      fields['Body Text'] = text.slice(0, 90000);
      fields['Body Html'] = html.slice(0, 90000);
    }
  } else {
    fields['Body Text'] = text.slice(0, 90000);
    fields['Body Html'] = html.slice(0, 90000);
    fields['Body Encrypted'] = '';
  }
  return fields;
}

async function findByGmailMessageId(gmailMessageId, customerId) {
  const { token, baseId } = airtableConfig();
  if (!token || !gmailMessageId) return null;
  const mid = String(gmailMessageId).replace(/"/g, '');
  const cid = String(customerId || '').replace(/"/g, '');
  const formula = cid ? `AND({Gmail Message ID}="${mid}",{Kund ID}="${cid}")` : `{Gmail Message ID}="${mid}"`;
  try {
    const res = await axios.get(`https://api.airtable.com/v0/${baseId}/${tableRef()}`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { filterByFormula: formula, maxRecords: 1 },
      timeout: 15000
    });
    const rec = (res.data.records || [])[0];
    return rec ? fieldsToRecord(rec.id, rec.fields) : null;
  } catch (err) {
    if (isMissingMejlarkivError(err)) {
      clearCachedTableId();
      return null;
    }
    throw err;
  }
}

async function listByCustomerId(customerId, { maxRecords = 50 } = {}) {
  const { token, baseId } = airtableConfig();
  if (!token || !customerId) return [];
  const cid = String(customerId).replace(/"/g, '');
  try {
    const res = await axios.get(`https://api.airtable.com/v0/${baseId}/${tableRef()}`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { filterByFormula: `{Kund ID}="${cid}"`, maxRecords: Math.min(Number(maxRecords) || 50, 100) },
      timeout: 20000
    });
    return (res.data.records || []).map((r) => fieldsToRecord(r.id, r.fields));
  } catch (err) {
    if (isMissingMejlarkivError(err)) {
      clearCachedTableId();
      return [];
    }
    throw err;
  }
}

async function getById(recordId) {
  const { token, baseId } = airtableConfig();
  if (!token || !recordId) return null;
  try {
    const res = await axios.get(`https://api.airtable.com/v0/${baseId}/${tableRef()}/${encodeURIComponent(recordId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000
    });
    return fieldsToRecord(res.data.id, res.data.fields);
  } catch (err) {
    if (isMissingMejlarkivError(err) || (err.response && err.response.status === 404)) {
      return null;
    }
    throw err;
  }
}

async function writeWithEnsure(doWrite) {
  const { token, baseId } = airtableConfig();
  if (!token) {
    const err = new Error('AIRTABLE_ACCESS_TOKEN saknas');
    err.code = 'AIRTABLE_CONFIG';
    throw err;
  }
  const ensured = await ensureMejlarkivTable();
  if (!ensured.ok) {
    const err = new Error(ensured.error || 'Kunde inte skapa Mejlarkiv-tabellen');
    err.code = 'MEJLARKIV_SETUP';
    throw err;
  }
  try {
    return await doWrite(token, baseId, tableRef());
  } catch (err) {
    if (!isMissingMejlarkivError(err)) throw err;
    clearCachedTableId();
    const retryEnsure = await ensureMejlarkivTable();
    if (!retryEnsure.ok) {
      const setupErr = new Error(retryEnsure.error || formatArchiveStoreError(err));
      setupErr.code = 'MEJLARKIV_SETUP';
      throw setupErr;
    }
    return doWrite(token, baseId, tableRef());
  }
}

async function createRecord(data) {
  return writeWithEnsure(async (token, baseId, ref) => {
    const res = await axios.post(
      `https://api.airtable.com/v0/${baseId}/${ref}`,
      { fields: recordToFields(data), typecast: true },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 20000 }
    );
    return fieldsToRecord(res.data.id, res.data.fields);
  });
}

async function updateRecord(recordId, patch) {
  const current = await getById(recordId);
  if (!current) {
    const err = new Error('Mejlarkiv-post hittades inte');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const merged = { ...current, ...patch, id: recordId };
  return writeWithEnsure(async (token, baseId, ref) => {
    const res = await axios.patch(
      `https://api.airtable.com/v0/${baseId}/${ref}/${encodeURIComponent(recordId)}`,
      { fields: recordToFields(merged), typecast: true },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 20000 }
    );
    return fieldsToRecord(res.data.id, res.data.fields);
  });
}

async function upsertFromMessage({ user, customerId, message, visibility, sharedWith, savedTo, attachmentMeta }) {
  const existing = await findByGmailMessageId(message.id || message.gmailMessageId, customerId);
  const payload = {
    customerId,
    gmailMessageId: message.id || message.gmailMessageId,
    threadId: message.threadId || '',
    visibility: visibility || (existing && existing.visibility) || archiveAccess.VISIBILITY_BYRA,
    sharedWith: sharedWith != null ? sharedWith : (existing && existing.sharedWith) || [],
    ownerUserId: (existing && existing.ownerUserId) || (user && user.id) || '',
    subject: message.subject || '',
    from: message.from || '',
    to: message.to || '',
    cc: message.cc || '',
    date: message.date || (message.internalDate ? new Date(Number(message.internalDate)).toISOString() : ''),
    snippet: message.snippet || '',
    bodyText:
      message.text ||
      message.bodyText ||
      (message.html || message.bodyHtml
        ? htmlToPlainText(message.html || message.bodyHtml)
        : '') ||
      '',
    bodyHtml: message.html || message.bodyHtml || '',
    maskedRanges: (existing && existing.maskedRanges) || [],
    savedTo: savedTo != null ? savedTo : (existing && existing.savedTo) || [],
    attachmentMeta: attachmentMeta != null ? attachmentMeta : (existing && existing.attachmentMeta) || []
  };
  return existing ? updateRecord(existing.id, payload) : createRecord(payload);
}

module.exports = {
  TABLE_NAME,
  REQUIRED_FIELDS,
  ensureMejlarkivTable,
  ensureMejlarkivFields,
  findByGmailMessageId,
  listByCustomerId,
  getById,
  createRecord,
  updateRecord,
  upsertFromMessage,
  fieldsToRecord,
  recordToFields,
  isMissingMejlarkivError,
  formatArchiveStoreError,
  clearCachedTableId,
  setCachedTableId,
  tableRef
};
