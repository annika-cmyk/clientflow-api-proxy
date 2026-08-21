#!/usr/bin/env node
/**
 * Rapport: tjänster som saknar TF-hot och TF-motivering.
 * Ändrar ingenting — listar bara poster som behöver manuell granskning.
 *
 * Kör: node scripts/report-tjanst-tf-luckor.js
 */
const fs = require('fs');
const path = require('path');
const envPath = fs.existsSync(path.join(__dirname, '..', '.env'))
  ? path.join(__dirname, '..', '.env')
  : path.join(__dirname, '..', 'env.env');
require('dotenv').config({ path: envPath });
const axios = require('axios');
const { mapByraTjanstRecord } = require('../lib/byra-tjanst-map');
const TjanstTfTackning = require('../public/js/tjanst-tf-tackning');

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
const TOKEN = process.env.AIRTABLE_ACCESS_TOKEN;
const TABLE = 'Risker kopplad till tjänster';

async function fetchAll() {
  const records = [];
  let offset = '';
  do {
    let url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}?pageSize=100`;
    if (offset) url += `&offset=${encodeURIComponent(offset)}`;
    // eslint-disable-next-line no-await-in-loop
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      timeout: 20000
    });
    records.push(...(res.data.records || []));
    offset = res.data.offset || '';
  } while (offset);
  return records;
}

async function main() {
  if (!TOKEN) {
    console.error('AIRTABLE_ACCESS_TOKEN saknas. Kan inte läsa tjänster.');
    process.exit(2);
  }
  const records = await fetchAll();
  const luckor = records
    .map(mapByraTjanstRecord)
    .filter((t) => t.namn && TjanstTfTackning.tjanstSaknarTfTackning(t))
    .map((t) => ({
      id: t.id,
      namn: t.namn,
      byraId: (records.find((r) => r.id === t.id)?.fields || {})['Byrå ID'] || '',
      hotAntal: (t.hot || []).length,
      hotTyper: (t.hot || []).map((h) => h.typ || 'PT').join(', ') || '(inga hot)',
      aktuell: records.find((r) => r.id === t.id)?.fields?.Aktuell === true
    }))
    .sort((a, b) => String(a.byraId).localeCompare(String(b.byraId)) || a.namn.localeCompare(b.namn, 'sv'));

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    table: TABLE,
    totalTjanster: records.filter((r) => (r.fields || {})['Task Name']).length,
    saknarTfTackning: luckor.length,
    tjanster: luckor
  }, null, 2));
}

main().catch((err) => {
  console.error(err.response?.data || err.message);
  process.exit(1);
});
