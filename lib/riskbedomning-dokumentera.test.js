const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { canDokumentera } = require('./riskbedomning-dokumentera');

describe('riskbedomning-dokumentera', () => {
  it('kräver residual och motivering', () => {
    const r = canDokumentera({});
    assert.equal(r.ok, false);
    assert.ok(r.missing.some((m) => /residual/i.test(m)));
    assert.ok(r.missing.some((m) => /Motivering/i.test(m)));
  });

  it('godkänner komplett låg residual utan riskaptit', () => {
    const r = canDokumentera({
      Riskniva: 'Låg',
      'Byrans riskbedomning': 'Kunden har enkel verksamhet och god ordning i underlagen.'
    }, { dimensionStatus: { komplett: true } });
    assert.equal(r.ok, true);
  });

  it('kräver riskaptitbeslut vid Hög', () => {
    const r = canDokumentera({
      Riskniva: 'Hög',
      'Byrans riskbedomning': 'Kunden har förhöjd residual och kräver beslut om riskaptit.'
    }, { dimensionStatus: { komplett: true } });
    assert.equal(r.ok, false);
    assert.ok(r.missing.some((m) => /riskaptit/i.test(m)));
  });

  it('kräver avvikelsemotivering när residual ≠ beräknad', () => {
    const r = canDokumentera({
      Riskniva: 'Låg',
      'Kund föreslagen nivå': 'Normal',
      'Byrans riskbedomning': 'Vi bedömer lägre residual än beräknat utifrån lång relation.'
    }, { dimensionStatus: { komplett: true } });
    assert.equal(r.ok, false);
    assert.ok(r.missing.some((m) => /avvikelse/i.test(m)));
  });
});
