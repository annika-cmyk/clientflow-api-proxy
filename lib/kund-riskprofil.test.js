const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const KundRiskprofil = require('../public/js/kund-riskprofil');
const Riskaptit = require('./riskaptit');

describe('kund-riskprofil', () => {
  it('kräver båda explicit valda riskprofil-fält för klar/publicerad', () => {
    assert.equal(KundRiskprofil.isPublicerbar({
      'Byrans riskbedomning': 'Den sammantagna riskbedömningen är hög på grund av internationell handel.',
      Riskniva: 'Hög'
    }), false);
    assert.equal(KundRiskprofil.isPublicerbar({
      Riskniva: 'Hög',
      'Kund inneboende riskprofil': 'Förhöjd'
    }), true);
    assert.equal(KundRiskprofil.isPublicerbar({
      'Flik klar - Riskbedömning': true
    }), true);
    assert.equal(KundRiskprofil.isPublicerbar({
      'Flik klar - Riskbedömning': false,
      Riskniva: 'Hög',
      'Kund inneboende riskprofil': 'Förhöjd'
    }), false);
  });

  it('flaggar sammantagen slutsatsmening utan att blockera manuell text', () => {
    const text = 'Kunden bedriver grafisk design. Den sammantagna riskbedömningen är hög på grund av BeHance.';
    assert.equal(KundRiskprofil.hasSammantagenSlutsats(text), true);
    assert.match(KundRiskprofil.slutsatsVarning(text), /sammanfattande nivåmening/);
    const ai = KundRiskprofil.normalizeAiPayload({
      inneboendeRiskprofil: 'Förhöjd',
      residualRiskprofil: 'Normal',
      riskbedomning: text
    });
    assert.equal(ai.harSammantagenSlutsats, true);
    assert.match(ai.slutsatsVarning, /nivåmening/);
    assert.equal(KundRiskprofil.hasSammantagenSlutsats(ai.riskbedomning), false);
    assert.doesNotMatch(ai.riskbedomning, /sammantagna riskbedömningen är/i);
  });

  it('uppdaterar riskaptitStatus från residual-enum, inte S×K', () => {
    const hog = Riskaptit.evaluateCustomer({ Riskniva: 'Hög' });
    assert.equal(hog.niva, 'Hög');
    assert.equal(hog.status, 'Kräver_beslut');

    const oacc = Riskaptit.evaluateCustomer({ Riskniva: 'Oacceptabel' });
    assert.equal(oacc.status, 'Överskriden');

    const scoreIgnored = Riskaptit.evaluateCustomer({
      Riskniva: 'Normal',
      Riskpoäng: JSON.stringify({
        sannolikhet: 4,
        konsekvens: 5,
        sannolikhetEfter: 4,
        konsekvensEfter: 4
      })
    });
    assert.equal(scoreIgnored.niva, 'Normal');
    assert.equal(scoreIgnored.status, 'Inom_aptit');
  });

  it('varnar när kundresidual ligger under vald högrisktjänst', () => {
    const floor = KundRiskprofil.tjanstResidualFloor([
      { namn: 'Löpande bokföring', residualrisk: 'Normal' },
      { namn: 'Betalningsuppdrag', residualrisk: 'Hög' }
    ]);
    assert.equal(floor.level, 'Hög');
    assert.match(floor.namn, /Betalningsuppdrag/);
    assert.equal(KundRiskprofil.residualBelowFloor('Normal', floor.level), true);
    assert.match(KundRiskprofil.floorWarning('Normal', floor), /Betalningsuppdrag/);
    assert.equal(KundRiskprofil.floorWarning('Hög', floor), '');
  });

  it('AI-prompten för kundrisk kräver två enum-fält och förbjuder slutsatsmening', () => {
    const src = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    assert.match(src, /POST \/api\/ai-riskbedomning\/:kundId/);
    assert.match(src, /inneboendeRiskprofil/);
    assert.match(src, /residualRiskprofil/);
    assert.match(src, /nivaMotivering/);
    assert.match(src, /HÖGSTA RESIDUALRISK BLAND VALDA TJÄNSTER/);
    assert.match(src, /Använd INTE S×K \(sannolikhet × konsekvens\) för dessa två kundfält/);
  });

  it('kundkortet har två profilval, golvvarning och legacy-ruta', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/js/kundkort.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '../public/kundkort.html'), 'utf8');
    assert.match(js, /Inneboende riskprofil/);
    assert.match(js, /Residual riskprofil/);
    assert.match(js, /Dessa åtgärder ligger till grund för residualbedömningen ovan/);
    assert.match(js, /ai-rb-floor-warn/);
    assert.match(js, /Tidigare bedömning \(ej uppdelad/);
    assert.match(js, /setKundRiskprofil/);
    assert.match(html, /kund-riskprofil\.js/);
  });

  it('behåller gammal fritext som legacy-översyn tills inneboende är satt', () => {
    assert.equal(KundRiskprofil.needsLegacyReview({
      Riskniva: 'Förhöjd',
      'Byrans riskbedomning': 'Den sammantagna riskbedömningen är förhöjd.'
    }), true);
    assert.equal(KundRiskprofil.needsLegacyReview({
      'Kund inneboende riskprofil': 'Förhöjd',
      Riskniva: 'Normal',
      'Byrans riskbedomning': 'Kunden bedriver grafisk design.'
    }), false);
  });
});
