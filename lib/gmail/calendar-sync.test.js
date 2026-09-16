/**
 * Google Calendar API helpers + sync prefs.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const calendarApi = require('./calendar-api');
const calendarSync = require('./calendar-sync');
const oauth = require('./oauth');

describe('calendar-api.toLocalDateTime', () => {
  it('normaliserar ISO med timezone till lokal form', () => {
    assert.equal(calendarApi.toLocalDateTime('2026-09-16T10:30:00'), '2026-09-16T10:30:00');
    assert.equal(calendarApi.toLocalDateTime('2026-09-16T10:30'), '2026-09-16T10:30:00');
  });

  it('returnerar tom sträng för ogiltigt', () => {
    assert.equal(calendarApi.toLocalDateTime(''), '');
    assert.equal(calendarApi.toLocalDateTime(null), '');
  });

  it('bygger eventTimes med Europe/Stockholm', () => {
    const t = calendarApi.eventTimes('2026-09-16T09:00:00', '2026-09-16T11:00:00');
    assert.equal(t.start.dateTime, '2026-09-16T09:00:00');
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
