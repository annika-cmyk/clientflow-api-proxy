const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  buildProfilSummary,
  suggestTjansterFromProfil,
  filterOpenSuggestions
} = require('./byra-profil-tjanst-forslag');

describe('byra-profil-tjanst-forslag', () => {
  it('bygger sammanfattning från högrisktjänst-fält', () => {
    const rows = buildProfilSummary({
      betalningsuppdrag: 'Ja',
      bolagsbildningAtKund: ''
    });
    const bet = rows.find((r) => r.key === 'betalningsuppdrag');
    const bol = rows.find((r) => r.key === 'bolagsbildningAtKund');
    assert.equal(bet.value, 'Ja');
    assert.equal(bet.answered, true);
    assert.equal(bol.answered, false);
  });

  it('Ja på betalningsuppdrag ger tjänsteförslag, Nej/tomt döljer', () => {
    const ja = suggestTjansterFromProfil({ betalningsuppdrag: 'Ja' });
    assert.ok(ja.some((s) => s.id === 'tjanst-betalningsuppdrag'));
    assert.equal(ja.find((s) => s.id === 'tjanst-betalningsuppdrag').mallId, 'betalningsuppdrag');
    assert.ok(ja.find((s) => s.id === 'tjanst-betalningsuppdrag').namn.includes('Betalningsuppdrag'));

    const nej = suggestTjansterFromProfil({ betalningsuppdrag: 'Nej' }).map((s) => s.id);
    const tom = suggestTjansterFromProfil({ betalningsuppdrag: '' }).map((s) => s.id);
    assert.ok(!nej.includes('tjanst-betalningsuppdrag'));
    assert.ok(!tom.includes('tjanst-betalningsuppdrag'));
  });

  it('Ja/Delvis på högrisktjänster ger förslag, Nej döljer dem', () => {
    const ja = suggestTjansterFromProfil({
      bolagsbildningAtKund: 'Ja',
      styrelseEllerNomineeRoller: 'Delvis',
      satePostadress: 'Ja',
      fullmaktBolagsverket: 'Ja',
      ombudSkatteprocesser: 'Delvis',
      generalfullmaktMyndighet: 'Ja'
    }).map((s) => s.id);
    assert.ok(ja.includes('tjanst-bolagsbildning'));
    assert.ok(ja.includes('tjanst-nominee-styrelse'));
    assert.ok(ja.includes('tjanst-sate-postadress'));
    assert.ok(ja.includes('tjanst-fullmakt-bolagsverket'));
    assert.ok(ja.includes('tjanst-ombud-skatteprocesser'));
    assert.ok(ja.includes('tjanst-generalfullmakt'));

    const nej = suggestTjansterFromProfil({
      bolagsbildningAtKund: 'Nej',
      styrelseEllerNomineeRoller: 'Nej',
      satePostadress: 'Nej',
      fullmaktBolagsverket: 'Nej',
      ombudSkatteprocesser: 'Nej',
      generalfullmaktMyndighet: 'Nej',
      betalningsuppdrag: 'Nej'
    }).map((s) => s.id);
    assert.equal(nej.length, 0);
  });

  it('filtrerar bort förslag som redan finns i katalogen eller avfärdats', () => {
    const suggestions = suggestTjansterFromProfil({
      betalningsuppdrag: 'Ja',
      bolagsbildningAtKund: 'Ja'
    });
    const open = filterOpenSuggestions(
      suggestions,
      [{ template: { id: 'betalningsuppdrag', name: 'Betalningsuppdrag och betalningshantering' }, entry: {} }],
      [],
      ['tjanst-bolagsbildning']
    );
    assert.equal(open.length, 0);
  });

  it('är inkopplat på Byråns tjänster (inte som verksamhetsspecifika på Övriga)', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/riskbedomning-byra.html'), 'utf8');
    const ovriga = fs.readFileSync(path.join(__dirname, '../public/ovriga-riskfaktorer.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '../public/js/riskbedomning-byra.v5.js'), 'utf8');
    const riskForslag = fs.readFileSync(path.join(__dirname, '../public/js/byra-profil-risk-forslag.js'), 'utf8');

    assert.match(html, /id="byra-profil-tjanst-kaskad"/);
    assert.match(html, /byra-profil-tjanst-forslag\.js\?v=\d+/);
    assert.match(html, /byra-profil-analys-koppling\.js\?v=\d+/);
    assert.match(html, /Från byråprofilen/);
    assert.match(js, /renderByraProfilTjanstKaskad/);
    assert.match(js, /acceptProfilTjanstSuggestion/);
    assert.match(js, /ByraProfilTjanstForslag/);
    assert.match(js, /betalningsuppdrag: f\.betalningsuppdrag/);

    assert.match(ovriga, /byra-profil-risk-forslag\.js\?v=3/);
    assert.doesNotMatch(riskForslag, /id: 'betalningsuppdrag'/);
    assert.doesNotMatch(riskForslag, /id: 'bolagsbildning'/);
    assert.match(riskForslag, /ByraProfilTjanstForslag/);
  });
});
