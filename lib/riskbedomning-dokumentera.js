/**
 * Gate for "Dokumentera riskbedömning" — required fields before PDF export.
 */
const KundRiskprofil = require('../public/js/kund-riskprofil');
const Riskaptit = require('../public/js/riskaptit');

const MOTIVERING_MIN = 10;

function missingList(fields, opts) {
  const f = fields || {};
  const missing = [];
  const residual = KundRiskprofil.readResidual
    ? KundRiskprofil.readResidual(f)
    : String(f.Riskniva || f['sammanlagd risk'] || '').trim();
  if (!residual) missing.push('Bedömd residualrisk');

  const dim = opts && opts.dimensionStatus;
  if (dim && dim.komplett === false) {
    const names = (dim.saknade || dim.missing || [])
      .map((d) => (d && (d.cardTitle || d.label || d.id)) || d)
      .filter(Boolean);
    if (names.length) missing.push('Riskfaktorer: ' + names.join(', '));
    else missing.push('Alla obligatoriska riskdimensioner (A/B/C)');
  }

  const motivering = KundRiskprofil.readMotivering
    ? KundRiskprofil.readMotivering(f)
    : String(f['Byrans riskbedomning'] || '').trim();
  if (!motivering || motivering.length < MOTIVERING_MIN) {
    missing.push('Motivering (byråns bedömning av kunden)');
  }

  const foreslagen = KundRiskprofil.readForeslagen
    ? KundRiskprofil.readForeslagen(f)
    : String(f['Kund föreslagen nivå'] || '').trim();
  if (residual && foreslagen && residual !== foreslagen) {
    const avvikelse = KundRiskprofil.readAvvikelseMotivering
      ? KundRiskprofil.readAvvikelseMotivering(f)
      : String(f['Kund avvikelse motivering'] || '').trim();
    if (!avvikelse) missing.push('Motivering till avvikelse från beräknad nivå');
  }

  if (residual === 'Hög' || residual === 'Oacceptabel') {
    const ev = Riskaptit.evaluateCustomer(f);
    if (!ev || !ev.hasValidDecision) {
      missing.push('Dokumenterat riskaptitbeslut');
    }
  }

  return missing;
}

function canDokumentera(fields, opts) {
  const missing = missingList(fields, opts);
  return {
    ok: missing.length === 0,
    missing,
    error: missing.length
      ? 'Fyll i följande innan du dokumenterar: ' + missing.join('; ')
      : ''
  };
}

module.exports = {
  MOTIVERING_MIN,
  missingList,
  canDokumentera
};
