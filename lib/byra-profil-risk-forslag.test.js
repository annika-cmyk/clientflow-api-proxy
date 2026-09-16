const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  buildProfilSummary,
  suggestFromProfil,
  filterOpenSuggestions,
  isLeveransEndastDistans,
  isLeveransBlandad,
  isLeveransMedDistans,
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

  it('Ja på betalningsuppdrag ger förslag, Nej döljer det', () => {
    const ja = suggestFromProfil({ betalningsuppdrag: 'Ja' }).map((s) => s.id);
    const nej = suggestFromProfil({ betalningsuppdrag: 'Nej' }).map((s) => s.id);
    const tom = suggestFromProfil({ betalningsuppdrag: '' }).map((s) => s.id);
    assert.ok(ja.includes('betalningsuppdrag'));
    assert.ok(!nej.includes('betalningsuppdrag'));
    assert.ok(!tom.includes('betalningsuppdrag'));
  });

  it('Ja/Delvis på högrisktjänster ger förslag, Nej döljer dem', () => {
    const ja = suggestFromProfil({
      bolagsbildningAtKund: 'Ja',
      styrelseEllerNomineeRoller: 'Delvis',
      satePostadress: 'Ja',
      fullmaktBolagsverket: 'Ja',
      storaKundberoenden: 'Ja',
      nearMisses: 'Ja',
      lanstyrelsenAnmarkningar: 'Ja'
    }).map((s) => s.id);
    assert.ok(ja.includes('bolagsbildning'));
    assert.ok(ja.includes('nominee-styrelse'));
    assert.ok(ja.includes('sate-postadress'));
    assert.ok(ja.includes('fullmakt-bolagsverket'));
    assert.ok(ja.includes('kundberoende'));
    assert.ok(ja.includes('near-misses'));
    assert.ok(ja.includes('tillsynsanmarkning'));

    const nej = suggestFromProfil({
      bolagsbildningAtKund: 'Nej',
      styrelseEllerNomineeRoller: 'Nej',
      satePostadress: 'Nej',
      fullmaktBolagsverket: 'Nej',
      storaKundberoenden: 'Nej',
      nearMisses: 'Nej',
      lanstyrelsenAnmarkningar: 'Nej',
      outsourcingUnderleverantorer: 'Nej',
      betalningsuppdrag: 'Nej'
    }).map((s) => s.id);
    assert.ok(!nej.includes('bolagsbildning'));
    assert.ok(!nej.includes('nominee-styrelse'));
    assert.ok(!nej.includes('sate-postadress'));
    assert.ok(!nej.includes('fullmakt-bolagsverket'));
    assert.ok(!nej.includes('kundberoende'));
    assert.ok(!nej.includes('near-misses'));
    assert.ok(!nej.includes('tillsynsanmarkning'));
    assert.ok(!nej.includes('outsourcing'));
    assert.ok(!nej.includes('betalningsuppdrag'));
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
    assert.match(html, /byra-profil-risk-forslag\.js\?v=2/);
    assert.match(html, /byra-profil-analys-koppling\.js\?v=1/);
    assert.match(html, /ovriga-riskfaktorer\.js\?v=\d+/);
    assert.match(html, /Byråns geografiska marknad/);
    assert.match(html, /section=intern/);
    assert.match(html, /section=distribution/);
    assert.doesNotMatch(kund, /id="byra-profil-kaskad"/);
    assert.match(js, /renderByraProfilKaskad/);
    assert.match(js, /loadByraProfilForKaskad/);
    assert.match(js, /acceptProfilSuggestion/);
    assert.match(js, /ByraProfilRiskForslag/);
    assert.match(js, /ByraProfilAnalysKoppling/);
    assert.match(js, /applyAnalysisFokusFromUrl/);
  });

  it('mappar legacy och nya leveranssätt till samma riskförslag', () => {
    assert.equal(isLeveransEndastDistans('Distans'), true);
    assert.equal(isLeveransEndastDistans('Vi träffar kunder endast på distans'), true);
    assert.equal(isLeveransBlandad('Blandat'), true);
    assert.equal(isLeveransBlandad('Onboarding fysiskt, därefter främst distans'), true);
    assert.equal(isLeveransBlandad('Blandad modell – varierar kraftigt mellan kunder'), true);
    assert.equal(isLeveransMedDistans('På plats'), false);

    const legacy = suggestFromProfil({ leveranssatt: 'Distans', bankIdKrav: 'Nej' }).map((s) => s.id);
    const neu = suggestFromProfil({
      leveranssatt: 'Vi träffar kunder endast på distans',
      bankIdKrav: 'Nej'
    }).map((s) => s.id);
    assert.ok(legacy.includes('distans-leverans'));
    assert.ok(neu.includes('distans-leverans'));
    assert.ok(legacy.includes('svag-bankid'));
    assert.ok(neu.includes('svag-bankid'));

    const bland = suggestFromProfil({
      leveranssatt: 'Blandad modell – varierar kraftigt mellan kunder',
      bankIdKrav: 'Ibland'
    }).map((s) => s.id);
    assert.ok(bland.includes('blandad-leverans'));
    assert.ok(bland.includes('svag-bankid'));
    assert.ok(!bland.includes('distans-leverans'));

    const fysisk = suggestFromProfil({
      leveranssatt: 'Vi träffar kunder nästan uteslutande fysiskt – t.ex. överlämning av material',
      bankIdKrav: 'Nej'
    }).map((s) => s.id);
    assert.ok(!fysisk.includes('distans-leverans'));
    assert.ok(!fysisk.includes('blandad-leverans'));
    assert.ok(!fysisk.includes('svag-bankid'));
  });

});
