const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  FIELD,
  normalizeAddressKey,
  parseStored,
  toStored,
  shouldRecheck,
  customerAddressFromFields
} = require('./utsatta-omraden-kund');

describe('utsatta-omraden-kund', () => {
  it('normaliserar adressnyckel', () => {
    assert.equal(normalizeAddressKey('  Storgatan  1 '), 'storgatan 1');
  });

  it('parseStored hanterar JSON', () => {
    const o = parseStored('{"trff":true,"omrade":"Fittja"}');
    assert.equal(o.trff, true);
    assert.equal(o.omrade, 'Fittja');
  });

  it('shouldRecheck vid ny adress eller force', () => {
    const prev = toStored({ trff: false, kontrolleradAt: '2026-01-01' }, 'Gatan 1');
    assert.equal(shouldRecheck(prev, 'Gatan 1', false), false);
    assert.equal(shouldRecheck(prev, 'Gatan 2', false), true);
    assert.equal(shouldRecheck(prev, 'Gatan 1', true), true);
  });

  it('customerAddressFromFields läser Address', () => {
    assert.equal(customerAddressFromFields({ Address: 'A' }), 'A');
    assert.equal(customerAddressFromFields({ Adress: 'B' }), 'B');
  });

  it('FIELD är Utsatt område (JSON)', () => {
    assert.equal(FIELD, 'Utsatt område (JSON)');
  });

  it('index exponerar POST /api/kunddata/:id/utsatt-omrade', () => {
    const src = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    assert.match(src, /app\.post\('\/api\/kunddata\/:id\/utsatt-omrade'/);
    assert.match(src, /utsattOmradeKund\.maybeUpdateField/);
  });
});
