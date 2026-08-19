/**
 * Malltext för "3. Metod för Riskbedömning" har i många Byråer-poster
 * även klistrats in under "3. Kundkännedomsåtgärder". Det är fel sektion.
 */

const DEFAULT_KYC_ATGARDER =
  'Åtgärder vidtas innan affärsförbindelse ingås och följs upp löpande minst en gång per år eller vid behov. ' +
  'Omfattningen anpassas efter kundens riskprofil (låg, normal, hög), där högre risk kräver skärpta åtgärder. ' +
  'Detta innefattar bland annat att inhämta information om uppdragets art och syfte, identifiering av kunden, ' +
  'utreda verklig huvudman (anpassat efter risk), kontroll mot sanktionslistor och PEP-listor. ' +
  'Om tillräcklig kundkännedom inte uppnås ska ny kund inte accepteras eller befintlig avslutas. ' +
  'För kunder med låg till normal risknivå görs en bedömning av risknivån årligen eller vid signaler om att risknivån har ändrats.';

function looksLikeRiskMetodText(raw) {
  const t = String(raw || '').trim();
  if (!t) return false;
  const metod = /riskbedömningen har genomförts|systematiskt identifiera hot och sårbarheter|informationskällor|ett riskbaserat förhållningssätt|utgångspunkten är att risk för penningtvätt/i.test(t);
  const kyc = /verklig huvudman|sanktionslist|pep-list|kundkännedom inte uppnås|identifiering av kunden|affärsförbindelse/i.test(t);
  return metod && !kyc;
}

function correctKycAtgarder(raw) {
  return looksLikeRiskMetodText(raw) ? DEFAULT_KYC_ATGARDER : String(raw == null ? '' : raw);
}

const KYC_FIELD_KEYS = ['3. Kundkännedomsåtgärder ', '3. Kundkännedomsåtgärder'];

function applyKycAtgarderCorrection(fields) {
  const src = fields && typeof fields === 'object' ? fields : {};
  const key = KYC_FIELD_KEYS.find((k) => src[k] != null && String(src[k]).trim()) || KYC_FIELD_KEYS[0];
  const raw = src[key];
  if (raw == null || String(raw).trim() === '') return { fields: src, changed: false, key };
  const next = correctKycAtgarder(raw);
  if (next === String(raw)) return { fields: src, changed: false, key };
  return { fields: { ...src, [key]: next }, changed: true, key, next };
}

module.exports = {
  DEFAULT_KYC_ATGARDER,
  KYC_FIELD_KEYS,
  looksLikeRiskMetodText,
  correctKycAtgarder,
  applyKycAtgarderCorrection
};
