const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Geo = require('./geo-risk-typer');

describe('geo-risk-typer', () => {
  it('klassificerar hemvist och utsatt område som byråns kunder', () => {
    assert.equal(
      Geo.classifyNamn('Kunden har geografisk hemvist utanför Sverige men inom EU'),
      Geo.DIM_BYRA
    );
    assert.equal(
      Geo.classifyNamn('Kunden har verksamhet i särskilt utsatt område i Sverige'),
      Geo.DIM_BYRA
    );
    assert.equal(
      Geo.classifyNamn('Kunden finns i särskilt utsatt område i Sverige'),
      Geo.DIM_BYRA
    );
    assert.equal(
      Geo.targetTypForRecord({ Riskfaktor: 'Kunden har geografisk hemvist utanför Sverige men inom EU' }),
      Geo.TYP_BYRA
    );
  });

  it('klassificerar KYC-handelsfaktorer som kundens kunder & leverantörer', () => {
    assert.equal(Geo.classifyNamn('Närområde'), Geo.DIM_MOTPART);
    assert.equal(Geo.classifyNamn('Europa'), Geo.DIM_MOTPART);
    assert.equal(Geo.classifyNamn('Utanför EU'), Geo.DIM_MOTPART);
    assert.equal(Geo.classifyNamn('Land med hög korruption/svag kontroll'), Geo.DIM_MOTPART);
    assert.equal(
      Geo.classifyNamn('Kundens kunder & leverantörer finns inom EU'),
      Geo.DIM_MOTPART
    );
    assert.equal(
      Geo.classifyNamn('Kundens har kunder/leverantörer i utsatta områden'),
      Geo.DIM_MOTPART
    );
    assert.equal(
      Geo.targetTypForRecord({ Riskfaktor: 'Europa' }),
      Geo.TYP_MOTPART
    );
  });

  it('effectiveTyp skiljer byrå och motpart även när DB fortfarande har byrå-typ', () => {
    assert.equal(
      Geo.effectiveTyp({
        'Typ av riskfaktor': Geo.TYP_BYRA,
        Riskfaktor: 'Närområde'
      }),
      Geo.TYP_MOTPART
    );
    assert.equal(
      Geo.effectiveTyp({
        'Typ av riskfaktor': Geo.TYP_BYRA,
        Riskfaktor: 'Kunden har geografisk hemvist utanför Sverige men inom EU'
      }),
      Geo.TYP_BYRA
    );
    assert.equal(
      Geo.effectiveTyp({
        'Typ av riskfaktor': Geo.TYP_BYRA,
        Riskfaktor: 'Kundens har kunder/leverantörer i utsatta områden'
      }),
      Geo.TYP_MOTPART
    );
  });

  it('flaggar migration när typ och namn inte hör ihop', () => {
    assert.equal(
      Geo.needsTypMigration({
        'Typ av riskfaktor': Geo.TYP_BYRA,
        Riskfaktor: 'Europa'
      }),
      true
    );
    assert.equal(
      Geo.needsTypMigration({
        'Typ av riskfaktor': Geo.TYP_BYRA,
        Riskfaktor: 'Kunden har geografisk hemvist utanför Sverige men inom EU'
      }),
      false
    );
    assert.equal(
      Geo.needsTypMigration({
        'Typ av riskfaktor': Geo.TYP_LEGACY,
        Riskfaktor: 'Närområde'
      }),
      true
    );
  });
});
