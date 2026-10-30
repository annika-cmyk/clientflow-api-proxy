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

  it('normalizeCustomerAnswers whitelistar kundfält och pluralSv', () => {
    const n = KycInvite.normalizeCustomerAnswers({
      foretagsnamn: 'AB Test',
      pep: 'Ja',
      residual: 99,
      riskFlags: ['x'],
      Villkorade: { a: 1 },
      vh_utlandska_agare: 'Ja',
      bekraftelse: true,
      foretradare: [{ namn: 'Eva', personnr: '19800101-0000', hemvist: 'Norge' }]
    });
    assert.equal(n.foretagsnamn, 'AB Test');
    assert.equal(n.pep, 'Ja');
    assert.equal(n.vh_utlandska_agare, true);
    assert.equal(n.residual, undefined);
    assert.equal(n.riskFlags, undefined);
    assert.equal(n.Villkorade, undefined);
    assert.equal(n.foretradare.length, 1);
    assert.equal(n.foretradare[0].skatterattslig_hemvist, 'Norge');
    assert.equal(KycInvite.pluralSv(1, 'fråga', 'frågor'), 'fråga');
    assert.equal(KycInvite.pluralSv(2, 'fråga', 'frågor'), 'frågor');
    assert.equal(KycInvite.pluralSv(0, 'person', 'personer'), 'personer');
  });

  it('stripByraOnlyKeys + publicKycPayload läcker inte byråfält', () => {
    const dirty = {
      foretagsnamn: 'Safe AB',
      pep: 'Nej',
      residual: 12,
      riskfaktor: 'kontanter',
      Länsstyrelsen: true,
      kundresa: { step: 4 },
      Villkorade: { x: 1 },
      villkorade_svar: {},
      byraHelp: 'hemlig hjälp',
      inviteToken: 'secret-token',
      status: 'Skickat för ifyllnad',
      pendingSignerare: [{ namn: 'Eva Andersson', epost: 'eva@exempel.se' }],
      customerUi: { completedParts: [1], currentPart: 2 }
    };
    const pub = KycInvite.publicKycPayload(dirty, {
      companyName: 'Safe AB',
      byraName: 'Rydén & Co'
    });
    const raw = JSON.stringify(pub);
    assert.equal(pub.answers.foretagsnamn, 'Safe AB');
    assert.equal(pub.recipientName, 'Eva Andersson');
    assert.equal(pub.signerEmail, 'eva@exempel.se');
    assert.equal(pub.resumePart, 2);
    assert.ok(!raw.includes('secret-token'));
    assert.ok(!raw.includes('residual'));
    assert.ok(!raw.includes('riskfaktor'));
    assert.ok(!/Länsstyrelsen/i.test(raw));
    assert.ok(!raw.includes('kundresa'));
    assert.ok(!/Villkorade/i.test(raw));
    assert.ok(!raw.includes('byraHelp'));
    assert.ok(!raw.includes('pendingSignerare'));
  });

  it('applyCustomerAnswers sparar snapshot och customerUi; markSignFailed', () => {
    const { kyc } = KycInvite.applyInviteSent(
      { foretagsnamn: 'Snap AB' },
      { customerId: 'recSnap', signerare: [{ namn: 'Bo', epost: 'bo@exempel.se' }] }
    );
    const answered = KycInvite.applyCustomerAnswers(
      kyc,
      { foretagsnamn: 'Snap AB', orgnr: '556677-8899', bekraftelse: true, pep: 'Nej' },
      { markAnswered: true, snapshot: true, customerUi: { completedParts: [1, 2], currentPart: 3 } }
    );
    assert.equal(answered.status, KycInvite.STATUS_ANSWERED);
    assert.ok(answered.customerAnswerSnapshot);
    assert.equal(answered.customerAnswerSnapshot.foretagsnamn, 'Snap AB');
    assert.deepEqual(answered.customerUi.completedParts, [1, 2, 3, 4, 5]);
    const failed = KycInvite.markSignFailed(answered, 'DOCSIGN_API_KEY saknas.');
    assert.equal(failed.status, KycInvite.STATUS_SIGN_FAILED);
    assert.match(failed.inleedSendError, /DOCSIGN/);
    assert.equal(KycInvite.inviteIsActive(failed, kyc.inviteToken), false);
    assert.equal(KycInvite.isAnsweredStatus(failed.status), true);
  });

  it('firstIncompletePart återupptar första ofullständiga delen', () => {
    assert.equal(KycInvite.firstIncompletePart({ completedParts: [] }), 1);
    assert.equal(KycInvite.firstIncompletePart({ completedParts: [1, 2] }), 3);
    assert.equal(KycInvite.firstIncompletePart({ completedParts: [1, 2, 3, 4, 5] }), 5);
  });
});
