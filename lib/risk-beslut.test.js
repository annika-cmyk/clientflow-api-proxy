'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RiskBeslut = require('./risk-beslut');

describe('risk-beslut', () => {
  it('computeStepStatuses: tom kund → steg 1 klart (inget att granska), steg 2 current, avtal låst', () => {
    const r = RiskBeslut.computeStepStatuses({ fields: {} });
    assert.equal(r.steps[0].state, 'done');
    assert.equal(r.steps[1].state, 'current');
    assert.equal(r.steps[3].locked, true);
    assert.equal(r.canOpenAvtal, false);
    assert.equal(r.decision.status, RiskBeslut.STATUS.DRAFT);
    assert.match(r.remainingFooter || r.steps[1].label, /kvar|bedömd|motivering/i);
  });

  it('computeStepStatuses: bedömning klar → steg 3 current', () => {
    const r = RiskBeslut.computeStepStatuses({
      fields: {
        Riskniva: 'Låg',
        'Byrans riskbedomning': 'OK motivering',
        'Byrån har': [
          'Kapacitet att ta emot kunden',
          'Kundkännedom har uppnåtts',
          'Kunden bedöms som seriös',
          'Kunskap nog att hjälpa kunden'
        ]
      }
    });
    assert.equal(r.step1Done, true);
    assert.equal(r.step2Done, true);
    assert.equal(r.steps[2].state, 'current');
    assert.match(r.steps[2].label, /Redo/);
  });

  it('computeStepStatuses: godkänd låser upp avtal', () => {
    const r = RiskBeslut.computeStepStatuses({
      fields: { [RiskBeslut.FIELD_STATUS]: RiskBeslut.STATUS.APPROVED }
    });
    assert.equal(r.canOpenAvtal, true);
    assert.equal(r.steps[3].locked, false);
    assert.equal(r.steps[2].state, 'done');
  });

  it('legacyApproved + isApproved under migrering', () => {
    const fields = {
      'Kundens riskbedömning godkänd': '2026-10-01',
      Riskniva: 'Normal'
    };
    assert.equal(RiskBeslut.legacyApproved(fields), true);
    assert.equal(RiskBeslut.isApproved(fields), true);
    const patch = RiskBeslut.migrationPatchForCustomer(fields);
    assert.equal(patch.needed, true);
    assert.equal(patch.fields[RiskBeslut.FIELD_STATUS], RiskBeslut.STATUS.APPROVED);
    assert.equal(patch.fields[RiskBeslut.FIELD_VERSION], 1);
    const log = RiskBeslut.parseLog(patch.fields[RiskBeslut.FIELD_LOG]);
    assert.equal(log[0].event, 'Migrerad från tidigare godkännande');
    assert.equal(log[0].userName, 'okänd');
  });

  it('migration är idempotent när status redan finns', () => {
    const patch = RiskBeslut.migrationPatchForCustomer({
      [RiskBeslut.FIELD_STATUS]: RiskBeslut.STATUS.APPROVED,
      'Kundens riskbedömning godkänd': '2026-10-01'
    });
    assert.equal(patch.needed, false);
  });

  it('appendLog är append-only', () => {
    const a = RiskBeslut.appendLog('[]', { event: 'Skickad', userName: 'A' });
    const b = RiskBeslut.appendLog(a, { event: 'Godkänd', userName: 'B' });
    const list = RiskBeslut.parseLog(b);
    assert.equal(list.length, 2);
    assert.equal(list[0].event, 'Skickad');
    assert.equal(list[1].event, 'Godkänd');
  });

  it('canApproveRisk: Ledare default på, Anställd av, CFA aldrig', () => {
    assert.equal(RiskBeslut.canApproveRisk({ role: 'Ledare' }), true);
    assert.equal(RiskBeslut.canApproveRisk({ role: 'Anställd' }), false);
    assert.equal(RiskBeslut.canApproveRisk({ role: 'ClientFlowAdmin' }), false);
    assert.equal(RiskBeslut.canApproveRisk({ role: 'Anställd', canApproveRisk: true }), true);
    assert.equal(RiskBeslut.canApproveRisk({ role: 'Ledare', canApproveRisk: false }), false);
    assert.equal(RiskBeslut.canApproveRisk({ role: 'ClientFlowAdmin', canApproveRisk: true }), false);
  });

  it('allowSelfReview respekterar byråinställning + residualnivå', () => {
    assert.equal(RiskBeslut.allowSelfReview({ requireOtherApprover: 'Aldrig' }, 'Hög'), true);
    assert.equal(RiskBeslut.allowSelfReview({ requireOtherApprover: 'Alltid' }, 'Låg'), false);
    assert.equal(
      RiskBeslut.allowSelfReview({ requireOtherApprover: 'Vid Hög och Oacceptabel' }, 'Låg'),
      true
    );
    assert.equal(
      RiskBeslut.allowSelfReview({ requireOtherApprover: 'Vid Hög och Oacceptabel' }, 'Hög'),
      false
    );
  });

  it('browser twin speglar lib-API', () => {
    const browser = fs.readFileSync(path.join(__dirname, '../public/js/risk-beslut.js'), 'utf8');
    assert.match(browser, /computeStepStatuses/);
    assert.match(browser, /canApproveRisk/);
    assert.match(browser, /allowSelfReview/);
    assert.match(browser, /migrationPatchForCustomer/);
    assert.match(browser, /Får godkänna riskbedömning/);
  });

  it('popup-skalet speglar kundresa-layout', () => {
    const modal = fs.readFileSync(path.join(__dirname, '../public/js/risk-avtal-modal.js'), 'utf8');
    assert.match(modal, /kundresa-popup-layout/);
    assert.match(modal, /tjanst-tabs/);
    assert.match(modal, /kundresa-step-remaining|Kvar:/);
    assert.match(modal, /risk-avtal-step-host/);
    assert.match(modal, /buildSummary/);
    assert.match(modal, /computeStepStatuses/);
  });
});
