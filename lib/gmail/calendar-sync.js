/**
 * ClientFlow ↔ Google Calendar: prefs (enabled + event-id-map) + push upsert
 * och pull-filter (skippa CF-pushade händelser).
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
    location: opts.location,
    clientflowKey: key
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

function knownPushedEventIds(prefs) {
  const p = parsePrefs(prefs);
  const ids = new Set();
  for (const id of Object.values(p.events || {})) {
    const s = String(id || '').trim();
    if (s) ids.add(s);
  }
  return ids;
}

function dateOnly(raw) {
  const s = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return '';
}

/**
 * Bygger färgkontext från Colors API + primary calendarList.
 * Event utan colorId ärver kalenderns bakgrundsfärg (som i Google Calendar).
 */
function buildColorContext(colorsPayload, primaryCal) {
  const eventColors = {
    ...calendarApi.DEFAULT_EVENT_COLORS,
    ...(colorsPayload?.event || {})
  };
  const calendarColors = { ...(colorsPayload?.calendar || {}) };
  let backgroundColor =
    calendarApi.safeCssColor(primaryCal?.backgroundColor) ||
    calendarApi.DEFAULT_CALENDAR_COLOR.background;
  let foregroundColor =
    calendarApi.safeCssColor(primaryCal?.foregroundColor) ||
    calendarApi.DEFAULT_CALENDAR_COLOR.foreground;
  const calColorId = String(primaryCal?.colorId || '').trim();
  if (calColorId && calendarColors[calColorId] && !calendarApi.safeCssColor(primaryCal?.backgroundColor)) {
    backgroundColor = calendarColors[calColorId].background;
    foregroundColor = calendarColors[calColorId].foreground || foregroundColor;
  }
  return {
    eventColors,
    calendarDefault: { backgroundColor, foregroundColor, colorId: calColorId }
  };
}

/**
 * Resolverar Google-händelsens färg: event.colorId → palett, annars kalenderfärg.
 */
function resolveGoogleEventColor(gEvent, colorCtx) {
  const ctx = colorCtx && typeof colorCtx === 'object' ? colorCtx : buildColorContext(null, null);
  const colorId = String(gEvent?.colorId || '').trim();
  if (colorId && ctx.eventColors?.[colorId]) {
    const entry = ctx.eventColors[colorId];
    return {
      colorId,
      backgroundColor: entry.background,
      foregroundColor: entry.foreground || '#1d1d1d'
    };
  }
  const cal = ctx.calendarDefault || calendarApi.DEFAULT_CALENDAR_COLOR;
  return {
    colorId: colorId || '',
    backgroundColor:
      calendarApi.safeCssColor(cal.backgroundColor || cal.background) ||
      calendarApi.DEFAULT_CALENDAR_COLOR.background,
    foregroundColor:
      calendarApi.safeCssColor(cal.foregroundColor || cal.foreground) ||
      calendarApi.DEFAULT_CALENDAR_COLOR.foreground
  };
}

function mapGoogleEventToCf(gEvent, colorCtx) {
  if (!gEvent || typeof gEvent !== 'object') return null;
  if (String(gEvent.status || '').toLowerCase() === 'cancelled') return null;
  const id = String(gEvent.id || '').trim();
  if (!id) return null;

  const startRaw = gEvent.start?.dateTime || gEvent.start?.date || '';
  const allDay = !!(gEvent.start?.date && !gEvent.start?.dateTime);
  const startDate = dateOnly(startRaw);
  if (!startDate) return null;

  let scheduledStart = '';
  let scheduledEnd = '';
  if (!allDay && gEvent.start?.dateTime) {
    scheduledStart = calendarApi.toLocalDateTime(gEvent.start.dateTime);
    scheduledEnd = calendarApi.toLocalDateTime(gEvent.end?.dateTime || '') || '';
  }

  const summary = String(gEvent.summary || '').trim() || '(utan titel)';
  const description = String(gEvent.description || '').trim();
  const location = String(gEvent.location || '').trim();
  const htmlLink = String(gEvent.htmlLink || '').trim();
  const color = resolveGoogleEventColor(gEvent, colorCtx);

  return {
    key: `gcal:${id}`,
    source: 'google',
    googleEventId: id,
    typ: 'Google',
    deadline: startDate,
    startDate,
    periodKey: '',
    periodLabel: allDay ? 'Heldag' : '',
    status: 'Planerad',
    scheduledStart,
    scheduledEnd,
    allDay: !!allDay,
    summary,
    description,
    location,
    htmlLink,
    colorId: color.colorId,
    backgroundColor: color.backgroundColor,
    foregroundColor: color.foregroundColor,
    inRange: true,
    record: {
      id: `gcal:${id}`,
      fields: {
        Kundnamn: summary,
        Namn: summary
      }
    },
    runRec: null
  };
}

function filterAndMapPulledEvents(gEvents, prefs, colorCtx) {
  const knownIds = knownPushedEventIds(prefs);
  const ctx = colorCtx || buildColorContext(null, null);
  const out = [];
  const seen = new Set();
  for (const g of gEvents || []) {
    const id = String(g?.id || '').trim();
    if (!id || seen.has(id)) continue;
    if (knownIds.has(id)) continue;
    if (calendarApi.isClientFlowMarkedEvent(g)) continue;
    const mapped = mapGoogleEventToCf(g, ctx);
    if (!mapped) continue;
    seen.add(id);
    out.push(mapped);
  }
  return out;
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
  hasCalendarScope,
  knownPushedEventIds,
  buildColorContext,
  resolveGoogleEventColor,
  mapGoogleEventToCf,
  filterAndMapPulledEvents
};
