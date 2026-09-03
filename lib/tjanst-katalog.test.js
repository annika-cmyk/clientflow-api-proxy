const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const TjanstKatalog = require('../public/js/tjanst-katalog');

const CATALOG = TjanstKatalog.catalogFromRecords([
  { id: 'recBokslut01', namn: 'Bokslut', aktuell: true },
  { id: 'recMoms00001', namn: 'Momsredovisning', aktuell: true },
  { id: 'recLopande01', namn: 'Löpande bokföring', aktuell: true }
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

  it('tar bort inaktiva och okatalogiserade tjänster vid sparning', () => {
    const catalog = TjanstKatalog.catalogFromRecords([
      { id: 'recBokslut01', namn: 'Bokslut', aktuell: true },
      { id: 'recMoms00001', namn: 'Momsredovisning', aktuell: true },
      { id: 'recOld000001', namn: 'Avstämning', aktuell: false }
    ]);
    const merged = TjanstKatalog.mergeSaveValues(
      ['recBokslut01', 'BOKSLUT', 'Avstämning', 'recOld000001'],
      ['recMoms00001'],
      catalog
    );
    assert.deepEqual(merged, ['recMoms00001']);
  });

  it('sanitizeToActiveCatalogIds behåller bara aktiva katalogposter', () => {
    const catalog = TjanstKatalog.catalogFromRecords([
      { id: 'recBokslut01', namn: 'Bokslut', aktuell: true },
      { id: 'recOld000001', namn: 'Avstämning', aktuell: false }
    ]);
    assert.deepEqual(
      TjanstKatalog.sanitizeToActiveCatalogIds(
        ['recBokslut01', 'recOld000001', 'Avstämning', 'BOKSLUT'],
        catalog
      ),
      ['recBokslut01']
    );
  });

  it('utesluter utförande-inaktiva tjänster via aktiv/valbar', () => {
    const catalog = TjanstKatalog.catalogFromRecords([
      { id: 'recBokslut01', namn: 'Bokslut', aktuell: true, aktiv: true, valbar: true },
      { id: 'recMoms00001', namn: 'Momsredovisning', aktuell: true, aktiv: false, valbar: false }
    ]);
    assert.equal(TjanstKatalog.isActiveCatalogItem(catalog.byId.recBokslut01), true);
    assert.equal(TjanstKatalog.isActiveCatalogItem(catalog.byId.recMoms00001), false);
    assert.deepEqual(
      TjanstKatalog.catalogIdsFromSelection(['recBokslut01', 'recMoms00001'], catalog),
      ['recBokslut01']
    );
  });
});
