/**
 * Sparar Gmail OAuth-blob på Application Users i Airtable.
 */
const axios = require('axios');
const { encryptJson, decryptJson } = require('./crypto');

const USERS_TABLE = 'Application Users';
const FIELD_NAME = 'Gmail OAuth';

function airtableConfig() {
  return {
    token: process.env.AIRTABLE_ACCESS_TOKEN,
    baseId: process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50'
  };
}

async function ensureGmailField() {
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
        description: 'Krypterad Gmail OAuth-blob (ClientFlow)'
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

module.exports = {
  FIELD_NAME,
  USERS_TABLE,
  ensureGmailField,
  loadTokens,
  saveTokens,
  clearTokens,
  findGmailField
};
