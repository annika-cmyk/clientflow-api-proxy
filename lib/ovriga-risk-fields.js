/**
 * Extra Airtable-fält för övriga riskfaktorer (S×K och PT/TF).
 * De ingår inte i den äldre field-mappingen och kan saknas i basen.
 */
const SCHEMA_FIELDS = [
  { name: 'Riskpoäng', type: 'multilineText' },
  { name: 'PT/TF-relevans', type: 'singleLineText' },
  { name: 'Aktuell', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } }
];

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
  applyOvrigExtraAirtableFields
};
