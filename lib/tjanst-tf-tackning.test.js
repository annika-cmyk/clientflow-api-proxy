const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Tf = require('../public/js/tjanst-tf-tackning');
const { compileIdentifieradeRisker } = require('./identifierade-risker');
const { mapByraTjanstRecord } = require('./byra-tjanst-map');

describe('tjanst-tf-tackning', () => {
  it('sparar tjänst med minst ett TF-hot utan krav på tfMotivering', () => {
    const result = Tf.validateTjanstTfTackning({
      hot: [{ typ: 'PT', titel: 'Felaktiga underlag' }, { typ: 'TF', titel: 'Medel till terrorgrupp' }],
      tfMotivering: ''
    });
    assert.equal(result.ok, true);
    assert.equal(Tf.hasTfHot([{ typ: 'Båda', titel: 'Båda dimensioner' }]), true);
  });

  it('nekar tjänst med enbart PT-hot och tom tfMotivering', () => {
    const result = Tf.validateTjanstTfTackning({
      hot: [{ typ: 'PT', titel: 'Felaktiga underlag' }],
      tfMotivering: '   för kort   '
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /saknar TF-hot/);
    assert.match(result.error, /Hot-fliken/);
  });

  it('godkänner utkast utan TF-täckning', () => {
    const result = Tf.validateTjanstTfTackning({
      hot: [{ typ: 'PT', titel: 'Felaktiga underlag' }],
      tfMotivering: '',
      asDraft: true
    });
    assert.equal(result.ok, true);
    assert.equal(result.draft, true);
  });

  it('sparar PT-only med ifylld tfMotivering och syns i exporten', () => {
    const motivering = 'Tjänsten rör enbart löpande svensk bokföring utan gränsöverskridande betalningar, så TF-risken bedöms täckt av PT-analysen.';
    const result = Tf.validateTjanstTfTackning({
      hot: [{ typ: 'PT', titel: 'Oriktiga underlag', beskrivning: 'Kunden lämnar felaktiga kvitton.' }],
      tfMotivering: motivering
    });
    assert.equal(result.ok, true);

    const mapped = mapByraTjanstRecord({
      fields: {
        'Task Name': 'Löpande bokföring',
        'Hot': JSON.stringify([{ typ: 'PT', titel: 'Oriktiga underlag', beskrivning: 'Kunden lämnar felaktiga kvitton.' }]),
        'TF-motivering': motivering
      }
    });
    assert.equal(mapped.tfMotivering, motivering);
    const text = compileIdentifieradeRisker({ tjanster: [mapped], ovriga: [] });
    assert.match(text, /PT-hot: Oriktiga underlag/);
    assert.match(text, /\*\*TF-analys:\*\* Tjänsten rör enbart löpande svensk bokföring/);
    assert.doesNotMatch(text, /TF-hot:/);
  });

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

  it('läser tfMotivering från Riskpoäng om eget fält saknas', () => {
    const mapped = mapByraTjanstRecord({
      fields: {
        'Task Name': 'Moms',
        'Riskpoäng': JSON.stringify({
          sannolikhet: 2,
          konsekvens: 2,
          tfMotivering: 'Momsdeklaration i Sverige bedöms inte bära en separat TF-hotbild utöver PT.'
        })
      }
    });
    assert.match(mapped.tfMotivering, /Momsdeklaration/);
    assert.equal(Tf.tjanstSaknarTfTackning(mapped), false);
  });
});
