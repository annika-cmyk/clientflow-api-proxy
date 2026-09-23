const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  alignYearlyStartToDeadline,
  advanceYearlyTemplate,
  yearlyRunAtIndex,
  yearlyRunsThroughHorizon
} = require('./yearly-uppdrag-runs');

describe('yearly-uppdrag-runs', () => {
  it('första körningen använder mallens start och deadline', () => {
    const run = yearlyRunAtIndex({
      startIso: '2025-10-01',
      deadlineIso: '2026-03-31',
      index: 0
    });
    assert.deepEqual(run, {
      periodKey: '2026',
      periodLabel: '2026',
      deadlineIso: '2026-03-31',
      startIso: '2025-10-01'
    });
  });

  it('nästa års körning flyttar både start och deadline ett år', () => {
    const run = yearlyRunAtIndex({
      startIso: '2025-10-01',
      deadlineIso: '2026-03-31',
      index: 1
    });
    assert.equal(run.startIso, '2026-10-01');
    assert.equal(run.deadlineIso, '2027-03-31');
    assert.equal(run.periodKey, '2027');
  });

  it('skapar nästa körning inom horisonten med rätt arbetsfönster', () => {
    const runs = yearlyRunsThroughHorizon({
      startIso: '2025-10-01',
      deadlineIso: '2026-03-31',
      freq: 'Årsvis',
      horizonEnd: '2027-08-21'
    });
    assert.equal(runs.length, 2);
    assert.equal(runs[0].startIso, '2025-10-01');
    assert.equal(runs[0].deadlineIso, '2026-03-31');
    assert.equal(runs[1].startIso, '2026-10-01');
    assert.equal(runs[1].deadlineIso, '2027-03-31');
  });

  it('engångs-bokslut skapar bara första körningen', () => {
    const runs = yearlyRunsThroughHorizon({
      startIso: '2025-10-01',
      deadlineIso: '2026-03-31',
      freq: 'Engång',
      horizonEnd: '2028-01-01'
    });
    assert.equal(runs.length, 1);
    assert.equal(runs[0].periodKey, '2026');
  });

  it('alignerar eftersläpande start till aktuell deadline utan att ändra månad/dag', () => {
    assert.equal(
      alignYearlyStartToDeadline('2025-10-01', '2027-03-31'),
      '2026-10-01'
    );
    assert.equal(
      alignYearlyStartToDeadline('2025-10-01', '2026-03-31'),
      '2025-10-01'
    );
  });

  it('rättar körning när nästa deadline flyttats men start stannat kvar', () => {
    const run = yearlyRunAtIndex({
      startIso: '2025-10-01',
      deadlineIso: '2027-03-31',
      index: 0
    });
    assert.equal(run.startIso, '2026-10-01');
    assert.equal(run.deadlineIso, '2027-03-31');
  });

  it('advanceYearlyTemplate flyttar både start och deadline', () => {
    const next = advanceYearlyTemplate({
      startIso: '2025-10-01',
      deadlineIso: '2026-03-31'
    });
    assert.deepEqual(next, {
      startIso: '2026-10-01',
      deadlineIso: '2027-03-31'
    });
  });
});
