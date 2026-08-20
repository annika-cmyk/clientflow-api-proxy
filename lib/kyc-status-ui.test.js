const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../public/js/kyc-status-ui.js');

describe('kyc-status-ui', () => {
  it('döljer Finns utanför ClientFlow när KYC är signerad i ClientFlow', () => {
    assert.equal(ui.shouldShowKycUtanforOption({
      utanfor: false,
      status: 'Signerat',
      hasInleed: true
    }), false);
  });

  it('visar Finns utanför ClientFlow när KYC inte är upprättad i ClientFlow', () => {
    assert.equal(ui.shouldShowKycUtanforOption({
      utanfor: false,
      status: 'Sparat',
      hasInleed: false
    }), true);
  });

  it('behåller kryssrutan om den redan är vald', () => {
    assert.equal(ui.shouldShowKycUtanforOption({
      utanfor: true,
      status: '',
      hasInleed: false
    }), true);
  });

  it('slår ihop statusbanner med Inleed-rutan och lägger datumet där', () => {
    const showInleed = ui.shouldShowKycInleedBox({
      utanfor: false,
      status: 'Signerat',
      hasInleed: true
    });
    assert.equal(showInleed, true);
    assert.equal(ui.shouldShowSeparateKycStatusBanner({ utanfor: false, showInleed }), false);
    assert.equal(ui.kycInleedBoxStatus({ status: 'Signerat', signedDate: '2026-06-05' }), 'Signerat 2026-06-05.');
  });
});
