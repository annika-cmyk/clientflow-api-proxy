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
  it('använder tydliga etiketter utan dubbel inneboende-risk-rubrik', () => {
    assert.equal(TJANST_BESKRIVNING_LABEL, 'Tjänsten');
    assert.equal(OVRIG_BESKRIVNING_LABEL, 'Beskrivning');
    assert.doesNotMatch(TJANST_BESKRIVNING_LABEL, /inneboende risk/);
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
    assert.match(TJANST_BESKRIVNING_HINT, /Nämn INTE kontroller/);
    assert.match(TJANST_BESKRIVNING_HINT, /bekräftade fakta/);
    assert.match(OVRIG_BESKRIVNING_HINT, /nämn INTE byrån/);
  });

  it('namn- och inneboende-blocket ligger på rätt flikar och flikarna scrollar', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/riskbedomning-byra.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
    const oversikt = html.match(/data-tjanst-panel="oversikt"[\s\S]*?<\/section>/);
    const utforande = html.match(/data-tjanst-panel="utforande"[\s\S]*?<\/section>/);
    const inneboende = html.match(/data-tjanst-panel="inneboende"[\s\S]*?<\/section>/);
    const atgard = html.match(/data-tjanst-panel="atgard"[\s\S]*?<\/section>/);
    const residual = html.match(/data-tjanst-panel="residual"[\s\S]*?<\/section>/);
    assert.ok(oversikt, 'översiktspanelen saknas');
    assert.ok(utforande, 'utförandepanelen saknas');
    assert.ok(inneboende, 'inneboende-panelen saknas');
    assert.match(oversikt[0], /id="tjanst-beskrivning"/);
    assert.doesNotMatch(oversikt[0], /tjanst-modal-utforande/);
    assert.doesNotMatch(oversikt[0], /ai-suggest-btn/);
    assert.match(utforande[0], /tjanst-modal-utforande/);
    assert.match(utforande[0], /id="ai-suggest-btn"/);
    assert.match(utforande[0], /Generera AI-analys/);
    assert.doesNotMatch(oversikt[0], /tjanst-modal-identity/);
    assert.match(inneboende[0], /tjanst-modal-identity/);
    assert.match(inneboende[0], /tjanst-motivering-inneboende/);
    assert.doesNotMatch(oversikt[0], /id="tjanst-name"/);
    const beforeTabs = html.slice(0, html.indexOf('class="tjanst-tabs"'));
    assert.match(beforeTabs, /id="tjanst-name"/);
    assert.doesNotMatch(beforeTabs, /tjanst-modal-identity/);
    assert.match(css, /\.tjanst-tabs\s*\{[^}]*overflow-x:\s*auto/);
    assert.match(css, /\.tjanst-panel-scroll\s*\{[^}]*overflow-y:\s*auto/);
    assert.match(css, /calc\(100dvh - 0\.75rem\)/);
    assert.match(html, /class="tjanst-panel-scroll"/);
    assert.ok(atgard, 'åtgärdspanelen saknas');
    assert.ok(residual, 'residualpanelen saknas');
    assert.match(atgard[0], /tjanst-panel-scroll[\s\S]*id="atgard-list"/);
    assert.doesNotMatch(atgard[0], /tjanst-residual-bar/);
    assert.match(residual[0], /tjanst-residual-bar[\s\S]*tjanst-motivering-residual/);
  });

  it('tjänstesidan använder sid-specifik typografi', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/riskbedomning-byra.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
    assert.match(html, /class="riskbedomning-byra-page"/);
    assert.match(css, /body\.riskbedomning-byra-page[\s\S]*font-family:\s*var\(--body-font\)/);
    assert.match(css, /\.content-header\.risk-header p[\s\S]*font-family:\s*var\(--body-font\)/);
    assert.match(css, /\.risk-list-header h3\s*\{[^}]*text-transform:\s*none/);
    assert.doesNotMatch(css, /\.risk-list-header h3\s*\{[^}]*text-transform:\s*uppercase/);
  });

  it('tjänstesidan separerar vägledning, inneboende risk och residual', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/riskbedomning-byra.html'), 'utf8');
    assert.match(html, /Vägledning: Riskbedömning av byråns tjänster/);
    assert.match(html, /Separation av risk och åtgärd/);
    assert.match(html, /Terrorfinansiering \(TF\)/);
    assert.match(html, /data-tjanst-panel="inneboende"[\s\S]*tjanst-motivering-inneboende/);
    assert.match(html, /data-tjanst-panel="residual"[\s\S]*tjanst-motivering-residual/);
    assert.doesNotMatch(html, /tjanst-tf-motivering/);
  });

  it('övriga riskfaktorer håller isär inneboende risk, residual och TF', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/ovriga-riskfaktorer.html'), 'utf8');
    assert.match(html, /Övriga riskfaktorer/);
    assert.match(html, /Skriv risk och åtgärd i rätt ordning/);
    assert.match(html, /risk-begrepp-card[\s\S]*Inneboende risk[\s\S]*risk-begrepp-card[\s\S]*Residualrisk/);
    assert.match(html, /Kom ihåg finansiering av terrorism \(TF\) i varje dimension/);
    assert.match(html, /ingen dokumenterad effekt/);
  });
});
