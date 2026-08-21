'use strict';

const AVVIKELSE_STATUS = Object.freeze([
  'Öppen',
  'Under utredning',
  'Rapporterad till Finanspolisen (FM)',
  'Avslutad'
]);

const CANONICAL_FM_STATUS = 'Rapporterad till Finanspolisen (FM)';

const STATUS_ALIASES = Object.freeze({
  'Rapporterad till FM': CANONICAL_FM_STATUS,
  'Rapporterad till Finanspolisen': CANONICAL_FM_STATUS,
  'Rapporterad till finanspolisen (FM)': CANONICAL_FM_STATUS,
  'Rapporterad till FM (Finanspolisen)': CANONICAL_FM_STATUS
});

function normalizeKey(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function canonicalizeAvvikelseStatus(raw) {
  const value = normalizeKey(raw);
  if (!value) return '';
  if (AVVIKELSE_STATUS.includes(value)) return value;
  if (STATUS_ALIASES[value]) return STATUS_ALIASES[value];
  const lower = value.toLowerCase();
  const exact = AVVIKELSE_STATUS.find((item) => item.toLowerCase() === lower);
  if (exact) return exact;
  const aliasKey = Object.keys(STATUS_ALIASES).find((key) => key.toLowerCase() === lower);
  if (aliasKey) return STATUS_ALIASES[aliasKey];
  return null;
}

function isLegacyAvvikelseStatus(raw) {
  const value = normalizeKey(raw);
  if (!value) return false;
  const canonical = canonicalizeAvvikelseStatus(value);
  return canonical === CANONICAL_FM_STATUS && value !== CANONICAL_FM_STATUS;
}

function assertAvvikelseStatus(raw) {
  const canonical = canonicalizeAvvikelseStatus(raw);
  if (!canonical) {
    const err = new Error(
      'Ogiltig avvikelsestatus. Tillåtna värden: ' + AVVIKELSE_STATUS.join(', ')
    );
    err.code = 'AVVIKELSE_STATUS_INVALID';
    err.allowed = AVVIKELSE_STATUS.slice();
    throw err;
  }
  return canonical;
}

function needsStatusMigration(raw) {
  const value = normalizeKey(raw);
  if (!value) return false;
  return isLegacyAvvikelseStatus(value);
}

module.exports = {
  AVVIKELSE_STATUS,
  CANONICAL_FM_STATUS,
  STATUS_ALIASES,
  canonicalizeAvvikelseStatus,
  assertAvvikelseStatus,
  isLegacyAvvikelseStatus,
  needsStatusMigration
};
