#!/usr/bin/env node
/**
 * Listar kunder där "Inga" är ikryssad tillsammans med minst en annan
 * tagg i Riskhöjande faktorer övrigt eller Risksänkande faktorer.
 */
try { require('dotenv').config(); } catch (_) { /* optional */ }
const axios = require('axios');
const KundRiskprofil = require('../public/js/kund-riskprofil');

const TABLE = 'KUNDDATA';
const FIELDS = ['Riskhöjande faktorer övrigt', 'Risksänkande faktorer'];

async function fetchAll(token, baseId) {
  const records = [];
  let offset = '';
  do {
    let url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(TABLE)}?pageSize=100`;
    if (offset) url += `&offset=${encodeURIComponent(offset)}`;
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30000
    });
    records.push(...(res.data.records || []));
    offset = res.data.offset || '';
  } while (offset);
  return records;
}

function conflictOn(fields, key) {
  const check = KundRiskprofil.exclusiveIngaCheck(fields && fields[key]);
  if (check.ok) return null;
  return {
    falt: key,
    val: (Array.isArray(fields[key]) ? fields[key] : [fields[key]]).filter(Boolean)
  };
}

async function main() {
  const token = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  if (!token) {
    console.log('AIRTABLE_ACCESS_TOKEN saknas — hoppar över live-rapport.');
    return;
  }
  const records = await fetchAll(token, baseId);
  const kunder = records.map((rec) => {
    const f = rec.fields || {};
    const konflikter = FIELDS.map((key) => conflictOn(f, key)).filter(Boolean);
    if (!konflikter.length) return null;
    return {
      id: rec.id,
      namn: f.Namn || f['Företagsnamn'] || '',
      orgnr: f.Orgnr || f.Organisationsnummer || '',
      konflikter
    };
  }).filter(Boolean);
  kunder.sort((a, b) => String(a.namn).localeCompare(String(b.namn), 'sv'));
  console.log(JSON.stringify({ antal: kunder.length, totalt: records.length, kunder }, null, 2));
}

main().catch((err) => {
  console.error(err.response?.data || err.message);
  process.exit(1);
});
