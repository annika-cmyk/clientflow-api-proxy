const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isWeeklyFreq,
  weeklyRunAtIndex,
  weeklyRunsThroughHorizon
} = require('./weekly-uppdrag-runs');

describe('weekly-uppdrag-runs', () => {
  it('känner igen veckovis', () => {
    assert.equal(isWeeklyFreq('Veckovis'), true);
    assert.equal(isWeeklyFreq('Engång'), false);
  });

  it('första körningen använder mallens start och deadline', () => {
    const run = weeklyRunAtIndex({
      startIso: '2026-08-17',
      deadlineIso: '2026-08-21',
      index: 0
    });
    assert.equal(run.startIso, '2026-08-17');
    assert.equal(run.deadlineIso, '2026-08-21');
    assert.equal(run.periodKey, '2026-08-21');
  });

  it('nästa vecka flyttar både start och deadline sju dagar', () => {
    const run = weeklyRunAtIndex({
      startIso: '2026-08-17',
      deadlineIso: '2026-08-21',
      index: 1
    });
    assert.equal(run.startIso, '2026-08-24');
    assert.equal(run.deadlineIso, '2026-08-28');
  });

  it('skapar körningar fram till horisonten', () => {
    const runs = weeklyRunsThroughHorizon({
      startIso: '2026-08-17',
      deadlineIso: '2026-08-21',
      horizonEnd: '2026-09-11'
    });
    assert.equal(runs.length, 4);
    assert.equal(runs[3].deadlineIso, '2026-09-11');
    assert.equal(runs[3].startIso, '2026-09-07');
  });
});
