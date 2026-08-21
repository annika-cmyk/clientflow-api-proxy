/**
 * Beräkna föreslagen residualnivå för alla kunder och jämför mot satt Residual.
 * Skriver INTE över kundResidualRiskprofil / Riskniva — bara underlag.
 * Fyller tomma/avvikande föreslagna fält om --write anges (default: skriv föreslagna fält).
 *
 * Kör: node scripts/kund-foreslagen-rapport.js
 *      node scripts/kund-foreslagen-rapport.js --dry-run
 */
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const KundRiskprofil = require('../public/js/kund-riskprofil');
const RiskSkala = require('../public/js/risk-skala');

const RISK_ASSESSMENT_TABLE = 'Risker kopplad till tjänster';
const OVRIGA_RISKER_TABLE_ID = 'tblWw6tM2YOTYFn2H';
const HIGHLIGHT = [
  /sm[aå]lands\s+metall/i,
  /metalltrading/i
];

const dryRun = process.argv.includes('--dry-run');
const writeProposed = !dryRun;

async function fetchAll(baseId, token, tableId) {
  const rows = [];
  let offset = null;
  do {
    const params = { pageSize: 100 };
    if (offset) params.offset = offset;
    const res = await axios.get(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      params,
      timeout: 20000
    });
    rows.push(...(res.data.records || []));
    offset = res.data.offset || null;
  } while (offset);
  return rows;
}

async function fetchByIds(baseId, token, tableId, ids) {
  const unique = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const out = [];
  for (let i = 0; i < unique.length; i += 8) {
    const chunk = unique.slice(i, i + 8);
    // eslint-disable-next-line no-await-in-loop
    const settled = await Promise.all(chunk.map(async (id) => {
      try {
        const r = await axios.get(
          `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}/${id}`,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 }
        );
        return r.data || null;
      } catch (_) {
        return null;
      }
    }));
    for (const rec of settled) {
      if (rec && rec.id) out.push(rec);
    }
  }
  return out;
}

function collectIds(records) {
  const tjanstIds = new Set();
  const riskIds = new Set();
  for (const rec of records || []) {
    const f = rec.fields || {};
    for (const id of f['Kundens utvalda tjänster'] || []) {
      if (id) tjanstIds.add(String(id));
    }
    for (const id of f['risker kopplat till tjänster'] || []) {
      if (id) riskIds.add(String(id));
    }
  }
  return {
    tjanstIds: [...tjanstIds],
    riskIds: [...riskIds].filter((id) => !tjanstIds.has(id))
  };
}

function rankDiff(a, b) {
  return RiskSkala.riskRank(a) - RiskSkala.riskRank(b);
}

function isHighlight(row) {
  const hay = [row.namn, row.orgnr, row.drivande].join(' ');
  return HIGHLIGHT.some((re) => re.test(hay));
}

function clip(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

async function patchProposed(baseId, token, tableId, rows) {
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`;
  let written = 0;
  for (let i = 0; i < rows.length; i += 10) {
    const chunk = rows.slice(i, i + 10).map((row) => ({
      id: row.id,
      fields: {
        [KundRiskprofil.FIELDS.FORESLAGEN]: row.foreslagen || null,
        [KundRiskprofil.FIELDS.DRIVANDE]: row.drivande || ''
      }
    }));
    // eslint-disable-next-line no-await-in-loop
    await axios.patch(url, { records: chunk, typecast: true }, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 20000
    });
    written += chunk.length;
  }
  return written;
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
  const ids = collectIds(records);
  const [tjanstRecords, riskRecords] = await Promise.all([
    fetchByIds(baseId, token, RISK_ASSESSMENT_TABLE, ids.tjanstIds),
    fetchByIds(baseId, token, OVRIGA_RISKER_TABLE_ID, ids.riskIds)
  ]);

  const compared = records.map((rec) => {
    const f = rec.fields || {};
    const residual = KundRiskprofil.readResidual(f);
    const calc = KundRiskprofil.foreslagenFromLinkedRecords(f, tjanstRecords, riskRecords);
    const foreslagen = calc.niva || '';
    const residualRank = RiskSkala.riskRank(residual);
    const foreslagenRank = RiskSkala.riskRank(foreslagen);
    const diff = residual && foreslagen ? Math.abs(residualRank - foreslagenRank) : 0;
    const foreslagenHogre = !!(foreslagen && residual && foreslagenRank > residualRank);
    return {
      id: rec.id,
      namn: f.Namn || f['Företagsnamn'] || '',
      orgnr: f.Orgnr || f.Organisationsnummer || '',
      byraId: f['Byrå ID'] || '',
      residual: residual || '',
      foreslagen,
      drivande: calc.drivandeFaktor || '',
      product: calc.product,
      avviker: KundRiskprofil.residualAvvikerFranForeslagen(residual, foreslagen),
      riktning: KundRiskprofil.avvikelseRiktning(residual, foreslagen),
      foreslagenHogre,
      rankDiff: diff,
      saknarResidual: !residual,
      saknarForeslagen: !foreslagen,
      avvikelseMotivering: clip(KundRiskprofil.readAvvikelseMotivering(f), 180),
      highlight: false
    };
  });
  compared.forEach((row) => { row.highlight = isHighlight(row); });

  const diffs = compared.filter((row) => row.avviker || row.highlight);
  diffs.sort((a, b) => {
    if (a.highlight !== b.highlight) return a.highlight ? -1 : 1;
    if (a.foreslagenHogre !== b.foreslagenHogre) return a.foreslagenHogre ? -1 : 1;
    if (b.rankDiff !== a.rankDiff) return b.rankDiff - a.rankDiff;
    return String(a.namn).localeCompare(String(b.namn), 'sv');
  });

  const foreslagenHogre = diffs.filter((r) => r.foreslagenHogre);
  let written = 0;
  if (writeProposed) {
    const toWrite = compared.filter((row) => row.foreslagen);
    try {
      written = await patchProposed(baseId, token, tableId, toWrite);
    } catch (e) {
      console.warn('Kunde inte skriva föreslagna fält:', e.response?.data || e.message);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun,
    wroteProposedFields: writeProposed ? written : 0,
    totaltKunder: records.length,
    medForeslagen: compared.filter((r) => r.foreslagen).length,
    saknarForeslagen: compared.filter((r) => r.saknarForeslagen).length,
    saknarResidual: compared.filter((r) => r.saknarResidual).length,
    avviker: diffs.filter((r) => r.avviker).length,
    foreslagenHogreAnSatt: foreslagenHogre.length,
    smalandsMetalltrading: compared.filter(isHighlight),
    kunder: diffs
  };

  const outDir = process.env.KUND_FORESLAGEN_RAPPORT_DIR || '/opt/cursor/artifacts';
  try {
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'kund-foreslagen-rapport.json');
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
