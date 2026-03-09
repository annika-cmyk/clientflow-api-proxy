/**
 * Testar PATCH till Airtable direkt – kräver recordId som argument.
 * node scripts/test-patch-richtext.js recRNfWLPI6iRp9ia
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');

const recordId = process.argv[2] || 'recRNfWLPI6iRp9ia';
const token = process.env.AIRTABLE_ACCESS_TOKEN;
const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
const tableName = 'Byråer';

const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${recordId}`;

async function test() {
  // Test 1: richText-fält med vanlig sträng
  console.log('Test 1: PATCH "1. Syfte och Omfattning" med plain string...');
  try {
    const r = await axios.patch(url, {
      fields: { '1. Syfte och Omfattning': 'Test från script ' + new Date().toISOString() }
    }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    console.log('OK:', r.data.id);
  } catch (e) {
    console.log('Fel:', e.response?.status, e.response?.data || e.message);
  }

  // Test 2: tom sträng för richText
  console.log('\nTest 2: PATCH med tom sträng ""...');
  try {
    await axios.patch(url, {
      fields: { '1. Syfte och Omfattning': '' }
    }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    console.log('OK');
  } catch (e) {
    console.log('Fel:', e.response?.status, JSON.stringify(e.response?.data));
  }

  // Test 3: singleLineText (Antal anställda)
  console.log('\nTest 3: PATCH "Antal anställda" (singleLineText)...');
  try {
    const r = await axios.patch(url, {
      fields: { 'Antal anställda': '5' }
    }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    console.log('OK:', r.data.id);
  } catch (e) {
    console.log('Fel:', e.response?.status, e.response?.data || e.message);
  }
}

test();
