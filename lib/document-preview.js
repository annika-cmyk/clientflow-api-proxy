'use strict';

const PREVIEW_TYPES = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  txt: 'text/plain'
};

function fileExtension(filename) {
  const name = String(filename || '').trim();
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

function guessContentType(filename, fallback) {
  const ext = fileExtension(filename);
  if (ext && PREVIEW_TYPES[ext]) return PREVIEW_TYPES[ext];
  const raw = String(fallback || '').split(';')[0].trim().toLowerCase();
  if (raw && raw !== 'application/octet-stream') return raw;
  return 'application/octet-stream';
}

function canPreviewInline(filename, contentType) {
  const type = guessContentType(filename, contentType);
  return type === 'application/pdf' || type.startsWith('image/') || type === 'text/plain';
}

function inlineContentDisposition(filename) {
  const safe = String(filename || 'dokument').replace(/[\r\n"]/g, '');
  return `inline; filename="${safe}"`;
}

function pickAttachment(fields, sourceField, sourceIndex) {
  const f = fields || {};
  const name = String(sourceField || '').trim();
  if (!name) return null;
  const arr = Array.isArray(f[name]) ? f[name] : [];
  const idx = parseInt(sourceIndex, 10);
  if (!Number.isInteger(idx) || idx < 0 || idx >= arr.length) return null;
  const att = arr[idx];
  if (!att || !att.url) return null;
  return att;
}

module.exports = {
  PREVIEW_TYPES,
  fileExtension,
  guessContentType,
  canPreviewInline,
  inlineContentDisposition,
  pickAttachment
};
