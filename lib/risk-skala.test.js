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

  it('räknar S×K till samma femgradiga skala', () => {
    assert.equal(RiskSkala.assessRisk(2, 2).level, 'Låg');
    assert.equal(RiskSkala.assessRisk(2, 2).badge, 'Låg (S×K 4)');
    assert.equal(RiskSkala.assessRisk(3, 3).level, 'Normal');
    assert.equal(RiskSkala.assessRisk(3, 5).level, 'Förhöjd');
    assert.equal(RiskSkala.assessRisk(4, 4).level, 'Hög');
    assert.equal(RiskSkala.assessRisk(4, 4).badge, 'Hög (S×K 16)');
    assert.equal(RiskSkala.assessRisk(5, 5).level, 'Oacceptabel');
    assert.equal(RiskSkala.formatInneboendeBadge(RiskSkala.assessRisk(4, 4)), 'Inneboende risk: Hög (S×K 16)');
    assert.equal(RiskSkala.formatResidualBadge(RiskSkala.assessRisk(3, 3)), 'Residualrisk: Normal (S×K 9)');
    assert.equal(RiskSkala.formatInneboendeBadge(RiskSkala.assessRisk('', '')), 'Inneboende risk: Ej satt');
    assert.match(RiskSkala.INNEBOENDE_BEGREPP, /innan era kontroller och åtgärder/);
    assert.match(RiskSkala.RESIDUAL_BEGREPP, /kvar efter åtgärderna/);
    const labels = RiskSkala.listBadgeLabels({
      level: 'Hög',
      badge: 'Hög (S×K 16)',
      residualLevel: 'Normal',
      residualBadge: 'Normal (S×K 6)'
    });
    assert.equal(labels.inneboende, 'Inneboende risk: Hög (S×K 16)');
    assert.equal(labels.residual, 'Residualrisk: Normal (S×K 6)');
    assert.equal(labels.inneboendeTitle, RiskSkala.INNEBOENDE_BEGREPP);
    assert.equal(labels.residualTitle, RiskSkala.RESIDUAL_BEGREPP);
    assert.equal(RiskSkala.listBadgeLabels({ level: 'Hög', badge: 'Hög (S×K 16)' }).residual, '');
    assert.equal(RiskSkala.scoresFromLegacyLevel('Hög').sannolikhet, 4);
    assert.equal(RiskSkala.scoresFromLegacyLevel('Medel').konsekvens, 3);
  });

  it('har dimensionsordlista skild från risknivåetiketter', () => {
    assert.equal(RiskSkala.sannolikhetLabel(3), 'Medel');
    assert.equal(RiskSkala.konsekvensLabel(3), 'Kännbar');
    assert.equal(RiskSkala.sannolikhetLabel(1), 'Mycket låg');
    assert.equal(RiskSkala.konsekvensLabel(5), 'Katastrofal');
    assert.match(RiskSkala.scoreOptionHtml(3, { kind: 'sannolikhet' }), /3 — Medel/);
    assert.match(RiskSkala.scoreOptionHtml(3, { kind: 'konsekvens' }), /3 — Kännbar/);
    const block = RiskSkala.sxkScalePromptBlock();
    assert.match(block, /3 Medel/);
    assert.match(block, /3 Kännbar/);
    assert.match(block, /5–9 Normal/);
    assert.match(block, /10–15 Förhöjd/);
    assert.match(block, /ALDRIG|BARA beskriva den beräknade risknivån/i);
  });

  it('flaggar motivering som blandar risknivåord med S/K-dimensioner', () => {
    const bad = 'Sannolikheten är förhöjd eftersom hoten är realistiska. Konsekvensen är betydande vid felaktiga utbetalningar.';
    const issues = RiskSkala.motiveringScoreVocabIssues(bad, 3, 3);
    assert.ok(issues.some((i) => i.code === 'dimension_uses_riskniva_ord'));
    assert.ok(issues.some((i) => i.code === 'konsekvens_betydande'));
    assert.equal(RiskSkala.motiveringScoreVocabOk(bad, 3, 3), false);

    const good = 'Sannolikheten bedöms till 3 (medel) eftersom hoten är realistiska men inte frekventa. Konsekvensen bedöms till 3 (kännbar) vid felaktiga utbetalningar. Inneboende risk blir därmed Normal (S×K 9).';
    assert.deepEqual(RiskSkala.motiveringScoreVocabIssues(good, 3, 3), []);
    assert.equal(RiskSkala.motiveringScoreVocabOk(good, 3, 3), true);

    const mismatch = 'Sannolikheten bedöms till 3 (medel). Konsekvensen bedöms till 3 (kännbar). Inneboende risk bedöms som Förhöjd.';
    const mismatchIssues = RiskSkala.motiveringScoreVocabIssues(mismatch, 3, 3);
    assert.ok(mismatchIssues.some((i) => i.code === 'riskniva_mismatch'));
  });

  it('läser sparade riskpoäng och fyller i från gammal nivå', () => {
    const fromJson = RiskSkala.readTjanstRisk({
      Riskpoäng: JSON.stringify({ sannolikhet: 4, konsekvens: 4, sannolikhetEfter: 2, konsekvensEfter: 3 })
    });
    assert.equal(fromJson.level, 'Hög');
    assert.equal(fromJson.product, 16);
    assert.equal(fromJson.residualLevel, 'Normal');
    assert.equal(fromJson.residualProduct, 6);

    const fromLegacy = RiskSkala.readTjanstRisk({ Riskbedömning: 'Hög' });
    assert.equal(fromLegacy.sannolikhet, 4);
    assert.equal(fromLegacy.konsekvens, 4);
    assert.equal(fromLegacy.level, 'Hög');
    assert.equal(fromLegacy.residualLevel, '');
  });

  it('beräknar risknivå med samma funktion för hela appen', () => {
    assert.equal(RiskSkala.beraknaRiskniva(4, 4), 'Hög');
    assert.equal(RiskSkala.beraknaRiskniva(1, 2), 'Låg');
    assert.equal(RiskSkala.beraknaRiskniva('', 3), '');
  });

  it('migrerar gammal risknivå till S×K med manuell översyn', () => {
    const migrated = RiskSkala.migrateLegacyRiskScores('Förhöjd');
    assert.equal(migrated.sannolikhet, 3);
    assert.equal(migrated.konsekvens, 4);
    assert.equal(migrated.sannolikhetEfter, 3);
    assert.equal(migrated.konsekvensEfter, 4);
    assert.equal(migrated.kraverManualOversyn, true);
    assert.equal(RiskSkala.beraknaRiskniva(migrated.sannolikhet, migrated.konsekvens), 'Förhöjd');
    assert.equal(RiskSkala.normalizePtTf('Båda'), 'Båda');
    assert.equal(RiskSkala.normalizePtTf('TF'), 'TF');
    assert.equal(RiskSkala.normalizePtTf('PT, TF eller Båda'), 'Båda');
    assert.equal(RiskSkala.normalizePtTf('finansiering av terrorism'), 'TF');
    assert.equal(RiskSkala.isTfRelevant('TF'), true);
    assert.equal(RiskSkala.isTfRelevant('PT'), false);

    const scored = RiskSkala.readOvrigRisk({
      Riskbedömning: 'Hög',
      'PT/TF-relevans': 'Båda'
    });
    assert.equal(scored.level, 'Hög');
    assert.equal(scored.residualLevel, 'Hög');
    assert.equal(scored.kraverManualOversyn, true);
    assert.equal(scored.ptTfRelevans, 'Båda');
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
