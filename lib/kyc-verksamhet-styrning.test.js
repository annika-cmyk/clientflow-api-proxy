const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  matchFactor,
  mergeLinkedIds,
  linkedIdsChanged,
  buildSaknadeRiskfaktorer,
  suggestedRecordIds,
  kycHasHogriskHandel
} = require('./kyc-verksamhet-styrning');

const verksamhetRecs = [
  { id: 'recKont01', fields: { Riskfaktor: 'Kunder med mycket kontanta transaktioner', 'Typ av riskfaktor': 'Riskfaktorer kopplat till kund' } },
  { id: 'recKrypto01', fields: { Riskfaktor: 'Kunder som handlar med kryptovaluta', 'Typ av riskfaktor': 'Riskfaktorer kopplat till kund' } },
  { id: 'recHogrisk01', fields: { Riskfaktor: 'Kunden har handel med högriskländer', 'Typ av riskfaktor': 'Riskfaktorer kopplat till kund' } },
  { id: 'recAnnat01', fields: { Riskfaktor: 'Högriskbransch', 'Typ av riskfaktor': 'Verksamhetsspecifika riskfaktorer' } }
];

describe('kyc-verksamhet-styrning', () => {
  it('matchar riskfaktor på namn och alias', () => {
    assert.equal(matchFactor('Kunder med mycket kontanta transaktioner').id, 'kontanter');
    assert.equal(matchFactor('Kontantintensiv verksamhet').id, 'kontanter');
    assert.equal(matchFactor('Kunder som handlar med kryptovaluta').id, 'kryptovaluta');
    assert.equal(matchFactor('Kunden har handel med högriskländer').id, 'hogrisklander');
    assert.equal(matchFactor('Kopplingar till utlandet / Högriskländer').id, 'hogrisklander');
    assert.equal(matchFactor('Högriskbransch'), null);
  });

  it('lägger till steered id när KYC är Ja', () => {
    const kyc = { kontanter: 'Ja', kryptovaluta: 'Nej' };
    const next = mergeLinkedIds(['recAnnat01'], verksamhetRecs, kyc);
    assert.deepEqual(next.sort(), ['recAnnat01', 'recKont01'].sort());
  });

  it('tar bort steered id när KYC blir Nej', () => {
    const kyc = { kontanter: 'Nej', kryptovaluta: 'Nej' };
    const next = mergeLinkedIds(['recKont01', 'recAnnat01'], verksamhetRecs, kyc);
    assert.deepEqual(next, ['recAnnat01']);
  });

  it('suggestedRecordIds returnerar båda vid Ja', () => {
    const kyc = { kontanter: 'Ja', kryptovaluta: 'Ja' };
    const ids = suggestedRecordIds(verksamhetRecs, kyc);
    assert.deepEqual(ids.sort(), ['recKont01', 'recKrypto01'].sort());
  });

  it('styr högriskländer när KYC har högriskland', () => {
    const kyc = {
      internationellHandel: 'Ja',
      internationellaLander: 'Iran'
    };
    assert.equal(kycHasHogriskHandel(kyc), true);
    const ids = suggestedRecordIds(verksamhetRecs, kyc);
    assert.deepEqual(ids, ['recHogrisk01']);
  });

  it('styr inte högriskländer vid endast lågrisk EU-handel', () => {
    const kyc = {
      internationellHandel: 'Ja',
      internationellaLander: 'Tyskland'
    };
    assert.equal(kycHasHogriskHandel(kyc), false);
    const ids = suggestedRecordIds(verksamhetRecs, kyc);
    assert.deepEqual(ids, []);
  });

  it('linkedIdsChanged upptäcker skillnad', () => {
    assert.equal(linkedIdsChanged(['a'], ['a']), false);
    assert.equal(linkedIdsChanged(['a'], ['a', 'b']), true);
  });

  it('buildSaknadeRiskfaktorer flaggar saknad mall', () => {
    const kunder = [
      { fields: { 'KYC-formular (JSON)': JSON.stringify({ kryptovaluta: 'Ja' }) } }
    ];
    const templates = [verksamhetRecs[0]];
    const saknade = buildSaknadeRiskfaktorer(kunder, templates);
    assert.equal(saknade.length, 1);
    assert.equal(saknade[0].id, 'kryptovaluta');
    assert.equal(saknade[0].antalKunder, 1);
  });
});
