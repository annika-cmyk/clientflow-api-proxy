'use strict';

const utsattKund = require('./utsatta-omraden-kund');
const { NIVA_SEU, NIVA_UTSATT } = require('./utsatta-omraden');

const FACTOR = {
  id: 'utsatt_omrade_se',
  label: 'Särskilt utsatt område i Sverige',
  aliases: [
    'sarskilt utsatt',
    'särskilt utsatt',
    'utsatt omrade',
    'utsatt område',
    'polisens utsatta',
    'uso_2025'
  ]
};

const STAT_LABELS = {
  EJ_KONTROLLERAD: 'Ej kontrollerad',
  EJ_TRFF: 'Ej i utsatt område',
  SEU: 'Särskilt utsatt område (SEU)',
  UTSATT: 'Utsatt område',
  GEO_FAIL: 'Kunde inte geokoda'
};

function fold(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function recordNamn(rec) {
  if (!rec) return '';
  const f = rec.fields || rec;
  return String(f.Riskfaktor || f['Riskfaktor'] || rec.namn || '').trim();
}

function recordTyp(rec) {
  if (!rec) return '';
  const f = rec.fields || rec;
  return String(f['Typ av riskfaktor'] || '').trim();
}

function isGeografiskRecord(rec) {
  return /geograf/i.test(recordTyp(rec));
}

function matchFactor(namn) {
  const key = fold(namn);
  if (!key) return null;
  if (key === fold(FACTOR.label) || key.indexOf(fold(FACTOR.label)) !== -1) return FACTOR;
  for (const alias of FACTOR.aliases) {
    if (key.indexOf(fold(alias)) !== -1) return FACTOR;
  }
  return null;
}

function parseStored(raw) {
  return utsattKund.parseStored(raw);
}

function hasHit(stored) {
  return !!(stored && stored.trff);
}

function geoRecordsFromList(records) {
  return (Array.isArray(records) ? records : []).filter((rec) => isGeografiskRecord(rec));
}

function steeredRecordIds(records) {
  return geoRecordsFromList(records)
    .filter((rec) => matchFactor(recordNamn(rec)) && rec.id)
    .map((rec) => rec.id);
}

function suggestedRecordIds(records, stored) {
  if (!hasHit(stored)) return [];
  return steeredRecordIds(records);
}

function mergeIntoLinkedSet(linkedSet, records, stored) {
  const set = linkedSet instanceof Set ? linkedSet : new Set(linkedSet || []);
  const steered = new Set(steeredRecordIds(records));
  const suggested = new Set(suggestedRecordIds(records, stored));
  steered.forEach((id) => set.delete(id));
  suggested.forEach((id) => set.add(id));
  return set;
}

function mergeLinkedIds(linkedIds, records, stored) {
  const merged = mergeIntoLinkedSet(new Set(Array.isArray(linkedIds) ? linkedIds : []), records, stored);
  return [...merged];
}

function linkedIdsChanged(before, after) {
  const a = [...new Set(Array.isArray(before) ? before : [])].sort();
  const b = [...new Set(Array.isArray(after) ? after : [])].sort();
  if (a.length !== b.length) return true;
  return a.some((id, i) => id !== b[i]);
}

function utsattStatLabel(stored) {
  if (!stored || !stored.kontrolleradAt) return STAT_LABELS.EJ_KONTROLLERAD;
  if (stored.trff) {
    if (stored.niva === NIVA_SEU) return STAT_LABELS.SEU;
    if (stored.niva === NIVA_UTSATT) return STAT_LABELS.UTSATT;
    return stored.niva || 'Träff i utsatt område';
  }
  if (stored.geocoding && stored.geocoding.ok === false) return STAT_LABELS.GEO_FAIL;
  return STAT_LABELS.EJ_TRFF;
}

function utsattStatForRecord(fields) {
  const stored = parseStored(fields && fields[utsattKund.FIELD]);
  return {
    label: utsattStatLabel(stored),
    stored,
    trff: !!(stored && stored.trff),
    kontrollerad: !!(stored && stored.kontrolleradAt)
  };
}

function aggregateUtsattStat(records) {
  const list = Array.isArray(records) ? records : [];
  const counts = {};
  let antalKontrollerade = 0;
  let antalTrff = 0;

  for (const rec of list) {
    const stat = utsattStatForRecord(rec.fields || {});
    if (!stat.kontrollerad) {
      counts[STAT_LABELS.EJ_KONTROLLERAD] = (counts[STAT_LABELS.EJ_KONTROLLERAD] || 0) + 1;
      continue;
    }
    antalKontrollerade += 1;
    if (stat.trff) antalTrff += 1;
    counts[stat.label] = (counts[stat.label] || 0) + 1;
  }

  const rader = Object.entries(counts)
    .map(([namn, antal]) => ({ namn, antal }))
    .sort((a, b) => b.antal - a.antal || a.namn.localeCompare(b.namn, 'sv'));

  return {
    antalKontrollerade,
    antalTrff,
    antalEjKontrollerade: list.length - antalKontrollerade,
    rader
  };
}

function recordMatchesUtsattStat(fields, paramNamn) {
  const sok = String(paramNamn == null ? '' : paramNamn).trim();
  if (!sok) return false;
  return utsattStatLabel(parseStored(fields && fields[utsattKund.FIELD])) === sok;
}

module.exports = {
  FACTOR,
  STAT_LABELS,
  fold,
  recordNamn,
  matchFactor,
  parseStored,
  hasHit,
  geoRecordsFromList,
  steeredRecordIds,
  suggestedRecordIds,
  mergeIntoLinkedSet,
  mergeLinkedIds,
  linkedIdsChanged,
  utsattStatLabel,
  utsattStatForRecord,
  aggregateUtsattStat,
  recordMatchesUtsattStat
};
