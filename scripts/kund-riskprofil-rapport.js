/**
 * Lista kunder som saknar explicit vald bedömd residualrisk.
 * Gissar inte nivåer från gammal fritext — Annika sätter värdena manuellt.
 *
 * Kör: node scripts/kund-riskprofil-rapport.js
 */
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const KundRiskprofil = require('../public/js/kund-riskprofil');

const HIGHLIGHT = [
  /mikael\s+borgstr[oö]m/i,
  /arkitektur/i,
  /behance/i,
  /grafisk\s+design/i
];

async function fetchAll(baseId, token, tableId) {
  const rows = [];
  let offset = null;
  do {
    const params = { pageSize: 100 };
    if (offset) params.offset = offset;
    const res = await axios.get(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
      headers: { Authorization: `Bearer ${token}` },
      params,
      timeout: 20000
    });
    rows.push(...(res.data.records || []));
    offset = res.data.offset || null;
  } while (offset);
  return rows;
}

function isHighlight(row) {
  const hay = [row.namn, row.orgnr, row.motiveringUtdrag].join(' ');
  return HIGHLIGHT.some((re) => re.test(hay));
}

function clip(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

async function main() {
  const token = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  const tableId = process.env.AIRTABLE_TABLE_KUNDDATA_ID || 'tblOIuLQS2DqmOQWe';
  if (!token) {
    console.error('AIRTABLE_ACCESS_TOKEN saknas – kan inte hämta kunder.');
    process.exit(2);
  }
  const records = await fetchAll(baseId, token, tableId);
  const missing = records.map((rec) => {
    const f = rec.fields || {};
    const residual = KundRiskprofil.readResidual(f);
    const motivering = KundRiskprofil.readMotivering(f) || String(f.Motivering || '').trim();
    return {
      id: rec.id,
      namn: f.Namn || f['Företagsnamn'] || '',
      orgnr: f.Orgnr || f.Organisationsnummer || '',
      byraId: f['Byrå ID'] || '',
      residual: residual || '',
      saknarResidual: !residual,
      motiveringUtdrag: clip(motivering, 180)
    };
  }).filter((row) => row.saknarResidual);

  missing.sort((a, b) => {
    const ha = isHighlight(a) ? 0 : 1;
    const hb = isHighlight(b) ? 0 : 1;
    if (ha !== hb) return ha - hb;
    return String(a.namn).localeCompare(String(b.namn), 'sv');
  });

  const report = {
    generatedAt: new Date().toISOString(),
    totaltKunder: records.length,
    saknarExplicitProfil: missing.length,
    saknarResidual: missing.filter((r) => r.saknarResidual).length,
    prioriterade: missing.filter(isHighlight),
    kunder: missing
  };

  const outDir = process.env.KUND_RISKPROFIL_RAPPORT_DIR || '/opt/cursor/artifacts';
  try {
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'kund-riskprofil-saknas.json');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log('Skrev ' + outPath);
  } catch (e) {
    console.warn('Kunde inte skriva artifact-fil:', e.message);
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err.response?.data || err.message);
  process.exit(1);
});
