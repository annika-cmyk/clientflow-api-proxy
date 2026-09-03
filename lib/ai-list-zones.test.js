const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('AI list zones display', () => {
  it('har tre-zons API och bannerknappar i riskbedomning-byra.v5.js', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'riskbedomning-byra.v5.js'), 'utf8');
    assert.match(src, /groupDynListAiZones/);
    assert.match(src, /Föreslås tas bort/);
    assert.match(src, /Nytt förslag/);
    assert.match(src, /Oförändrat/);
    assert.match(src, /Granska alla/);
    assert.match(src, /fill-danger/);
    assert.match(src, /fill-success/);
    assert.match(src, /dyn-ai-edit/);
    assert.match(src, /AI:s motivering:/);
    assert.match(src, /Varför AI föreslår detta:/);
  });

  it('har zonsstilar utan blå highlight och utan strikethrough', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
    assert.match(css, /\.dyn-ai-zone-label/);
    assert.match(css, /\.fill-danger/);
    assert.match(css, /\.fill-success/);
    assert.match(css, /border-left-color:\s*var\(--error\)/);
    assert.match(css, /border-left-color:\s*var\(--success\)/);
    assert.match(css, /\.dyn-card\.is-ai-remove[^{]*\{[^}]*opacity:\s*0\.85/s);
    assert.doesNotMatch(css, /\.dyn-card\.is-ai-remove[^{]*\{[^}]*text-decoration:\s*line-through/s);
    assert.doesNotMatch(css, /box-shadow:\s*0 0 0 3px rgba\(59, 130, 246/);
  });
});
