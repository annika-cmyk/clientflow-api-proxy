/**
 * Google Calendar API helpers + sync prefs.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const calendarApi = require('./calendar-api');
const calendarSync = require('./calendar-sync');
const oauth = require('./oauth');

describe('calendar-api.toLocalDateTime', () => {
  it('normaliserar flytande lokal ISO utan offset', () => {
    assert.equal(calendarApi.toLocalDateTime('2026-09-16T10:30:00'), '2026-09-16T10:30:00');
    assert.equal(calendarApi.toLocalDateTime('2026-09-16T10:30'), '2026-09-16T10:30:00');
  });

  it('konverterar UTC-Z till Stockholm-väggklocka (inte strippa Z)', () => {
    // 22 okt 2026 är fortfarande CEST (UTC+2) — 08:30Z = 10:30 lokal
    assert.equal(calendarApi.toLocalDateTime('2026-10-22T08:30:00.000Z'), '2026-10-22T10:30:00');
    assert.equal(calendarApi.toLocalDateTime('2026-10-22T08:30:00Z'), '2026-10-22T10:30:00');
  });

  it('respekterar offset i inkommande ISO', () => {
    assert.equal(calendarApi.toLocalDateTime('2026-10-22T10:30:00+02:00'), '2026-10-22T10:30:00');
  });

  it('returnerar tom sträng för ogiltigt', () => {
    assert.equal(calendarApi.toLocalDateTime(''), '');
    assert.equal(calendarApi.toLocalDateTime(null), '');
  });

  it('bygger eventTimes med Europe/Stockholm', () => {
    const t = calendarApi.eventTimes('2026-10-22T08:30:00.000Z', '2026-10-22T09:00:00.000Z');
    assert.equal(t.start.dateTime, '2026-10-22T10:30:00');
    assert.equal(t.end.dateTime, '2026-10-22T11:00:00');
    assert.equal(t.end.timeZone, 'Europe/Stockholm');
  });
});

describe('calendar-sync prefs', () => {
  it('parsePrefs hanterar tomt och trasig JSON', () => {
    assert.deepEqual(calendarSync.parsePrefs(null), { enabled: false, events: {} });
    assert.deepEqual(calendarSync.parsePrefs('{nope'), { enabled: false, events: {} });
  });

  it('parsePrefs + serializePrefs rundresa', () => {
    const raw = calendarSync.serializePrefs({
      enabled: true,
      events: { 'run:rec1': 'evt1', 'meeting:rec2': 'evt2', bad: '' }
    });
    const parsed = calendarSync.parsePrefs(raw);
    assert.equal(parsed.enabled, true);
    assert.equal(parsed.events['run:rec1'], 'evt1');
    assert.equal(parsed.events['meeting:rec2'], 'evt2');
    assert.equal(parsed.events.bad, undefined);
  });

  it('eventKey bygger stabil nyckel', () => {
    assert.equal(calendarSync.eventKey('run', 'recAbc'), 'run:recAbc');
  });
});

describe('oauth calendar scope', () => {
  it('SCOPES inkluderar calendar.events', () => {
    assert.match(oauth.SCOPES, /calendar\.events/);
  });

  it('tokenHasCalendarScope läser scope-sträng', () => {
    assert.equal(oauth.tokenHasCalendarScope('openid email'), false);
    assert.equal(
      oauth.tokenHasCalendarScope(
        'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events'
      ),
      true
    );
    assert.equal(
      oauth.tokenHasCalendarScope({
        scope: 'https://www.googleapis.com/auth/calendar.events'
      }),
      true
    );
  });
});

describe('calendar pull / map', () => {
  it('mapGoogleEventToCf normaliserar timed event', () => {
    const mapped = calendarSync.mapGoogleEventToCf({
      id: 'g1',
      summary: 'Lunch',
      start: { dateTime: '2026-09-16T12:00:00+02:00' },
      end: { dateTime: '2026-09-16T13:00:00+02:00' },
      location: 'Kontor'
    });
    assert.equal(mapped.key, 'gcal:g1');
    assert.equal(mapped.source, 'google');
    assert.equal(mapped.deadline, '2026-09-16');
    assert.equal(mapped.scheduledStart, '2026-09-16T12:00:00');
    assert.ok(mapped.backgroundColor);
    assert.ok(mapped.foregroundColor);
  });

  it('mapGoogleEventToCf mappar hangoutLink som meetingUrl', () => {
    const mapped = calendarSync.mapGoogleEventToCf({
      id: 'meet-1',
      summary: 'Kundmöte',
      hangoutLink: 'https://meet.google.com/aaa-bbbb-ccc',
      start: { dateTime: '2026-10-14T12:30:00+02:00' },
      end: { dateTime: '2026-10-14T13:30:00+02:00' }
    });
    assert.equal(mapped.hangoutLink, 'https://meet.google.com/aaa-bbbb-ccc');
    assert.equal(mapped.meetingUrl, 'https://meet.google.com/aaa-bbbb-ccc');
  });

  it('mapGoogleEventToCf mappar event.colorId via paletten', () => {
    const ctx = calendarSync.buildColorContext(
      { event: calendarApi.DEFAULT_EVENT_COLORS, calendar: {} },
      { backgroundColor: '#039be5', foregroundColor: '#ffffff' }
    );
    const mapped = calendarSync.mapGoogleEventToCf({
      id: 'red-1',
      summary: 'Viktigt',
      colorId: '11',
      start: { dateTime: '2026-09-16T09:00:00+02:00' },
      end: { dateTime: '2026-09-16T10:00:00+02:00' }
    }, ctx);
    assert.equal(mapped.colorId, '11');
    assert.equal(mapped.backgroundColor, '#dc2127');
    assert.equal(mapped.foregroundColor, '#1d1d1d');
  });

  it('mapGoogleEventToCf utan colorId ärver kalenderfärg', () => {
    const ctx = calendarSync.buildColorContext(null, {
      backgroundColor: '#0b8043',
      foregroundColor: '#ffffff'
    });
    const mapped = calendarSync.mapGoogleEventToCf({
      id: 'cal-color',
      summary: 'Möte',
      start: { dateTime: '2026-09-16T09:00:00+02:00' },
      end: { dateTime: '2026-09-16T10:00:00+02:00' }
    }, ctx);
    assert.equal(mapped.colorId, '');
    assert.equal(mapped.backgroundColor, '#0b8043');
    assert.equal(mapped.foregroundColor, '#ffffff');
  });

  it('safeCssColor avvisar ogiltiga värden', () => {
    assert.equal(calendarApi.safeCssColor('#5484ed'), '#5484ed');
    assert.equal(calendarApi.safeCssColor('red'), '');
    assert.equal(calendarApi.safeCssColor('url(x)'), '');
    assert.equal(calendarApi.safeCssColor('rgb(84, 132, 237)'), 'rgb(84, 132, 237)');
  });

  it('filterAndMapPulledEvents skippar CF-pushade', () => {
    const out = calendarSync.filterAndMapPulledEvents([
      { id: 'pushed-1', summary: 'CF', start: { dateTime: '2026-09-16T09:00:00' }, end: { dateTime: '2026-09-16T10:00:00' } },
      { id: 'marked', summary: 'M', start: { dateTime: '2026-09-16T11:00:00' }, end: { dateTime: '2026-09-16T12:00:00' }, extendedProperties: { private: { clientflow: '1' } } },
      { id: 'external', summary: 'E', colorId: '9', start: { dateTime: '2026-09-16T14:00:00' }, end: { dateTime: '2026-09-16T15:00:00' } }
    ], { enabled: true, events: { 'run:rec1': 'pushed-1' } });
    assert.equal(out.length, 1);
    assert.equal(out[0].googleEventId, 'external');
    assert.equal(out[0].colorId, '9');
    assert.equal(out[0].backgroundColor, '#5484ed');
  });

  it('isClientFlowMarkedEvent', () => {
    assert.equal(calendarApi.isClientFlowMarkedEvent({ extendedProperties: { private: { clientflow: '1' } } }), true);
  });

  it('toRfc3339Bound', () => {
    assert.equal(calendarApi.toRfc3339Bound('2026-09-16', false), '2026-09-16T00:00:00Z');
  });
});

