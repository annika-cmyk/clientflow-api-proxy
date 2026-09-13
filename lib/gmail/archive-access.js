/**
 * Access- och maskningsregler för Mejlarkiv.
 */
const access = require('../access');
const archiveLinks = require('./archive-links');

const VISIBILITY_BYRA = 'byra';
const VISIBILITY_PRIVAT = 'privat';
const MASK_PLACEHOLDER = '█';

function normalizeVisibility(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'privat' || v === 'private') return VISIBILITY_PRIVAT;
  return VISIBILITY_BYRA;
}

function normalizeUserId(id) {
  return String(id || '').trim();
}

function parseSharedWith(raw) {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map(normalizeUserId).filter(Boolean))];
  }
  const s = String(raw || '').trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) {
      return [...new Set(parsed.map(normalizeUserId).filter(Boolean))];
    }
  } catch (_) {}
  return [...new Set(s.split(/[,;\s]+/).map(normalizeUserId).filter(Boolean))];
}

function isOwner(user, record) {
  const uid = normalizeUserId(user && user.id);
  const owner = normalizeUserId(record && record.ownerUserId);
  return !!(uid && owner && uid === owner);
}

function isSharedWith(user, record) {
  const uid = normalizeUserId(user && user.id);
  if (!uid) return false;
  return parseSharedWith(record && record.sharedWith).includes(uid);
}

function canViewArchivedMail(user, record) {
  if (!user || !record) return false;
  if (access.isClientFlowAdmin(user.role)) return true;
  if (normalizeVisibility(record.visibility) === VISIBILITY_PRIVAT) {
    return isOwner(user, record) || isSharedWith(user, record);
  }
  return true;
}

function canSeeUnmasked(user, record) {
  if (!user || !record) return false;
  if (access.isClientFlowAdmin(user.role)) return true;
  return isOwner(user, record);
}

function normalizeMaskedRanges(ranges) {
  if (!Array.isArray(ranges)) return [];
  return ranges
    .map((r) => {
      const start = Number(r && r.start);
      const end = Number(r && r.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < 0) return null;
      const field = String((r && r.field) || 'text').trim().toLowerCase();
      return { start: Math.floor(start), end: Math.floor(end), field: field === 'html' ? 'html' : 'text' };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

function applyMaskToText(text, ranges, field = 'text') {
  const src = text == null ? '' : String(text);
  if (!src) return src;
  const relevant = normalizeMaskedRanges(ranges).filter((r) => r.field === field);
  if (!relevant.length) return src;
  let out = src;
  for (let i = relevant.length - 1; i >= 0; i -= 1) {
    const r = relevant[i];
    const start = Math.min(r.start, out.length);
    const end = Math.min(r.end, out.length);
    if (end <= start) continue;
    out = out.slice(0, start) + MASK_PLACEHOLDER.repeat(Math.min(end - start, 80)) + out.slice(end);
  }
  return out;
}

function mergeMaskedRanges(existing, added) {
  const all = normalizeMaskedRanges([...(existing || []), ...(added || [])]);
  if (!all.length) return [];
  const byField = { text: [], html: [] };
  for (const r of all) byField[r.field].push(r);
  const merged = [];
  for (const field of ['text', 'html']) {
    const list = byField[field];
    if (!list.length) continue;
    let cur = { ...list[0] };
    for (let i = 1; i < list.length; i += 1) {
      const n = list[i];
      if (n.start <= cur.end) cur.end = Math.max(cur.end, n.end);
      else {
        merged.push(cur);
        cur = { ...n };
      }
    }
    merged.push(cur);
  }
  return merged;
}

function presentArchivedMail(user, record) {
  if (!record) return null;
  const unmasked = canSeeUnmasked(user, record);
  const ranges = normalizeMaskedRanges(record.maskedRanges);
  const savedTo = Array.isArray(record.savedTo) ? record.savedTo : [];
  const attachmentMeta = Array.isArray(record.attachmentMeta) ? record.attachmentMeta : [];
  const customerId = record.customerId || '';
  return {
    id: record.id || null,
    customerId,
    gmailMessageId: record.gmailMessageId || '',
    threadId: record.threadId || '',
    visibility: normalizeVisibility(record.visibility),
    sharedWith: parseSharedWith(record.sharedWith),
    ownerUserId: record.ownerUserId || '',
    subject: record.subject || '',
    from: record.from || '',
    to: record.to || '',
    cc: record.cc || '',
    date: record.date || '',
    snippet: record.snippet || '',
    bodyText: unmasked ? String(record.bodyText || '') : applyMaskToText(record.bodyText || '', ranges, 'text'),
    bodyHtml: unmasked ? String(record.bodyHtml || '') : applyMaskToText(record.bodyHtml || '', ranges, 'html'),
    masked: !unmasked && ranges.length > 0,
    maskedRanges: ranges.map((r) => ({ start: r.start, end: r.end, field: r.field })),
    canUnmask: unmasked,
    savedTo,
    attachmentMeta,
    savedSummary: archiveLinks.summarizeSavedTo(savedTo, { customerId }),
    isOwner: isOwner(user, record),
    canEdit: isOwner(user, record) || access.isClientFlowAdmin(user.role)
  };
}

module.exports = {
  VISIBILITY_BYRA,
  VISIBILITY_PRIVAT,
  MASK_PLACEHOLDER,
  normalizeVisibility,
  parseSharedWith,
  isOwner,
  isSharedWith,
  canViewArchivedMail,
  canSeeUnmasked,
  normalizeMaskedRanges,
  applyMaskToText,
  mergeMaskedRanges,
  presentArchivedMail
};
