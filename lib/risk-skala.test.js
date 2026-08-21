/**
 * Kör: node --test lib/risk-skala.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const RiskSkala = require('../public/js/risk-skala');

describe('femgradig riskskala', () => {
  it('mappar gamla namn till nya', () => {
    assert.equal(RiskSkala.normalizeRiskKey('Låg'), 'low');
    assert.equal(RiskSkala.normalizeRiskKey('Lag'), 'low');
    assert.equal(RiskSkala.normalizeRiskKey('Medel'), 'normal');
    assert.equal(RiskSkala.normalizeRiskKey('Normal'), 'normal');
    assert.equal(RiskSkala.normalizeRiskKey('medium'), 'normal');
    assert.equal(RiskSkala.normalizeRiskKey('Förhöjd'), 'elevated');
    assert.equal(RiskSkala.normalizeRiskKey('Hög'), 'high');
    assert.equal(RiskSkala.normalizeRiskKey('Hog'), 'high');
    assert.equal(RiskSkala.normalizeRiskKey('Oacceptabel'), 'unacceptable');
  });

  it('visar kanoniska svenska etiketter', () => {
    assert.equal(RiskSkala.riskLabelSv('Lag'), 'Låg');
    assert.equal(RiskSkala.riskLabelSv('Medel'), 'Normal');
    assert.equal(RiskSkala.riskLabelSv('medium'), 'Normal');
    assert.equal(RiskSkala.riskLabelSv('Förhöjd'), 'Förhöjd');
    assert.equal(RiskSkala.riskLabelSv('Hog'), 'Hög');
    assert.equal(RiskSkala.riskLabelSv('Oacceptabel'), 'Oacceptabel');
  });

  it('rankar nivåerna i rätt ordning', () => {
    assert.ok(RiskSkala.riskRank('Låg') < RiskSkala.riskRank('Medel'));
    assert.ok(RiskSkala.riskRank('Normal') < RiskSkala.riskRank('Förhöjd'));
    assert.ok(RiskSkala.riskRank('Förhöjd') < RiskSkala.riskRank('Hög'));
    assert.ok(RiskSkala.riskRank('Hög') < RiskSkala.riskRank('Oacceptabel'));
    assert.equal(RiskSkala.sameLevel('Medel', 'Normal'), true);
    assert.equal(RiskSkala.sameLevel('Lag', 'Låg'), true);
    assert.equal(RiskSkala.isHighOrAbove('Hög'), true);
    assert.equal(RiskSkala.isHighOrAbove('Förhöjd'), false);
    assert.equal(RiskSkala.isElevatedOrAbove('Förhöjd'), true);
  });

  it('läser och skriver prefix i byråns sammantagna värdering', () => {
    const text = RiskSkala.withRiskLevelPrefix('Byrån har blandad kundstock.', 'Medel');
    assert.match(text, /^Sammantagen risknivå: Normal/);
    assert.equal(RiskSkala.normalizeRiskKey(text), 'normal');
    assert.equal(RiskSkala.stripRiskLevelPrefix(text), 'Byrån har blandad kundstock.');
  });

  it('räknar statistik per kanonisk nivå', () => {
    const counts = RiskSkala.emptyCounts();
    RiskSkala.countRisk(counts, 'Lag');
    RiskSkala.countRisk(counts, 'Medel');
    RiskSkala.countRisk(counts, 'Normal');
    RiskSkala.countRisk(counts, 'okänd');
    assert.equal(counts.Låg, 1);
    assert.equal(counts.Normal, 2);
    assert.equal(counts.Övrigt, 1);
  });
});
