'use strict';

const { namesEqual } = require('./docsign-invite');

function parseInleedDocumentsList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.documents)) return data.documents;
  if (data && typeof data === 'object' && (data.id || data.document_id || data.parties)) {
    return [data];
  }
  return [];
}

function pickInleedDocument(data, inleedDocId) {
  const wanted = String(inleedDocId || '').trim();
  const list = parseInleedDocumentsList(data);
  if (!wanted) return list[0] || null;
  return list.find((d) => String(d.id || d.document_id || '') === wanted) || null;
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function partySignUrl(party) {
  if (!party || typeof party !== 'object') return '';
  const candidates = [
    party.sign_url,
    party.signing_url,
    party.signingUrl,
    party.url,
    party.link
  ];
  for (const value of candidates) {
    if (isHttpUrl(value)) return String(value).trim();
  }
  return '';
}

function partyIsSigned(party) {
  if (!party || typeof party !== 'object') return false;
  if (party.signed_at || party.signedAt || party.signed_by_name || party.signed_by_id) return true;
  const st = String(party.status || party.state || party.signingStatus || '').toLowerCase();
  return ['signed', 'completed', 'done', 'finished'].includes(st);
}

function partyLooksLikeByra(party, index, opts = {}) {
  if (!party) return false;
  const externalId = String(party.external_id || party.externalId || '').trim();
  if (/^konsult-/i.test(externalId)) return true;
  if (opts.byraEmail && namesEqual(party.email, opts.byraEmail)) return true;
  if (opts.byraNamn && namesEqual(party.name || party.signed_by_name, opts.byraNamn)) return true;
  if (opts.firstPartyIsByra && index === 0) return true;
  return false;
}

function extractInleedSignLinks(doc, opts = {}) {
  const parties = Array.isArray(doc?.parties) ? doc.parties : [];
  return parties.map((party, index) => {
    const namn = String(party.name || party.signed_by_name || party.signedByName || '').trim();
    const email = String(party.email || '').trim();
    const signUrl = partySignUrl(party);
    const signed = partyIsSigned(party);
    const isByra = partyLooksLikeByra(party, index, opts);
    return {
      namn,
      email,
      signUrl,
      signed,
      signedAt: String(party.signed_at || party.signedAt || '').trim(),
      roll: isByra ? 'byra' : 'kund'
    };
  }).filter((row) => row.signUrl || row.namn || row.email);
}

function normalizeDocTitle(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function inleedDocumentTitle(kind, kundnamn) {
  const namn = String(kundnamn || '').trim();
  if (!namn) return '';
  return kind === 'uppdragsavtal' ? `Uppdragsavtal - ${namn}` : `KYC-formulär - ${namn}`;
}

function createdAtMs(doc) {
  const raw = Date.parse(String((doc && doc.created_at) || '').replace(' ', 'T'));
  return Number.isFinite(raw) ? raw : 0;
}

function findInleedDocumentByTitle(data, title) {
  const wanted = normalizeDocTitle(title);
  if (!wanted) return null;
  const list = parseInleedDocumentsList(data);
  const hits = list.filter((d) => normalizeDocTitle(d && d.name) === wanted);
  if (!hits.length) return null;
  hits.sort((a, b) => createdAtMs(b) - createdAtMs(a));
  const completed = hits.find((d) => {
    const st = String(d.state || d.status || '').toLowerCase();
    return ['completed', 'signed', 'done', 'finished'].includes(st) || d.signed_pdf_url;
  });
  return completed || hits[0];
}

function toDateOnly(value) {
  if (!value) return '';
  const s = String(value).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const parsed = Date.parse(s.replace(' ', 'T'));
  if (!Number.isFinite(parsed)) return '';
  return new Date(parsed).toISOString().slice(0, 10);
}

function extractSignedDate(doc) {
  const candidates = [];
  if (doc && typeof doc === 'object') {
    candidates.push(doc.signed_at, doc.signedAt, doc.completed_at, doc.completedAt);
    const parties = Array.isArray(doc.parties) ? doc.parties : [];
    for (const party of parties) {
      if (party && typeof party === 'object') {
        candidates.push(party.signed_at, party.signedAt);
      }
    }
  }
  const dates = candidates.map(toDateOnly).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : '';
}

function buildInleedSignPayload(doc, opts = {}) {
  const documentId = String(
    (doc && (doc.id || doc.document_id)) || opts.documentId || ''
  ).trim();
  return {
    documentId,
    state: String((doc && (doc.state || doc.status)) || '').trim(),
    signedPdfUrl: (doc && (doc.signed_pdf_url || doc.signed_document_url || doc.download_url)) || null,
    originalPdfUrl: (doc && doc.original_pdf_url) || null,
    links: extractInleedSignLinks(doc, opts)
  };
}

module.exports = {
  parseInleedDocumentsList,
  pickInleedDocument,
  findInleedDocumentByTitle,
  inleedDocumentTitle,
  partySignUrl,
  extractInleedSignLinks,
  extractSignedDate,
  buildInleedSignPayload
};
