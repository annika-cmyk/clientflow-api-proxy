#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: fs.existsSync(path.join(process.cwd(), '.env')) ? '.env' : 'env.env' });
const { ensureMejlarkivTable } = require('../lib/gmail/archive-store');
async function main() {
  const result = await ensureMejlarkivTable();
  if (!result.ok) { console.error('❌', result.error); process.exit(1); }
  console.log(result.created ? '✅ Skapade tabellen "Mejlarkiv".' : '✅ Tabellen "Mejlarkiv" finns redan.');
  if (result.tableId) console.log('   tableId:', result.tableId);
}
main().catch((e) => { console.error(e); process.exit(1); });
