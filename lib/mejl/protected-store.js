/**
 * Lagring av BankID-skyddade mejlfragment (text + bilagor).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 10;
const memory = new Map();

function dataDir() {
  return (
    String(process.env.MEJL_PROTECTED_DIR || '').trim() ||
    path.join(__dirname, '..', '..', 'data', 'mejl-protected')
  );
}

function ensureDir() {
  const dir = dataDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
  return dir;
}

function filePath(token) {
  const safe = String(token || '').replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(ensureDir(), `${safe}.json`);
}

function createProtectedMessage(input) {
  const protectedText = String((input && input.protectedText) || '').trim();
  const filesIn = Array.isArray(input && input.files) ? input.files : [];
  if (!protectedText && filesIn.length === 0) {
    const err = new Error('Skyddad text eller bilaga krävs');
    err.code = 'EMPTY_PROTECTED';
    throw err;
  }
  if (filesIn.length > MAX_FILES) {
    const err = new Error(`Max ${MAX_FILES} skyddade bilagor`);
    err.code = 'TOO_MANY_FILES';
    throw err;
  }

  const files = filesIn.map((f, i) => {
    const name = String((f && f.name) || `fil-${i + 1}`).slice(0, 200);
    const mimeType = String((f && f.mimeType) || 'application/octet-stream').slice(0, 120);
    const contentBase64 = String((f && f.contentBase64) || '').replace(/^data:[^;]+;base64,/, '');
    if (!contentBase64) {
      const err = new Error(`Bilaga saknar data: ${name}`);
      err.code = 'BAD_FILE';
      throw err;
    }
    const buf = Buffer.from(contentBase64, 'base64');
    if (buf.length > MAX_FILE_BYTES) {
      const err = new Error(`Bilagan ${name} är för stor (max 8 MB)`);
      err.code = 'FILE_TOO_LARGE';
      throw err;
    }
    return {
      id: crypto.randomBytes(8).toString('hex'),
      name,
      mimeType,
      size: buf.length,
      contentBase64
    };
  });

  const token = crypto.randomBytes(24).toString('hex');
  const record = {
    token,
    protectedText,
    files,
    subject: String((input && input.subject) || '').trim().slice(0, 300),
    customerId: String((input && input.customerId) || '').trim(),
    createdByUserId: String((input && input.createdByUserId) || '').trim(),
    createdByEmail: String((input && input.createdByEmail) || '').trim(),
    createdAt: Date.now(),
    expiresAt: Date.now() + TTL_MS
  };

  memory.set(token, record);
  try {
    fs.writeFileSync(filePath(token), JSON.stringify(record), 'utf8');
  } catch (err) {
    console.warn('mejl-protected: kunde inte spara till disk:', err.message);
  }
  return {
    token,
    expiresAt: record.expiresAt,
    fileCount: files.length,
    hasText: !!protectedText
  };
}

function loadFromDisk(token) {
  try {
    return JSON.parse(fs.readFileSync(filePath(token), 'utf8'));
  } catch (_) {
    return null;
  }
}

function getProtectedMessage(token) {
  const key = String(token || '').trim();
  if (!key) return null;
  let record = memory.get(key) || loadFromDisk(key);
  if (!record) return null;
  if (record.expiresAt && Date.now() > record.expiresAt) {
    memory.delete(key);
    try {
      fs.unlinkSync(filePath(key));
    } catch (_) {}
    return null;
  }
  memory.set(key, record);
  return record;
}

function publicMeta(record) {
  if (!record) return null;
  return {
    token: record.token,
    subject: record.subject || '',
    hasText: !!(record.protectedText && String(record.protectedText).trim()),
    files: (record.files || []).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size
    })),
    expiresAt: record.expiresAt,
    createdAt: record.createdAt
  };
}

function getFile(token, fileId) {
  const record = getProtectedMessage(token);
  if (!record) return null;
  return (record.files || []).find((f) => f.id === String(fileId || '')) || null;
}

module.exports = {
  TTL_MS,
  MAX_FILE_BYTES,
  MAX_FILES,
  createProtectedMessage,
  getProtectedMessage,
  publicMeta,
  getFile,
  _memory: memory,
  _dataDir: dataDir
};
