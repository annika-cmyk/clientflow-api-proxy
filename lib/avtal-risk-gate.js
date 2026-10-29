'use strict';

/**
 * Blockera uppdragsavtal (skicka/signera) tills bedömd risk är godkänd.
 */

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
  if (trimStr(f['Kundens riskbedömning godkänd'])) return true;
  // Dokumenterad residual med utförd datum räknas som godkänd
  if (trimStr(f['Riskbedömning utförd datum']) && trimStr(f.Riskniva || f['sammanlagd risk'])) {
    return true;
  }
  return false;
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
      'Bedömd risk finns men är inte godkänd ännu. Dokumentera/godkänn riskbedömningen under Riskbedömning innan avtalet skickas.'
  };
}

module.exports = {
  riskIsApproved,
  hasAssessedRisk,
  canSendUppdragsavtal
};
