const dokumentKategori = require('./dokument-kategori');
const { fieldIsChecked, pickNewestKycDoc } = require('./kyc-dokument-sync');

const UTANFOR_FIELD = 'Uppdragsavtal utanför ClientFlow';
const UTFOERD_DATUM_FIELD = 'Uppdragsavtal UTFÖRD DATUM';
const MAX_YEARS = 5;

function yearsSince(dateStr, today) {
  const from = dokumentKategori.toDateOnly(dateStr);
  const to = dokumentKategori.toDateOnly(today) || new Date().toISOString().slice(0, 10);
  if (!from || !to) return Infinity;
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return Infinity;
  return (end - start) / (365.25 * 24 * 60 * 60 * 1000);
}

function isWithinMaxYears(dateStr, maxYears, today) {
  return yearsSince(dateStr, today) <= maxYears;
}

function isUppdragsavtalEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const cat = String(entry.category || entry.kategori || '').trim();
  return cat === 'uppdragsavtal';
}

function isClientFlowUppdragsavtalActive(avtalFields) {
  if (!avtalFields || typeof avtalFields !== 'object') return false;
  const status = String(avtalFields['Avtalsstatus'] || avtalFields['Status'] || '').trim();
  if (status === 'Signerat' || status === 'Skickat till kund') return true;
  if (avtalFields['InleedDokumentId']) return true;
  return false;
}

function listExternalUppdragsavtalDocs(kategorier, today = new Date().toISOString().slice(0, 10)) {
  const list = Array.isArray(kategorier) ? kategorier : [];
  return list
    .filter((entry) => isUppdragsavtalEntry(entry))
    .filter((entry) => entry.systemCreated !== true && entry.systemCreated !== 'true')
    .map((entry) => ({
      filename: entry.filename || entry.displayName || '',
      createdDate: dokumentKategori.toDateOnly(
        dokumentKategori.resolveCreatedDate({ meta: entry, attachment: { filename: entry.filename } })
      )
    }))
    .filter((doc) => (doc.filename || doc.createdDate) && isWithinMaxYears(doc.createdDate, MAX_YEARS, today));
}

/**
 * Om det finns uppdragsavtal i dokumentationen (ej systemCreated, yngre än 5 år)
 * → bocka i "utanför ClientFlow" och sätt avtalsdatum från dokumentets skapade datum.
 */
function buildUppdragsavtalUtanforSyncPatch(fields, kategorier, opts = {}) {
  if (isClientFlowUppdragsavtalActive(opts.avtalFields)) return null;

  const docs = listExternalUppdragsavtalDocs(kategorier, opts.today);
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
  MAX_YEARS,
  yearsSince,
  isWithinMaxYears,
  isUppdragsavtalEntry,
  isClientFlowUppdragsavtalActive,
  listExternalUppdragsavtalDocs,
  buildUppdragsavtalUtanforSyncPatch
};
