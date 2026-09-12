const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  buildProfilSummary,
  suggestFromProfil,
  filterOpenSuggestions,
  TYP_VERKSAMHET,
  TYP_DISTRIBUTION
} = require('./byra-profil-risk-forslag');

describe('byra-profil-risk-forslag', () => {
  it('bygger sammanfattningsrader från profilfält', () => {
    const rows = buildProfilSummary({
      antalAnstallda: 1,
      leveranssatt: 'Distans',
      geografiskMarknad: ''
    });
    const anst = rows.find((r) => r.key === 'antalAnstallda');
    const geo = rows.find((r) => r.key === 'geografiskMarknad');
    assert.equal(anst.value, '1');
    assert.equal(anst.answered, true);
    assert.equal(geo.answered, false);
    assert.equal(geo.label, 'Byråns geografiska marknad');
  });

  it('föreslår enmans-, distans- och utbildningsrader', () => {
    const suggestions = suggestFromProfil({
      antalAnstallda: 1,
      leveranssatt: 'Distans',
      bankIdKrav: 'Nej',
      lopandeUtbildning: 'Nej',
      personalomsattning: 'Hög',
      outsourcingUnderleverantorer: 'Ja',
      betalningsuppdrag: 'Ja',
      geografiskMarknad: 'Stockholm och Norge'
    });
    const ids = suggestions.map((s) => s.id);
    assert.ok(ids.includes('enmansbyra'));
    assert.ok(ids.includes('distans-leverans'));
    assert.ok(ids.includes('svag-bankid'));
    assert.ok(ids.includes('saknad-utbildning'));
    assert.ok(ids.includes('hog-personalomsattning'));
    assert.ok(ids.includes('outsourcing'));
    assert.ok(ids.includes('betalningsuppdrag'));
    assert.ok(ids.includes('byra-marknad-geo'));
    assert.equal(suggestions.find((s) => s.id === 'enmansbyra').typ, TYP_VERKSAMHET);
    assert.equal(suggestions.find((s) => s.id === 'distans-leverans').typ, TYP_DISTRIBUTION);
  });

  it('filtrerar bort förslag som redan finns eller avfärdats', () => {
    const suggestions = suggestFromProfil({ antalAnstallda: 1, leveranssatt: 'Distans' });
    const open = filterOpenSuggestions(
      suggestions,
      [{ fields: { Riskfaktor: 'Enmansbyrå / begränsad fyraögonprincip' } }],
      ['distans-leverans']
    );
    assert.equal(open.length, 0);
  });

  it('är inkopplat på övriga-sidan (inte kundrisker)', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/ovriga-riskfaktorer.html'), 'utf8');
    const kund = fs.readFileSync(path.join(__dirname, '../public/kundrisker-mm.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '../public/js/ovriga-riskfaktorer.js'), 'utf8');
    assert.match(html, /id="byra-profil-kaskad"/);
    assert.match(html, /byra-profil-risk-forslag\.js\?v=1/);
    assert.match(html, /ovriga-riskfaktorer\.js\?v=40/);
    assert.match(html, /Byråns geografiska marknad/);
    assert.doesNotMatch(kund, /id="byra-profil-kaskad"/);
    assert.match(js, /renderByraProfilKaskad/);
    assert.match(js, /loadByraProfilForKaskad/);
    assert.match(js, /acceptProfilSuggestion/);
    assert.match(js, /ByraProfilRiskForslag/);
  });
});
