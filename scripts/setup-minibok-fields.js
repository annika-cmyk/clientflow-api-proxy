#!/usr/bin/env node
/**
 * Lägger till Minibok-fält i KUNDDATA-tabellen i Airtable.
 * Kräver: AIRTABLE_ACCESS_TOKEN med schema.bases:read + schema.bases:write
 *
 * Kör: node scripts/setup-minibok-fields.js
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({
  path: fs.existsSync(path.join(process.cwd(), '.env')) ? '.env' : 'env.env'
});
const axios = require('axios');

const KUNDDATA_TABLE_ID = 'tblOIuLQS2DqmOQWe';
const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
const TOKEN = process.env.AIRTABLE_ACCESS_TOKEN;

const FIELDS = [
  {
    name: 'Minibok pending',
    type: 'checkbox',
    options: { icon: 'check', color: 'blueBright' }
  },
  {
    name: 'Minibok källa',
    type: 'singleLineText'
  },
  {
    name: 'Minibok company id',
    type: 'singleLineText'
  }
];

async function getExistingFieldNames() {
  const metaUrl = `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`;
  const metaRes = await axios.get(metaUrl, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    timeout: 15000
  });
  const kundTable = (metaRes.data.tables || []).find((t) => t.id === KUNDDATA_TABLE_ID);
  if (!kundTable) throw new Error(`KUNDDATA-tabellen (${KUNDDATA_TABLE_ID}) hittades inte.`);
  return new Set((kundTable.fields || []).map((f) => f.name));
}

async function createField(fieldDef) {
  const url = `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables/${KUNDDATA_TABLE_ID}/fields`;
  const res = await axios.post(url, fieldDef, {
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    timeout: 15000
  });
  return res.data;
}

async function main() {
  if (!TOKEN) {
    console.error('❌ AIRTABLE_ACCESS_TOKEN saknas. Sätt den i .env eller env.env.');
    process.exit(1);
  }

  console.log('🔍 Kontrollerar befintliga fält i KUNDDATA...');
  const existing = await getExistingFieldNames();
  const results = [];

  for (const fieldDef of FIELDS) {
    if (existing.has(fieldDef.name)) {
      console.log(`✅ "${fieldDef.name}" finns redan.`);
      results.push({ name: fieldDef.name, status: 'exists' });
      continue;
    }
    try {
      await createField(fieldDef);
      console.log(`✅ "${fieldDef.name}" skapades.`);
      results.push({ name: fieldDef.name, status: 'created' });
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      console.error(`❌ Kunde inte skapa "${fieldDef.name}": ${msg}`);
      results.push({ name: fieldDef.name, status: 'error', error: msg });
    }
  }

  const failed = results.filter((r) => r.status === 'error');
  if (failed.length) {
    console.log('\n📋 Om API misslyckades (403): lägg till fälten manuellt i KUNDDATA:');
    console.log('   • Minibok pending (Checkbox)');
    console.log('   • Minibok källa (Single line text)');
    console.log('   • Minibok company id (Single line text)');
    process.exit(1);
  }

  console.log('\n✅ Minibok-fält klara.');
}

main().catch((err) => {
  console.error('❌', err.response?.data || err.message);
  process.exit(1);
});
