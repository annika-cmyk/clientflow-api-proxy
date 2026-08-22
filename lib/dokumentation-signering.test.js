const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseSignering,
  pickSignerFromUsers,
  buildPendingSignering,
  markSigneringSigned,
  approvalFieldsFromSignedAt,
  publicSignering,
  dokumentationInleedTitle,
  RISK_GODKAND_FIELD,
  POLICY_GODKAND_FIELD
} = require('./dokumentation-signering');

describe('dokumentation-signering', () => {
  const users = [
    { id: 'rec1', name: 'Annika Rydén', email: 'annika@ryden.se', role: 'Ledare' },
    { id: 'rec2', name: 'Lisa Bok', email: '', role: 'Anställd' }
  ];

  it('parsar JSON-status och hoppar över skräp', () => {
    assert.equal(parseSignering(''), null);
    assert.equal(parseSignering('not-json'), null);
    assert.equal(parseSignering({ inleedDokumentId: '9' }).inleedDokumentId, '9');
    assert.equal(parseSignering('{"inleedDokumentId":"9","status":"pending"}').status, 'pending');
  });

  it('väljer bara byråanvändare med namn och e-post', () => {
    assert.equal(pickSignerFromUsers(users, 'rec2'), null);
    assert.equal(pickSignerFromUsers(users, 'rec-saknas'), null);
    const signer = pickSignerFromUsers(users, 'rec1');
    assert.equal(signer.epost, 'annika@ryden.se');
    assert.equal(signer.namn, 'Annika Rydén');
  });

  it('bygger pending-status och sätter godkännandedatum vid signering', () => {
    const pending = buildPendingSignering({
      inleedDokumentId: 'doc-1',
      signer: { id: 'rec1', namn: 'Annika Rydén', epost: 'annika@ryden.se' },
      sentAt: '2026-08-22T10:00:00.000Z'
    });
    assert.equal(pending.status, 'pending');
    assert.equal(publicSignering(pending).signerEmail, 'annika@ryden.se');

    const signed = markSigneringSigned(pending, '2026-08-21 14:03:00');
    assert.equal(signed.status, 'signed');
    assert.equal(signed.signedAt, '2026-08-21');

    const fields = approvalFieldsFromSignedAt('2026-08-21T14:03:00Z');
    assert.equal(fields[RISK_GODKAND_FIELD], '2026-08-21');
    assert.equal(fields[POLICY_GODKAND_FIELD], '2026-08-21');
    assert.equal(approvalFieldsFromSignedAt(''), null);
  });

  it('bygger dokumenttitel utan kundnamn', () => {
    assert.equal(
      dokumentationInleedTitle('Ryden Redovisning'),
      'Allmän riskbedömning och rutiner - Ryden Redovisning'
    );
  });
});
