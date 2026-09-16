/**
 * Tunna wrappers mot Google Calendar API (events på primary).
 */
const axios = require('axios');

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary';
const TIME_ZONE = 'Europe/Stockholm';
/** Privat nyckel i Google extendedProperties – markerar CF→Google-push. */
const CF_PRIVATE_PROP = 'clientflow';

function authHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };
}

function toLocalDateTime(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    const base = s.length >= 19 ? s.slice(0, 19) : `${s}:00`.slice(0, 19);
    return base.replace(/Z$/, '');
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
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

function clientflowExtendedProps(clientflowKey) {
  const key = String(clientflowKey || '').trim();
  const privateProps = { [CF_PRIVATE_PROP]: '1' };
  if (key) privateProps.clientflowKey = key.slice(0, 512);
  return { private: privateProps };
}

function buildEventBody({ summary, description, start, end, location, clientflowKey } = {}) {
  const times = eventTimes(start, end);
  if (!times) {
    const err = new Error('Ogiltig start/slut för Google-händelse');
    err.code = 'INVALID_EVENT_TIMES';
    throw err;
  }
  const body = {
    summary: String(summary || 'ClientFlow').slice(0, 1024),
    description: String(description || '').slice(0, 8000),
    ...times,
    extendedProperties: clientflowExtendedProps(clientflowKey)
  };
  if (location) body.location = String(location).slice(0, 1024);
  return body;
}

async function createEvent(accessToken, opts = {}) {
  const body = buildEventBody(opts);
  const res = await axios.post(`${CALENDAR_BASE}/events`, body, {
    headers: authHeaders(accessToken),
    timeout: 20000
  });
  return res.data;
}

async function patchEvent(accessToken, eventId, opts = {}) {
  const id = String(eventId || '').trim();
  if (!id) {
    const err = new Error('eventId saknas');
    err.code = 'MISSING_EVENT_ID';
    throw err;
  }
  const body = buildEventBody(opts);
  if (opts.location == null) delete body.location;
  else body.location = String(opts.location).slice(0, 1024);
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

async function listEvents(accessToken, opts = {}) {
  const timeMin = toRfc3339Bound(opts.timeMin, false);
  const timeMax = toRfc3339Bound(opts.timeMax, true);
  if (!timeMin || !timeMax) {
    const err = new Error('timeMin och timeMax krävs');
    err.code = 'INVALID_TIME_RANGE';
    throw err;
  }
  const maxResults = Math.min(2500, Math.max(1, Number(opts.maxResults) || 250));
  const items = [];
  let pageToken = '';
  do {
    const params = {
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: Math.min(250, maxResults - items.length)
    };
    if (pageToken) params.pageToken = pageToken;
    const res = await axios.get(`${CALENDAR_BASE}/events`, {
      headers: authHeaders(accessToken),
      params,
      timeout: 25000
    });
    const batch = Array.isArray(res.data?.items) ? res.data.items : [];
    items.push(...batch);
    pageToken = String(res.data?.nextPageToken || '').trim();
  } while (pageToken && items.length < maxResults);
  return items;
}

function toRfc3339Bound(raw, endOfDay) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return endOfDay ? `${s}T23:59:59Z` : `${s}T00:00:00Z`;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(s)) return s;
    return `${s.length >= 19 ? s.slice(0, 19) : s}Z`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

function isClientFlowMarkedEvent(gEvent) {
  const priv = gEvent?.extendedProperties?.private;
  if (!priv || typeof priv !== 'object') return false;
  const flag = String(priv[CF_PRIVATE_PROP] || priv.clientflow || '').trim();
  return flag === '1' || flag.toLowerCase() === 'true' || !!String(priv.clientflowKey || '').trim();
}

module.exports = {
  CALENDAR_BASE,
  TIME_ZONE,
  CF_PRIVATE_PROP,
  toLocalDateTime,
  eventTimes,
  clientflowExtendedProps,
  createEvent,
  patchEvent,
  deleteEvent,
  listEvents,
  toRfc3339Bound,
  isClientFlowMarkedEvent
};
