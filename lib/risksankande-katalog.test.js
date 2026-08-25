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
    const kundHtml = fs.readFileSync(path.join(__dirname, '../public/kundkort.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
    const api = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');

    assert.match(html, /id="risksank-katalog-section"/);
    assert.match(html, /Risksänkande faktorer/);
    assert.match(html, /risksankande-katalog\.js\?v=1/);
    assert.match(html, /ovriga-riskfaktorer\.js\?v=20/);
    const hojPos = html.indexOf('id="riskhoj-katalog-section"');
    const sankPos = html.indexOf('id="risksank-katalog-section"');
    assert.ok(sankPos > hojPos, 'risksänkande katalogen ska ligga efter varningsflaggor');

    assert.match(adminJs, /setupRisksankandeKatalog/);
    assert.match(adminJs, /risksank-katalog-forklaring/);
    assert.match(adminJs, /risksank-katalog-kalla/);
    assert.match(adminJs, /data\.katalog/);
    assert.match(adminJs, /saveRisksankandeKatalog\(\)/);

    assert.match(kundkort, /\/api\/risksankande-katalog/);
    assert.match(kundkort, /_risksankAlternativForCard/);
    assert.match(kundkort, /_risksankMetaHtml/);
    assert.match(kundkort, /risksank-faktor-hint/);
    assert.match(kundkort, /risksank-faktor-kalla/);
    assert.doesNotMatch(kundkort, /Inga kopplingar till utlandet','Enkel struktur/);

    assert.match(kundHtml, /risksankande-katalog\.js\?v=1/);
    assert.match(kundHtml, /kundkort\.js\?v=16\.02/);
    assert.match(kundHtml, /styles\.css\?v=20260824x/);

    assert.match(css, /\.risksank-katalog-rad/);
    assert.match(css, /\.risksank-faktor-hint/);
    assert.match(css, /\.risksank-faktor-kalla/);

    assert.match(api, /app\.get\('\/api\/risksankande-katalog'/);
    assert.match(api, /app\.patch\('\/api\/risksankande-katalog'/);
    assert.match(api, /BYRA_RISKSANKANDE_KATALOG_FIELD = 'Risksänkande katalog'/);
    assert.match(api, /ensureByraRisksankandeKatalogField/);
  });
});
