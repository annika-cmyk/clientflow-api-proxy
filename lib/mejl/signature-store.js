/**
 * Sparar Mejl-sidfot per användare i Application Users (JSON i multilineText).
 * Airtable long text max ~100 000 tecken — stora base64-bilder ger 422.
 */
const axios = require('axios');
const { normalizeSettings } = require('./signature');

const USERS_TABLE = 'Application Users';
const FIELD_NAME = 'Mejl Sidfot';
/** Airtable multilineText-cellgräns. Lämna marginal för JSON-overhead. */
const AIRTABLE_LONG_TEXT_MAX = 100000;
const SAFE_PAYLOAD_MAX = 95000;
/** Per bild (data-URL). Sidfot behöver bara små portrait/logo. */
const MAX_IMAGE_DATA_URL = 45000;

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

function payloadSizeError(message, code) {
  const err = new Error(message);
  err.code = code || 'SIGNATURE_TOO_LARGE';
  return err;
}

/**
 * Validerar att sidfots-JSON får plats i Airtable long text.
 * Kastar med svensk text om bilder/payload är för stora.
 */
function assertSignatureFitsAirtable(settings) {
  const normalized = normalizeSettings(settings);
  if (normalized.image1DataUrl && normalized.image1DataUrl.length > MAX_IMAGE_DATA_URL) {
    throw payloadSizeError(
      'Bild 1 är för stor att spara. Välj en mindre fil, komprimera den, eller använd en URL.',
      'IMAGE_TOO_LARGE'
    );
  }
  if (normalized.image2DataUrl && normalized.image2DataUrl.length > MAX_IMAGE_DATA_URL) {
    throw payloadSizeError(
      'Bild 2 är för stor att spara. Välj en mindre fil, komprimera den, eller använd en URL.',
      'IMAGE_TOO_LARGE'
    );
  }
  const json = JSON.stringify(normalized);
  if (json.length > SAFE_PAYLOAD_MAX) {
    throw payloadSizeError(
      'Sidfoten med bilderna är för stor att spara. Använd mindre bilder eller URL i stället för uppladdning.',
      'SIGNATURE_TOO_LARGE'
    );
  }
  return { normalized, json, length: json.length };
}

function mapAirtableSaveError(err) {
  const status = err && err.response && err.response.status;
  const airtableMsg =
    (err && err.response && err.response.data && err.response.data.error && err.response.data.error.message) ||
    (err && err.response && err.response.data && err.response.data.error) ||
    '';
  const raw = String(airtableMsg || (err && err.message) || '');
  if (
    status === 422 ||
    /INVALID_VALUE_FOR_COLUMN|VALUE_TOO_LONG|too long|exceed/i.test(raw)
  ) {
    return payloadSizeError(
      'Sidfoten kunde inte sparas: bilderna är för stora för lagringen. Använd mindre bilder eller URL.',
      'SIGNATURE_TOO_LARGE'
    );
  }
  if (/Request failed with status code \d+/i.test(raw)) {
    const mapped = new Error(
      status
        ? `Kunde inte spara sidfoten (felkod ${status}). Försök igen eller använd mindre bilder.`
        : 'Kunde inte spara sidfoten. Försök igen.'
    );
    mapped.code = 'SIGNATURE_SAVE_FAILED';
    mapped.cause = err;
    return mapped;
  }
  const mapped = new Error(raw || 'Kunde inte spara sidfoten.');
  mapped.code = 'SIGNATURE_SAVE_FAILED';
  mapped.cause = err;
  return mapped;
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
  const { normalized, json } = assertSignatureFitsAirtable(settings);
  try {
    await axios.patch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(USERS_TABLE)}/${userRecordId}`,
      { fields: { [FIELD_NAME]: json } },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );
  } catch (err) {
    throw mapAirtableSaveError(err);
  }
  return normalized;
}

module.exports = {
  FIELD_NAME,
  USERS_TABLE,
  AIRTABLE_LONG_TEXT_MAX,
  SAFE_PAYLOAD_MAX,
  MAX_IMAGE_DATA_URL,
  ensureSignatureField,
  loadSignature,
  saveSignature,
  parseStored,
  findSignatureField,
  assertSignatureFitsAirtable,
  mapAirtableSaveError
};
