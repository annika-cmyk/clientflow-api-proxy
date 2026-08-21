const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  AVVIKELSE_STATUS,
  CANONICAL_FM_STATUS,
  canonicalizeAvvikelseStatus,
  assertAvvikelseStatus,
  needsStatusMigration
} = require('./avvikelse-status');

describe('avvikelse-status', () => {
  it('normaliserar legacy FM-värdet till det kanoniska', () => {
    assert.equal(canonicalizeAvvikelseStatus('Rapporterad till FM'), CANONICAL_FM_STATUS);
    assert.equal(canonicalizeAvvikelseStatus('  Rapporterad till FM  '), CANONICAL_FM_STATUS);
    assert.equal(canonicalizeAvvikelseStatus(CANONICAL_FM_STATUS), CANONICAL_FM_STATUS);
    assert.equal(needsStatusMigration('Rapporterad till FM'), true);
    assert.equal(needsStatusMigration(CANONICAL_FM_STATUS), false);
    assert.equal(needsStatusMigration('Öppen'), false);
  });

  it('accepterar bara den stängda enum-listan', () => {
    assert.deepEqual(AVVIKELSE_STATUS, [
      'Öppen',
      'Under utredning',
      'Rapporterad till Finanspolisen (FM)',
      'Avslutad'
    ]);
    assert.equal(assertAvvikelseStatus('Öppen'), 'Öppen');
    assert.throws(() => assertAvvikelseStatus('Skickad till FM'), /Ogiltig avvikelsestatus/);
    assert.throws(() => assertAvvikelseStatus(''), /Ogiltig avvikelsestatus/);
  });
});
