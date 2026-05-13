/**
 * Inspektera fälttyp i Airtable (Meta API) för tabellen "Byråer".
 * Kör:
 *   node scripts/inspect-airtable-byra-field.js "Default uppsägningstid"
 */
require('dotenv').config();
const axios = require('axios');

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} saknas i .env`);
  return v;
}

async function main() {
  const fieldName = (process.argv[2] || 'Default uppsägningstid').toString();
  const token = mustEnv('AIRTABLE_ACCESS_TOKEN');
  const baseId = mustEnv('AIRTABLE_BASE_ID');

  const metaUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
  const metaRes = await axios.get(metaUrl, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000
  });

  const tables = metaRes.data?.tables || [];
  const byraTable =
    tables.find(t => (t.name || '').trim().toLowerCase() === 'byråer') ||
    tables.find(t => (t.name || '').trim().toLowerCase() === 'byraer');
  if (!byraTable) throw new Error('Tabellen "Byråer" hittades inte i basen.');

  const field = (byraTable.fields || []).find(f => (f.name || '').trim() === fieldName);

  console.log(JSON.stringify({
    table: { id: byraTable.id, name: byraTable.name },
    query: fieldName,
    field: field ? { id: field.id, name: field.name, type: field.type, options: field.options } : null
  }, null, 2));
}

main().catch((e) => {
  console.error('ERR', e.response?.status, e.response?.data || e.message);
  process.exit(1);
});

