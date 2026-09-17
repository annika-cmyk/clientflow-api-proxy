/**
 * Ren inkorgslogik: KUNDER-filter, kundkoppling, sortering.
 * E-postmatch används bara för att koppla kund bland redan KUNDER-filtrerade mejl.
 */

const match = require('./match');
const labelsEdit = require('./labels-edit');
const labelLinks = require('./label-links');

function isKunderRootLabel(labelName, kunderRoot = 'KUNDER') {
  const name = String(labelName || '').trim();
  const root = String(kunderRoot || 'KUNDER').trim();
  if (!name || !root) return false;
  return match.foldName(name) === match.foldName(root);
}

/** Rot + alla underetiketter under KUNDER. */
function collectKunderLabels(labels, kunderRoot = 'KUNDER') {
  return (labels || []).filter(
    (l) =>
      isKunderRootLabel(l.name, kunderRoot) || match.isUnderKunder(l.name, kunderRoot)
  );
}

function kunderLabelIdSet(labels, kunderRoot = 'KUNDER') {
  return new Set(collectKunderLabels(labels, kunderRoot).map((l) => l.id).filter(Boolean));
}

/** true om mejlet har minst en KUNDER-/underetikett. */
function messageHasKunderLabel(message, kunderIds) {
  const ids = (message && message.labelIds) || [];
  if (!(kunderIds instanceof Set) || !kunderIds.size) return false;
  return ids.some((id) => kunderIds.has(id));
}

function parseFromHeader(from) {
  const s = String(from || '').trim();
  if (!s) return { name: 'Okänd avsändare', email: '' };
  const angled = s.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (angled) {
    const email = String(angled[2] || '').trim();
    let name = String(angled[1] || '')
      .replace(/^["']+|["']+$/g, '')
      .trim();
    if (!name) name = email || 'Okänd avsändare';
    return { name, email };
  }
  if (s.includes('@')) return { name: s, email: match.normalizeEmail(s) };
  return { name: s, email: '' };
}

function matchesByLabelIdMap(matches) {
  const map = new Map();
  for (const m of matches || []) {
    if (!m || !m.labelId) continue;
    if (!map.has(m.labelId)) map.set(m.labelId, m);
  }
  return map;
}

/**
 * Fallback när mejlet har KUNDER-etikett men ingen kundmatch:
 * visa etikettens bladnamn så mejlet inte försvinner ur listan.
 * @returns {{ customerId: null, customerName, labelId, labelName, matchReason: 'unmatched' }}
 */
function resolveUnmatchedLabelMeta(message, opts = {}) {
  const kunderRoot = opts.kunderRoot || 'KUNDER';
  const kunderIds = opts.kunderLabelIds;
  const labels = opts.labels || [];
  const labelIds = (message && message.labelIds) || [];

  for (const lid of labelIds) {
    if (kunderIds instanceof Set && !kunderIds.has(lid)) continue;
    const label = labels.find((l) => l && l.id === lid);
    if (!label) continue;
    if (isKunderRootLabel(label.name, kunderRoot)) continue;
    if (!match.isUnderKunder(label.name, kunderRoot)) continue;
    const leaf = match.labelLeafName(label.name);
    return {
      customerId: null,
      customerName: leaf || label.name || 'Okänd etikett',
      labelId: label.id,
      labelName: label.name,
      matchReason: 'unmatched'
    };
  }

  return {
    customerId: null,
    customerName: 'Okänd kund',
    labelId: null,
    labelName: null,
    matchReason: 'unmatched'
  };
}

/**
 * Koppla kund: 1) sparad etikett→kund-koppling 2) e-post 3) fuzzy etikettnamn.
 * @returns {{ customerId, customerName, labelId, labelName, matchReason } | null}
 */
function resolveCustomerForMessage(message, opts = {}) {
  const matchesByLabelId = opts.matchesByLabelId instanceof Map
    ? opts.matchesByLabelId
    : matchesByLabelIdMap(opts.matches);
  const customers = opts.customers || [];
  const labelIds = (message && message.labelIds) || [];
  const excludeEmails = opts.excludeEmails || [];
  const kunderRoot = opts.kunderRoot || 'KUNDER';
  const links = opts.labelLinks || opts.links || [];

  // 1) Explicit ClientFlow-koppling (starkare än fuzzy / e-post)
  if (links.length) {
    const linked = labelLinks.resolveLinkedCustomer(message, {
      links,
      labels: opts.labels || [],
      customers,
      kunderLabelIds: opts.kunderLabelIds,
      kunderRoot
    });
    if (linked) return linked;
  }

  // 2) E-post: först From (avsändare), därefter övriga header-adresser. Aldrig byråns egen adress.
  const fromEmails = match.extractEmailsFromAddressHeader((message && message.from) || '');
  const allEmails = match.collectMessageEmails(message || {});
  const emailPasses = [fromEmails, allEmails].filter((list) => list && list.length);

  let best = null;
  for (const messageEmails of emailPasses) {
    for (const customer of customers) {
      const emailScore = match.scoreEmailMatch(messageEmails, customer, { excludeEmails });
      if (emailScore < match.THRESHOLDS.EMAIL_EXACT) continue;
      if (!best || emailScore > best.emailScore) {
        best = {
          customerId: customer.id,
          customerName: customer.namn,
          labelId: null,
          labelName: null,
          matchReason: 'email',
          emailScore
        };
      }
    }
    if (best) break;
  }
  if (best) {
    const kunderIds = opts.kunderLabelIds;
    if (kunderIds instanceof Set) {
      for (const lid of labelIds) {
        if (!kunderIds.has(lid)) continue;
        const label = (opts.labels || []).find((l) => l.id === lid);
        if (label) {
          best.labelId = label.id;
          best.labelName = label.name;
          break;
        }
      }
    }
    return best;
  }

  // 3) Fuzzy / auto etikettmatch (från matchLabelsToCustomers)
  for (const lid of labelIds) {
    const hit = matchesByLabelId.get(lid);
    if (!hit) continue;
    if (hit.matchReason === 'link') continue;
    return {
      customerId: hit.customerId,
      customerName: hit.customerName,
      labelId: hit.labelId,
      labelName: hit.labelName,
      matchReason: hit.matchReason || 'label'
    };
  }

  return null;
}

function sortMessagesByInternalDateDesc(messages) {
  return [...(messages || [])].sort(
    (a, b) => Number(b.internalDate || 0) - Number(a.internalDate || 0)
  );
}

function normalizeFolder(folder) {
  const f = String(folder || 'inbox').trim().toLowerCase();
  return f === 'sent' || f === 'skickat' ? 'sent' : 'inbox';
}

function messageHasSystemLabel(message, systemId) {
  const ids = (message && message.labelIds) || [];
  return ids.includes(systemId);
}

/** Inkorg = ej SENT/TRASH; Skickat = SENT och ej TRASH. */
function messageMatchesFolder(message, folder) {
  const f = normalizeFolder(folder);
  if (messageHasSystemLabel(message, 'TRASH')) return false;
  const isSent = messageHasSystemLabel(message, 'SENT');
  if (f === 'sent') return isSent;
  return !isSent;
}

const UNMATCHED_FILTER = '__unmatched__';

/**
 * Bygg inkorgslista: filtrera till KUNDER, koppla kund, sortera nyast först, begränsa.
 * Mejl under KUNDER utan kundmatch ingår som omatchade (så de inte "försvinner").
 */
function buildInboxMessages(detailedMessages, opts = {}) {
  const underlagFilter = require('./underlag-filter');
  const kunderIds = opts.kunderLabelIds instanceof Set
    ? opts.kunderLabelIds
    : kunderLabelIdSet(opts.labels || [], opts.kunderRoot);
  const matchesByLabelId = matchesByLabelIdMap(opts.matches);
  const customerIdFilter = String(opts.customerIdFilter || '').trim();
  const matchedOnly = opts.matchedOnly === true;
  const limit = Math.min(Math.max(Number(opts.limit) || 40, 1), 100);
  const folder = normalizeFolder(opts.folder);
  const kunderRoot = opts.kunderRoot || 'KUNDER';

  const out = [];
  for (const msg of detailedMessages || []) {
    if (!messageHasKunderLabel(msg, kunderIds)) continue;
    if (!messageMatchesFolder(msg, folder)) continue;
    if (underlagFilter.isUnderlagRecipientMessage(msg)) continue;
    let resolved = resolveCustomerForMessage(msg, {
      matchesByLabelId,
      customers: opts.customers,
      kunderLabelIds: kunderIds,
      labels: opts.labels,
      excludeEmails: opts.excludeEmails || [],
      labelLinks: opts.labelLinks || opts.links || [],
      kunderRoot
    });
    if (!resolved) {
      if (matchedOnly) continue;
      resolved = resolveUnmatchedLabelMeta(msg, {
        kunderLabelIds: kunderIds,
        labels: opts.labels,
        kunderRoot
      });
    }
    if (customerIdFilter === UNMATCHED_FILTER) {
      if (resolved.matchReason !== 'unmatched') continue;
    } else if (customerIdFilter && resolved.customerId !== customerIdFilter) {
      continue;
    }

    const fromParsed = parseFromHeader(msg.from);
    const resolvedLabels = labelsEdit.resolveMessageLabels(
      msg.labelIds,
      opts.labels || [],
      kunderRoot
    );
    const customerId = resolved.customerId || null;
    out.push({
      ...msg,
      customerId,
      customerIds: customerId ? [customerId] : [],
      customerName: resolved.customerName,
      customerNames: resolved.customerName ? [resolved.customerName] : [],
      labelId: resolved.labelId,
      labelName: resolved.labelName,
      labelLeaf: resolved.labelName ? match.labelLeafName(resolved.labelName) : null,
      labels: resolvedLabels,
      matchReason: resolved.matchReason,
      fromName: fromParsed.name,
      fromEmail: fromParsed.email
    });
  }

  return sortMessagesByInternalDateDesc(out).slice(0, limit);
}

/** Gmail q som matchar rot + underetiketter (OR), med valfri mapp. */
function buildKunderSearchQuery(labels, kunderRoot = 'KUNDER', folder = 'inbox') {
  const kunderLabels = collectKunderLabels(labels, kunderRoot);
  const parts = [];
  const seen = new Set();
  for (const l of kunderLabels) {
    const name = String(l.name || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    // Mellanslag och snedstreck kräver citattecken i Gmail-sök
    const needsQuotes = /[\s/]/.test(name);
    parts.push(needsQuotes ? `label:"${name}"` : `label:${name}`);
  }
  if (!parts.length) return '';
  const labelPart = parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`;
  const f = normalizeFolder(folder);
  if (f === 'sent') return `${labelPart} in:sent -in:trash`;
  return `${labelPart} -in:sent -in:trash`;
}

module.exports = {
  isKunderRootLabel,
  collectKunderLabels,
  kunderLabelIdSet,
  messageHasKunderLabel,
  messageMatchesFolder,
  normalizeFolder,
  parseFromHeader,
  matchesByLabelIdMap,
  resolveCustomerForMessage,
  resolveUnmatchedLabelMeta,
  UNMATCHED_FILTER,
  sortMessagesByInternalDateDesc,
  buildInboxMessages,
  buildKunderSearchQuery
};
