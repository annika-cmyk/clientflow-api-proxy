/**
 * Spara Gmail-bilagor / mejlsnapshot till kunddokumentation, uppdrag eller körning.
 */
const axios = require('axios');

const KUNDDATA_TABLE = process.env.AIRTABLE_TABLE_KUNDDATA_ID || 'tblOIuLQS2DqmOQWe';

function airtableConfig() {
  return {
    token: process.env.AIRTABLE_ACCESS_TOKEN,
    baseId: process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50'
  };
}

const fieldIdCache = new Map();

async function resolveFieldId(token, baseId, tableId, fieldName) {
  const key = `${baseId}:${tableId}:${fieldName}`;
  if (fieldIdCache.has(key)) return fieldIdCache.get(key);
  try {
    const res = await axios.get(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000
    });
    const table = (res.data.tables || []).find((t) => t.id === tableId || (t.name || '') === tableId);
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
  const res = await axios.post(
    url,
    { contentType: contentType || 'application/octet-stream', file: buffer.toString('base64'), filename },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 60000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    }
  );
  return res.data.attachment || res.data;
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

function safeFilename(name, fallback = 'fil') {
  return String(name || fallback).replace(/[^\w\u00e5\u00e4\u00f6\u00c5\u00c4\u00d6 .\-()@]+/gi, '_').trim().slice(0, 120) || fallback;
}

async function saveBufferToTarget(buffer, filename, contentType, target) {
  const type = String((target && target.type) || 'dokumentation').toLowerCase();
  const name = safeFilename(filename);
  const ct = contentType || guessContentType(name);

  if (type === 'dokumentation' || type === 'kund' || type === 'customer') {
    const customerId = target.customerId || target.recordId;
    if (!customerId) throw new Error('customerId saknas för dokumentation');
    let att = await uploadAttachment(customerId, buffer, name, ct, KUNDDATA_TABLE, 'Dokumentation');
    if (!att || !(att.url || att.id)) {
      att = await uploadAttachment(customerId, buffer, name, ct, KUNDDATA_TABLE, 'Attachments');
    }
    return { type: 'dokumentation', customerId, attachment: att, filename: name };
  }

  if (type === 'uppdrag') {
    const uppdragId = target.uppdragId || target.recordId;
    if (!uppdragId) throw new Error('uppdragId saknas');
    const tableId = process.env.AIRTABLE_TABLE_UPPDRAG_ID || null;
    let att = await uploadAttachment(uppdragId, buffer, name, ct, tableId, 'Dokumentation');
    if (!att || !(att.url || att.id)) {
      att = await uploadAttachment(uppdragId, buffer, name, ct, tableId, 'Attachments');
    }
    return { type: 'uppdrag', uppdragId, attachment: att, filename: name };
  }

  if (type === 'korning' || type === 'run' || type === 'uppdragskorning') {
    const runId = target.runId || target.recordId;
    if (!runId) throw new Error('runId saknas');
    const tableId = process.env.AIRTABLE_TABLE_UPPDRAG_RUNS_ID || null;
    let att = await uploadAttachment(runId, buffer, name, ct, tableId, 'Dokumentation');
    if (!att || !(att.url || att.id)) {
      att = await uploadAttachment(runId, buffer, name, ct, tableId, 'Attachments');
    }
    return { type: 'korning', runId, attachment: att, filename: name };
  }

  throw new Error(`Okänt sparmål: ${type}`);
}

function buildEmailSnapshotFilename(message) {
  const subj = safeFilename(message.subject || 'mejl', 'mejl').replace(/\s+/g, '_');
  const datePart = (message.date || '').slice(0, 10).replace(/[^\d-]/g, '') || 'datum';
  return `${datePart}_${subj}.txt`;
}

function stripHtml(html) {
  return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildEmailSnapshotText(message) {
  return [
    `Ämne: ${message.subject || ''}`,
    `Från: ${message.from || ''}`,
    `Till: ${message.to || ''}`,
    `Kopia: ${message.cc || ''}`,
    `Datum: ${message.date || ''}`,
    `Gmail-id: ${message.id || ''}`,
    '', '---', '',
    message.text || message.bodyText || stripHtml(message.html || message.bodyHtml || '') || message.snippet || ''
  ].join('\n');
}

module.exports = {
  uploadAttachment,
  saveBufferToTarget,
  guessContentType,
  safeFilename,
  buildEmailSnapshotFilename,
  buildEmailSnapshotText,
  stripHtml,
  KUNDDATA_TABLE
};
