'use strict';

const RiskSkala = require('../public/js/risk-skala');
const Riskaptit = require('./riskaptit');
const access = require('./access');

const REC_ID = /^rec[A-Za-z0-9]{10,}$/;

function emptyStatistik() {
  return {
    antalKunder: 0,
    riskniva: RiskSkala.emptyCounts(),
    antalPepEllerSanktion: 0,
    tjänster: [],
    högriskbransch: [],
    antalKunderMedRiskfaktor: 0,
    riskfaktorerPerTyp: []
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
  const riskfaktorIdAntal = {};
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

    const riskIds = asValues(f['risker kopplat till tjänster']);
    if (riskIds.length) antalKunderMedRiskfaktor += 1;
    for (const rid of riskIds) {
      riskfaktorIdAntal[rid] = (riskfaktorIdAntal[rid] || 0) + 1;
    }

    if (isPepEllerSanktion(f)) antalPepEllerSanktion += 1;
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

  return {
    antalKunder: list.length,
    riskniva,
    antalPepEllerSanktion,
    tjänster,
    högriskbransch,
    antalKunderMedRiskfaktor,
    riskfaktorerPerTyp
  };
}

module.exports = {
  emptyStatistik,
  canBuildForUser,
  asValues,
  isPepEllerSanktion,
  collectLookupIds,
  aggregateStatistik
};
