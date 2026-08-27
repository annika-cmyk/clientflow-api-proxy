const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../public/js/kyc-status-ui.js');

describe('kyc-status-ui', () => {
  it('effectiveKycStatus tolkar utskickat trots status Sparat', () => {
    assert.equal(ui.effectiveKycStatus({ status: 'Sparat', utskickningsdatum: '2026-06-01' }), 'Skickat till kund');
    assert.equal(ui.effectiveKycStatus({ status: 'Sparat', inleedDokumentId: 'abc' }), 'Skickat till kund');
  });

  it('visar Inleed-ruta när utskickningsdatum finns men status är Sparat', () => {
    const kyc = { status: 'Sparat', utskickningsdatum: '2026-06-01' };
    assert.equal(ui.shouldShowKycInleedBox({ utanfor: false, status: 'Sparat', hasInleed: false, kyc }), true);
    assert.equal(ui.shouldShowKycUtanforOption({ utanfor: false, status: 'Sparat', hasInleed: false, kyc }), false);
  });

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

  it('plockar datum för KYC utanför ClientFlow', () => {
    assert.equal(ui.kycDateIso('2026-05-17'), '2026-05-17');
    assert.equal(ui.kycDateIso('2026-05-17T12:00:00.000Z'), '2026-05-17');
    assert.equal(ui.kycDateIso(''), '');
    assert.equal(ui.defaultKycUtanforDate('', true, '2026-08-21'), '2026-08-21');
    assert.equal(ui.defaultKycUtanforDate('2026-01-02', true, '2026-08-21'), '2026-01-02');
    assert.equal(ui.kycUtanforBannerText('2026-05-17'), 'KYC-formulär finns utanför ClientFlow. Utförd 2026-05-17.');
    assert.equal(ui.uppdragsavtalUtanforBannerText('2026-05-17'), 'Uppdragsavtalet finns utanför ClientFlow. Utförd 2026-05-17.');
    assert.equal(ui.uppdragsavtalUtanforBannerText(''), 'Uppdragsavtalet finns utanför ClientFlow.');
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
