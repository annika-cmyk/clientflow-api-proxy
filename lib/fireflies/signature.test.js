const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { verifyWebhookSignature } = require('./signature');

describe('fireflies signature', () => {
  it('godkänner giltig sha256-hmac', () => {
    const secret = 'test-secret';
    const body = '{"event":"meeting.summarized","meeting_id":"abc"}';
    const sig =
      'sha256=' + crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
    assert.equal(verifyWebhookSignature(body, sig, secret), true);
  });

  it('avvisar fel signatur', () => {
    assert.equal(
      verifyWebhookSignature('{"a":1}', 'sha256=deadbeef', 'test-secret'),
      false
    );
  });
});
