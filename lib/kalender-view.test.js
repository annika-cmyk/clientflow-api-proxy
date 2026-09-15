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
});
