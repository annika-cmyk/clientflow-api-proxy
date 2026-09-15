const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const KE = require('../public/js/kalender-events.js');
const KV = require('../public/js/kalender-view.js');

describe('kalender-events (bara uppdragskörningar)', () => {
  const parent = {
    id: 'recUppdrag1',
    fields: {
      Typ: 'Bokslut',
      Frekvens: 'Årsvis',
      'Nästa deadline': '2026-09-30',
      Startdatum: '2026-01-01',
      Kundnamn: 'Paprikas Consulting AB',
      Historik: JSON.stringify([{ periodKey: '2025', deadline: '2025-09-30', status: 'Klar' }])
    }
  };

  const run2026 = {
    id: 'recRun2026',
    fields: {
      'Uppdrag ID': 'recUppdrag1',
      Typ: 'Bokslut',
      PeriodKey: '2026',
      'Period Label': '2026',
      Deadline: '2026-09-30',
      Status: 'Planerad'
    }
  };

  it('visar bara körningar, inte föräldra-deadline eller historik', () => {
    const events = KE.buildEventsFromRuns({
      records: [parent],
      runRecords: [run2026],
      range: { start: '2026-09-01', end: '2026-09-30' },
      helpers: {
        inVisibleRangeForEvent: (deadline, scheduledStart, range) =>
          KV.inVisibleRangeForEvent(deadline, scheduledStart, range)
      }
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].periodKey, '2026');
    assert.equal(events[0].periodLabel, '2026');
    assert.equal(events[0].runRec?.id, 'recRun2026');
    assert.equal(events[0].inRange, true);
    // Regress: tidigare syntetiserades även YYYY-MM från Nästa deadline → dubblett
    assert.ok(!events.some((e) => e.periodKey === '2026-09'));
  });

  it('skapar inga events utan körningsrader (även om uppdrag har deadline)', () => {
    const events = KE.buildEventsFromRuns({
      records: [parent],
      runRecords: [],
      range: { start: '2026-09-01', end: '2026-09-30' },
      helpers: {
        inVisibleRangeForEvent: (deadline, scheduledStart, range) =>
          KV.inVisibleRangeForEvent(deadline, scheduledStart, range)
      }
    });
    assert.deepEqual(events, []);
  });

  it('ignorerar körningar utan matchande föräldra-uppdrag', () => {
    const events = KE.buildEventsFromRuns({
      records: [],
      runRecords: [run2026],
      range: { start: '2026-09-01', end: '2026-09-30' }
    });
    assert.deepEqual(events, []);
  });

  it('behåller planerad start/slut från körningen', () => {
    const withSchedule = {
      ...run2026,
      fields: {
        ...run2026.fields,
        'Planerad start': '2026-09-30T09:00:00',
        'Planerad slut': '2026-09-30T11:00:00'
      }
    };
    const events = KE.buildEventsFromRuns({
      records: [parent],
      runRecords: [withSchedule],
      range: { start: '2026-09-01', end: '2026-09-30' },
      helpers: {
        inVisibleRangeForEvent: (deadline, scheduledStart, range) =>
          KV.inVisibleRangeForEvent(deadline, scheduledStart, range)
      }
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].scheduledStart, '2026-09-30T09:00:00');
    assert.equal(events[0].scheduledEnd, '2026-09-30T11:00:00');
  });
});
