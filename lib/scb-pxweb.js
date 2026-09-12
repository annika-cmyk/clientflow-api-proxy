/**
 * SCB PxWebApi v2 klient.
 *
 * OBS: Denna integration är konceptuellt samma som Miniboks AML-kollen (branschnyckeltal),
 * men är implementerad separat här eftersom ClientFlow är en egen kodbas.
 */
const axios = require('axios');

const SCB_API_BASE = 'https://statistikdatabasen.scb.se/api/v2';
const DEFAULT_TABLE_GROSS_MARGIN = 'TAB1270'; // Branschnyckeltal efter näringsgren SNI 2007...
const DEFAULT_CONTENTS_GROSS_MARGIN = '0000034A'; // Bruttovinstmarginal (procent)
const DEFAULT_SIZECLASS = 'TOT'; // totalt
const DEFAULT_QUARTILE = 'Med'; // median

function normalizeSniGroupFromSniCode(sniCode, availableGroups) {
  const raw = String(sniCode || '').replace(/[^\d]/g, '');
  if (!raw) return '';
  const groups = availableGroups instanceof Set ? availableGroups : new Set((availableGroups || []).map(String));
  const two = raw.slice(0, 2);
  if (two && groups.has(two)) return two;
  return two || '';
}

async function fetchTableMetadata(tableId, { lang = 'sv', timeoutMs = 15000 } = {}) {
  const url = `${SCB_API_BASE}/tables/${encodeURIComponent(tableId)}/metadata`;
  const res = await axios.get(url, { params: { lang }, timeout: timeoutMs });
  return res.data;
}

async function fetchTableData(tableId, selection, { lang = 'sv', outputFormat = 'json-stat2', timeoutMs = 20000 } = {}) {
  const url = `${SCB_API_BASE}/tables/${encodeURIComponent(tableId)}/data`;
  const res = await axios.post(
    url,
    { selection: selection || [] },
    { params: { lang, outputFormat }, timeout: timeoutMs, headers: { 'Content-Type': 'application/json' } }
  );
  // API returns string; axios may parse if content-type json, but be safe.
  if (typeof res.data === 'string') return JSON.parse(res.data);
  return res.data;
}

function pickLastAvailableYear(metadata, wantedYear) {
  const last = Number((metadata && metadata.dimension && metadata.dimension.Tid && metadata.dimension.Tid.category && metadata.dimension.Tid.category.index && Object.keys(metadata.dimension.Tid.category.index).slice(-1)[0]) || 0);
  const maxYear = Number.isFinite(last) && last ? last : 0;
  const want = parseInt(String(wantedYear || ''), 10);
  if (!Number.isFinite(want) || !want) return String(maxYear || '');
  if (maxYear && want > maxYear) return String(maxYear);
  return String(want);
}

function extractSingleValue(jsonStat) {
  // json-stat2: {value:[...], dimension:{...}}. We request 1 cell.
  const values = jsonStat && jsonStat.value;
  if (Array.isArray(values) && values.length) return values[0];
  return null;
}

async function fetchGrossMarginPercentBySni({
  sniCode,
  year,
  tableId = DEFAULT_TABLE_GROSS_MARGIN,
  sizeClass = DEFAULT_SIZECLASS,
  quartile = DEFAULT_QUARTILE,
  contentsCode = DEFAULT_CONTENTS_GROSS_MARGIN,
  lang = 'sv',
} = {}) {
  const meta = await fetchTableMetadata(tableId, { lang });
  const groups = new Set(Object.keys(meta?.dimension?.SNI2007?.category?.index || {}));
  const sniGroup = normalizeSniGroupFromSniCode(sniCode, groups);
  if (!sniGroup) {
    return { ok: false, error: 'SNI-kod saknas eller kunde inte mappas till SCB-grupp.', value: null, ref: { tableId, contentsCode } };
  }
  const y = pickLastAvailableYear(meta, year);
  if (!y) {
    return { ok: false, error: 'SCB-tabellen saknar år.', value: null, ref: { tableId, contentsCode, sniGroup } };
  }

  const data = await fetchTableData(
    tableId,
    [
      { variableCode: 'SNI2007', valueCodes: [sniGroup] },
      { variableCode: 'Storleksklass', valueCodes: [String(sizeClass)] },
      { variableCode: 'AKvartil', valueCodes: [String(quartile)] },
      { variableCode: 'ContentsCode', valueCodes: [String(contentsCode)] },
      { variableCode: 'Tid', valueCodes: [String(y)] },
    ],
    { lang }
  );

  const v = extractSingleValue(data);
  const num = typeof v === 'number' ? v : (v == null ? null : Number(String(v).replace(',', '.')));
  if (!Number.isFinite(num)) {
    return { ok: false, error: 'SCB returnerade inget värde.', value: null, ref: { tableId, contentsCode, sniGroup, year: y } };
  }
  return { ok: true, value: num, ref: { tableId, contentsCode, sniGroup, year: y, sizeClass, quartile } };
}

module.exports = {
  SCB_API_BASE,
  DEFAULT_TABLE_GROSS_MARGIN,
  DEFAULT_CONTENTS_GROSS_MARGIN,
  DEFAULT_SIZECLASS,
  DEFAULT_QUARTILE,
  normalizeSniGroupFromSniCode,
  fetchTableMetadata,
  fetchTableData,
  fetchGrossMarginPercentBySni,
};

