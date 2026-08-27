/**
 * Engångskörning: sätt tomma Ja/Nej-fält i KYC till "Nej" för
 * internationell handel, kontanthantering och kryptovaluta.
 *
 * Kör:
 *   node scripts/bulk-kyc-verksamhet-nej.js --email=annika@rydenredovisning.se --dry-run
 *   node scripts/bulk-kyc-verksamhet-nej.js --byra-id=49
 */
require('dotenv').config();
const axios = require('axios');

const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';
const KYC_FIELD = 'KYC-formular (JSON)';
const DEFAULT_VALUE = 'Nej';
const FIELDS = [
  { kycKey: 'internationellHandel', syncField: 'Har företaget transaktioner med andra länder?' },
  { kycKey: 'kontanter' },
  { kycKey: 'kryptovaluta' }
];

const dryRun = process.argv.includes('--dry-run');
const byraFilter = (process.argv.find((a) => a.startsWith('--byra-id=')) || '').split('=')[1] || '';
const emailFilter = (process.argv.find((a) => a.startsWith('--email=')) || '').split('=')[1] || '';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseKyc(raw) {
  if (raw == null || raw === '') return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function isJanejEmpty(raw) {
  return !String(raw == null ? '' : raw).trim();
}

function missingFields(kyc) {
  return FIELDS.filter(({ kycKey }) => isJanejEmpty(kyc[kycKey]));
}

function byraIdFromRecord(fields) {
  const f = fields || {};
  const raw = f['Byrå ID'] ?? f['Byra_ID'] ?? f['ByraID'] ?? f['Byra ID'] ?? '';
  return String(Array.isArray(raw) ? raw[0] : raw).trim();
}

async function fetchAllKunder(baseId, token) {
  const rows = [];
  let offset = null;
  do {
    const params = { pageSize: 100 };
    if (offset) params.offset = offset;
    // eslint-disable-next-line no-await-in-loop
    const res = await axios.get(`https://api.airtable.com/v0/${baseId}/${KUNDDATA_TABLE}`, {
      headers: { Authorization: `Bearer ${token}` },
      params,
      timeout: 30000
    });
    rows.push(...(res.data.records || []));
    offset = res.data.offset || null;
  } while (offset);
  return rows;
}

async function resolveByraIdFromEmail(baseId, token, email) {
  const formula = encodeURIComponent(`{Email}="${String(email).replace(/"/g, '\\"')}"`);
  const url = `https://api.airtable.com/v0/${baseId}/Application%20Users?filterByFormula=${formula}&maxRecords=5`;
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 20000
  });
  const rec = (res.data.records || [])[0];
  if (!rec) throw new Error(`Ingen Application Users-post för ${email}`);
  const f = rec.fields || {};
  const fromLink = Array.isArray(f['Byrå ID (from Byråer)']) ? f['Byrå ID (from Byråer)'][0] : null;
  const fromText = String(f['Byrå ID i text 2'] || f['Byrå ID'] || '').trim();
  const id = fromLink != null ? String(fromLink).trim() : fromText;
  if (!id) throw new Error(`Kunde inte läsa Byrå ID för ${email}`);
  return id;
}

async function patchKund(baseId, token, id, fields) {
  if (dryRun) return { id, fields };
  const url = `https://api.airtable.com/v0/${baseId}/${KUNDDATA_TABLE}/${id}`;
  try {
    const res = await axios.patch(url, { fields, typecast: true }, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 20000
    });
    return res.data;
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message || '';
    if (!/Unknown field name/i.test(String(msg))) throw err;
    const kycOnly = { [KYC_FIELD]: fields[KYC_FIELD] };
    const res = await axios.patch(url, { fields: kycOnly, typecast: true }, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 20000
    });
    return res.data;
  }
}

async function main() {
  const token = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  if (!token) {
    console.error('Saknar AIRTABLE_ACCESS_TOKEN');
    process.exit(1);
  }

  let byraId = byraFilter;
  if (!byraId && emailFilter) {
    byraId = await resolveByraIdFromEmail(baseId, token, emailFilter);
    console.log(`Byrå ID för ${emailFilter}: ${byraId}`);
  }
  if (!byraId) {
    console.error('Ange --byra-id=... eller --email=...');
    process.exit(1);
  }

  const records = (await fetchAllKunder(baseId, token))
    .filter((rec) => byraIdFromRecord(rec.fields) === String(byraId));

  const targets = records
    .map((rec) => ({ rec, missing: missingFields(parseKyc(rec.fields?.[KYC_FIELD])) }))
    .filter(({ missing }) => missing.length > 0);

  console.log(`Hittade ${records.length} kunder på byrå ${byraId}, ${targets.length} saknar minst ett av fälten.`);

  let updated = 0;
  let errors = 0;

  for (const { rec, missing } of targets) {
    const kyc = parseKyc(rec.fields?.[KYC_FIELD]);
    const patchFields = {};
    const changed = [];

    for (const field of missing) {
      kyc[field.kycKey] = DEFAULT_VALUE;
      changed.push(field.kycKey);
      if (field.syncField) patchFields[field.syncField] = DEFAULT_VALUE;
    }
    patchFields[KYC_FIELD] = JSON.stringify(kyc);

    const namn = String(rec.fields?.Namn || rec.fields?.Kundnamn || rec.id).trim();
    try {
      // eslint-disable-next-line no-await-in-loop
      await patchKund(baseId, token, rec.id, patchFields);
      updated += 1;
      console.log(`${dryRun ? '[dry-run] ' : ''}${namn}: ${changed.join(', ')} -> ${DEFAULT_VALUE}`);
      if (!dryRun) await sleep(220);
    } catch (err) {
      errors += 1;
      console.error(`Fel för ${namn} (${rec.id}):`, err.response?.data || err.message);
    }
  }

  console.log('\nKlart.');
  console.log(`Uppdaterade: ${updated}, fel: ${errors}${dryRun ? ' (dry-run)' : ''}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
