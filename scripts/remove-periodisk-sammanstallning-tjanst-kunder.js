#!/usr/bin/env node
/**
 * Engångskörning: tar bort «Inlämning periodisk sammanställning» från utvalda kunder.
 * Påverkar inte framtida val i tjänstlistan.
 *
 * Kör: node scripts/remove-periodisk-sammanstallning-tjanst-kunder.js --dry-run
 *      node scripts/remove-periodisk-sammanstallning-tjanst-kunder.js
 */
require('dotenv').config();
const axios = require('axios');
const TjanstKatalog = require('../public/js/tjanst-katalog');

const RISK_ASSESSMENT_TABLE = 'Risker kopplad till tjänster';
const TARGET_KUNDER = [
  'Gehricke, Andreas',
  'Anoteket AB',
  'Nordic Fashiontech AB',
  'Edlén, Bengt',
  'RealEco Media',
  'Håkansson, Adam',
  'Svensson, Magnus'
];

const dryRun = process.argv.includes('--dry-run');

function foldName(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .normalize('NFC')
    .replace(/\s+/g, ' ');
}

function isPeriodiskSammanstallningTjanst(namn) {
  const key = foldName(namn);
  if (!key) return false;
  if (key === 'inlämning periodisk sammanställning') return true;
  return /periodisk\s+sammanst/.test(key);
}

function resolveTjanstNamn(raw, index) {
  const hit = TjanstKatalog.matchValue(raw, index);
  let namn = hit.catalogNamn || hit.resolvedNamn || hit.proposed || '';
  if (!namn && hit.status === 'unknown-id' && index.byId && index.byId[raw]) {
    namn = index.byId[raw].namn || '';
  }
  if (!namn) namn = hit.raw;
  return namn;
}

function removePeriodiskSammanstallningTjanster(values, catalog) {
  const index = catalog && catalog.byId ? catalog : TjanstKatalog.catalogFromRecords(catalog);
  return TjanstKatalog.asValues(values).filter(
    (raw) => !isPeriodiskSammanstallningTjanst(resolveTjanstNamn(raw, index))
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchKunderByNamn(baseId, token, tableName, namn) {
  const formula = encodeURIComponent(`{Namn}="${String(namn).replace(/"/g, '\\"')}"`);
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?filterByFormula=${formula}&pageSize=10`;
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 20000
  });
  return res.data.records || [];
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

  const catalogCache = {};
  let updated = 0;
  let skipped = 0;
  let missing = 0;

  for (const targetNamn of TARGET_KUNDER) {
    // eslint-disable-next-line no-await-in-loop
    const records = await fetchKunderByNamn(baseId, token, tableName, targetNamn);
    if (!records.length) {
      console.warn(`Hittade ingen kund med namn «${targetNamn}»`);
      missing += 1;
      continue;
    }
    if (records.length > 1) {
      console.warn(`Flera träffar för «${targetNamn}» — uppdaterar alla ${records.length} poster`);
    }

    for (const rec of records) {
      const f = rec.fields || {};
      const namn = f.Namn || targetNamn;
      const existing = TjanstKatalog.asValues(f['Kundens utvalda tjänster']);
      if (!existing.length) {
        console.log(`Hoppar ${namn}: inga valda tjänster`);
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
      const cleaned = removePeriodiskSammanstallningTjanster(existing, catalog);

      if (cleaned.length === existing.length) {
        console.log(`Hoppar ${namn}: periodisk sammanställning fanns inte bland valda tjänster`);
        skipped += 1;
        continue;
      }

      console.log(`${dryRun ? '[dry-run] ' : ''}Tar bort periodisk sammanställning från ${namn} (${existing.length} → ${cleaned.length} tjänster)`);
      // eslint-disable-next-line no-await-in-loop
      await patchKund(baseId, token, tableName, rec.id, { 'Kundens utvalda tjänster': cleaned });
      updated += 1;
      // eslint-disable-next-line no-await-in-loop
      await sleep(220);
    }
  }

  console.log(`Klart. ${updated} kunder uppdaterade, ${skipped} utan ändring, ${missing} saknade.`);
}

main().catch((err) => {
  console.error(err.response?.data || err.message);
  process.exit(1);
});
