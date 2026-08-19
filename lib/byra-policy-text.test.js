const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { looksLikeRiskMetodText, correctKycAtgarder, DEFAULT_KYC_ATGARDER } = require('./byra-policy-text');

const METOD = `Riskbedömningen har genomförts genom att systematiskt identifiera hot och sårbarheter kopplade till Byråns tjänster, kundtyper, geografiska områden och distributionskanaler.

Vi har använt information från relevanta informationskällor, inklusive länsstyrelsernas föreskrifter och vägledningar som ”Ett riskbaserat förhållningssätt”. Utgångspunkten är att risk för penningtvätt och finansiering av terrorism finns i Sverige.`;

describe('correctKycAtgarder', () => {
  it('ersätter metodmall under kundkännedom', () => {
    assert.equal(looksLikeRiskMetodText(METOD), true);
    const out = correctKycAtgarder(METOD);
    assert.equal(out, DEFAULT_KYC_ATGARDER);
    assert.match(out, /verklig huvudman/);
    assert.doesNotMatch(out, /Riskbedömningen har genomförts/);
  });

  it('applyKycAtgarderCorrection skriver rätt fältnamn med avslutande mellanslag', () => {
    const { applyKycAtgarderCorrection } = require('./byra-policy-text');
    const fixed = applyKycAtgarderCorrection({ '3. Kundkännedomsåtgärder ': METOD });
    assert.equal(fixed.changed, true);
    assert.equal(fixed.fields['3. Kundkännedomsåtgärder '], DEFAULT_KYC_ATGARDER);
  });

  it('rör inte en riktig KYC-rutin', () => {
    const kyc = 'Vi identifierar kunden, kontrollerar verklig huvudman och PEP-listor innan uppdraget startar.';
    assert.equal(looksLikeRiskMetodText(kyc), false);
    assert.equal(correctKycAtgarder(kyc), kyc);
  });
});
