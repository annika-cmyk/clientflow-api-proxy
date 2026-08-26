const dokumentKategori = require('./dokument-kategori');

const AKTUELL_RISK_CATEGORY = 'riskbedomning';
const HISTORIK_RISK_CATEGORY = 'historik_riskbedomning';

const RISK_SUBCATEGORIES = [
  'kyc',
  'kund_riskbedomning',
  'pep_sanktion',
  'ovrigt_risk'
];

const SUBCATEGORY_LABELS = {
  kyc: 'KYC-formulär',
  kund_riskbedomning: 'Kundens riskbedömning',
  pep_sanktion: 'PEP-sanktionssökningar',
  ovrigt_risk: 'Övrigt dokumentation riskbedömning'
};

const ARCHIVE_YEARS = {
  kyc: 7,
  kund_riskbedomning: 1,
  pep_sanktion: 1,
  ovrigt_risk: 7
};

const SUBCATEGORY_ORDER = RISK_SUBCATEGORIES.slice();

function normalizeSubcategory(value) {
  const s = String(value || '').trim();
  return RISK_SUBCATEGORIES.includes(s) ? s : '';
}

function normalizeScreeningKey(value) {
  return String(value || '').trim().toLowerCase();
}

function buildPersonScreeningKey(namn, personnr) {
  const n = String(namn || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const p = String(personnr || '').replace(/[^\d]/g, '');
  if (!n && !p) return '';
  return normalizeScreeningKey(`person:${n}:${p}`);
}

function buildEntityScreeningKey(namn, orgnr) {
  const n = String(namn || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const o = String(orgnr || '').replace(/[^\d]/g, '');
  if (!n && !o) return '';
  return normalizeScreeningKey(`entity:${n}:${o}`);
}

function inferSubcategoryFromAttachment(item, meta) {
  const fromMeta = normalizeSubcategory(meta?.subcategory);
  if (fromMeta) return fromMeta;

  const fn = String(item?.filename || meta?.filename || '').toLowerCase();
  const typ = item?._typ || '';

  if (typ === 'pep' || fn.includes('pep-screening') || fn.includes('entity-screening')) {
    return 'pep_sanktion';
  }
  if (fn.includes('kyc-signerat') || (fn.includes('kyc') && fn.includes('signerat'))) {
    return 'kyc';
  }
  if (
    typ === 'riskbedomning'
    || fn.includes('riskbedomning-kyc')
    || fn.startsWith('riskbedomning-')
    || fn.includes('riskbedomning')
  ) {
    return 'kund_riskbedomning';
  }
  if (meta?.category === 'kyc' || fn.includes('kyc')) {
    return 'kyc';
  }
  if (meta?.category === AKTUELL_RISK_CATEGORY || meta?.category === HISTORIK_RISK_CATEGORY) {
    return 'ovrigt_risk';
  }
  if (typ === 'riskbedomning' || typ === 'pep') return typ === 'pep' ? 'pep_sanktion' : 'kund_riskbedomning';
  return '';
}

function inferScreeningKeyFromAttachment(item, meta) {
  const existing = normalizeScreeningKey(meta?.screeningKey);
  if (existing) return existing;

  const fn = String(item?.filename || '').toLowerCase();
  if (fn.includes('entity-screening')) {
    const parts = fn.replace(/^entity-screening_/, '').split('_');
    const datePart = parts[parts.length - 1];
    const namePart = parts.slice(0, -1).join(' ').replace(/_/g, ' ');
    return buildEntityScreeningKey(namePart, '');
  }
  if (fn.includes('pep-screening')) {
    const parts = fn.replace(/^pep-screening_/, '').split('_');
    const namePart = parts.slice(0, -1).join(' ').replace(/_/g, ' ');
    return buildPersonScreeningKey(namePart, '');
  }
  return '';
}

function resolveRiskCategory(meta, item) {
  const raw = meta?.category || meta?.kategori || item?._category || '';
  if (raw === HISTORIK_RISK_CATEGORY) return HISTORIK_RISK_CATEGORY;
  if (raw === 'kyc') return AKTUELL_RISK_CATEGORY;
  if (raw === AKTUELL_RISK_CATEGORY) return AKTUELL_RISK_CATEGORY;
  if (item?._typ === 'pep' || item?._typ === 'riskbedomning') return AKTUELL_RISK_CATEGORY;
  const sub = inferSubcategoryFromAttachment(item, meta);
  if (sub) return AKTUELL_RISK_CATEGORY;
  return '';
}

function yearsBetween(fromDate, toDate) {
  const from = dokumentKategori.toDateOnly(fromDate);
  const to = dokumentKategori.toDateOnly(toDate) || new Date().toISOString().slice(0, 10);
  if (!from || !to) return 0;
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return (end - start) / (365.25 * 24 * 60 * 60 * 1000);
}

function shouldArchiveByAge(subcategory, createdDate, today) {
  const years = ARCHIVE_YEARS[normalizeSubcategory(subcategory)];
  if (!years) return false;
  const date = dokumentKategori.toDateOnly(createdDate);
  if (!date) return false;
  return yearsBetween(date, today) >= years;
}

function isAktuellRiskEntry(entry) {
  const cat = String(entry?.category || entry?.kategori || '').trim();
  return cat === AKTUELL_RISK_CATEGORY || cat === 'kyc';
}

function archiveEntry(entry) {
  return { ...entry, category: HISTORIK_RISK_CATEGORY };
}

function archivePriorOnNew(kategorier, { subcategory, screeningKey, keepFilename, keepAttachmentId } = {}) {
  const sub = normalizeSubcategory(subcategory);
  if (!sub) return Array.isArray(kategorier) ? kategorier.map((k) => ({ ...k })) : [];
  const keepKey = normalizeScreeningKey(screeningKey);
  const list = Array.isArray(kategorier) ? kategorier.map((k) => (k && typeof k === 'object' ? { ...k } : k)) : [];

  return list.map((entry) => {
    if (!entry || typeof entry !== 'object' || !isAktuellRiskEntry(entry)) return entry;
    const entrySub = normalizeSubcategory(entry.subcategory) || normalizeSubcategory(inferSubcategoryFromAttachment({ filename: entry.filename }, entry));
    if (entrySub !== sub) return entry;
    if (keepKey && normalizeScreeningKey(entry.screeningKey) !== keepKey) return entry;
    if (keepAttachmentId && entry.attachmentId && String(entry.attachmentId) === String(keepAttachmentId)) {
      return entry;
    }
    if (keepFilename && dokumentKategori.filenamesMatch(entry.filename, keepFilename)) {
      return entry;
    }
    return archiveEntry(entry);
  });
}

function applyAgeBasedArchive(kategorier, today) {
  const day = dokumentKategori.toDateOnly(today) || new Date().toISOString().slice(0, 10);
  const list = Array.isArray(kategorier) ? kategorier.map((k) => (k && typeof k === 'object' ? { ...k } : k)) : [];
  return list.map((entry) => {
    if (!entry || typeof entry !== 'object' || !isAktuellRiskEntry(entry)) return entry;
    const sub = normalizeSubcategory(entry.subcategory) || normalizeSubcategory(inferSubcategoryFromAttachment({ filename: entry.filename }, entry)) || 'ovrigt_risk';
    const createdDate = dokumentKategori.resolveCreatedDate({ meta: entry, attachment: { filename: entry.filename } });
    if (!shouldArchiveByAge(sub, createdDate, day)) return entry;
    return archiveEntry({ ...entry, subcategory: sub });
  });
}

function kategorierChanged(before, after) {
  return JSON.stringify(before || []) !== JSON.stringify(after || []);
}

function buildMetadataUpdatesForItem(item, meta, today) {
  const subcategory = inferSubcategoryFromAttachment(item, meta) || 'ovrigt_risk';
  const riskCategory = resolveRiskCategory(meta, item);
  if (!riskCategory) return null;

  let category = meta?.category === HISTORIK_RISK_CATEGORY
    ? HISTORIK_RISK_CATEGORY
    : (meta?.category === 'kyc' ? AKTUELL_RISK_CATEGORY : (meta?.category || riskCategory));

  const createdDate = dokumentKategori.resolveCreatedDate({ meta, attachment: item });
  if (category === AKTUELL_RISK_CATEGORY && shouldArchiveByAge(subcategory, createdDate, today)) {
    category = HISTORIK_RISK_CATEGORY;
  }

  const updates = {
    category,
    subcategory,
    filename: item?.filename || meta?.filename || '',
    createdDate: createdDate || today,
    systemCreated: meta?.systemCreated === true || undefined
  };
  const screeningKey = inferScreeningKeyFromAttachment(item, meta);
  if (screeningKey) updates.screeningKey = screeningKey;
  if (meta?.displayName) updates.displayName = meta.displayName;
  if (item?.id || meta?.attachmentId) updates.attachmentId = item?.id || meta?.attachmentId;
  return updates;
}

function syncRiskMetadata(kategorier, attachments, today) {
  const list = Array.isArray(kategorier) ? kategorier.map((k) => (k && typeof k === 'object' ? { ...k } : k)) : [];
  let next = list;
  const day = dokumentKategori.toDateOnly(today) || new Date().toISOString().slice(0, 10);

  (attachments || []).forEach((item) => {
    if (!item || !(item.filename || item.url || item.id)) return;
    const meta = dokumentKategori.findDokumentKategori(next, item);
    const updates = buildMetadataUpdatesForItem(item, meta, day);
    if (!updates) return;
    next = dokumentKategori.upsertDokumentKategori(next, item, updates);
  });

  next = applyAgeBasedArchive(next, day);
  return { nextKategorier: next, changed: kategorierChanged(list, next) };
}

module.exports = {
  AKTUELL_RISK_CATEGORY,
  HISTORIK_RISK_CATEGORY,
  RISK_SUBCATEGORIES,
  SUBCATEGORY_LABELS,
  SUBCATEGORY_ORDER,
  ARCHIVE_YEARS,
  normalizeSubcategory,
  buildPersonScreeningKey,
  buildEntityScreeningKey,
  inferSubcategoryFromAttachment,
  inferScreeningKeyFromAttachment,
  resolveRiskCategory,
  shouldArchiveByAge,
  archivePriorOnNew,
  applyAgeBasedArchive,
  syncRiskMetadata,
  kategorierChanged
};
