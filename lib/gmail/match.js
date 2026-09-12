/**
 * Matchar Gmail-etiketter under KUNDER mot kunder i ClientFlow.
 */

function foldName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
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
  if (name === root) return false;
  return name === `${root}/${labelLeafName(name)}` || name.startsWith(`${root}/`);
}

function scoreNameMatch(labelLeaf, customerName) {
  const a = foldName(labelLeaf);
  const b = foldName(customerName);
  if (!a || !b) return 0;
  if (a === b) return 100;
  const as = stripLegalSuffix(a);
  const bs = stripLegalSuffix(b);
  if (as && bs && as === bs) return 90;
  if (as && bs && (as.includes(bs) || bs.includes(as))) {
    const shorter = Math.min(as.length, bs.length);
    const longer = Math.max(as.length, bs.length);
    if (shorter >= 4 && shorter / longer >= 0.6) return 70;
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
        bestScore
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
  scoreNameMatch,
  matchLabelsToCustomers,
  findKunderLabel
};
