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

/** Hot/rader om byråns eget klientmedelskonto / genomgångskonto. */
const KLIENTMEDEL_RE = /klientmedelskonto|genomg[åa]ngskonto/i;

function rowMentionsKlientmedel(row) {
  if (!row || typeof row !== 'object') return false;
  const blob = [row.nyckel, row.hotkategori, row.hot, row.sarbarhet, row.riskindikatorer, row.atgarder]
    .map(trimStr)
    .filter(Boolean)
    .join('\n');
  return KLIENTMEDEL_RE.test(blob);
}

/**
 * När byrån svarat Nej på klientmedelskonto: ta bort katalograder som
 * förutsätter att byrån har/använder ett sådant konto.
 */
function filterRowsForKlientmedel(rows, hasKlientmedelskonto) {
  const list = Array.isArray(rows) ? rows : [];
  if (hasKlientmedelskonto !== false) return list.slice();
  return list.filter((row) => !rowMentionsKlientmedel(row));
}

function itemMentionsKlientmedel(item) {
  if (item == null) return false;
  if (typeof item === 'string') return KLIENTMEDEL_RE.test(item);
  if (typeof item !== 'object') return false;
  const blob = [
    item.nyckel,
    item.titel,
    item.namn,
    item.beskrivning,
    item.hot,
    item.kalla,
    item.kommentar,
    item.forslag
  ].map(trimStr).filter(Boolean).join('\n');
  return KLIENTMEDEL_RE.test(blob);
}

/** Ta bort AI-hot/rader om byråns klientmedelskonto när svaret är Nej. */
function filterKlientmedelItems(items, hasKlientmedelskonto) {
  const list = Array.isArray(items) ? items : [];
  if (hasKlientmedelskonto !== false) return list.slice();
  return list.filter((item) => !itemMentionsKlientmedel(item));
}

function isTaBortAndring(row) {
  const typ = trimStr(row && (row.typ || row.changeKind || row.kind)).toLowerCase();
  return typ === 'ta-bort' || typ === 'ta bort' || typ === 'remove' || typ === 'delete';
}

/**
 * Filtrera granskningsposter så att AI inte får föreslå/redigera
 * klientmedelskonto-/genomgångskonto-hot när byrån svarat Nej.
 * Borttagningsförslag behålls.
 */
function filterKlientmedelGranskning(poster, hasKlientmedelskonto) {
  const list = Array.isArray(poster) ? poster : [];
  if (hasKlientmedelskonto !== false) return list.slice();
  return list.map((p) => {
    if (!p || p.falt !== 'hot') return p;
    const next = Object.assign({}, p);
    if (Array.isArray(p.forslag)) {
      next.forslag = filterKlientmedelItems(p.forslag, false);
    } else if (typeof p.forslag === 'string' && itemMentionsKlientmedel(p.forslag)) {
      next.forslag = '';
      next.andra = false;
    }
    if (Array.isArray(p.andringar)) {
      next.andringar = p.andringar.filter((row) => {
        if (!row) return false;
        if (isTaBortAndring(row)) return true;
        return !itemMentionsKlientmedel(row);
      });
    }
    return next;
  });
}

function formatPromptBlock(namn, catalog = loadCatalog(), opts = {}) {
  const match = lookup(namn, catalog);
  if (!match || (!match.rader.length && !match.sektorKomplettering.length)) return '';

  const hasKlientmedelskonto = opts && Object.prototype.hasOwnProperty.call(opts, 'hasKlientmedelskonto')
    ? opts.hasKlientmedelskonto
    : undefined;
  const rader = filterRowsForKlientmedel(match.rader, hasKlientmedelskonto);
  const sektor = filterRowsForKlientmedel(match.sektorKomplettering, hasKlientmedelskonto);
  if (!rader.length && !sektor.length) return '';

  const parts = [
    'RISKANALYS-UNDERLAG (ClientFlow-katalog för denna tjänst):',
    `Matchad tjänst i katalogen: ${match.key}${match.input !== match.key ? ` (ifrån «${match.input}»)` : ''}.`,
    'Detta är förslagsunderlag — inte facit. Använd det för hot, sårbarheter, indikatorer och åtgärder, kalibrera mot byråprofil och gör en egen bedömning. Kopiera inte rakt av.'
  ];
  if (hasKlientmedelskonto === false) {
    parts.push('OBS: Byrån har svarat att den inte har klientmedelskonto. Föreslå inte hot om byråns klientmedelskonto eller genomgångskonto via byråns egna medel.');
  }

  rader.forEach((row, i) => {
    parts.push(`\n${i + 1}. Hotkategori: ${row.hotkategori || 'PT'}`);
    if (row.hot) parts.push(`Hot: ${clip(row.hot, 700)}`);
    if (row.sarbarhet) parts.push(`Sårbarhet: ${clip(row.sarbarhet, 500)}`);
    if (row.riskindikatorer) parts.push(`Riskindikatorer: ${clip(row.riskindikatorer, 700)}`);
    if (row.atgarder) parts.push(`Riskreducerande åtgärder (förslag): ${clip(row.atgarder, 500)}`);
    if (row.kalla) parts.push(`Källa: ${row.kalla}${row.lank ? ` — ${row.lank}` : ''}`);
  });

  if (sektor.length) {
    parts.push('\nSektor-/metodkomplettering (vägledning som kan stärka analysen):');
    sektor.slice(0, 4).forEach((row, i) => {
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
- Katalogen ersätter inte din egen analys eller byråprofilen. Fyll luckor och skriv egna formuleringar med konkret mekanism (felaktig uppgift → pengar in/flyttas/legitimeras → byråns roll → PT, TF eller båda). Avfärda inte TF bara för att tjänsten inte avser ideell organisation eller utlandsbetalning. Kopiera inte påhittade terrororganisationer eller vaga "kan användas för att tvätta pengar".
- Behåll och använd angivna källor när de finns i katalogen.`;

module.exports = {
  DATA_PATH,
  loadCatalog,
  foldName,
  resolveTjanstKey,
  lookup,
  rowMentionsKlientmedel,
  filterRowsForKlientmedel,
  itemMentionsKlientmedel,
  filterKlientmedelItems,
  filterKlientmedelGranskning,
  formatPromptBlock,
  PROMPT_RULES,
  KLIENTMEDEL_RE
};
