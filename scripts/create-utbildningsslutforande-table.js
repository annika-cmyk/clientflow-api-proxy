/**
 * Skapar Airtable-tabellen "Utbildningsslutförande" via Metadata API.
 * Kräver: AIRTABLE_ACCESS_TOKEN med scope "schema.bases:write" (och data.records:read för att läsa schema).
 * Kör: node scripts/create-utbildningsslutforande-table.js
 */
require('dotenv').config();
const axios = require('axios');

const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
const token = process.env.AIRTABLE_ACCESS_TOKEN;

if (!token) {
  console.error('Sätt AIRTABLE_ACCESS_TOKEN i .env');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
};

async function main() {
  // 1) Hämta befintliga tabeller för att hitta Application Users table-id
  console.log('Hämtar basens schema...');
  let tablesRes;
  try {
    tablesRes = await axios.get(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, { headers });
  } catch (e) {
    if (e.response?.status === 403) {
      console.error('Token saknar rättighet. Lägg till scope "schema.bases:write" (och data.records:read) på din Airtable Personal Access Token.');
    } else {
      console.error('Kunde inte hämta schema:', e.response?.data || e.message);
    }
    process.exit(1);
  }

  const tables = tablesRes.data.tables || [];
  const appUsersTable = tables.find(t => (t.name || '').toLowerCase() === 'application users');
  const linkedTableId = appUsersTable ? appUsersTable.id : null;
  if (!linkedTableId) {
    console.error('Hittade ingen tabell med namn "Application Users". Kontrollera bas-ID och tabellnamn.');
    process.exit(1);
  }
  console.log('Application Users table-id:', linkedTableId);

  // 2) Skapa tabell "Utbildningsslutförande" om den inte redan finns
  const existing = tables.find(t => (t.name || '').toLowerCase() === 'utbildningsslutförande' || (t.name || '').toLowerCase() === 'utbildningsslutforande');
  if (existing) {
    console.log('Tabellen "Utbildningsslutförande" finns redan (id:', existing.id, '). Inget skapas.');
    process.exit(0);
  }

  const newTable = {
    name: 'Utbildningsslutförande',
    description: 'Genomförda utbildningar (t.ex. AML Grundkurs). Användare + Byrå ID + Kurs + Genomförd.',
    fields: [
      {
        name: 'Kurs',
        type: 'singleLineText',
        description: 'T.ex. AML Grundkurs (första fältet = primärfält i Airtable)'
      },
      {
        name: 'Användare',
        type: 'multipleRecordLinks',
        description: 'Användare som genomfört utbildningen',
        options: { linkedTableId }
      },
      {
        name: 'Byrå ID',
        type: 'singleLineText',
        description: 'Byrå-ID (samma som i övriga tabeller)'
      },
      {
        name: 'Genomförd',
        type: 'date',
        description: 'Datum då utbildningen slutfördes',
        options: {
          dateFormat: { name: 'iso', format: 'YYYY-MM-DD' }
        }
      }
    ]
  };

  try {
    const createRes = await axios.post(
      `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
      newTable,
      { headers }
    );
    console.log('Tabell skapad:', createRes.data.id || createRes.data.name || 'OK');
    console.log('Fält:', (createRes.data.fields || []).map(f => f.name).join(', '));
  } catch (e) {
    console.error('Kunde inte skapa tabell:', e.response?.data || e.message);
    if (e.response?.data?.error?.type === 'INVALID_REQUEST_BODY') {
      console.error('Detaljer:', JSON.stringify(e.response.data, null, 2));
    }
    process.exit(1);
  }
}

main();
