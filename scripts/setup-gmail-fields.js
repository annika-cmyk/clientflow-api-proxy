#!/usr/bin/env node
/**
 * Lägger till Gmail OAuth-fält i Application Users.
 * Kräver: AIRTABLE_ACCESS_TOKEN med schema.bases:read + schema.bases:write
 *
 * Kör: node scripts/setup-gmail-fields.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({
  path: fs.existsSync(path.join(process.cwd(), '.env')) ? '.env' : 'env.env'
});

const { ensureGmailField, ensureLabelLinksField, ensureSyncCacheField } = require('../lib/gmail/store');

async function main() {
  const oauth = await ensureGmailField();
  if (!oauth.ok) {
    console.error('❌', oauth.error);
    process.exit(1);
  }
  if (oauth.created) {
    console.log('✅ Skapade fältet "Gmail OAuth" i Application Users.');
  } else {
    console.log('✅ Fältet "Gmail OAuth" finns redan.');
  }

  const links = await ensureLabelLinksField();
  if (!links.ok) {
    console.error('❌', links.error);
    process.exit(1);
  }
  if (links.created) {
    console.log('✅ Skapade fältet "Gmail etikettkopplingar" i Application Users.');
  } else {
    console.log('✅ Fältet "Gmail etikettkopplingar" finns redan.');
  }

  const cache = await ensureSyncCacheField();
  if (!cache.ok) {
    console.error('❌', cache.error);
    process.exit(1);
  }
  if (cache.created) {
    console.log('✅ Skapade fältet "Gmail Sync Cache" i Application Users.');
  } else {
    console.log('✅ Fältet "Gmail Sync Cache" finns redan.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
