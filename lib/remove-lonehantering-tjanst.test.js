const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const TjanstKatalog = require('../public/js/tjanst-katalog');

function foldName(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .normalize('NFC')
    .replace(/\s+/g, ' ');
}

function isLonehanteringTjanst(namn) {
  const key = foldName(namn);
  if (!key) return false;
  if (key === 'lönehantering' || key === 'lonehantering') return true;
  return key.includes('lönehantering') || key.includes('lonehantering');
}

function customerMayKeepLonehantering(customerNamn) {
  const folded = foldName(customerNamn);
  return (
    folded.includes('sigridur')
    || folded.includes('shiraz')
    || folded.includes('höglanders')
    || folded.includes('pewall')
    || folded.includes('ljungby måleri')
    || folded.includes('nybrukarna')
    || folded.includes('ena operations')
    || folded.includes('enasweden')
  );
}

function resolveTjanstNamn(raw, index) {
  const hit = TjanstKatalog.matchValue(raw, index);
  let namn = hit.catalogNamn || hit.resolvedNamn || hit.proposed || '';
  if (!namn && hit.status === 'unknown-id' && index.byId && index.byId[raw]) {
    namn = index.byId[raw].namn || '';
  }
  if (!namn) namn = hit.raw;
  return namn;
}

function removeLonehanteringTjanster(values, catalog) {
  const index = catalog && catalog.byId ? catalog : TjanstKatalog.catalogFromRecords(catalog);
  return TjanstKatalog.asValues(values).filter(
    (raw) => !isLonehanteringTjanst(resolveTjanstNamn(raw, index))
  );
}

describe('remove-lonehantering-tjanst', () => {
  const catalog = TjanstKatalog.catalogFromRecords([
    { id: 'recLon00000001', namn: 'Lönehantering', aktuell: true },
    { id: 'recLon00000002', namn: 'Lönehantering / arbetsgivardeklaration', aktuell: true },
    { id: 'recBok00000001', namn: 'Bokslut', aktuell: true }
  ]);

  it('känner igen lönehantering', () => {
    assert.equal(isLonehanteringTjanst('Lönehantering'), true);
    assert.equal(isLonehanteringTjanst('Lönehantering / arbetsgivardeklaration'), true);
    assert.equal(isLonehanteringTjanst('Bokslut'), false);
  });

  it('behåller tjänsten för undantagskunder', () => {
    assert.equal(customerMayKeepLonehantering('Sigridur AB'), true);
    assert.equal(customerMayKeepLonehantering('Shiraz and Daryan AB'), true);
    assert.equal(customerMayKeepLonehantering('Höglanders Bygg & Plattsättning i Åseda AB'), true);
    assert.equal(customerMayKeepLonehantering('Pewall AB'), true);
    assert.equal(customerMayKeepLonehantering('Ljungby Måleri AB'), true);
    assert.equal(customerMayKeepLonehantering('Nybrukarna Ekonomisk förening'), true);
    assert.equal(customerMayKeepLonehantering('ENA Operations AB'), true);
    assert.equal(customerMayKeepLonehantering('ENA Operations AB, EnaSweden, Affärsutveckling Polen'), true);
    assert.equal(customerMayKeepLonehantering('Anoteket AB'), false);
    assert.equal(customerMayKeepLonehantering('Nordic Fashiontech AB'), false);
  });

  it('tar bort lönehantering för övriga kunder', () => {
    assert.deepEqual(
      removeLonehanteringTjanster(['recLon00000001', 'recBok00000001'], catalog),
      ['recBok00000001']
    );
    assert.deepEqual(
      removeLonehanteringTjanster(['recLon00000002', 'recBok00000001'], catalog),
      ['recBok00000001']
    );
  });
});
