const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isRetryableAirtableError,
  retryDelayMs,
  withAirtableRetry,
  friendlyAirtableRateLimitMessage
} = require('./airtable-retry');

describe('airtable-retry', () => {
  it('känner igen 429 och rate-limit-meddelanden', () => {
    assert.equal(isRetryableAirtableError({ response: { status: 429 } }), true);
    assert.equal(isRetryableAirtableError({ response: { status: 503 } }), true);
    assert.equal(isRetryableAirtableError({ message: 'Request failed with status code 429' }), true);
    assert.equal(isRetryableAirtableError({ response: { status: 400 } }), false);
  });

  it('respekterar Retry-After och backoff', () => {
    assert.equal(retryDelayMs({ response: { headers: { 'retry-after': '2' } } }, 1, 500), 2000);
    assert.equal(retryDelayMs({}, 1, 500), 500);
    assert.equal(retryDelayMs({}, 2, 500), 1000);
  });

  it('försöker igen vid 429 och lyckas sedan', async () => {
    let calls = 0;
    const sleeps = [];
    const result = await withAirtableRetry(async () => {
      calls += 1;
      if (calls === 1) {
        const err = new Error('Request failed with status code 429');
        err.response = { status: 429, headers: {} };
        throw err;
      }
      return 'ok';
    }, {
      maxAttempts: 3,
      baseDelayMs: 10,
      sleep: async (ms) => { sleeps.push(ms); }
    });
    assert.equal(result, 'ok');
    assert.equal(calls, 2);
    assert.equal(sleeps.length, 1);
  });

  it('ger vänligt rate-limit-meddelande', () => {
    assert.match(friendlyAirtableRateLimitMessage(), /överbelastad|Airtable|sekunder/i);
  });
});
