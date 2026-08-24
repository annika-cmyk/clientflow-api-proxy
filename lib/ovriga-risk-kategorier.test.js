const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Kat = require('../public/js/ovriga-risk-kategorier');

describe('ovriga-risk-kategorier', () => {
  it('delar in övriga riskfaktorer i samarbete, kund och verksamhet', () => {
    assert.deepEqual(Kat.CATEGORIES.map((c) => c.id), ['samarbete', 'kunden', 'verksamheten']);
    assert.equal(Kat.categoryById('samarbete').title, 'Hur samarbetar vi?');
    assert.equal(Kat.categoryById('kunden').title, 'Vem är kunden?');
    assert.equal(Kat.categoryById('verksamheten').title, 'Vad gör kunden?');
    assert.ok(Kat.labelsForCategory('samarbete').includes('Fysiskt möte'));
    assert.ok(Kat.labelsForCategory('samarbete').includes('Distansrelation utan säker verifiering'));
    assert.ok(Kat.labelsForCategory('kunden').includes('PEP eller RCA'));
    assert.ok(Kat.labelsForCategory('verksamheten').includes('Kontantintensiv verksamhet'));
    assert.equal(Kat.isCoveredByDimension('Fysiskt möte'), true);
    assert.equal(Kat.isCoveredByDimension('Svårt att bekräfta identitet'), false);
    assert.ok(!Kat.factorsForCategory('samarbete', { kundkort: true }).some((f) => f.label === 'Fysiskt möte'));
    assert.ok(Kat.factorsForCategory('samarbete', { kundkort: true }).some((f) => f.label === 'Svårt att bekräfta identitet'));
    assert.equal(Kat.categoryIdForDimension('distribution'), 'samarbete');
    assert.equal(Kat.categoryIdForDimension('kund'), 'kunden');
    assert.equal(Kat.categoryIdForDimension('verksamhet'), 'verksamheten');
    assert.equal(Kat.dimensionIdForCategory('samarbete'), 'distribution');
    assert.equal(Kat.findFactor('Kontanthantering').klass, 'GOLV_HOG');
    assert.equal(Kat.findFactor('Distansrelation med BankID').klass, 'BIDRAR_VID_KOMBINATION');
  });

  it('behåller val i andra kategorier när en kategori sparas', () => {
    const merged = Kat.mergeValForCategory(
      ['Kontanthantering', 'PEP eller RCA', 'Fysiskt möte'],
      'samarbete',
      ['Distansrelation med BankID-verifiering']
    );
    assert.ok(merged.includes('Kontantintensiv verksamhet'));
    assert.ok(merged.includes('PEP eller RCA'));
    assert.ok(merged.includes('Distansrelation med BankID-verifiering'));
    assert.ok(!merged.includes('Fysiskt möte'));
    const visible = Kat.mergeVisibleVal(
      ['Fysiskt möte', 'Ofta bytt redovisningskonsult/revisor utan naturlig förklaring'],
      ['Svårt att bekräfta identitet']
    );
    assert.ok(visible.includes('Svårt att bekräfta identitet'));
    assert.ok(visible.includes('Fysiskt möte'));
    assert.ok(!visible.includes('Ofta bytt redovisningskonsult/revisor utan naturlig förklaring'));
  });

  it('visar övriga varningsflaggor som tre egna kort A/B/C på kundkortet', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/js/kundkort.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '../public/kundkort.html'), 'utf8');
    assert.match(js, /\$\{this\.renderOvrigaRiskKategoriBlock/);
    assert.match(js, /renderOvrigaRiskKategoriCard/);
    assert.match(js, /ovriga-risk-kategori-intro/);
    assert.match(js, /Övriga riskfaktorer/);
    assert.doesNotMatch(js, /_ovrigaItemsForTyp/);
    assert.doesNotMatch(js, /_renderOvrigaRiskDimChecks/);
    assert.doesNotMatch(js, /ovriga-flag-\$\{typId\}/);
    assert.doesNotMatch(js, /risker-ovriga-flaggor/);
    assert.doesNotMatch(js, /valda\.push\('Högriskbransch'\)/);
    assert.match(html, /ovriga-risk-kategorier\.js/);
    const src = fs.readFileSync(path.join(__dirname, '../public/js/ovriga-risk-kategorier.js'), 'utf8');
    assert.match(src, /Hur samarbetar vi/);
    assert.match(src, /Vem är kunden/);
    assert.match(src, /Vad gör kunden/);
  });
});
