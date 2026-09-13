/**
 * Explicit Gmail-etikett → kund-kopplingar (ClientFlow), starkare än fuzzy namnmatch.
 * Lagras som JSON per användare (Application Users).
 */

const match = require('./match');

const FIELD_NAME = 'Gmail etikettkopplingar';

function normalizeLink(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const labelId = String(raw.labelId || '').trim() || null;
  const labelName = String(raw.labelName || '').trim() || null;
  const kundId = String(raw.kundId || raw.customerId || '').trim();
  if (!kundId) return null;
  if (!labelId && !labelName) return null;
  return {
    labelId,
    labelName,
    kundId,
    byraId: raw.byraId != null ? String(raw.byraId).trim() || null : null,
    userId: raw.userId != null ? String(raw.userId).trim() || null : null,
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : null
  };
}

function parseLinksJson(raw) {
  if (raw == null || raw === '') return [];
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch (_) {
      return [];
    }
  }
  if (!Array.isArray(data)) return [];
  const out = [];
  const seen = new Set();
  for (const item of data) {
    const link = normalizeLink(item);
    if (!link) continue;
    const key = link.labelId
      ? `id:${link.labelId}`
      : `name:${match.foldName(link.labelName)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(link);
  }
  return out;
}

function serializeLinks(links) {
  return JSON.stringify(
    (links || []).map((l) => ({
      labelId: l.labelId || null,
      labelName: l.labelName || null,
      kundId: l.kundId,
      byraId: l.byraId || null,
      userId: l.userId || null,
      updatedAt: l.updatedAt || null
    }))
  );
}

function findLinkForLabel(links, label) {
  const list = links || [];
  if (!label) return null;
  const id = label.id ? String(label.id).trim() : '';
  const name = label.name ? String(label.name).trim() : '';
  const nameFold = match.foldName(name);
  if (id) {
    const byId = list.find((l) => l.labelId && l.labelId === id);
    if (byId) return byId;
  }
  if (nameFold) {
    const byName = list.find(
      (l) => l.labelName && match.foldName(l.labelName) === nameFold
    );
    if (byName) return byName;
  }
  return null;
}

/**
 * Upsert one mapping. Same labelId (or same folded labelName) replaces previous.
 */
function upsertLink(links, patch, meta = {}) {
  const next = normalizeLink({
    ...patch,
    byraId: patch.byraId != null ? patch.byraId : meta.byraId,
    userId: patch.userId != null ? patch.userId : meta.userId,
    updatedAt: new Date().toISOString()
  });
  if (!next) {
    const err = new Error('labelId eller labelName samt kundId krävs');
    err.code = 'INVALID_LABEL_LINK';
    throw err;
  }
  const out = [];
  let replaced = false;
  for (const existing of links || []) {
    const sameId =
      next.labelId && existing.labelId && existing.labelId === next.labelId;
    const sameName =
      next.labelName &&
      existing.labelName &&
      match.foldName(existing.labelName) === match.foldName(next.labelName);
    if (sameId || sameName) {
      if (!replaced) {
        out.push({
          ...next,
          labelId: next.labelId || existing.labelId,
          labelName: next.labelName || existing.labelName
        });
        replaced = true;
      }
      continue;
    }
    out.push(existing);
  }
  if (!replaced) out.push(next);
  return out;
}

function removeLink(links, { labelId, labelName } = {}) {
  const id = String(labelId || '').trim();
  const nameFold = match.foldName(labelName);
  return (links || []).filter((l) => {
    if (id && l.labelId === id) return false;
    if (nameFold && l.labelName && match.foldName(l.labelName) === nameFold) {
      return false;
    }
    return true;
  });
}

/**
 * Resolve customer from explicit links for a message's labels.
 * @returns {{ customerId, customerName, labelId, labelName, matchReason: 'link' } | null}
 */
function resolveLinkedCustomer(message, opts = {}) {
  const links = opts.links || [];
  if (!links.length) return null;
  const labels = opts.labels || [];
  const byId = new Map();
  for (const l of labels) {
    if (l && l.id) byId.set(l.id, l);
  }
  const kunderIds = opts.kunderLabelIds;
  const customers = opts.customers || [];
  const customerById = new Map(customers.map((c) => [c.id, c]));

  for (const lid of (message && message.labelIds) || []) {
    if (kunderIds instanceof Set && !kunderIds.has(lid)) continue;
    const label = byId.get(lid) || { id: lid, name: '' };
    if (opts.kunderRoot && label.name) {
      if (
        !match.isUnderKunder(label.name, opts.kunderRoot) &&
        match.foldName(label.name) !== match.foldName(opts.kunderRoot)
      ) {
        continue;
      }
      if (match.foldName(label.name) === match.foldName(opts.kunderRoot || 'KUNDER')) {
        continue;
      }
    }
    const link = findLinkForLabel(links, label);
    if (!link) continue;
    const customer = customerById.get(link.kundId);
    if (!customer) {
      return {
        customerId: link.kundId,
        customerName: link.kundId,
        labelId: label.id || link.labelId,
        labelName: label.name || link.labelName,
        matchReason: 'link'
      };
    }
    return {
      customerId: customer.id,
      customerName: customer.namn,
      labelId: label.id || link.labelId,
      labelName: label.name || link.labelName,
      matchReason: 'link'
    };
  }
  return null;
}

/**
 * Merge explicit links into matchLabelsToCustomers result (links win).
 */
function applyLinksToMatchResult(matchResult, links, customers, opts = {}) {
  const kunderRoot = (matchResult && matchResult.kunderRoot) || opts.kunderRoot || 'KUNDER';
  const customerById = new Map((customers || []).map((c) => [c.id, c]));
  const linkMatches = [];
  const linkedIds = new Set();
  const linkedNames = new Set();

  for (const link of links || []) {
    const customer = customerById.get(link.kundId);
    if (!customer) continue;
    const labelId = link.labelId || null;
    const labelName = link.labelName || null;
    if (!labelId && !labelName) continue;
    if (labelId) linkedIds.add(labelId);
    if (labelName) linkedNames.add(match.foldName(labelName));
    linkMatches.push({
      labelId,
      labelName,
      labelLeaf: labelName ? match.labelLeafName(labelName) : null,
      customerId: customer.id,
      customerName: customer.namn,
      score: 100,
      emailScore: 0,
      matchReason: 'link'
    });
  }

  const fuzzyMatches = ((matchResult && matchResult.matches) || []).filter((m) => {
    if (m.labelId && linkedIds.has(m.labelId)) return false;
    if (m.labelName && linkedNames.has(match.foldName(m.labelName))) return false;
    return true;
  });

  const unmatchedLabels = ((matchResult && matchResult.unmatchedLabels) || []).filter(
    (u) => {
      if (u.labelId && linkedIds.has(u.labelId)) return false;
      if (u.labelName && linkedNames.has(match.foldName(u.labelName))) return false;
      return true;
    }
  );

  return {
    ...(matchResult || {}),
    matches: [...linkMatches, ...fuzzyMatches],
    unmatchedLabels,
    kunderRoot,
    labelLinks: links || []
  };
}

module.exports = {
  FIELD_NAME,
  normalizeLink,
  parseLinksJson,
  serializeLinks,
  findLinkForLabel,
  upsertLink,
  removeLink,
  resolveLinkedCustomer,
  applyLinksToMatchResult
};
