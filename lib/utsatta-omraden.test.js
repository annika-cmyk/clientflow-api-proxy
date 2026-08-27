const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  getIndex,
  matchPoint,
  checkAddress,
  summaryLabel,
  parseAddressText,
  buildGeocodeFallbackQueries,
  geocodeAddress,
  PRECISION_APPROXIMATE,
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
    assert.equal(p.streetPart, 'Storgatan 1');
  });

  it('bygger fallback-frågor för landsbygdsadress', () => {
    const fallbacks = buildGeocodeFallbackQueries('ULFSRYD NORREGÅRD 17, 36291, TINGSRYD');
    assert.ok(fallbacks.some((q) => /Ulfsryd,\s*Tingsryd,\s*Sverige/i.test(q)));
    assert.ok(fallbacks.some((q) => /362 91 Tingsryd,\s*Sverige/i.test(q)));
    assert.ok(fallbacks.some((q) => /36291,\s*Tingsryd,\s*Sverige/i.test(q)));
  });

  it('bygger postnummer-fallback för gårdsadress utan ortnamn i gatu-del', () => {
    const fallbacks = buildGeocodeFallbackQueries('SIMONTORP 1175, 28994, GLIMÅKRA');
    assert.ok(fallbacks.some((q) => /28994,\s*Glimåkra,\s*Sverige/i.test(q)));
    assert.ok(fallbacks.some((q) => /Glimåkra,\s*Sverige/i.test(q)));
  });

  it('använder fallback-geokodning när exakt adress saknas', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      const empty = { ok: true, json: async () => [] };
      if (calls.length === 1) return empty;
      return {
        ok: true,
        json: async () => [{
          lat: '56.5064482',
          lon: '14.8977478',
          display_name: 'Ulfsryd, Tingsryds kommun, Sverige'
        }]
      };
    };
    const res = await geocodeAddress('ULFSRYD NORREGÅRD 17, 36291, TINGSRYD', {
      fetchImpl,
      delayMs: 0
    });
    assert.equal(res.ok, true);
    assert.equal(res.precision, PRECISION_APPROXIMATE);
    assert.equal(res.source, 'nominatim_approximate');
    assert.match(res.fallbackQuery, /Ulfsryd,\s*Tingsryd/i);
    assert.equal(calls.length, 2);
  });

  it('kan geocodea adress och matcha område (integration)', async () => {
    const res = await checkAddress('145 51 Fittja');
    assert.equal(res.geocoding.ok, true);
    assert.equal(res.trff, true);
    assert.ok(summaryLabel(res));
  });

  it('kan geocodea landsbygdsadress via fallback (integration)', async () => {
    const res = await checkAddress('ULFSRYD NORREGÅRD 17, 36291, TINGSRYD', { delayMs: 0 });
    assert.equal(res.geocoding.ok, true);
    assert.equal(res.geocoding.precision, PRECISION_APPROXIMATE);
    assert.equal(res.trff, false);
  });

  it('kan geocodea Simontorp gårdsadress via postnummer-fallback (integration)', async () => {
    const res = await checkAddress('SIMONTORP 1175, 28994, GLIMÅKRA', { delayMs: 0 });
    assert.equal(res.geocoding.ok, true);
    assert.equal(res.geocoding.precision, PRECISION_APPROXIMATE);
    assert.match(res.geocoding.displayName || '', /Glimåkra/i);
    assert.equal(res.trff, false);
  });
});
