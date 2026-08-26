const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
require('../public/js/risk-skala');
const RiskMotivering = require('../public/js/risk-motivering');
const RiskSkala = require('../public/js/risk-skala');
const { compileIdentifieradeRisker } = require('./identifierade-risker');

describe('RiskMotivering', () => {
  it('kräver minst 50 tecken vid Förhöjd inneboende risk', () => {
    const poang = { sannolikhet: 3, konsekvens: 4, motivering_inneboende_risk: 'Kort.' };
    const check = RiskMotivering.validatePoangMotivering(poang);
    assert.equal(check.ok, false);
    assert.equal(check.errors[0].code, 'motivering_inneboende_kravs');
  });

  it('tillåter Låg/Normal utan motivering', () => {
    const poang = { sannolikhet: 2, konsekvens: 2 };
    const check = RiskMotivering.validatePoangMotivering(poang);
    assert.equal(check.ok, true);
  });

  it('kräver riskaptithänvisning vid Hög residual', () => {
    const poang = {
      sannolikhet: 3,
      konsekvens: 3,
      sannolikhetEfter: 4,
      konsekvensEfter: 4,
      motivering_inneboende_risk: 'a'.repeat(50),
      motivering_residual_risk: 'a'.repeat(50)
    };
    const check = RiskMotivering.validatePoangMotivering(poang);
    assert.equal(check.ok, false);
    assert.equal(check.errors[0].code, 'riskaptit_beslut_kravs');
  });

  it('accepterar residual Hög med beslutshänvisning', () => {
    const poang = {
      sannolikhet: 3,
      konsekvens: 3,
      sannolikhetEfter: 4,
      konsekvensEfter: 4,
      motivering_inneboende_risk: 'a'.repeat(50),
      motivering_residual_risk: 'Residual förblir hög trots åtgärder enligt riskaptitbeslut 2025-03-01.'
    };
    const check = RiskMotivering.validatePoangMotivering(poang);
    assert.equal(check.ok, true);
  });

  it('beräknar S×K korrekt via RiskSkala', () => {
    const level = RiskSkala.beraknaRiskniva(4, 4);
    assert.equal(level, 'Hög');
    const serialized = RiskSkala.serializeRiskPoang({
      sannolikhet: 4,
      konsekvens: 4,
      motivering_inneboende_risk: 'x'.repeat(50)
    });
    const parsed = RiskSkala.parseRiskPoang(serialized);
    assert.equal(parsed.sannolikhet, 4);
    assert.equal(parsed.konsekvens, 4);
    assert.equal(parsed.motivering_inneboende_risk.length, 50);
  });

  it('sätter migreringsflagga när motivering saknas', () => {
    assert.equal(RiskMotivering.migrationFlagForPoang({ sannolikhet: 4, konsekvens: 4 }), true);
    assert.equal(RiskMotivering.migrationFlagForPoang({
      sannolikhet: 4,
      konsekvens: 4,
      motivering_inneboende_risk: 'a'.repeat(50)
    }), false);
  });
});

describe('compileIdentifieradeRisker med motivering', () => {
  it('skriver ut S/K separat och motiveringstexter', () => {
    const text = compileIdentifieradeRisker({
      tjanster: [{
        namn: 'Löpande bokföring',
        sannolikhet: 4,
        konsekvens: 4,
        motivering_inneboende_risk: 'Sannolikhet 4 p.g.a. frekvent kontantflöde. Konsekvens 4 p.g.a. stora belopp.',
        sannolikhetEfter: 2,
        konsekvensEfter: 3,
        motivering_residual_risk: 'Åtgärderna sänker sannolikhet till 2 enligt riskaptitbeslut.',
        atgard: 'Dubbel granskning.'
      }],
      ovriga: []
    });
    assert.match(text, /\*\*Sannolikhet:\*\* 4/);
    assert.match(text, /\*\*Konsekvens:\*\* 4/);
    assert.match(text, /\*\*S×K:\*\* 16/);
    assert.match(text, /\*\*Motivering av risknivå:\*\*/);
    assert.match(text, /\*\*Motivering av residualrisk:\*\*/);
    assert.match(text, /frekvent kontantflöde/);
  });
});
