/**
 * Arkivera satta värden i "Kund inneboende riskprofil" till audit-loggen.
 * Rör inte Residual / bedömd risk. Skriver en loggrad per kund som har värdet.
 *
 * Kör: node scripts/arkivera-kund-inneboende.js
 *      node scripts/arkivera-kund-inneboende.js --dry-run
 */
require('dotenv').config();
const axios = require('axios');
const path = require('path');
const KundRiskprofil = require('../public/js/kund-riskprofil');
const auditLog = require('../lib/audit-log');
const auditLogAirtable = require('../lib/audit-log-airtable');
const auditHooks = require('../lib/audit-log-hooks');

const dryRun = process.argv.includes('--dry-run');

async function fetchAll(baseId, token, tableId) {
  const rows = [];
  let offset = null;
  do {
    const params = { pageSize: 100 };
    if (offset) params.offset = offset;
    const res = await axios.get(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      params,
      timeout: 20000
    });
    rows.push(...(res.data.records || []));
    offset = res.data.offset || null;
  } while (offset);
  return rows;
}

async function main() {
  const token = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  const tableId = process.env.AIRTABLE_TABLE_KUNDDATA_ID || 'tblOIuLQS2DqmOQWe';
  if (!token) {
    console.error('AIRTABLE_ACCESS_TOKEN saknas.');
    process.exit(2);
  }
  const records = await fetchAll(baseId, token, tableId);
  const withValue = records.filter((rec) => KundRiskprofil.readInneboende(rec.fields || {}));
  const rows = withValue.map((rec) => {
    const f = rec.fields || {};
    return {
      id: rec.id,
      namn: f.Namn || f['Företagsnamn'] || '',
      orgnr: f.Orgnr || f.Organisationsnummer || '',
      byraId: f['Byrå ID'] || '',
      inneboende: KundRiskprofil.readInneboende(f),
      residual: KundRiskprofil.readResidual(f)
    };
  });
  console.log(JSON.stringify({
    totalt: records.length,
    medInneboende: rows.length,
    dryRun,
    kunder: rows
  }, null, 2));

  if (dryRun || !rows.length) return;

  const store = auditLogAirtable.createAirtableStore({ axios, token, baseId });
  const svc = auditLog.createAuditLogService(store);
  let skrivna = 0;
  let hoppade = 0;
  for (const row of rows) {
    const rec = withValue.find((r) => r.id === row.id);
    const written = await auditHooks.logInneboendeArchived({
      write: (input, options) => svc.insert(input, options),
      service: svc,
      actor: auditLog.SYSTEM_ACTORS.system,
      byraId: row.byraId,
      customerId: row.id,
      fields: (rec && rec.fields) || {}
    });
    if (written) skrivna += 1;
    else hoppade += 1;
  }
  const outDir = path.join(__dirname, '../tmp');
  console.log(JSON.stringify({ skrivna, hoppade, outDir }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
