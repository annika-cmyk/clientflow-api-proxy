const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Katalog = require('./riskanalys-tjanst-katalog');

describe('riskanalys-tjanst-katalog', () => {
  it('har katalogdata från Excel-underlaget', () => {
    assert.ok(fs.existsSync(Katalog.DATA_PATH));
    const catalog = Katalog.loadCatalog();
    assert.ok(catalog.tjanster.Bokföring);
    assert.ok(Array.isArray(catalog.tjanster.Bokföring));
    assert.equal(catalog.tjanster.Bokföring.length >= 2, true);
  });

  it('matchar tjänstnamn exakt, via alias och delvis', () => {
    assert.equal(Katalog.resolveTjanstKey('Bokföring'), 'Bokföring');
    assert.equal(Katalog.resolveTjanstKey('Löpande bokföring'), 'Bokföring');
    assert.equal(Katalog.resolveTjanstKey('Momsredovisning'), 'Momsdeklaration');
    assert.equal(Katalog.resolveTjanstKey('Leverantörsreskontra'), 'Leverantörsreskontra');
    assert.equal(Katalog.resolveTjanstKey('Helt okänd tjänst XYZ'), '');
  });

  it('formaterar promptblock med hot, sårbarhet och källor', () => {
    const block = Katalog.formatPromptBlock('Bokföring');
    assert.match(block, /RISKANALYS-UNDERLAG/);
    assert.match(block, /Matchad tjänst i katalogen: Bokföring/);
    assert.match(block, /Hotkategori: PT/);
    assert.match(block, /Hotkategori: TF|Båda/);
    assert.match(block, /Sårbarhet:/);
    assert.match(block, /inte facit/);
  });

  it('inkluderar sektorkomplettering för bokföringstjänster', () => {
    const match = Katalog.lookup('Bokföring');
    assert.ok(match.sektorKomplettering.length >= 1);
    const block = Katalog.formatPromptBlock('Bokföring');
    assert.match(block, /Sektor-/);
  });

  it('index.js matar in katalogblock i AI-tjänstprompten', () => {
    const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    assert.match(index, /RiskanalysTjanstKatalog/);
    assert.match(index, /formatPromptBlock/);
    assert.match(index, /hasKlientmedelskonto/);
    assert.match(index, /filterKlientmedelItems/);
    assert.match(index, /filterKlientmedelGranskning/);
  });

  it('katalogprompten kräver konkret mekanism och avfärdar inte TF p.g.a. saknad NGO/utland', () => {
    assert.match(Katalog.PROMPT_RULES, /konkret mekanism/);
    assert.match(Katalog.PROMPT_RULES, /ideell organisation eller utlandsbetalning/);
    assert.match(Katalog.PROMPT_RULES, /kan användas för att tvätta pengar/);
    assert.doesNotMatch(Katalog.PROMPT_RULES, /tfMotivering/);
    assert.doesNotMatch(Katalog.PROMPT_RULES, /lägg till TF där det saknas/);
    assert.doesNotMatch(Katalog.PROMPT_RULES, /spekulativa TF-scenarier/);
  });

  it('filtrerar klientmedelskonto-/genomgångskonto-rader när byrån svarat Nej', () => {
    const withKonto = Katalog.formatPromptBlock('Betalningsuppdrag', undefined, { hasKlientmedelskonto: true });
    const without = Katalog.formatPromptBlock('Betalningsuppdrag', undefined, { hasKlientmedelskonto: false });
    assert.match(withKonto, /Byråns klientmedelskonto används som genomgångskonto/);
    assert.doesNotMatch(without, /Byråns klientmedelskonto används som genomgångskonto/);
    assert.doesNotMatch(without, /betalning via klientmedelskonto/i);
    assert.match(without, /inte har klientmedelskonto/);
    assert.match(without, /betalningsförmedlare|Betalningsuppdrag/i);

    const kept = Katalog.filterKlientmedelItems([
      { titel: 'Tredjepartsbetalning', beskrivning: 'Betalning utan underlag' },
      { titel: 'Genomgångskonto', beskrivning: 'Byråns klientmedelskonto kan användas som genomgångskonto.' }
    ], false);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].titel, 'Tredjepartsbetalning');

    const posters = Katalog.filterKlientmedelGranskning([
      {
        falt: 'hot',
        andra: true,
        forslag: [
          { titel: 'Genomgångskonto', beskrivning: 'Byråns klientmedelskonto…', kalla: 'Srf' },
          { titel: 'Falska underlag', beskrivning: 'Osanna fakturor' }
        ],
        andringar: [
          { typ: 'redigera', titel: 'Genomgångskonto', kommentar: 'Justera källa' },
          { typ: 'ta-bort', titel: 'Genomgångskonto', kommentar: 'Byrån har inte klientmedelskonto' },
          { typ: 'lagg-till', titel: 'Falska underlag', kommentar: 'Nytt' }
        ]
      }
    ], false);
    assert.equal(posters[0].forslag.length, 1);
    assert.equal(posters[0].forslag[0].titel, 'Falska underlag');
    assert.equal(posters[0].andringar.length, 2);
    assert.ok(posters[0].andringar.some((a) => a.typ === 'ta-bort'));
    assert.ok(posters[0].andringar.some((a) => a.titel === 'Falska underlag'));
  });
});
