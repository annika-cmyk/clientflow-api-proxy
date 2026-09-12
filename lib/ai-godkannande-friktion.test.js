'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Friktion = require('./ai-godkannande-friktion');

describe('ai-godkannande-friktion', () => {
  it('låter lågrisk passera utan redigering', () => {
    const r = Friktion.assessAiAcceptFriction({
      riskLevel: 'Normal',
      aiOriginalText: 'AI text utan ändring.',
      currentText: 'AI text utan ändring.'
    });
    assert.equal(r.allowed, true);
    assert.equal(r.friction, 'none');
    assert.equal(r.highRisk, false);
  });

  it('blockerar högrisk utan redigering eller tillägg', () => {
    const text = 'Detta är ett AI-förslag om residualrisk för betalningsuppdrag.';
    const r = Friktion.assessAiAcceptFriction({
      riskLevel: 'Hög',
      aiOriginalText: text,
      currentText: text
    });
    assert.equal(r.allowed, false);
    assert.equal(r.code, 'ai_hogrisk_redigering_kravs');
    assert.equal(r.friction, 'edit_required');
  });

  it('godkänner högrisk när tilläggskommentar finns', () => {
    const text = 'Detta är ett AI-förslag om residualrisk för betalningsuppdrag.';
    const r = Friktion.assessAiAcceptFriction({
      riskLevel: 'Oacceptabel',
      aiOriginalText: text,
      currentText: text,
      tillagg: 'Vi har lagt till egen kontroll: tvåpersonsgodkännande före utbetalning.'
    });
    assert.equal(r.allowed, true);
    assert.equal(r.highRisk, true);
  });

  it('godkänner högrisk när texten ändrats tillräckligt', () => {
    const original = 'AI föreslår bred övervakning av alla betalningar utan särskild kontroll.';
    const edited = 'Vi behåller callback till känd kontakt och tvåpersonsgodkännande före ny mottagare, inte bred övervakning.';
    const r = Friktion.assessAiAcceptFriction({
      riskLevel: 'Hög',
      aiOriginalText: original,
      currentText: edited
    });
    assert.equal(r.allowed, true);
    assert.ok(r.diffPercent >= Friktion.DEFAULT_DIFF_THRESHOLD);
  });

  it('förbjuder bulk över flera tjänster i v1', () => {
    assert.equal(Friktion.canBulkAcceptAcrossServices(), false);
    const ok = Friktion.assertBulkWithinSingleService(['rec1']);
    assert.equal(ok.ok, true);
    const bad = Friktion.assertBulkWithinSingleService(['rec1', 'rec2']);
    assert.equal(bad.ok, false);
    assert.equal(bad.code, 'ai_bulk_over_tjanster_ej_tillatet');
  });
});

describe('ai-godkannande-friktion wiring', () => {
  it('läggs in i tjänste- och riskfaktorsidorna', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const byraHtml = fs.readFileSync(path.join(__dirname, '../public/riskbedomning-byra.html'), 'utf8');
    const ovrHtml = fs.readFileSync(path.join(__dirname, '../public/ovriga-riskfaktorer.html'), 'utf8');
    const byraJs = fs.readFileSync(path.join(__dirname, '../public/js/riskbedomning-byra.v5.js'), 'utf8');
    assert.match(byraHtml, /ai-godkannande-friktion\.js/);
    assert.match(ovrHtml, /ai-godkannande-friktion\.js/);
    assert.match(byraJs, /gateAiAccept/);
    assert.match(byraJs, /AiGodkannandeFriktion/);
  });
});
