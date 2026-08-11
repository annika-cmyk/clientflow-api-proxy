#!/usr/bin/env node
/**
 * Rättar Deadline/Startdatum på Momsredovisning-körningar enligt SKV
 * (12:e i andra månaden efter perioden, 17:e i jan/aug).
 *
 *   node scripts/fix-moms-run-deadlines.js
 *   node scripts/fix-moms-run-deadlines.js --dry-run
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

(function loadEnv() {
  try { require('dotenv').config({ path: path.join(__dirname, '..', 'env.env') }); } catch (_) {}
  if (!process.env.AIRTABLE_ACCESS_TOKEN) {
    const envPath = path.join(__dirname, '..', 'env.env');
    if (fs.existsSync(envPath)) {
      for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!m) continue;
        if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
    }
  }
})();

const MomsPeriod = require('../public/js/moms-period.js');
const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
const TOKEN = process.env.AIRTABLE_ACCESS_TOKEN;
const RUNS_TABLE = process.env.AIRTABLE_TABLE_UPPDRAG_RUNS_ID || 'tblYB4EUPlmDxodyM';
const UPPDRAG_TABLE = process.env.AIRTABLE_TABLE_UPPDRAG_ID || 'tbl0aE6jNwmAmuON9';
const DRY_RUN = process.argv.includes('--dry-run');

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchAll(tableId, fields, formula) {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${tableId}`;
  const headers = { Authorization: `Bearer ${TOKEN}` };
  let offset = null;
  const out = [];
  do {
    const params = { pageSize: 100, fields };
    if (formula) params.filterByFormula = formula;
    if (offset) params.offset = offset;
    // eslint-disable-next-line no-await-in-loop
    const res = await axios.get(url, { headers, params, timeout: 60000 });
    out.push(...(res.data.records || []));
    offset = res.data.offset || null;
    // eslint-disable-next-line no-await-in-loop
    await sleep(210);
  } while (offset);
  return out;
}

async function main() {
  if (!TOKEN) {
    console.error('AIRTABLE_ACCESS_TOKEN saknas');
    process.exit(1);
  }
  console.log(`Fix moms deadlines (${DRY_RUN ? 'DRY-RUN' : 'LIVE'})`);

  const runs = await fetchAll(RUNS_TABLE, [
    'Typ', 'Frekvens', 'PeriodKey', 'Period Label', 'Deadline', 'Startdatum', 'Status'
  ], 'OR({Typ}="Momsredovisning",FIND("Moms",{Typ}&""))');

  console.log(`Hämtade ${runs.length} momskörningar`);
  let patched = 0;
  let skipped = 0;
  const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

  for (const rr of runs) {
    const f = rr.fields || {};
    const pk = String(f.PeriodKey || '').trim();
    const freq = MomsPeriod.inferFreq(f.Frekvens || '', pk, null);
    if (!pk) { skipped += 1; continue; }
    const expectedDl = MomsPeriod.deadlineIsoFromPeriodKey(pk, freq);
    const expectedSt = MomsPeriod.startIsoFromPeriodKey(pk, freq);
    const expectedLabel = MomsPeriod.displayLabel(pk, freq);
    const curDl = String(f.Deadline || '').slice(0, 10);
    const curSt = String(f.Startdatum || '').slice(0, 10);
    const curLabel = String(f['Period Label'] || '').trim();
    const fields = {};
    if (expectedDl && expectedDl !== curDl) fields.Deadline = expectedDl;
    if (expectedSt && expectedSt !== curSt) fields.Startdatum = expectedSt;
    if (expectedLabel && expectedLabel !== curLabel) fields['Period Label'] = expectedLabel;
    if (!Object.keys(fields).length) { skipped += 1; continue; }
    console.log(`  ${rr.id} ${pk}: ${curDl||'—'} → ${expectedDl}${fields.Startdatum ? `, start ${curSt||'—'} → ${expectedSt}` : ''}`);
    if (!DRY_RUN) {
      // eslint-disable-next-line no-await-in-loop
      await axios.patch(`${`https://api.airtable.com/v0/${BASE_ID}/${RUNS_TABLE}`}/${rr.id}`, {
        fields: { ...fields, Uppdaterad: new Date().toISOString() }
      }, { headers, timeout: 30000 });
      // eslint-disable-next-line no-await-in-loop
      await sleep(220);
    }
    patched += 1;
  }

  // Rätta Uppdrag.Nästa deadline om den matchar den gamla felaktiga +1-månadsregeln
  const uppdrag = await fetchAll(UPPDRAG_TABLE, [
    'Typ', 'Frekvens', 'Startdatum', 'Nästa deadline', 'Första period', 'Status'
  ], '{Typ}="Momsredovisning"');
  let uppdragPatched = 0;
  for (const rec of uppdrag) {
    const f = rec.fields || {};
    const freq = String(f.Frekvens || '').trim() || 'Varje kvartal';
    const firstPk = String(f['Första period'] || '').trim() || MomsPeriod.inferFirstPeriod(f, freq);
    if (!firstPk) continue;
    const curDl = String(f['Nästa deadline'] || '').slice(0, 10);
    if (!curDl) continue;
    // Gammal bugg: deadline = periodslut + 1 månad (i stället för +2)
    const end = MomsPeriod.periodEndFromKey(firstPk, freq);
    if (!end) continue;
    let oldM = end.month + 1;
    let oldY = end.year;
    if (oldM > 12) { oldM = 1; oldY += 1; }
    const oldDay = (oldM === 1 || oldM === 8) ? 17 : 12;
    const oldWrong = `${oldY}-${String(oldM).padStart(2, '0')}-${String(oldDay).padStart(2, '0')}`;
    const correctFirst = MomsPeriod.deadlineIsoFromPeriodKey(firstPk, freq);
    const fields = {};
    if (String(f['Första period'] || '').trim() !== firstPk) fields['Första period'] = firstPk;
    if (curDl === oldWrong && correctFirst && correctFirst !== curDl) {
      fields['Nästa deadline'] = correctFirst;
    }
    if (!Object.keys(fields).length) continue;
    console.log(`  uppdrag ${rec.id}:`, fields);
    if (!DRY_RUN) {
      // eslint-disable-next-line no-await-in-loop
      await axios.patch(`https://api.airtable.com/v0/${BASE_ID}/${UPPDRAG_TABLE}/${rec.id}`, { fields }, { headers, timeout: 30000 });
      // eslint-disable-next-line no-await-in-loop
      await sleep(220);
    }
    uppdragPatched += 1;
  }

  console.log(`\nKlart. Körningar patchade: ${patched}, skippade: ${skipped}. Uppdrag patchade: ${uppdragPatched}.`);
}

main().catch((e) => {
  console.error(e.response?.data || e.message || e);
  process.exit(1);
});
