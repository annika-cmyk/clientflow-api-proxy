'use strict';

const MAX_SAVED_EXPORTS = 50;
const DOKUMENTATION_PDF_LIST_FIELD = 'Dokumentation PDF-lista';
const DOKUMENTATION_PDF_FILES_FIELD = 'Dokumentation PDF-filer';

const MONTHS_SV = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december'
];

const EXPORT_TYPES = {
  risk_och_policy: {
    id: 'risk_och_policy',
    label: 'Allmän riskbedömning och byråpolicy',
    shortLabel: 'Riskbedömning + policy'
  },
  riskbedomning: {
    id: 'riskbedomning',
    label: 'Allmän riskbedömning',
    shortLabel: 'Riskbedömning'
  },
  policy: {
    id: 'policy',
    label: 'Byråpolicy (rutiner)',
    shortLabel: 'Policy'
  }
};

function parseDokumentationList(raw) {
  if (Array.isArray(raw)) return raw.filter((x) => x && typeof x === 'object');
  if (raw && typeof raw === 'object') return [raw];
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t);
      return parseDokumentationList(parsed);
    } catch (_) {
      return [];
    }
  }
  return [];
}

function stripBase64FromItem(item) {
  if (!item || typeof item !== 'object') return null;
  const copy = { ...item };
  delete copy.base64;
  return copy;
}

function stripBase64FromList(list) {
  return parseDokumentationList(list).map(stripBase64FromItem).filter(Boolean);
}

function normalizeExportType(type) {
  const key = String(type || '').trim();
  return EXPORT_TYPES[key] ? key : 'risk_och_policy';
}

function exportTypeLabel(type) {
  return EXPORT_TYPES[normalizeExportType(type)].label;
}

function exportTypeShortLabel(type) {
  return EXPORT_TYPES[normalizeExportType(type)].shortLabel;
}

function parseExportDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const s = String(value).trim();
  if (!s) return null;
  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) return new Date(iso);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return null;
}

function formatExportDateIso(value) {
  const d = parseExportDate(value);
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

function stockholmParts(value) {
  const d = parseExportDate(value);
  if (!d) return null;
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  return parts;
}

function formatExportStamp(value) {
  const parts = stockholmParts(value);
  if (!parts) return '';
  const monthIndex = Number(parts.month) - 1;
  const month = MONTHS_SV[monthIndex] || parts.month;
  const day = String(Number(parts.day));
  return `${day} ${month} ${parts.year} ${parts.hour}:${parts.minute}`;
}

function formatExportDateDisplay(value) {
  const parts = stockholmParts(value) || stockholmParts(`${String(value || '').slice(0, 10)}T12:00:00Z`);
  if (!parts) return String(value || '').trim();
  const monthIndex = Number(parts.month) - 1;
  const month = MONTHS_SV[monthIndex] || parts.month;
  return `${String(Number(parts.day))} ${month} ${parts.year}`;
}

function safeByraSlug(byraNamn) {
  return String(byraNamn || 'byra')
    .replace(/[^a-zA-Z0-9åäöÅÄÖ -]/g, ' ')
    .trim()
    .replace(/[\s-]+/g, '-') || 'byra';
}

function buildExportFilename({ type, byraNamn, exportedAt, date } = {}) {
  const datum = formatExportDateIso(exportedAt || date) || new Date().toISOString().slice(0, 10);
  const slugs = {
    riskbedomning: 'Allman-riskbedomning',
    policy: 'Byrapolicy-rutiner',
    risk_och_policy: 'Allman-riskbedomning-och-rutiner'
  };
  const slug = slugs[normalizeExportType(type)];
  return `${slug}-${safeByraSlug(byraNamn)}-${datum}.pdf`;
}

function buildExportDisplayFilename({ type, exportedAt, date } = {}) {
  const label = exportTypeLabel(type);
  const stamp = formatExportStamp(exportedAt) || formatExportDateDisplay(date || exportedAt);
  return stamp ? `${label} ${stamp}.pdf` : `${label}.pdf`;
}

function sortDokumentationList(list) {
  return [...parseDokumentationList(list)].sort((a, b) => {
    const ta = Date.parse(a.exportedAt || a.createdTime || a.date || '') || 0;
    const tb = Date.parse(b.exportedAt || b.createdTime || b.date || '') || 0;
    return tb - ta;
  });
}

function addExportToList(list, entry) {
  const next = [stripBase64FromItem(entry) || {}, ...stripBase64FromList(list)];
  return sortDokumentationList(next).slice(0, MAX_SAVED_EXPORTS);
}

function mergeAttachmentsIntoList(list, attachments) {
  const meta = stripBase64FromList(list);
  const atts = Array.isArray(attachments) ? attachments.filter((a) => a && (a.id || a.url || a.filename)) : [];
  const used = new Set();
  const merged = [];

  function takeMeta(att) {
    const idMatch = att.id ? meta.find((item, i) => !used.has(i) && item.attachmentId === att.id) : null;
    if (idMatch) {
      used.add(meta.indexOf(idMatch));
      return idMatch;
    }
    const name = String(att.filename || '').trim().toLowerCase();
    if (!name) return {};
    const nameMatch = meta.find((item, i) => !used.has(i) && String(item.filename || '').trim().toLowerCase() === name);
    if (nameMatch) {
      used.add(meta.indexOf(nameMatch));
      return nameMatch;
    }
    return {};
  }

  for (const att of atts) {
    const metaItem = takeMeta(att);
    const exportedAt = metaItem.exportedAt || att.createdTime || null;
    const type = normalizeExportType(metaItem.type);
    merged.push({
      id: att.id || metaItem.id || metaItem.attachmentId,
      attachmentId: att.id || metaItem.attachmentId || null,
      date: metaItem.date || formatExportDateIso(exportedAt),
      exportedAt,
      filename: metaItem.filename || att.filename,
      type,
      title: metaItem.title || exportTypeLabel(type),
      size: att.size || metaItem.size || null
    });
  }

  for (let i = 0; i < meta.length; i++) {
    if (used.has(i)) continue;
    const item = meta[i];
    if (item.attachmentId && merged.some((m) => m.attachmentId === item.attachmentId)) continue;
    const type = normalizeExportType(item.type);
    merged.push({
      id: item.attachmentId || item.id || null,
      attachmentId: item.attachmentId || null,
      date: item.date || formatExportDateIso(item.exportedAt),
      exportedAt: item.exportedAt || null,
      filename: item.filename,
      type,
      title: item.title || exportTypeLabel(type),
      size: item.size || null
    });
  }

  return sortDokumentationList(merged).slice(0, MAX_SAVED_EXPORTS);
}

function toPublicListItem(item) {
  const type = normalizeExportType(item && item.type);
  const exportedAt = item && item.exportedAt;
  return {
    id: (item && (item.attachmentId || item.id)) || null,
    attachmentId: (item && item.attachmentId) || null,
    date: (item && item.date) || formatExportDateIso(exportedAt),
    exportedAt: exportedAt || null,
    filename: (item && item.filename) || buildExportDisplayFilename({ type, exportedAt, date: item && item.date }),
    type,
    title: (item && item.title) || exportTypeLabel(type),
    stamp: formatExportStamp(exportedAt) || formatExportDateDisplay((item && item.date) || exportedAt)
  };
}

function buildExportEntry({ type, byraNamn, exportedAt, attachmentId, filename } = {}) {
  const at = exportedAt || new Date().toISOString();
  const resolvedType = normalizeExportType(type);
  return {
    id: attachmentId || null,
    attachmentId: attachmentId || null,
    date: formatExportDateIso(at),
    exportedAt: at,
    filename: filename || buildExportFilename({ type: resolvedType, byraNamn, exportedAt: at }),
    type: resolvedType,
    title: exportTypeLabel(resolvedType)
  };
}

module.exports = {
  MAX_SAVED_EXPORTS,
  DOKUMENTATION_PDF_LIST_FIELD,
  DOKUMENTATION_PDF_FILES_FIELD,
  EXPORT_TYPES,
  parseDokumentationList,
  stripBase64FromList,
  normalizeExportType,
  exportTypeLabel,
  exportTypeShortLabel,
  formatExportDateIso,
  formatExportStamp,
  formatExportDateDisplay,
  buildExportFilename,
  buildExportDisplayFilename,
  sortDokumentationList,
  addExportToList,
  mergeAttachmentsIntoList,
  toPublicListItem,
  buildExportEntry
};
