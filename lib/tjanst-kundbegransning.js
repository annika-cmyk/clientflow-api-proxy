/**
 * Tjänster som bara får kopplas till vissa kunder.
 */

function foldName(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .normalize('NFC')
    .replace(/\s+/g, ' ');
}

const KONTROLLBALANS_KEYS = [
  'upprätta kontrollbalansräkning',
  'upprätta kontrollbalansrakning'
];

function isKontrollbalansNamn(namn) {
  const key = foldName(namn);
  if (!key) return false;
  if (KONTROLLBALANS_KEYS.includes(key)) return true;
  return key.includes('kontrollbalans');
}

function customerMayHaveKontrollbalans(customerNamn) {
  return foldName(customerNamn).includes('ena operations');
}

function mayKeepTjanstForCustomer(tjanstNamn, customerNamn) {
  if (!isKontrollbalansNamn(tjanstNamn)) return true;
  return customerMayHaveKontrollbalans(customerNamn);
}

function mayShowTjanstForCustomer(tjanstNamn, customerNamn) {
  return mayKeepTjanstForCustomer(tjanstNamn, customerNamn);
}

/**
 * Filtrera kundens tjänst-ID:n mot kundspecifika begränsningar.
 */
function filterKundTjansterIds(ids, catalog, customerNamn, TjanstKatalog) {
  const TK = TjanstKatalog;
  if (!TK || !Array.isArray(ids) || !ids.length) return ids || [];
  if (customerMayHaveKontrollbalans(customerNamn)) return ids;

  const index = catalog && catalog.byId ? catalog : TK.catalogFromRecords(catalog);
  return TK.asValues(ids).filter((raw) => {
    const hit = TK.matchValue(raw, index);
    let namn = hit.catalogNamn || hit.resolvedNamn || hit.proposed || '';
    if (!namn && hit.status === 'unknown-id' && index.byId && index.byId[raw]) {
      namn = index.byId[raw].namn || '';
    }
    if (!namn) namn = hit.raw;
    return mayKeepTjanstForCustomer(namn, customerNamn);
  });
}

module.exports = {
  foldName,
  isKontrollbalansNamn,
  customerMayHaveKontrollbalans,
  mayKeepTjanstForCustomer,
  mayShowTjanstForCustomer,
  filterKundTjansterIds
};
