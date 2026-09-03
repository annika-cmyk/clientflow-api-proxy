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

  it('tjänst-popupen och API:t blockerar inte längre sparning med varningen', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/js/riskbedomning-byra.v5.js'), 'utf8');
    const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
    assert.doesNotMatch(js, /showNotification\(hotCheck\.error/);
    assert.doesNotMatch(js, /hot-aml-tf-warn/);
    assert.doesNotMatch(js, /paintHotAmlTf|bindHotAmlTf|validateHots/);
    assert.doesNotMatch(css, /\.hot-aml-tf-warn/);
    assert.equal(index.includes('rejectOffTopicTjanstHot'), false);
    assert.match(index, /HotAmlTf\.filterHots/);
    assert.match(index, /HotAmlTf\.AI_RULES/);
  });

  it('prompten förbjuder drift-exemplet', () => {
    assert.match(Hot.AI_RULES, /ekonomiska förluster/);
    assert.match(Hot.AI_RULES, /anställdas förtroende/);
    assert.match(Hot.AI_RULES, /dölja eller legitimera/);
  });

  it('skärper mot skatte-/kvalitetsrisk och spekulativ TF', () => {
    assert.match(Hot.AI_RULES, /rättsliga åtgärder från Skatteverket/);
    assert.match(Hot.AI_RULES, /osanna fakturor/);
    assert.match(Hot.AI_RULES, /Länsstyrelsen/);
    assert.match(Hot.AI_RULES, /spekulativt huvudhot/);
    assert.match(Hot.AI_RULES, /Falska ROT\/RUT-tjänster/);
    assert.match(Hot.AI_RULES, /legitimera kostnader, betalningar eller skattereduktioner/);
    assert.equal(Hot.assessHot({
      titel: 'Felaktiga ROT-underlag',
      beskrivning: 'Felaktiga eller överdrivna ROT/RUT-underlag kan användas för att legitimera kostnader, betalningar eller skattereduktioner.'
    }).ok, true);
  });

  it('tjänst-popupen laddar modulen', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/riskbedomning-byra.html'), 'utf8');
    assert.match(html, /hot-aml-tf\.js/);
  });
});
