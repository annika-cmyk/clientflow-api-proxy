'use strict';

const SIGNERING_FIELD = 'Dokumentation signering';
const RISK_GODKAND_FIELD = 'Uppdaterad datum';
const POLICY_GODKAND_FIELD = 'Policydokumentet reviderat och godkänt';

function parseSignering(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  try {
    const parsed = JSON.parse(t);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function toDateOnly(value) {
  if (!value) return '';
  const s = String(value).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const parsed = Date.parse(s.replace(' ', 'T'));
  if (!Number.isFinite(parsed)) return '';
  return new Date(parsed).toISOString().slice(0, 10);
}

function pickSignerFromUsers(users, userId) {
  const wanted = String(userId || '').trim();
  if (!wanted || !Array.isArray(users)) return null;
  const user = users.find((u) => u && String(u.id || '') === wanted);
  const email = String((user && user.email) || '').trim();
  const name = String((user && (user.name || user.fullName)) || '').trim();
  if (!user || !email || !name) return null;
  return {
    id: String(user.id),
    namn: name,
    epost: email,
    role: String((user && user.role) || '').trim()
  };
}

function buildPendingSignering({
  inleedDokumentId,
  signer,
  sentAt,
  agencyEmail,
  agencyName,
  byraNamn
} = {}) {
  const sent = sentAt || new Date().toISOString();
  return {
    inleedDokumentId: String(inleedDokumentId || '').trim(),
    status: 'pending',
    signerId: signer && signer.id ? String(signer.id) : '',
    signerName: signer && signer.namn ? String(signer.namn) : '',
    signerEmail: signer && signer.epost ? String(signer.epost) : '',
    agencyEmail: String(agencyEmail || '').trim(),
    agencyName: String(agencyName || '').trim(),
    byraNamn: String(byraNamn || '').trim(),
    sentAt: sent,
    signedAt: '',
    receiptSentAt: ''
  };
}

function markSigneringSigned(state, signedAt) {
  const next = { ...(state || {}) };
  next.status = 'signed';
  next.signedAt = toDateOnly(signedAt) || toDateOnly(new Date().toISOString());
  return next;
}

function approvalFieldsFromSignedAt(signedAt) {
  const date = toDateOnly(signedAt);
  if (!date) return null;
  return {
    [RISK_GODKAND_FIELD]: date,
    [POLICY_GODKAND_FIELD]: date
  };
}

function publicSignering(state) {
  const s = state && typeof state === 'object' ? state : null;
  if (!s || !s.inleedDokumentId) return null;
  return {
    inleedDokumentId: String(s.inleedDokumentId || ''),
    status: s.status === 'signed' ? 'signed' : 'pending',
    signerId: String(s.signerId || ''),
    signerName: String(s.signerName || ''),
    signerEmail: String(s.signerEmail || ''),
    sentAt: s.sentAt || '',
    signedAt: toDateOnly(s.signedAt) || ''
  };
}

function dokumentationInleedTitle(byraNamn) {
  const namn = String(byraNamn || '').trim() || 'Byrån';
  return `Allmän riskbedömning och rutiner - ${namn}`;
}

module.exports = {
  SIGNERING_FIELD,
  RISK_GODKAND_FIELD,
  POLICY_GODKAND_FIELD,
  parseSignering,
  toDateOnly,
  pickSignerFromUsers,
  buildPendingSignering,
  markSigneringSigned,
  approvalFieldsFromSignedAt,
  publicSignering,
  dokumentationInleedTitle
};
