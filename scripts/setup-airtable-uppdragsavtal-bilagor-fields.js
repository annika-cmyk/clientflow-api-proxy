/**
 * Skapar fält i Airtable-tabellen "Uppdragsavtal" för valbara bilagor:
 * - Bifoga prislista (checkbox)
 * - Valda byråbilagor (JSON) (multilineText)
 *
 * Kör:
 *   node scripts/setup-airtable-uppdragsavtal-bilagor-fields.js
 *
 * Kräver Personal Access Token med schema.bases:read + schema.bases:write.
 */
require('dotenv').config();
const axios = require('axios');

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} saknas i .env`);
  return v;
}

async function main() {
  const token = mustEnv('AIRTABLE_ACCESS_TOKEN');
  const baseId = mustEnv('AIRTABLE_BASE_ID');

  // Uppdragsavtal tabell-ID i servern
  const UPPDRAGSAVTAL_TABLE_ID = 'tblpKIMpde6sFFqDH';

  const headers = { Authorization: `Bearer ${token}` };
  const metaUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;

  const metaRes = await axios.get(metaUrl, { headers, timeout: 15000 });
  const tables = metaRes.data?.tables || [];
  const t = tables.find(x => x.id === UPPDRAGSAVTAL_TABLE_ID) || tables.find(x => (x.name || '').trim().toLowerCase() === 'uppdragsavtal');
  if (!t) throw new Error('Tabellen Uppdragsavtal hittades inte i basen.');

  const existing = new Set((t.fields || []).map(f => (f.name || '').trim()));
  const createUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${t.id}/fields`;

  const desired = [
    { name: 'Bifoga prislista', type: 'checkbox', description: 'Om prislista ska bifogas till uppdragsavtalet (PDF/DocSign).', options: { icon: 'check', color: 'greenBright' } },
    { name: 'Valda byråbilagor (JSON)', type: 'multilineText', description: 'JSON-array med attachment-id för valda byråbilagor som ska bifogas.' }
  ];

  const toCreate = desired.filter(f => !existing.has(f.name));
  if (!toCreate.length) {
    console.log('✅ Uppdragsavtal-bilagefält finns redan.');
    return;
  }

  for (const field of toCreate) {
    const payload = { name: field.name, type: field.type };
    if (field.description) payload.description = field.description;
    if (field.options) payload.options = field.options;
    try {
      await axios.post(createUrl, payload, { headers: { ...headers, 'Content-Type': 'application/json' }, timeout: 15000 });
      console.log('✅ Skapade fält:', field.name);
    } catch (e) {
      const status = e.response?.status;
      const msg = e.response?.data?.error?.message || e.response?.data?.message || e.message;
      console.log('❌ Kunde inte skapa fält:', field.name, '|', status || '', msg);
    }
  }
}

main().catch((e) => {
  console.error('❌ Setup misslyckades:', e.response?.data || e.message);
  process.exit(1);
});

