const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const KV = require('../public/js/kalender-view.js');

describe('kalender-view', () => {
  it('normaliserar vy-värden', () => {
    assert.equal(KV.normalizeView('week'), 'week');
    assert.equal(KV.normalizeView('Vecka'), 'week');
    assert.equal(KV.normalizeView('dag'), 'day');
    assert.equal(KV.normalizeView('månad'), 'month');
    assert.equal(KV.normalizeView(''), 'month');
    assert.equal(KV.normalizeView('nope'), 'month');
  });

  it('sparar och läser vald vy via storage', () => {
    const mem = new Map();
    const storage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => { mem.set(k, String(v)); }
    };
    assert.equal(KV.loadStoredView(storage), 'month');
    KV.saveStoredView('week', storage);
    assert.equal(KV.loadStoredView(storage), 'week');
    KV.saveStoredView('dag', storage);
    assert.equal(KV.loadStoredView(storage), 'day');
  });

  it('beräknar måndag–söndag för veckovy', () => {
    // 2026-09-15 är en tisdag
    const tue = new Date(2026, 8, 15);
    assert.equal(KV.dateIso(KV.mondayOf(tue)), '2026-09-14');
    assert.deepEqual(KV.visibleRange('week', tue), {
      start: '2026-09-14',
      end: '2026-09-20'
    });
    assert.deepEqual(KV.weekDays(tue), [
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17',
      '2026-09-18', '2026-09-19', '2026-09-20'
    ]);
  });

  it('beräknar synligt intervall för månad och dag', () => {
    const d = new Date(2026, 8, 15);
    assert.deepEqual(KV.visibleRange('month', d), {
      start: '2026-09-01',
      end: '2026-09-30'
    });
    assert.deepEqual(KV.visibleRange('day', d), {
      start: '2026-09-15',
      end: '2026-09-15'
    });
    assert.equal(KV.inVisibleRange('2026-09-12', KV.visibleRange('month', d)), true);
    assert.equal(KV.inVisibleRange('2026-10-01', KV.visibleRange('month', d)), false);
  });

  it('navigerar per vy: månad / vecka / dag', () => {
    const d = new Date(2026, 8, 15);
    assert.equal(KV.dateIso(KV.shiftFocus('day', d, 1)), '2026-09-16');
    assert.equal(KV.dateIso(KV.shiftFocus('week', d, -1)), '2026-09-08');
    assert.equal(KV.dateIso(KV.shiftFocus('month', d, 1)), '2026-10-01');
    assert.equal(KV.dateIso(KV.goToday('month', d)), '2026-09-01');
    assert.equal(KV.dateIso(KV.goToday('week', d)), '2026-09-15');
    assert.equal(KV.dateIso(KV.goToday('day', d)), '2026-09-15');
  });

  it('ger svenska periodtitlar och nav-etiketter', () => {
    const d = new Date(2026, 8, 15);
    assert.match(KV.periodTitle('month', d), /September 2026/i);
    assert.match(KV.periodTitle('week', d), /Vecka \d+/);
    assert.match(KV.periodTitle('day', d), /15/);
    assert.deepEqual(KV.navAria('week'), {
      prev: 'Föregående vecka',
      next: 'Nästa vecka'
    });
    assert.equal(KV.rangeEmptyLabel('day'), 'denna dag');
  });

  it('har tidsrutnät 07–20 med snap och layout', () => {
    assert.equal(KV.DAY_START_HOUR, 7);
    assert.equal(KV.DAY_END_HOUR, 20);
    assert.deepEqual(KV.hourLabels().slice(0, 2), ['07:00', '08:00']);
    assert.equal(KV.hourLabels().at(-1), '19:00');
    assert.equal(KV.snapMinutes(67, 15), 60);
    assert.equal(KV.snapMinutes(68, 15), 75);
    const layout = KV.blockLayout(9 * 60, 11 * 60);
    assert.ok(layout.topPct > 0 && layout.topPct < 50);
    assert.ok(layout.heightPct > 10);
    const moved = KV.moveBlock(9 * 60, 10 * 60, 14 * 60);
    assert.equal(moved.startMin, 14 * 60);
    assert.equal(moved.endMin, 15 * 60);
    const resized = KV.resizeBlock(9 * 60, 9 * 60 + 30);
    assert.equal(resized.endMin, 9 * 60 + 30);
  });

  it('normaliserar planerat tidblock och tid-prefill', () => {
    const s = KV.normalizeSchedule('2026-09-15T09:00:00', '2026-09-15T11:30:00');
    assert.equal(s.date, '2026-09-15');
    assert.equal(s.startMin, 9 * 60);
    assert.equal(s.endMin, 11 * 60 + 30);
    assert.equal(s.hours, 2.5);
    assert.equal(KV.tidPrefillHours(s.start, s.end), '2.5');
    assert.equal(KV.placementDate('2026-09-16T10:00:00', '2026-09-20'), '2026-09-16');
    assert.equal(KV.placementDate('', '2026-09-20'), '2026-09-20');
    assert.equal(
      KV.inVisibleRangeForEvent('2026-10-01', '2026-09-15T10:00:00', {
        start: '2026-09-14',
        end: '2026-09-20'
      }),
      true
    );
    assert.equal(KV.toLocalDateTimeIso('2026-09-15', 9 * 60 + 15), '2026-09-15T09:15:00');
  });

  it('Öppna-läge: inkluderar körningar i arbetsfönstret även utan deadline i perioden', () => {
    const range = { start: '2026-09-14', end: '2026-09-20' };
    assert.equal(
      KV.isOpenEventInRange('2026-08-01', '2026-12-15', 'Planerad', range, '2026-09-16'),
      true
    );
    // Klar utan planerad tid i perioden: döljs (långt arbetsfönster ska inte spamma)
    assert.equal(
      KV.isOpenEventInRange('2026-08-01', '2026-12-15', 'Klar', range, '2026-09-16'),
      false
    );
    // Klar med planerad tid i perioden: syns kvar efter klarmarkering
    assert.equal(
      KV.isOpenEventInRange(
        '2026-08-01',
        '2026-12-15',
        'Klar',
        range,
        '2026-09-16',
        '2026-09-15T09:00:00'
      ),
      true
    );
    // Klar med deadline i perioden: syns
    assert.equal(
      KV.isOpenEventInRange('2026-08-01', '2026-09-18', 'Klar', range, '2026-09-16'),
      true
    );
    assert.equal(
      KV.isOpenEventInRange('2026-10-01', '2026-12-15', 'Planerad', range, '2026-09-16'),
      false
    );
    assert.equal(
      KV.isOpenEventInRange('2026-07-01', '2026-08-31', 'Planerad', range, '2026-09-16'),
      true
    );
    assert.equal(
      KV.placementDateOpen('', '2026-12-15', '2026-08-01', range, '2026-09-16'),
      '2026-09-16'
    );
    assert.equal(
      KV.placementDateOpen('2026-09-18T09:00:00', '2026-12-15', '2026-08-01', range, '2026-09-16'),
      '2026-09-18'
    );
    assert.equal(KV.normalizeEventMode('Öppna'), 'open');
    assert.equal(KV.normalizeEventMode('deadline'), 'deadline');
  });
});
