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
  partySignUrl,
  extractInleedSignLinks,
  buildInleedSignPayload
};
