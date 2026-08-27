'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REDOVISNINGSBYRA_AI_RULES } = require('./redovisningsbyra-ai-kontext');

describe('redovisningsbyra-ai-kontext', () => {
  it('tydliggör redovisningsbyrå och förbjuder bankperspektiv', () => {
    assert.match(REDOVISNINGSBYRA_AI_RULES, /redovisningsbyrå/);
    assert.match(REDOVISNINGSBYRA_AI_RULES, /INTE bank/);
    assert.match(REDOVISNINGSBYRA_AI_RULES, /Transaktionsmonitorering/);
    assert.match(REDOVISNINGSBYRA_AI_RULES, /bokföring/);
    assert.match(REDOVISNINGSBYRA_AI_RULES, /redovisningshandlingar/);
  });

  it('index.js injicerar reglerna i AI-endpoints', () => {
    const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    assert.match(index, /redovisningsbyra-ai-kontext/);
    assert.match(index, /REDOVISNINGSBYRA_AI_RULES/);
    const tjanstChunk = index.slice(index.indexOf("app.post('/api/ai-byra-tjanst'"));
    const ovrigChunk = index.slice(index.indexOf("app.post('/api/ai-ovriga-riskfaktor'"));
    assert.match(tjanstChunk, /REDOVISNINGSBYRA_AI_RULES/);
    assert.match(ovrigChunk, /REDOVISNINGSBYRA_AI_RULES/);
  });
});
