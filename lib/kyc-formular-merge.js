/**
 * Merge sparade KYC-formulär utan att tappa utskick/signering.
 */

function normalizeStatus(status) {
  return String(status || '').trim();
}

function hasSentIndicators(kyc) {
  if (!kyc || typeof kyc !== 'object') return false;
  if (normalizeStatus(kyc.status) === 'Skickat till kund') return true;
  if (normalizeStatus(kyc.status) === 'Signerat') return true;
  if (String(kyc.inleedDokumentId || '').trim()) return true;
  if (String(kyc.utskickningsdatum || '').trim()) return true;
  return false;
}

function effectiveKycStatus(kyc) {
  const status = normalizeStatus(kyc?.status);
  if (status === 'Signerat') return 'Signerat';
  if (status === 'Skickat till kund') return 'Skickat till kund';
  if (String(kyc?.signeringsdatum || '').trim()) return 'Signerat';
  if (String(kyc?.inleedDokumentId || '').trim() || String(kyc?.utskickningsdatum || '').trim()) {
    return 'Skickat till kund';
  }
  return status || 'Sparat';
}

function preserveSendFields(existing, next) {
  const out = { ...next };
  const fields = ['inleedDokumentId', 'utskickningsdatum', 'signeringsdatum', 'receipt'];
  for (const field of fields) {
    const prev = existing?.[field];
    if (prev && !out[field]) out[field] = prev;
  }
  return out;
}

function resolveMergedStatus(existing, incoming, merged) {
  const existingStatus = normalizeStatus(existing?.status);
  const incomingStatus = normalizeStatus(incoming?.status);
  const mergedStatus = normalizeStatus(merged?.status);

  if (existingStatus === 'Signerat' || incomingStatus === 'Signerat' || mergedStatus === 'Signerat') {
    return 'Signerat';
  }
  if (existingStatus === 'Skickat till kund' || incomingStatus === 'Skickat till kund') {
    return 'Skickat till kund';
  }
  if (hasSentIndicators(existing) || hasSentIndicators(merged)) {
    return 'Skickat till kund';
  }
  if (incomingStatus) return incomingStatus;
  if (existingStatus) return existingStatus;
  return 'Sparat';
}

/**
 * Slå ihop befintlig och inkommande KYC-JSON. Utskick/signering får aldrig tappas vid partiella POST:ar.
 */
function mergeKycFormular(existing = {}, incoming = {}) {
  const base = (existing && typeof existing === 'object') ? existing : {};
  const patch = (incoming && typeof incoming === 'object') ? incoming : {};
  let merged = preserveSendFields(base, { ...base, ...patch });
  merged.status = resolveMergedStatus(base, patch, merged);
  return merged;
}

function kycTitleCandidates(kundnamn, kyc = {}) {
  const titles = [];
  const add = (name) => {
    const trimmed = String(name || '').trim();
    if (trimmed && !titles.includes(trimmed)) titles.push(trimmed);
  };
  add(kundnamn);
  add(kyc.foretagsnamn);
  return titles;
}

module.exports = {
  normalizeStatus,
  hasSentIndicators,
  effectiveKycStatus,
  preserveSendFields,
  resolveMergedStatus,
  mergeKycFormular,
  kycTitleCandidates
};
