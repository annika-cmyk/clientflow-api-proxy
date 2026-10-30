'use strict';

const crypto = require('crypto');

/**
 * Verifiera Fireflies Webhooks V2 X-Hub-Signature (sha256=<hex>).
 * @param {string|Buffer} payloadRaw
 * @param {string} signatureHeader
 * @param {string} secret
 */
function verifyWebhookSignature(payloadRaw, signatureHeader, secret) {
  const sig = String(signatureHeader || '').trim();
  const key = String(secret || '');
  if (!sig || !key) return false;
  const raw =
    Buffer.isBuffer(payloadRaw) ? payloadRaw : Buffer.from(String(payloadRaw || ''), 'utf8');
  const expected =
    'sha256=' + crypto.createHmac('sha256', key).update(raw).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

module.exports = {
  verifyWebhookSignature
};
