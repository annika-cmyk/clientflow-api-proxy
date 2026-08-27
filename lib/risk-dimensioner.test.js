const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const RiskDimensioner = require('../public/js/risk-dimensioner');

describe('risk-dimensioner', () => {
  it('normaliserar Distrubutionskanaler till ny rubrik', () => {
    assert.equal(
      RiskDimensioner.normalizeTyp('Distrubutionskanaler'),
      'Distrubutionskanaler - såhär möter vi våra kunder'
    );
    assert.equal(
      RiskDimensioner.normalizeTyp('Distributionskanaler'),
      'Distrubutionskanaler - såhär möter vi våra kunder'
    );
    assert.equal(RiskDimensioner.dimensionOfTyp('Distrubutionskanaler').id, 'distribution');
  });

  it('normaliserar geografiska riskfaktorer till ny rubrik', () => {
    assert.equal(
      RiskDimensioner.normalizeTyp('Geografiska riskfaktorer'),
      'Geografisk riskfaktorer - här finns byråns kunder'
    );
    assert.equal(RiskDimensioner.dimensionOfTyp('Geografiska riskfaktorer').id, 'geografiska');
  });

  it('matchar exakt rubrik före alias även när rubriken innehåller ordet kunder', () => {
    assert.equal(
      RiskDimensioner.dimensionOfTyp('Distrubutionskanaler - såhär möter vi våra kunder').id,
      'distribution'
    );
    assert.equal(
      RiskDimensioner.dimensionOfTyp('Geografisk riskfaktorer - här finns byråns kunder').id,
      'geografiska'
    );
  });

  it('grupperar Via ombud med övriga distributionskanaler', () => {
    const groups = RiskDimensioner.groupOvrigaByTyp([
      { typ: 'Riskfaktorer kopplat till kund', namn: 'PEP' },
      { typ: 'Distrubutionskanaler - såhär möter vi våra kunder', namn: 'Distanskund' },
      { typ: 'Distrubutionskanaler', namn: 'Via ombud' },
      { typ: 'Geografiska riskfaktorer', namn: 'Europa' }
    ]);
    const dist = groups.find((g) => g.typ === 'Distrubutionskanaler - såhär möter vi våra kunder');
    assert.ok(dist);
    assert.deepEqual(dist.items.map((r) => r.namn).sort(), ['Distanskund', 'Via ombud']);
    const geo = groups.find((g) => g.typ === 'Geografisk riskfaktorer - här finns byråns kunder');
    assert.ok(geo);
    assert.equal(geo.items[0].namn, 'Europa');
    assert.equal(groups.filter((g) => /[Dd]istr/.test(g.typ)).length, 1);
  });

  it('kräver minst ett val per dimension som byrån har mallar för', () => {
    const templates = [
      { fields: { 'Typ av riskfaktor': 'Geografiska riskfaktorer', Riskfaktor: 'Europa' } },
      { fields: { 'Typ av riskfaktor': 'Distrubutionskanaler', Riskfaktor: 'Fysiskt möte' } },
      { fields: { 'Typ av riskfaktor': 'Riskfaktorer kopplat till kund', Riskfaktor: 'Privatkunder' } },
      { fields: { 'Typ av riskfaktor': 'Verksamhetsspecifika riskfaktorer', Riskfaktor: 'Inga verksamhetsspecifika riskfaktorer' } }
    ];
    const incomplete = RiskDimensioner.assessCustomerDimensions({
      fields: { 'risker kopplat till tjänster': ['recGeo'] },
      linkedRiskRecords: [
        { id: 'recGeo', fields: { 'Typ av riskfaktor': 'Geografiska riskfaktorer', Riskfaktor: 'Europa' } }
      ],
      byraTemplates: templates
    });
    assert.equal(incomplete.komplett, false);
    assert.ok(incomplete.saknade.includes('Hur samarbetar vi?'));
    assert.ok(incomplete.saknade.includes('Vem är kunden?'));
    assert.ok(incomplete.saknade.includes('Vad gör kunden?'));
    assert.ok(!incomplete.saknade.includes('Distrubutionskanaler - såhär möter vi våra kunder'));
    assert.ok(!incomplete.saknade.includes('Riskfaktorer kopplat till kund'));
    assert.match(incomplete.varning, /Riskbedömning ofullständig — saknar val på/);
    assert.match(incomplete.varning, /Hur samarbetar vi\?/);
    assert.match(incomplete.varning, /Vem är kunden\?/);
    assert.match(incomplete.varning, /Vad gör kunden\?/);
    assert.equal(incomplete.saknade.filter((n) => n === 'Vad gör kunden?').length, 1);

    const complete = RiskDimensioner.assessCustomerDimensions({
      fields: { 'Kunden verkar i en högriskbransch': ['Bygg'] },
      linkedRiskRecords: [
        { fields: { 'Typ av riskfaktor': 'Geografiska riskfaktorer', Riskfaktor: 'Europa' } },
        { fields: { 'Typ av riskfaktor': 'Distrubutionskanaler', Riskfaktor: 'Fysiskt möte' } },
        { fields: { 'Typ av riskfaktor': 'Verksamhetsspecifika riskfaktorer', Riskfaktor: 'Inga verksamhetsspecifika riskfaktorer' } }
      ],
      byraTemplates: templates
    });
    assert.equal(complete.komplett, true);
    assert.equal(complete.varning, '');
  });

  it('hoppar över dimensioner som byrån saknar mallar för', () => {
    const status = RiskDimensioner.assessCustomerDimensions({
      fields: {},
      linkedRiskRecords: [
        { fields: { 'Typ av riskfaktor': 'Geografiska riskfaktorer', Riskfaktor: 'Europa' } }
      ],
      byraTemplates: [
        { fields: { 'Typ av riskfaktor': 'Geografiska riskfaktorer', Riskfaktor: 'Europa' } }
      ]
    });
    assert.equal(status.komplett, true);
    assert.deepEqual(status.required, ['geografiska']);
  });

  it('räknar Inga riskfaktorer som val på de nya A/B/C-korten', () => {
    const templates = [
      { fields: { 'Typ av riskfaktor': 'Geografiska riskfaktorer', Riskfaktor: 'Europa' } },
      { fields: { 'Typ av riskfaktor': 'Distrubutionskanaler', Riskfaktor: 'Fysiskt möte' } },
      { fields: { 'Typ av riskfaktor': 'Riskfaktorer kopplat till kund', Riskfaktor: 'Privatkunder' } },
      { fields: { 'Typ av riskfaktor': 'Verksamhetsspecifika riskfaktorer', Riskfaktor: 'Kontantintensiv verksamhet' } }
    ];
    const viaInga = RiskDimensioner.assessCustomerDimensions({
      fields: {
        'Riskhöjande faktorer övrigt': [
          'Inga riskfaktorer · kunden',
          'Inga riskfaktorer · verksamheten'
        ]
      },
      linkedRiskRecords: [
        { fields: { 'Typ av riskfaktor': 'Distrubutionskanaler', Riskfaktor: 'Fysiskt möte' } }
      ],
      byraTemplates: templates
    });
    assert.equal(viaInga.komplett, true);
    assert.equal(viaInga.varning, '');

    const mapped = RiskDimensioner.ofullstandigVarning([
      'Distrubutionskanaler - såhär möter vi våra kunder',
      'Riskfaktorer kopplat till kund',
      'Geografiska riskfaktorer',
      'Verksamhetsspecifika riskfaktorer'
    ]);
    assert.equal(mapped, 'Riskbedömning ofullständig — saknar val på Hur samarbetar vi?, Vem är kunden? och Vad gör kunden?');
  });
});
