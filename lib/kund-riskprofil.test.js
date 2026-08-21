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

  it('AI-prompten för kundrisk använder beräknad startpunkt och förbjuder slutsatsmening', () => {
    const src = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    assert.match(src, /POST \/api\/ai-riskbedomning\/:kundId/);
    assert.match(src, /Föreslå INTE inneboendeRiskprofil eller residualRiskprofil/);
    assert.match(src, /BERÄKNAD FÖRESLAGEN NIVÅ|beräknade föreslagna/i);
    assert.match(KundRiskprofil.AI_RULES, /Föreslå INTE inneboendeRiskprofil/);
  });

  it('tar högsta residual-S×K och pekar ut den drivande riskfaktorn', () => {
    const result = KundRiskprofil.beraknaForeslagenNiva({
      tjanster: [{ namn: 'Löpande bokföring', residualProduct: 9 }],
      riskfaktorer: [{ namn: 'Kunden verkar i högriskbransch', residualProduct: 16 }]
    });
    assert.equal(result.niva, 'Hög');
    assert.equal(result.product, 16);
    assert.equal(result.drivande.kind, 'riskfaktor');
    assert.equal(result.drivandeFaktor, 'riskfaktor: Kunden verkar i högriskbransch (residual S×K 16)');
  });

  it('beräknar förslaget från länkade Airtable-poster och ignorerar tjänst-id i riskfältet', () => {
    const result = KundRiskprofil.foreslagenFromLinkedRecords(
      {
        'Kundens utvalda tjänster': ['recTjanst1'],
        'risker kopplat till tjänster': ['recTjanst1', 'recRisk1']
      },
      [{
        id: 'recTjanst1',
        fields: {
          'Task Name': 'Löpande bokföring',
          Riskpoäng: JSON.stringify({
            sannolikhet: 3,
            konsekvens: 3,
            sannolikhetEfter: 3,
            konsekvensEfter: 3
          })
        }
      }],
      [{
        id: 'recRisk1',
        fields: {
          Riskfaktor: 'Kunden verkar i högriskbransch',
          Riskpoäng: JSON.stringify({
            sannolikhet: 4,
            konsekvens: 5,
            sannolikhetEfter: 4,
            konsekvensEfter: 4
          })
        }
      }]
    );
    assert.equal(result.niva, 'Hög');
    assert.equal(result.product, 16);
    assert.match(result.drivandeFaktor, /högriskbransch/);
  });

  it('blockerar residualavvikelse utan motivering och tillåter samma värde utan motivering', () => {
    const blocked = KundRiskprofil.canSaveResidual('Förhöjd', 'Hög', '');
    assert.equal(blocked.ok, false);
    assert.equal(blocked.required, true);
    assert.match(blocked.error, /avvikelse/);

    const same = KundRiskprofil.canSaveResidual('Hög', 'Hög', '');
    assert.equal(same.ok, true);
    assert.equal(same.required, false);

    const withReason = KundRiskprofil.canSaveResidual('Förhöjd', 'Hög', 'Byråns kontroller sänker residualen efter årlig screening.');
    assert.equal(withReason.ok, true);
    assert.equal(KundRiskprofil.avvikelseRiktning('Förhöjd', 'Hög'), 'lättat');
    assert.equal(KundRiskprofil.avvikelseRiktning('Oacceptabel', 'Hög'), 'skärpt');
  });

  it('riskaptitStatus följer residual, inte den beräknade föreslagna nivån', () => {
    const ev = Riskaptit.evaluateCustomer({
      Riskniva: 'Normal',
      'Kund föreslagen nivå': 'Hög'
    });
    assert.equal(ev.niva, 'Normal');
    assert.equal(ev.status, 'Inom_aptit');

    const hog = Riskaptit.evaluateCustomer({
      Riskniva: 'Hög',
      'Kund föreslagen nivå': 'Normal'
    });
    assert.equal(hog.status, 'Kräver_beslut');
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
    assert.match(js, /FÖRESLAGEN NIVÅ/);
    assert.match(js, /Motivering till avvikelse från beräknad nivå/);
    assert.match(html, /kund-riskprofil\.js/);
    const src = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    assert.match(src, /avvikelse_motivering_kravs/);
    assert.match(src, /\/api\/kund-riskprofil\/avvikelser/);
    const dash = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    assert.match(dash, /Residual avviker från beräknad nivå/);
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
