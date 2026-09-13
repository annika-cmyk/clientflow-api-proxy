/**
 * Extra Airtable-fält för övriga riskfaktorer (S×K och PT/TF).
 * De ingår inte i den äldre field-mappingen och kan saknas i basen.
 */
const SCHEMA_FIELDS = [
  { name: 'Riskpoäng', type: 'multilineText' },
  { name: 'PT/TF-relevans', type: 'singleLineText' },
  { name: 'Aktuell', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } }
];

/** Status-/katalogpatchar som inte får kräva PT/TF eller motivering. */
const LIGHT_PATCH_KEYS = new Set(['Aktuell', 'Typ av riskfaktor', 'Riskfaktor']);

function isRiskFactorLightPatch(riskData) {
  const keys = Object.keys(riskData || {});
  return keys.length > 0 && keys.every((k) => LIGHT_PATCH_KEYS.has(k));
}

function applyOvrigExtraAirtableFields(riskData, fields) {
  const src = riskData || {};
  const out = { ...(fields || {}) };
  if (src['Riskpoäng'] !== undefined) out['Riskpoäng'] = src['Riskpoäng'];
  if (src['PT/TF-relevans'] !== undefined) out['PT/TF-relevans'] = src['PT/TF-relevans'];
  if (src['Samspelsexempel'] !== undefined) out['Samspelsexempel'] = src['Samspelsexempel'];
  if (src.Aktuell !== undefined) out.Aktuell = src.Aktuell === true;
  return out;
}

module.exports = {
  SCHEMA_FIELDS,
  LIGHT_PATCH_KEYS,
  isRiskFactorLightPatch,
  applyOvrigExtraAirtableFields
};
