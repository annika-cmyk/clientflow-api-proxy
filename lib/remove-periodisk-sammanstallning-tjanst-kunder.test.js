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

function isPeriodiskSammanstallningTjanst(namn) {
  const key = foldName(namn);
  if (!key) return false;
  if (key === 'inlämning periodisk sammanställning') return true;
  return /periodisk\s+sammanst/.test(key);
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

function removePeriodiskSammanstallningTjanster(values, catalog) {
  const index = catalog && catalog.byId ? catalog : TjanstKatalog.catalogFromRecords(catalog);
  return TjanstKatalog.asValues(values).filter(
    (raw) => !isPeriodiskSammanstallningTjanst(resolveTjanstNamn(raw, index))
  );
}

describe('remove-periodisk-sammanstallning-tjanst-kunder', () => {
  const catalog = TjanstKatalog.catalogFromRecords([
    { id: 'recPer00000001', namn: 'Inlämning periodisk sammanställning', aktuell: true },
    { id: 'recBok00000001', namn: 'Bokslut', aktuell: true }
  ]);

  it('tar bort inlämning periodisk sammanställning', () => {
    assert.deepEqual(
      removePeriodiskSammanstallningTjanster(
        ['Inlämning periodisk sammanställning', 'recBok00000001'],
        catalog
      ),
      ['recBok00000001']
    );
    assert.deepEqual(
      removePeriodiskSammanstallningTjanster(['recPer00000001', 'recBok00000001'], catalog),
      ['recBok00000001']
    );
  });
});
