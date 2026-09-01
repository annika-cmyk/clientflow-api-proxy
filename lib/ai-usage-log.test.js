'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createAiUsageLog, normalizeEntry } = require('./ai-usage-log');

describe('ai-usage-log', () => {
  it('normaliserar tokens och användare', () => {
    const entry = normalizeEntry({
      user: 'Anna@Byra.se',
      route: '/api/ai-chat',
      model: 'gpt-4o',
      usage: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 10, totalTokens: 120 }
    });
    assert.equal(entry.user, 'anna@byra.se');
    assert.equal(entry.inputTokens, 100);
    assert.equal(entry.outputTokens, 20);
    assert.equal(entry.totalTokens, 120);
  });

  it('summerar per användare och route', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-usage-'));
    const filePath = path.join(dir, 'usage.jsonl');
    const log = createAiUsageLog({ logPath: filePath });
    log.record({
      user: 'a@x.se',
      route: '/api/ai-chat',
      model: 'gpt-4o',
      usage: { inputTokens: 1000, outputTokens: 100, totalTokens: 1100 }
    });
    log.record({
      user: 'a@x.se',
      route: '/api/ai-riskbedomning',
      model: 'gpt-4o',
      usage: { inputTokens: 2000, outputTokens: 200, totalTokens: 2200 }
    });
    log.record({
      user: 'b@x.se',
      route: '/api/ai-chat',
      model: 'gpt-4o',
      usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60 }
    });
    await log.flush();
    const summary = log.summarize({ days: 7, recentLimit: 10 });
    assert.equal(summary.totalRequests, 3);
    assert.equal(summary.byUser[0].key, 'a@x.se');
    assert.equal(summary.byUser[0].requests, 2);
    assert.ok(summary.byUser[0].totalTokens >= 3300);
    assert.ok(summary.byRoute.some((r) => r.key === '/api/ai-chat' && r.requests === 2));
    assert.ok(summary.recent.length >= 3);
  });
});
