const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const TjanstKatalog = require('../public/js/tjanst-katalog');

const CATALOG = TjanstKatalog.catalogFromRecords([
  { id: 'recBokslut01', namn: 'Bokslut' },
  { id: 'recMoms00001', namn: 'Momsredovisning' },
  { id: 'recLopande01', namn: 'Löpande bokföring' }
]);

describe('tjanst-katalog', () => {
  it('räknar rec-id och exakt katalognamn som träff', () => {
    const rec = TjanstKatalog.matchValue('recBokslut01', CATALOG);
    assert.equal(rec.status, 'catalog');
    assert.equal(rec.catalogNamn, 'Bokslut');
    const exact = TjanstKatalog.matchValue('Momsredovisning', CATALOG);
    assert.equal(exact.status, 'catalog');
    assert.equal(exact.how, 'exact');
  });

  it('föreslår normalisering för skiftläge och Moms utan att skriva', () => {
    const caseHit = TjanstKatalog.matchValue('BOKSLUT', CATALOG);
    assert.equal(caseHit.status, 'case');
    assert.equal(caseHit.proposed, 'Bokslut');
    const alias = TjanstKatalog.matchValue('Moms', CATALOG);
    assert.equal(alias.status, 'alias');
    assert.equal(alias.proposed, 'Momsredovisning');
  });

  it('flaggar Avstämning och periodisk sammanställning för Annika', () => {
    assert.equal(TjanstKatalog.matchValue('Avstämning', CATALOG).status, 'ask-annika');
    assert.equal(
      TjanstKatalog.matchValue('Inlämning periodisk sammanställning', CATALOG).status,
      'ask-annika'
    );
  });

  it('räknar rec-id från annan byrå som katalogträff om namnet matchar', () => {
    const classified = TjanstKatalog.classifyCustomerServices(
      ['recOtherByra1', 'recAvstamning1', 'BOKSLUT'],
      CATALOG,
      { idLookup: { recOtherByra1: 'Bokslut', recAvstamning1: 'Avstämning' } }
    );
    assert.equal(classified.matched.length, 1);
    assert.equal(classified.matched[0].catalogNamn, 'Bokslut');
    assert.deepEqual(classified.askAnnika.map((h) => h.resolvedNamn || h.raw), ['Avstämning']);
    assert.equal(classified.normalize[0].proposed, 'Bokslut');
    assert.deepEqual(
      TjanstKatalog.reviewLabels(
        ['recOtherByra1', 'recAvstamning1', 'recGoneXXXX1', 'BOKSLUT'],
        CATALOG,
        { idLookup: { recOtherByra1: 'Bokslut', recAvstamning1: 'Avstämning' } }
      ),
      ['saknad tjänstpost', 'Avstämning']
    );
    assert.deepEqual(
      TjanstKatalog.catalogIdsForCustomerValues(
        ['recOtherByra1'],
        CATALOG,
        { idLookup: { recOtherByra1: 'Bokslut' } }
      ),
      ['recBokslut01']
    );
  });

  it('behåller okatalogiserade värden vid sparning så de inte raderas', () => {
    const merged = TjanstKatalog.mergeSaveValues(
      ['recBokslut01', 'BOKSLUT', 'Avstämning'],
      ['recMoms00001'],
      CATALOG
    );
    assert.deepEqual(merged, ['recMoms00001', 'BOKSLUT', 'Avstämning']);
  });
});
