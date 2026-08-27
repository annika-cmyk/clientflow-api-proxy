'use strict';

const utsatta = require('./utsatta-omraden');

const FIELD = 'Utsatt område (JSON)';

function normalizeAddressKey(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function parseStored(raw) {
  if (raw == null || raw === '') return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function toStored(checkResult, addressText) {
  const addr = String(addressText || '').trim();
  return {
    trff: !!checkResult.trff,
    niva: checkResult.niva || null,
    omrade: checkResult.omrade || null,
    ort: checkResult.ort || null,
    region: checkResult.region || null,
    ar: checkResult.ar || null,
    kalla: checkResult.kalla || null,
    addressChecked: addr,
    addressKey: normalizeAddressKey(addr),
    geocoding: checkResult.geocoding || null,
    kontrolleradAt: checkResult.kontrolleradAt || new Date().toISOString(),
    allaTrffar: Array.isArray(checkResult.allaTrffar) ? checkResult.allaTrffar : []
  };
}

function shouldRecheck(prevStored, addressText, force) {
  if (force) return true;
  const key = normalizeAddressKey(addressText);
  if (!key) return false;
  if (!prevStored || prevStored.addressKey !== key) return true;
  return false;
}

async function checkAndSerialize(addressText, opts) {
  const addr = String(addressText || '').trim();
  if (!addr) return '';
  const result = await utsatta.checkAddress(addr, opts);
  return JSON.stringify(toStored(result, addr));
}

async function maybeUpdateField(prevFields, addressText, opts) {
  const addr = String(addressText || '').trim();
  const prev = parseStored(prevFields && prevFields[FIELD]);
  if (!addr) {
    return prev ? '' : undefined;
  }
  if (!shouldRecheck(prev, addr, opts && opts.force)) return undefined;
  return checkAndSerialize(addr, opts);
}

function customerAddressFromFields(fields) {
  const f = fields || {};
  return String(f.Address || f.Adress || '').trim();
}

module.exports = {
  FIELD,
  normalizeAddressKey,
  parseStored,
  toStored,
  shouldRecheck,
  checkAndSerialize,
  maybeUpdateField,
  customerAddressFromFields,
  summaryLabel: utsatta.summaryLabel,
  NIVA_SEU: utsatta.NIVA_SEU,
  NIVA_UTSATT: utsatta.NIVA_UTSATT
};
