const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { FIELD, todayIso, formatLabel } = require('./bolagsverket-kund');

describe('bolagsverket-kund', () => {
  it('exponerar fältnamn och dagens datum', () => {
    assert.equal(FIELD, 'Bolagsverket uppdaterad');
    assert.match(todayIso(), /^\d{4}-\d{2}-\d{2}$/);
  });

  it('formatLabel visar svenskt datum', () => {
    assert.equal(formatLabel('2026-08-27'), '2026-08-27');
  });
});
