'use strict';

/**
 * Migrering: flagga befintliga riskposter som saknar motivering vid Förhöjd/Hög/Oacceptabel.
 *
 * Kör INTE mot produktion utan explicit godkännande.
 *
 * Usage:
 *   node scripts/migrate-risk-motivering-flag.js --dry-run
 *   node scripts/migrate-risk-motivering-flag.js --apply --table tjanster
 *   node scripts/migrate-risk-motivering-flag.js --apply --table ovriga
 *
 * Kräver AIRTABLE_ACCESS_TOKEN och AIRTABLE_BASE_ID.
 */

const axios = require('axios');
const RiskSkala = require('../public/js/risk-skala');
const RiskMotivering = require('../public/js/risk-motivering');

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
const TOKEN = process.env.AIRTABLE_ACCESS_TOKEN;
const TJANSTER_TABLE = process.env.RISK_ASSESSMENT_TABLE || 'Risker kopplad till tjänster';
const OVRIGA_TABLE = process.env.RISK_FACTORS_TABLE || 'Risker kopplade till kunden';

function parseArgs(argv) {
  const args = { dryRun: true, table: 'all' };
  (argv || []).forEach((arg) => {
    if (arg === '--apply') args.dryRun = false;
    if (arg === '--dry-run') args.dryRun = true;
    if (arg.startsWith('--table=')) args.table = arg.split('=')[1];
    if (arg === '--table' && argv[argv.indexOf(arg) + 1]) {
      args.table = argv[argv.indexOf(arg) + 1];
    }
  });
  return args;
}

function poangField(fields) {
  return fields['Riskpoäng'] || fields.Riskpoang || fields.Samspelsexempel || '';
}

function buildPatch(fields) {
  const raw = poangField(fields);
  const parsed = RiskSkala.parseRiskPoang(raw) || {};
  const needsFlag = RiskMotivering.migrationFlagForPoang(parsed);
  const already = parsed.kraver_uppdaterad_motivering === true;
  if (!needsFlag || already) return null;
  const next = Object.assign({}, parsed, { kraver_uppdaterad_motivering: true });
  return { Riskpoäng: RiskSkala.serializeRiskPoang(next) };
}

async function fetchAllRecords(tableName) {
  const records = [];
  let offset;
  const isTjanst = /tjänster|tjanster/i.test(tableName);
  const fieldCandidates = isTjanst
    ? ['Riskpoäng', 'Samspelsexempel', 'Task Name', 'Riskbedömning', 'Byrå ID', 'Aktuell']
    : ['Riskpoäng', 'Riskfaktor', 'Riskbedömning', 'Byrå ID', 'Typ av riskfaktor'];
  do {
    // eslint-disable-next-line no-await-in-loop
    const res = await axios.get(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(tableName)}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      params: {
        pageSize: 100,
        offset,
        'fields[]': fieldCandidates
      },
      timeout: 30000
    });
    records.push(...(res.data.records || []));
    offset = res.data.offset;
  } while (offset);
  return records;
}

async function migrateTable(tableName, dryRun) {
  const isTjanst = /tjänster|tjanster/i.test(tableName);
  const records = await fetchAllRecords(tableName);
  const pending = [];
  records.forEach((rec) => {
    const patch = buildPatch(rec.fields || {});
    if (!patch) return;
    pending.push({
      id: rec.id,
      name: rec.fields?.['Task Name'] || rec.fields?.Riskfaktor || rec.id,
      byraId: rec.fields?.['Byrå ID'] || '',
      typ: rec.fields?.['Typ av riskfaktor'] || (isTjanst ? 'Tjänst' : ''),
      riskbedomning: rec.fields?.['Riskbedömning'] || '',
      patch
    });
  });
  console.log(`\n${tableName}: ${pending.length} av ${records.length} poster behöver flagga kraver_uppdaterad_motivering`);
  pending.slice(0, 30).forEach((p) => {
    console.log(`  - ${p.name}${p.byraId ? ` (byrå ${p.byraId})` : ''}${p.riskbedomning ? ` — ${p.riskbedomning}` : ''}`);
  });
  if (pending.length > 30) console.log(`  … och ${pending.length - 30} till`);

  if (dryRun) {
    console.log('Dry-run — inga ändringar skrivna.');
    return { updated: 0, pending: pending.length };
  }

  let updated = 0;
  for (const item of pending) {
    // eslint-disable-next-line no-await-in-loop
    await axios.patch(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(tableName)}/${item.id}`, {
      fields: item.patch,
      typecast: true
    }, {
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      timeout: 15000
    });
    updated += 1;
  }
  console.log(`Uppdaterade ${updated} poster i ${tableName}.`);
  return { updated, pending: pending.length };
}

async function main() {
  if (!TOKEN) {
    console.error('AIRTABLE_ACCESS_TOKEN saknas.');
    process.exit(1);
  }
  const args = parseArgs(process.argv.slice(2));
  console.log(`Migrering riskmotivering (${args.dryRun ? 'DRY-RUN' : 'APPLY'})`);
  const tables = [];
  if (args.table === 'all' || args.table === 'tjanster') tables.push(TJANSTER_TABLE);
  if (args.table === 'all' || args.table === 'ovriga') tables.push(OVRIGA_TABLE);
  let total = 0;
  for (const table of tables) {
    // eslint-disable-next-line no-await-in-loop
    const result = await migrateTable(table, args.dryRun);
    total += result.pending;
  }
  console.log(`\nKlart. ${total} poster flaggade eller väntar på flaggning.`);
}

main().catch((err) => {
  console.error(err.response?.data || err.message);
  process.exit(1);
});
