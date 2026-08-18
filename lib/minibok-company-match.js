/**
 * Välj rätt KUNDDATA-rad när flera poster delar organisationsnummer.
 * Enskild firma kan finnas både som företagsnamn och personnamn.
 */

function normalizeOrgNr(orgNr) {
  let digits = String(orgNr || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('16')) {
    digits = digits.slice(2);
  }
  if (digits.length > 10) {
    digits = digits.slice(-10);
  }
  return digits;
}

function orgNrVariants(orgNr) {
  const base = normalizeOrgNr(orgNr);
  if (!base) return [];
  const variants = [base];
  if (base.length === 10) {
    const yy = parseInt(base.substring(0, 2), 10);
    const currentYear = new Date().getFullYear() % 100;
    const century = (yy > currentYear ? '19' : '20') + base;
    variants.push(century);
    variants.push(base.replace(/^(\d{6})(\d{4})$/, '$1-$2'));
    variants.push(century.replace(/^(\d{8})(\d{4})$/, '$1-$2'));
  }
  return [...new Set(variants)];
}

/** Airtable-formel som matchar Orgnr oavsett bindestreck, mellanslag och 12-siffrigt personnummer. */
function orgNrAirtableFormula(orgNr) {
  const base = normalizeOrgNr(orgNr);
  if (base.length !== 10) return '';
  const digitsExpr = 'SUBSTITUTE(SUBSTITUTE(SUBSTITUTE({Orgnr}&"","-","")," ",""),"+","")';
  return `OR(RIGHT(${digitsExpr},10)="${base}",FIND("${base}",${digitsExpr})>0)`;
}

const ORG_FIELD_KEYS = [
  'Orgnr',
  'orgnr',
  'Org.nr',
  'Organisationsnummer',
  'Personnummer',
  'personnr',
  'Personnr',
  'Pnr',
];

function recordOrgNr(fields) {
  if (!fields || typeof fields !== 'object') return '';
  for (let i = 0; i < ORG_FIELD_KEYS.length; i++) {
    const raw = fields[ORG_FIELD_KEYS[i]];
    if (raw == null || raw === '') continue;
    const digits = String(raw).replace(/\D/g, '');
    if (digits) return digits;
  }
  const entries = Object.entries(fields);
  for (let i = 0; i < entries.length; i++) {
    const key = String(entries[i][0] || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    if (key !== 'orgnr' && key !== 'organisationsnummer' && key !== 'personnummer' && key !== 'pnr' && key !== 'personnr') {
      continue;
    }
    const digits = String(entries[i][1] == null ? '' : entries[i][1]).replace(/\D/g, '');
    if (digits) return digits;
  }
  return '';
}

function orgNrMatches(recordOrg, target) {
  const a = normalizeOrgNr(recordOrg);
  const b = normalizeOrgNr(target);
  if (!a || !b) return false;
  return a === b || a.endsWith(b) || b.endsWith(a.slice(-10));
}

function recordCustomerName(fields) {
  if (!fields || typeof fields !== 'object') return '';
  return String(
    fields.Namn ||
      fields.Kundnamn ||
      fields.Name ||
      fields['Företagsnamn'] ||
      fields.Foretagsnamn ||
      fields['Kund namn'] ||
      ''
  ).trim();
}

function nameKey(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** 0–1: exakt, omkastade tokens, delsträng eller token-överlapp. */
function nameOverlapScore(a, b) {
  const na = nameKey(a);
  const nb = nameKey(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const sa = na.split(' ').filter(Boolean).sort().join(' ');
  const sb = nb.split(' ').filter(Boolean).sort().join(' ');
  if (sa && sb && sa === sb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.75;
  const ta = na.split(' ').filter((w) => w.length > 1);
  const tb = new Set(nb.split(' ').filter((w) => w.length > 1));
  if (!ta.length || !tb.size) return 0;
  let inter = 0;
  ta.forEach((w) => {
    if (tb.has(w)) inter += 1;
  });
  const union = new Set(ta.concat([...tb])).size;
  return union ? inter / union : 0;
}

function cellText(val) {
  if (val === undefined || val === null || val === '') return '';
  if (Array.isArray(val)) return val.map(cellText).filter(Boolean).join(', ');
  if (typeof val === 'object') {
    const name = val.name || val.Name || val.fullName || val.label || val.text;
    if (name != null && String(name).trim()) return String(name).trim();
    return '';
  }
  return String(val).trim();
}

const GENERIC_PLACEHOLDERS = new Set([
  'beskrivning av kunden',
  'beskrivning',
  'verksamhet',
  'verksamhetsbeskrivning',
  'ange beskrivning',
  'fyll i',
  'n a',
  'na',
  '-',
  '--',
]);

function isPlaceholderText(value, fieldName) {
  const v = nameKey(value);
  if (!v) return true;
  if (GENERIC_PLACEHOLDERS.has(v)) return true;
  if (fieldName && v === nameKey(fieldName)) return true;
  return false;
}

function amlRichnessScore(record) {
  const f = (record && record.fields) || {};
  let score = 0;
  let filled = 0;
  const entries = Object.entries(f);
  for (let i = 0; i < entries.length; i++) {
    const text = cellText(entries[i][1]);
    if (!text || isPlaceholderText(text, entries[i][0])) continue;
    filled += 1;
    score += text.length > 40 ? 2 : 1;
  }
  const risk = cellText(f.Riskniva || f['Risknivå'] || f.Riskklass || f['Sammanlagd riskklass']);
  const kyc = f['KYC-formular (JSON)'] || f['KYC-formular'];
  if (risk && !isPlaceholderText(risk, 'Riskniva')) score += 40;
  if (kyc && String(kyc).trim().length > 8) score += 30;
  if (cellText(f['Riskbedömning utförd datum'] || f['Riskbedomning utford datum'])) score += 15;
  if (cellText(f['KYC UTFÖRD DATUM'] || f['KYC UTFOERD DATUM'])) score += 10;
  score += Math.min(filled, 40);
  return score;
}

/**
 * @param {object[]} records
 * @param {{ orgNr?: string, name?: string, hasAccess?: (record: object) => boolean }} [opts]
 */
function pickBestCompanyRecord(records, opts) {
  const target = normalizeOrgNr(opts && opts.orgNr);
  const nameHint = (opts && opts.name) || '';
  const hasAccess = opts && typeof opts.hasAccess === 'function' ? opts.hasAccess : () => true;
  const list = (Array.isArray(records) ? records : []).filter((r) => {
    if (!r || !hasAccess(r)) return false;
    if (!target) return false;
    return orgNrMatches(recordOrgNr(r.fields), target);
  });
  if (!list.length) return null;
  list.sort((a, b) => {
    const richDiff = amlRichnessScore(b) - amlRichnessScore(a);
    if (richDiff) return richDiff;
    return nameOverlapScore(recordCustomerName(b.fields), nameHint)
      - nameOverlapScore(recordCustomerName(a.fields), nameHint);
  });
  return list[0];
}

/**
 * Banner "ny kund från Minibok" bara när vi skapar en ny KUNDDATA-rad.
 * En kund som redan finns på byrån ska bara länkas.
 */
function shouldQueueMinibokNewCustomerNotice(existingRecord) {
  return !existingRecord;
}

/** Pågående/avslutad (eller saknad status) = redan en riktig Clientflow-kund. */
function isEstablishedClientflowCustomer(fields) {
  const f = fields || {};
  const status = String(f.Kundstatus || '').trim().toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (status === 'lead') return false;
  if (status === 'pagaende kund' || status === 'avslutad' || status === 'pagaende') return true;
  if (!status) {
    return !!(
      f['Riskbedömning utförd datum'] ||
      f.Riskniva ||
      f['sammanlagd risk'] ||
      f.Uppdrag ||
      f['Uppdrag 2'] ||
      f['Uppdraget kan antas']
    );
  }
  return /pagaende|aktiv|avslutad|kund/.test(status);
}

/** Banner bara för riktiga Minibok-leads, inte Pågående kund som MV-BYGG. */
function shouldShowMinibokNewCustomerNotice(fields) {
  if (!fields) return false;
  if (isEstablishedClientflowCustomer(fields)) return false;
  const pending = fields['Minibok pending'];
  return pending === true || pending === 'true';
}

/**
 * Fält att skriva när Minibok synkar mot en redan befintlig Clientflow-kund.
 * Sätter aldrig pending — rensar ev. felaktig pending från tidigare synk.
 */
function existingCustomerSyncFields(existingFields, opts) {
  const f = existingFields || {};
  const out = {};
  const src = f['Minibok källa'] || f['Minibok kalla'] || '';
  if (!src && opts && opts.source) out['Minibok källa'] = String(opts.source);
  if (opts && opts.minibokCompanyId) out['Minibok company id'] = String(opts.minibokCompanyId);
  if (f['Minibok pending'] === true || f['Minibok pending'] === 'true') {
    out['Minibok pending'] = false;
  }
  return out;
}

module.exports = {
  normalizeOrgNr,
  orgNrVariants,
  recordOrgNr,
  orgNrMatches,
  recordCustomerName,
  nameOverlapScore,
  isPlaceholderText,
  amlRichnessScore,
  pickBestCompanyRecord,
  orgNrAirtableFormula,
  shouldQueueMinibokNewCustomerNotice,
  isEstablishedClientflowCustomer,
  shouldShowMinibokNewCustomerNotice,
  existingCustomerSyncFields,
};
