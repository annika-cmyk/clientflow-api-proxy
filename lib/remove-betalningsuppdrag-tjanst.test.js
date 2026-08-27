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

function isBetalningsuppdragTjanst(namn) {
  const key = foldName(namn);
  if (!key) return false;
  if (key === 'utföra betalningsuppdrag') return true;
  return key.includes('betalningsuppdrag');
}

function customerMayKeepBetalningsuppdrag(customerNamn) {
  const folded = foldName(customerNamn);
  return folded.includes('ena operations') || folded.includes('höglanders');
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

function removeBetalningsuppdragTjanster(values, catalog) {
  const index = catalog && catalog.byId ? catalog : TjanstKatalog.catalogFromRecords(catalog);
  return TjanstKatalog.asValues(values).filter(
    (raw) => !isBetalningsuppdragTjanst(resolveTjanstNamn(raw, index))
  );
}

describe('remove-betalningsuppdrag-tjanst', () => {
  const catalog = TjanstKatalog.catalogFromRecords([
    { id: 'recBet00000001', namn: 'Utföra betalningsuppdrag', aktuell: true },
    { id: 'recBok00000001', namn: 'Bokslut', aktuell: true }
  ]);

  it('känner igen betalningsuppdrag', () => {
    assert.equal(isBetalningsuppdragTjanst('Utföra betalningsuppdrag'), true);
    assert.equal(isBetalningsuppdragTjanst('Bokslut'), false);
  });

  it('behåller tjänsten för Höglanders och ENA Operations', () => {
    assert.equal(customerMayKeepBetalningsuppdrag('ENA Operations AB'), true);
    assert.equal(customerMayKeepBetalningsuppdrag('Höglanders Bygg & Plattsättning i Åseda AB'), true);
    assert.equal(customerMayKeepBetalningsuppdrag('Gehricke, Andreas'), false);
  });

  it('tar bort betalningsuppdrag för övriga kunder', () => {
    assert.deepEqual(
      removeBetalningsuppdragTjanster(['recBet00000001', 'recBok00000001'], catalog),
      ['recBok00000001']
    );
  });
});
