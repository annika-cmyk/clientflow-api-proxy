const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseInleedDocumentsList,
  pickInleedDocument,
  findInleedDocumentByTitle,
  inleedDocumentTitle,
  extractInleedSignLinks,
  buildInleedSignPayload
} = require('./inleed-links');

describe('inleed-links', () => {
  const pendingAvtal = {
    id: 'doc-1',
    state: 'pending',
    original_pdf_url: 'https://docsign.se/files/original.pdf',
    parties: [
      {
        name: 'Annika Rydén',
        email: 'annika@ryden.se',
        external_id: 'konsult-rec1-annika',
        sign_url: 'https://docsign.se/sign/byra-token'
      },
      {
        name: 'Maria Svensson',
        email: 'maria@kund.se',
        sign_url: 'https://docsign.se/sign/kund-token'
      }
    ]
  };

  it('läser dokumentlista, wrapper och ensamt objekt', () => {
    assert.equal(parseInleedDocumentsList([pendingAvtal]).length, 1);
    assert.equal(parseInleedDocumentsList({ documents: [pendingAvtal] }).length, 1);
    assert.equal(parseInleedDocumentsList(pendingAvtal)[0].id, 'doc-1');
    assert.equal(pickInleedDocument({ documents: [pendingAvtal] }, 'doc-1').id, 'doc-1');
    assert.equal(pickInleedDocument({ documents: [pendingAvtal] }, 'missing'), null);
  });

  it('plockar byråns signeringslänk först via konsult-prefix', () => {
    const links = extractInleedSignLinks(pendingAvtal);
    assert.equal(links.length, 2);
    assert.equal(links[0].roll, 'byra');
    assert.equal(links[0].signUrl, 'https://docsign.se/sign/byra-token');
    assert.equal(links[0].signed, false);
    assert.equal(links[1].roll, 'kund');
    assert.equal(links[1].signUrl, 'https://docsign.se/sign/kund-token');
  });

  it('markerar första parten som byrå när det begärs', () => {
    const links = extractInleedSignLinks({
      parties: [
        { name: 'Lisa Bok', email: 'lisa@ryden.se', signing_url: 'https://docsign.se/sign/lisa' },
        { name: 'Kund', email: 'k@kund.se', url: 'https://docsign.se/sign/kund' }
      ]
    }, { firstPartyIsByra: true });
    assert.equal(links[0].roll, 'byra');
    assert.equal(links[0].signUrl, 'https://docsign.se/sign/lisa');
    assert.equal(links[1].roll, 'kund');
  });

  it('matchar byrå på e-post och ser signerade parter', () => {
    const links = extractInleedSignLinks({
      parties: [
        { name: 'Annika Rydén', email: 'annika@ryden.se', signed_at: '2026-08-19 10:00:00' },
        { name: 'Maria', email: 'maria@kund.se', sign_url: 'https://docsign.se/sign/maria' }
      ]
    }, { byraEmail: 'annika@ryden.se' });
    assert.equal(links[0].roll, 'byra');
    assert.equal(links[0].signed, true);
    assert.equal(links[1].roll, 'kund');
  });

  it('bygger payload med dokumentstatus och länkar', () => {
    const payload = buildInleedSignPayload(pendingAvtal, { documentId: 'doc-1' });
    assert.equal(payload.documentId, 'doc-1');
    assert.equal(payload.state, 'pending');
    assert.equal(payload.originalPdfUrl, 'https://docsign.se/files/original.pdf');
    assert.equal(payload.links[0].signUrl, 'https://docsign.se/sign/byra-token');
  });

  it('hittar senaste färdiga dokumentet på titel', () => {
    assert.equal(inleedDocumentTitle('kyc', 'Andersson, Tobias'), 'KYC-formulär - Andersson, Tobias');
    const hit = findInleedDocumentByTitle([
      { id: 'old', name: 'KYC-formulär - Andersson, Tobias', state: 'completed', created_at: '2026-01-01 10:00:00' },
      { id: 'new', name: 'KYC-formulär - Andersson, Tobias', state: 'completed', created_at: '2026-06-04 13:13:06', signed_pdf_url: 'https://docsign.se/x.pdf' },
      { id: 'other', name: 'KYC-formulär - Annan', state: 'completed', created_at: '2026-08-01 10:00:00' }
    ], 'KYC-formulär - Andersson, Tobias');
    assert.equal(hit.id, 'new');
    assert.equal(findInleedDocumentByTitle([], 'KYC-formulär - Andersson, Tobias'), null);
  });
});
