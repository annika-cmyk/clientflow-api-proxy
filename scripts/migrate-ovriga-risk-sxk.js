#!/usr/bin/env node
/**
 * Engångsmigrering: övriga riskfaktorer får S×K-poäng från den gamla risknivån.
 *
 * För varje post utan Riskpoäng:
 *   - inneboende S/K = residual S/K = par som ger samma nivå som Riskbedömning
 *   - kraverManualOversyn = true
 *
 * Skapar fälten Riskpoäng och PT/TF-relevans om de saknas.
 *
 * Kräver: AIRTABLE_ACCESS_TOKEN och AIRTABLE_BASE_ID.
 * Kör: node scripts/migrate-ovriga-risk-sxk.js
 */
const axios = require('axios');
const RiskSkala = require('../public/js/risk-skala');
const { SCHEMA_FIELDS: NEW_FIELDS } = require('../lib/ovriga-risk-fields');

const TABLE_NAME = 'Risker kopplade till kunden';

const needsMigration = RiskSkala.ovrigNeedsMigration;
const migrationFields = RiskSkala.ovrigMigrationFields;

async function ensureFields(headers, baseId, table) {
  const existing = new Set((table.fields || []).map((f) => (f.name || '').trim()));
  const fieldsUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${table.id}/fields`;
  for (const field of NEW_FIELDS) {
    if (existing.has(field.name)) {
      console.log(`⏭️  "${field.name}" finns redan.`);
      continue;
    }
    await axios.post(fieldsUrl, { name: field.name, type: field.type }, { headers, timeout: 15000 });
    console.log(`✅ Skapade fältet "${field.name}".`);
  }
}

async function fetchAll(headers, baseId, tableId) {
  const records = [];
  let offset = '';
  do {
    let url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}?pageSize=100`;
    if (offset) url += `&offset=${encodeURIComponent(offset)}`;
    const res = await axios.get(url, { headers, timeout: 20000 });
    records.push(...(res.data.records || []));
    offset = res.data.offset || '';
  } while (offset);
  return records;
}

async function main() {
  try { require('dotenv').config(); } catch (_) { /* dotenv är valfritt i CI */ }
  const token = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  if (!token) {
    console.error('❌ AIRTABLE_ACCESS_TOKEN saknas.');
    process.exit(1);
  }
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const meta = await axios.get(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, { headers, timeout: 15000 });
  const table = (meta.data.tables || []).find((t) => (t.name || '').trim() === TABLE_NAME);
  if (!table) {
    console.error(`❌ Tabellen "${TABLE_NAME}" hittades inte.`);
    process.exit(1);
  }
  await ensureFields(headers, baseId, table);
  const records = await fetchAll(headers, baseId, table.id);
  let updated = 0;
  let skipped = 0;
  for (const rec of records) {
    if (!needsMigration(rec.fields || {})) {
      skipped++;
      continue;
    }
    const fields = migrationFields(rec.fields || {});
    await axios.patch(
      `https://api.airtable.com/v0/${baseId}/${table.id}/${rec.id}`,
      { fields },
      { headers, timeout: 15000 }
    );
    updated++;
    console.log(`✅ ${rec.id} ${(rec.fields && rec.fields.Riskfaktor) || ''} → ${fields.Riskbedömning}`);
  }
  console.log(`\n🎉 Klart. Uppdaterade ${updated}, hoppade över ${skipped}.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.response?.data || err.message);
    process.exit(1);
  });
}

module.exports = { needsMigration, migrationFields };
