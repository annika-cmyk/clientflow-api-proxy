const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Tf = require('../public/js/tjanst-tf-tackning');
const { compileIdentifieradeRisker } = require('./identifierade-risker');
const { mapByraTjanstRecord } = require('./byra-tjanst-map');

describe('tjanst-tf-tackning', () => {
  it('räknar PT/TF-täckning från hotlistan', () => {
    assert.equal(Tf.ptTfCoverage([{ typ: 'PT' }, { typ: 'TF' }]), 'Båda');
    assert.equal(Tf.ptTfCoverage([{ typ: 'Båda' }]), 'Båda');
    assert.equal(Tf.ptTfCoverage([{ typ: 'TF' }]), 'TF');
    assert.equal(Tf.ptTfCoverage([{ typ: 'PT' }]), 'PT');
    assert.equal(Tf.formatPtTfMark('Båda'), ' [PT/TF]');
    assert.match(Tf.formatHotExportLine({ typ: 'Båda', titel: 'Falsk faktura', beskrivning: 'Båda dimensioner.' }), /PT\/TF-hot/);
  });

  it('skriver TF-hot synligt i exporttexten', () => {
    const text = compileIdentifieradeRisker({
      tjanster: [{
        namn: 'Internationella betalningar',
        hot: [{ typ: 'TF', titel: 'Medel till högriskland', beskrivning: 'Utlandsbetalning kan dölja terrorfinansiering.' }]
      }],
      ovriga: []
    });
    assert.match(text, /TF-hot: Medel till högriskland: Utlandsbetalning kan dölja terrorfinansiering/);
  });

  it('exporterar PT-hot utan TF-motiveringskrav', () => {
    const text = compileIdentifieradeRisker({
      tjanster: [{
        namn: 'Löpande bokföring',
        hot: [{ typ: 'PT', titel: 'Oriktiga underlag', beskrivning: 'Kunden lämnar felaktiga kvitton.' }]
      }],
      ovriga: []
    });
    assert.match(text, /PT-hot: Oriktiga underlag/);
    assert.doesNotMatch(text, /\*\*TF-analys:\*\*/);
    assert.doesNotMatch(text, /TF-hot:/);
  });

  it('mappar tjänst utan tfMotivering eller saknarTfTackning', () => {
    const mapped = mapByraTjanstRecord({
      fields: {
        'Task Name': 'Moms',
        'Hot': JSON.stringify([{ typ: 'PT', titel: 'Felaktiga underlag' }])
      }
    });
    assert.equal(mapped.namn, 'Moms');
    assert.equal(mapped.ptTfRelevans, 'PT');
    assert.equal('tfMotivering' in mapped, false);
    assert.equal('saknarTfTackning' in mapped, false);
  });
});
