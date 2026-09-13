/**
 * Sparar Gmail OAuth-blob och etikett→kund-kopplingar på Application Users i Airtable.
 */
const axios = require('axios');
const { encryptJson, decryptJson } = require('./crypto');
const labelLinks = require('./label-links');

const USERS_TABLE = 'Application Users';
const FIELD_NAME = 'Gmail OAuth';
const LABEL_LINKS_FIELD = labelLinks.FIELD_NAME;

function airtableConfig() {
  return {
    token: process.env.AIRTABLE_ACCESS_TOKEN,
    baseId: process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50'
  };
}

async function getUsersTableMeta() {
  const { token, baseId } = airtableConfig();
  if (!token) return { ok: false, error: 'AIRTABLE_ACCESS_TOKEN saknas' };
  const metaRes = await axios.get(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000
  });
  const usersTable = (metaRes.data.tables || []).find(
    (t) => (t.name || '') === USERS_TABLE || (t.name || '').toLowerCase() === 'application users'
  );
  if (!usersTable) return { ok: false, error: 'Application Users hittades inte' };
  return { ok: true, usersTable, token, baseId };
}

async function ensureField(fieldName, description) {
  try {
    const meta = await getUsersTableMeta();
    if (!meta.ok) return meta;
    const { usersTable, token } = meta;
    const existing = (usersTable.fields || []).some((f) => (f.name || '') === fieldName);
    if (existing) return { ok: true, created: false, field: fieldName };
    await axios.post(
      `https://api.airtable.com/v0/meta/bases/${meta.baseId}/tables/${usersTable.id}/fields`,
      {
        name: fieldName,
        type: 'multilineText',
        description
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );
    return { ok: true, created: true, field: fieldName };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    return { ok: false, error: msg };
  }
}

async function ensureGmailField() {
  return ensureField(FIELD_NAME, 'Krypterad Gmail OAuth-blob (ClientFlow)');
}

async function ensureLabelLinksField() {
  return ensureField(
    LABEL_LINKS_FIELD,
    'JSON: Gmail-etikett → kundId-kopplingar (ClientFlow Mejl)'
  );
}

function findGmailField(fields) {
  if (!fields || typeof fields !== 'object') return '';
  if (fields[FIELD_NAME] != null) return fields[FIELD_NAME];
  const key = Object.keys(fields).find(
    (k) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === 'gmailoauth'
  );
  return key ? fields[key] : '';
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

async function loadTokens(userRecordId) {
  const record = await readUserRecord(userRecordId);
  const blob = findGmailField(record.fields || {});
  if (!blob) return null;
  try {
    return decryptJson(blob);
  } catch (err) {
    console.warn('Gmail: kunde inte dekryptera tokens:', err.message);
    return null;
  }
}

async function saveTokens(userRecordId, tokenData) {
  await ensureGmailField();
  const { token, baseId } = airtableConfig();
  const encrypted = encryptJson(tokenData);
  await axios.patch(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(USERS_TABLE)}/${userRecordId}`,
    { fields: { [FIELD_NAME]: encrypted } },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    }
  );
  return true;
}

async function clearTokens(userRecordId) {
  const { token, baseId } = airtableConfig();
  try {
    await axios.patch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(USERS_TABLE)}/${userRecordId}`,
      { fields: { [FIELD_NAME]: '' } },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );
  } catch (err) {
    console.warn('Gmail: kunde inte rensa tokens:', err.message);
  }
}

function findLabelLinksField(fields) {
  if (!fields || typeof fields !== 'object') return '';
  if (fields[LABEL_LINKS_FIELD] != null) return fields[LABEL_LINKS_FIELD];
  const key = Object.keys(fields).find((k) => {
    const n = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    return n === 'gmailetikettkopplingar' || n === 'gmaillabelinks';
  });
  return key ? fields[key] : '';
}

async function loadLabelLinks(userRecordId) {
  try {
    const record = await readUserRecord(userRecordId);
    return labelLinks.parseLinksJson(findLabelLinksField(record.fields || {}));
  } catch (err) {
    console.warn('Gmail: kunde inte läsa etikettkopplingar:', err.message);
    return [];
  }
}

async function saveLabelLinks(userRecordId, links) {
  await ensureLabelLinksField();
  const { token, baseId } = airtableConfig();
  const serialized = labelLinks.serializeLinks(links || []);
  await axios.patch(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(USERS_TABLE)}/${userRecordId}`,
    { fields: { [LABEL_LINKS_FIELD]: serialized } },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    }
  );
  return labelLinks.parseLinksJson(serialized);
}

module.exports = {
  FIELD_NAME,
  LABEL_LINKS_FIELD,
  USERS_TABLE,
  ensureGmailField,
  ensureLabelLinksField,
  loadTokens,
  saveTokens,
  clearTokens,
  findGmailField,
  findLabelLinksField,
  loadLabelLinks,
  saveLabelLinks
};
