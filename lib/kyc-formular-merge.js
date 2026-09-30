/**
 * Merge sparade KYC-formulär utan att tappa utskick/signering/invite.
 */

const KycInvite = require('./kyc-invite');

function normalizeStatus(status) {
  return String(status || '').trim();
}

function hasSentIndicators(kyc) {
  if (!kyc || typeof kyc !== 'object') return false;
  if (normalizeStatus(kyc.status) === KycInvite.STATUS_SENT_SIGN) return true;
  if (normalizeStatus(kyc.status) === KycInvite.STATUS_SIGNED) return true;
  if (String(kyc.inleedDokumentId || '').trim()) return true;
  if (String(kyc.utskickningsdatum || '').trim()) return true;
  return false;
}

function hasFillPendingIndicators(kyc) {
  if (!kyc || typeof kyc !== 'object') return false;
  if (normalizeStatus(kyc.status) === KycInvite.STATUS_FILL_PENDING) return true;
  if (String(kyc.inviteToken || '').trim() && !kyc.customerAnsweredAt && !hasSentIndicators(kyc)) {
    return true;
  }
  return false;
}

function hasAnsweredIndicators(kyc) {
  if (!kyc || typeof kyc !== 'object') return false;
  if (normalizeStatus(kyc.status) === KycInvite.STATUS_ANSWERED) return true;
  if (kyc.customerAnsweredAt && !hasSentIndicators(kyc)) return true;
  return false;
}

function effectiveKycStatus(kyc) {
  const status = normalizeStatus(kyc?.status);
  if (status === KycInvite.STATUS_SIGNED) return KycInvite.STATUS_SIGNED;
  if (status === KycInvite.STATUS_SENT_SIGN) return KycInvite.STATUS_SENT_SIGN;
  if (String(kyc?.signeringsdatum || '').trim()) return KycInvite.STATUS_SIGNED;
  if (String(kyc?.inleedDokumentId || '').trim() || String(kyc?.utskickningsdatum || '').trim()) {
    return KycInvite.STATUS_SENT_SIGN;
  }
  if (status === KycInvite.STATUS_ANSWERED || kyc?.customerAnsweredAt) {
    return KycInvite.STATUS_ANSWERED;
  }
  if (status === KycInvite.STATUS_FILL_PENDING || hasFillPendingIndicators(kyc)) {
    return KycInvite.STATUS_FILL_PENDING;
  }
  return status || KycInvite.STATUS_SAVED;
}

function preserveSendFields(existing, next) {
  const out = { ...next };
  const fields = ['inleedDokumentId', 'utskickningsdatum', 'signeringsdatum', 'receipt'];
  for (const field of fields) {
    const prev = existing?.[field];
    if (prev && !out[field]) out[field] = prev;
  }
  return KycInvite.preserveInviteFields(existing, out);
}

function resolveMergedStatus(existing, incoming, merged) {
  const existingStatus = normalizeStatus(existing?.status);
  const incomingStatus = normalizeStatus(incoming?.status);
  const mergedStatus = normalizeStatus(merged?.status);

  if (
    existingStatus === KycInvite.STATUS_SIGNED
    || incomingStatus === KycInvite.STATUS_SIGNED
    || mergedStatus === KycInvite.STATUS_SIGNED
  ) {
    return KycInvite.STATUS_SIGNED;
  }
  if (
    existingStatus === KycInvite.STATUS_SENT_SIGN
    || incomingStatus === KycInvite.STATUS_SENT_SIGN
    || hasSentIndicators(existing)
    || hasSentIndicators(merged)
  ) {
    return KycInvite.STATUS_SENT_SIGN;
  }
  if (
    existingStatus === KycInvite.STATUS_ANSWERED
    || incomingStatus === KycInvite.STATUS_ANSWERED
    || hasAnsweredIndicators(existing)
    || hasAnsweredIndicators(merged)
  ) {
    return KycInvite.STATUS_ANSWERED;
  }
  if (
    existingStatus === KycInvite.STATUS_FILL_PENDING
    || incomingStatus === KycInvite.STATUS_FILL_PENDING
    || hasFillPendingIndicators(existing)
    || hasFillPendingIndicators(merged)
  ) {
    return KycInvite.STATUS_FILL_PENDING;
  }
  if (incomingStatus) return incomingStatus;
  if (existingStatus) return existingStatus;
  return KycInvite.STATUS_SAVED;
}

/**
 * Slå ihop befintlig och inkommande KYC-JSON. Utskick/signering/invite får aldrig tappas vid partiella POST:ar.
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
  hasFillPendingIndicators,
  hasAnsweredIndicators,
  effectiveKycStatus,
  preserveSendFields,
  resolveMergedStatus,
  mergeKycFormular,
  kycTitleCandidates
};
