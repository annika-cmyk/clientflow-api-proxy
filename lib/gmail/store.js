/**
 * Sparar Gmail OAuth-blob, etikett→kund-kopplingar och sync-cache på Application Users i Airtable.
 */
const axios = require('axios');
const { encryptJson, decryptJson } = require('./crypto');
const labelLinks = require('./label-links');
const syncCache = require('./sync-cache');

const USERS_TABLE = 'Application Users';
const FIELD_NAME = 'Gmail OAuth';
const LABEL_LINKS_FIELD = labelLinks.FIELD_NAME;
const SYNC_CACHE_FIELD = syncCache.SYNC_CACHE_FIELD;

/** Process-minne: snabbare läsning mellan Render-requests (Airtable är source of truth). */
const memorySyncCache = new Map();

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

async function ensureSyncCacheField() {
  return ensureField(
    SYNC_CACHE_FIELD,
    'JSON: Gmail inbox sync-cache (historyId + message metadata, ClientFlow Mejl)'
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

/**
 * Läs sparad Gmail-tokenblob.
 * @returns {Promise<{tokens: object|null, reason: 'ok'|'missing'|'decrypt_failed'}>}
 */
async function loadTokenState(userRecordId) {
  try {
    const record = await readUserRecord(userRecordId);
    const blob = findGmailField(record.fields || {});
    if (!blob || !String(blob).trim()) {
      return { tokens: null, reason: 'missing' };
    }
    try {
      const tokens = decryptJson(blob);
      if (!tokens || !tokens.refreshToken) {
        return { tokens: null, reason: 'missing' };
      }
      return { tokens, reason: 'ok' };
    } catch (err) {
      console.warn('Gmail: kunde inte dekryptera tokens:', err.message);
      return { tokens: null, reason: 'decrypt_failed' };
    }
  } catch (err) {
    console.error('Gmail: kunde inte läsa tokens:', err.message);
    throw err;
  }
}

async function loadTokens(userRecordId) {
  const state = await loadTokenState(userRecordId);
  return state.tokens;
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

function findSyncCacheField(fields) {
  if (!fields || typeof fields !== 'object') return '';
  if (fields[SYNC_CACHE_FIELD] != null) return fields[SYNC_CACHE_FIELD];
  const key = Object.keys(fields).find((k) => {
    const n = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    return n === 'gmailsynccache' || n === 'gmailinboxcache';
  });
  return key ? fields[key] : '';
}

async function loadSyncCache(userRecordId) {
  const mem = memorySyncCache.get(userRecordId);
  if (mem) return syncCache.parseSyncCache(mem);
  try {
    const record = await readUserRecord(userRecordId);
    const parsed = syncCache.parseSyncCache(findSyncCacheField(record.fields || {}));
    if (parsed.historyId || (parsed.messages && parsed.messages.length)) {
      memorySyncCache.set(userRecordId, parsed);
    }
    return parsed;
  } catch (err) {
    console.warn('Gmail: kunde inte läsa sync-cache:', err.message);
    return syncCache.emptyCache();
  }
}

async function saveSyncCache(userRecordId, cache) {
  const normalized = syncCache.parseSyncCache(cache);
  memorySyncCache.set(userRecordId, normalized);
  try {
    await ensureSyncCacheField();
    const { token, baseId } = airtableConfig();
    const serialized = syncCache.serializeSyncCache(normalized);
    await axios.patch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(USERS_TABLE)}/${userRecordId}`,
      { fields: { [SYNC_CACHE_FIELD]: serialized } },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );
  } catch (err) {
    console.warn('Gmail: kunde inte spara sync-cache:', err.message);
  }
  return normalized;
}

async function clearSyncCache(userRecordId) {
  memorySyncCache.delete(userRecordId);
  try {
    const { token, baseId } = airtableConfig();
    await axios.patch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(USERS_TABLE)}/${userRecordId}`,
      { fields: { [SYNC_CACHE_FIELD]: '' } },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );
  } catch (err) {
    console.warn('Gmail: kunde inte rensa sync-cache:', err.message);
  }
}

module.exports = {
  FIELD_NAME,
  LABEL_LINKS_FIELD,
  SYNC_CACHE_FIELD,
  USERS_TABLE,
  ensureGmailField,
  ensureLabelLinksField,
  ensureSyncCacheField,
  loadTokenState,
  loadTokens,
  saveTokens,
  clearTokens,
  findGmailField,
  findLabelLinksField,
  findSyncCacheField,
  loadLabelLinks,
  saveLabelLinks,
  loadSyncCache,
  saveSyncCache,
  clearSyncCache
};
