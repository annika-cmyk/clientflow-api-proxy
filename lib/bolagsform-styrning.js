'use strict';

/**
 * Styrning av kundresidual utifrån kundens Bolagsform (Bolagsverket/DB)
 * mot byråns analyserade riskfaktorer «Kunder med bolagsform …».
 */

const KUND_RESIDUAL_TYP = 'Riskfaktorer kopplat till kund';

const FORM_GROUPS = [
  {
    key: 'aktiebolag',
    label: 'Aktiebolag',
    aliases: ['ab', 'aktiebolag', 'privat aktiebolag', 'publikt aktiebolag']
  },
  {
    key: 'enskild firma',
    label: 'Enskild firma',
    aliases: [
      'ef',
      'enskild firma',
      'enskild naringsverksamhet',
      'enskild naringsidkare',
      'fysisk person',
      'fysiska personer'
    ]
  },
  {
    key: 'handelsbolag',
    label: 'Handelsbolag',
    aliases: ['hb', 'handelsbolag']
  },
  {
    key: 'kommanditbolag',
    label: 'Kommanditbolag',
    aliases: ['kb', 'kommanditbolag']
  },
  {
    key: 'ekonomisk forening',
    label: 'Ekonomisk förening',
    aliases: ['ekonomisk forening', 'ek. for.', 'ek forening', 'ek.for.']
  },
  {
    key: 'bostadsrattsforening',
    label: 'Bostadsrättsförening',
    aliases: ['brf', 'bostadsrattsforening', 'bostadsrattsforening (brf)']
  },
  {
    key: 'ideell forening',
    label: 'Ideell förening',
    aliases: ['ideell forening', 'idiell forening']
  },
  {
    key: 'stiftelse',
    label: 'Stiftelse',
    aliases: ['stiftelse']
  },
  {
    key: 'filial',
    label: 'Filial/utländskt bolag',
    aliases: ['filial', 'filial/utlandskt bolag', 'utlandskt bolag']
  },
  {
    key: 'region',
    label: 'Regioner',
    aliases: ['region', 'regioner']
  }
];

function fold(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function canonicalize(raw) {
  const cleaned = String(raw || '')
    .replace(/\s*[·•].*$/, '')
    .replace(/\s*:\s*\d+\s*$/, '')
    .replace(/\s*\(\s*ca\s*[^)]*\)\s*$/i, '')
    .trim();
  const key = fold(cleaned);
  if (!key || key.length > 60) return null;
  for (const g of FORM_GROUPS) {
    if (fold(g.label) === key) return g;
    if (g.aliases.some((a) => fold(a) === key)) return g;
  }
  if (!/^[a-z0-9/().\-\s]+$/i.test(cleaned)) return null;
  if (/\s(och|med|for|fran|som|i|av|till|pa)\s/i.test(cleaned) && cleaned.split(/\s+/).length > 4) {
    return null;
  }
  return { key, label: cleaned, aliases: [key] };
}

function sameForm(a, b) {
  const ca = canonicalize(a);
  const cb = canonicalize(b);
  return !!(ca && cb && ca.key === cb.key);
}

function recordNamn(rec) {
  if (!rec) return '';
  const f = rec.fields || rec;
  return String(f.Riskfaktor || f['Riskfaktor'] || rec.namn || '').trim();
}

function recordBeskrivning(rec) {
  if (!rec) return '';
  const f = rec.fields || rec;
  return String(f.Beskrivning || f.beskrivning || '').trim();
}

function recordTyp(rec) {
  if (!rec) return '';
  const f = rec.fields || rec;
  return String(f['Typ av riskfaktor'] || '').trim();
}

function isKundRecord(rec) {
  return /riskfaktorer kopplat till kund/i.test(recordTyp(rec));
}

function kundRecordsFromList(records) {
  return (Array.isArray(records) ? records : []).filter((rec) => isKundRecord(rec));
}

function extractFormsFromText(text) {
  const raw = String(text || '');
  if (!raw.trim()) return [];
  const out = [];
  const seen = new Set();

  function add(formRaw) {
    const g = canonicalize(formRaw);
    if (!g || seen.has(g.key)) return;
    seen.add(g.key);
    out.push(g.label);
  }

  const prefRe = /kunder med bolagsform(?:erna)?\s*[:\-]?\s*([^\n.;]+)/gi;
  let m;
  while ((m = prefRe.exec(raw))) {
    String(m[1] || '')
      .split(/[,;/]| och /i)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach(add);
  }

  const formRe = /bolagsformen\s+([A-Za-zÅÄÖåäöÉé0-9()/.\- ]{1,40})/gi;
  while ((m = formRe.exec(raw))) {
    add(m[1]);
  }

  return out;
}

function extractFormsFromRecord(rec) {
  return extractFormsFromText(`${recordNamn(rec)}\n${recordBeskrivning(rec)}`);
}

function isBolagsformRecord(rec) {
  return isKundRecord(rec) && extractFormsFromRecord(rec).length > 0;
}

function bolagsformRecordsFromList(records) {
  return kundRecordsFromList(records).filter((rec) => isBolagsformRecord(rec));
}

function customerBolagsform(fieldsOrValue) {
  if (fieldsOrValue == null || fieldsOrValue === '') return '';
  if (typeof fieldsOrValue === 'string') return String(fieldsOrValue).trim();
  const f = fieldsOrValue.fields || fieldsOrValue;
  const direct = String(f.Bolagsform || f['Bolagsform'] || '').trim();
  if (direct) return direct;
  let kyc = f['KYC-formular (JSON)'] || f.kyc || null;
  if (typeof kyc === 'string') {
    try {
      kyc = JSON.parse(kyc);
    } catch (_) {
      kyc = null;
    }
  }
  return String((kyc && kyc.bolagsform) || '').trim();
}

function factorMatchesCustomer(rec, bolagsform) {
  const cust = canonicalize(bolagsform);
  if (!cust) return false;
  return extractFormsFromRecord(rec).some((form) => sameForm(form, cust.label));
}

function steeredRecordIds(records) {
  return bolagsformRecordsFromList(records)
    .filter((rec) => rec && rec.id)
    .map((rec) => rec.id);
}

function suggestedRecordIds(records, bolagsformOrFields) {
  const form = customerBolagsform(bolagsformOrFields);
  if (!form) return [];
  const out = [];
  for (const rec of bolagsformRecordsFromList(records)) {
    if (!rec.id) continue;
    if (factorMatchesCustomer(rec, form)) out.push(rec.id);
  }
  return out;
}

function mergeIntoLinkedSet(linkedSet, records, bolagsformOrFields) {
  const set = linkedSet instanceof Set ? linkedSet : new Set(linkedSet || []);
  const steered = new Set(steeredRecordIds(records));
  const suggested = new Set(suggestedRecordIds(records, bolagsformOrFields));
  steered.forEach((id) => set.delete(id));
  suggested.forEach((id) => set.add(id));
  return set;
}

function mergeLinkedIds(linkedIds, records, bolagsformOrFields) {
  const merged = mergeIntoLinkedSet(
    new Set(Array.isArray(linkedIds) ? linkedIds : []),
    records,
    bolagsformOrFields
  );
  return [...merged];
}

function linkedIdsChanged(before, after) {
  const a = [...new Set(Array.isArray(before) ? before : [])].sort();
  const b = [...new Set(Array.isArray(after) ? after : [])].sort();
  if (a.length !== b.length) return true;
  return a.some((id, i) => id !== b[i]);
}

function suggestedFactorLabels(records, bolagsformOrFields) {
  const form = customerBolagsform(bolagsformOrFields);
  if (!form) return [];
  const labels = [];
  const seen = new Set();
  for (const rec of bolagsformRecordsFromList(records)) {
    if (!factorMatchesCustomer(rec, form)) continue;
    const namn = recordNamn(rec);
    if (!namn || seen.has(namn)) continue;
    seen.add(namn);
    labels.push(namn);
  }
  return labels;
}

function mergedBolagsformRiskfaktorName(forms) {
  const list = (Array.isArray(forms) ? forms : [])
    .map((f) => canonicalize(f))
    .filter(Boolean);
  const unique = [];
  const seen = new Set();
  list.forEach((g) => {
    if (seen.has(g.key)) return;
    seen.add(g.key);
    unique.push(g.label);
  });
  if (!unique.length) return '';
  if (unique.length === 1) return `Kunder med bolagsform ${unique[0]}`;
  return `Kunder med bolagsformerna ${unique.join(', ')}`;
}

module.exports = {
  KUND_RESIDUAL_TYP,
  FORM_GROUPS,
  fold,
  canonicalize,
  sameForm,
  recordNamn,
  recordTyp,
  isKundRecord,
  kundRecordsFromList,
  extractFormsFromText,
  extractFormsFromRecord,
  isBolagsformRecord,
  bolagsformRecordsFromList,
  customerBolagsform,
  factorMatchesCustomer,
  steeredRecordIds,
  suggestedRecordIds,
  mergeIntoLinkedSet,
  mergeLinkedIds,
  linkedIdsChanged,
  suggestedFactorLabels,
  mergedBolagsformRiskfaktorName
};
