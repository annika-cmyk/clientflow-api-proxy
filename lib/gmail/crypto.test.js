/**
 * Gmail-kryptering – smoke test.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

test('encrypt/decrypt roundtrip', () => {
  process.env.GMAIL_TOKEN_SECRET = process.env.GMAIL_TOKEN_SECRET || 'test-secret-for-gmail-unit';
  const { encryptJson, decryptJson } = require('./crypto');
  const payload = { refreshToken: 'rt-abc', email: 'a@b.se', expiresAt: 123 };
  const blob = encryptJson(payload);
  assert.ok(typeof blob === 'string' && blob.length > 20);
  assert.deepEqual(decryptJson(blob), payload);
});
