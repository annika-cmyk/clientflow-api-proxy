/**
 * Pure helpers for showing/editing Gmail labels (esp. KUNDER/*).
 */
const match = require('./match');

/** Gmail system label ids that users should see but not freely edit as kundetiketter. */
const SYSTEM_LABEL_IDS = new Set([
  'INBOX',
  'SENT',
  'TRASH',
  'SPAM',
  'DRAFT',
  'STARRED',
  'IMPORTANT',
  'UNREAD',
  'CATEGORY_PERSONAL',
  'CATEGORY_SOCIAL',
  'CATEGORY_PROMOTIONS',
  'CATEGORY_UPDATES',
  'CATEGORY_FORUMS'
]);

const SYSTEM_LABEL_SV = {
  INBOX: 'Inkorg',
  SENT: 'Skickat',
  TRASH: 'Papperskorg',
  SPAM: 'Skräppost',
  DRAFT: 'Utkast',
  STARRED: 'Stjärnmärkt',
  IMPORTANT: 'Viktigt',
  UNREAD: 'Oläst'
};

function isSystemLabelId(id) {
  return SYSTEM_LABEL_IDS.has(String(id || '').trim());
}

function isSystemLabel(label) {
  if (!label) return false;
  if (String(label.type || '').toLowerCase() === 'system') return true;
  return isSystemLabelId(label.id);
}

function classifyLabel(label, kunderRoot = 'KUNDER') {
  const id = label && label.id ? String(label.id) : '';
  const name = label && label.name ? String(label.name) : '';
  const system = isSystemLabel(label);
  const root = String(kunderRoot || 'KUNDER').trim() || 'KUNDER';
  const isKunderRoot = !system && match.foldName(name) === match.foldName(root);
  const isKunderChild = !system && match.isUnderKunder(name, root);
  return {
    id,
    name,
    type: system ? 'system' : 'user',
    displayName: system ? SYSTEM_LABEL_SV[id] || name || id : name,
    leaf: isKunderChild ? match.labelLeafName(name) : null,
    isSystem: system,
    isKunderRoot,
    isKunderChild,
    isKunder: isKunderRoot || isKunderChild,
    editableAsKunder: isKunderChild
  };
}

/**
 * Resolve labelIds on a message to enriched label objects (stable order:
 * KUNDER children first, then other user labels, then system).
 */
function resolveMessageLabels(labelIds, allLabels, kunderRoot = 'KUNDER') {
  const byId = new Map();
  for (const l of allLabels || []) {
    if (l && l.id) byId.set(l.id, l);
  }
  const resolved = [];
  for (const id of labelIds || []) {
    const raw = byId.get(id) || { id, name: id, type: isSystemLabelId(id) ? 'system' : 'user' };
    resolved.push(classifyLabel(raw, kunderRoot));
  }
  resolved.sort((a, b) => {
    const rank = (x) => {
      if (x.isKunderChild) return 0;
      if (x.isKunderRoot) return 1;
      if (!x.isSystem) return 2;
      return 3;
    };
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return String(a.displayName || '').localeCompare(String(b.displayName || ''), 'sv');
  });
  return resolved;
}

/** Child labels under KUNDER (not the root itself). */
function listKunderChildLabels(allLabels, kunderRoot = 'KUNDER') {
  return (allLabels || [])
    .filter((l) => match.isUnderKunder(l && l.name, kunderRoot))
    .map((l) => classifyLabel(l, kunderRoot))
    .sort((a, b) => String(a.leaf || a.name).localeCompare(String(b.leaf || b.name), 'sv'));
}

/**
 * Build add/remove label id lists for switching the KUNDER child on a message.
 * Keeps system labels and non-KUNDER user labels; replaces other KUNDER children.
 */
function planKunderLabelSwitch(opts = {}) {
  const {
    currentLabelIds = [],
    allLabels = [],
    setLabelId = null,
    kunderRoot = 'KUNDER'
  } = opts;
  const root = String(kunderRoot || 'KUNDER').trim() || 'KUNDER';
  const byId = new Map();
  for (const l of allLabels) {
    if (l && l.id) byId.set(l.id, classifyLabel(l, root));
  }

  const targetId = setLabelId ? String(setLabelId).trim() : '';
  if (!targetId) {
    const err = new Error('setLabelId saknas');
    err.code = 'INVALID_LABEL';
    throw err;
  }
  const target = byId.get(targetId);
  if (!target) {
    const err = new Error('Etiketten hittades inte');
    err.code = 'LABEL_NOT_FOUND';
    throw err;
  }
  if (!target.isKunderChild) {
    const err = new Error('Endast underetiketter till KUNDER kan sättas som kundetikett');
    err.code = 'NOT_KUNDER_CHILD';
    throw err;
  }

  const current = new Set((currentLabelIds || []).map(String));
  const remove = [];
  for (const id of current) {
    const info = byId.get(id);
    if (info && info.isKunderChild && id !== targetId) remove.push(id);
  }
  const add = current.has(targetId) ? [] : [targetId];

  return { addLabelIds: add, removeLabelIds: remove, target };
}

function normalizeKunderLabelName(leafOrPath, kunderRoot = 'KUNDER') {
  const root = String(kunderRoot || 'KUNDER').trim() || 'KUNDER';
  const raw = String(leafOrPath || '').trim().replace(/^\/+|\/+$/g, '');
  if (!raw) return null;
  if (match.foldName(raw) === match.foldName(root)) return root;
  if (match.isUnderKunder(raw, root) || raw.toUpperCase().startsWith(`${root.toUpperCase()}/`)) {
    return raw.includes('/') ? raw : `${root}/${raw}`;
  }
  // leaf only
  return `${root}/${raw}`;
}

/**
 * Find existing label by name (case-insensitive fold) or return null.
 */
function findLabelByName(allLabels, name) {
  const wanted = match.foldName(name);
  if (!wanted) return null;
  return (allLabels || []).find((l) => match.foldName(l && l.name) === wanted) || null;
}

/**
 * Normalize add/remove arrays from request body (ids only).
 */
function normalizeIdList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => String(v || '').trim()).filter(Boolean))];
}

/**
 * Filter out attempts to remove/add immutable system labels via free-form edit
 * (TRASH handled via trash endpoint; INBOX/SENT etc. not primary edit targets).
 * Allowlisted system ids may still be shown; only block remove of critical ones
 * when forceSystem is false.
 */
function sanitizeModifyIds(add, remove, opts = {}) {
  const allowSystem = !!opts.allowSystem;
  const addIds = normalizeIdList(add);
  const removeIds = normalizeIdList(remove);
  if (allowSystem) return { addLabelIds: addIds, removeLabelIds: removeIds };
  return {
    addLabelIds: addIds.filter((id) => !isSystemLabelId(id)),
    removeLabelIds: removeIds.filter((id) => !isSystemLabelId(id))
  };
}

module.exports = {
  SYSTEM_LABEL_IDS,
  SYSTEM_LABEL_SV,
  isSystemLabelId,
  isSystemLabel,
  classifyLabel,
  resolveMessageLabels,
  listKunderChildLabels,
  planKunderLabelSwitch,
  normalizeKunderLabelName,
  findLabelByName,
  normalizeIdList,
  sanitizeModifyIds
};
