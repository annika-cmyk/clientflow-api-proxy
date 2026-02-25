require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');

const token = process.env.AIRTABLE_ACCESS_TOKEN;
const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';

if (!token) {
  console.log('AIRTABLE_ACCESS_TOKEN saknas i .env');
  process.exit(1);
}

axios.get(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
  headers: { Authorization: `Bearer ${token}` }
}).then(r => {
  const t = (r.data.tables || []).find(x => x.name === 'Byråer');
  if (!t) {
    console.log('Tabeller:', (r.data.tables || []).map(x => x.name).join(', '));
    return;
  }
  console.log('=== Byråer schema ===');
  console.log('Table:', t.name, '| id:', t.id);
  console.log('\nFält (namn, typ, längd, slutar med mellanslag):');
  (t.fields || []).forEach(f => {
    const len = (f.name || '').length;
    const trailingSpace = (f.name || '').slice(-1) === ' ';
    console.log('  -', JSON.stringify(f.name), '| typ:', f.type, '| längd:', len, trailingSpace ? '| SLUTAR MED MELLANSLAG!' : '');
  });
}).catch(e => {
  console.error('Fel:', e.response?.data || e.message);
  process.exit(1);
});
