const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  yearlyRunAtIndex,
  yearlyRunsThroughHorizon
} = require('./yearly-uppdrag-runs');

describe('yearly-uppdrag-runs', () => {
  it('första körningen använder mallens start och deadline', () => {
    const run = yearlyRunAtIndex({
      startIso: '2026-03-15',
      deadlineIso: '2026-06-14',
      index: 0
    });
    assert.deepEqual(run, {
      periodKey: '2026',
      periodLabel: '2026',
      deadlineIso: '2026-06-14',
      startIso: '2026-03-15'
    });
  });

  it('nästa års körning flyttar både start och deadline ett år, inte deadline minus ett år', () => {
    const run = yearlyRunAtIndex({
      startIso: '2026-03-15',
      deadlineIso: '2026-06-14',
      index: 1
    });
    assert.equal(run.startIso, '2027-03-15');
    assert.equal(run.deadlineIso, '2027-06-14');
    assert.equal(run.periodKey, '2027');
    assert.notEqual(run.startIso, '2026-06-14');
  });

  it('skapar nästa körning inom horisonten med rätt arbetsfönster', () => {
    const runs = yearlyRunsThroughHorizon({
      startIso: '2026-03-15',
      deadlineIso: '2026-06-14',
      freq: 'Årsvis',
      horizonEnd: '2027-08-21'
    });
    assert.equal(runs.length, 2);
    assert.equal(runs[0].startIso, '2026-03-15');
    assert.equal(runs[0].deadlineIso, '2026-06-14');
    assert.equal(runs[1].startIso, '2027-03-15');
    assert.equal(runs[1].deadlineIso, '2027-06-14');
  });

  it('engångs-bokslut skapar bara första körningen', () => {
    const runs = yearlyRunsThroughHorizon({
      startIso: '2026-03-15',
      deadlineIso: '2026-06-14',
      freq: 'Engång',
      horizonEnd: '2028-01-01'
    });
    assert.equal(runs.length, 1);
    assert.equal(runs[0].periodKey, '2026');
  });
});
