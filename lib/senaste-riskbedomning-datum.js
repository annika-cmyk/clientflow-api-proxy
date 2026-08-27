const dokumentKategori = require('./dokument-kategori');
const dokumentRiskSubkategori = require('./dokument-risk-subkategori');

const FIELD_CANDIDATES = [
  'Riskbedömning utförd datum',
  'Riskbedomning utford datum',
  'Kundens riskbedömning godkänd',
  'Kundens riskbedomning godkand'
];

function latestIso(dates) {
  const valid = (dates || []).map((d) => dokumentKategori.toDateOnly(d)).filter(Boolean);
  if (!valid.length) return '';
  return valid.sort().reverse()[0];
}

/** Senaste datum för genomförd/dokumenterad kund-riskbedömning. */
function resolveSenasteRiskbedomningDatum(fields) {
  const f = fields && typeof fields === 'object' ? fields : {};
  const candidates = FIELD_CANDIDATES.map((key) => f[key]);

  const kategorier = dokumentKategori.parseDokumentKategorier(f['Dokumentation Kategorier']);
  for (const entry of kategorier) {
    if (!entry || typeof entry !== 'object') continue;
    const cat = String(entry.category || entry.kategori || '').trim();
    if (cat !== dokumentRiskSubkategori.AKTUELL_RISK_CATEGORY) continue;
    const sub = dokumentRiskSubkategori.normalizeSubcategory(entry.subcategory);
    if (sub !== 'kund_riskbedomning') continue;
    candidates.push(entry.createdDate || entry.skapatDatum);
    candidates.push(dokumentKategori.dateFromFilename(entry.filename || entry.displayName));
  }

  return latestIso(candidates);
}

function formatSenasteRiskbedomningSv(iso) {
  const d = dokumentKategori.toDateOnly(iso);
  if (!d) return '';
  return new Date(`${d}T12:00:00`).toLocaleDateString('sv-SE');
}

module.exports = {
  resolveSenasteRiskbedomningDatum,
  formatSenasteRiskbedomningSv
};
