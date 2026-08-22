'use strict';

const TjanstKatalog = require('../public/js/tjanst-katalog');
const RiskDimensioner = require('../public/js/risk-dimensioner');
const RiskSkala = require('../public/js/risk-skala');

function byraIdOf(recOrFields) {
  const f = (recOrFields && recOrFields.fields) || recOrFields || {};
  return String(f['Byrå ID'] || f.Byrå || '').trim();
}

function filterByByra(records, byraId) {
  if (!byraId) return Array.isArray(records) ? records : [];
  return (records || []).filter((rec) => byraIdOf(rec) === String(byraId));
}

function indexByByra(records) {
  const map = new Map();
  (records || []).forEach((rec) => {
    const id = byraIdOf(rec);
    if (!id) return;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(rec);
  });
  return map;
}

function kundNamn(fields) {
  return String((fields && (fields.Namn || fields['Företagsnamn'] || fields.Name)) || '').trim();
}

function kundOrgnr(fields) {
  return String((fields && (fields.Orgnr || fields.Organisationsnummer)) || '').trim();
}

function ptTfOfTemplate(rec) {
  const f = (rec && rec.fields) || rec || {};
  const scored = RiskSkala.readOvrigRisk ? RiskSkala.readOvrigRisk(f) : {};
  return RiskSkala.normalizePtTf(scored.ptTfRelevans || f['PT/TF-relevans'] || '');
}

function nameLookup(tjanster) {
  const map = {};
  (tjanster || []).forEach((rec) => {
    const namn = String((rec.fields && rec.fields['Task Name']) || rec.namn || '').trim();
    if (rec && rec.id && namn) map[rec.id] = namn;
  });
  return map;
}

function tjanstRapport(kunder, tjanster, allTjanster) {
  const catalogs = indexByByra(tjanster);
  const fallback = TjanstKatalog.catalogFromRecords(tjanster);
  const idLookup = nameLookup(allTjanster || tjanster);
  const rader = [];
  for (const rec of kunder || []) {
    const f = rec.fields || {};
    const byraId = byraIdOf(rec);
    const catalog = byraId && catalogs.has(byraId)
      ? TjanstKatalog.catalogFromRecords(catalogs.get(byraId))
      : fallback;
    const classified = TjanstKatalog.classifyCustomerServices(
      f['Kundens utvalda tjänster'],
      catalog,
      { idLookup }
    );
    if (!classified.unmatched.length) continue;
    rader.push({
      id: rec.id,
      namn: kundNamn(f),
      orgnr: kundOrgnr(f),
      byraId,
      normalize: classified.normalize.map((hit) => ({
        fran: hit.resolvedNamn || hit.raw,
        till: hit.proposed,
        typ: hit.status
      })),
      askAnnika: classified.askAnnika.map((hit) => hit.resolvedNamn || hit.raw),
      unknown: classified.unknown.map((hit) => hit.resolvedNamn || hit.raw)
    });
  }
  rader.sort((a, b) => String(a.namn).localeCompare(String(b.namn), 'sv'));
  const katalogNamn = [...new Set((tjanster || []).map((rec) => {
    const f = rec.fields || rec;
    return String(f['Task Name'] || rec.namn || '').trim();
  }).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'sv'));
  return {
    katalog: katalogNamn,
    antalKunder: rader.length,
    kunder: rader
  };
}

function ptTfRapport(templates) {
  const saknas = [];
  for (const rec of templates || []) {
    const f = rec.fields || {};
    if (ptTfOfTemplate(rec)) continue;
    saknas.push({
      id: rec.id,
      namn: String(f.Riskfaktor || f.Namn || '').trim(),
      typ: String(f['Typ av riskfaktor'] || '').trim(),
      typNormaliserad: RiskDimensioner.normalizeTyp(f['Typ av riskfaktor']),
      byraId: byraIdOf(rec)
    });
  }
  saknas.sort((a, b) => String(a.typ).localeCompare(String(b.typ), 'sv')
    || String(a.namn).localeCompare(String(b.namn), 'sv'));
  return {
    antal: saknas.length,
    totalt: (templates || []).length,
    mallar: saknas
  };
}

function dimensionRapport(kunder, templates) {
  const byByra = indexByByra(templates);
  const rader = [];
  for (const rec of kunder || []) {
    const f = rec.fields || {};
    const byraId = byraIdOf(rec);
    const byraTemplates = byraId && byByra.has(byraId) ? byByra.get(byraId) : (templates || []);
    const linkedIds = new Set(TjanstKatalog.asValues(f['risker kopplat till tjänster']));
    const linked = byraTemplates.filter((t) => linkedIds.has(t.id));
    const status = RiskDimensioner.assessCustomerDimensions({
      fields: f,
      linkedRiskRecords: linked,
      byraTemplates: byraTemplates
    });
    if (status.komplett) continue;
    rader.push({
      id: rec.id,
      namn: kundNamn(f),
      orgnr: kundOrgnr(f),
      byraId,
      saknade: status.saknade,
      varning: status.varning
    });
  }
  rader.sort((a, b) => b.saknade.length - a.saknade.length
    || String(a.namn).localeCompare(String(b.namn), 'sv'));
  return {
    antal: rader.length,
    totalt: (kunder || []).length,
    kunder: rader
  };
}

function samladKundlista({ tjanst, dimensioner }) {
  const byId = new Map();
  function upsert(row, extra) {
    const cur = byId.get(row.id) || {
      id: row.id,
      namn: row.namn,
      orgnr: row.orgnr,
      luckor: [],
      antalLuckor: 0
    };
    extra.forEach((lucka) => cur.luckor.push(lucka));
    cur.antalLuckor = cur.luckor.length;
    byId.set(row.id, cur);
  }
  for (const row of (tjanst && tjanst.kunder) || []) {
    const luckor = [];
    (row.normalize || []).forEach((n) => luckor.push(`Tjänst "${n.fran}" → "${n.till}"`));
    (row.askAnnika || []).forEach((n) => luckor.push(`Tjänst "${n}" (fråga Annika om katalog)`));
    (row.unknown || []).forEach((n) => luckor.push(`Tjänst "${n}" saknas i katalogen`));
    upsert(row, luckor);
  }
  for (const row of (dimensioner && dimensioner.kunder) || []) {
    upsert(row, (row.saknade || []).map((d) => `Saknar ${d}`));
  }
  return [...byId.values()].sort((a, b) => b.antalLuckor - a.antalLuckor
    || String(a.namn).localeCompare(String(b.namn), 'sv'));
}

function buildStrukturellaLuckor({ kunder, tjanster, ovriga, byraId } = {}) {
  const scopedKunder = byraId ? filterByByra(kunder, byraId) : (kunder || []);
  const scopedTjanster = byraId ? filterByByra(tjanster, byraId) : (tjanster || []);
  const scopedOvriga = byraId ? filterByByra(ovriga, byraId) : (ovriga || []);
  const tjanst = tjanstRapport(scopedKunder, scopedTjanster, tjanster);
  const pttf = ptTfRapport(scopedOvriga);
  const dimensioner = dimensionRapport(scopedKunder, scopedOvriga);
  const samlad = samladKundlista({ tjanst, dimensioner });
  return {
    generatedAt: new Date().toISOString(),
    byraId: byraId || null,
    totaltKunder: scopedKunder.length,
    tjanst,
    pttf,
    dimensioner,
    samlad: {
      antal: samlad.length,
      kunder: samlad
    }
  };
}

module.exports = {
  byraIdOf,
  filterByByra,
  kundNamn,
  tjanstRapport,
  ptTfRapport,
  dimensionRapport,
  samladKundlista,
  buildStrukturellaLuckor
};
