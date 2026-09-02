const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const kundkort = fs.readFileSync(path.join(__dirname, '../public/js/kundkort.js'), 'utf8');

describe('räkenskapsår på kundkortet', () => {
  it('är en dropdown med kalenderår och brutna månadsskiften', () => {
    assert.match(kundkort, /const KUND_RAKENSKAPSAR_VAL/);
    assert.match(kundkort, /'kalenderår'/);
    assert.match(kundkort, /'feb-mars'/);
    assert.match(kundkort, /'mars-april'/);
    assert.match(kundkort, /'april-maj'/);
    assert.match(kundkort, /'dec-jan'/);
    assert.match(kundkort, /<select id="redov-rakenskapsår-input"/);
    assert.doesNotMatch(kundkort, /placeholder="t\.ex\. 0101-1231/);
  });
});
