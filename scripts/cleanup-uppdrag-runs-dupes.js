#!/usr/bin/env node
/**
 * Tar bort dubbletter i Uppdragskörningar.
 * Nyckel: Uppdrag ID + PeriodKey. Behåller bästa raden (Klar > övriga, senast uppdaterad).
 *
 * Kör:
 *   node scripts/cleanup-uppdrag-runs-dupes.js           # utför radering
 *   node scripts/cleanup-uppdrag-runs-dupes.js --dry-run # bara räkna
 *
 * Env: AIRTABLE_ACCESS_TOKEN, AIRTABLE_BASE_ID, valfritt AIRTABLE_TABLE_UPPDRAG_RUNS_ID
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Ladda env.env om dotenv/process saknar token
(function loadEnv() {
  try { require('dotenv').config(); } catch (_) {}
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

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
const TOKEN = process.env.AIRTABLE_ACCESS_TOKEN;
const TABLE_ID = process.env.AIRTABLE_TABLE_UPPDRAG_RUNS_ID || 'tblYB4EUPlmDxodyM';
const DRY_RUN = process.argv.includes('--dry-run');
const MAX_DELETE = (() => {
  const i = process.argv.indexOf('--max-delete');
  if (i >= 0 && process.argv[i + 1]) return Math.max(0, parseInt(process.argv[i + 1], 10) || 0);
  return 0; // 0 = unlimited
})();

const STATUS_RANK = { Klar: 4, Sen: 3, Pågående: 2, Planerad: 1 };

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickBest(records) {
  const list = Array.isArray(records) ? records.slice() : [];
  if (!list.length) return null;
  list.sort((a, b) => {
    const af = a.fields || {};
    const bf = b.fields || {};
    const aUid = String(af['Uppdrag ID'] || '').trim();
    const aPk = String(af['PeriodKey'] || '').trim();
    const expected = aUid && aPk ? `${aUid}:${aPk}` : '';
    const aKey = String(af['Run Key'] || '').trim();
    const bKey = String(bf['Run Key'] || '').trim();
    const aStatus = STATUS_RANK[String(af['Status'] || '').trim()] || 0;
    const bStatus = STATUS_RANK[String(bf['Status'] || '').trim()] || 0;
    if (aStatus !== bStatus) return bStatus - aStatus;
    if (expected) {
      if (aKey === expected && bKey !== expected) return -1;
      if (bKey === expected && aKey !== expected) return 1;
    }
    if (aKey && !bKey) return -1;
    if (!aKey && bKey) return 1;
    const aUpd = String(af['Uppdaterad'] || af['Skapad'] || '');
    const bUpd = String(bf['Uppdaterad'] || bf['Skapad'] || '');
    // Nyare först
    return bUpd.localeCompare(aUpd);
  });
  return list[0];
}

async function fetchAllRuns() {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;
  const headers = { Authorization: `Bearer ${TOKEN}` };
  const groups = new Map();
  let offset = null;
  let total = 0;
  let pages = 0;
  const t0 = Date.now();

  do {
    const params = {
      pageSize: 100,
      fields: [
        'Run Key',
        'Uppdrag ID',
        'PeriodKey',
        'Status',
        'Deadline',
        'Skapad',
        'Uppdaterad'
      ]
    };
    if (offset) params.offset = offset;
    let res;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        res = await axios.get(url, { headers, params, timeout: 60000 });
        break;
      } catch (e) {
        const status = e.response?.status;
        if (status === 429 || status >= 500) {
          const wait = Math.min(30000, 1000 * 2 ** attempt);
          console.warn(`  fetch retry ${attempt + 1} after ${status || e.message}, wait ${wait}ms`);
          // eslint-disable-next-line no-await-in-loop
          await sleep(wait);
          continue;
        }
        throw e;
      }
    }
    if (!res) throw new Error('Kunde inte hämta körningar efter retries');

    const records = res.data.records || [];
    for (const rr of records) {
      const f = rr.fields || {};
      const uid = String(f['Uppdrag ID'] || '').trim();
      const pk = String(f['PeriodKey'] || '').trim();
      if (!uid || !pk) continue;
      const key = `${uid}:${pk}`;
      const arr = groups.get(key) || [];
      arr.push(rr);
      groups.set(key, arr);
    }
    total += records.length;
    pages += 1;
    offset = res.data.offset || null;
    if (pages % 25 === 0 || !offset) {
      console.log(`  hämtat ${total} rader (${pages} sidor, ${groups.size} unika nycklar) – ${Date.now() - t0}ms`);
    }
    // Airtable ~5 rps
    // eslint-disable-next-line no-await-in-loop
    await sleep(210);
  } while (offset);

  return { groups, total, pages };
}

async function deleteOne(id, headers) {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${encodeURIComponent(id)}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await axios.delete(url, { headers, timeout: 60000 });
      return 'deleted';
    } catch (e) {
      const status = e.response?.status;
      const type = e.response?.data?.error?.type || '';
      const msg = e.response?.data?.error?.message || e.message;
      // Redan borta = OK
      if (status === 404 || type === 'NOT_FOUND' || /Could not find a record/i.test(String(msg))) {
        return 'missing';
      }
      if (status === 429 || status >= 500) {
        const wait = Math.min(60000, 1500 * 2 ** attempt);
        // eslint-disable-next-line no-await-in-loop
        await sleep(wait);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`Kunde inte ta bort ${id}`);
}

async function deleteBatch(ids) {
  const headers = { Authorization: `Bearer ${TOKEN}` };
  const qs = ids.map((id) => `records[]=${encodeURIComponent(id)}`).join('&');
  const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?${qs}`;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await axios.delete(url, { headers, timeout: 60000 });
      return { deleted: ids.length, missing: 0, errors: 0 };
    } catch (e) {
      const status = e.response?.status;
      const type = e.response?.data?.error?.type || '';
      const msg = e.response?.data?.error?.message || e.message;
      if (status === 429 || status >= 500) {
        const wait = Math.min(60000, 1500 * 2 ** attempt);
        console.warn(`  delete retry ${attempt + 1} after ${status || msg}, wait ${wait}ms`);
        // eslint-disable-next-line no-await-in-loop
        await sleep(wait);
        continue;
      }
      // Om en rad i batchen saknas fallerar hela batchen – radera en och en.
      if (status === 404 || type === 'NOT_FOUND' || /Could not find a record/i.test(String(msg))) {
        let deleted = 0;
        let missing = 0;
        let errors = 0;
        for (const id of ids) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const result = await deleteOne(id, headers);
            if (result === 'deleted') deleted += 1;
            else missing += 1;
            // eslint-disable-next-line no-await-in-loop
            await sleep(120);
          } catch (_) {
            errors += 1;
          }
        }
        return { deleted, missing, errors };
      }
      throw e;
    }
  }
  throw new Error(`Kunde inte ta bort batch: ${ids.join(',')}`);
}

async function main() {
  if (!TOKEN) {
    console.error('❌ AIRTABLE_ACCESS_TOKEN saknas');
    process.exit(1);
  }
  console.log(`🧹 Dedupe Uppdragskörningar (${DRY_RUN ? 'DRY-RUN' : 'LIVE'})`);
  console.log(`   base=${BASE_ID} table=${TABLE_ID}`);

  const { groups, total, pages } = await fetchAllRuns();
  let dupGroups = 0;
  let toDelete = [];
  let keepCount = 0;
  const statusKept = {};

  for (const [, arr] of groups) {
    if (!arr.length) continue;
    const keep = pickBest(arr);
    if (!keep) continue;
    keepCount += 1;
    const st = String(keep.fields?.['Status'] || '') || '(tom)';
    statusKept[st] = (statusKept[st] || 0) + 1;
    if (arr.length < 2) continue;
    dupGroups += 1;
    for (const rr of arr) {
      if (rr.id !== keep.id) toDelete.push(rr.id);
    }
  }

  console.log('\n📊 Sammanfattning');
  console.log(`   Totalt hämtade rader:     ${total} (${pages} sidor)`);
  console.log(`   Unika Uppdrag+Period:     ${groups.size}`);
  console.log(`   Grupper med dubbletter:   ${dupGroups}`);
  console.log(`   Rader att behålla:        ${keepCount}`);
  console.log(`   Rader att ta bort:        ${toDelete.length}`);
  console.log(`   Behållna status:          ${JSON.stringify(statusKept)}`);

  if (!toDelete.length) {
    console.log('\n✅ Inga dubbletter att ta bort.');
    return;
  }

  if (DRY_RUN) {
    console.log('\n🔎 DRY-RUN – inget raderades. Kör utan --dry-run för att ta bort.');
    return;
  }

  if (MAX_DELETE > 0 && toDelete.length > MAX_DELETE) {
    console.log(`\n⚠️  Begränsar radering till --max-delete=${MAX_DELETE}`);
    toDelete = toDelete.slice(0, MAX_DELETE);
  }

  console.log(`\n🗑️  Raderar ${toDelete.length} dubbletter (batch om 10)...`);
  const t1 = Date.now();
  let deleted = 0;
  let missing = 0;
  let errors = 0;
  for (let i = 0; i < toDelete.length; i += 10) {
    const batch = toDelete.slice(i, i + 10);
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await deleteBatch(batch);
      deleted += result.deleted || 0;
      missing += result.missing || 0;
      errors += result.errors || 0;
    } catch (e) {
      errors += batch.length;
      console.error(`  ❌ batch @${i}:`, e.response?.data || e.message);
    }
    if ((i / 10) % 20 === 0 || i + 10 >= toDelete.length) {
      const pct = Math.round((Math.min(i + 10, toDelete.length) / toDelete.length) * 100);
      console.log(`  progress ${Math.min(i + 10, toDelete.length)}/${toDelete.length} (${pct}%) deleted=${deleted} missing=${missing} errors=${errors} – ${Math.round((Date.now() - t1) / 1000)}s`);
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(220);
  }

  console.log(`\n✅ Klart. Raderade ${deleted}, redan borta ${missing}, fel ${errors}, tid ${Math.round((Date.now() - t1) / 1000)}s`);
}

main().catch((e) => {
  console.error('❌', e.response?.data || e.message || e);
  process.exit(1);
});
