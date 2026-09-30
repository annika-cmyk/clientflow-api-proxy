/**
 * Synka tjänster från KYC-formulär → Kundens utvalda tjänster (riskbedömning).
 * Matchar namn mot byråns aktiva katalog; okatalogiserade ignoreras.
 */

const TjanstKatalog = require('../public/js/tjanst-katalog');

/**
 * Tolka KYC.tjanster (sträng, array eller blandat) till etiketter.
 * @param {string|string[]|null|undefined} raw
 * @returns {string[]}
 */
function parseKycTjansterLabels(raw) {
  if (raw == null || raw === '') return [];
  const chunks = Array.isArray(raw) ? raw : [raw];
  const out = [];
  const seen = new Set();
  for (const chunk of chunks) {
    if (chunk == null || chunk === '') continue;
    if (Array.isArray(chunk)) {
      for (const label of parseKycTjansterLabels(chunk)) {
        const key = TjanstKatalog.foldName(label);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(label);
      }
      continue;
    }
    String(chunk)
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((label) => {
        const key = TjanstKatalog.foldName(label);
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push(label);
      });
  }
  return out;
}

/**
 * @param {object} opts
 * @param {string|string[]} [opts.kycTjanster]
 * @param {object[]} [opts.catalog] – byråtjänster (id, namn, aktuell, valbar/aktiv)
 * @param {object} [opts.katalogOpts]
 * @returns {{ labels: string[], linkedIds: string[], matchedNamn: string[], unmatched: string[], matchedCount: number }}
 */
function resolveKycTjansterToCatalogIds({ kycTjanster, catalog = [], katalogOpts = {} } = {}) {
  const labels = parseKycTjansterLabels(kycTjanster);
  if (!labels.length) {
    return { labels: [], linkedIds: [], matchedNamn: [], unmatched: [], matchedCount: 0 };
  }
  const index = TjanstKatalog.catalogFromRecords(catalog);
  const linkedIds = TjanstKatalog.sanitizeToActiveCatalogIds(labels, index, katalogOpts);
  const classified = TjanstKatalog.classifyCustomerServices(labels, index, katalogOpts);
  const unmatched = TjanstKatalog.reviewLabels(labels, index, katalogOpts);
  const matchedNamn = [];
  const seenNamn = new Set();
  linkedIds.forEach((id) => {
    const item = index.byId[id];
    const namn = item && item.namn;
    if (!namn || seenNamn.has(namn)) return;
    seenNamn.add(namn);
    matchedNamn.push(namn);
  });
  return {
    labels,
    linkedIds,
    matchedNamn,
    unmatched,
    matchedCount: (classified.matched || []).length + (classified.normalize || []).length
  };
}

/**
 * Jämför två listor med record-id (ordning spelar ingen roll).
 */
function linkedIdsChanged(before, after) {
  const a = TjanstKatalog.asValues(before).slice().sort();
  const b = TjanstKatalog.asValues(after).slice().sort();
  if (a.length !== b.length) return true;
  return a.some((id, i) => id !== b[i]);
}

module.exports = {
  parseKycTjansterLabels,
  resolveKycTjansterToCatalogIds,
  linkedIdsChanged
};
