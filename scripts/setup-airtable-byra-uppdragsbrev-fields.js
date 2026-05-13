/**
 * Skapar nödvändiga fält i Airtable-tabellen "Byråer" för Uppdragsbrev:
 * - Default uppsägningstid
 * - Default faktureringsperiod
 * - Default betalningsvillkor
 * - Uppdragsbrev bilagor (attachments)
 *
 * Kör:
 *   node scripts/setup-airtable-byra-uppdragsbrev-fields.js
 *
 * Kräver Personal Access Token med:
 * - schema.bases:read
 * - schema.bases:write
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

  const headers = { Authorization: `Bearer ${token}` };
  const metaUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;

  const metaRes = await axios.get(metaUrl, { headers, timeout: 15000 });
  const tables = metaRes.data?.tables || [];
  const byraTable =
    tables.find(t => (t.name || '').trim().toLowerCase() === 'byråer') ||
    tables.find(t => (t.name || '').trim().toLowerCase() === 'byraer');

  if (!byraTable) throw new Error('Tabellen "Byråer" hittades inte i basen.');

  const existing = new Set((byraTable.fields || []).map(f => (f.name || '').trim()));
  const createUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${byraTable.id}/fields`;

  const desired = [
    {
      name: 'Default uppsägningstid',
      type: 'number',
      description: 'Default uppsägningstid i månader för nya uppdragsavtal/uppdragsbrev',
      options: { precision: 0 }
    },
    {
      name: 'Default faktureringsperiod',
      type: 'singleSelect',
      description: 'Default faktureringsperiod för nya uppdragsavtal/uppdragsbrev',
      options: { choices: [{ name: 'Månadsvis' }, { name: 'Kvartalsvis' }, { name: 'Halvårsvis' }, { name: 'Årsvis' }, { name: 'Löpande' }] }
    },
    {
      name: 'Default betalningsvillkor',
      type: 'number',
      description: 'Default betalningsvillkor i dagar för nya uppdragsavtal/uppdragsbrev',
      options: { precision: 0 }
    },
    {
      name: 'Uppdragsbrev bilagor',
      type: 'multipleAttachments',
      description: 'Bilagor som byrån själv kan använda i uppdragsbrev/uppdragsavtal.'
    },
    {
      name: 'Uppdragsbrev bilagor meta (JSON)',
      type: 'multilineText',
      description: 'Metadata för uppdragsbrev-bilagor (JSON med {id,label}).'
    },
    {
      name: 'Uppdragsbrev informationstext',
      type: 'multilineText',
      description: 'Byråns egen informationstext som visas under "Information" i uppdragsavtals-PDF:en. Lämna tomt för standardtext.'
    }
  ];

  const toCreate = desired.filter(f => !existing.has(f.name));
  if (toCreate.length === 0) {
    console.log('✅ Alla Uppdragsbrev-fält finns redan i tabellen "Byråer".');
    return;
  }

  const created = [];
  for (const field of toCreate) {
    const payload = { name: field.name, type: field.type };
    if (field.description) payload.description = field.description;
    if (field.options) payload.options = field.options;

    try {
      await axios.post(createUrl, payload, {
        headers: { ...headers, 'Content-Type': 'application/json' },
        timeout: 15000
      });
      created.push(field.name);
      console.log('✅ Skapade fält:', field.name);
    } catch (e) {
      const status = e.response?.status;
      const msg = e.response?.data?.error?.message || e.response?.data?.message || e.message;
      console.log('❌ Kunde inte skapa fält:', field.name, '|', status || '', msg);
    }
  }

  if (created.length) {
    console.log(`✅ Klart. Skapade ${created.length} fält.`);
  } else {
    console.log('⚠️ Inga fält skapades (se fel ovan).');
  }
}

main().catch((e) => {
  console.error('❌ Setup misslyckades:', e.message);
  process.exit(1);
});

