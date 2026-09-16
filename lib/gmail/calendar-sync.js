/**
 * ClientFlow → Google Calendar (envägs): sparar sync-preferens + Google event-id:n
 * på Application Users, och upsertar/raderar händelser via Calendar API.
 */
const axios = require('axios');
const calendarApi = require('./calendar-api');
const oauth = require('./oauth');

const USERS_TABLE = 'Application Users';
const FIELD_NAME = 'Google Calendar Sync';

function airtableConfig() {
  return {
    token: process.env.AIRTABLE_ACCESS_TOKEN,
    baseId: process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50'
  };
}

function emptyPrefs() {
  return { enabled: false, events: {} };
}

function parsePrefs(raw) {
  if (!raw) return emptyPrefs();
  let obj = raw;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return emptyPrefs();
    try {
      obj = JSON.parse(s);
    } catch (_) {
      return emptyPrefs();
    }
  }
  if (!obj || typeof obj !== 'object') return emptyPrefs();
  const events = {};
  if (obj.events && typeof obj.events === 'object') {
    for (const [k, v] of Object.entries(obj.events)) {
      const key = String(k || '').trim();
      const id = String(v || '').trim();
      if (key && id) events[key] = id;
    }
  }
  return {
    enabled: !!obj.enabled,
    events
  };
}

function serializePrefs(prefs) {
  const p = parsePrefs(prefs);
  return JSON.stringify({ enabled: p.enabled, events: p.events });
}

async function ensureField() {
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
    if (existing) return { ok: true, created: false };
    await axios.post(
      `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${usersTable.id}/fields`,
      {
        name: FIELD_NAME,
        type: 'multilineText',
        description: 'JSON: Google Calendar sync (enabled + event-id-map) ClientFlow'
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );
    return { ok: true, created: true };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    return { ok: false, error: msg };
  }
}

function findField(fields) {
  if (!fields || typeof fields !== 'object') return '';
  if (fields[FIELD_NAME] != null) return fields[FIELD_NAME];
  const key = Object.keys(fields).find((k) => {
    const n = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    return n === 'googlecalendarsync' || n === 'gcalsync';
  });
  return key ? fields[key] : '';
}

async function loadPrefs(userRecordId) {
  const { token, baseId } = airtableConfig();
  try {
    const res = await axios.get(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(USERS_TABLE)}/${userRecordId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000
      }
    );
    return parsePrefs(findField(res.data?.fields || {}));
  } catch (err) {
    console.warn('Google Calendar Sync: kunde inte läsa prefs:', err.message);
    return emptyPrefs();
  }
}

async function savePrefs(userRecordId, prefs) {
  await ensureField();
  const { token, baseId } = airtableConfig();
  const serialized = serializePrefs(prefs);
  await axios.patch(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(USERS_TABLE)}/${userRecordId}`,
    { fields: { [FIELD_NAME]: serialized } },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    }
  );
  return parsePrefs(serialized);
}

function eventKey(kind, id) {
  return `${kind}:${String(id || '').trim()}`;
}

/**
 * Upsert eller radera en Google-händelse. Sparar event-id i prefs.
 * @param {object} opts
 * @param {string} opts.accessToken
 * @param {object} opts.prefs – muteras och returneras
 * @param {string} opts.key – t.ex. run:recXxx
 * @param {string|null} opts.start
 * @param {string|null} opts.end
 * @param {string} [opts.summary]
 * @param {string} [opts.description]
 * @param {string} [opts.location]
 */
async function upsertMappedEvent(opts) {
  const prefs = parsePrefs(opts.prefs);
  const key = String(opts.key || '').trim();
  if (!key) return { prefs, skipped: true, reason: 'missing_key' };

  const start = opts.start || null;
  const end = opts.end || null;
  const existingId = prefs.events[key] || '';

  if (!start || !end) {
    if (existingId) {
      await calendarApi.deleteEvent(opts.accessToken, existingId);
      delete prefs.events[key];
    }
    return { prefs, deleted: !!existingId };
  }

  const payload = {
    summary: opts.summary,
    description: opts.description,
    start,
    end,
    location: opts.location
  };

  let event;
  if (existingId) {
    try {
      event = await calendarApi.patchEvent(opts.accessToken, existingId, payload);
    } catch (err) {
      if (err.response?.status === 404 || err.response?.status === 410) {
        event = await calendarApi.createEvent(opts.accessToken, payload);
      } else {
        throw err;
      }
    }
  } else {
    event = await calendarApi.createEvent(opts.accessToken, payload);
  }

  if (event?.id) prefs.events[key] = String(event.id);
  return { prefs, eventId: event?.id || null, created: !existingId };
}

function hasCalendarScope(tokens) {
  return oauth.tokenHasCalendarScope(tokens);
}

module.exports = {
  FIELD_NAME,
  emptyPrefs,
  parsePrefs,
  serializePrefs,
  ensureField,
  loadPrefs,
  savePrefs,
  eventKey,
  upsertMappedEvent,
  hasCalendarScope
};
