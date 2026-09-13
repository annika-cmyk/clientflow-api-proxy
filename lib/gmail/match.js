/**
 * Matchar Gmail-etiketter under KUNDER mot kunder i ClientFlow.
 *
 * ## Trösklar (dubbelverifiering)
 * - LABEL_STRONG (70): stark etikett↔namn räcker ensam.
 * - LABEL_WEAK (40): vag etikett; ensam räcker inte (behöver e-post).
 * - EMAIL_EXACT (100): exakt e-post (case-insensitive) i From/To/Cc ↔ kundkort/kontakt → match ensam.
 *
 * Accepterad match om:
 * 1) emailScore >= EMAIL_EXACT (enbart e-post), eller
 * 2) labelScore >= LABEL_STRONG (stark etikett), eller
 * 3) labelScore >= LABEL_WEAK && emailScore >= EMAIL_EXACT (vag etikett + e-post).
 */

const THRESHOLDS = Object.freeze({
  LABEL_STRONG: 70,
  LABEL_WEAK: 40,
  EMAIL_EXACT: 100
});

function foldName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' och ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(och|and)\b/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function stripLegalSuffix(folded) {
  return folded
    .replace(/\b(ab|hb|kb|ef|aktiebolag|handelsbolag|kommanditbolag|enskild firma)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function labelLeafName(labelName) {
  const raw = String(labelName || '').trim();
  if (!raw) return '';
  const parts = raw.split('/');
  return (parts[parts.length - 1] || '').trim();
}

function isUnderKunder(labelName, kunderRoot = 'KUNDER') {
  const name = String(labelName || '').trim();
  const root = String(kunderRoot || 'KUNDER').trim();
  if (!name || !root) return false;
  if (foldName(name) === foldName(root)) return false;
  const rootFold = foldName(root);
  const slash = name.indexOf('/');
  if (slash <= 0) return false;
  const parent = name.slice(0, slash).trim();
  return foldName(parent) === rootFold || name.toLowerCase().startsWith(`${root.toLowerCase()}/`);
}

function editDistance(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const rows = s.length + 1;
  const cols = t.length + 1;
  const prev = new Array(cols);
  const curr = new Array(cols);
  for (let j = 0; j < cols; j += 1) prev[j] = j;
  for (let i = 1; i < rows; i += 1) {
    curr[0] = i;
    const sc = s.charCodeAt(i - 1);
    for (let j = 1; j < cols; j += 1) {
      const cost = sc === t.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j < cols; j += 1) prev[j] = curr[j];
  }
  return prev[t.length];
}

function tokens(folded) {
  return String(folded || '')
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean);
}

function tokensRoughlyEqual(a, b) {
  if (a === b) return true;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen < 4) return false;
  const dist = editDistance(a, b);
  if (maxLen <= 6) return dist <= 1;
  return dist <= 2 && dist / maxLen <= 0.25;
}

function tokenCoverage(shorterTokens, longerTokens) {
  if (!shorterTokens.length || !longerTokens.length) return 0;
  let hits = 0;
  const used = new Set();
  for (const st of shorterTokens) {
    let found = false;
    for (let i = 0; i < longerTokens.length; i += 1) {
      if (used.has(i)) continue;
      if (tokensRoughlyEqual(st, longerTokens[i])) {
        used.add(i);
        found = true;
        break;
      }
    }
    if (found) hits += 1;
  }
  return hits / shorterTokens.length;
}

function scoreNameMatch(labelLeaf, customerName) {
  const a = foldName(labelLeaf);
  const b = foldName(customerName);
  if (!a || !b) return 0;
  if (a === b) return 100;

  const as = stripLegalSuffix(a);
  const bs = stripLegalSuffix(b);
  if (!as || !bs) return 0;
  if (as === bs) return 90;

  const aTokens = tokens(as);
  const bTokens = tokens(bs);
  const shorter = aTokens.length <= bTokens.length ? aTokens : bTokens;
  const longer = aTokens.length <= bTokens.length ? bTokens : aTokens;
  const cover = tokenCoverage(shorter, longer);
  if (shorter.length >= 2 && cover >= 1) return 85;
  if (shorter.length >= 2 && cover >= 0.8) return 75;
  if (shorter.length === 1 && cover >= 1 && shorter[0].length >= 5) return 72;
  // Vag delträff (t.ex. 1 av 2 tokens) – kräver e-post för acceptans.
  if (shorter.length >= 2 && cover >= 0.5) return 55;

  if (as.includes(bs) || bs.includes(as)) {
    const shortLen = Math.min(as.length, bs.length);
    const longLen = Math.max(as.length, bs.length);
    if (shortLen >= 4 && shortLen / longLen >= 0.45) return 70;
  }

  const maxLen = Math.max(as.length, bs.length);
  if (maxLen >= 10) {
    const dist = editDistance(as, bs);
    if (dist <= 2 && dist / maxLen <= 0.15) return 80;
    if (dist <= 3 && dist / maxLen <= 0.12) return 72;
  }

  return 0;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

/** Plockar e-postadresser ur From/To/Cc-header (`Name <a@b.se>, c@d.se`). */
function extractEmailsFromAddressHeader(headerValue) {
  const s = String(headerValue || '');
  const found = [];
  const seen = new Set();
  const re = /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi;
  let m;
  while ((m = re.exec(s))) {
    const e = normalizeEmail(m[1]);
    if (!e || seen.has(e)) continue;
    seen.add(e);
    found.push(e);
  }
  return found;
}

function collectMessageEmails(summaryOrHeaders = {}) {
  const from = summaryOrHeaders.from || '';
  const to = summaryOrHeaders.to || '';
  const cc = summaryOrHeaders.cc || '';
  const all = [
    ...extractEmailsFromAddressHeader(from),
    ...extractEmailsFromAddressHeader(to),
    ...extractEmailsFromAddressHeader(cc)
  ];
  return [...new Set(all)];
}

function customerEmailSet(customer) {
  const set = new Set();
  const add = (raw) => {
    const e = normalizeEmail(raw);
    if (e && e.includes('@')) set.add(e);
  };
  add(customer && customer.email);
  for (const e of (customer && customer.emails) || []) add(e);
  return set;
}

/** Exakt e-postträff (case-insensitive) → EMAIL_EXACT, annars 0. */
function scoreEmailMatch(messageEmails, customer, opts = {}) {
  const cust = customerEmailSet(customer);
  if (!cust.size || !(messageEmails || []).length) return 0;
  const exclude = new Set(
    (opts.excludeEmails || []).map((e) => normalizeEmail(e)).filter((e) => e && e.includes('@'))
  );
  for (const raw of messageEmails) {
    const e = normalizeEmail(raw);
    if (!e || exclude.has(e)) continue;
    if (cust.has(e)) return THRESHOLDS.EMAIL_EXACT;
  }
  return 0;
}

/**
 * @returns {{ accepted: boolean, reason: 'email'|'label'|'label+email'|null }}
 */
function decideMatch(labelScore, emailScore, opts = {}) {
  const strong = opts.labelStrong == null ? THRESHOLDS.LABEL_STRONG : opts.labelStrong;
  const weak = opts.labelWeak == null ? THRESHOLDS.LABEL_WEAK : opts.labelWeak;
  const emailExact = opts.emailExact == null ? THRESHOLDS.EMAIL_EXACT : opts.emailExact;

  const hasEmail = emailScore >= emailExact;
  const strongLabel = labelScore >= strong;
  const weakLabel = labelScore >= weak;

  if (hasEmail && weakLabel && !strongLabel) {
    return { accepted: true, reason: 'label+email' };
  }
  if (hasEmail) return { accepted: true, reason: 'email' };
  if (strongLabel) return { accepted: true, reason: 'label' };
  return { accepted: false, reason: null };
}

function pickCustomerMatch(labelLeaf, customers, messageEmails = [], opts = {}) {
  let best = null;
  for (const customer of customers || []) {
    const labelScore = scoreNameMatch(labelLeaf, customer.namn);
    const emailScore = scoreEmailMatch(messageEmails, customer, opts);
    const decision = decideMatch(labelScore, emailScore, opts);
    if (!decision.accepted) continue;
    const rank = emailScore * 1000 + labelScore;
    if (!best || rank > best.rank) {
      best = {
        customer,
        labelScore,
        emailScore,
        reason: decision.reason,
        rank
      };
    }
  }
  return best;
}

/**
 * @param {Array<{id:string,name:string}>} labels
 * @param {Array<{id:string,namn:string,email?:string,emails?:string[]}>} customers
 * @param {{
 *   kunderRoot?: string,
 *   minScore?: number,
 *   labelStrong?: number,
 *   labelWeak?: number,
 *   messageEmailsByLabelId?: Record<string, string[]>
 * }} [opts]
 */
function matchLabelsToCustomers(labels, customers, opts = {}) {
  const kunderRoot = opts.kunderRoot || 'KUNDER';
  const labelStrong = opts.labelStrong != null
    ? opts.labelStrong
    : (opts.minScore == null ? THRESHOLDS.LABEL_STRONG : opts.minScore);
  const labelWeak = opts.labelWeak == null ? THRESHOLDS.LABEL_WEAK : opts.labelWeak;
  const emailOpts = {
    labelStrong,
    labelWeak,
    excludeEmails: opts.excludeEmails || []
  };
  const emailsByLabel = opts.messageEmailsByLabelId || {};
  const childLabels = (labels || []).filter((l) => isUnderKunder(l.name, kunderRoot));
  const matches = [];
  const unmatchedLabels = [];

  for (const label of childLabels) {
    const leaf = labelLeafName(label.name);
    const messageEmails = emailsByLabel[label.id] || [];
    const picked = pickCustomerMatch(leaf, customers, messageEmails, emailOpts);

    if (picked) {
      matches.push({
        labelId: label.id,
        labelName: label.name,
        labelLeaf: leaf,
        customerId: picked.customer.id,
        customerName: picked.customer.namn,
        score: picked.labelScore,
        emailScore: picked.emailScore,
        matchReason: picked.reason
      });
    } else {
      let best = null;
      let bestScore = 0;
      for (const customer of customers || []) {
        const score = scoreNameMatch(leaf, customer.namn);
        if (score > bestScore) {
          bestScore = score;
          best = customer;
        }
      }
      unmatchedLabels.push({
        labelId: label.id,
        labelName: label.name,
        labelLeaf: leaf,
        bestScore,
        bestCustomerName: best && bestScore > 0 ? best.namn : null
      });
    }
  }

  return {
    matches,
    unmatchedLabels,
    kunderRoot,
    thresholds: { ...THRESHOLDS, labelStrong, labelWeak }
  };
}

function findKunderLabel(labels, kunderRoot = 'KUNDER') {
  const root = String(kunderRoot || 'KUNDER').trim();
  const list = labels || [];
  return (
    list.find((l) => String(l.name || '').trim() === root) ||
    list.find((l) => foldName(l.name) === foldName(root)) ||
    null
  );
}

module.exports = {
  THRESHOLDS,
  foldName,
  stripLegalSuffix,
  labelLeafName,
  isUnderKunder,
  editDistance,
  scoreNameMatch,
  normalizeEmail,
  extractEmailsFromAddressHeader,
  collectMessageEmails,
  scoreEmailMatch,
  decideMatch,
  pickCustomerMatch,
  matchLabelsToCustomers,
  findKunderLabel
};
