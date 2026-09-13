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
  'e-post',
  'Kontaktpersoner'
]);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isEmail(value) {
  const e = normalizeEmail(value);
  return !!(e && e.includes('@') && !e.includes(' '));
}

/**
 * Samlar företagets e-post + kontaktpersoners e-post från kundkortet.
 * @returns {string[]} unika, lower-case adresser
 */
function extractCustomerEmails(fields) {
  const f = fields || {};
  const out = [];
  const seen = new Set();
  const add = (raw) => {
    const e = normalizeEmail(raw);
    if (!isEmail(e) || seen.has(e)) return;
    seen.add(e);
    out.push(e);
  };

  add(f['e-post'] || f.Email || f['E-post'] || f.mailaddress || f.email);

  const raw = f.Kontaktpersoner || f.Befattningshavare || '';
  let people = [];
  if (Array.isArray(raw)) {
    people = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    const s = raw.trim();
    if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) people = parsed;
      } catch (_) {
        people = [];
      }
    }
  }
  for (const p of people) {
    if (!p || typeof p !== 'object') continue;
    add(p.epost || p.email || p['e-post'] || p.Email);
  }
  return out;
}

function mapCustomerRecord(record) {
  const r = record || {};
  const f = r.fields || {};
  const emails = extractCustomerEmails(f);
  return {
    id: r.id,
    namn: String(f.Namn || f['Företagsnamn'] || '').trim() || 'Namnlös kund',
    orgnr: String(f.Orgnr || f.Organisationsnummer || '').trim(),
    /** Primär företagsadress (bakåtkompatibel). */
    email: emails[0] || '',
    /** Alla kända adresser (företag + kontaktpersoner). */
    emails
  };
}

/**
 * Samma access som Mejl-dropdown: direkt ID-koll, annars list-find.
 * listAccessibleCustomers kan bli tom vid fel fields[] – getAccessibleCustomer räddar då.
 */
async function resolveCustomerForSend(user, customerId, deps = {}) {
  const id = String(customerId || '').trim();
  if (!id) return null;
  const { getAccessibleCustomer, listAccessibleCustomers } = deps;

  if (typeof getAccessibleCustomer === 'function') {
    try {
      const direct = await getAccessibleCustomer(user, id);
      if (direct && direct.id) return direct;
    } catch (_) {
      /* fall through to list */
    }
  }

  if (typeof listAccessibleCustomers === 'function') {
    const list = await listAccessibleCustomers(user);
    const found = (list || []).find((c) => c && c.id === id);
    if (found) return found;
  }
  return null;
}

module.exports = {
  SAFE_KUNDDATA_FIELDS,
  normalizeEmail,
  extractCustomerEmails,
  mapCustomerRecord,
  resolveCustomerForSend
};
