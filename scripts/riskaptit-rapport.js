/**
 * Lista kunder som enligt kodad riskaptit kräver beslut eller överskrider aptiten.
 * Kör: node scripts/riskaptit-rapport.js
 */
require('dotenv').config();
const axios = require('axios');
const Riskaptit = require('../lib/riskaptit');

async function fetchAll(baseId, token, tableId) {
  const rows = [];
  let offset = null;
  do {
    const params = { pageSize: 100 };
    if (offset) params.offset = offset;
    const res = await axios.get(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
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
    console.error('AIRTABLE_ACCESS_TOKEN saknas – kan inte hämta kunder.');
    process.exit(2);
  }
  const records = await fetchAll(baseId, token, tableId);
  const flagged = records.map((rec) => {
    const f = rec.fields || {};
    const ev = Riskaptit.evaluateCustomer(f);
    return {
      id: rec.id,
      namn: f.Namn || f['Företagsnamn'] || '',
      orgnr: f.Orgnr || '',
      niva: ev.niva,
      status: ev.status,
      beslut: ev.beslutUtfall || ''
    };
  }).filter((row) => row.status === 'Kräver_beslut' || row.status === 'Överskriden');
  flagged.sort((a, b) => String(a.namn).localeCompare(String(b.namn), 'sv'));
  const kraver = flagged.filter((r) => r.status === 'Kräver_beslut');
  const over = flagged.filter((r) => r.status === 'Överskriden');
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    totaltKunder: records.length,
    kraverBeslut: kraver.length,
    overskriden: over.length,
    kunder: flagged
  }, null, 2));
}

main().catch((err) => {
  console.error(err.response?.data || err.message);
  process.exit(1);
});
