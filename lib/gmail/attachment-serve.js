/**
 * Hjälpfunktioner för att servera Gmail-bilagor (förhandsgranska / ladda ner).
 */

const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

function safeFilename(name, fallback = 'fil') {
  return (
    String(name || fallback)
      .replace(/[\r\n"]/g, '')
      .replace(/[^\w\u00e5\u00e4\u00f6\u00c5\u00c4\u00d6 .\-()@]+/gi, '_')
      .trim()
      .slice(0, 180) || fallback
  );
}

function normalizeDisposition(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  return v === 'inline' ? 'inline' : 'attachment';
}

function guessMimeType(filename, fallback) {
  const name = String(filename || '').toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.svg')) return 'image/svg+xml';
  if (name.endsWith('.txt') || name.endsWith('.log') || name.endsWith('.csv')) return 'text/plain';
  if (name.endsWith('.html') || name.endsWith('.htm')) return 'text/html';
  if (name.endsWith('.json')) return 'application/json';
  const fb = String(fallback || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  return fb || 'application/octet-stream';
}

function canPreviewInline(mimeType, filename) {
  const type = guessMimeType(filename, mimeType);
  if (type === 'application/pdf') return true;
  if (type === 'text/plain' || type === 'application/json') return true;
  if (type.startsWith('image/') && type !== 'image/svg+xml') return true;
  return false;
}

function findAttachmentMeta(attachments, attachmentId) {
  const id = String(attachmentId || '').trim();
  if (!id) return null;
  const list = Array.isArray(attachments) ? attachments : [];
  return list.find((a) => a && String(a.attachmentId) === id) || null;
}

/**
 * Hitta bilaga via attachmentId, annars unik filnamnsmatch (när proxy
 * trunkerar path-param eller Gmail ger nytt id vid omhämtning).
 */
function resolveAttachmentMeta(attachments, attachmentId, filenameHint) {
  const byId = findAttachmentMeta(attachments, attachmentId);
  if (byId) return byId;
  const name = String(filenameHint || '').trim().toLowerCase();
  if (!name) return null;
  const list = Array.isArray(attachments) ? attachments : [];
  const matches = list.filter(
    (a) => a && String(a.filename || '').trim().toLowerCase() === name
  );
  return matches.length === 1 ? matches[0] : null;
}

function contentDispositionHeader(filename, disposition = 'attachment') {
  const safe = safeFilename(filename);
  const kind = normalizeDisposition(disposition);
  return `${kind}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

module.exports = {
  ATTACHMENT_MAX_BYTES,
  safeFilename,
  normalizeDisposition,
  guessMimeType,
  canPreviewInline,
  findAttachmentMeta,
  resolveAttachmentMeta,
  contentDispositionHeader
};
