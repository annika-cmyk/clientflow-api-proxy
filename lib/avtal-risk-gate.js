'use strict';

/**
 * Blockera uppdragsavtal (skicka/signera) tills bedömd risk är godkänd.
 * Efter migrering: endast Riskbeslut status === Godkänd (legacy via RiskBeslut.isApproved).
 */

const RiskBeslut = require('./risk-beslut');

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

function fieldChecked(fields, name) {
  const v = fields && fields[name];
  return v === true || v === 'Ja' || v === 'ja' || v === 1 || v === '1';
}

function riskIsApproved(fields = {}) {
  const f = fields || {};
  if (fieldChecked(f, 'Uppdragsavtal utanför ClientFlow')) {
    // Extern avtalsspår — gate gäller ändå risken om ni använder ClientFlow-risk,
    // men skicka-knappen i ClientFlow är irrelevant. Behåll gate för Inleed-skicka.
  }
  // Primärt: Riskbeslut status === Godkänd
  if (RiskBeslut.normalizeStatus(f[RiskBeslut.FIELD_STATUS]) === RiskBeslut.STATUS.APPROVED) {
    return true;
  }
  // Legacy / pre-migrering
  return RiskBeslut.isApproved(f);
}

function hasAssessedRisk(fields = {}) {
  return !!trimStr(fields.Riskniva || fields['sammanlagd risk'] || '');
}

/**
 * @returns {{ allowed: boolean, reason: string, code: string }}
 */
function canSendUppdragsavtal(fields = {}, opts = {}) {
  const f = fields || {};
  if (opts.bypass === true) {
    return { allowed: true, reason: '', code: 'bypass' };
  }
  if (riskIsApproved(f)) {
    return { allowed: true, reason: '', code: 'ok' };
  }
  if (!hasAssessedRisk(f)) {
    return {
      allowed: false,
      code: 'missing_risk',
      reason:
        'Uppdragsavtal kan inte skickas för signering innan riskbedömningen är klar och godkänd (PTL: kundkännedom + riskbeslut före affärsförbindelse).'
    };
  }
  return {
    allowed: false,
    code: 'not_approved',
    reason:
      'Bedömd risk finns men är inte godkänd ännu. Godkänn riskbedömningen under Riskbedömning & beslut innan avtalet skickas.'
  };
}

module.exports = {
  riskIsApproved,
  hasAssessedRisk,
  canSendUppdragsavtal
};
