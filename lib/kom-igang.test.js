const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  KOM_IGANG_STEP_IDS,
  HIDE_CONFIRM,
  collectKomIgangState,
  parseKomIgangState,
  allKomIgangChecked,
  shouldHideKomIgang,
  buildKomIgangState,
  migrateKomIgangRaw
} = require('./kom-igang');

describe('kom-igang', () => {
  it('inkluderar steg 6 och migrerar äldre state', () => {
    assert.deepEqual(KOM_IGANG_STEP_IDS[6], ['kom-igang-6-0']);
    const migrated = migrateKomIgangRaw({
      'kom-igang-1-0': true,
      'kom-igang-5-0': true
    });
    assert.equal(migrated.version, 2);
    assert.equal(migrated['kom-igang-2-0'], true);
    assert.equal(migrated['kom-igang-6-0'], true);
    assert.equal(migrated['kom-igang-1-0'], undefined);
  });

  it('kräver alla kryss plus explicit dold-flagga för att gömma flödet', () => {
    const ids = Object.values(KOM_IGANG_STEP_IDS).flat();
    const complete = Object.fromEntries(ids.map((id) => [id, true]));
    assert.equal(allKomIgangChecked(complete), true);
    assert.equal(allKomIgangChecked({ ...complete, 'kom-igang-3-0': false }), false);
    assert.equal(shouldHideKomIgang(parseKomIgangState(complete)), false);
    assert.equal(shouldHideKomIgang(parseKomIgangState({ ...complete, hidden: true })), true);
  });

  it('behåller äldre state utan hidden och bygger nytt state', () => {
    const parsed = parseKomIgangState({ 'kom-igang-1-0': true, hidden: true });
    // v1 1-0 migreras till 2-0; ny 1-0 är false
    assert.equal(parsed.checks['kom-igang-2-0'], true);
    assert.equal(parsed.checks['kom-igang-1-0'], false);
    assert.equal(parsed.hidden, true);
    const stored = buildKomIgangState(parsed.checks, true);
    assert.equal(stored.hidden, true);
    assert.equal(stored.version, 2);
    assert.equal(stored['kom-igang-6-0'], false);
  });

  it('har bekräftelse, dölj-knapp och visa-igen på dashboarden', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
    assert.match(html, /id="kom-igang-section"/);
    assert.match(html, /id="kom-igang-hide-btn"/);
    assert.match(html, /id="kom-igang-visa-igen"/);
    assert.match(html, /byra-profil-enkate\.html/);
    assert.match(html, /kom-igang-6-0/);
    assert.match(html, /app\.js\?v=2\.12/);
    assert.match(app, /KOM_IGANG_HIDE_CONFIRM|KOM_IGANG_HIDE_CONFIRM/);
    assert.match(app, /kom-igang-6-0/);
    assert.equal(HIDE_CONFIRM.includes('Visa Kom igång'), true);
  });
});
