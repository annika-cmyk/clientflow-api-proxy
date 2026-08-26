const DOCUMENT_CATEGORIES = [
  'riskbedomning',
  'historik_riskbedomning',
  'historik',
  'arsredovisning',
  'uppdragsavtal',
  'kyc',
  'bolagsverket_skatteverket',
  'ovrigt'
];

const CATEGORY_LABELS = {
  riskbedomning: 'Dokumentation riskbedömning',
  historik_riskbedomning: 'Historik Riskbedömning',
  historik: 'Dokumentation - historik',
  arsredovisning: 'Årsredovisningar',
  uppdragsavtal: 'Uppdragsavtal',
  kyc: 'KYC-formulär',
  bolagsverket_skatteverket: 'Bolagsverket och Skatteverket',
  ovrigt: 'Övrigt'
};

const SYSTEM_SOURCE_FIELD_PATTERNS = [
  /riskbedömning dokument|riskbedomning dokument/i,
  /^PEP /i,
  /årsredovisning fil/i
];

function toDateOnly(value) {
  if (!value) return '';
  const s = String(value).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const parsed = Date.parse(s.replace(' ', 'T'));
  if (!Number.isFinite(parsed)) return '';
  return new Date(parsed).toISOString().slice(0, 10);
}

function dateFromFilename(filename) {
  const match = String(filename || '').match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function isSystemSourceField(sourceField) {
  const n = String(sourceField || '').trim();
  if (!n) return false;
  return SYSTEM_SOURCE_FIELD_PATTERNS.some((re) => re.test(n));
}

function isSystemCreatedMeta(meta) {
  return !!(meta && (meta.systemCreated === true || meta.systemCreated === 'true'));
}

function isCreatedDateEditable({ meta, sourceField, typ } = {}) {
  if (isSystemCreatedMeta(meta)) return false;
  if (isSystemSourceField(sourceField)) return false;
  if (typ === 'arsredovisning' || typ === 'riskbedomning' || typ === 'pep') return false;
  return true;
}

function resolveCreatedDate({ meta, attachment, fallbackDatum } = {}) {
  const fromMeta = toDateOnly(meta?.createdDate || meta?.skapatDatum);
  if (fromMeta) return fromMeta;
  const fromFallback = toDateOnly(fallbackDatum);
  if (fromFallback) return fromFallback;
  const fromAttachment = toDateOnly(attachment?.createdTime);
  if (fromAttachment) return fromAttachment;
  return dateFromFilename(attachment?.filename || meta?.filename);
}

function parseDokumentKategorier(raw) {
  if (Array.isArray(raw)) return raw.filter((x) => x && typeof x === 'object');
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed.filter((x) => x && typeof x === 'object') : [];
  } catch (_) {
    return [];
  }
}

function normalizeDokumentCategory(cat) {
  const c = String(cat || '').trim();
  return DOCUMENT_CATEGORIES.includes(c) ? c : 'ovrigt';
}

function filenamesMatch(a, b) {
  const x = String(a || '').trim().toLowerCase();
  const y = String(b || '').trim().toLowerCase();
  if (!x || !y) return false;
  return x === y || x.endsWith(y) || y.endsWith(x);
}

function matchDokumentKategori(attachment, kategorier, used) {
  const usedSet = used instanceof Set ? used : new Set();
  const list = Array.isArray(kategorier) ? kategorier : [];
  const att = attachment || {};

  for (let i = 0; i < list.length; i++) {
    if (usedSet.has(i)) continue;
    const meta = list[i] || {};
    if (meta.attachmentId && att.id && String(meta.attachmentId) === String(att.id)) {
      usedSet.add(i);
      return { meta, index: i };
    }
  }

  for (let i = 0; i < list.length; i++) {
    if (usedSet.has(i)) continue;
    const meta = list[i] || {};
    if (filenamesMatch(att.filename || att.name, meta.filename)) {
      usedSet.add(i);
      return { meta, index: i };
    }
  }

  return null;
}

function matchDokumentKategoriAtIndex(attachment, kategorier, index, used) {
  const hit = matchDokumentKategori(attachment, kategorier, used);
  if (hit) return hit;
  const usedSet = used instanceof Set ? used : new Set();
  const list = Array.isArray(kategorier) ? kategorier : [];
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= list.length || usedSet.has(i)) return null;
  const meta = list[i];
  if (!meta || typeof meta !== 'object') return null;
  usedSet.add(i);
  return { meta, index: i };
}

function findDokumentKategori(kategorier, attachment) {
  return matchDokumentKategori(attachment, kategorier, new Set())?.meta || null;
}

function sanitizeDisplayName(name, fallback = '') {
  const raw = String(name ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  const fallbackName = String(fallback ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  const value = raw || fallbackName || 'Dokument';
  return value.slice(0, 200);
}

function upsertDokumentKategori(kategorier, attachment, updates) {
  const list = Array.isArray(kategorier) ? kategorier.map((k) => (k && typeof k === 'object' ? { ...k } : k)) : [];
  const hit = matchDokumentKategori(attachment, list, new Set());
  const filename = (attachment && attachment.filename) || (updates && updates.filename) || (hit && hit.meta && hit.meta.filename) || '';
  const attachmentId = (updates && updates.attachmentId) || (attachment && attachment.id) || (hit && hit.meta && hit.meta.attachmentId);
  const base = hit ? { ...list[hit.index] } : { filename };
  const next = { ...base, filename: filename || base.filename || '' };
  const patch = updates && typeof updates === 'object' ? updates : {};
  if (patch.displayName !== undefined) {
    next.displayName = sanitizeDisplayName(patch.displayName, next.displayName || next.filename);
  }
  if (patch.category !== undefined || patch.kategori !== undefined) {
    next.category = normalizeDokumentCategory(patch.category || patch.kategori);
    next.customCategory = next.category === 'ovrigt'
      ? String(patch.customCategory || patch.customKategori || '').trim()
      : '';
  } else if (patch.customCategory !== undefined && normalizeDokumentCategory(next.category) === 'ovrigt') {
    next.customCategory = String(patch.customCategory || '').trim();
  }
  if (attachmentId) next.attachmentId = attachmentId;
  if (patch.createdDate !== undefined || patch.skapatDatum !== undefined) {
    const parsed = toDateOnly(patch.createdDate ?? patch.skapatDatum);
    if (parsed) next.createdDate = parsed;
    else delete next.createdDate;
  }
  if (patch.systemCreated !== undefined) {
    if (patch.systemCreated === true || patch.systemCreated === 'true') next.systemCreated = true;
    else delete next.systemCreated;
  }
  if (hit) list[hit.index] = next;
  else list.push(next);
  return list;
}

function applyDokumentKategoriMeta(item, kategorier) {
  const att = item || {};
  const meta = findDokumentKategori(kategorier, {
    id: att.id || att.attachmentId,
    filename: att.filename || att.Namn || (att.fields && att.fields.Namn)
  });
  if (!meta) return {};
  const overlay = {};
  if (meta.displayName) overlay.displayName = sanitizeDisplayName(meta.displayName, att.filename);
  if (meta.category || meta.kategori) {
    overlay.category = normalizeDokumentCategory(meta.category || meta.kategori);
    overlay.customCategory = String(meta.customCategory || meta.customKategori || '').trim();
  }
  const createdDate = resolveCreatedDate({ meta, attachment: att });
  if (createdDate) overlay.createdDate = createdDate;
  overlay.systemCreated = isSystemCreatedMeta(meta);
  overlay.createdDateEditable = isCreatedDateEditable({ meta, sourceField: att._sourceField, typ: att._typ });
  return overlay;
}

module.exports = {
  DOCUMENT_CATEGORIES,
  CATEGORY_LABELS,
  parseDokumentKategorier,
  normalizeDokumentCategory,
  filenamesMatch,
  matchDokumentKategori,
  matchDokumentKategoriAtIndex,
  findDokumentKategori,
  sanitizeDisplayName,
  upsertDokumentKategori,
  applyDokumentKategoriMeta,
  toDateOnly,
  dateFromFilename,
  isSystemSourceField,
  isSystemCreatedMeta,
  isCreatedDateEditable,
  resolveCreatedDate
};
