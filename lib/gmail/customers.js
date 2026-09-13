/**
 * Kundmappning för Gmail (inkorg/etiketter/skicka).
 * Fältlistan måste spegla verkliga KUNDDATA-fält – okända fields[] ger 422 i Airtable.
 */

/** Fält som finns i KUNDDATA och behövs för matchning/behörighet. */
const SAFE_KUNDDATA_FIELDS = Object.freeze([
  'Namn',
  'Orgnr',
  'Byrå ID',
  'Användare',
  'e-post'
]);

function mapCustomerRecord(record) {
  const r = record || {};
  const f = r.fields || {};
  return {
    id: r.id,
    namn: String(f.Namn || f['Företagsnamn'] || '').trim() || 'Namnlös kund',
    orgnr: String(f.Orgnr || f.Organisationsnummer || '').trim(),
    email: String(f['e-post'] || f.Email || f['E-post'] || f.mailaddress || '').trim()
  };
}

/**
 * Resolve kund för /api/gmail/send.
 * Prioriterar direkt ID-access (samma som dropdown) framför full lista.
 */
async function resolveCustomerForSend(user, customerId, deps = {}) {
  const id = String(customerId || '').trim();
  if (!id) return null;
  const { getAccessibleCustomer, listAccessibleCustomers } = deps;
  if (typeof getAccessibleCustomer === 'function') {
    const direct = await getAccessibleCustomer(user, id);
    if (direct) return direct;
  }
  if (typeof listAccessibleCustomers === 'function') {
    const customers = await listAccessibleCustomers(user);
    return (customers || []).find((c) => c && c.id === id) || null;
  }
  return null;
}

module.exports = {
  SAFE_KUNDDATA_FIELDS,
  mapCustomerRecord,
  resolveCustomerForSend
};
