const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const JS = fs.readFileSync(path.join(__dirname, '../public/js/ovriga-riskfaktorer.js'), 'utf8');
const ENKAT = fs.readFileSync(path.join(__dirname, '../public/js/kundrisker-enkat-sammanfattning.js'), 'utf8');
const KUND = fs.readFileSync(path.join(__dirname, '../public/kundrisker-mm.html'), 'utf8');
const OVRIGA = fs.readFileSync(path.join(__dirname, '../public/ovriga-riskfaktorer.html'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');

describe('riskfaktor analys spara/hitta', () => {
  it('validerar obligatoriska fält med flikbyte i stället för tyst HTML5-fail', () => {
    assert.match(JS, /validateRiskFormBeforeSave\(mode = 'add'\)/);
    assert.match(JS, /label: 'Riskreducerande åtgärder'/);
    assert.match(JS, /setRiskTab\(modalId, check\.tab\)/);
    assert.match(KUND, /id="add-risk-form"[^>]*novalidate/);
    assert.match(KUND, /id="edit-risk-form"[^>]*novalidate/);
    assert.match(OVRIGA, /id="add-risk-form"[^>]*novalidate/);
    assert.match(OVRIGA, /id="edit-risk-form"[^>]*novalidate/);
  });

  it('fyller tomma fält vid AI-reviewMode (byråprofil-prefill)', () => {
    const gen = JS.slice(JS.indexOf('async generateAiSuggestion(mode)'), JS.indexOf('setRiskTab(modalId, tabId)'));
    assert.match(gen, /if \(reviewMode\)[\s\S]*?applyOvrigAiIfEmpty\(prefix, befintligt, data\)/);
  });

  it('efter lyckad sparning: revealSavedRisk + tydlig toast', () => {
    assert.match(JS, /revealSavedRisk\(/);
    assert.match(JS, /risk-item--just-saved/);
    assert.match(JS, /Analysen är sparad/);
    assert.match(JS, /under Kundkategorier och geografi/);
    assert.match(JS, /refreshKundriskerEnkatAfterSave/);
    assert.match(CSS, /\.risk-item--just-saved/);
  });

  it('Från byråprofilen kan refreshas efter sparning', () => {
    assert.match(ENKAT, /function refresh\(\)/);
    assert.match(ENKAT, /refresh: refresh/);
    assert.match(KUND, /kundrisker-enkat-sammanfattning\.js\?v=5/);
    assert.match(KUND, /ovriga-riskfaktorer\.js\?v=48/);
  });
});
