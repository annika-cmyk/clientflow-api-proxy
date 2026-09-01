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
  buildKomIgangState
} = require('./kom-igang');

describe('kom-igang', () => {
  it('inkluderar steg 5 när state samlas', () => {
    assert.deepEqual(KOM_IGANG_STEP_IDS[5], ['kom-igang-5-0']);
    const checked = {
      'kom-igang-1-0': true,
      'kom-igang-5-0': true
    };
    const state = collectKomIgangState(KOM_IGANG_STEP_IDS, (id) => (
      Object.prototype.hasOwnProperty.call(checked, id) ? checked[id] : false
    ));
    assert.equal(state['kom-igang-5-0'], true);
    assert.equal(state['kom-igang-4-0'], false);
  });

  it('kräver alla kryss plus explicit dold-flagga för att gömma flödet', () => {
    const ids = Object.values(KOM_IGANG_STEP_IDS).flat();
    const complete = Object.fromEntries(ids.map((id) => [id, true]));
    assert.equal(allKomIgangChecked(complete), true);
    assert.equal(allKomIgangChecked({ ...complete, 'kom-igang-3-0': false }), false);
    assert.equal(shouldHideKomIgang(parseKomIgangState(complete)), false);
    assert.equal(shouldHideKomIgang(parseKomIgangState({ ...complete, hidden: true })), true);
    assert.equal(shouldHideKomIgang(parseKomIgangState({ hidden: true, 'kom-igang-1-0': true })), false);
  });

  it('behåller äldre state utan hidden och bygger nytt state', () => {
    const parsed = parseKomIgangState({ 'kom-igang-1-0': true, hidden: true });
    assert.equal(parsed.checks['kom-igang-1-0'], true);
    assert.equal(parsed.hidden, true);
    const stored = buildKomIgangState(parsed.checks, true);
    assert.equal(stored.hidden, true);
    assert.equal(stored['kom-igang-1-0'], true);
    assert.equal(stored['kom-igang-5-0'], false);
  });

  it('har bekräftelse, dölj-knapp och visa-igen på dashboarden', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
    assert.match(html, /id="kom-igang-section"/);
    assert.match(html, /id="kom-igang-hide-btn"/);
    assert.match(html, /id="kom-igang-visa-igen"/);
    assert.match(html, /Visa Kom igång igen/);
    assert.match(html, /app\.js\?v=2\.11/);
    assert.match(app, /KOM_IGANG_HIDE_CONFIRM/);
    assert.match(app, /Är du klar med allt i Kom igång/);
    assert.match(app, /applyKomIgangVisibility/);
    assert.equal(HIDE_CONFIRM.includes('Visa Kom igång'), true);
  });
});
