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
    const pos = KV.blockPositionStyle(layout);
    assert.match(pos.top, /%$/);
    assert.match(pos.height, /calc\(/);
    assert.match(pos.height, new RegExp(String(KV.BLOCK_GAP_PX)));
    assert.match(KV.blockPositionStyleAttr(layout), /top:.*height:/);
    const moved = KV.moveBlock(9 * 60, 10 * 60, 14 * 60);
    assert.equal(moved.startMin, 14 * 60);
    assert.equal(moved.endMin, 15 * 60);
    const resized = KV.resizeBlock(9 * 60, 9 * 60 + 30);
    assert.equal(resized.endMin, 9 * 60 + 30);
    const fromTop = KV.resizeBlockStart(8 * 60, 10 * 60);
    assert.equal(fromTop.startMin, 8 * 60);
    assert.equal(fromTop.endMin, 10 * 60);
    const clampedTop = KV.resizeBlockStart(10 * 60, 10 * 60);
    assert.equal(clampedTop.startMin, 10 * 60 - KV.SNAP_MINUTES);
    assert.equal(clampedTop.endMin, 10 * 60);
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

  it('beräknar nu-markörens offset i tidsrutnät 07–20', () => {
    const noon = new Date(2026, 8, 16, 12, 0, 0);
    assert.equal(KV.nowMarkerOffsetPx(noon), (12 - 7) * KV.PX_PER_HOUR);
    const half = new Date(2026, 8, 16, 9, 30, 0);
    assert.equal(KV.nowMarkerOffsetPx(half), 2.5 * KV.PX_PER_HOUR);
    assert.equal(KV.nowMarkerOffsetPx(new Date(2026, 8, 16, 6, 59, 0)), null);
    assert.equal(KV.nowMarkerOffsetPx(new Date(2026, 8, 16, 20, 1, 0)), null);
    assert.equal(KV.nowMarkerOffsetPx(new Date(2026, 8, 16, 7, 0, 0)), 0);
    assert.equal(KV.nowMarkerOffsetPx(new Date(2026, 8, 16, 20, 0, 0)), (20 - 7) * KV.PX_PER_HOUR);
    assert.equal(KV.shouldShowNowMarker('2026-09-16', noon), true);
    assert.equal(KV.shouldShowNowMarker('2026-09-15', noon), false);
    assert.equal(KV.shouldShowNowMarker('2026-09-16', new Date(2026, 8, 16, 21, 0, 0)), false);
  });

  it('helg-preferens: kollapsad default, auto-expand vid block, localStorage vinner', () => {
    assert.equal(KV.resolveWeekendExpanded(false, null), false);
    assert.equal(KV.resolveWeekendExpanded(true, null), true);
    assert.equal(KV.resolveWeekendExpanded(true, false), false);
    assert.equal(KV.resolveWeekendExpanded(false, true), true);
    assert.equal(KV.isWeekendIso('2026-09-19'), true); // lör
    assert.equal(KV.isWeekendIso('2026-09-20'), true); // sön
    assert.equal(KV.isWeekendIso('2026-09-18'), false); // fre
    const mem = new Map();
    const storage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => { mem.set(k, String(v)); }
    };
    assert.equal(KV.loadStoredWeekendExpanded(storage), null);
    KV.saveStoredWeekendExpanded(false, storage);
    assert.equal(KV.loadStoredWeekendExpanded(storage), false);
    KV.saveStoredWeekendExpanded(true, storage);
    assert.equal(KV.loadStoredWeekendExpanded(storage), true);
  });

  it('filter-badge räknar avvikelser från Alla + Ej klara + Klara', () => {
    assert.equal(KV.filterBadgeCount({ activeType: 'Alla', showOpen: true, showDone: true }), 0);
    assert.equal(KV.filterBadgeCount({ activeType: 'Momsredovisning', showOpen: true, showDone: true }), 1);
    assert.equal(KV.filterBadgeCount({ activeType: 'Alla', showOpen: false, showDone: true }), 1);
    assert.equal(KV.filterBadgeCount({ activeType: 'Alla', showOpen: true, showDone: false }), 1);
    assert.equal(KV.filterBadgeCount({ activeType: 'Bokslut', showOpen: false, showDone: false }), 3);
  });

  it('grupperar sidopanel: Försenade / Den här veckan / Nästa vecka / Senare', () => {
    const groups = KV.groupSidePanelItems([
      { id: 'a', deadline: '2026-09-10', overdue: true },
      { id: 'b', deadline: '2026-09-16' },
      { id: 'c', deadline: '2026-09-23' },
      { id: 'd', deadline: '2026-10-05' }
    ], {
      todayIso: '2026-09-16',
      weekStart: '2026-09-14',
      weekEnd: '2026-09-20'
    });
    assert.deepEqual(groups.map((g) => [g.key, g.count]), [
      ['overdue', 1],
      ['thisWeek', 1],
      ['nextWeek', 1],
      ['later', 1]
    ]);
    assert.equal(groups[0].label, 'Försenade');
    assert.equal(KV.SIDE_GROUP_PAGE, 5);
  });

  it('kapacitet: bokad tid + Fullt/Överbokad och Byrå utan bar', () => {
    assert.equal(KV.parseWorkHoursPerDay(null), 8);
    assert.equal(KV.parseWorkHoursPerDay(''), 8);
    assert.equal(KV.parseWorkHoursPerDay('7.5'), 7.5);
    assert.equal(KV.WORK_HOURS_FIELD, 'Arbetstid per dag (t)');
    const dayEvents = [
      { scheduledStart: '2026-09-16T09:00:00', scheduledEnd: '2026-09-16T11:00:00' },
      { source: 'google', allDay: true, scheduledStart: '', scheduledEnd: '' },
      {
        source: 'google',
        transparency: 'transparent',
        scheduledStart: '2026-09-16T12:00:00',
        scheduledEnd: '2026-09-16T13:00:00'
      },
      {
        source: 'google',
        scheduledStart: '2026-09-16T14:00:00',
        scheduledEnd: '2026-09-16T15:30:00'
      }
    ];
    assert.equal(KV.bookedHoursForDay(dayEvents, KV.durationHours), 3.5);
    const mine = KV.dayCapacityDisplay(8, 8, { showCapacity: true });
    assert.equal(mine.status, 'full');
    assert.equal(mine.statusLabel, 'Fullt');
    assert.equal(mine.label, 'Fullt');
    const over = KV.dayCapacityDisplay(9, 8, { showCapacity: true });
    assert.equal(over.status, 'overbooked');
    assert.equal(over.statusLabel, 'Överbokad');
    const ok = KV.dayCapacityDisplay(5, 8, { showCapacity: true });
    assert.equal(ok.label, '5 / 8 t');
    assert.equal(ok.barPct, 63);
    const byra = KV.dayCapacityDisplay(5, 8, { showCapacity: false });
    assert.equal(byra.label, '5 t');
    assert.equal(byra.barPct, null);
  });

  it('scrollar till 08:00 eller nu när idag ingår i veckan', () => {
    const week = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'];
    const noon = new Date(2026, 8, 16, 12, 0, 0);
    assert.equal(KV.timedScrollOffsetPx(noon, week), (12 - 7) * KV.PX_PER_HOUR);
    const otherWeek = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'];
    assert.equal(KV.timedScrollOffsetPx(noon, otherWeek), (8 - 7) * KV.PX_PER_HOUR);
  });
});
