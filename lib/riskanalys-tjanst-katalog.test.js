const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Katalog = require('./riskanalys-tjanst-katalog');

describe('riskanalys-tjanst-katalog', () => {
  it('har katalogdata från Excel-underlaget', () => {
    assert.ok(fs.existsSync(Katalog.DATA_PATH));
    const catalog = Katalog.loadCatalog();
    assert.ok(catalog.tjanster.Bokföring);
    assert.ok(Array.isArray(catalog.tjanster.Bokföring));
    assert.equal(catalog.tjanster.Bokföring.length >= 2, true);
  });

  it('matchar tjänstnamn exakt, via alias och delvis', () => {
    assert.equal(Katalog.resolveTjanstKey('Bokföring'), 'Bokföring');
    assert.equal(Katalog.resolveTjanstKey('Löpande bokföring'), 'Bokföring');
    assert.equal(Katalog.resolveTjanstKey('Momsredovisning'), 'Momsdeklaration');
    assert.equal(Katalog.resolveTjanstKey('Leverantörsreskontra'), 'Leverantörsreskontra');
    assert.equal(Katalog.resolveTjanstKey('Helt okänd tjänst XYZ'), '');
  });

  it('formaterar promptblock med hot, sårbarhet och källor', () => {
    const block = Katalog.formatPromptBlock('Bokföring');
    assert.match(block, /RISKANALYS-UNDERLAG/);
    assert.match(block, /Matchad tjänst i katalogen: Bokföring/);
    assert.match(block, /Hotkategori: PT/);
    assert.match(block, /Hotkategori: TF|Båda/);
    assert.match(block, /Sårbarhet:/);
    assert.match(block, /inte facit/);
  });

  it('inkluderar sektorkomplettering för bokföringstjänster', () => {
    const match = Katalog.lookup('Bokföring');
    assert.ok(match.sektorKomplettering.length >= 1);
    const block = Katalog.formatPromptBlock('Bokföring');
    assert.match(block, /Sektor-/);
  });

  it('index.js matar in katalogblock i AI-tjänstprompten', () => {
    const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    assert.match(index, /RiskanalysTjanstKatalog/);
    assert.match(index, /formatPromptBlock/);
  });
});
