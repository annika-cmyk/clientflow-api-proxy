#!/usr/bin/env node
'use strict';

/**
 * Idempotent migrering: legacy-godkända kunder → Riskbeslut status = Godkänd.
 *
 * Användning:
 *   node scripts/migrate-risk-beslut.js              # dry-run (lista)
 *   node scripts/migrate-risk-beslut.js --apply      # skriv till Airtable
 *
 * Kräver AIRTABLE_ACCESS_TOKEN (+ AIRTABLE_BASE_ID).
 */

const axios = require('axios');
const RiskBeslut = require('../lib/risk-beslut');

const DRY = !process.argv.includes('--apply');
const TOKEN = process.env.AIRTABLE_ACCESS_TOKEN;
const BASE = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
const TABLE = process.env.AIRTABLE_TABLE_KUNDDATA_ID || 'tblOIuLQS2DqmOQWe';

async function listAll() {
  const all = [];
  let offset = null;
  do {
    const params = { pageSize: 100 };
    if (offset) params.offset = offset;
    const res = await axios.get(
      `https://api.airtable.com/v0/${BASE}/${TABLE}`,
      { headers: { Authorization: `Bearer ${TOKEN}` }, params, timeout: 30000 }
    );
    all.push(...(res.data.records || []));
    offset = res.data.offset || null;
  } while (offset);
  return all;
}

async function main() {
  if (!TOKEN) {
    console.error('AIRTABLE_ACCESS_TOKEN saknas');
    process.exit(1);
  }
  console.log(DRY ? '=== DRY-RUN (ingen skrivning) ===' : '=== APPLY (skriver till Airtable) ===');
  const records = await listAll();
  const needed = [];
  for (const rec of records) {
    const patch = RiskBeslut.migrationPatchForCustomer(rec.fields || {});
    if (!patch.needed) continue;
    const namn = (rec.fields || {}).Namn || (rec.fields || {})['Företagsnamn'] || rec.id;
    needed.push({ id: rec.id, namn, fields: patch.fields });
  }
  console.log(`Kunder att migrera: ${needed.length} av ${records.length}`);
  needed.forEach((row, i) => {
    console.log(`${i + 1}. ${row.namn} (${row.id}) → status=${row.fields[RiskBeslut.FIELD_STATUS]} version=${row.fields[RiskBeslut.FIELD_VERSION]}`);
  });
  if (DRY) {
    console.log('\nKör med --apply för att skriva.');
    return;
  }
  let ok = 0;
  let fail = 0;
  for (const row of needed) {
    try {
      await axios.patch(
        `https://api.airtable.com/v0/${BASE}/${TABLE}/${row.id}`,
        { fields: row.fields, typecast: true },
        { headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, timeout: 20000 }
      );
      ok += 1;
      console.log('✓', row.namn);
    } catch (e) {
      fail += 1;
      console.error('✗', row.namn, e.response?.data || e.message);
    }
  }
  console.log(`Klart. ok=${ok} fail=${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
