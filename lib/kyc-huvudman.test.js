const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const HM = require('../public/js/kyc-huvudman');
const Kat = require('../public/js/ovriga-risk-kategorier');

describe('kyc-huvudman', () => {
  it('läser gammal fritext och ny radlista', () => {
    const parsed = HM.parseHuvudmanInfo('Anna Andersson (19800101-1234)\nBosse Boll');
    assert.equal(parsed[0].namn, 'Anna Andersson');
    assert.equal(parsed[0].personnr, '19800101-1234');
    assert.equal(parsed[1].namn, 'Bosse Boll');
    const fromSaved = HM.listFromSaved({
      huvudman: [{ namn: 'Carla', personnr: '19700101-0000', skatterattslig_hemvist: 'Norge' }]
    }, []);
    assert.equal(fromSaved[0].hemvist, 'Norge');
    assert.equal(HM.formatHuvudmanInfo(fromSaved), 'Carla (19700101-0000)');
  });

  it('markerar utländsk hemvist och styr riskflaggan', () => {
    assert.equal(HM.isForeignHemvist('Sverige'), false);
    assert.equal(HM.isForeignHemvist('Norge'), true);
    assert.equal(HM.hasForeignHemvist([{ hemvist: 'Sverige' }, { skatterattslig_hemvist: 'Danmark' }]), true);
    const added = HM.mergeUtlandskaUboFlag(['PEP eller RCA'], true);
    assert.ok(added.includes('Utländska verkliga huvudmän (UBO)'));
    assert.ok(added.includes('PEP eller RCA'));
    const removed = HM.mergeUtlandskaUboFlag(added, false);
    assert.ok(!removed.includes('Utländska verkliga huvudmän (UBO)'));
    assert.ok(removed.includes('PEP eller RCA'));
  });

  it('behåller utländska huvudmän när kort B sparas', () => {
    const merged = Kat.mergeValForCategory(
      ['Utländska verkliga huvudmän (UBO)', 'Historik av brott / ekonomisk brottslighet'],
      'kunden',
      ['Komplicerad eller ovanlig ägarstruktur']
    );
    assert.ok(merged.includes('Utländska verkliga huvudmän (UBO)'));
    assert.ok(merged.includes('Komplicerad eller ovanlig ägarstruktur'));
    assert.ok(!merged.includes('Historik av brott / ekonomisk brottslighet'));
  });

  it('har KYC-rader och koppling till riskbedömningen', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/js/kundkort.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '../public/kundkort.html'), 'utf8');
    assert.match(js, /_kycHuvudmanRowHtml/);
    assert.match(js, /id="kyc-huvudman-list"/);
    assert.match(js, /_persistUtlandskaUboFromKyc/);
    assert.match(js, /_applyUtlandskaUboFromKyc/);
    assert.match(js, /kyc-vh-hemvist/);
    assert.match(html, /kyc-huvudman\.js/);
    assert.doesNotMatch(js, /id="kyc-huvudman-info" class="uppdrag-input uppdrag-textarea"/);
  });
});
