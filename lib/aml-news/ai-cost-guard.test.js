'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createAiCostGuard } = require('./ai-cost-guard');

describe('aml-news ai-cost-guard', () => {
  it('takar dygnsvolymen och minskar remaining', () => {
    let now = Date.parse('2026-09-01T10:00:00+02:00');
    const guard = createAiCostGuard({
      dailyCap: 5,
      onDemandBatch: 3,
      now: () => now,
      ymd: () => '2026-09-01'
    });
    assert.equal(guard.remaining(), 5);
    const batch = guard.selectCandidates([
      { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }
    ]);
    assert.equal(batch.length, 3);
    guard.recordSuccess(batch[0]);
    guard.recordSuccess(batch[1]);
    guard.recordFailure(batch[2]);
    assert.equal(guard.remaining(), 2);
    assert.equal(guard.selectCandidates([{ id: 'd' }, { id: 'e' }, { id: 'f' }]).length, 2);
  });

  it('hoppar över poster i fail-cooldown och ger upp efter max failures', () => {
    let now = 1_000_000;
    const guard = createAiCostGuard({
      dailyCap: 20,
      onDemandBatch: 10,
      maxFailures: 2,
      failCooldownMs: 60_000,
      now: () => now,
      ymd: () => '2026-09-01'
    });
    const item = { content_hash: 'h1', title: 'x' };
    assert.equal(guard.shouldSkip(item), false);
    const first = guard.recordFailure(item);
    assert.equal(first.givenUp, false);
    assert.equal(guard.shouldSkip(item), true); // cooldown
    now += 61_000;
    assert.equal(guard.shouldSkip(item), false);
    const second = guard.recordFailure(item);
    assert.equal(second.givenUp, true);
    assert.equal(guard.hasGivenUp(item), true);
    assert.equal(guard.shouldSkip(item), true);
    assert.deepEqual(guard.selectCandidates([item, { content_hash: 'h2' }]).map((r) => r.content_hash), ['h2']);
  });

  it('nollställer used vid nytt dygn', () => {
    let ymd = '2026-09-01';
    const guard = createAiCostGuard({
      dailyCap: 3,
      now: () => Date.now(),
      ymd: () => ymd
    });
    guard.recordSuccess({ id: '1' });
    guard.recordSuccess({ id: '2' });
    assert.equal(guard.remaining(), 1);
    ymd = '2026-09-02';
    assert.equal(guard.remaining(), 3);
  });
});
