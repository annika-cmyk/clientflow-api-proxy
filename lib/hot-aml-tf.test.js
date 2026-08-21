const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Hot = require('../public/js/hot-aml-tf');

describe('hot-aml-tf', () => {
  it('nekar drift- och HR-risk utan PT/TF-koppling', () => {
    const check = Hot.assessHot({
      titel: 'Felaktiga löneutbetalningar',
      beskrivning: 'Risken för felaktiga löneutbetalningar kan leda till ekonomiska förluster och påverka anställdas förtroende.'
    });
    assert.equal(check.ok, false);
    assert.match(check.error, /penningtvätt eller finansiering av terrorism/);
  });

  it('godkänner lön som PT/TF-tillvägagångssätt', () => {
    const check = Hot.assessHot({
      titel: 'Felaktiga löneutbetalningar',
      beskrivning: 'Oriktiga eller överdrivna löneutbetalningar kan användas för att dölja eller legitimera brottsvinster, eller för att föra ut medel till personer som finansierar terrorism.'
    });
    assert.equal(check.ok, true);
  });

  it('godkänner tillgångsmanipulation med dölja/legitimera', () => {
    assert.equal(Hot.assessHot({
      titel: 'Manipulation av tillgångsvärden',
      beskrivning: 'Anläggningstillgångar kan användas för att dölja eller legitimera medel för finansiering av terrorism.'
    }).ok, true);
  });

  it('godkänner oriktiga underlag som PT-signal', () => {
    assert.equal(Hot.assessHot({
      titel: 'Felaktiga underlag',
      beskrivning: 'Kunden lämnar oriktiga kvitton.'
    }).ok, true);
  });

  it('filtrerar bort drift-hot från AI-lista', () => {
    const kept = Hot.filterHots([
      { typ: 'PT', titel: 'Felaktiga löneutbetalningar', beskrivning: 'Kan leda till ekonomiska förluster och påverka anställdas förtroende.' },
      { typ: 'TF', titel: 'Medel till terrorgrupp', beskrivning: 'Löner kan användas för att slussa medel till finansiering av terrorism.' }
    ]);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].titel, 'Medel till terrorgrupp');
  });

  it('stoppar inte utkast', () => {
    assert.equal(Hot.validateHots([{
      titel: 'Felaktiga löneutbetalningar',
      beskrivning: 'Ekonomiska förluster och förtroende.'
    }], { asDraft: true }).ok, true);
    assert.equal(Hot.validateHots([{
      titel: 'Felaktiga löneutbetalningar',
      beskrivning: 'Ekonomiska förluster och förtroende.'
    }], { asDraft: false }).ok, false);
  });

  it('prompten förbjuder drift-exemplet', () => {
    assert.match(Hot.AI_RULES, /ekonomiska förluster/);
    assert.match(Hot.AI_RULES, /anställdas förtroende/);
    assert.match(Hot.AI_RULES, /dölja eller legitimera/);
  });

  it('tjänst-popupen laddar modulen', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/riskbedomning-byra.html'), 'utf8');
    assert.match(html, /hot-aml-tf\.js/);
  });
});
