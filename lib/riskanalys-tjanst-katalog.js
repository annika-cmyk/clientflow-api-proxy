'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DATA_PATH = path.join(__dirname, 'data', 'riskanalys-tjanst-katalog.json');

let _cached = null;

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

function foldName(v) {
  return trimStr(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadCatalog() {
  if (_cached) return _cached;
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  _cached = JSON.parse(raw);
  return _cached;
}

function catalogKeys(catalog) {
  return Object.keys(catalog.tjanster || {});
}

function resolveTjanstKey(namn, catalog = loadCatalog()) {
  const raw = trimStr(namn);
  if (!raw) return '';
  const folded = foldName(raw);
  const aliases = catalog.aliases || {};
  if (aliases[folded]) return aliases[folded];

  const keys = catalogKeys(catalog);
  const byFold = new Map(keys.map((key) => [foldName(key), key]));
  if (byFold.has(folded)) return byFold.get(folded);

  for (const key of keys) {
    const fk = foldName(key);
    if (folded.includes(fk) || fk.includes(folded)) return key;
  }

  const words = folded.split(' ').filter((w) => w.length > 3);
  let best = '';
  let bestScore = 0;
  keys.forEach((key) => {
    const fk = foldName(key);
    const kw = fk.split(' ').filter((w) => w.length > 3);
    const hit = words.filter((w) => kw.includes(w)).length;
    if (hit > bestScore) {
      bestScore = hit;
      best = key;
    }
  });
  if (bestScore >= 2) return best;
  return '';
}

function sektorKompletteringFor(key, catalog = loadCatalog()) {
  const fk = foldName(key);
  const prefix = fk.split(' ')[0];
  if (!prefix || prefix.length < 4) return [];
  return (catalog.sektorKomplettering || []).filter((row) => {
    const nk = foldName(row.nyckel || '');
    return nk.startsWith(prefix) || nk.includes(prefix);
  });
}

function lookup(namn, catalog = loadCatalog()) {
  const key = resolveTjanstKey(namn, catalog);
  if (!key) return null;
  return {
    key,
    input: trimStr(namn),
    rader: (catalog.tjanster && catalog.tjanster[key]) ? catalog.tjanster[key].slice() : [],
    sektorKomplettering: sektorKompletteringFor(key, catalog)
  };
}

function clip(text, max = 900) {
  const t = trimStr(text);
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function formatPromptBlock(namn, catalog = loadCatalog()) {
  const match = lookup(namn, catalog);
  if (!match || (!match.rader.length && !match.sektorKomplettering.length)) return '';

  const parts = [
    'RISKANALYS-UNDERLAG (ClientFlow-katalog för denna tjänst):',
    `Matchad tjänst i katalogen: ${match.key}${match.input !== match.key ? ` (ifrån «${match.input}»)` : ''}.`,
    'Detta är förslagsunderlag — inte facit. Använd det för hot, sårbarheter, indikatorer och åtgärder, kalibrera mot byråprofil och gör en egen bedömning. Kopiera inte rakt av.'
  ];

  match.rader.forEach((row, i) => {
    parts.push(`\n${i + 1}. Hotkategori: ${row.hotkategori || 'PT'}`);
    if (row.hot) parts.push(`Hot: ${clip(row.hot, 700)}`);
    if (row.sarbarhet) parts.push(`Sårbarhet: ${clip(row.sarbarhet, 500)}`);
    if (row.riskindikatorer) parts.push(`Riskindikatorer: ${clip(row.riskindikatorer, 700)}`);
    if (row.atgarder) parts.push(`Riskreducerande åtgärder (förslag): ${clip(row.atgarder, 500)}`);
    if (row.kalla) parts.push(`Källa: ${row.kalla}${row.lank ? ` — ${row.lank}` : ''}`);
  });

  if (match.sektorKomplettering.length) {
    parts.push('\nSektor-/metodkomplettering (vägledning som kan stärka analysen):');
    match.sektorKomplettering.slice(0, 4).forEach((row, i) => {
      parts.push(`\nS${i + 1}. ${row.nyckel}`);
      if (row.hot) parts.push(`Hot: ${clip(row.hot, 400)}`);
      if (row.sarbarhet) parts.push(`Sårbarhet: ${clip(row.sarbarhet, 300)}`);
      if (row.riskindikatorer) parts.push(`Indikatorer: ${clip(row.riskindikatorer, 400)}`);
    });
  }

  return parts.join('\n');
}

const PROMPT_RULES = `RISKANALYS-KATALOG:
- Om RISKANALYS-UNDERLAG finns i användarmeddelandet: använd det som strukturerat underlag för hot, sårbarheter, indikatorer och åtgärder.
- Katalogen gäller redovisningsbyråers tjänster — inte bankprodukter. Generalisera inte till transaktionsmonitorering eller finansiell verksamhet.
- Katalogen ersätter inte din egen analys eller byråprofilen. Fyll luckor, lägg till TF där det saknas, och skriv egna formuleringar.
- Behåll och använd angivna källor när de finns i katalogen.`;

module.exports = {
  DATA_PATH,
  loadCatalog,
  foldName,
  resolveTjanstKey,
  lookup,
  formatPromptBlock,
  PROMPT_RULES
};
