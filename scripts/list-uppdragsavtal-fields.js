#!/usr/bin/env node
/**
 * Listar alla fält i Uppdragsavtal-tabellen.
 * Kör: node scripts/list-uppdragsavtal-fields.js
 */
require('dotenv').config();
const axios = require('axios');

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
const TOKEN = process.env.AIRTABLE_ACCESS_TOKEN;
const UPPDRAGSAVTAL_TABLE = 'tblpKIMpde6sFFqDH';

async function main() {
  if (!TOKEN) {
    console.error('❌ AIRTABLE_ACCESS_TOKEN saknas');
    process.exit(1);
  }
  try {
    const res = await axios.get(
      `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
    const table = res.data.tables?.find(t => t.id === UPPDRAGSAVTAL_TABLE);
    if (!table) {
      console.log('Tabeller:', res.data.tables?.map(t => t.name).join(', '));
      return;
    }
    console.log('Fält i', table.name, ':\n');
    for (const f of table.fields || []) {
      console.log('  ', f.name, ' (', f.type, ')  id:', f.id);
    }
  } catch (e) {
    console.error('Fel:', e.response?.data || e.message);
    process.exit(1);
  }
}

main();
