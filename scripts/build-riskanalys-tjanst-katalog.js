#!/usr/bin/env node
/**
 * Bygger lib/data/riskanalys-tjanst-katalog.json från Excel-underlag.
 * Kräver: npm install xlsx (dev) eller kör med python3 build-riskanalys-tjanst-katalog.py
 *
 * Användning: node scripts/build-riskanalys-tjanst-katalog.js [sökväg-till.xlsx]
 */
const fs = require('node:fs');
const path = require('node:path');

const outPath = path.join(__dirname, '../lib/data/riskanalys-tjanst-katalog.json');
const inPath = process.argv[2]
  || path.join(__dirname, '../lib/data/riskanalys_underlag_tjanster.xlsx');

let XLSX;
try {
  XLSX = require('xlsx');
} catch (_) {
  console.error('Saknar paketet xlsx. Kör: npm install --save-dev xlsx');
  console.error('Eller exportera JSON manuellt från Excel-underlaget.');
  process.exit(1);
}

if (!fs.existsSync(inPath)) {
  console.error('Fil saknas:', inPath);
  process.exit(1);
}

function fold(s) {
  return String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function normPtTf(raw) {
  const t = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (t === 'PT/TF' || t === 'BÅDA' || t === 'BADA') return 'Båda';
  if (t === 'TF') return 'TF';
  return 'PT';
}

const wb = XLSX.readFile(inPath);
const sheet = wb.Sheets['Riskanalys - underlag'] || wb.Sheets[wb.SheetNames.find((n) => /underlag/i.test(n)) || ''];
if (!sheet) {
  console.error('Hittade inte fliken Riskanalys - underlag');
  process.exit(1);
}
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
const headerIdx = rows.findIndex((r) => String(r[0] || '').trim() === 'Tjänst');
if (headerIdx < 0) {
  console.error('Hittade inte kolumnrubriken Tjänst');
  process.exit(1);
}

const tjanster = {};
const supplement = [];
rows.slice(headerIdx + 1).forEach((row) => {
  const svc = String(row[0] || '').trim();
  if (!svc) return;
  const item = {
    hotkategori: normPtTf(row[1]),
    hot: String(row[2] || '').trim(),
    sarbarhet: String(row[3] || '').trim(),
    riskindikatorer: String(row[4] || '').trim(),
    atgarder: String(row[9] || '').trim(),
    kalla: String(row[11] || '').trim(),
    lank: String(row[12] || '').trim()
  };
  if (svc.includes('(') && svc.length > 40) supplement.push({ nyckel: svc, ...item });
  else tjanster[svc] = tjanster[svc] || [], tjanster[svc].push(item);
});

const existing = fs.existsSync(outPath)
  ? JSON.parse(fs.readFileSync(outPath, 'utf8'))
  : {};
const payload = {
  version: 1,
  source: path.basename(inPath),
  generatedAt: new Date().toISOString().slice(0, 10),
  aliases: existing.aliases || {},
  tjanster,
  sektorKomplettering: supplement
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
console.log('Skrev', outPath, Object.keys(tjanster).length, 'tjänster,', supplement.length, 'kompletteringar');
