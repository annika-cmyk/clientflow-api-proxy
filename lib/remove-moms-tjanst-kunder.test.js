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

function isMomsTjanst(namn) {
  const key = foldName(namn);
  return key === 'moms' || key === 'momsredovisning';
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

function removeMomsTjanster(values, catalog) {
  const index = catalog && catalog.byId ? catalog : TjanstKatalog.catalogFromRecords(catalog);
  return TjanstKatalog.asValues(values).filter((raw) => !isMomsTjanst(resolveTjanstNamn(raw, index)));
}

describe('remove-moms-tjanst-kunder', () => {
  const catalog = TjanstKatalog.catalogFromRecords([
    { id: 'recMoms000001', namn: 'Momsredovisning', aktuell: true },
    { id: 'recBok000001', namn: 'Bokslut', aktuell: true }
  ]);

  it('tar bort Moms och Momsredovisning', () => {
    assert.equal(removeMomsTjanster(['Moms', 'recBok000001'], catalog).join(','), 'recBok000001');
    assert.equal(removeMomsTjanster(['recMoms000001', 'recBok000001'], catalog).join(','), 'recBok000001');
  });
});
