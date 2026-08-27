const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Eu = require('../public/js/eu-hogrisk-lander');

describe('eu-hogrisk-lander', () => {
  it('klassar EU/EES, tredjeland och EU-högrisk från jan 2026', () => {
    assert.equal(Eu.findCountry('Norge').group, 'EU_EES');
    assert.equal(Eu.findCountry('Tyskland').group, 'EU_EES');
    assert.equal(Eu.findCountry('USA').group, 'TREDJELAND');
    assert.equal(Eu.findCountry('Storbritannien').group, 'TREDJELAND');
    assert.equal(Eu.findCountry('Sydafrika').group, 'TREDJELAND');
    assert.equal(Eu.findCountry('Nigeria').group, 'TREDJELAND');
    assert.equal(Eu.findCountry('Iran').group, 'CALL_FOR_ACTION');
    assert.equal(Eu.findCountry('Nordkorea').group, 'CALL_FOR_ACTION');
    assert.equal(Eu.findCountry('Ryssland').group, 'SPECIAL');
    assert.equal(Eu.findCountry('Bolivia').group, 'EU_HOGRISK');
    assert.equal(Eu.findCountry('BVI').group, 'EU_HOGRISK');
    assert.equal(Eu.findCountry('Monaco').group, 'EU_HOGRISK');
    assert.ok(Eu.classifyOne('Iran').hogrisk);
    assert.equal(Eu.classifyOne('Danmark').niva, 'Låg');
    assert.equal(Eu.classifyOne('Kina').niva, 'Normal');
    assert.equal(Eu.classifyOne('Iran').niva, 'Hög-aktiv');
  });

  it('tolkar fritext och alias och hoppar över Sverige', () => {
    const labels = Eu.parseLabels('Norge, germany, Sweden, Iran');
    assert.deepEqual(labels, ['Norge', 'Tyskland', 'Iran']);
    const assessed = Eu.assess('norge; ivory coast');
    assert.equal(assessed.joined, 'Norge, Elfenbenskusten');
    assert.equal(assessed.hasHogrisk, true);
    assert.equal(assessed.hasOutsideEu, true);
    assert.match(Eu.formatWithBadges('Norge, Iran'), /Norge \(EU\/EES\).*Iran \(FATF-svartlista\)/);
    assert.match(Eu.warningText(assessed), /skärpta åtgärder/);
    assert.equal(Eu.warningText(Eu.assess('Storbritannien')), '');
    assert.equal(Eu.warningText(Eu.assess('Norge')), '');
    assert.match(Eu.SOURCE, /2016\/1675/);
  });

  it('söker på namn och alias', () => {
    const hits = Eu.search('nor');
    assert.ok(hits.some((c) => c.name === 'Norge'));
    assert.ok(Eu.search('uk').some((c) => c.iso2 === 'GB'));
    assert.ok(Eu.search('ryska').some((c) => c.iso2 === 'RU'));
    assert.equal(Eu.search('sverige').length, 0);
  });

  it('styr geografiska faktorer från valda länder', () => {
    assert.deepEqual(Eu.suggestedGeoFactorIds('Norge'), ['naromrade']);
    assert.deepEqual(Eu.suggestedGeoFactorIds('Tyskland'), ['europa']);
    assert.deepEqual(Eu.suggestedGeoFactorIds('Norge, Tyskland'), ['naromrade', 'europa']);
    assert.deepEqual(Eu.suggestedGeoFactorIds('USA'), ['utanfor_eu']);
    assert.deepEqual(Eu.suggestedGeoFactorIds('Iran'), ['utanfor_eu', 'hog_korruption']);
    assert.deepEqual(Eu.suggestedGeoFactorIds('', { onlySweden: true }), ['naromrade']);
    assert.deepEqual(Eu.suggestedGeoFactorIds('Tyskland', { onlySweden: true }), ['europa']);
    assert.deepEqual(Eu.geoSteeringLabels('Tyskland', { onlySweden: true }), ['Europa']);
    assert.equal(Eu.matchGeoFactor('Land med hög korruption/svag kontroll').id, 'hog_korruption');
    assert.equal(Eu.matchGeoFactor('Utanför EU').id, 'utanfor_eu');
    const recs = [
      { id: 'geo-nara', fields: { Riskfaktor: 'Närområde' } },
      { id: 'geo-eu', fields: { Riskfaktor: 'Europa' } },
      { id: 'geo-out', fields: { Riskfaktor: 'Utanför EU' } },
      { id: 'geo-hog', fields: { Riskfaktor: 'Land med hög korruption/svag kontroll' } }
    ];
    assert.deepEqual(Eu.suggestedRecordIds(recs, 'Iran'), ['geo-out', 'geo-hog']);
    assert.deepEqual(Eu.steeredRecordIds(recs), ['geo-nara', 'geo-eu', 'geo-out', 'geo-hog']);
  });

  it('använder landsväljaren i KYC-formuläret och styr geografiska residualen', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/js/kundkort.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '../public/kundkort.html'), 'utf8');
    assert.match(html, /eu-hogrisk-lander\.js/);
    assert.match(js, /_initKycLanderPicker/);
    assert.match(js, /kyc-internationella-lander-sok/);
    assert.match(js, /_renderKycLanderOnGeo/);
    assert.match(js, /_ensureSavedKycFormular/);
    assert.match(js, /Hämtas från KYC-formuläret, avsnitt 6/);
    assert.match(js, /kyc-lander-geo-help/);
    assert.doesNotMatch(js, /Kontrollera geografisk residual mot tredjeland/);
    assert.doesNotMatch(js, /Valda länder styr geografisk residual: Närområde, Europa/);
    assert.match(js, /kyc-lander-chips--readonly/);
    assert.match(js, /_persistGeoFromLander/);
    assert.match(js, /_applyGeoChecksFromLander/);
    assert.match(js, /kyc-lander-chip-x/);
    assert.match(js, /data-land=/);
    assert.doesNotMatch(js, /formVal \|\| savedVal/);
    assert.doesNotMatch(js, /if \(!landerOpts\.onlySweden && !labels\.length\) return;/);
    assert.match(js, /EuHogriskLander/);
    assert.doesNotMatch(js, /id="geo-internationella-lander-picker"/);
    assert.doesNotMatch(js, /placeholder="t\.ex\. Norge, Tyskland"/);
  });
});
