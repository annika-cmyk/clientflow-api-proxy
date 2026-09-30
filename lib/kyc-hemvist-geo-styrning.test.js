'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

require('../public/js/eu-hogrisk-lander');
require('../public/js/kyc-huvudman');
const Geo = require('./kyc-hemvist-geo-styrning');

const geoRecs = [
  {
    id: 'recUtsatt',
    fields: {
      Riskfaktor: 'Kunden finns i särskilt utsatt område i Sverige',
      'Typ av riskfaktor': 'Geografisk riskfaktorer - här finns byråns kunder'
    }
  },
  {
    id: 'recSe',
    fields: {
      Riskfaktor: 'Kunden har skatterättslig hemvist i Sverige (ej utsatt område)',
      'Typ av riskfaktor': 'Geografisk riskfaktorer - här finns byråns kunder'
    }
  },
  {
    id: 'recEu',
    fields: {
      Riskfaktor: 'Kunden har geografisk hemvist utanför Sverige men inom EU',
      'Typ av riskfaktor': 'Geografisk riskfaktorer - här finns byråns kunder'
    }
  },
  {
    id: 'recOut',
    fields: {
      Riskfaktor: 'Kunden har geografisk hemvist utanför EU',
      'Typ av riskfaktor': 'Geografisk riskfaktorer - här finns byråns kunder'
    }
  },
  {
    id: 'recMotpart',
    fields: {
      Riskfaktor: 'Europa',
      'Typ av riskfaktor': 'Geografisk riskfaktorer - här finns kundens kunder & leverantörer'
    }
  }
];

describe('kyc-hemvist-geo-styrning', () => {
  it('matchar hemvist-faktorer utan att förväxla med utsatt eller motpart', () => {
    assert.equal(Geo.matchFactor('Kunden har skatterättslig hemvist i Sverige (ej utsatt område)').id, 'hemvist_se');
    assert.equal(Geo.matchFactor('Kunden har geografisk hemvist utanför Sverige men inom EU').id, 'hemvist_eu');
    assert.equal(Geo.matchFactor('Kunden har geografisk hemvist utanför EU').id, 'hemvist_utanfor_eu');
    assert.equal(Geo.matchFactor('Kunden finns i särskilt utsatt område i Sverige'), null);
    assert.equal(Geo.matchFactor('Europa'), null);
  });

  it('klassificerar hemvist-etiketter', () => {
    assert.equal(Geo.classifyHemvistLabel('Sverige'), 'se');
    assert.equal(Geo.classifyHemvistLabel('Tyskland'), 'eu');
    assert.equal(Geo.classifyHemvistLabel('Norge'), 'eu');
    assert.equal(Geo.classifyHemvistLabel('USA'), 'utanfor_eu');
  });

  it('föreslår Sverige (ej utsatt) från företagshemvist', () => {
    const kyc = { skatterattslig_hemvist_foretag: 'Sverige' };
    const ids = Geo.suggestedFactorIds(kyc, { trff: false, kontrolleradAt: 'x' });
    assert.deepEqual(ids, ['hemvist_se']);
  });

  it('tar bort Sverige (ej utsatt) när adress träffar utsatt område', () => {
    const kyc = { skatterattslig_hemvist_foretag: 'Sverige' };
    const ids = Geo.suggestedFactorIds(kyc, { trff: true, niva: 'Särskilt utsatt område', kontrolleradAt: 'x' });
    assert.deepEqual(ids, []);
  });

  it('föreslår EU från huvudmans hemvist', () => {
    const kyc = {
      skatterattslig_hemvist_foretag: 'Sverige',
      huvudman: [{ namn: 'Anna', skatterattslig_hemvist: 'Tyskland' }]
    };
    const ids = Geo.suggestedFactorIds(kyc, { trff: false, kontrolleradAt: 'x' });
    assert.ok(ids.includes('hemvist_se'));
    assert.ok(ids.includes('hemvist_eu'));
  });

  it('föreslår utanför EU', () => {
    const kyc = {
      foretradare: [{ namn: 'Bo', skatterattslig_hemvist: 'USA' }]
    };
    const ids = Geo.suggestedFactorIds(kyc, null);
    assert.ok(ids.includes('hemvist_utanfor_eu'));
  });

  it('mergeLinkedIds styr residual-länkar', () => {
    const kyc = { skatterattslig_hemvist_foretag: 'Sverige' };
    const next = Geo.mergeLinkedIds(['recEu', 'recMotpart'], geoRecs, kyc, { trff: false });
    assert.ok(next.includes('recSe'));
    assert.ok(next.includes('recMotpart'));
    assert.ok(!next.includes('recEu'));
  });

  it('addressImpliesSweden från kontroll eller postnummer', () => {
    assert.equal(Geo.addressImpliesSweden({ kontrolleradAt: 'x', trff: false }), true);
    assert.equal(Geo.addressImpliesSweden(null, 'Storgatan 1, 111 22 Stockholm'), true);
    assert.equal(Geo.addressImpliesSweden(null, 'Berlin'), false);
  });
});
