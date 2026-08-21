/**
 * Airtable single-select för den femgradiga riskskalan.
 * Behåller gamla val (Medel, Lag, Hog) men byter namn till kanoniska
 * etiketter när det inte krockar, och lägger till saknade nivåer.
 */
const RiskSkala = require('../public/js/risk-skala');

const RISK_SELECT_FIELD_NAMES = [
  'Riskbedömning',
  'Riskniva',
  'sammanlagd risk',
  'Kund inneboende riskprofil',
  'Kund föreslagen nivå'
];

function foldName(value) {
  return RiskSkala.fold(value);
}

function isRiskSelectFieldName(name) {
  const folded = foldName(name);
  return RISK_SELECT_FIELD_NAMES.some((n) => foldName(n) === folded);
}

function choicePayload(choice, name) {
  const item = { name };
  if (choice && choice.id) item.id = choice.id;
  if (choice && choice.color) item.color = choice.color;
  return item;
}

function planSelectChoiceMigration(existingChoices, desiredNames) {
  const existing = (existingChoices || []).filter((c) => c && String(c.name || '').trim());
  const exactNames = new Set(existing.map((c) => String(c.name)));
  const planned = [];
  const renamed = [];

  existing.forEach((choice) => {
    const name = String(choice.name);
    const canonical = RiskSkala.riskLabelSv(name);
    if (canonical && canonical !== name && !exactNames.has(canonical)) {
      planned.push(choicePayload(choice, canonical));
      exactNames.add(canonical);
      renamed.push({ from: name, to: canonical });
      return;
    }
    planned.push(choicePayload(choice, name));
  });

  const present = new Set(planned.map((c) => c.name));
  const added = [];
  (desiredNames || RiskSkala.labels()).forEach((name) => {
    if (present.has(name)) return;
    planned.push({ name });
    present.add(name);
    added.push(name);
  });

  return {
    choices: planned,
    added,
    renamed,
    updated: added.length > 0 || renamed.length > 0
  };
}

function airtableErrorMessage(error) {
  const at = error && error.response && error.response.data && error.response.data.error;
  if (typeof at === 'string' && at.trim()) return at;
  if (at && typeof at.message === 'string' && at.message.trim()) return at.message;
  if (error && typeof error.message === 'string' && error.message.trim()) return error.message;
  return 'Okänt fel';
}

function unknownAirtableFieldName(errorOrText) {
  const msg = typeof errorOrText === 'string'
    ? errorOrText
    : airtableErrorMessage(errorOrText);
  const match = String(msg || '').match(/Unknown field name:\s*"([^"]+)"/i);
  return match ? match[1] : '';
}

function dropUnknownAirtableField(fields, fieldName) {
  if (!fieldName || !fields || !Object.prototype.hasOwnProperty.call(fields, fieldName)) return null;
  const next = { ...fields };
  delete next[fieldName];
  return next;
}

function isInvalidChoiceError(error) {
  const at = error && error.response && error.response.data && error.response.data.error;
  const type = (at && at.type) || '';
  const msg = airtableErrorMessage(error);
  return type === 'INVALID_MULTIPLE_CHOICE_OPTIONS'
    || /invalid.*(choice|select|multiple choice)/i.test(msg);
}

function normalizeRiskFieldValue(value) {
  if (value == null || value === '') return value;
  return RiskSkala.riskLabelSv(value) || value;
}

function normalizeRiskFields(fields) {
  const out = { ...(fields || {}) };
  Object.keys(out).forEach((key) => {
    if (isRiskSelectFieldName(key)) out[key] = normalizeRiskFieldValue(out[key]);
  });
  return out;
}

function shouldOmitRiskSelectValue(key, value) {
  return isRiskSelectFieldName(key) && (value == null || value === '');
}

function missingExactRiskLabels(existingChoices) {
  const exact = new Set((existingChoices || []).map((c) => {
    if (c && typeof c === 'object') return c.name;
    return c;
  }).filter(Boolean));
  return RiskSkala.labels().filter((label) => !exact.has(label));
}

module.exports = {
  RISK_SELECT_FIELD_NAMES,
  isRiskSelectFieldName,
  planSelectChoiceMigration,
  airtableErrorMessage,
  unknownAirtableFieldName,
  dropUnknownAirtableField,
  isInvalidChoiceError,
  normalizeRiskFieldValue,
  normalizeRiskFields,
  shouldOmitRiskSelectValue,
  missingExactRiskLabels
};
