const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  matchFactor,
  mergeLinkedIds,
  linkedIdsChanged,
  utsattStatLabel,
  aggregateUtsattStat,
  recordMatchesUtsattStat,
  STAT_LABELS
} = require('./utsatt-omrade-styrning');

const geoRecs = [
  { id: 'recGeoUtsatt01', fields: { Riskfaktor: 'Särskilt utsatt område i Sverige', 'Typ av riskfaktor': 'Geografiska riskfaktorer' } },
  { id: 'recGeoNar01', fields: { Riskfaktor: 'Närområde', 'Typ av riskfaktor': 'Geografiska riskfaktorer' } }
];

describe('utsatt-omrade-styrning', () => {
  it('matchar riskfaktor på namn', () => {
    assert.ok(matchFactor('Särskilt utsatt område i Sverige'));
    assert.ok(matchFactor('Polisens utsatta områden'));
    assert.equal(matchFactor('Närområde'), null);
  });

  it('lägger till steered id vid träff', () => {
    const stored = { trff: true, niva: 'Särskilt utsatt område', kontrolleradAt: '2026-01-01' };
    const next = mergeLinkedIds(['recGeoNar01'], geoRecs, stored);
    assert.deepEqual(next.sort(), ['recGeoNar01', 'recGeoUtsatt01'].sort());
  });

  it('tar bort steered id när träff försvinner', () => {
    const stored = { trff: false, kontrolleradAt: '2026-01-01' };
    const next = mergeLinkedIds(['recGeoUtsatt01', 'recGeoNar01'], geoRecs, stored);
    assert.deepEqual(next, ['recGeoNar01']);
  });

  it('linkedIdsChanged upptäcker skillnad', () => {
    assert.equal(linkedIdsChanged(['a'], ['a']), false);
    assert.equal(linkedIdsChanged(['a'], ['a', 'b']), true);
  });

  it('aggregateUtsattStat räknar kategorier', () => {
    const stat = aggregateUtsattStat([
      { fields: { 'Utsatt område (JSON)': JSON.stringify({ trff: true, niva: 'Särskilt utsatt område', kontrolleradAt: 'x' }) } },
      { fields: { 'Utsatt område (JSON)': JSON.stringify({ trff: false, kontrolleradAt: 'x' }) } },
      { fields: {} }
    ]);
    assert.equal(stat.antalKontrollerade, 2);
    assert.equal(stat.antalTrff, 1);
    assert.equal(stat.antalEjKontrollerade, 1);
    assert.ok(stat.rader.some((r) => r.namn === STAT_LABELS.SEU));
  });

  it('recordMatchesUtsattStat filtrerar på etikett', () => {
    const fields = { 'Utsatt område (JSON)': JSON.stringify({ trff: false, kontrolleradAt: 'x' }) };
    assert.equal(recordMatchesUtsattStat(fields, STAT_LABELS.EJ_TRFF), true);
    assert.equal(recordMatchesUtsattStat(fields, STAT_LABELS.SEU), false);
  });
});
