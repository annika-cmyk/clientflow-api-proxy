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
    assert.ok(Kat.labelsForCategory('kunden').includes('Kunder med mycket kontanta transaktioner'));
    assert.ok(Kat.labelsForCategory('kunden').includes('Kunder med transaktioner via Betalkort'));
    assert.ok(Kat.labelsForCategory('verksamheten').includes('Högriskbransch'));
    assert.ok(!Kat.labelsForCategory('verksamheten').includes('Kontantintensiv verksamhet'));
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

  it('kundens egna kunder på distans ligger under verksamheten, inte distribution', () => {
    const label = 'Kundens egna kunder är på distans (e-handel/anonyma köpare)';
    assert.ok(Kat.findFactor(label));
    assert.ok(Kat.labelsForCategory('verksamheten').includes(label));
    assert.equal(Kat.categoryFor(label), 'verksamheten');
    assert.equal(Kat.categoryIdForDimension('distribution'), 'samarbete');
  });

  it('kontant, krypto och högriskländer ingår inte i varningsflaggkatalogen', () => {
    const katalog = Kat.defaultKatalog();
    assert.equal(katalog['Kontantintensiv verksamhet'], undefined);
    assert.equal(katalog['Kunder med mycket kontanta transaktioner'], undefined);
    assert.equal(katalog['Kunder som handlar med kryptovaluta'], undefined);
    assert.equal(katalog['Kunden har handel med högriskländer'], undefined);
    assert.equal(katalog['PEP eller RCA'], undefined);
    assert.ok(katalog['Otydlig affärsmodell']);
  });

  it('isLinkedKundResidualFactor identifierar kontanter, krypto, betalkort och högriskländer', () => {
    assert.equal(Kat.isLinkedKundResidualFactor('Kunder med mycket kontanta transaktioner'), true);
    assert.equal(Kat.isLinkedKundResidualFactor('Kontantintensiv verksamhet'), true);
    assert.equal(Kat.isLinkedKundResidualFactor('Kunder som handlar med kryptovaluta'), true);
    assert.equal(Kat.isLinkedKundResidualFactor('Kunder med transaktioner via Betalkort'), true);
    assert.equal(Kat.isLinkedKundResidualFactor('Kunden har handel med högriskländer'), true);
    assert.equal(Kat.isLinkedKundResidualFactor('Kunder med utländska huvudmän'), true);
    assert.equal(Kat.isLinkedKundResidualFactor('Utländska verkliga huvudmän (UBO)'), true);
    assert.equal(Kat.isLinkedKundResidualFactor('Kopplingar till utlandet / Högriskländer'), true);
    assert.equal(Kat.isLinkedKundResidualFactor('Högriskbransch'), false);
    assert.equal(Kat.airtableTypForLinkedKundResidual('Kunden har handel med högriskländer'), 'Riskfaktorer kopplat till kund');
  });

  it('högriskländer ligger under kunden och matchar gammalt namn', () => {
    const label = 'Kunden har handel med högriskländer';
    assert.ok(Kat.labelsForCategory('kunden').includes(label));
    assert.ok(!Kat.labelsForCategory('verksamheten').includes(label));
    assert.equal(Kat.canonicalLabel('Kopplingar till utlandet / Högriskländer'), label);
    assert.equal(Kat.categoryFor(label), 'kunden');
  });

  it('isDistributionKanal skiljer kanaler från övriga samarbetsflaggor', () => {
    assert.equal(Kat.isDistributionKanal('Fysiskt möte'), true);
    assert.equal(Kat.isDistributionKanal('Distanskund'), true);
    assert.equal(Kat.isDistributionKanal('Distansrelation utan säker verifiering'), true);
    assert.equal(Kat.isDistributionKanal('Ovanlig tidsnöd / kunden har extremt bråttom'), false);
    assert.equal(Kat.isDistributionKanal('Svårt att bekräfta identitet'), false);
    assert.equal(Kat.isDistributionKanal('Kundens egna kunder är på distans (e-handel/anonyma köpare)'), false);
  });

  it('behåller val i andra kategorier när en kategori sparas', () => {
    const merged = Kat.mergeValForCategory(
      ['Kontanthantering', 'PEP eller RCA', 'Fysiskt möte', 'Otydlig affärsmodell'],
      'samarbete',
      ['Svårt att bekräfta identitet']
    );
    assert.ok(merged.includes('Otydlig affärsmodell'));
    assert.ok(merged.includes('Svårt att bekräfta identitet'));
    assert.ok(!merged.includes('Kunder med mycket kontanta transaktioner'));
    assert.ok(!merged.includes('PEP eller RCA'));
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
    assert.doesNotMatch(js, /section\('Kunden & verksamheten'/);
    assert.match(js, /renderOvrigaRiskKategoriCard/);
    assert.doesNotMatch(js, /ovriga-risk-kategori-intro/);
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
    assert.match(css, /\.hogrisk-edit-grupp--aktiv/);
    assert.match(css, /\.hogrisk-manuell-rad/);
    assert.match(js, /hogrisk-edit-grupp--aktiv/);
    assert.match(js, /grupp\.classList\.toggle\('hogrisk-edit-grupp--aktiv'/);
    assert.match(html, /kundkort\.js\?v=16\.17/);
    assert.match(html, /kyc-verksamhet-styrning\.js/);
    assert.match(html, /styles\.css\?v=20260826d/);
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
    assert.match(html, /ovriga-riskfaktorer\.js\?v=24/);
    assert.match(js, /riskhoj-katalog-grupp/);
    assert.match(js, /riskhoj-katalog-kategori/);
    assert.match(js, /mergeRiskhojandeEntries/);
    assert.match(css, /\.riskhoj-katalog-grupp/);
    assert.match(css, /\.riskhoj-katalog-kategori/);
    assert.match(css, /\.riskhoj-katalog-list \{[^}]*gap: 2\.25rem/);
    assert.match(css, /\.riskhoj-katalog-grupp-titel \{[\s\S]*?margin: 0\.35rem 0 0\.4rem/);
    assert.match(html, /riskhoj-katalog-add-btn/);
    assert.match(html, /fa-plus/);
    assert.doesNotMatch(html, /id="riskhoj-katalog-add">Lägg till</);
    assert.match(css, /\.riskhoj-katalog-add-btn \{[\s\S]*?width: 2rem/);
    assert.match(css, /\.riskhoj-katalog-remove \{[\s\S]*?width: 2rem/);
    assert.match(kundkort, /_riskhojKategorier/);
    assert.match(kundkort, /categoryMap/);
  });

  it('lägger geografiska residualer under Vad gör kunden?', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/js/kundkort.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
    assert.match(js, /ovriga-risk-katalog--geo/);
    assert.match(js, /id="ovrigkyc-risker-geografiska"/);
    assert.match(js, /_collectEmbeddedRiskerPayload/);
    assert.match(js, /Länder kunden handlar med/);
    assert.doesNotMatch(js, /id="risker-kort-geografiska"/);
    assert.match(css, /\.ovriga-risk-katalog--geo/);
    assert.equal(Kat.categoryById('verksamheten').hint.includes('länder'), true);
  });

  it('kan spara inga riskfaktorer och inga varningsflaggor per kort', () => {
    assert.equal(Kat.storedNoneLabel('varningsflaggor', 'kunden'), 'Inga varningsflaggor · kunden');
    assert.equal(Kat.storedNoneLabel('riskfaktorer', 'verksamheten'), 'Inga riskfaktorer · verksamheten');
    assert.equal(Kat.displayNoneLabel('Inga varningsflaggor · samarbete'), 'Inga varningsflaggor');
    assert.equal(Kat.categoryFor('Inga varningsflaggor · samarbete'), 'samarbete');
    assert.equal(Kat.categoryFor('Inga riskfaktorer · verksamheten'), 'verksamheten');
    assert.equal(Kat.isIngaVarningsflaggor('Inga varningsflaggor · kunden'), true);
    assert.equal(Kat.isIngaRiskfaktorer('Inga riskfaktorer · kunden'), true);
    assert.equal(Kat.hasNoneOption(['Inga varningsflaggor · kunden'], 'varningsflaggor', 'kunden'), true);
    assert.equal(Kat.hasNoneOption(['Inga varningsflaggor · kunden'], 'varningsflaggor', 'samarbete'), false);
    assert.deepEqual(
      Kat.extrasForCategory('verksamheten', ['Inga varningsflaggor · verksamheten', 'Inga riskfaktorer · verksamheten', 'Min extraflagga']),
      ['Min extraflagga']
    );
    const merged = Kat.mergeValForCategory(
      ['Inga varningsflaggor · samarbete', 'PEP eller RCA'],
      'kunden',
      ['Inga varningsflaggor · kunden', 'Inga riskfaktorer · kunden']
    );
    assert.ok(merged.includes('Inga varningsflaggor · samarbete'));
    assert.ok(merged.includes('Inga varningsflaggor · kunden'));
    assert.ok(merged.includes('Inga riskfaktorer · kunden'));
    assert.ok(!merged.includes('PEP eller RCA'));
    const js = fs.readFileSync(path.join(__dirname, '../public/js/kundkort.js'), 'utf8');
    assert.match(js, /Inga varningsflaggor/);
    assert.match(js, /Inga riskfaktorer/);
    assert.match(js, /inga-risker-\$\{typId\}/);
    assert.match(js, /_syncIngaRiskfaktorer/);
    assert.match(js, /data-group="inga-varningsflaggor"/);
    assert.doesNotMatch(js, /inga-risker-distribution/);
    assert.match(js, /typId === 'kund' \|\| typId === 'verksamhet'/);
  });

  it('håller varningsflaggor neutrala tills de är ibockade', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/js/kundkort.js'), 'utf8');
    assert.match(js, /_ovrigaRiskFlagHint/);
    assert.match(js, /cb\.checked && klass === 'GOLV_HOG'/);
    assert.match(js, /cb\.checked && klass === 'BIDRAR_VID_KOMBINATION'/);
    assert.doesNotMatch(js, /riskf-golv-mark">Hög-aktiv/);
    assert.doesNotMatch(js, /riskf-bidrar-mark">Bidrar vid kombination/);
    assert.doesNotMatch(js, /riskf-golv-mark">Hög-golv/);
    assert.doesNotMatch(js, /Röd markering höjer till Hög ensam/);
  });
});
