#!/usr/bin/env node
/**
 * Lägger till fältet "Utskickningsdatum" i Uppdragsavtal-tabellen i Airtable.
 * Kräver: AIRTABLE_ACCESS_TOKEN (personal access token) och AIRTABLE_BASE_ID.
 *
 * Kör: node scripts/add-utskickningsdatum-field.js
 *
 * Om scriptet misslyckas (t.ex. 403): Lägg till fältet manuellt i Airtable:
 * 1. Öppna basen i Airtable
 * 2. Gå till tabellen "Uppdragsavtal"
 * 3. Klicka "+" för att lägga till en ny kolumn
 * 4. Namn: Utskickningsdatum
 * 5. Typ: Date (Datum)
 * 6. Spara
 */

require('dotenv').config();
const axios = require('axios');

const UPPDRAGSAVTAL_TABLE = 'tblpKIMpde6sFFqDH';
const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
const TOKEN = process.env.AIRTABLE_ACCESS_TOKEN;

async function main() {
  if (!TOKEN) {
    console.error('❌ AIRTABLE_ACCESS_TOKEN saknas. Sätt den i .env eller miljövariabler.');
    process.exit(1);
  }

  const url = `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables/${UPPDRAGSAVTAL_TABLE}/fields`;
  const body = {
    name: 'Utskickningsdatum',
    type: 'date',
    options: {
      dateFormat: { name: 'iso' }
    }
  };

  console.log('📤 Försöker skapa fält "Utskickningsdatum" i Uppdragsavtal...');

  try {
    const res = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('✅ Fältet "Utskickningsdatum" har skapats.');
    console.log('   Svar:', JSON.stringify(res.data, null, 2));
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;

    console.error('❌ Kunde inte skapa fält via API.');
    console.error('   Status:', status);
    if (data) console.error('   Svar:', JSON.stringify(data, null, 2));

    if (status === 403 || status === 401) {
      console.log('\n📋 Lägg till fältet manuellt i Airtable:');
      console.log('   1. Öppna basen i Airtable');
      console.log('   2. Gå till tabellen "Uppdragsavtal"');
      console.log('   3. Klicka "+" för att lägga till en ny kolumn');
      console.log('   4. Namn: Utskickningsdatum');
      console.log('   5. Typ: Date (Datum)');
      console.log('   6. Spara');
    } else if (status === 422 && data?.error?.message?.includes('already exists')) {
      console.log('\n✅ Fältet finns redan – inget behov av att skapa det.');
    }
    process.exit(1);
  }
}

main();
