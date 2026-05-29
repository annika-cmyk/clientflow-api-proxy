#!/usr/bin/env node
/**
 * Lägger till de nya fälten för byråns tjänster i tabellen
 * "Risker kopplad till tjänster" i Airtable.
 *
 * Nya fält (alla "long text" / multilineText):
 *   - Tjänstebeskrivning          (fri text)
 *   - Hot                         (JSON-array: [{ typ, titel, beskrivning }])
 *   - Sårbarheter                 (JSON-array: [{ kategori, titel, beskrivning }])
 *   - Samspelsexempel             (fri text)
 *   - Tjänstespecifika åtgärder   (JSON-array: [{ titel, beskrivning }])
 *
 * Kräver: AIRTABLE_ACCESS_TOKEN (personal access token, scope schema.bases:write)
 *         och AIRTABLE_BASE_ID.
 *
 * Kör: node scripts/add-byra-tjanst-fields.js
 *
 * Scriptet är idempotent: fält som redan finns hoppas över.
 */

require('dotenv').config();
const axios = require('axios');

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
const TOKEN = process.env.AIRTABLE_ACCESS_TOKEN;
const TABLE_NAME = 'Risker kopplad till tjänster';

const NEW_FIELDS = [
  { name: 'Tjänstebeskrivning', type: 'multilineText' },
  { name: 'Hot', type: 'multilineText' },
  { name: 'Sårbarheter', type: 'multilineText' },
  { name: 'Samspelsexempel', type: 'multilineText' },
  { name: 'Tjänstespecifika åtgärder', type: 'multilineText' }
];

async function main() {
  if (!TOKEN) {
    console.error('❌ AIRTABLE_ACCESS_TOKEN saknas. Sätt den i .env eller miljövariabler.');
    process.exit(1);
  }

  const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

  // 1. Hämta tabellens id + befintliga fält
  let table;
  try {
    const metaRes = await axios.get(
      `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`,
      { headers, timeout: 15000 }
    );
    const tables = metaRes.data?.tables || [];
    table = tables.find(t => (t.name || '').trim() === TABLE_NAME);
    if (!table) {
      console.error(`❌ Tabellen "${TABLE_NAME}" hittades inte i basen ${BASE_ID}.`);
      console.error('   Tillgängliga tabeller:', tables.map(t => t.name).join(', '));
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Kunde inte läsa tabell-metadata:', err.response?.status, err.response?.data || err.message);
    process.exit(1);
  }

  const existingNames = new Set((table.fields || []).map(f => (f.name || '').trim()));
  console.log(`📋 Tabell: ${table.name} (${table.id})`);
  console.log(`   Befintliga fält: ${existingNames.size} st`);

  // 2. Skapa de fält som saknas
  const fieldsUrl = `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables/${table.id}/fields`;
  let created = 0;
  let skipped = 0;

  for (const field of NEW_FIELDS) {
    if (existingNames.has(field.name)) {
      console.log(`⏭️  "${field.name}" finns redan – hoppar över.`);
      skipped++;
      continue;
    }

    try {
      await axios.post(fieldsUrl, { name: field.name, type: field.type }, { headers, timeout: 15000 });
      console.log(`✅ Skapade fältet "${field.name}" (${field.type}).`);
      created++;
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;
      if (status === 422 && JSON.stringify(data || '').includes('already exists')) {
        console.log(`⏭️  "${field.name}" finns redan (422) – hoppar över.`);
        skipped++;
        continue;
      }
      console.error(`❌ Kunde inte skapa "${field.name}".`, status, data || err.message);
      if (status === 401 || status === 403) {
        console.log('\n📋 Token saknar behörighet (schema.bases:write). Lägg annars till fälten manuellt i Airtable:');
        NEW_FIELDS.forEach(f => console.log(`   • ${f.name}  (Long text)`));
        process.exit(1);
      }
    }
  }

  console.log(`\n🎉 Klart. Skapade ${created} nya fält, hoppade över ${skipped}.`);
}

main();
