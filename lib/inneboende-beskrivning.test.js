const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  TJANST_BESKRIVNING_LABEL,
  OVRIG_BESKRIVNING_LABEL,
  TJANST_BESKRIVNING_HINT,
  OVRIG_BESKRIVNING_HINT,
  INHERENT_DESCRIPTION_AI_RULES
} = require('./inneboende-beskrivning');

describe('inneboende-beskrivning', () => {
  it('använder samma mönster för tjänst och övrig riskfaktor', () => {
    assert.match(TJANST_BESKRIVNING_LABEL, /inneboende risk$/);
    assert.match(OVRIG_BESKRIVNING_LABEL, /inneboende risk$/);
    assert.match(TJANST_BESKRIVNING_HINT, /Åtgärder-fliken/);
    assert.match(OVRIG_BESKRIVNING_HINT, /Åtgärd/);
  });

  it('förbjuder åtgärdsfraser i AI-beskrivningen', () => {
    assert.match(INHERENT_DESCRIPTION_AI_RULES, /byrån säkerställer/);
    assert.match(INHERENT_DESCRIPTION_AI_RULES, /vi kontrollerar/);
    assert.match(INHERENT_DESCRIPTION_AI_RULES, /byrån har rutiner för/);
    assert.match(INHERENT_DESCRIPTION_AI_RULES, /åtgärdsfältet/);
  });

  it('förbjuder att nämna byrån i inneboende-beskrivningen', () => {
    assert.match(INHERENT_DESCRIPTION_AI_RULES, /"byrån"/);
    assert.match(INHERENT_DESCRIPTION_AI_RULES, /redovisningsbyrån/);
    assert.match(INHERENT_DESCRIPTION_AI_RULES, /begränsad kapacitet/);
    assert.match(TJANST_BESKRIVNING_HINT, /nämn INTE byrån/);
    assert.match(OVRIG_BESKRIVNING_HINT, /nämn INTE byrån/);
  });

  it('namn- och inneboende-blocket ligger bara på översiktsfliken och flikarna scrollar', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/riskbedomning-byra.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
    const oversikt = html.match(/data-tjanst-panel="oversikt"[\s\S]*?<\/section>/);
    assert.ok(oversikt, 'översiktspanelen saknas');
    assert.match(oversikt[0], /tjanst-modal-identity/);
    assert.match(oversikt[0], /id="tjanst-name"/);
    const beforeTabs = html.slice(0, html.indexOf('class="tjanst-tabs"'));
    assert.doesNotMatch(beforeTabs, /tjanst-modal-identity/);
    assert.match(css, /\.tjanst-tabs\s*\{[^}]*overflow-x:\s*auto/);
    assert.match(css, /\.tjanst-panel-scroll\s*\{[^}]*overflow-y:\s*auto/);
    assert.match(css, /calc\(100dvh - 1\.5rem\)/);
    assert.match(html, /class="tjanst-panel-scroll"/);
    const atgard = html.match(/data-tjanst-panel="atgard"[\s\S]*?<\/section>/);
    assert.ok(atgard, 'åtgärdspanelen saknas');
    assert.match(atgard[0], /tjanst-panel-scroll[\s\S]*id="atgard-list"[\s\S]*<\/div>\s*<div class="tjanst-residual-bar"/);
  });

  it('tjänstesidan håller isär inneboende risk, residual och TF', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/riskbedomning-byra.html'), 'utf8');
    assert.match(html, /Att tänka på vid riskbedömning av byråns tjänster/);
    assert.match(html, /Skriv risk och åtgärd i rätt ordning/);
    assert.match(html, /risk-begrepp-card[\s\S]*Inneboende risk[\s\S]*risk-begrepp-card[\s\S]*Residualrisk/);
    assert.match(html, /Glöm inte finansiering av terrorism \(TF\)/);
    assert.match(html, /kräver TF inget förbrott/);
    assert.doesNotMatch(html, /andra oegentligheter/);
  });

  it('övriga riskfaktorer håller isär dimensioner, residual och TF', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/ovriga-riskfaktorer.html'), 'utf8');
    assert.match(html, /Att tänka på vid riskbedömning av övriga riskfaktorer/);
    assert.match(html, /fyra dimensioner/);
    assert.match(html, /Skriv risk och åtgärd i rätt ordning/);
    assert.match(html, /risk-begrepp-card[\s\S]*Inneboende risk[\s\S]*risk-begrepp-card[\s\S]*Residualrisk/);
    assert.match(html, /Kom ihåg finansiering av terrorism \(TF\) i varje dimension/);
    assert.match(html, /ingen dokumenterad effekt/);
  });
});
