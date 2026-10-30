'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Gate = require('./avtal-risk-gate');
const RiskBeslut = require('./risk-beslut');

describe('avtal-risk-gate', () => {
  it('släpper igenom när Riskbeslut status === Godkänd', () => {
    const r = Gate.canSendUppdragsavtal({
      [RiskBeslut.FIELD_STATUS]: RiskBeslut.STATUS.APPROVED,
      Riskniva: 'Låg'
    });
    assert.equal(r.allowed, true);
  });

  it('blockerar bedömd men ogodkänd residual', () => {
    const r = Gate.canSendUppdragsavtal({ Riskniva: 'Normal' });
    assert.equal(r.allowed, false);
    assert.equal(r.code, 'not_approved');
  });

  it('accepterar legacy-godkännande innan migrering', () => {
    const r = Gate.canSendUppdragsavtal({
      Riskniva: 'Normal',
      'Kundens riskbedömning godkänd': '2026-10-01'
    });
    assert.equal(r.allowed, true);
  });
});
