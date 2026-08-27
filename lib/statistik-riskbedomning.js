'use strict';

const RiskSkala = require('../public/js/risk-skala');
const Riskaptit = require('./riskaptit');
const access = require('./access');
const KundRiskprofil = require('../public/js/kund-riskprofil');
const EuHogriskLander = require('../public/js/eu-hogrisk-lander');

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
    const bolagsform = String(f['Bolagsform'] || kyc.bolagsform || '').trim();
    if (bolagsform) pushCount(bolagsformAntal, bolagsform);

    const oms = String(f['Omsättning'] || kyc.omsattning || '').trim();
    if (oms) pushCount(omsattningAntal, oms);

    branschLabelsFromRecord(f).forEach((b) => pushCount(branschAntal, b));

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
  const omsattning = toNamedList(omsattningAntal);
  const branscher = toNamedList(branschAntal);
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
  handelslanderFromRecord,
  parseKycJson
};
