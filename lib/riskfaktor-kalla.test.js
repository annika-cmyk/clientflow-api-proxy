'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Kalla = require('./riskfaktor-kalla');

describe('riskfaktor-kalla', () => {
  it('mergeAddOnly lägger till suggested men tar aldrig bort manuellt länkade', () => {
    const result = Kalla.mergeAddOnly(['recManuell', 'recKont'], ['recKont', 'recKrypto'], ['recKrypto']);
    assert.deepEqual([...result.set].sort(), ['recKont', 'recKrypto', 'recManuell'].sort());
    assert.deepEqual(result.added, ['recKrypto']);
    assert.deepEqual(result.pendingRemoval, ['recKont']);
  });

  it('sourceForFactor visar Från KYC när suggested', () => {
    const src = Kalla.sourceForFactor({
      suggested: true,
      linked: true,
      factor: { id: 'kontanter', kycField: 'kontanter', label: 'Kontanter' },
      kyc: { kontanter: 'Ja' }
    });
    assert.equal(src.kind, 'kyc');
    assert.match(src.label, /Från KYC: kontanter = Ja/);
  });

  it('sourceForFactor visar Manuellt när länkad utan suggestion', () => {
    const src = Kalla.sourceForFactor({ suggested: false, linked: true, namn: 'X' });
    assert.equal(src.kind, 'manual');
    assert.equal(src.label, 'Manuellt');
  });

  it('needsReview när status är behöver_granskas', () => {
    assert.equal(Kalla.needsReview({ 'Riskprofil status': 'behöver_granskas' }), true);
    assert.equal(Kalla.needsReview({}), false);
  });
});
