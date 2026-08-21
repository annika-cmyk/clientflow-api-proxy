#!/usr/bin/env node
/**
 * Listar kunder där bedömd residual är lägre än Hög-golvet
 * från Riskhöjande faktorer övrigt.
 */
try { require('dotenv').config(); } catch (_) { /* optional */ }
const axios = require('axios');
const KundRiskprofil = require('../public/js/kund-riskprofil');

const TABLE = 'KUNDDATA';

async function fetchAll(token, baseId) {
  const records = [];
  let offset = '';
  do {
    let url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(TABLE)}?pageSize=100`;
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
  const records = await fetchAll(token, baseId);
  const rows = records.map((rec) => {
    const f = rec.fields || {};
    const hit = KundRiskprofil.golvSkulleHojaBedomd(f);
    if (!hit) return null;
    return {
      id: rec.id,
      namn: f.Namn || f['Företagsnamn'] || '',
      orgnr: f.Orgnr || f.Organisationsnummer || '',
      bedomd: hit.bedomd || '',
      golvNiva: hit.golvNiva,
      drivandeFaktor: hit.drivandeFaktor,
      flaggor: KundRiskprofil.riskhojandeVal(f)
    };
  }).filter(Boolean);
  rows.sort((a, b) => String(a.namn).localeCompare(String(b.namn), 'sv'));
  console.log(JSON.stringify({ antal: rows.length, totalt: records.length, kunder: rows }, null, 2));
}

main().catch((err) => {
  console.error(err.response?.data || err.message);
  process.exit(1);
});
