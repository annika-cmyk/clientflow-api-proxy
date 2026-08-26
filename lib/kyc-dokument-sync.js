const dokumentKategori = require('./dokument-kategori');
const dokumentRiskSubkategori = require('./dokument-risk-subkategori');

const UTANFOR_FIELD = 'KYC-formulär utanför ClientFlow';
const UTFOERD_DATUM_FIELD = 'KYC UTFÖRD DATUM';

function fieldIsChecked(fields, fieldName) {
  const v = fields?.[fieldName];
  return v === true || v === 1 || v === 'true' || v === 'Ja' || v === 'checked';
}

function parseSavedKyc(fields) {
  try {
    const raw = fields?.['KYC-formular (JSON)'];
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    return JSON.parse(String(raw));
  } catch (_) {
    return {};
  }
}

function isClientFlowKycActive(fields) {
  const kyc = parseSavedKyc(fields);
  const status = String(kyc.status || '').trim();
  if (status === 'Signerat' || status === 'Skickat till kund') return true;
  if (kyc.inleedDokumentId) return true;
  return false;
}

function entrySubcategory(entry) {
  return dokumentRiskSubkategori.normalizeSubcategory(entry?.subcategory)
    || dokumentRiskSubkategori.normalizeSubcategory(
      dokumentRiskSubkategori.inferSubcategoryFromAttachment({ filename: entry?.filename }, entry)
    );
}

function isAktuellKycEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const cat = String(entry.category || entry.kategori || '').trim();
  if (cat === dokumentRiskSubkategori.HISTORIK_RISK_CATEGORY) return false;
  if (cat !== dokumentRiskSubkategori.AKTUELL_RISK_CATEGORY && cat !== 'kyc') return false;
  return entrySubcategory(entry) === 'kyc';
}

function listAktuellExternalKycDocs(kategorier) {
  const list = Array.isArray(kategorier) ? kategorier : [];
  return list
    .filter((entry) => isAktuellKycEntry(entry))
    .filter((entry) => entry.systemCreated !== true && entry.systemCreated !== 'true')
    .map((entry) => ({
      filename: entry.filename || entry.displayName || '',
      createdDate: dokumentKategori.toDateOnly(
        dokumentKategori.resolveCreatedDate({ meta: entry, attachment: { filename: entry.filename } })
      )
    }))
    .filter((doc) => doc.filename || doc.createdDate);
}

function pickNewestKycDoc(docs) {
  if (!docs.length) return null;
  return docs.slice().sort((a, b) => String(b.createdDate || '').localeCompare(String(a.createdDate || '')))[0];
}

/**
 * Om det finns aktuellt KYC-dokument (ej ClientFlow-signerat/systemCreated)
 * → bocka i "utanför ClientFlow" och sätt utfört datum från dokumentets skapade datum.
 */
function buildKycUtanforSyncPatch(fields, kategorier) {
  if (isClientFlowKycActive(fields)) return null;

  const docs = listAktuellExternalKycDocs(kategorier);
  const newest = pickNewestKycDoc(docs);
  if (!newest) return null;

  const patch = {};
  if (!fieldIsChecked(fields, UTANFOR_FIELD)) {
    patch[UTANFOR_FIELD] = true;
  }
  const date = newest.createdDate || '';
  const currentDate = dokumentKategori.toDateOnly(fields?.[UTFOERD_DATUM_FIELD]);
  if (date && date !== currentDate) {
    patch[UTFOERD_DATUM_FIELD] = date;
  }
  return Object.keys(patch).length ? patch : null;
}

module.exports = {
  UTANFOR_FIELD,
  UTFOERD_DATUM_FIELD,
  fieldIsChecked,
  parseSavedKyc,
  isClientFlowKycActive,
  isAktuellKycEntry,
  listAktuellExternalKycDocs,
  pickNewestKycDoc,
  buildKycUtanforSyncPatch
};
