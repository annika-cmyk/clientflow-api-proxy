const RiskSkala = require('../public/js/risk-skala');

const UPPFOLJNING_FIELD = 'KYC uppföljning (JSON)';

const KYC_TIER_YEARS = {
  lag: 5,
  normal: 3,
  hog: 1
};

const TRIGGER_TYPES = {
  NY_ADRESS: 'ny_adress',
  AGARFORANDRING: 'agarförändring',
  STOR_TRANSAKTION: 'stor_transaktion'
};

const HIGH_RISK_FACTOR_PATTERNS = [
  /pep\s+eller\s+rca/i,
  /^pep$/i,
  /kontantintensiv/i,
  /högriskl[äa]nder|hogriskland/i,
  /kopplingar till utlandet/i
];

function trim(value) {
  return String(value == null ? '' : value).trim();
}

function toArray(value) {
  if (Array.isArray(value)) return value.map((x) => trim(x)).filter(Boolean);
  const s = trim(value);
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed.map((x) => trim(x)).filter(Boolean) : [s];
    } catch (_) { /* fall through */ }
  }
  return s.split(/[,;\n]+/).map((x) => trim(x)).filter(Boolean);
}

function parseUppfoljning(raw) {
  if (!raw) return { triggers: [] };
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return {
      addressSnapshot: trim(raw.addressSnapshot),
      huvudmanSnapshot: trim(raw.huvudmanSnapshot),
      triggers: Array.isArray(raw.triggers) ? raw.triggers.filter(Boolean) : [],
      lastTriggerArchiveAt: trim(raw.lastTriggerArchiveAt)
    };
  }
  try {
    const parsed = JSON.parse(String(raw));
    return parseUppfoljning(parsed);
  } catch (_) {
    return { triggers: [] };
  }
}

function serializeUppfoljning(data) {
  const next = {
    addressSnapshot: trim(data?.addressSnapshot),
    huvudmanSnapshot: trim(data?.huvudmanSnapshot),
    triggers: Array.isArray(data?.triggers) ? data.triggers.filter(Boolean) : [],
    lastTriggerArchiveAt: trim(data?.lastTriggerArchiveAt) || undefined
  };
  if (!next.addressSnapshot) delete next.addressSnapshot;
  if (!next.huvudmanSnapshot) delete next.huvudmanSnapshot;
  if (!next.triggers.length) delete next.triggers;
  if (!next.lastTriggerArchiveAt) delete next.lastTriggerArchiveAt;
  return JSON.stringify(next);
}

function normalizeAddress(fields) {
  return trim(fields?.Address || fields?.address || '');
}

function normalizeHuvudman(fields) {
  return trim(fields?.['Verklig huvudman'] || fields?.huvudmanInfo || '');
}

function readRiskniva(fields) {
  return trim(fields?.Riskniva || fields?.['sammanlagd risk'] || fields?.['Risknivå']);
}

function listRiskhojandeOvrigt(fields) {
  return toArray(fields?.['Riskhöjande faktorer övrigt']);
}

function readPepIndicator(fields) {
  const pepField = toArray(fields?.PEP).join(', ');
  if (/ja|pep/i.test(pepField) && !/inte pep|nej/i.test(pepField)) return true;
  try {
    const kyc = JSON.parse(fields?.['KYC-formular (JSON)'] || '{}');
    const pep = trim(kyc.pep || kyc.pepStatus);
    if (pep && !/^nej/i.test(pep)) return true;
  } catch (_) { /* ignore */ }
  return listRiskhojandeOvrigt(fields).some((namn) => /pep/i.test(namn));
}

function hasHighRiskKycProfile(fields) {
  if (!fields || typeof fields !== 'object') return false;
  if (readPepIndicator(fields)) return true;
  const factors = listRiskhojandeOvrigt(fields);
  if (factors.some((namn) => HIGH_RISK_FACTOR_PATTERNS.some((re) => re.test(namn)))) return true;
  const rank = RiskSkala.riskRank(readRiskniva(fields));
  return rank >= RiskSkala.riskRank('Hög');
}

function classifyKycTier(fields) {
  if (hasHighRiskKycProfile(fields)) return 'hog';
  const rank = RiskSkala.riskRank(readRiskniva(fields));
  if (!rank || rank <= RiskSkala.riskRank('Låg')) return 'lag';
  return 'normal';
}

function kycArchiveYears(fields) {
  const tier = classifyKycTier(fields);
  return KYC_TIER_YEARS[tier] || KYC_TIER_YEARS.normal;
}

function kycTierLabel(tier) {
  if (tier === 'lag') return 'Lågrisk';
  if (tier === 'hog') return 'Högrisk';
  return 'Normalrisk';
}

function buildSnapshots(fields) {
  return {
    addressSnapshot: normalizeAddress(fields),
    huvudmanSnapshot: normalizeHuvudman(fields)
  };
}

function detectTriggers(prevFields, nextFields, { avvikelseTyp, today } = {}) {
  const day = trim(today) || new Date().toISOString().slice(0, 10);
  const triggers = [];
  const prevAddr = normalizeAddress(prevFields);
  const nextAddr = normalizeAddress(nextFields);
  if (prevAddr && nextAddr && prevAddr !== nextAddr) {
    triggers.push({ type: TRIGGER_TYPES.NY_ADRESS, at: day, detail: nextAddr });
  }
  const prevHm = normalizeHuvudman(prevFields);
  const nextHm = normalizeHuvudman(nextFields);
  if (prevHm && nextHm && prevHm !== nextHm) {
    triggers.push({ type: TRIGGER_TYPES.AGARFORANDRING, at: day, detail: nextHm.slice(0, 120) });
  }
  const typ = trim(avvikelseTyp);
  if (/ovanlig transaktion/i.test(typ)) {
    triggers.push({ type: TRIGGER_TYPES.STOR_TRANSAKTION, at: day, detail: typ });
  }
  return triggers;
}

function mergeTriggers(existing, incoming) {
  const list = Array.isArray(existing?.triggers) ? [...existing.triggers] : [];
  (incoming || []).forEach((trigger) => {
    if (!trigger || !trigger.type) return;
    const dup = list.some((t) => t.type === trigger.type && t.at === trigger.at);
    if (!dup) list.push(trigger);
  });
  return list;
}

function applyDetectedTriggers(existingRaw, prevFields, nextFields, opts = {}) {
  const existing = parseUppfoljning(existingRaw);
  const detected = detectTriggers(prevFields, nextFields, opts);
  if (!detected.length) {
    const snapshots = buildSnapshots(nextFields);
    return {
      changed: false,
      uppfoljning: {
        ...existing,
        addressSnapshot: snapshots.addressSnapshot || existing.addressSnapshot,
        huvudmanSnapshot: snapshots.huvudmanSnapshot || existing.huvudmanSnapshot,
        triggers: existing.triggers || []
      },
      detected: []
    };
  }
  const uppfoljning = {
    ...existing,
    ...buildSnapshots(nextFields),
    triggers: mergeTriggers(existing, detected)
  };
  return { changed: true, uppfoljning, detected };
}

function clearTriggersAfterNewKyc(existingRaw, fields) {
  const snapshots = buildSnapshots(fields);
  return {
    addressSnapshot: snapshots.addressSnapshot,
    huvudmanSnapshot: snapshots.huvudmanSnapshot,
    triggers: [],
    lastTriggerArchiveAt: undefined
  };
}

function hasPendingKycTriggers(uppfoljningRaw) {
  const data = parseUppfoljning(uppfoljningRaw);
  return Array.isArray(data.triggers) && data.triggers.length > 0;
}

function markTriggersArchived(uppfoljningRaw, today) {
  const data = parseUppfoljning(uppfoljningRaw);
  return {
    ...data,
    triggers: [],
    lastTriggerArchiveAt: trim(today) || new Date().toISOString().slice(0, 10)
  };
}

module.exports = {
  UPPFOLJNING_FIELD,
  KYC_TIER_YEARS,
  TRIGGER_TYPES,
  parseUppfoljning,
  serializeUppfoljning,
  classifyKycTier,
  kycArchiveYears,
  kycTierLabel,
  hasHighRiskKycProfile,
  detectTriggers,
  applyDetectedTriggers,
  clearTriggersAfterNewKyc,
  hasPendingKycTriggers,
  markTriggersArchived,
  normalizeAddress,
  normalizeHuvudman
};
