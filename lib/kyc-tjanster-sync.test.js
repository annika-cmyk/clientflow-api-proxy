const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const sync = require('./kyc-tjanster-sync');
const TjanstKatalog = require('../public/js/tjanst-katalog');

const CATALOG = [
  { id: 'recBokslut01', namn: 'Bokslut', aktuell: true, valbar: true },
  { id: 'recMoms00001', namn: 'Momsredovisning', aktuell: true, valbar: true },
  { id: 'recLopande01', namn: 'Löpande bokföring', aktuell: true, valbar: true },
  { id: 'recOld000001', namn: 'Gammal tjänst', aktuell: false, valbar: false }
];

describe('kyc-tjanster-sync', () => {
  it('parseKycTjansterLabels delar kommaseparerad sträng och array', () => {
    assert.deepEqual(
      sync.parseKycTjansterLabels('Löpande bokföring, Bokslut'),
      ['Löpande bokföring', 'Bokslut']
    );
    assert.deepEqual(
      sync.parseKycTjansterLabels(['Moms', 'Bokslut']),
      ['Moms', 'Bokslut']
    );
    assert.deepEqual(sync.parseKycTjansterLabels(''), []);
  });

  it('resolveKycTjansterToCatalogIds mappar KYC-namn till aktiva katalog-id', () => {
    const result = sync.resolveKycTjansterToCatalogIds({
      kycTjanster: 'Löpande bokföring, BOKSLUT, Moms, Okänd tjänst',
      catalog: CATALOG
    });
    assert.deepEqual(result.linkedIds.sort(), ['recBokslut01', 'recLopande01', 'recMoms00001'].sort());
    assert.deepEqual(result.matchedNamn.sort(), ['Bokslut', 'Löpande bokföring', 'Momsredovisning'].sort());
    assert.ok(result.unmatched.includes('Okänd tjänst'));
  });

  it('ignorerar inaktiva katalogposter', () => {
    const result = sync.resolveKycTjansterToCatalogIds({
      kycTjanster: 'Gammal tjänst, Bokslut',
      catalog: CATALOG
    });
    assert.deepEqual(result.linkedIds, ['recBokslut01']);
  });

  it('linkedIdsChanged detekterar skillnad oberoende av ordning', () => {
    assert.equal(sync.linkedIdsChanged(['a', 'b'], ['b', 'a']), false);
    assert.equal(sync.linkedIdsChanged(['a'], ['a', 'b']), true);
    assert.equal(sync.linkedIdsChanged([], []), false);
  });

  it('tom KYC-lista ger tomma länkar (rensar riskbedömningens tjänster)', () => {
    const result = sync.resolveKycTjansterToCatalogIds({
      kycTjanster: '  ',
      catalog: CATALOG
    });
    assert.deepEqual(result.linkedIds, []);
    assert.deepEqual(result.labels, []);
  });

  it('sanitize inkluderar case/alias via TjanstKatalog', () => {
    const ids = TjanstKatalog.sanitizeToActiveCatalogIds(
      ['moms', 'bokslut'],
      TjanstKatalog.catalogFromRecords(CATALOG)
    );
    assert.deepEqual(ids.sort(), ['recBokslut01', 'recMoms00001'].sort());
  });
});
