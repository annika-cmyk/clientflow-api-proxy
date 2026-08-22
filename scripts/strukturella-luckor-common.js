#!/usr/bin/env node
try { require('dotenv').config(); } catch (_) { /* optional */ }
const axios = require('axios');
const { buildStrukturellaLuckor } = require('../lib/strukturella-luckor');

const KUNDDATA = 'KUNDDATA';
const TJANSTER = 'Risker kopplad till tjänster';
const OVRIGA = process.env.OVRIGA_RISKER_TABLE_ID || 'tblWw6tM2YOTYFn2H';

async function fetchAll(token, baseId, table) {
  const records = [];
  let offset = '';
  do {
    let url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?pageSize=100`;
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

async function loadStrukturellaLuckor() {
  const token = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  if (!token) {
    return { skipped: true, reason: 'AIRTABLE_ACCESS_TOKEN saknas' };
  }
  const [kunder, tjanster, ovriga] = await Promise.all([
    fetchAll(token, baseId, KUNDDATA),
    fetchAll(token, baseId, TJANSTER),
    fetchAll(token, baseId, OVRIGA)
  ]);
  return buildStrukturellaLuckor({ kunder, tjanster, ovriga });
}

module.exports = { fetchAll, loadStrukturellaLuckor };
