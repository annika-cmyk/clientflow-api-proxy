const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Availability = require('./moteslankar-availability');

describe('moteslankar-availability', () => {
  it('genererar luckor på vardagar inom arbetstid', () => {
    const slots = Availability.generateSlots({
      rangeStartIso: '2026-10-19', // måndag
      rangeEndIso: '2026-10-19',
      durationMin: 60,
      weekdays: [0],
      dayStart: '09:00',
      dayEnd: '12:00',
      noticeHours: 0,
      busy: [],
      now: new Date('2026-10-01T08:00:00Z')
    });
    assert.ok(slots.length >= 2);
    assert.equal(slots[0].date, '2026-10-19');
    assert.ok(slots.every((s) => s.endMin - s.startMin === 60));
  });

  it('filtrerar bort busy-intervall inklusive buffer', () => {
    const slots = Availability.generateSlots({
      rangeStartIso: '2026-10-19',
      rangeEndIso: '2026-10-19',
      durationMin: 30,
      weekdays: [0],
      dayStart: '10:00',
      dayEnd: '11:00',
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
      noticeHours: 0,
      busy: [{ start: '2026-10-19T08:00:00.000Z', end: '2026-10-19T09:00:00.000Z' }],
      now: new Date('2026-10-01T08:00:00Z')
    });
    // 10:00–11:00 Stockholm ≈ 08:00–09:00 UTC på oktober (CEST) — hela blocket busy
    assert.equal(slots.length, 0);
  });

  it('hoppar över transparenta Google-event', () => {
    const busy = Availability.busyFromGoogleEvents([
      {
        status: 'confirmed',
        transparency: 'transparent',
        start: { dateTime: '2026-10-19T10:00:00+02:00' },
        end: { dateTime: '2026-10-19T11:00:00+02:00' }
      },
      {
        status: 'confirmed',
        start: { dateTime: '2026-10-19T12:00:00+02:00' },
        end: { dateTime: '2026-10-19T13:00:00+02:00' }
      },
      { status: 'cancelled', start: { dateTime: '2026-10-19T14:00:00+02:00' }, end: { dateTime: '2026-10-19T15:00:00+02:00' } }
    ]);
    assert.equal(busy.length, 1);
    assert.match(busy[0].start, /12:00/);
  });

  it('respekterar noticeHours', () => {
    const slots = Availability.generateSlots({
      rangeStartIso: '2026-10-19',
      rangeEndIso: '2026-10-19',
      durationMin: 30,
      weekdays: [0],
      dayStart: '08:00',
      dayEnd: '17:00',
      noticeHours: 48,
      busy: [],
      now: new Date('2026-10-19T06:00:00Z')
    });
    assert.equal(slots.length, 0);
  });
});
