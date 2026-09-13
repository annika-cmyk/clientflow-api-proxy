#!/usr/bin/env node
/**
 * Skapa / synka Airtable-tabellen Mejlarkiv (ClientFlow mejlarkiv).
 *
 * Kräver AIRTABLE_ACCESS_TOKEN med schema.bases:write (eller minst create tables).
 * Env: AIRTABLE_BASE_ID, valfritt AIRTABLE_TABLE_MEJLARKIV_ID.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: fs.existsSync(path.join(process.cwd(), '.env')) ? '.env' : 'env.env' });
const { ensureMejlarkivTable } = require('../lib/gmail/archive-store');

async function main() {
  if (!process.env.AIRTABLE_ACCESS_TOKEN) {
    console.error('❌ AIRTABLE_ACCESS_TOKEN saknas');
    process.exit(1);
  }
  const result = await ensureMejlarkivTable();
  if (!result.ok) {
    console.error('❌', result.error);
    console.error('   Tips: token behöver schema-behörighet, eller skapa tabellen Mejlarkiv manuellt i Airtable.');
    process.exit(1);
  }
  console.log(result.created ? '✅ Skapade tabellen "Mejlarkiv".' : '✅ Tabellen "Mejlarkiv" finns redan.');
  if (result.tableId) console.log('   tableId:', result.tableId);
  if (result.createdFields && result.createdFields.length) {
    console.log('   nya fält:', result.createdFields.join(', '));
  }
  console.log('   Valfritt: sätt AIRTABLE_TABLE_MEJLARKIV_ID=' + result.tableId + ' i Render.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
