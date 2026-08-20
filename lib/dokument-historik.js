/**
 * Airtable-fältet "Dokumentation - historik".
 * Nya bilagefält dyker inte upp i UI förrän vi läser dem uttryckligen.
 */
const DOKUMENTATION_HISTORIK_FIELD = 'Dokumentation - historik';
const DOKUMENTATION_HISTORIK_FIELD_ALIASES = [
  'Dokumentation - historik',
  'Dokumentation-historik',
  'Dokumentation historik'
];

function collectNamedAttachments(fields, fieldNames) {
  const f = fields || {};
  const names = Array.isArray(fieldNames) ? fieldNames : [];
  const seen = new Set();
  const items = [];
  for (const name of names) {
    const arr = Array.isArray(f[name]) ? f[name] : [];
    arr.forEach((att, index) => {
      if (!att || !(att.url || att.filename || att.id)) return;
      const key = att.id || `${name}:${att.url || att.filename}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ attachment: att, fieldName: name, index });
    });
  }
  return items;
}

function discoverHistorikFieldNames(fields) {
  const names = [];
  const seen = new Set();
  function add(name) {
    const n = String(name || '').trim();
    if (!n || seen.has(n)) return;
    seen.add(n);
    names.push(n);
  }
  DOKUMENTATION_HISTORIK_FIELD_ALIASES.forEach(add);
  Object.keys(fields || {}).forEach((key) => {
    const n = String(key).trim().toLowerCase();
    if (n.includes('dokumentation') && n.includes('historik')) add(key);
  });
  return names;
}

function pickHistorikFieldName(fields) {
  const f = fields || {};
  for (const name of discoverHistorikFieldNames(f)) {
    if (Array.isArray(f[name])) return name;
  }
  return DOKUMENTATION_HISTORIK_FIELD;
}

function collectHistorikAttachments(fields) {
  return collectNamedAttachments(fields, discoverHistorikFieldNames(fields));
}

function toHistorikDocumentItems(fields) {
  return collectHistorikAttachments(fields).map(({ attachment, fieldName, index }) => ({
    ...attachment,
    _typ: 'historik',
    _category: 'historik',
    _sourceField: fieldName,
    _sourceIndex: index
  }));
}

module.exports = {
  DOKUMENTATION_HISTORIK_FIELD,
  DOKUMENTATION_HISTORIK_FIELD_ALIASES,
  collectNamedAttachments,
  discoverHistorikFieldNames,
  pickHistorikFieldName,
  collectHistorikAttachments,
  toHistorikDocumentItems
};
