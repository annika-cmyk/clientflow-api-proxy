/**
 * Tunna wrappers mot Google Calendar API (events på primary).
 */
const axios = require('axios');

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary';
const TIME_ZONE = 'Europe/Stockholm';

function authHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };
}

/**
 * Normalisera till lokal ISO utan offset (YYYY-MM-DDTHH:mm:ss) för timeZone-fältet.
 */
function toLocalDateTime(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    const base = s.length >= 19 ? s.slice(0, 19) : `${s}:00`.slice(0, 19);
    return base.replace(/Z$/, '');
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  // Fallback: använd UTC-komponenter (bättre än att missa sync)
  return d.toISOString().slice(0, 19);
}

function eventTimes(startIso, endIso) {
  const start = toLocalDateTime(startIso);
  const end = toLocalDateTime(endIso);
  if (!start || !end) return null;
  return {
    start: { dateTime: start, timeZone: TIME_ZONE },
    end: { dateTime: end, timeZone: TIME_ZONE }
  };
}

async function createEvent(accessToken, { summary, description, start, end, location } = {}) {
  const times = eventTimes(start, end);
  if (!times) {
    const err = new Error('Ogiltig start/slut för Google-händelse');
    err.code = 'INVALID_EVENT_TIMES';
    throw err;
  }
  const body = {
    summary: String(summary || 'ClientFlow').slice(0, 1024),
    description: String(description || '').slice(0, 8000),
    ...times
  };
  if (location) body.location = String(location).slice(0, 1024);
  const res = await axios.post(`${CALENDAR_BASE}/events`, body, {
    headers: authHeaders(accessToken),
    timeout: 20000
  });
  return res.data;
}

async function patchEvent(accessToken, eventId, { summary, description, start, end, location } = {}) {
  const id = String(eventId || '').trim();
  if (!id) {
    const err = new Error('eventId saknas');
    err.code = 'MISSING_EVENT_ID';
    throw err;
  }
  const times = eventTimes(start, end);
  if (!times) {
    const err = new Error('Ogiltig start/slut för Google-händelse');
    err.code = 'INVALID_EVENT_TIMES';
    throw err;
  }
  const body = {
    summary: String(summary || 'ClientFlow').slice(0, 1024),
    description: String(description || '').slice(0, 8000),
    ...times
  };
  if (location != null) body.location = String(location).slice(0, 1024);
  const res = await axios.patch(
    `${CALENDAR_BASE}/events/${encodeURIComponent(id)}`,
    body,
    {
      headers: authHeaders(accessToken),
      timeout: 20000
    }
  );
  return res.data;
}

async function deleteEvent(accessToken, eventId) {
  const id = String(eventId || '').trim();
  if (!id) return { deleted: false };
  try {
    await axios.delete(`${CALENDAR_BASE}/events/${encodeURIComponent(id)}`, {
      headers: authHeaders(accessToken),
      timeout: 15000
    });
    return { deleted: true };
  } catch (err) {
    if (err.response?.status === 404 || err.response?.status === 410) {
      return { deleted: true, alreadyGone: true };
    }
    throw err;
  }
}

module.exports = {
  CALENDAR_BASE,
  TIME_ZONE,
  toLocalDateTime,
  eventTimes,
  createEvent,
  patchEvent,
  deleteEvent
};
