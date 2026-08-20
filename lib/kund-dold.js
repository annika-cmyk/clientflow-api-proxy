const DOLD_FIELD = 'Dold';
const DOLD_DATUM_FIELD = 'Dold datum';
const DOLD_AV_FIELD = 'Dold av';

function isKundDold(fields) {
  const v = (fields || {})[DOLD_FIELD];
  return v === true || v === 'true' || v === 1 || v === '1';
}

function isAvslutadKund(fields) {
  const v = String((fields || {}).Kundstatus || '').trim().toLowerCase();
  return v === 'avslutad' || v === 'avslutat' || v === 'avslutad kund';
}

function shouldShowRaderaKund(fields) {
  return isAvslutadKund(fields) && !isKundDold(fields);
}

function filterVisibleKunder(records) {
  return (records || []).filter((r) => !isKundDold(r && r.fields));
}

function filterDoldaKunder(records) {
  return (records || []).filter((r) => isKundDold(r && r.fields));
}

function mapDoldKundListItem(record) {
  const f = (record && record.fields) || {};
  const id = record && record.id ? String(record.id) : '';
  return {
    id,
    namn: f.Namn || f['Företagsnamn'] || 'Namn saknas',
    orgnr: f.Orgnr || f.Organisationsnummer || f['Org.nr'] || '',
    kundstatus: f.Kundstatus || '',
    doldDatum: f[DOLD_DATUM_FIELD] || '',
    doldAv: f[DOLD_AV_FIELD] || '',
    kundkortUrl: id ? `kundkort.html?id=${encodeURIComponent(id)}` : ''
  };
}

function hideFields(actorName, at = new Date().toISOString()) {
  return {
    [DOLD_FIELD]: true,
    [DOLD_DATUM_FIELD]: at,
    [DOLD_AV_FIELD]: String(actorName || '').trim()
  };
}

function unhideFields() {
  return {
    [DOLD_FIELD]: false
  };
}

module.exports = {
  DOLD_FIELD,
  DOLD_DATUM_FIELD,
  DOLD_AV_FIELD,
  isKundDold,
  isAvslutadKund,
  shouldShowRaderaKund,
  filterVisibleKunder,
  filterDoldaKunder,
  mapDoldKundListItem,
  hideFields,
  unhideFields
};
