#!/usr/bin/env node
/**
 * Listar kunder där det nya Oacceptabel-golvet slår
 * (Hög-golv från varningstecken + minst två strukturerade poster på Förhöjd+)
 * och jämför mot satt bedömd residual.
 */
try { require('dotenv').config(); } catch (_) { /* optional */ }
const axios = require('axios');
const KundRiskprofil = require('../public/js/kund-riskprofil');

const KUNDDATA = 'KUNDDATA';
const TJANSTER = 'Risker kopplad till tjänster';
const OVRIGA = process.env.OVRIGA_RISKER_TABLE_ID || 'tblWw6tM2YOTYFn2H';

async function fetchAll(token, baseId, table) {
  const records = [];
  let offset = '';
  do {
    let url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?pageSize=100`;
    if (offset) url += `&offset=${encodeURIComponent(offset)}`;
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30000
    });
    records.push(...(res.data.records || []));
    offset = res.data.offset || '';
  } while (offset);
  return records;
}

async function main() {
  const token = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  if (!token) {
    console.log('AIRTABLE_ACCESS_TOKEN saknas — hoppar över live-rapport.');
    return;
  }
  const [kunder, tjanster, ovriga] = await Promise.all([
    fetchAll(token, baseId, KUNDDATA),
    fetchAll(token, baseId, TJANSTER),
    fetchAll(token, baseId, OVRIGA)
  ]);
  const rows = kunder.map((rec) => {
    const f = rec.fields || {};
    if (!KundRiskprofil.beraknaRiskhojandeGolv(f)) return null;
    const calc = KundRiskprofil.foreslagenFromLinkedRecords(f, tjanster, ovriga, {
      allaRiskRecords: ovriga
    });
    if (!calc.golv || calc.golv.skikt !== 'OACCEPTABEL') return null;
    const bedomd = KundRiskprofil.readResidual(f);
    return {
      id: rec.id,
      namn: f.Namn || f['Företagsnamn'] || '',
      orgnr: f.Orgnr || f.Organisationsnummer || '',
      bedomd,
      foreslagen: calc.niva,
      drivandeFaktor: calc.drivandeFaktor,
      avviker: KundRiskprofil.residualAvvikerFranForeslagen(bedomd, calc.niva),
      flaggor: KundRiskprofil.riskhojandeVal(f)
    };
  }).filter(Boolean);
  rows.sort((a, b) => String(a.namn).localeCompare(String(b.namn), 'sv'));
  console.log(JSON.stringify({
    antal: rows.length,
    totalt: kunder.length,
    kunder: rows
  }, null, 2));
}

main().catch((err) => {
  console.error(err.response?.data || err.message);
  process.exit(1);
});
