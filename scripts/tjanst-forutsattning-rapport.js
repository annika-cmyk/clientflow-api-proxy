#!/usr/bin/env node
/**
 * Listar kunder med kundberoende tjänsteförutsättningar som inte bedömts,
 * och en granskningslista för oklassificerade åtgärder i tjänstemallen.
 */
try { require('dotenv').config(); } catch (_) { /* optional */ }
const TjanstForutsattning = require('../public/js/tjanst-forutsattning');
const { mapByraTjanstRecord } = require('../lib/byra-tjanst-map');

const KUND_TABLE = 'KUNDDATA';
const TJANST_TABLE = 'Risker kopplad till tjänster';

async function fetchAll(token, baseId, table) {
  const records = [];
  let offset = '';
  do {
    let url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?pageSize=100`;
    if (offset) url += `&offset=${encodeURIComponent(offset)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Airtable ${res.status} ${await res.text()}`);
    const data = await res.json();
    records.push(...(data.records || []));
    offset = data.offset || '';
  } while (offset);
  return records;
}

async function main() {
  const token = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  if (!token) {
    console.log('AIRTABLE_ACCESS_TOKEN saknas — hoppar över live-rapport.');
    return;
  }
  const [kunder, tjanster] = await Promise.all([
    fetchAll(token, baseId, KUND_TABLE),
    fetchAll(token, baseId, TJANST_TABLE)
  ]);
  const tjansterById = {};
  tjanster.forEach((r) => {
    if (r && r.id) tjansterById[r.id] = r;
  });
  const migrering = TjanstForutsattning.buildMigreringsrapport({ kunder, tjansterById });
  const granskningslista = TjanstForutsattning.buildGranskningslista(tjanster.map(mapByraTjanstRecord));
  const oklassade = granskningslista
    .map((t) => ({
      namn: t.namn,
      atgarder: t.atgarder.filter((a) => !a.klassificerad)
    }))
    .filter((t) => t.atgarder.length);
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    totaltKunder: kunder.length,
    totaltTjanster: tjanster.length,
    oklassificeradeAtgarder: oklassade,
    ...migrering
  }, null, 2));
}

main().catch((err) => {
  console.error(err.response?.data || err.message);
  process.exit(1);
});
