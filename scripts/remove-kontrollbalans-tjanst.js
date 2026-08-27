#!/usr/bin/env node
/**
 * Engångskörning: tar bort «Upprätta kontrollbalansräkning» från alla kunder utom ENA Operations.
 * Påverkar inte framtida val i tjänstlistan — bara rensar befintliga kopplingar i Airtable.
 *
 * Kör: node scripts/remove-kontrollbalans-tjanst.js --dry-run
 *      node scripts/remove-kontrollbalans-tjanst.js
 */
require('dotenv').config();
const axios = require('axios');
const TjanstKatalog = require('../public/js/tjanst-katalog');
const TjanstKundbegransning = require('../lib/tjanst-kundbegransning');

const RISK_ASSESSMENT_TABLE = 'Risker kopplad till tjänster';
const dryRun = process.argv.includes('--dry-run');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAllKunder(baseId, token, tableName) {
  const rows = [];
  let offset = null;
  do {
    const params = { pageSize: 100 };
    if (offset) params.offset = offset;
    // eslint-disable-next-line no-await-in-loop
    const res = await axios.get(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`, {
      headers: { Authorization: `Bearer ${token}` },
      params,
      timeout: 30000
    });
    rows.push(...(res.data.records || []));
    offset = res.data.offset || null;
  } while (offset);
  return rows;
}

async function fetchByraTjanster(baseId, token, byraId) {
  const formula = encodeURIComponent(`{Byrå ID}="${String(byraId).replace(/"/g, '\\"')}"`);
  const rows = [];
  let offset = null;
  do {
    let url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(RISK_ASSESSMENT_TABLE)}?filterByFormula=${formula}&fields[]=Task%20Name&fields[]=Aktuell&pageSize=100`;
    if (offset) url += `&offset=${encodeURIComponent(offset)}`;
    // eslint-disable-next-line no-await-in-loop
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 20000
    });
    rows.push(...(res.data.records || []));
    offset = res.data.offset || null;
  } while (offset);
  return rows.map((rec) => ({
    id: rec.id,
    namn: (rec.fields?.['Task Name'] || rec.fields?.Namn || '').trim(),
    aktuell: rec.fields?.Aktuell === true
  }));
}

function cleanedTjanster(existing, catalog, customerNamn) {
  const normalized = catalog.length
    ? TjanstKatalog.sanitizeToActiveCatalogIds(existing, catalog)
    : TjanstKatalog.asValues(existing);
  return TjanstKundbegransning.filterKundTjansterIds(
    normalized,
    catalog,
    customerNamn,
    TjanstKatalog
  );
}

function sameIdList(a, b) {
  const left = TjanstKatalog.asValues(a);
  const right = TjanstKatalog.asValues(b);
  if (left.length !== right.length) return false;
  return left.every((id, i) => id === right[i]);
}

async function patchKund(baseId, token, tableName, id, fields) {
  if (dryRun) return { id, fields };
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${id}`;
  const res = await axios.patch(url, { fields, typecast: true }, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    timeout: 20000
  });
  return res.data;
}

async function main() {
  const token = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  const tableName = process.env.AIRTABLE_TABLE_NAME || 'Kunder';
  if (!token) {
    console.error('Saknar AIRTABLE_ACCESS_TOKEN');
    process.exit(1);
  }

  const records = await fetchAllKunder(baseId, token, tableName);
  const catalogCache = {};
  let updated = 0;
  let skipped = 0;
  let keptEna = 0;

  for (const rec of records) {
    const f = rec.fields || {};
    const namn = f.Namn || '';
    const existing = TjanstKatalog.asValues(f['Kundens utvalda tjänster']);
    if (!existing.length) {
      skipped += 1;
      continue;
    }

    if (TjanstKundbegransning.customerMayHaveKontrollbalans(namn)) {
      keptEna += 1;
      skipped += 1;
      continue;
    }

    const byraId = String(f['Byrå ID'] || '').trim();
    if (byraId && !catalogCache[byraId]) {
      try {
        // eslint-disable-next-line no-await-in-loop
        catalogCache[byraId] = await fetchByraTjanster(baseId, token, byraId);
      } catch (err) {
        console.warn(`Kunde inte hämta tjänster för byrå ${byraId}:`, err.message);
        catalogCache[byraId] = [];
      }
    }
    const catalog = catalogCache[byraId] || [];
    const cleaned = cleanedTjanster(existing, catalog, namn);

    if (sameIdList(cleaned, existing)) {
      skipped += 1;
      continue;
    }

    console.log(`${dryRun ? '[dry-run] ' : ''}Tar bort kontrollbalansräkning från ${namn || rec.id} (${existing.length} → ${cleaned.length} tjänster)`);
    // eslint-disable-next-line no-await-in-loop
    await patchKund(baseId, token, tableName, rec.id, { 'Kundens utvalda tjänster': cleaned });
    updated += 1;
    // eslint-disable-next-line no-await-in-loop
    await sleep(220);
  }

  console.log(`Klart. ${updated} kunder rensade, ${keptEna} ENA Operations oförändrade, ${skipped - keptEna} övriga utan ändring.`);
}

main().catch((err) => {
  console.error(err.response?.data || err.message);
  process.exit(1);
});
