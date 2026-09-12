/**
 * Kryptering av Gmail OAuth-tokens (AES-256-GCM).
 */
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

function resolveSecret() {
  const raw = String(
    process.env.GMAIL_TOKEN_SECRET ||
      process.env.JWT_SECRET ||
      ''
  ).trim();
  if (!raw) {
    throw new Error('GMAIL_TOKEN_SECRET eller JWT_SECRET saknas för token-kryptering');
  }
  return crypto.createHash('sha256').update(raw).digest();
}

function encryptJson(obj) {
  const key = resolveSecret();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptJson(blob) {
  const raw = String(blob || '').trim();
  if (!raw) return null;
  const buf = Buffer.from(raw, 'base64');
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('Ogiltig token-blob');
  }
  const key = resolveSecret();
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

module.exports = {
  encryptJson,
  decryptJson,
  KEY_LEN
};
