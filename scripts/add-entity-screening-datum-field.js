#!/usr/bin/env node
/**
 * Lägger till fältet "Entity screening datum" i KUNDDATA-tabellen i Airtable.
 * Kräver: AIRTABLE_ACCESS_TOKEN med schema.bases:read + schema.bases:write
 *
 * Kör: node scripts/add-entity-screening-datum-field.js
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

const FIELD = {
  name: 'Entity screening datum',
  type: 'date',
  description: 'Senaste datum då företaget screenades mot sanktionslistor (Dilisense checkEntity).',
  options: {
    dateFormat: { name: 'iso' }
  }
};

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

async function main() {
  if (!TOKEN) {
    console.error('❌ AIRTABLE_ACCESS_TOKEN saknas. Sätt den i .env eller env.env.');
    process.exit(1);
  }

  console.log('🔍 Kontrollerar befintliga fält i KUNDDATA...');
  const existing = await getExistingFieldNames();

  if (existing.has(FIELD.name)) {
    console.log(`✅ "${FIELD.name}" finns redan.`);
    return;
  }

  const url = `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables/${KUNDDATA_TABLE_ID}/fields`;
  console.log(`📤 Skapar fält "${FIELD.name}"...`);

  try {
    const res = await axios.post(url, FIELD, {
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      timeout: 15000
    });
    console.log(`✅ "${FIELD.name}" skapades.`);
    console.log('   Svar:', JSON.stringify(res.data, null, 2));
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    const msg = data?.error?.message || err.message;

    console.error(`❌ Kunde inte skapa "${FIELD.name}": ${msg}`);
    if (status) console.error('   Status:', status);
    if (data) console.error('   Svar:', JSON.stringify(data, null, 2));

    if (status === 403 || status === 401) {
      console.log('\n📋 Lägg till fältet manuellt i Airtable:');
      console.log('   1. Öppna basen i Airtable');
      console.log('   2. Gå till tabellen "KUNDDATA"');
      console.log('   3. Klicka "+" för att lägga till en ny kolumn');
      console.log('   4. Namn: Entity screening datum');
      console.log('   5. Typ: Date (Datum, ISO-format)');
      console.log('   6. Spara');
    }
    process.exit(1);
  }
}

main();
