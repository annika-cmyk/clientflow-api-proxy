'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Gate = require('./avtal-risk-gate');

describe('avtal-risk-gate', () => {
  it('blockerar utan risk', () => {
    const g = Gate.canSendUppdragsavtal({});
    assert.equal(g.allowed, false);
    assert.equal(g.code, 'missing_risk');
    assert.match(g.reason, /riskbedömningen/i);
  });

  it('blockerar när Riskniva finns men ej godkänd', () => {
    const g = Gate.canSendUppdragsavtal({ Riskniva: 'Normal' });
    assert.equal(g.allowed, false);
    assert.equal(g.code, 'not_approved');
  });

  it('tillåter när risk är godkänd', () => {
    const g = Gate.canSendUppdragsavtal({
      Riskniva: 'Normal',
      'Kundens riskbedömning godkänd': '2026-10-21'
    });
    assert.equal(g.allowed, true);
  });
});
