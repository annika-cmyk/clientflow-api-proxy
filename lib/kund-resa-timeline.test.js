'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Timeline = require('./kund-resa-timeline');

describe('kund-resa-timeline', () => {
  it('visar Fortsätt till riskbedömning när KYC är besvarat', () => {
    const t = Timeline.buildTimeline({
      fields: {},
      kyc: { status: 'Besvarat av kund', customerAnsweredAt: '2026-10-20' },
      kundresa: { steps: [{ status: 'done' }, { status: 'done' }, { status: 'done' }, { status: 'done' }] }
    });
    assert.equal(t.canOpenRisk, true);
    assert.equal(t.currentId, 'risk');
    assert.match(t.riskBridgeLabel, /Fortsätt till riskbedömning/);
    assert.match(t.chainSentence, /Kunden lämnar uppgifter/);
  });

  it('väntar på kund efter skickat KYC', () => {
    const t = Timeline.buildTimeline({
      kyc: { status: 'Skickat för ifyllnad', inviteSentAt: '2026-10-19' },
      kundresa: { steps: [{ done: true }, { done: true }, { done: true }, { done: true }] }
    });
    assert.equal(t.currentId, 'vantar');
    assert.equal(t.canOpenRisk, false);
  });

  it('går till avtal när risk är godkänd', () => {
    const t = Timeline.buildTimeline({
      fields: {
        Riskniva: 'Normal',
        'Kundens riskbedömning godkänd': '2026-10-21'
      },
      kyc: { status: 'Signerat', signeringsdatum: '2026-10-20' }
    });
    assert.equal(t.currentId, 'avtal');
    assert.equal(t.riskOk, true);
  });
});
