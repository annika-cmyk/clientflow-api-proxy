/**
 * Browser twin — block uppdragsavtal until risk approved (Riskbeslut status === Godkänd).
 */
(function (global) {
  function trimStr(v) { return v == null ? '' : String(v).trim(); }

  function riskIsApproved(fields) {
    var f = fields || {};
    if (global.RiskBeslut && typeof global.RiskBeslut.isApproved === 'function') {
      return global.RiskBeslut.isApproved(f);
    }
    if (trimStr(f['Kundens riskbedömning godkänd'])) return true;
    if (trimStr(f['Riskbedömning utförd datum']) && trimStr(f.Riskniva || f['sammanlagd risk'])) return true;
    return false;
  }

  function hasAssessedRisk(fields) {
    return !!trimStr((fields || {}).Riskniva || (fields || {})['sammanlagd risk'] || '');
  }

  function canSendUppdragsavtal(fields, opts) {
    opts = opts || {};
    var f = fields || {};
    if (opts.bypass === true) return { allowed: true, reason: '', code: 'bypass' };
    if (riskIsApproved(f)) return { allowed: true, reason: '', code: 'ok' };
    if (!hasAssessedRisk(f)) {
      return {
        allowed: false,
        code: 'missing_risk',
        reason: 'Uppdragsavtal kan inte skickas för signering innan riskbedömningen är klar och godkänd (PTL: kundkännedom + riskbeslut före affärsförbindelse).'
      };
    }
    return {
      allowed: false,
      code: 'not_approved',
      reason: 'Bedömd risk finns men är inte godkänd ännu. Godkänn riskbedömningen under Riskbedömning & beslut innan avtalet skickas.'
    };
  }

  var api = { riskIsApproved: riskIsApproved, hasAssessedRisk: hasAssessedRisk, canSendUppdragsavtal: canSendUppdragsavtal };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.AvtalRiskGate = api;
})(typeof window !== 'undefined' ? window : globalThis);
