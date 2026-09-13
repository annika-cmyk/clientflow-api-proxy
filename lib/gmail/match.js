/**
 * Matchar Gmail-etiketter under KUNDER mot kunder i ClientFlow.
 */

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

/**
 * @param {Array<{id:string,name:string}>} labels
 * @param {Array<{id:string,namn:string}>} customers
 * @param {{kunderRoot?:string,minScore?:number}} [opts]
 */
function matchLabelsToCustomers(labels, customers, opts = {}) {
  const kunderRoot = opts.kunderRoot || 'KUNDER';
  const minScore = opts.minScore == null ? 70 : opts.minScore;
  const childLabels = (labels || []).filter((l) => isUnderKunder(l.name, kunderRoot));
  const matches = [];
  const unmatchedLabels = [];

  for (const label of childLabels) {
    const leaf = labelLeafName(label.name);
    let best = null;
    let bestScore = 0;
    for (const customer of customers || []) {
      const score = scoreNameMatch(leaf, customer.namn);
      if (score > bestScore) {
        bestScore = score;
        best = customer;
      }
    }
    if (best && bestScore >= minScore) {
      matches.push({
        labelId: label.id,
        labelName: label.name,
        labelLeaf: leaf,
        customerId: best.id,
        customerName: best.namn,
        score: bestScore
      });
    } else {
      unmatchedLabels.push({
        labelId: label.id,
        labelName: label.name,
        labelLeaf: leaf,
        bestScore,
        bestCustomerName: best && bestScore > 0 ? best.namn : null
      });
    }
  }

  return { matches, unmatchedLabels, kunderRoot };
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
  foldName,
  stripLegalSuffix,
  labelLeafName,
  isUnderKunder,
  editDistance,
  scoreNameMatch,
  matchLabelsToCustomers,
  findKunderLabel
};
