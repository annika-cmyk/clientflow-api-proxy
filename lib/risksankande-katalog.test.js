const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RS = require('../public/js/risksankande-katalog');

describe('risksankande-katalog', () => {
  it('har de fem förifyllda faktorerna och släpper Inga', () => {
    assert.deepEqual(RS.DEFAULT_RISKSANKANDE, [
      'Enkel struktur, lätt att få överblick på transaktionerna',
      'Små transaktioner',
      'Mycket god ordning',
      'Kommun, region eller liknande',
      'Långsiktig affärsrelation'
    ]);
    const empty = RS.mergeKatalog({});
    RS.DEFAULT_RISKSANKANDE.forEach((namn) => {
      assert.deepEqual(empty[namn], { forklaring: '', kalla: '' });
    });
    assert.equal(RS.isIngaLabel('Inga'), true);
    assert.equal(RS.isIngaLabel('inga'), true);
    assert.ok(!RS.mergeKatalog({ Inga: { forklaring: 'x', kalla: 'y' } }).Inga);
  });

  it('behåller borttagna defaults och sparar förklaring plus källa', () => {
    const persisted = RS.persistKatalog({
      'Små transaktioner': { forklaring: 'Låga belopp', kalla: 'Intern rutin' },
      'Ny faktor': { forklaring: 'Egen', kalla: '3 kap. PTL' }
    });
    assert.equal(persisted.stored['Enkel struktur, lätt att få överblick på transaktionerna'], 'BORTTAGEN');
    assert.equal(persisted.stored['Mycket god ordning'], 'BORTTAGEN');
    assert.deepEqual(persisted.visible['Små transaktioner'], { forklaring: 'Låga belopp', kalla: 'Intern rutin' });
    assert.deepEqual(persisted.visible['Ny faktor'], { forklaring: 'Egen', kalla: '3 kap. PTL' });
    assert.ok(!persisted.visible['Enkel struktur, lätt att få överblick på transaktionerna']);

    const merged = RS.mergeKatalog(persisted.stored);
    assert.ok(!merged['Enkel struktur, lätt att få överblick på transaktionerna']);
    assert.ok(!merged['Mycket god ordning']);
    assert.deepEqual(merged['Små transaktioner'], { forklaring: 'Låga belopp', kalla: 'Intern rutin' });
    assert.deepEqual(merged['Ny faktor'], { forklaring: 'Egen', kalla: '3 kap. PTL' });
    assert.deepEqual(RS.metaFor('Små transaktioner', merged), { forklaring: 'Låga belopp', kalla: 'Intern rutin' });
  });

  it('läser array, objekt och JSON med förklaring och källa', () => {
    const fromArr = RS.parseKatalog([
      { namn: 'Små transaktioner', forklaring: 'Liten volym', kalla: 'Policy' },
      { namn: 'Borttagen default', status: 'BORTTAGEN' }
    ]);
    assert.deepEqual(fromArr['Små transaktioner'], { forklaring: 'Liten volym', kalla: 'Policy' });
    assert.equal(fromArr['Borttagen default'], 'BORTTAGEN');

    const fromJson = RS.parseKatalog(JSON.stringify({
      'Långsiktig affärsrelation': { forklaring: 'Känd kund', kalla: 'KYC' }
    }));
    assert.deepEqual(fromJson['Långsiktig affärsrelation'], { forklaring: 'Känd kund', kalla: 'KYC' });
  });

  it('har katalogkort, API och kundkort kopplat till byråns lista', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/ovriga-riskfaktorer.html'), 'utf8');
    const adminJs = fs.readFileSync(path.join(__dirname, '../public/js/ovriga-riskfaktorer.js'), 'utf8');
    const kundkort = fs.readFileSync(path.join(__dirname, '../public/js/kundkort.js'), 'utf8');
    const kundkortHtml = fs.readFileSync(path.join(__dirname, '../public/kundkort.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
    const api = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');

    assert.doesNotMatch(html, /id="risksank-katalog-section"/);
    assert.match(html, /ovriga-riskfaktorer\.js\?v=29/);
    assert.match(html, /styles\.css\?v=20260825k/);
    const kundriskerHtml = fs.readFileSync(path.join(__dirname, '../public/kundrisker-mm.html'), 'utf8');
    assert.match(kundriskerHtml, /id="risksank-katalog-section"/);
    assert.match(kundriskerHtml, /Risksänkande faktorer/);
    assert.match(kundriskerHtml, /risksankande-katalog\.js\?v=2/);
    assert.match(kundriskerHtml, /id="riskhoj-katalog-section"/);
    const hojPosKund = kundriskerHtml.indexOf('id="riskhoj-katalog-section"');
    const sankPosKund = kundriskerHtml.indexOf('id="risksank-katalog-section"');
    assert.ok(sankPosKund > hojPosKund, 'risksänkande katalogen ska ligga efter varningsflaggor på Kundrisker mm');

    assert.match(adminJs, /setupRisksankandeKatalog/);
    assert.match(adminJs, /renderKatalogRad/);
    assert.match(adminJs, /risksank-katalog-forklaring/);
    assert.match(adminJs, /risksank-katalog-kalla/);
    assert.match(adminJs, /data\.katalog/);
    assert.match(adminJs, /saveRisksankandeKatalog\(\)/);
    assert.doesNotMatch(adminJs, /risksank-katalog-falt/);
    assert.doesNotMatch(adminJs, /<textarea class="form-input risksank-katalog-forklaring"/);

    assert.match(kundkort, /\/api\/risksankande-katalog/);
    assert.match(kundkort, /_risksankAlternativForCard/);
    assert.match(kundkort, /_risksankMetaHtml/);
    assert.match(kundkort, /risksank-faktor-hint/);
    assert.match(kundkort, /risksank-faktor-kalla/);
    assert.doesNotMatch(kundkort, /Inga kopplingar till utlandet','Enkel struktur/);

    assert.match(kundkortHtml, /risksankande-katalog\.js\?v=2/);
    assert.match(kundkortHtml, /kundkort\.js\?v=16\.18/);
    assert.match(kundkortHtml, /styles\.css\?v=20260826d/);

    assert.match(css, /\.risksank-katalog-namn/);
    assert.match(css, /\.risksank-katalog-forklaring/);
    assert.match(css, /\.risksank-katalog-kalla/);
    assert.doesNotMatch(css, /\.risksank-katalog-falt/);
    assert.match(css, /\.risksank-faktor-hint/);
    assert.match(css, /\.risksank-faktor-kalla/);

    assert.match(api, /app\.get\('\/api\/risksankande-katalog'/);
    assert.match(api, /app\.patch\('\/api\/risksankande-katalog'/);
    assert.match(api, /BYRA_RISKSANKANDE_KATALOG_FIELD = 'Risksänkande katalog'/);
    assert.match(api, /ensureByraRisksankandeKatalogField/);
  });

  it('ritar katalogen som en kompakt rad med namn, förklaring och källa', () => {
    const html = RS.renderKatalogRad('Långsiktig affärsrelation', {
      forklaring: 'Känd kund över tid',
      kalla: '3 kap. 6 § PTL'
    });
    assert.match(html, /class="riskhoj-katalog-rad risksank-katalog-rad"/);
    assert.match(html, /class="form-input risksank-katalog-namn"/);
    assert.match(html, /value="Långsiktig affärsrelation"/);
    assert.match(html, /class="form-input risksank-katalog-forklaring"/);
    assert.match(html, /value="Känd kund över tid"/);
    assert.match(html, /class="form-input risksank-katalog-kalla"/);
    assert.match(html, /value="3 kap\. 6 § PTL"/);
    assert.doesNotMatch(html, /<textarea/);
    assert.doesNotMatch(html, /risksank-katalog-falt/);
  });
});
