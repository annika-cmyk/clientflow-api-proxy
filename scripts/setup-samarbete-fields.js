/**
 * Lägg till alla nödvändiga fält i Airtable-tabellen "Samarbete".
 * Kör: node scripts/setup-samarbete-fields.js
 * Kräver: .env med AIRTABLE_ACCESS_TOKEN (Personal Access Token med schema.bases:read + schema.bases:write)
 */
require('dotenv').config();
const axios = require('axios');

const REQUIRED_FIELDS = [
  { name: 'Kund ID', type: 'singleLineText', description: 'Record-id för kunden i KUNDDATA' },
  { name: 'Mottagare namn', type: 'singleLineText' },
  { name: 'Mottagare e-post', type: 'email' },
  { name: 'Typ', type: 'singleSelect', options: { choices: [{ name: 'Filer' }, { name: 'Kommentar' }] } },
  { name: 'Titel', type: 'multilineText', description: 'Vad som begärs från kunden' },
  { name: 'Token', type: 'singleLineText', description: 'Unik token för kundlänk' },
  { name: 'Status', type: 'singleSelect', options: { choices: [{ name: 'Väntar' }, { name: 'Besvarad' }] } },
  { name: 'Svar text', type: 'multilineText', description: 'Kundens kommentar/svar' },
  { name: 'Svar bifogad fil', type: 'multipleAttachments', description: 'Fil som kunden laddade upp' },
  { name: 'Besvarad', type: 'dateTime', options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'Europe/Stockholm' } }
];

async function main() {
  const token = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  if (!token) {
    console.error('❌ AIRTABLE_ACCESS_TOKEN saknas i .env');
    process.exit(1);
  }
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  console.log('Hämtar tabeller från Airtable...');
  const metaRes = await axios.get(
    `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
    { headers, timeout: 10000 }
  );
  const tables = metaRes.data?.tables || [];
  const samarbete = tables.find(t => (t.name || '').toLowerCase() === 'samarbete');
  if (!samarbete) {
    console.error('❌ Tabellen "Samarbete" hittades inte i basen. Skapa den först i Airtable.');
    process.exit(1);
  }
  console.log('Tabell "Samarbete" hittad:', samarbete.id);

  const existingNames = (samarbete.fields || []).map(f => (f.name || '').trim());
  const toCreate = REQUIRED_FIELDS.filter(f => !existingNames.includes((f.name || '').trim()));
  if (toCreate.length === 0) {
    console.log('Alla', REQUIRED_FIELDS.length, 'fält finns redan.');
  }

  const createUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${samarbete.id}/fields`;
  const created = [];
  for (const field of toCreate) {
    try {
      const body = { name: field.name, type: field.type };
      if (field.description) body.description = field.description;
      if (field.options) body.options = field.options;
      await axios.post(createUrl, body, { headers, timeout: 10000 });
      created.push(field.name);
      console.log('  +', field.name);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      console.warn('  ✗', field.name, '–', msg);
    }
  }

  // Säkerställ att Status och Typ har rätt val (Väntar/Besvarad, Filer/Kommentar)
  const fieldsToFix = [
    { name: 'Status', requiredChoices: ['Väntar', 'Besvarad'] },
    { name: 'Typ', requiredChoices: ['Filer', 'Kommentar'] }
  ];
  for (const { name, requiredChoices } of fieldsToFix) {
    const field = (samarbete.fields || []).find(f => (f.name || '').trim() === name);
    if (!field || field.type !== 'singleSelect') continue;
    const existing = (field.options?.choices || []).map(c => (c.name || '').trim());
    const missing = requiredChoices.filter(c => !existing.includes(c));
    if (missing.length === 0) continue;
    // Behåll befintliga choices med id/color om de finns, lägg till saknade
    const existingChoices = (field.options?.choices || []).slice();
    const newChoices = requiredChoices.map(n => existingChoices.find(c => (c.name || '').trim() === n) || { name: n });
    const patchUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${samarbete.id}/fields/${field.id}`;
    try {
      await axios.patch(patchUrl, { options: { choices: newChoices } }, { headers, timeout: 10000 });
      console.log('  Uppdaterade val för', name, ':', missing.join(', '));
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      console.warn('  ✗ Kunde inte uppdatera val för', name, '–', msg);
      console.warn('  → Lägg till valen "' + requiredChoices.join('" och "') + '" manuellt i Airtable (dubbelklicka på fältet Status → Lägg till val).');
    }
  }

  if (created.length > 0) console.log('Klart.', created.length, 'fält lades till.');
  else console.log('Klart.');
}

main().catch(err => {
  console.error('Fel:', err.response?.data || err.message);
  process.exit(1);
});
