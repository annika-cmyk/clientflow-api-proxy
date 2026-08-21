const { test } = require('node:test');
const assert = require('node:assert/strict');
const RiskSkala = require('../public/js/risk-skala');

test('migrerar bara poster utan Riskpoäng', () => {
    assert.equal(RiskSkala.ovrigNeedsMigration({ Riskbedömning: 'Hög' }), true);
    assert.equal(RiskSkala.ovrigNeedsMigration({
        Riskbedömning: 'Hög',
        Riskpoäng: JSON.stringify({ sannolikhet: 4, konsekvens: 4, sannolikhetEfter: 2, konsekvensEfter: 2 })
    }), false);
    assert.equal(RiskSkala.ovrigNeedsMigration({}), false);
});

test('behåller samma nivå på inneboende och residual och flaggar översyn', () => {
    const fields = RiskSkala.ovrigMigrationFields({ Riskbedömning: 'Hög' });
    const parsed = RiskSkala.parseRiskPoang(fields.Riskpoäng);
    assert.equal(parsed.sannolikhet, 4);
    assert.equal(parsed.konsekvens, 4);
    assert.equal(parsed.sannolikhetEfter, 4);
    assert.equal(parsed.konsekvensEfter, 4);
    assert.equal(RiskSkala.beraknaRiskniva(parsed.sannolikhet, parsed.konsekvens), 'Hög');
    assert.equal(RiskSkala.beraknaRiskniva(parsed.sannolikhetEfter, parsed.konsekvensEfter), 'Hög');
    assert.equal(RiskSkala.poangNeedsReview(fields.Riskpoäng), true);
    assert.equal(fields['PT/TF-relevans'], 'PT');
});
