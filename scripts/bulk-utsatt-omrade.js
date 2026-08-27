/**
 * Engångskörning: kontrollera alla kundadresser mot Polisens utsatta områden.
 * Sparar resultat i fältet "Utsatt område (JSON)" och kan koppla geografisk riskfaktor.
 *
 * Kör: node scripts/bulk-utsatt-omrade.js
 *      node scripts/bulk-utsatt-omrade.js --dry-run
 *      node scripts/bulk-utsatt-omrade.js --byra-id=BYRA123
 *      node scripts/bulk-utsatt-omrade.js --skip-risk-link
 */
require('dotenv').config();
const axios = require('axios');
const utsattKund = require('../lib/utsatta-omraden-kund');
const utsattStyrning = require('../lib/utsatt-omrade-styrning');

const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';
const OVRIGA_RISKER_TABLE_ID = 'tblWw6tM2YOTYFn2H';
const DELAY_MS = 1100;

const dryRun = process.argv.includes('--dry-run');
const skipRiskLink = process.argv.includes('--skip-risk-link');
const byraFilter = (process.argv.find((a) => a.startsWith('--byra-id=')) || '').split('=')[1] || '';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAllKunder(baseId, token) {
  const rows = [];
  let offset = null;
  do {
    const params = { pageSize: 100 };
    if (offset) params.offset = offset;
    // eslint-disable-next-line no-await-in-loop
    const res = await axios.get(`https://api.airtable.com/v0/${baseId}/${KUNDDATA_TABLE}`, {
      headers: { Authorization: `Bearer ${token}` },
      params,
      timeout: 30000
    });
    rows.push(...(res.data.records || []));
    offset = res.data.offset || null;
  } while (offset);
  return rows;
}

async function fetchByraRisker(baseId, token, byraId) {
  const formula = encodeURIComponent(`{Byrå ID}="${String(byraId).replace(/"/g, '\\"')}"`);
  const rows = [];
  let offset = null;
  do {
    let url = `https://api.airtable.com/v0/${baseId}/${OVRIGA_RISKER_TABLE_ID}?filterByFormula=${formula}&pageSize=100`;
    if (offset) url += `&offset=${encodeURIComponent(offset)}`;
    // eslint-disable-next-line no-await-in-loop
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 20000
    });
    rows.push(...(res.data.records || []));
    offset = res.data.offset || null;
  } while (offset);
  return rows;
}

async function patchKund(baseId, token, id, fields) {
  if (dryRun) return { id, fields };
  const url = `https://api.airtable.com/v0/${baseId}/${KUNDDATA_TABLE}/${id}`;
  const res = await axios.patch(url, { fields, typecast: true }, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    timeout: 20000
  });
  return res.data;
}

async function main() {
  const token = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  if (!token) {
    console.error('Saknar AIRTABLE_ACCESS_TOKEN');
    process.exit(1);
  }

  let records = await fetchAllKunder(baseId, token);
  if (byraFilter) {
    records = records.filter((rec) => String(rec.fields?.['Byrå ID'] || '').trim() === byraFilter);
  }

  const withAddress = records.filter((rec) => utsattKund.customerAddressFromFields(rec.fields));
  console.log(`Hittade ${records.length} kunder, ${withAddress.length} med adress.`);

  const geoCache = {};
  let checked = 0;
  let updated = 0;
  let trff = 0;
  let skipped = 0;
  let errors = 0;

  for (const rec of withAddress) {
    const addr = utsattKund.customerAddressFromFields(rec.fields);
    const prev = utsattKund.parseStored(rec.fields?.[utsattKund.FIELD]);
    if (!utsattKund.shouldRecheck(prev, addr, true)) {
      skipped += 1;
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    await sleep(DELAY_MS);
    try {
      // eslint-disable-next-line no-await-in-loop
      const json = await utsattKund.checkAndSerialize(addr, { force: true });
      const stored = utsattKund.parseStored(json);
      checked += 1;
      if (stored.trff) trff += 1;

      const patchFields = { [utsattKund.FIELD]: json };
      if (!skipRiskLink) {
        const byraId = String(rec.fields?.['Byrå ID'] || '').trim();
        if (byraId) {
          if (!geoCache[byraId]) {
            // eslint-disable-next-line no-await-in-loop
            geoCache[byraId] = utsattStyrning.geoRecordsFromList(await fetchByraRisker(baseId, token, byraId));
          }
          const before = rec.fields?.['risker kopplat till tjänster'] || [];
          const after = utsattStyrning.mergeLinkedIds(before, geoCache[byraId], stored);
          if (utsattStyrning.linkedIdsChanged(before, after)) {
            patchFields['risker kopplat till tjänster'] = after;
          }
        }
      }

      // eslint-disable-next-line no-await-in-loop
      await patchKund(baseId, token, rec.id, patchFields);
      updated += 1;
      const namn = String(rec.fields?.Namn || rec.fields?.Kundnamn || rec.id).trim();
      console.log(`${dryRun ? '[dry-run] ' : ''}${namn}: ${stored.trff ? utsattKund.summaryLabel(stored) : 'ingen träff'}`);
    } catch (err) {
      errors += 1;
      console.error(`Fel för ${rec.id}:`, err.response?.data || err.message);
    }
  }

  console.log('\nKlart.');
  console.log(`Kontrollerade: ${checked}, uppdaterade: ${updated}, träffar: ${trff}, hoppade över: ${skipped}, fel: ${errors}${dryRun ? ' (dry-run)' : ''}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
