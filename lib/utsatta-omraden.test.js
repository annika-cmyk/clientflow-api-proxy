const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  getIndex,
  matchPoint,
  checkAddress,
  summaryLabel,
  parseAddressText,
  NIVA_SEU
} = require('./utsatta-omraden');

describe('utsatta-omraden', () => {
  it('laddar Polisens geojson med utsatta och särskilt utsatta områden', () => {
    const index = getIndex();
    assert.ok(index.featureCount >= 60);
    assert.ok(index.areas.length >= index.featureCount);
    const seu = index.areas.filter((a) => a.meta.kategori === NIVA_SEU);
    assert.ok(seu.length >= 15);
  });

  it('matchar koordinater i Fittja som särskilt utsatt område', () => {
    const res = matchPoint(59.2467926, 17.8606706);
    assert.equal(res.trff, true);
    assert.equal(res.niva, NIVA_SEU);
    assert.match(res.omrade || '', /Fittja/i);
  });

  it('returnerar ingen träff utanför kända områden', () => {
    const res = matchPoint(59.3293, 18.0686);
    assert.equal(res.trff, false);
  });

  it('parsar adress med postnummer', () => {
    const p = parseAddressText('Storgatan 1, 145 60 Fittja');
    assert.equal(p.postnummer, '145 60');
    assert.match(p.postort, /Fittja/i);
  });

  it('kan geocodea adress och matcha område (integration)', async () => {
    const res = await checkAddress('145 51 Fittja');
    assert.equal(res.geocoding.ok, true);
    assert.equal(res.trff, true);
    assert.ok(summaryLabel(res));
  });
});
