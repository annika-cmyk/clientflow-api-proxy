const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { selectDigestItems, shouldSendWeeklyDigest, buildDigestPayload } = require('./digest');

describe('weekly digest', () => {
  it('tar bara medium/high sedan senaste digest', () => {
    const items = [
      { title: 'A', relevance_tier: 'high', published_at: '2026-08-18T10:00:00.000Z' },
      { title: 'B', relevance_tier: 'low', published_at: '2026-08-18T11:00:00.000Z' },
      { title: 'C', relevance_tier: 'medium', published_at: '2026-08-10T10:00:00.000Z' }
    ];
    const picked = selectDigestItems(items, { since: '2026-08-12T00:00:00.000Z' });
    assert.deepEqual(picked.map((x) => x.title), ['A']);
  });

  it('skickar på måndag om det gått minst 6 dagar', () => {
    const monday = new Date('2026-08-17T08:00:00.000Z');
    assert.equal(shouldSendWeeklyDigest(monday, null), true);
    assert.equal(shouldSendWeeklyDigest(monday, '2026-08-16T08:00:00.000Z'), false);
    assert.equal(shouldSendWeeklyDigest(monday, '2026-08-03T08:00:00.000Z'), true);
    assert.equal(shouldSendWeeklyDigest(new Date('2026-08-18T08:00:00.000Z'), null), false);
  });

  it('bygger payload per byrå', () => {
    const payload = buildDigestPayload(
      { byraId: '1', byraNamn: 'Testbyrån', recipients: ['a@x.se'], lastDigestAt: '2026-08-01' },
      [{ title: 'X', relevance_tier: 'high', published_at: '2026-08-15T00:00:00.000Z' }]
    );
    assert.equal(payload.shouldSend, true);
    assert.equal(payload.items.length, 1);
  });
});
