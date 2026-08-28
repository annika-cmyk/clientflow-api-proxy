'use strict';

/**
 * Bygger ämnesblocket till AI för övrig riskfaktor.
 * Riskfaktorns namn är huvudämnet; typen är bara kategori.
 */
function formatOvrigRiskfaktorSubjectBlock(riskfaktor, typ) {
  const namn = String(riskfaktor || '').trim();
  const kategori = String(typ || '').trim() || '–';
  return `RISKFAKTOR (huvudämne — all text ska handla om just denna benämning):
"${namn}"

TYP AV RISKFAKTOR (endast kategori/gruppering — inte ämnet):
${kategori}

Viktigt:
- beskrivning, S×K-motivering och åtgärd ska vara specifika för riskfaktorns benämning ovan.
- Skriv inte en generell text om kategorin om den inte också gäller just denna riskfaktor.
- Om benämningen nämner t.ex. utsatta områden, kunder/leverantörer, hemvist, EU eller korruption — ta upp just det, inte ett generiskt geografiskt resonemang.`;
}

module.exports = {
  formatOvrigRiskfaktorSubjectBlock
};
