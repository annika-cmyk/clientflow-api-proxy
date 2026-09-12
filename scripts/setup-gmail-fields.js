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

const { ensureGmailField } = require('../lib/gmail/store');

async function main() {
  const result = await ensureGmailField();
  if (!result.ok) {
    console.error('❌', result.error);
    process.exit(1);
  }
  if (result.created) {
    console.log('✅ Skapade fältet "Gmail OAuth" i Application Users.');
  } else {
    console.log('✅ Fältet "Gmail OAuth" finns redan.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
