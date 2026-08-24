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

  it('lägger vanliga riskfaktorer och varningsflaggor i samma A/B/C-kort', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/js/kundkort.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '../public/kundkort.html'), 'utf8');
    assert.match(js, /\$\{this\.renderOvrigaRiskKategoriBlock/);
    assert.match(js, /renderOvrigaRiskKategoriCard/);
    assert.match(js, /ovriga-risk-kategori-intro/);
    assert.match(js, /ovrigkyc-risker-\$\{typId\}/);
    assert.match(js, /embedded: true/);
    assert.match(js, /_collectRiskerSavePayload/);
    assert.match(js, /_embeddedTypIdsForOvrigaCard/);
    assert.match(js, /ovrigkyc-risker-geografiska/);
    assert.match(js, /cat\.id === 'verksamheten'/);
    assert.match(js, /risker-ovriga-flaggor/);
    assert.doesNotMatch(js, /id="risker-kort-geografiska"/);
    assert.doesNotMatch(js, /id="risker-kort-kund"/);
    assert.doesNotMatch(js, /id="risker-kort-distribution"/);
    assert.doesNotMatch(js, /id="risker-kort-verksamhet"/);
    assert.doesNotMatch(js, /_ovrigaItemsForTyp/);
    assert.doesNotMatch(js, /_renderOvrigaRiskDimChecks/);
    assert.doesNotMatch(js, /ovriga-flag-\$\{typId\}/);
    assert.doesNotMatch(js, /valda\.push\('Högriskbransch'\)/);
    assert.match(html, /ovriga-risk-kategorier\.js/);
    const src = fs.readFileSync(path.join(__dirname, '../public/js/ovriga-risk-kategorier.js'), 'utf8');
    assert.match(src, /Hur samarbetar vi/);
    assert.match(src, /Vem är kunden/);
    assert.match(src, /Vad gör kunden/);
  });

  it('håller högriskbransch infälld och tillåter SNI plus manuell ifyllning', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/js/kundkort.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '../public/kundkort.html'), 'utf8');
    assert.match(js, /id="\$\{hogriskEditUid\}" style="display:none;"/);
    assert.match(js, /id="hogrisk-manuell-input"/);
    assert.match(js, /addHogriskBranschManuell/);
    assert.match(js, /_hogriskSummaryChipsHtml/);
    assert.match(js, /hämtas från SNI-koden/);
    assert.match(js, /Lägg till bransch manuellt/);
    assert.match(js, /valdaHogrisk\.forEach\(pushHogriskAlt\)/);
    assert.match(js, /hogrisk-manuell-input[\s\S]*fromBoxes\.push\(pending\)/);
    assert.match(css, /\.hogrisk-edit-grupp/);
    assert.match(css, /\.hogrisk-manuell-rad/);
    assert.match(html, /kundkort\.js\?v=15\.93/);
    assert.match(html, /styles\.css\?v=20260824r/);
    assert.match(html, /kyc-huvudman\.js/);
  });

  it('lägger extraflaggor i vald kategori och kan flytta inbyggda flaggor', () => {
    assert.deepEqual(
      Kat.extrasForCategory('verksamheten', ['Min extraflagga', 'Inga']),
      ['Min extraflagga']
    );
    assert.deepEqual(Kat.extrasForCategory('samarbete', ['Min extraflagga']), []);
    assert.deepEqual(
      Kat.extrasForCategory('samarbete', ['Min extraflagga'], { 'Min extraflagga': 'samarbete' }),
      ['Min extraflagga']
    );
    assert.ok(Kat.factorsForCategory('samarbete').some((f) => f.label === 'Svårt att bekräfta identitet'));
    assert.ok(!Kat.factorsForCategory('verksamheten').some((f) => f.label === 'Svårt att bekräfta identitet'));
    const moved = { 'Svårt att bekräfta identitet': 'verksamheten' };
    assert.ok(!Kat.factorsForCategory('samarbete', { categoryMap: moved }).some((f) => f.label === 'Svårt att bekräfta identitet'));
    assert.ok(Kat.factorsForCategory('verksamheten', { categoryMap: moved }).some((f) => f.label === 'Svårt att bekräfta identitet'));
    const savedSamarbete = Kat.mergeValForCategory(
      ['Svårt att bekräfta identitet', 'Otydlig affärsmodell'],
      'samarbete',
      [],
      moved
    );
    assert.ok(savedSamarbete.includes('Svårt att bekräfta identitet'));
    assert.ok(savedSamarbete.includes('Otydlig affärsmodell'));
  });

  it('har kategorival i katalogen för övriga varningsflaggor', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/ovriga-riskfaktorer.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '../public/js/ovriga-riskfaktorer.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
    const kundkort = fs.readFileSync(path.join(__dirname, '../public/js/kundkort.js'), 'utf8');
    assert.match(html, /id="riskhoj-katalog-ny-kategori"/);
    assert.match(html, /Kategorin styr om flaggan ligger under/);
    assert.match(html, /ovriga-riskfaktorer\.js\?v=18/);
    assert.match(js, /riskhoj-katalog-grupp/);
    assert.match(js, /riskhoj-katalog-kategori/);
    assert.match(js, /mergeRiskhojandeEntries/);
    assert.match(css, /\.riskhoj-katalog-grupp/);
    assert.match(css, /\.riskhoj-katalog-kategori/);
    assert.match(kundkort, /_riskhojKategorier/);
    assert.match(kundkort, /categoryMap/);
  });

  it('lägger geografiska residualer under Vad gör kunden?', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/js/kundkort.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
    assert.match(js, /ovriga-risk-katalog--geo/);
    assert.match(js, /id="ovrigkyc-risker-geografiska"/);
    assert.match(js, /_collectEmbeddedRiskerPayload/);
    assert.match(js, /Länder kunden handlar med ligger under/);
    assert.doesNotMatch(js, /id="risker-kort-geografiska"/);
    assert.match(css, /\.ovriga-risk-katalog--geo/);
    assert.equal(Kat.categoryById('verksamheten').hint.includes('länder'), true);
  });
});
