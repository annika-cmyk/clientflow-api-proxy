'use strict';

const TjanstKatalog = require('../public/js/tjanst-katalog');
const RiskDimensioner = require('../public/js/risk-dimensioner');
const RiskSkala = require('../public/js/risk-skala');

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

function tjanstRapport(kunder, tjanster) {
  const catalog = TjanstKatalog.catalogFromRecords(tjanster);
  const rader = [];
  for (const rec of kunder || []) {
    const f = rec.fields || {};
    const classified = TjanstKatalog.classifyCustomerServices(f['Kundens utvalda tjänster'], catalog);
    if (!classified.unmatched.length) continue;
    rader.push({
      id: rec.id,
      namn: kundNamn(f),
      orgnr: kundOrgnr(f),
      normalize: classified.normalize.map((hit) => ({
        fran: hit.raw,
        till: hit.proposed,
        typ: hit.status
      })),
      askAnnika: classified.askAnnika.map((hit) => hit.raw),
      unknown: classified.unknown.map((hit) => hit.raw)
    });
  }
  rader.sort((a, b) => String(a.namn).localeCompare(String(b.namn), 'sv'));
  return {
    katalog: catalog.items.map((item) => item.namn),
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
      typNormaliserad: RiskDimensioner.normalizeTyp(f['Typ av riskfaktor'])
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
  const rader = [];
  for (const rec of kunder || []) {
    const f = rec.fields || {};
    const linkedIds = new Set(TjanstKatalog.asValues(f['risker kopplat till tjänster']));
    const linked = (templates || []).filter((t) => linkedIds.has(t.id));
    const status = RiskDimensioner.assessCustomerDimensions({
      fields: f,
      linkedRiskRecords: linked,
      byraTemplates: templates
    });
    if (status.komplett) continue;
    rader.push({
      id: rec.id,
      namn: kundNamn(f),
      orgnr: kundOrgnr(f),
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

function buildStrukturellaLuckor({ kunder, tjanster, ovriga }) {
  const tjanst = tjanstRapport(kunder, tjanster);
  const pttf = ptTfRapport(ovriga);
  const dimensioner = dimensionRapport(kunder, ovriga);
  const samlad = samladKundlista({ tjanst, dimensioner });
  return {
    generatedAt: new Date().toISOString(),
    totaltKunder: (kunder || []).length,
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
  kundNamn,
  tjanstRapport,
  ptTfRapport,
  dimensionRapport,
  samladKundlista,
  buildStrukturellaLuckor
};
