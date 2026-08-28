'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { formatOvrigRiskfaktorSubjectBlock } = require('./ai-ovrig-riskfaktor-prompt');

describe('ai-ovrig-riskfaktor-prompt', () => {
  it('låter riskfaktorns namn styra och typen vara kategori', () => {
    const block = formatOvrigRiskfaktorSubjectBlock(
      'Kundens har kunder/leverantörer i utsatta områden',
      'Geografisk riskfaktorer - här finns kundens kunder & leverantörer'
    );
    assert.match(block, /RISKFAKTOR \(huvudämne/);
    assert.match(block, /Kundens har kunder\/leverantörer i utsatta områden/);
    assert.match(block, /TYP AV RISKFAKTOR \(endast kategori/);
    assert.match(block, /utsatta områden/);
    assert.ok(
      block.indexOf('Kundens har kunder/leverantörer i utsatta områden')
        < block.indexOf('TYP AV RISKFAKTOR'),
      'namnet ska komma före typen'
    );
  });

  it('används i ai-ovriga-riskfaktor-endpointen', () => {
    const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    assert.match(index, /ai-ovrig-riskfaktor-prompt/);
    assert.match(index, /formatOvrigRiskfaktorSubjectBlock/);
    const chunk = index.slice(index.indexOf("app.post('/api/ai-ovriga-riskfaktor'"));
    assert.match(chunk, /formatOvrigRiskfaktorSubjectBlock\(riskfaktor,\s*typ\)/);
    assert.doesNotMatch(
      chunk.slice(0, 2500),
      /TYP AV RISKFAKTOR: \$\{typ/
    );
  });
});
