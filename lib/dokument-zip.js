'use strict';

const AdmZip = require('adm-zip');
const documentPreview = require('./document-preview');
const dokumentHistorik = require('./dokument-historik');

const CUSTOMER_MAX_FILES = 30;
const CUSTOMER_MAX_BYTES = 50 * 1024 * 1024;
const BYRA_MAX_FILES = 80;
const BYRA_MAX_BYTES = 80 * 1024 * 1024;
const FILE_MAX_BYTES = 40 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 20000;
const CUSTOMER_DEADLINE_MS = 45000;
const BYRA_DEADLINE_MS = 85000;

const FIXED_ATTACHMENT_FIELDS = [
  'Dokumentation',
  'Attachments',
  'Riskbedömning dokument',
  'Riskbedomning dokument',
  'PEP rapporter',
  'PEP rapport',
  'Senaste årsredovisning fil',
  'Fg årsredovisning fil',
  'Ffg årsredovisning fil'
];

function sanitizeZipPart(name, fallback = 'dokument') {
  const raw = String(name || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\\/<>:"|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const cleaned = raw.replace(/^\.+/, '').trim();
  return (cleaned || fallback).slice(0, 80);
}

function uniqueZipPath(used, path) {
  const set = used instanceof Set ? used : new Set();
  const start = String(path || 'dokument');
  if (!set.has(start)) {
    set.add(start);
    return start;
  }
  const dot = start.lastIndexOf('.');
  const base = dot > 0 ? start.slice(0, dot) : start;
  const ext = dot > 0 ? start.slice(dot) : '';
  let i = 2;
  let next = `${base}_${i}${ext}`;
  while (set.has(next)) {
    i += 1;
    next = `${base}_${i}${ext}`;
  }
  set.add(next);
  return next;
}

function folderForField(fieldName) {
  const n = String(fieldName || '').toLowerCase();
  if (n.includes('historik')) return 'Dokumentation - historik';
  if (n.includes('riskbed')) return 'Dokumentation riskbedomning';
  if (n.includes('pep')) return 'PEP';
  if (n.includes('årsredovisning') || n.includes('arsredovisning')) return 'Arsredovisningar';
  if (n === 'dokumentation') return 'Dokumentation';
  if (n === 'attachments') return 'Ovrigt';
  return sanitizeZipPart(fieldName, 'Ovrigt');
}

function listAttachmentFieldNames(fields) {
  const names = new Set(FIXED_ATTACHMENT_FIELDS);
  dokumentHistorik.discoverHistorikFieldNames(fields).forEach((n) => names.add(n));
  return [...names];
}

function listCustomerAttachmentRefs(fields) {
  const f = fields || {};
  const items = [];
  listAttachmentFieldNames(f).forEach((fieldName) => {
    const arr = Array.isArray(f[fieldName]) ? f[fieldName] : [];
    arr.forEach((att, index) => {
      if (!att || !att.url) return;
      items.push({
        sourceField: fieldName,
        sourceIndex: index,
        filename: att.filename || 'dokument',
        url: att.url,
        size: Number(att.size) || 0,
        folder: folderForField(fieldName)
      });
    });
  });
  return items;
}

function resolveSelectedAttachments(fields, items) {
  const resolved = [];
  const missing = [];
  (items || []).forEach((item) => {
    const att = documentPreview.pickAttachment(fields, item && item.sourceField, item && item.sourceIndex);
    if (!att) {
      missing.push({
        sourceField: item && item.sourceField,
        sourceIndex: item && item.sourceIndex,
        filename: (item && item.filename) || 'dokument'
      });
      return;
    }
    resolved.push({
      sourceField: item.sourceField,
      sourceIndex: item.sourceIndex,
      filename: att.filename || item.filename || 'dokument',
      url: att.url,
      size: Number(att.size) || 0,
      folder: folderForField(item.sourceField)
    });
  });
  return { resolved, missing };
}

function planZipEntries({ files, maxFiles, maxBytes, fileMaxBytes = FILE_MAX_BYTES }) {
  const included = [];
  const skipped = [];
  let total = 0;
  (files || []).forEach((file) => {
    const filename = file.filename || 'dokument';
    if (included.length >= maxFiles) {
      skipped.push({ filename, reason: 'max antal filer' });
      return;
    }
    const size = Number(file.size) || 0;
    if (size > fileMaxBytes) {
      skipped.push({ filename, reason: 'för stor' });
      return;
    }
    if (size && total + size > maxBytes) {
      skipped.push({ filename, reason: 'max storlek' });
      return;
    }
    included.push(file);
    total += size;
  });
  return { included, skipped, total };
}

function sanitizeZipPath(path, fallback = 'dokument') {
  const parts = String(path || '')
    .split('/')
    .map((part) => sanitizeZipPart(part, ''))
    .filter(Boolean);
  return parts.join('/') || fallback;
}

function assignZipPaths(files, used) {
  const set = used instanceof Set ? used : new Set();
  return (files || []).map((file) => {
    const folderParts = String(file.folder || '')
      .split('/')
      .map((part) => sanitizeZipPart(part, ''))
      .filter(Boolean);
    const name = sanitizeZipPart(file.filename, 'dokument');
    const raw = folderParts.length ? `${folderParts.join('/')}/${name}` : name;
    return { ...file, zipPath: uniqueZipPath(set, raw) };
  });
}

function buildSkippedManifest(skipped) {
  const list = Array.isArray(skipped) ? skipped : [];
  const lines = ['Filer som inte togs med i exporten:', ''];
  list.forEach((item) => {
    const name = item.filename || 'dokument';
    const reason = item.reason || 'okänd anledning';
    lines.push(`- ${name} (${reason})`);
  });
  return Buffer.from(lines.join('\n'), 'utf8');
}

function buildZipBuffer(files) {
  const zip = new AdmZip();
  const used = new Set();
  (files || []).forEach((file) => {
    const path = uniqueZipPath(used, file.zipPath || file.filename || 'dokument');
    zip.addFile(path, file.buffer);
  });
  return zip.toBuffer();
}

function attachmentZipDisposition(filename) {
  const safe = String(filename || 'dokument.zip').replace(/[\r\n"]/g, '');
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

function dateStamp(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function isPastDeadline(startedAt, deadlineMs) {
  return Date.now() - Number(startedAt || 0) > Number(deadlineMs || 0);
}

async function assembleZipFiles({ planned, fetchBuffer, startedAt = Date.now(), deadlineMs }) {
  const zipFiles = [];
  const skipped = (planned.skipped || []).slice();
  for (const file of planned.included || []) {
    if (deadlineMs && isPastDeadline(startedAt, deadlineMs)) {
      skipped.push({ filename: file.filename, reason: 'tidsgräns' });
      continue;
    }
    try {
      const buffer = await fetchBuffer(file);
      if (!buffer || !buffer.length) {
        skipped.push({ filename: file.filename, reason: 'tom fil' });
        continue;
      }
      if (buffer.length > FILE_MAX_BYTES) {
        skipped.push({ filename: file.filename, reason: 'för stor' });
        continue;
      }
      zipFiles.push({ zipPath: file.zipPath, buffer });
    } catch (err) {
      skipped.push({ filename: file.filename, reason: err.message || 'kunde inte laddas' });
    }
  }
  if (skipped.length) {
    zipFiles.push({
      zipPath: '_oversikt-hoppade.txt',
      buffer: buildSkippedManifest(skipped)
    });
  }
  if (!zipFiles.length) {
    return { error: 'Inga filer kunde exporteras', skipped };
  }
  return {
    buffer: buildZipBuffer(zipFiles),
    included: zipFiles.filter((f) => f.zipPath !== '_oversikt-hoppade.txt').length,
    skipped
  };
}

module.exports = {
  CUSTOMER_MAX_FILES,
  CUSTOMER_MAX_BYTES,
  BYRA_MAX_FILES,
  BYRA_MAX_BYTES,
  FILE_MAX_BYTES,
  DOWNLOAD_TIMEOUT_MS,
  CUSTOMER_DEADLINE_MS,
  BYRA_DEADLINE_MS,
  sanitizeZipPart,
  uniqueZipPath,
  sanitizeZipPath,
  folderForField,
  listAttachmentFieldNames,
  listCustomerAttachmentRefs,
  resolveSelectedAttachments,
  planZipEntries,
  assignZipPaths,
  buildSkippedManifest,
  buildZipBuffer,
  attachmentZipDisposition,
  dateStamp,
  isPastDeadline,
  assembleZipFiles
};
