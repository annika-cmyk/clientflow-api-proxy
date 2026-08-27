const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const merge = require('./kyc-formular-merge');

describe('kyc-formular-merge', () => {
  it('effectiveKycStatus behandlar inleed-id som utskickat', () => {
    assert.equal(merge.effectiveKycStatus({ status: 'Sparat', inleedDokumentId: 'doc-1' }), 'Skickat till kund');
  });

  it('effectiveKycStatus behandlar utskickningsdatum som utskickat', () => {
    assert.equal(merge.effectiveKycStatus({ status: 'Sparat', utskickningsdatum: '2026-06-01' }), 'Skickat till kund');
  });

  it('mergeKycFormular behåller utskick vid partiell POST', () => {
    const existing = {
      status: 'Skickat till kund',
      inleedDokumentId: 'doc-9',
      utskickningsdatum: '2026-06-01',
      foretagsnamn: 'Gammalt AB'
    };
    const incoming = {
      internationellaLander: 'Tyskland',
      internationellHandel: 'Ja',
      status: 'Sparat',
      inleedDokumentId: ''
    };
    const merged = merge.mergeKycFormular(existing, incoming);
    assert.equal(merged.status, 'Skickat till kund');
    assert.equal(merged.inleedDokumentId, 'doc-9');
    assert.equal(merged.utskickningsdatum, '2026-06-01');
    assert.equal(merged.internationellaLander, 'Tyskland');
  });

  it('mergeKycFormular återställer status från utskickningsdatum', () => {
    const merged = merge.mergeKycFormular(
      { status: 'Sparat', utskickningsdatum: '2026-05-10' },
      { tjanster: 'Bokföring' }
    );
    assert.equal(merged.status, 'Skickat till kund');
    assert.equal(merged.utskickningsdatum, '2026-05-10');
  });

  it('kycTitleCandidates inkluderar både kundnamn och sparat företagsnamn', () => {
    assert.deepEqual(
      merge.kycTitleCandidates('Nytt AB', { foretagsnamn: 'Gammalt AB' }),
      ['Nytt AB', 'Gammalt AB']
    );
  });
});
