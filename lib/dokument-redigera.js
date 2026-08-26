const dokumentHistorik = require('./dokument-historik');
const dokumentKategori = require('./dokument-kategori');

function inferCategoryFromSource(sourceField, fields) {
  if (dokumentHistorik.isHistorikFieldName(sourceField, fields)) return 'historik';
  const n = String(sourceField || '').trim();
  if (/riskbedömning dokument|riskbedomning dokument/i.test(n)) return 'riskbedomning';
  if (/^PEP /i.test(n)) return 'riskbedomning';
  if (/årsredovisning fil/i.test(n)) return 'arsredovisning';
  return null;
}

function destinationFieldForCategory(sourceField, nextCategory, fields) {
  const destIsHistorik = nextCategory === 'historik';
  const sourceIsHistorik = dokumentHistorik.isHistorikFieldName(sourceField, fields);
  if (sourceIsHistorik === destIsHistorik) return sourceField;
  if (destIsHistorik) return dokumentHistorik.pickHistorikFieldName(fields);
  return 'Dokumentation';
}

function attachmentCopy(att) {
  return { url: att.url, filename: att.filename };
}

function planDokumentEdit({ fields, sourceField, sourceIndex, displayName, category, customCategory, createdDate }) {
  if (!sourceField || sourceIndex == null || sourceIndex === '') {
    return { error: 'customerId, sourceField och sourceIndex krävs', status: 400 };
  }
  const arr = Array.isArray(fields?.[sourceField]) ? fields[sourceField] : [];
  const idx = parseInt(sourceIndex, 10);
  if (!Number.isInteger(idx) || idx < 0 || idx >= arr.length) {
    return { error: 'Ogiltigt dokumentindex', status: 400 };
  }
  const att = arr[idx];
  if (!att || !(att.url || att.filename || att.id)) {
    return { error: 'Dokumentet hittades inte', status: 404 };
  }

  const hasDisplayName = displayName !== undefined;
  const hasCategory = category !== undefined;
  const hasCreatedDate = createdDate !== undefined;
  if (!hasDisplayName && !hasCategory && !hasCreatedDate) {
    return { error: 'Ange namn, kategori eller skapat datum', status: 400 };
  }
  if (hasCategory && String(category || '').trim() && !dokumentKategori.DOCUMENT_CATEGORIES.includes(String(category).trim())) {
    return { error: 'Ogiltig kategori', status: 400 };
  }

  const kategorier = dokumentKategori.parseDokumentKategorier(fields['Dokumentation Kategorier']);
  const existing = dokumentKategori.findDokumentKategori(kategorier, att);
  const inferred = inferCategoryFromSource(sourceField, fields);
  const nextCategory = hasCategory
    ? dokumentKategori.normalizeDokumentCategory(category)
    : dokumentKategori.normalizeDokumentCategory(existing?.category || inferred || 'ovrigt');

  if (hasCreatedDate && !dokumentKategori.isCreatedDateEditable({
    meta: existing,
    sourceField,
    typ: inferred === 'historik' ? 'historik' : (inferred || undefined)
  })) {
    return { error: 'Skapat datum kan inte ändras för dokument som skapats i ClientFlow', status: 400 };
  }
  if (hasCreatedDate) {
    const parsed = dokumentKategori.toDateOnly(createdDate);
    if (!parsed) return { error: 'Ogiltigt skapat datum (YYYY-MM-DD)', status: 400 };
  }

  const updates = { category: nextCategory };
  updates.customCategory = nextCategory === 'ovrigt'
    ? String(customCategory !== undefined ? customCategory : (existing?.customCategory || '')).trim()
    : '';
  if (hasDisplayName) {
    updates.displayName = dokumentKategori.sanitizeDisplayName(displayName, existing?.displayName || att.filename);
  } else if (existing?.displayName) {
    updates.displayName = existing.displayName;
  }
  if (hasCreatedDate) {
    updates.createdDate = dokumentKategori.toDateOnly(createdDate);
  } else if (existing?.createdDate) {
    updates.createdDate = dokumentKategori.toDateOnly(existing.createdDate);
  }
  if (existing?.systemCreated) updates.systemCreated = true;

  const nextKategorier = dokumentKategori.upsertDokumentKategori(kategorier, att, updates);
  const destField = destinationFieldForCategory(sourceField, nextCategory, fields);
  const moved = destField !== sourceField;
  const patchFields = {
    'Dokumentation Kategorier': JSON.stringify(nextKategorier)
  };
  if (moved) {
    if (!att.url) {
      return { error: 'Kan inte flytta dokumentet utan fil-URL', status: 400 };
    }
    const destArr = Array.isArray(fields[destField]) ? fields[destField].slice() : [];
    destArr.push(attachmentCopy(att));
    patchFields[destField] = destArr;
    patchFields[sourceField] = arr.filter((_, i) => i !== idx);
  }

  return {
    attachment: att,
    nextCategory,
    customCategory: updates.customCategory || undefined,
    destField,
    sourceField,
    moved,
    displayName: updates.displayName || existing?.displayName || att.filename,
    createdDate: updates.createdDate || dokumentKategori.resolveCreatedDate({ meta: existing, attachment: att }),
    nextKategorier,
    patchFields
  };
}

module.exports = {
  inferCategoryFromSource,
  destinationFieldForCategory,
  planDokumentEdit
};
