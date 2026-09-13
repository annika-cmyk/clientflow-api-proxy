const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const JS = fs.readFileSync(path.join(__dirname, '../public/js/ovriga-riskfaktorer.js'), 'utf8');
const ENKAT = fs.readFileSync(path.join(__dirname, '../public/js/kundrisker-enkat-sammanfattning.js'), 'utf8');

describe('ovriga AI-förslag reset', () => {
  it('rensar inline AI-förslag vid open/close av add- och edit-modal', () => {
    assert.match(JS, /clearOvrigInlineAi\(modalId\)/);
    assert.match(JS, /\.field-ai-forslag/);
    assert.match(JS, /AiFaltGranskning\.hideReview\(document\.getElementById\('add-ai-review'\)\)/);
    assert.match(JS, /this\._lastAiAudit = null/);

    const openAdd = JS.slice(JS.indexOf('openAddModal(prefill)'), JS.indexOf('closeModal(modalId)'));
    assert.match(openAdd, /this\.bumpAiSuggestionEpoch\(\)/);
    assert.match(openAdd, /this\.clearOvrigInlineAi\('add-risk-modal'\)/);
    assert.ok(
      openAdd.indexOf('clearOvrigInlineAi') < openAdd.indexOf("getElementById('add-risk-form')"),
      'AI-förslag ska rensas innan formuläret fylls/öppnas'
    );

    const close = JS.slice(JS.indexOf('closeModal(modalId)'), JS.indexOf('async openEditModal'));
    assert.match(close, /this\.bumpAiSuggestionEpoch\(\)/);
    assert.match(close, /this\.clearOvrigInlineAi\(modalId\)/);

    const openEdit = JS.slice(JS.indexOf('async openEditModal(recordId)'), JS.indexOf('async handleAddRisk'));
    assert.match(openEdit, /this\.bumpAiSuggestionEpoch\(\)/);
    assert.match(openEdit, /this\.clearOvrigInlineAi\('edit-risk-modal'\)/);
  });

  it('ignorerar in-flight AI-svar när epoch ändrats (ny riskfaktor)', () => {
    assert.match(JS, /bumpAiSuggestionEpoch\(\)/);
    const gen = JS.slice(JS.indexOf('async generateAiSuggestion(mode)'), JS.indexOf('setRiskTab(modalId, tabId)'));
    assert.match(gen, /const requestEpoch = this\.bumpAiSuggestionEpoch\(\)/);
    assert.match(gen, /if \(requestEpoch !== this\._aiSuggestionEpoch\) return;/);
    // Måste kolla både före apply och i finally så knappen inte återaktiveras fel.
    const checks = gen.match(/requestEpoch !== this\._aiSuggestionEpoch/g) || [];
    assert.ok(checks.length >= 3, `förväntade minst 3 epoch-guards, fick ${checks.length}`);
  });

  it('köad analys från byråprofilen öppnar nästa via openAddModal (som nu rensar AI)', () => {
    assert.match(ENKAT, /rm\.openAddModal\(list\[0\]\)/);
    assert.match(ENKAT, /rm\.openAddModal\(next\)/);
    assert.match(ENKAT, /state\.pendingPrefills/);
  });
});
