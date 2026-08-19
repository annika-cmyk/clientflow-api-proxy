const DOCUMENT_CATEGORIES = [
  'riskbedomning',
  'arsredovisning',
  'uppdragsavtal',
  'kyc',
  'bolagsverket_skatteverket',
  'ovrigt'
];

function parseDokumentKategorier(raw) {
  if (Array.isArray(raw)) return raw.filter((x) => x && typeof x === 'object');
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed.filter((x) => x && typeof x === 'object') : [];
  } catch (_) {
    return [];
  }
}

function normalizeDokumentCategory(cat) {
  const c = String(cat || '').trim();
  return DOCUMENT_CATEGORIES.includes(c) ? c : 'ovrigt';
}

function filenamesMatch(a, b) {
  const x = String(a || '').trim().toLowerCase();
  const y = String(b || '').trim().toLowerCase();
  if (!x || !y) return false;
  return x === y || x.endsWith(y) || y.endsWith(x);
}

function matchDokumentKategori(attachment, kategorier, used) {
  const usedSet = used instanceof Set ? used : new Set();
  const list = Array.isArray(kategorier) ? kategorier : [];
  const att = attachment || {};

  for (let i = 0; i < list.length; i++) {
    if (usedSet.has(i)) continue;
    const meta = list[i] || {};
    if (meta.attachmentId && att.id && String(meta.attachmentId) === String(att.id)) {
      usedSet.add(i);
      return { meta, index: i };
    }
  }

  for (let i = 0; i < list.length; i++) {
    if (usedSet.has(i)) continue;
    const meta = list[i] || {};
    if (filenamesMatch(att.filename || att.name, meta.filename)) {
      usedSet.add(i);
      return { meta, index: i };
    }
  }

  return null;
}

function matchDokumentKategoriAtIndex(attachment, kategorier, index, used) {
  const hit = matchDokumentKategori(attachment, kategorier, used);
  if (hit) return hit;
  const usedSet = used instanceof Set ? used : new Set();
  const list = Array.isArray(kategorier) ? kategorier : [];
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= list.length || usedSet.has(i)) return null;
  const meta = list[i];
  if (!meta || typeof meta !== 'object') return null;
  usedSet.add(i);
  return { meta, index: i };
}

module.exports = {
  DOCUMENT_CATEGORIES,
  parseDokumentKategorier,
  normalizeDokumentCategory,
  filenamesMatch,
  matchDokumentKategori,
  matchDokumentKategoriAtIndex
};
