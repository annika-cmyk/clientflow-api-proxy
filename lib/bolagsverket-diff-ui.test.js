const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('bolagsverket uppdatera-popup', () => {
  it('har alla förändringar ibockade som default', () => {
    const src = fs.readFileSync(path.join(__dirname, '../public/js/kundkort.js'), 'utf8');
    const match = src.match(/class="bv-diff-cb"[^>]*>/);
    assert.ok(match, 'hittar checkbox för Bolagsverket-diff');
    assert.match(match[0], /\bchecked\b/);
  });
});
