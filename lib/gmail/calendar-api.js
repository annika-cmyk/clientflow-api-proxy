/**
 * Tunna wrappers mot Google Calendar API (events på primary).
 */
const axios = require('axios');

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary';
const CALENDAR_API_ROOT = 'https://www.googleapis.com/calendar/v3';
const TIME_ZONE = 'Europe/Stockholm';
/** Privat nyckel i Google extendedProperties – markerar CF→Google-push. */
const CF_PRIVATE_PROP = 'clientflow';

/**
 * Fallback om Colors-API:t inte svarar (samma hex som Google Calendar event-paletten).
 * @see https://developers.google.com/calendar/api/v3/reference/colors
 */
const DEFAULT_EVENT_COLORS = {
  '1': { background: '#a4bdfc', foreground: '#1d1d1d' },
  '2': { background: '#7ae7bf', foreground: '#1d1d1d' },
  '3': { background: '#dbadff', foreground: '#1d1d1d' },
  '4': { background: '#ff887c', foreground: '#1d1d1d' },
  '5': { background: '#fbd75b', foreground: '#1d1d1d' },
  '6': { background: '#ffb878', foreground: '#1d1d1d' },
  '7': { background: '#46d6db', foreground: '#1d1d1d' },
  '8': { background: '#e1e1e1', foreground: '#1d1d1d' },
  '9': { background: '#5484ed', foreground: '#1d1d1d' },
  '10': { background: '#51b749', foreground: '#1d1d1d' },
  '11': { background: '#dc2127', foreground: '#1d1d1d' }
};

/** Standardfärg för primary-kalendern när varken event.colorId eller calendarList ger färg. */
const DEFAULT_CALENDAR_COLOR = { background: '#039be5', foreground: '#1d1d1d' };

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

/** Tillåt bara enkla hex/rgb så värden kan säkert speglas i CSS. */
function safeCssColor(raw) {
  const s = String(raw || '').trim();
  if (/^#[0-9a-fA-F]{3}$/.test(s) || /^#[0-9a-fA-F]{6}$/.test(s) || /^#[0-9a-fA-F]{8}$/.test(s)) {
    return s.toLowerCase();
  }
  const rgb = s.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (rgb) {
    const nums = [rgb[1], rgb[2], rgb[3]].map((n) => Math.min(255, Math.max(0, Number(n))));
    return `rgb(${nums[0]}, ${nums[1]}, ${nums[2]})`;
  }
  return '';
}

function normalizeColorMap(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, entry] of Object.entries(raw)) {
    const bg = safeCssColor(entry?.background || entry?.backgroundColor);
    const fg = safeCssColor(entry?.foreground || entry?.foregroundColor);
    if (!bg) continue;
    out[String(id)] = { background: bg, foreground: fg || '#1d1d1d' };
  }
  return out;
}

/**
 * Hämtar event-/kalenderpaletten från Google Colors API.
 * Returnerar { event: { id: {background, foreground} }, calendar: {...} }.
 */
async function getColors(accessToken) {
  try {
    const res = await axios.get(`${CALENDAR_API_ROOT}/colors`, {
      headers: authHeaders(accessToken),
      timeout: 15000
    });
    return {
      event: normalizeColorMap(res.data?.event),
      calendar: normalizeColorMap(res.data?.calendar)
    };
  } catch (err) {
    console.warn('google-calendar colors:', err.response?.status || '', err.message);
    return {
      event: { ...DEFAULT_EVENT_COLORS },
      calendar: {}
    };
  }
}

/**
 * Primary-kalenderns färg från calendarList (backgroundColor/foregroundColor).
 */
async function getPrimaryCalendarMeta(accessToken) {
  try {
    const res = await axios.get(`${CALENDAR_API_ROOT}/users/me/calendarList/primary`, {
      headers: authHeaders(accessToken),
      timeout: 15000
    });
    const data = res.data || {};
    const background =
      safeCssColor(data.backgroundColor) ||
      safeCssColor(DEFAULT_CALENDAR_COLOR.background);
    const foreground =
      safeCssColor(data.foregroundColor) ||
      safeCssColor(DEFAULT_CALENDAR_COLOR.foreground);
    return {
      id: String(data.id || 'primary'),
      colorId: String(data.colorId || '').trim(),
      backgroundColor: background,
      foregroundColor: foreground
    };
  } catch (err) {
    console.warn('google-calendar calendarList/primary:', err.response?.status || '', err.message);
    return {
      id: 'primary',
      colorId: '',
      backgroundColor: DEFAULT_CALENDAR_COLOR.background,
      foregroundColor: DEFAULT_CALENDAR_COLOR.foreground
    };
  }
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
  CALENDAR_API_ROOT,
  TIME_ZONE,
  CF_PRIVATE_PROP,
  DEFAULT_EVENT_COLORS,
  DEFAULT_CALENDAR_COLOR,
  toLocalDateTime,
  eventTimes,
  clientflowExtendedProps,
  createEvent,
  patchEvent,
  deleteEvent,
  listEvents,
  getColors,
  getPrimaryCalendarMeta,
  normalizeColorMap,
  safeCssColor,
  toRfc3339Bound,
  isClientFlowMarkedEvent
};
