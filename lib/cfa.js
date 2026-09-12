/**
 * Centralt funktionsansvarig (CFA) – attribut på användare inom byrå, inte en systemroll.
 * Slutsignering av AR/rutiner kräver bekräftad CFA + BankID.
 */
'use strict';

const USER_FIELDS = {
  IS_CFA: 'isCfa',
  CONFIRMED_AT: 'cfaConfirmedAt'
};

const BYRA_FIELDS = {
  CENTRALT_PERSON: 'Centralt funktionsansvarig'
};

const SCHEMA_FIELDS = [
  {
    name: USER_FIELDS.IS_CFA,
    type: 'checkbox',
    options: { color: 'greenBright', icon: 'check' },
    description: 'Användaren är utsedd centralt funktionsansvarig (CFA) för byrån.'
  },
  {
    name: USER_FIELDS.CONFIRMED_AT,
    type: 'singleLineText',
    description: 'ISO-tid när CFA-rollen bekräftades (ensam firma / utnämning).'
  }
];

function truthyFlag(value) {
  if (value === true || value === 1) return true;
  if (value === false || value == null || value === '') return false;
  const s = String(value).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'ja' || s === 'checked';
}

function readIsCfa(fieldsOrUser) {
  const src = fieldsOrUser || {};
  if (Object.prototype.hasOwnProperty.call(src, 'isCfa')) return truthyFlag(src.isCfa);
  return truthyFlag(src[USER_FIELDS.IS_CFA]);
}

function readConfirmedAt(fieldsOrUser) {
  const src = fieldsOrUser || {};
  const raw = src.cfaConfirmedAt != null ? src.cfaConfirmedAt : src[USER_FIELDS.CONFIRMED_AT];
  return String(raw || '').trim();
}

function isCfa(user) {
  return readIsCfa(user);
}

function isCfaConfirmed(user) {
  return isCfa(user) && !!readConfirmedAt(user);
}

function canSignArDokumentation(user) {
  return isCfaConfirmed(user);
}

function assertCanSignAr(user) {
  if (canSignArDokumentation(user)) return true;
  const err = new Error(
    'Endast bekräftad centralt funktionsansvarig (CFA) får signera allmän riskbedömning och rutiner.'
  );
  err.status = 403;
  err.code = 'CFA_REQUIRED';
  throw err;
}

function normalizePersonName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function namesLooselyMatch(a, b) {
  const left = normalizePersonName(a);
  const right = normalizePersonName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return left.includes(right) || right.includes(left);
}

function matchUserByCentraltName(users, centraltName) {
  const wanted = String(centraltName || '').trim();
  if (!wanted || !Array.isArray(users)) return null;
  const placeholder = /^(namn\s+namnsson|ange\s+namn|n\/a|-)$/i.test(wanted);
  if (placeholder) return null;
  return (
    users.find((u) => {
      if (!u) return false;
      return namesLooselyMatch(u.name || u.fullName, wanted) || namesLooselyMatch(u.email, wanted);
    }) || null
  );
}

function isSoloFirm(users) {
  return Array.isArray(users) && users.filter((u) => u && u.id).length === 1;
}

/**
 * @param {object[]} users
 * @param {{ centraltPerson?: string }} [opts]
 */
function buildCfaStatus(users, opts = {}) {
  const list = Array.isArray(users) ? users.filter((u) => u && u.id) : [];
  const confirmed = list.filter((u) => isCfaConfirmed(u));
  const flagged = list.filter((u) => isCfa(u));
  const solo = isSoloFirm(list);
  const centraltPerson = String(opts.centraltPerson || '').trim();
  const migrated = matchUserByCentraltName(list, centraltPerson);
  const suggested = flagged[0] || migrated || (solo ? list[0] : null);

  return {
    hasCfa: confirmed.length > 0,
    confirmedCount: confirmed.length,
    flaggedCount: flagged.length,
    isSolo: solo,
    needsSoloConfirm: solo && !!suggested && !isCfaConfirmed(suggested),
    suggestedUserId: suggested ? String(suggested.id) : '',
    suggestedName: suggested
      ? String(suggested.name || suggested.fullName || suggested.email || '').trim()
      : '',
    centraltPerson,
    migrationMatchUserId: migrated ? String(migrated.id) : ''
  };
}

function cfaFieldsFromBody(body, { assignNow } = {}) {
  const out = {};
  if (!body || typeof body !== 'object') return out;
  if (body.isCfa !== undefined) {
    const on = truthyFlag(body.isCfa);
    out[USER_FIELDS.IS_CFA] = on;
    if (on && assignNow) {
      out[USER_FIELDS.CONFIRMED_AT] =
        String(body.cfaConfirmedAt || '').trim() || new Date().toISOString();
    }
    if (!on) out[USER_FIELDS.CONFIRMED_AT] = '';
  } else if (body.cfaConfirmedAt !== undefined) {
    out[USER_FIELDS.CONFIRMED_AT] = String(body.cfaConfirmedAt || '').trim();
  }
  return out;
}

function confirmCfaPatch(at) {
  return {
    [USER_FIELDS.IS_CFA]: true,
    [USER_FIELDS.CONFIRMED_AT]: String(at || '').trim() || new Date().toISOString()
  };
}

function wouldLeaveZeroCfa(users, targetUserId, nextIsCfa) {
  if (nextIsCfa) return false;
  const list = Array.isArray(users) ? users : [];
  const remaining = list.filter((u) => {
    if (!u || !u.id) return false;
    if (String(u.id) === String(targetUserId)) return false;
    return isCfa(u);
  });
  const hadAny = list.some((u) => isCfa(u));
  return hadAny && remaining.length === 0;
}

/** Välj signerare – kräver bekräftad CFA + namn/e-post. */
function pickCfaSignerFromUsers(users, userId) {
  const wanted = String(userId || '').trim();
  if (!wanted || !Array.isArray(users)) return null;
  const user = users.find((u) => u && String(u.id || '') === wanted);
  if (!user || !isCfaConfirmed(user)) return null;
  const email = String(user.email || '').trim();
  const name = String(user.name || user.fullName || '').trim();
  if (!email || !name) return null;
  return {
    id: String(user.id),
    namn: name,
    epost: email,
    role: String(user.role || '').trim(),
    isCfa: true,
    cfaConfirmedAt: readConfirmedAt(user)
  };
}

function publicUserCfa(user) {
  return {
    isCfa: isCfa(user),
    cfaConfirmedAt: readConfirmedAt(user)
  };
}

module.exports = {
  USER_FIELDS,
  BYRA_FIELDS,
  SCHEMA_FIELDS,
  truthyFlag,
  readIsCfa,
  readConfirmedAt,
  isCfa,
  isCfaConfirmed,
  canSignArDokumentation,
  assertCanSignAr,
  normalizePersonName,
  namesLooselyMatch,
  matchUserByCentraltName,
  isSoloFirm,
  buildCfaStatus,
  cfaFieldsFromBody,
  confirmCfaPatch,
  wouldLeaveZeroCfa,
  pickCfaSignerFromUsers,
  publicUserCfa
};
