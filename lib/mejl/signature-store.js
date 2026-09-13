/**
 * Sparar Mejl-sidfot per användare i Application Users (JSON i multilineText).
 */
const axios = require('axios');
const { normalizeSettings } = require('./signature');

const USERS_TABLE = 'Application Users';
const FIELD_NAME = 'Mejl Sidfot';

function airtableConfig() {
  return {
    token: process.env.AIRTABLE_ACCESS_TOKEN,
    baseId: process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50'
  };
}

async function ensureSignatureField() {
  const { token, baseId } = airtableConfig();
  if (!token) return { ok: false, error: 'AIRTABLE_ACCESS_TOKEN saknas' };
  try {
    const metaRes = await axios.get(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000
    });
    const usersTable = (metaRes.data.tables || []).find(
      (t) => (t.name || '') === USERS_TABLE || (t.name || '').toLowerCase() === 'application users'
    );
    if (!usersTable) return { ok: false, error: 'Application Users hittades inte' };
    const existing = (usersTable.fields || []).some((f) => (f.name || '') === FIELD_NAME);
    if (existing) return { ok: true, created: false, field: FIELD_NAME };
    await axios.post(
      `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${usersTable.id}/fields`,
      {
        name: FIELD_NAME,
        type: 'multilineText',
        description: 'Mejl-sidfot / HTML-signatur (ClientFlow JSON)'
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );
    return { ok: true, created: true, field: FIELD_NAME };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    return { ok: false, error: msg };
  }
}

function findSignatureField(fields) {
  if (!fields || typeof fields !== 'object') return '';
  if (fields[FIELD_NAME] != null) return fields[FIELD_NAME];
  const key = Object.keys(fields).find(
    (k) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === 'mejlsidfot'
  );
  return key ? fields[key] : '';
}

function parseStored(raw) {
  const s = String(raw || '').trim();
  if (!s) return normalizeSettings({});
  try {
    return normalizeSettings(JSON.parse(s));
  } catch (_) {
    return normalizeSettings({});
  }
}

async function readUserRecord(userRecordId) {
  const { token, baseId } = airtableConfig();
  const res = await axios.get(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(USERS_TABLE)}/${userRecordId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000
    }
  );
  return res.data;
}

async function loadSignature(userRecordId) {
  const record = await readUserRecord(userRecordId);
  const blob = findSignatureField(record.fields || {});
  return parseStored(blob);
}

async function saveSignature(userRecordId, settings) {
  await ensureSignatureField();
  const { token, baseId } = airtableConfig();
  const normalized = normalizeSettings(settings);
  const maxDataUrl = 900000;
  if (normalized.image1DataUrl && normalized.image1DataUrl.length > maxDataUrl) {
    const err = new Error('Bild 1 är för stor (max ~650 KB). Komprimera eller använd URL.');
    err.code = 'IMAGE_TOO_LARGE';
    throw err;
  }
  if (normalized.image2DataUrl && normalized.image2DataUrl.length > maxDataUrl) {
    const err = new Error('Bild 2 är för stor (max ~650 KB). Komprimera eller använd URL.');
    err.code = 'IMAGE_TOO_LARGE';
    throw err;
  }
  await axios.patch(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(USERS_TABLE)}/${userRecordId}`,
    { fields: { [FIELD_NAME]: JSON.stringify(normalized) } },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 20000
    }
  );
  return normalized;
}

module.exports = {
  FIELD_NAME,
  USERS_TABLE,
  ensureSignatureField,
  loadSignature,
  saveSignature,
  parseStored,
  findSignatureField
};
