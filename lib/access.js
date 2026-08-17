/**
 * Roll- och kundbehörighet för byråanvändare.
 *
 * Ledare: alla kunder på den egna byrån, full åtkomst.
 * Anställd: kunder hen har behörighet till (fältet Användare), därefter allt på kunden.
 * ClientFlowAdmin: allt.
 *
 * Rollen "Användare" i äldre data behandlas som Anställd.
 */

function normalizeRole(role) {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'clientflowadmin' || r === 'admin') return 'ClientFlowAdmin';
  if (r === 'ledare') return 'Ledare';
  if (
    r === 'anställd' ||
    r === 'anstalld' ||
    r === 'anstald' ||
    r === 'användare' ||
    r === 'anvandare' ||
    r === 'user'
  ) {
    return 'Anställd';
  }
  return String(role || '').trim();
}

function isClientFlowAdmin(role) {
  return normalizeRole(role) === 'ClientFlowAdmin';
}

function isLedare(role) {
  return normalizeRole(role) === 'Ledare';
}

function isAnstalld(role) {
  return normalizeRole(role) === 'Anställd';
}

function isLedareOrAdmin(role) {
  const n = normalizeRole(role);
  return n === 'ClientFlowAdmin' || n === 'Ledare';
}

function escapeAirtableString(value) {
  return String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function customerByraId(fields) {
  const f = fields || {};
  const raw = f['Byrå ID'] ?? f['Byra_ID'] ?? f['ByraID'] ?? f.Byrå ?? f.Byra ?? '';
  return String(raw == null ? '' : raw).trim();
}

function parseAnvandareIds(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) {
    return value.flatMap((v) => parseAnvandareIds(v));
  }
  return String(value)
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function userListedOnCustomer(userData, fields) {
  const uid = userData?.id ? String(userData.id).trim() : '';
  if (!uid) return false;
  return parseAnvandareIds(fields?.['Användare']).some((id) => String(id) === uid);
}

function sameByra(userData, fields) {
  const userByra = userData?.byraId != null ? String(userData.byraId).trim() : '';
  const custByra = customerByraId(fields);
  return !!(userByra && custByra && userByra === custByra);
}

function userHasCustomerAccess(userData, customerRecord) {
  if (!userData) return false;
  const role = normalizeRole(userData.role);
  if (role === 'ClientFlowAdmin') return true;
  const fields = customerRecord?.fields || customerRecord || {};
  if (role === 'Ledare') return sameByra(userData, fields);
  if (role === 'Anställd') return userListedOnCustomer(userData, fields);
  return false;
}

function byraFilterFormula(byraId) {
  const raw = String(byraId == null ? '' : byraId).trim();
  if (!raw) return '';
  const esc = escapeAirtableString(raw);
  const num = parseInt(raw, 10);
  if (!Number.isNaN(num) && String(num) === raw) {
    return `OR({Byrå ID}="${esc}",{Byrå ID}=${num})`;
  }
  return `{Byrå ID}="${esc}"`;
}

/**
 * Airtable-formel för kundlistor.
 * Returnerar:
 *  - '' = ingen extra filtrering (admin)
 *  - null = inga poster (saknar byrå/id eller okänd roll)
 *  - string = filterByFormula
 */
function kunddataFilterFormula(userData) {
  if (!userData) return null;
  const role = normalizeRole(userData.role);
  if (role === 'ClientFlowAdmin') return '';
  const byraId = userData.byraId != null ? String(userData.byraId).trim() : '';
  if (role === 'Ledare') {
    if (!byraId) return null;
    return byraFilterFormula(byraId);
  }
  if (role === 'Anställd') {
    const uid = userData.id ? String(userData.id).trim() : '';
    if (!uid || !byraId) return null;
    const byraPart = byraFilterFormula(byraId);
    const userPart = `SEARCH("${escapeAirtableString(uid)}", {Användare}&"")`;
    return `AND(${byraPart},${userPart})`;
  }
  return null;
}

function mergeAnvandareValue(existing, extraIds) {
  const current = parseAnvandareIds(existing);
  const extra = (extraIds || []).map((id) => String(id || '').trim()).filter(Boolean);
  const merged = [...new Set([...current, ...extra])];
  if (Array.isArray(existing)) return merged;
  return merged.join(',');
}

function namesMatchUser(user, name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return false;
  const candidates = [user?.name, user?.fullName, user?.email, user?.id]
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean);
  return candidates.includes(n);
}

function resolveUserIdsByNames(users, names) {
  const list = Array.isArray(users) ? users : [];
  const wanted = [...new Set((names || []).map((n) => String(n || '').trim()).filter(Boolean))];
  const ids = [];
  wanted.forEach((name) => {
    const match = list.find((u) => namesMatchUser(u, name));
    if (match?.id) ids.push(String(match.id));
  });
  return [...new Set(ids)];
}

function uppdragAssignedToUser(fields, userData) {
  const myName = String(userData?.name || '').trim().toLowerCase();
  const myEmail = String(userData?.email || '').trim().toLowerCase();
  const myId = String(userData?.id || '').trim().toLowerCase();
  if (!myName && !myEmail && !myId) return false;
  const values = [
    fields?.['Ansvarig'],
    fields?.['Klientansvarig'],
    fields?.['Handläggare']
  ].map((v) => String(v || '').trim().toLowerCase()).filter(Boolean);
  return values.some((v) => v === myName || v === myEmail || v === myId);
}

module.exports = {
  normalizeRole,
  isClientFlowAdmin,
  isLedare,
  isAnstalld,
  isLedareOrAdmin,
  escapeAirtableString,
  customerByraId,
  parseAnvandareIds,
  userListedOnCustomer,
  sameByra,
  userHasCustomerAccess,
  byraFilterFormula,
  kunddataFilterFormula,
  mergeAnvandareValue,
  namesMatchUser,
  resolveUserIdsByNames,
  uppdragAssignedToUser
};
