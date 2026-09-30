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

  it('effectiveKycStatus känner igen invite-status', () => {
    assert.equal(
      merge.effectiveKycStatus({ status: 'Skickat för ifyllnad', inviteToken: 'tok' }),
      'Skickat för ifyllnad'
    );
    assert.equal(
      merge.effectiveKycStatus({ status: 'Besvarat av kund', customerAnsweredAt: '2026-09-30' }),
      'Besvarat av kund'
    );
  });

  it('Inleed-status vinner över invite-status', () => {
    assert.equal(
      merge.effectiveKycStatus({
        status: 'Skickat för ifyllnad',
        inviteToken: 'tok',
        inleedDokumentId: 'doc-2'
      }),
      'Skickat till kund'
    );
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

  it('mergeKycFormular behåller invite vid partiell POST', () => {
    const existing = {
      status: 'Skickat för ifyllnad',
      inviteToken: 'tok-abc',
      inviteExpiresAt: '2026-10-30T00:00:00.000Z',
      pendingSignerare: [{ namn: 'A', epost: 'a@x.se' }]
    };
    const merged = merge.mergeKycFormular(existing, {
      verksamhet: 'Handel',
      status: 'Sparat',
      inviteToken: ''
    });
    assert.equal(merged.status, 'Skickat för ifyllnad');
    assert.equal(merged.inviteToken, 'tok-abc');
    assert.equal(merged.pendingSignerare.length, 1);
    assert.equal(merged.verksamhet, 'Handel');
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
