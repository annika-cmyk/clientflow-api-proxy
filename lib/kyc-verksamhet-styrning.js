'use strict';

const FACTORS = [
  {
    id: 'kontanter',
    kycField: 'kontanter',
    label: 'Kunder med mycket kontanta transaktioner',
    typ: 'Verksamhetsspecifika riskfaktorer',
    aliases: [
      'kontantintensiv verksamhet',
      'kontanthantering',
      'kunder med mycket kontanta transaktioner'
    ]
  },
  {
    id: 'kryptovaluta',
    kycField: 'kryptovaluta',
    label: 'Kunder som handlar med kryptovaluta',
    typ: 'Verksamhetsspecifika riskfaktorer',
    aliases: [
      'kryptovaluta',
      'kunder som handlar med kryptovaluta',
      'crypto',
      'virtuell valuta'
    ]
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

function isVerksamhetRecord(rec) {
  return /verksamhet/i.test(recordTyp(rec));
}

function matchFactor(namn) {
  const key = fold(namn);
  if (!key) return null;
  for (const factor of FACTORS) {
    if (key === fold(factor.label) || key.indexOf(fold(factor.label)) !== -1) return factor;
    for (const alias of factor.aliases) {
      if (key.indexOf(fold(alias)) !== -1) return factor;
    }
  }
  return null;
}

function parseKyc(raw) {
  if (raw == null || raw === '') return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function kycJa(kyc, field) {
  return String((kyc && kyc[field]) || '').trim().toLowerCase() === 'ja';
}

function verksamhetRecordsFromList(records) {
  return (Array.isArray(records) ? records : []).filter((rec) => isVerksamhetRecord(rec));
}

function templateExistsForFactor(records, factorId) {
  const factor = FACTORS.find((f) => f.id === factorId);
  if (!factor) return false;
  return verksamhetRecordsFromList(records).some((rec) => {
    const matched = matchFactor(recordNamn(rec));
    return matched && matched.id === factor.id;
  });
}

function steeredRecordIds(records) {
  return verksamhetRecordsFromList(records)
    .filter((rec) => matchFactor(recordNamn(rec)) && rec.id)
    .map((rec) => rec.id);
}

function suggestedRecordIds(records, kyc) {
  const parsed = parseKyc(kyc);
  const out = [];
  for (const rec of verksamhetRecordsFromList(records)) {
    const matched = matchFactor(recordNamn(rec));
    if (!matched || !rec.id) continue;
    if (kycJa(parsed, matched.kycField)) out.push(rec.id);
  }
  return out;
}

function mergeIntoLinkedSet(linkedSet, records, kyc) {
  const set = linkedSet instanceof Set ? linkedSet : new Set(linkedSet || []);
  const steered = new Set(steeredRecordIds(records));
  const suggested = new Set(suggestedRecordIds(records, kyc));
  steered.forEach((id) => set.delete(id));
  suggested.forEach((id) => set.add(id));
  return set;
}

function mergeLinkedIds(linkedIds, records, kyc) {
  const merged = mergeIntoLinkedSet(new Set(Array.isArray(linkedIds) ? linkedIds : []), records, kyc);
  return [...merged];
}

function linkedIdsChanged(before, after) {
  const a = [...new Set(Array.isArray(before) ? before : [])].sort();
  const b = [...new Set(Array.isArray(after) ? after : [])].sort();
  if (a.length !== b.length) return true;
  return a.some((id, i) => id !== b[i]);
}

function countKycJa(kunder, factorId) {
  const factor = FACTORS.find((f) => f.id === factorId);
  if (!factor) return 0;
  let count = 0;
  for (const rec of kunder || []) {
    const kyc = parseKyc(rec.fields && rec.fields['KYC-formular (JSON)']);
    if (kycJa(kyc, factor.kycField)) count += 1;
  }
  return count;
}

function buildSaknadeRiskfaktorer(kunder, templates) {
  const verksamhet = verksamhetRecordsFromList(templates);
  return FACTORS.map((factor) => {
    const antalKunder = countKycJa(kunder, factor.id);
    const harMall = templateExistsForFactor(verksamhet, factor.id);
    const befintlig = verksamhet.find((rec) => {
      const matched = matchFactor(recordNamn(rec));
      return matched && matched.id === factor.id;
    });
    return {
      id: factor.id,
      label: factor.label,
      typ: factor.typ,
      antalKunder,
      saknas: antalKunder > 0 && !harMall,
      harUtkast: !!(befintlig && befintlig.fields && befintlig.fields.Aktuell === false),
      utkastId: befintlig && befintlig.fields && befintlig.fields.Aktuell === false ? befintlig.id : null,
      mallId: befintlig ? befintlig.id : null
    };
  }).filter((row) => row.saknas);
}

module.exports = {
  FACTORS,
  fold,
  matchFactor,
  parseKyc,
  kycJa,
  verksamhetRecordsFromList,
  templateExistsForFactor,
  steeredRecordIds,
  suggestedRecordIds,
  mergeIntoLinkedSet,
  mergeLinkedIds,
  linkedIdsChanged,
  countKycJa,
  buildSaknadeRiskfaktorer
};
