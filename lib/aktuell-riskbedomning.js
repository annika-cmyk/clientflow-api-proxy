const dokumentKategori = require('./dokument-kategori');
const dokumentRiskSubkategori = require('./dokument-risk-subkategori');
const kycDokumentSync = require('./kyc-dokument-sync');

const AKTUELL_RISK_CATEGORY = dokumentRiskSubkategori.AKTUELL_RISK_CATEGORY;
const ENTITY_DATUM_FIELDS = ['Entity screening datum', 'PEP entity screening datum'];
const SCREENING_MAX_YEARS = 1;

const MISSING_LABELS = {
  kund_riskbedomning: 'Kundens riskbedömning saknas i dokumentationen',
  kyc_signerat: 'Signerat KYC-formulär saknas i aktuell riskbedömning',
  entity_screening: 'PEP/sanktionssökning på företaget saknas eller är äldre än ett år',
  person_screening: 'PEP/sanktionssökning saknas eller är äldre än ett år för en eller flera personer'
};

function parseKontaktpersoner(raw) {
  if (Array.isArray(raw)) return raw.filter((p) => p && typeof p === 'object');
  const s = String(raw || '').trim();
  if (!s) return [];
  try {
    if (s.startsWith('[')) {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed.filter((p) => p && typeof p === 'object') : [];
    }
  } catch (_) {
    return [];
  }
  return s.split('\n').map((r) => r.trim()).filter(Boolean).map((r) => {
    const parts = r.split(/[;,|]/).map((x) => x.trim());
    return { namn: parts[0] || r, roller: parts.slice(1) };
  });
}

function getRollerList(p) {
  if (!p) return [];
  if (Array.isArray(p.roller)) return p.roller;
  if (p.roll) return [p.roll];
  return [];
}

function isRollerForetag(p) {
  const roller = getRollerList(p).map((r) => String(r || '').trim().toLowerCase());
  if (roller.some((r) => r === 'företag med ägarandelar')) return true;
  const namn = String(p?.namn || '').trim();
  if (!namn) return false;
  return /\b(ab|aktiebolag|hb|kb|llc|ltd|inc|gmbh|oy|as|asa|bv|s\.?a\.?|ag|plc|corp\.?|company)\b/i.test(namn);
}

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

function parseKategorier(raw) {
  return dokumentKategori.parseDokumentKategorier(raw);
}

function entrySubcategory(entry) {
  return dokumentRiskSubkategori.normalizeSubcategory(entry?.subcategory)
    || dokumentRiskSubkategori.normalizeSubcategory(
      dokumentRiskSubkategori.inferSubcategoryFromAttachment({ filename: entry?.filename }, entry)
    );
}

function isAktuellRiskEntry(entry) {
  const cat = String(entry?.category || entry?.kategori || '').trim();
  return cat === AKTUELL_RISK_CATEGORY;
}

function hasAktuellRiskDoc(kategorier, subcategory) {
  const sub = dokumentRiskSubkategori.normalizeSubcategory(subcategory);
  return parseKategorier(kategorier).some((entry) =>
    entry && typeof entry === 'object' && isAktuellRiskEntry(entry) && entrySubcategory(entry) === sub
  );
}

function hasSignedKycInAktuell(fields) {
  const kategorier = parseKategorier(fields?.['Dokumentation Kategorier']);
  const kycDocs = kategorier.filter((entry) =>
    entry && typeof entry === 'object' && isAktuellRiskEntry(entry) && entrySubcategory(entry) === 'kyc'
  );
  if (!kycDocs.length) return false;

  const kyc = kycDokumentSync.parseSavedKyc(fields);
  const statusSigned = String(kyc.status || '').trim() === 'Signerat';

  return kycDocs.some((entry) => {
    const fn = String(entry.filename || entry.displayName || '').toLowerCase();
    if (fn.includes('signerat') || fn.includes('kyc-signerat')) return true;
    if (statusSigned) return true;
    return false;
  });
}

function entityScreeningFresh(fields, today) {
  return ENTITY_DATUM_FIELDS.some((key) =>
    isWithinMaxYears(fields?.[key], SCREENING_MAX_YEARS, today)
  );
}

function personsNeedingScreening(fields) {
  const persons = parseKontaktpersoner(fields?.Kontaktpersoner || fields?.Befattningshavare);
  return persons.filter((p) => !isRollerForetag(p));
}

function personsScreeningFresh(fields, today) {
  const persons = personsNeedingScreening(fields);
  if (!persons.length) return true;
  return persons.every((p) => isWithinMaxYears(p.pepSoktDatum, SCREENING_MAX_YEARS, today));
}

function assessAktuellRiskbedomning(fields, today) {
  const f = fields && typeof fields === 'object' ? fields : {};
  const day = dokumentKategori.toDateOnly(today) || new Date().toISOString().slice(0, 10);
  const missing = [];

  if (!hasAktuellRiskDoc(f['Dokumentation Kategorier'], 'kund_riskbedomning')) {
    missing.push('kund_riskbedomning');
  }
  if (!hasSignedKycInAktuell(f)) {
    missing.push('kyc_signerat');
  }
  if (!entityScreeningFresh(f, day)) {
    missing.push('entity_screening');
  }
  if (!personsScreeningFresh(f, day)) {
    missing.push('person_screening');
  }

  return {
    complete: missing.length === 0,
    missing,
    missingLabels: missing.map((key) => MISSING_LABELS[key] || key)
  };
}

function saknarAktuellRiskbedomning(fields, today) {
  return !assessAktuellRiskbedomning(fields, today).complete;
}

function dashboardRowFromRecord(rec, today) {
  const f = rec?.fields || rec || {};
  const assess = assessAktuellRiskbedomning(f, today);
  return {
    id: rec.id,
    namn: f.Namn || f['Företagsnamn'] || 'Namn saknas',
    organisationsnummer: f.Orgnr || f.Organisationsnummer || '',
    bolagsform: f.Bolagsform || '',
    missing: assess.missing,
    missingLabels: assess.missingLabels
  };
}

module.exports = {
  MISSING_LABELS,
  SCREENING_MAX_YEARS,
  parseKontaktpersoner,
  isRollerForetag,
  hasAktuellRiskDoc,
  hasSignedKycInAktuell,
  entityScreeningFresh,
  personsScreeningFresh,
  assessAktuellRiskbedomning,
  saknarAktuellRiskbedomning,
  dashboardRowFromRecord
};
