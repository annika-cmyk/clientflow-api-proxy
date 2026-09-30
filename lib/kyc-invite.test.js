const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const KycInvite = require('./kyc-invite');

describe('kyc-invite', () => {
  it('creates and verifies HMAC invite without Airtable scan', () => {
    const invite = KycInvite.createInviteToken('recKyc1');
    assert.ok(invite.token);
    assert.ok(invite.expiresAt);
    const verified = KycInvite.verifyInviteToken(invite.token);
    assert.equal(verified.customerId, 'recKyc1');
  });

  it('buildInviteUrl pekar på kyc-svar.html', () => {
    const invite = KycInvite.createInviteToken('recX');
    const url = KycInvite.buildInviteUrl(invite.token, 'https://example.test');
    assert.ok(url.startsWith('https://example.test/kyc-svar.html?token='));
  });

  it('applyInviteSent sätter status och pendingSignerare', () => {
    const { kyc, inviteUrl } = KycInvite.applyInviteSent(
      { foretagsnamn: 'Test AB', status: 'Sparat' },
      {
        customerId: 'rec1',
        signerare: [{ namn: 'Anna', epost: 'anna@exempel.se' }]
      }
    );
    assert.equal(kyc.status, KycInvite.STATUS_FILL_PENDING);
    assert.ok(kyc.inviteToken);
    assert.equal(kyc.pendingSignerare.length, 1);
    assert.ok(inviteUrl.includes('kyc-svar.html'));
    assert.equal(KycInvite.inviteIsActive(kyc, kyc.inviteToken), true);
  });

  it('inviteIsActive blir false efter kundsvar', () => {
    const { kyc } = KycInvite.applyInviteSent(
      { foretagsnamn: 'Test AB' },
      { customerId: 'rec2', signerare: [{ namn: 'Bo', epost: 'bo@exempel.se' }] }
    );
    const answered = KycInvite.applyCustomerAnswers(
      kyc,
      { foretagsnamn: 'Test AB', orgnr: '556677-8899', bekraftelse: true },
      { markAnswered: true }
    );
    assert.equal(answered.status, KycInvite.STATUS_ANSWERED);
    assert.equal(KycInvite.inviteIsActive(answered, kyc.inviteToken), false);
    assert.equal(answered.answeredByCustomer, true);
  });

  it('agencyInviteSummary redovisar aktiv länk', () => {
    const { kyc } = KycInvite.applyInviteSent(
      {},
      { customerId: 'rec3', signerare: [{ namn: 'Cia', epost: 'cia@exempel.se' }] }
    );
    const summary = KycInvite.agencyInviteSummary(kyc, { baseUrl: 'https://app.test' });
    assert.equal(summary.inviteActive, true);
    assert.ok(summary.inviteUrl.includes(encodeURIComponent(kyc.inviteToken)) || summary.inviteUrl.includes(kyc.inviteToken));
  });

  it('publicKycPayload exponerar inte inviteToken', () => {
    const { kyc } = KycInvite.applyInviteSent(
      { foretagsnamn: 'Pub AB', pep: 'Nej' },
      { customerId: 'rec4', signerare: [{ namn: 'Dan', epost: 'dan@exempel.se' }] }
    );
    const pub = KycInvite.publicKycPayload(kyc, { companyName: 'Pub AB', byraName: 'Byrån' });
    assert.equal(pub.companyName, 'Pub AB');
    assert.equal(pub.answered, false);
    assert.equal(pub.answers.foretagsnamn, 'Pub AB');
    assert.equal(pub.answers.inviteToken, undefined);
    assert.ok(!JSON.stringify(pub).includes(kyc.inviteToken));
  });

  it('kräver signerare vid applyInviteSent', () => {
    assert.throws(
      () => KycInvite.applyInviteSent({}, { customerId: 'rec5', signerare: [] }),
      (err) => err && err.code === 'SIGNERARE_REQUIRED'
    );
  });
});
