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

  it('returnerar visningsdelar för inneboende och residual', () => {
    const parts = RiskMotivering.motiveringDisplayParts({
      motivering_inneboende_risk: 'Sannolikheten är hög eftersom kunder kan lämna felaktiga underlag.',
      motivering_residual_risk: 'Residualrisken sänks genom stickprov och avstämning.'
    });
    assert.equal(parts.length, 2);
    assert.equal(parts[0].key, 'inneboende');
    assert.match(parts[0].title, /inneboende risk/i);
    assert.equal(parts[1].key, 'residual');
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
    assert.match(text, /\*\*Motivering av inneboende risk:\*\*/);
    assert.match(text, /\*\*Motivering av residualrisk:\*\*/);
    assert.match(text, /frekvent kontantflöde/);
  });
});

describe('RiskMotivering S/K-split och legacy', () => {
  it('migrerar kombinerad motivering till legacy utan att skriva över', () => {
    const migrated = RiskMotivering.applyLegacyMigration({
      motivering_inneboende_risk: 'En längre text om sannolikhet och konsekvens i uppdraget.'
    });
    assert.equal(
      migrated.legacy_motivering_inneboende,
      'En längre text om sannolikhet och konsekvens i uppdraget.'
    );
    const again = RiskMotivering.applyLegacyMigration({
      ...migrated,
      motivering_inneboende_risk: 'Ny kombinerad text som inte ska ersätta legacy.'
    });
    assert.equal(again.legacy_motivering_inneboende, migrated.legacy_motivering_inneboende);
  });

  it('föreslår S/K-uppdelning från legacy-meningar', () => {
    const parts = RiskMotivering.proposeSplitFromLegacy(
      'Sannolikheten är hög vid felaktiga underlag. Konsekvensen blir allvarlig vid stora belopp.'
    );
    assert.match(parts.sannolikhet, /Sannolikheten/);
    assert.match(parts.konsekvens, /Konsekvensen/);
  });

  it('godkänner separata S/K-fält och synkar kombinerad text', () => {
    const poang = RiskMotivering.syncCombinedFromSplit({
      sannolikhet: 4,
      konsekvens: 4,
      motivering_sannolikhet_inneboende: 'Sannolikhet 4 eftersom underlag ofta är ofullständiga i praktiken.',
      motivering_konsekvens_inneboende: 'Konsekvens 4 eftersom fel belopp kan dölja penningtvätt i större uppdrag.'
    });
    assert.match(poang.motivering_inneboende_risk, /Sannolikhet 4/);
    assert.match(poang.motivering_inneboende_risk, /Konsekvens 4/);
    const check = RiskMotivering.validatePoangMotivering(poang);
    assert.equal(check.ok, true);
    assert.equal(check.status.inneboendeUsesSplit, true);
  });

  it('kräver båda S/K när uppdelning påbörjats', () => {
    const check = RiskMotivering.validatePoangMotivering({
      sannolikhet: 4,
      konsekvens: 4,
      motivering_sannolikhet_inneboende: 'Bara sannolikheten är motiverad med tillräcklig längd här.'
    });
    assert.equal(check.ok, false);
    assert.equal(check.errors[0].code, 'motivering_s_k_inneboende_kravs');
  });
});
