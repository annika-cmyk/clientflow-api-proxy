'use strict';

const RiskSkala = require('../public/js/risk-skala');
const Riskaptit = require('./riskaptit');
const access = require('./access');
const KundRiskprofil = require('../public/js/kund-riskprofil');
const EuHogriskLander = require('../public/js/eu-hogrisk-lander');
const HogriskSni = require('../public/js/hogrisk-sni.js');

const HOGRISK_BRANSCH_LABELS = new Set(
  HogriskSni.withDefaultPatterns(null).map((p) => String(p.label || '').trim()).filter(Boolean)
);

const REC_ID = /^rec[A-Za-z0-9]{10,}$/;

function emptyStatistik() {
  return {
    antalKunder: 0,
    riskniva: RiskSkala.emptyCounts(),
    antalPepEllerSanktion: 0,
    tjänster: [],
    högriskbransch: [],
    bolagsform: [],
    omsattning: [],
    branscher: [],
    anstallda: [],
    antalKunderHogriskbransch: 0,
    branschKategorier: [],
    omsattningAnstalldaProfil: [],
    risksankande: [],
    handelslander: [],
    antalKunderMedRiskfaktor: 0,
    riskfaktorerPerTyp: [],
    varningsflaggor: [],
    hemvist: []
  };
}

function canBuildForUser(userData) {
  return access.kunddataFilterFormula(userData) !== null;
}

function asValues(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value.flatMap(asValues).filter((v) => v !== '');
  if (typeof value === 'object') {
    const id = value.id || value.recId;
    if (id) return [String(id)];
    const name = value.name || value.Name || value.namn;
    if (name) return [String(name).trim()].filter(Boolean);
    return [];
  }
  const s = String(value).trim();
  return s ? [s] : [];
}

function isRecId(id) {
  return REC_ID.test(String(id || ''));
}

function normalizeHemvistLabel(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  const folded = EuHogriskLander.fold ? EuHogriskLander.fold(s) : s.toLowerCase();
  if (folded === 'sverige' || folded === 'sweden' || folded === 'se') return 'Sverige';
  const hit = EuHogriskLander.findCountry ? EuHogriskLander.findCountry(s) : null;
  return hit ? hit.name : s;
}

function parseKycJson(fields) {
  const raw = fields && fields['KYC-formular (JSON)'];
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try { return JSON.parse(String(raw)) || {}; } catch (_) { return {}; }
}

function foldLabel(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function pushCount(map, label) {
  const namn = String(label || '').trim();
  if (!namn || namn === '---') return;
  map[namn] = (map[namn] || 0) + 1;
}

function normalizeBolagsform(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const folded = foldLabel(s);
  if (
    folded === 'ab'
    || folded === 'aktiebolag'
    || folded === 'privat aktiebolag'
    || folded === 'publikt aktiebolag'
  ) {
    return 'Aktiebolag';
  }
  if (
    folded === 'ef'
    || folded === 'enskild firma'
    || folded === 'enskild näringsverksamhet'
    || folded === 'enskild näringsidkare'
    || folded === 'fysisk person'
    || folded === 'fysiska personer'
  ) {
    return 'Enskild firma';
  }
  return s;
}

function parseAnstallda(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s || /^(vet inte|okänd|okant|—|-)$/i.test(s)) return null;
  const n = parseInt(s.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function anstalldaBucket(n) {
  if (n == null) return 'Okänt antal anställda';
  if (n === 0) return 'Inga anställda';
  if (n <= 4) return '1–4 anställda';
  return '5 eller fler anställda';
}

const OMSATTNING_STANDARD = [
  '0–200 000 kr',
  '200 000–1 500 000 kr',
  '1 500 000–10 000 000 kr',
  'Över 10 000 000 kr'
];

const ANSTALLDA_STANDARD = [
  'Inga anställda',
  '1–4 anställda',
  '5 eller fler anställda',
  'Okänt antal anställda'
];

function omsattningBucket(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return 'Okänd omsättning';
  const folded = s.toLowerCase().replace(/\s+/g, ' ');
  if (/10\s*000\s*000|10\s*milj|>\s*10/.test(folded)) return 'Över 10 miljoner kr';
  if (/1\s*500\s*000|1,5\s*milj/.test(folded) && /10\s*000\s*000|10\s*milj/.test(folded)) {
    return '1,5–10 miljoner kr';
  }
  if (/200\s*000|0.?200/.test(folded) && /1\s*500\s*000|1,5\s*milj/.test(folded)) {
    return '200 000–1,5 miljoner kr';
  }
  if (/0.?200|under 200|0–200|0-200/.test(folded)) return '0–200 000 kr';
  if (/1\s*500\s*000|1,5\s*milj/.test(folded)) return '1,5–10 miljoner kr';
  if (/200\s*000/.test(folded)) return '200 000–1,5 miljoner kr';
  return s.length > 48 ? `${s.slice(0, 45)}…` : s;
}

function normalizeOmsattningLabel(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return 'Okänd omsättning';
  if (OMSATTNING_STANDARD.includes(s)) return s;
  const bucket = omsattningBucket(s);
  const map = {
    '0–200 000 kr': '0–200 000 kr',
    '200 000–1,5 miljoner kr': '200 000–1 500 000 kr',
    '1,5–10 miljoner kr': '1 500 000–10 000 000 kr',
    'Över 10 miljoner kr': 'Över 10 000 000 kr',
    'Okänd omsättning': 'Okänd omsättning'
  };
  return map[bucket] || bucket;
}

function omsattningLabelForRecord(fields) {
  const f = fields || {};
  const kyc = parseKycJson(f);
  return normalizeOmsattningLabel(f['Omsättning'] || kyc.omsattning || '');
}

function anstalldaLabelForRecord(fields) {
  const kyc = parseKycJson(fields || {});
  return anstalldaBucket(parseAnstallda(kyc.anstallda));
}

function recordMatchesOmsattningStat(fields, paramNamn) {
  const sok = String(paramNamn == null ? '' : paramNamn).trim();
  if (!sok) return false;
  const f = fields || {};
  const kyc = parseKycJson(f);
  const raw = String(f['Omsättning'] || kyc.omsattning || '').trim();
  if (raw && (raw === sok || foldLabel(raw) === foldLabel(sok))) return true;
  return omsattningLabelForRecord(f) === sok;
}

function recordMatchesAnstalldaStat(fields, paramNamn) {
  const sok = String(paramNamn == null ? '' : paramNamn).trim();
  if (!sok) return false;
  return anstalldaLabelForRecord(fields) === sok;
}

function sortOmsattningRows(rows) {
  const order = [...OMSATTNING_STANDARD, 'Okänd omsättning'];
  return [...(rows || [])].sort((a, b) => {
    const ai = order.indexOf(a.namn);
    const bi = order.indexOf(b.namn);
    if (ai !== -1 || bi !== -1) {
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    }
    return b.antal - a.antal || a.namn.localeCompare(b.namn, 'sv');
  });
}

function sortAnstalldaRows(rows) {
  const order = ANSTALLDA_STANDARD;
  return [...(rows || [])].sort((a, b) => {
    const ai = order.indexOf(a.namn);
    const bi = order.indexOf(b.namn);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

function broadCategoryFromLabel(label) {
  const s = String(label || '').toLowerCase();
  if (/bygg|snickeri|anlägg|murer|elinstall|vvs|måleri/.test(s)) return 'Bygg och anläggning';
  if (/handel|detalj|partih|e-handel|butik|gross/.test(s)) return 'Handel';
  if (/restaurang|café|bar|hotell|catering/.test(s)) return 'Restaurang och hotell';
  if (/konsult|rådgiv|it-|program|data|mjukvara/.test(s)) return 'Konsult och IT';
  if (/redovis|bokför|revisor|ekonomi/.test(s)) return 'Redovisning och ekonomi';
  if (/fastig|mäkl|hyres/.test(s)) return 'Fastighet';
  if (/transport|åkeri|logistik|frakt/.test(s)) return 'Transport och logistik';
  if (/hälsa|vård|tand|läk/.test(s)) return 'Hälso- och sjukvård';
  if (/industri|tillverk|verkstad|produktion/.test(s)) return 'Industri och tillverkning';
  if (/jord|skog|lantbruk|lantbruk/.test(s)) return 'Jord- och skogsbruk';
  return 'Övriga branscher';
}

function branschCategoriesForRecord(fields) {
  const f = fields || {};
  const cats = new Set();
  asValues(f['Kunden verkar i en högriskbransch']).forEach((b) => {
    const namn = String(b || '').trim();
    if (namn && namn !== '---') cats.add(namn);
  });
  const sniRaw = HogriskSni.sniRawFromFields ? HogriskSni.sniRawFromFields(f) : '';
  HogriskSni.matchSni(sniRaw).branscher.forEach((b) => cats.add(b));
  if (!cats.size) {
    const labels = branschLabelsFromRecord(f);
    if (labels.length) cats.add(broadCategoryFromLabel(labels[0]));
    else cats.add('Övriga branscher');
  }
  return cats;
}

function customerHasHogriskbransch(fields) {
  const f = fields || {};
  const tagged = asValues(f['Kunden verkar i en högriskbransch']).some((b) => b && b !== '---');
  if (tagged) return true;
  const sniRaw = HogriskSni.sniRawFromFields ? HogriskSni.sniRawFromFields(f) : '';
  return HogriskSni.matchSni(sniRaw).branscher.length > 0;
}

function branschLabelsFromRecord(fields) {
  const f = fields || {};
  const kyc = parseKycJson(f);
  const labels = [];
  asValues(f['Kunden verkar i en högriskbransch']).forEach((v) => labels.push(v));
  asValues(f['SNI kod'] || f['SNI-koder'] || f['SNI-bransch'] || f['Bransch']).forEach((v) => labels.push(v));
  if (kyc.bransch) labels.push(kyc.bransch);
  const seen = {};
  return labels.map((v) => String(v || '').trim()).filter((namn) => {
    if (!namn || namn === '---') return false;
    const key = foldLabel(namn);
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function handelslanderFromRecord(fields) {
  const f = fields || {};
  const kyc = parseKycJson(f);
  const internationell = String(
    kyc.internationellHandel || f['Har företaget transaktioner med andra länder?'] || ''
  ).trim();
  if (!internationell || /^nej$/i.test(internationell)) return [];
  const raw = kyc.internationellaLander || kyc.internationella_lander || '';
  if (!raw) return ['Internationell handel (land ej angivet)'];
  return String(raw)
    .split(/[,;\n]+/)
    .map((s) => {
      const hit = EuHogriskLander.findCountry ? EuHogriskLander.findCountry(s.trim()) : null;
      return hit ? hit.name : s.trim();
    })
    .filter(Boolean);
}

function hemvistLabelsFromRecord(fields) {
  const f = fields || {};
  const labels = [];
  const kyc = parseKycJson(f);
  labels.push(kyc.skatterattslig_hemvist_foretag || '');
  labels.push(kyc.skatterattslig_hemvist_foretradare || '');
  const people = []
    .concat(Array.isArray(kyc.foretradare) ? kyc.foretradare : [])
    .concat(Array.isArray(kyc.huvudman) ? kyc.huvudman : []);
  people.forEach((p) => {
    labels.push((p && (p.skatterattslig_hemvist || p.hemvist)) || '');
  });
  asValues(f['Skatterättslig hemvist']).forEach((v) => labels.push(v));
  const seen = {};
  return labels.map(normalizeHemvistLabel).filter((namn) => {
    if (!namn) return false;
    const key = namn.toLowerCase();
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function isPepEllerSanktion(fields) {
  const f = fields || {};
  const pepList = asValues(f.PEP);
  const arPep = pepList.some((v) => v && String(v).trim() !== 'Inte PEP');
  const traffar = parseInt(f['Antal träffar PEP och sanktionslistor'], 10) || 0;
  return !!(arPep || traffar > 0);
}

function collectLookupIds(records) {
  const tjanstIds = new Set();
  const riskfaktorIds = new Set();
  for (const rec of records || []) {
    const f = rec && rec.fields;
    for (const id of asValues(f && f['Kundens utvalda tjänster'])) {
      if (isRecId(id)) tjanstIds.add(id);
    }
    for (const id of asValues(f && f['risker kopplat till tjänster'])) {
      if (isRecId(id)) riskfaktorIds.add(id);
    }
  }
  return { tjanstIds: [...tjanstIds], riskfaktorIds: [...riskfaktorIds] };
}

function mapTjanstNames(tjanstRecords) {
  const map = {};
  for (const rec of tjanstRecords || []) {
    if (!rec || !rec.id) continue;
    const namn = String(
      (rec.fields && (rec.fields['Task Name'] || rec.fields.Namn || rec.fields.Name)) || ''
    ).trim();
    if (namn) map[rec.id] = namn;
  }
  return map;
}

function mapRiskfaktorMeta(riskfaktorRecords) {
  const map = {};
  for (const rec of riskfaktorRecords || []) {
    if (!rec || !rec.id) continue;
    const f = rec.fields || {};
    map[rec.id] = {
      namn: String(f.Riskfaktor || '').trim() || rec.id,
      typ: String(f['Typ av riskfaktor'] || '').trim() || 'Övriga'
    };
  }
  return map;
}

function aggregateStatistik(records, lookups) {
  const list = Array.isArray(records) ? records : [];
  const opts = lookups || {};
  const tjanstIdToName = opts.tjanstIdToName || mapTjanstNames(opts.tjanstRecords);
  const riskfaktorMeta = opts.riskfaktorMeta || mapRiskfaktorMeta(opts.riskfaktorRecords);

  const riskniva = RiskSkala.emptyCounts();
  const tjänstAntal = {};
  const högriskbranschAntal = {};
  const bolagsformAntal = {};
  const omsattningAntal = {};
  const branschAntal = {};
  const branschKategoriAntal = {};
  const anstalldaAntal = {};
  const omsAnstalldaAntal = {};
  let antalKunderHogriskbransch = 0;
  const risksankandeAntal = {};
  const handelslanderAntal = {};
  const riskfaktorIdAntal = {};
  const varningsflaggaAntal = {};
  const hemvistAntal = {};
  let antalKunderMedRiskfaktor = 0;
  let antalPepEllerSanktion = 0;

  for (const rec of list) {
    const f = (rec && rec.fields) || {};
    const rn = Riskaptit.resolveResidualNiva(f);
    if (rn) RiskSkala.countRisk(riskniva, rn);

    for (const id of asValues(f['Kundens utvalda tjänster'])) {
      tjänstAntal[id] = (tjänstAntal[id] || 0) + 1;
    }

    for (const b of asValues(f['Kunden verkar i en högriskbransch'])) {
      if (b && b !== '---') högriskbranschAntal[b] = (högriskbranschAntal[b] || 0) + 1;
    }

    const kyc = parseKycJson(f);
    const bolagsform = normalizeBolagsform(f['Bolagsform'] || kyc.bolagsform || '');
    if (bolagsform) pushCount(bolagsformAntal, bolagsform);

    pushCount(omsattningAntal, omsattningLabelForRecord(f));

    branschLabelsFromRecord(f).forEach((b) => pushCount(branschAntal, b));

    if (customerHasHogriskbransch(f)) antalKunderHogriskbransch += 1;
    branschCategoriesForRecord(f).forEach((cat) => pushCount(branschKategoriAntal, cat));

    const ansN = parseAnstallda(kyc.anstallda);
    pushCount(anstalldaAntal, anstalldaBucket(ansN));
    const omsBucket = omsattningLabelForRecord(f);
    const ansBucket = anstalldaBucket(ansN);
    const profKey = `${omsBucket}\0${ansBucket}`;
    omsAnstalldaAntal[profKey] = (omsAnstalldaAntal[profKey] || 0) + 1;

    const sank = asValues(f['Risksänkande faktorer']);
    for (const s of sank) {
      const namn = String(s || '').trim();
      if (!namn || /^inga$/i.test(namn)) continue;
      pushCount(risksankandeAntal, namn);
    }

    handelslanderFromRecord(f).forEach((land) => pushCount(handelslanderAntal, land));

    const riskIds = asValues(f['risker kopplat till tjänster']);
    if (riskIds.length) antalKunderMedRiskfaktor += 1;
    for (const rid of riskIds) {
      riskfaktorIdAntal[rid] = (riskfaktorIdAntal[rid] || 0) + 1;
    }

    if (isPepEllerSanktion(f)) antalPepEllerSanktion += 1;

    hemvistLabelsFromRecord(f).forEach((namn) => {
      hemvistAntal[namn] = (hemvistAntal[namn] || 0) + 1;
    });

    const flags = KundRiskprofil && KundRiskprofil.riskhojandeVal
      ? KundRiskprofil.riskhojandeVal(f)
      : asValues(f['Riskhöjande faktorer övrigt']);
    for (const flag of flags) {
      const namn = KundRiskprofil && KundRiskprofil.canonicalRiskhojandeLabel
        ? KundRiskprofil.canonicalRiskhojandeLabel(flag)
        : String(flag || '').trim();
      if (!namn || namn === '---' || namn.toLowerCase() === 'inga') continue;
      varningsflaggaAntal[namn] = (varningsflaggaAntal[namn] || 0) + 1;
    }
  }

  const tjanstByName = {};
  for (const [id, antal] of Object.entries(tjänstAntal)) {
    let namn = String(tjanstIdToName[id] || '').trim();
    if (!namn && isRecId(id)) continue;
    if (!namn) namn = String(id);
    tjanstByName[namn] = (tjanstByName[namn] || 0) + antal;
  }
  const tjänster = Object.entries(tjanstByName)
    .map(([namn, antal]) => ({ namn, antal }))
    .sort((a, b) => b.antal - a.antal);

  const högriskbransch = Object.entries(högriskbranschAntal)
    .map(([namn, antal]) => ({ namn, antal }))
    .sort((a, b) => b.antal - a.antal);

  function toNamedList(map) {
    return Object.entries(map)
      .map(([namn, antal]) => ({ namn, antal }))
      .sort((a, b) => b.antal - a.antal || a.namn.localeCompare(b.namn, 'sv'));
  }

  const bolagsform = toNamedList(bolagsformAntal);
  const omsattning = sortOmsattningRows(toNamedList(omsattningAntal));
  const branscher = toNamedList(branschAntal);
  const anstallda = sortAnstalldaRows(toNamedList(anstalldaAntal));
  const branschKategorier = toNamedList(branschKategoriAntal).map((row) => ({
    ...row,
    hogrisk: HOGRISK_BRANSCH_LABELS.has(row.namn) || Boolean(högriskbranschAntal[row.namn])
  }));
  const omsattningAnstalldaProfil = Object.entries(omsAnstalldaAntal)
    .map(([key, antal]) => {
      const [omsattning, anstalldaLabel] = key.split('\0');
      return { omsattning, anstallda: anstalldaLabel, antal };
    })
    .sort((a, b) => b.antal - a.antal || a.omsattning.localeCompare(b.omsattning, 'sv'));
  const risksankande = toNamedList(risksankandeAntal);
  const handelslander = toNamedList(handelslanderAntal);

  const typToCustomerIds = {};
  for (const rec of list) {
    const ids = asValues(rec && rec.fields && rec.fields['risker kopplat till tjänster']);
    for (const rid of ids) {
      const t = (riskfaktorMeta[rid] && riskfaktorMeta[rid].typ) || 'Övriga';
      if (!typToCustomerIds[t]) typToCustomerIds[t] = new Set();
      typToCustomerIds[t].add(rec.id);
    }
  }

  const typToRiskfaktorer = {};
  for (const [id, antal] of Object.entries(riskfaktorIdAntal)) {
    const meta = riskfaktorMeta[id] || {};
    const typ = meta.typ || 'Övriga';
    const namn = meta.namn || id;
    if (!typToRiskfaktorer[typ]) typToRiskfaktorer[typ] = [];
    typToRiskfaktorer[typ].push({ id, namn, antal });
  }
  for (const arr of Object.values(typToRiskfaktorer)) {
    arr.sort((a, b) => b.antal - a.antal);
  }

  const riskfaktorerPerTyp = Object.keys(typToRiskfaktorer)
    .map((typ) => ({
      typ,
      antalKunder: (typToCustomerIds[typ] || new Set()).size,
      riskfaktorer: typToRiskfaktorer[typ] || []
    }))
    .sort((a, b) => b.antalKunder - a.antalKunder);

  const varningsflaggor = Object.entries(varningsflaggaAntal)
    .map(([namn, antal]) => ({ namn, antal }))
    .sort((a, b) => b.antal - a.antal || a.namn.localeCompare(b.namn, 'sv'));

  const hemvist = Object.entries(hemvistAntal)
    .map(([namn, antal]) => {
      const klass = EuHogriskLander.classifyOne ? EuHogriskLander.classifyOne(namn) : {};
      return {
        namn,
        antal,
        badge: namn === 'Sverige' ? 'Närområde' : (klass.badge || ''),
        niva: namn === 'Sverige' ? 'Låg' : (klass.niva || '')
      };
    })
    .sort((a, b) => b.antal - a.antal || a.namn.localeCompare(b.namn, 'sv'));

  return {
    antalKunder: list.length,
    riskniva,
    antalPepEllerSanktion,
    tjänster,
    högriskbransch,
    bolagsform,
    omsattning,
    branscher,
    anstallda,
    antalKunderHogriskbransch,
    branschKategorier,
    omsattningAnstalldaProfil,
    risksankande,
    handelslander,
    antalKunderMedRiskfaktor,
    riskfaktorerPerTyp,
    varningsflaggor,
    hemvist
  };
}

module.exports = {
  emptyStatistik,
  canBuildForUser,
  asValues,
  isPepEllerSanktion,
  collectLookupIds,
  aggregateStatistik,
  normalizeHemvistLabel,
  hemvistLabelsFromRecord,
  branschLabelsFromRecord,
  branschCategoriesForRecord,
  customerHasHogriskbransch,
  normalizeBolagsform,
  omsattningBucket,
  normalizeOmsattningLabel,
  omsattningLabelForRecord,
  anstalldaLabelForRecord,
  recordMatchesOmsattningStat,
  recordMatchesAnstalldaStat,
  sortOmsattningRows,
  sortAnstalldaRows,
  anstalldaBucket,
  parseAnstallda,
  handelslanderFromRecord,
  parseKycJson
};
