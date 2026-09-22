#!/usr/bin/env node
/**
 * Skapa / synka Airtable-tabellen Gmail Mejlcache (body+metadata för senaste 30 dagarna).
 * Kräver: AIRTABLE_ACCESS_TOKEN med schema.bases:read + schema.bases:write
 *
 * Kör: node scripts/setup-gmail-mejlcache.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({
  path: fs.existsSync(path.join(process.cwd(), '.env')) ? '.env' : 'env.env'
});

const { ensureMejlcacheTable } = require('../lib/gmail/message-cache');

async function main() {
  const result = await ensureMejlcacheTable();
  if (!result.ok) {
    console.error('❌', result.error);
    console.error(
      '   Tips: token behöver schema-behörighet, eller skapa tabellen "Gmail Mejlcache" manuellt i Airtable.'
    );
    process.exit(1);
  }
  console.log(
    result.created
      ? '✅ Skapade tabellen "Gmail Mejlcache".'
      : '✅ Tabellen "Gmail Mejlcache" finns redan.'
  );
  if (result.createdFields && result.createdFields.length) {
    console.log('   Nya fält:', result.createdFields.join(', '));
  }
  if (result.tableId) {
    console.log('   Table id:', result.tableId);
    console.log('   (valfritt) sätt AIRTABLE_TABLE_GMAIL_MEJLCACHE_ID=' + result.tableId);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
