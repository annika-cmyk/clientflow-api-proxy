const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const JS = fs.readFileSync(path.join(__dirname, '../public/js/byra-profil-enkate.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');

describe('byråprofil enkät bransch-suggestions dismiss', () => {
  it('tvingar display:none när suggestions har [hidden] (annars vinner display:grid)', () => {
    assert.match(
      CSS,
      /\.byra-enkate-bransch-suggestions\[hidden\]\s*\{\s*display:\s*none\s*!important;/
    );
  });

  it('öppnar inte suggestions vid mount och stänger med Escape, blur och klick utanför', () => {
    assert.match(JS, /Do not open suggestions on mount/);
    assert.match(JS, /function closeSuggestions\(\)/);
    assert.match(JS, /e\.key === 'Escape'/);
    assert.match(JS, /search\.addEventListener\('blur'/);
    assert.match(JS, /document\.addEventListener\('pointerdown'/);
    assert.doesNotMatch(JS, /paintSelected\(\);\s*paintSuggestions\(''\);/);
  });

  it('behåller flerval och Inga högriskbranscher', () => {
    assert.match(JS, /allowNone:\s*true/);
    assert.match(JS, /Inga högriskbranscher/);
    assert.match(JS, /searchPlaceholder:\s*'Sök högriskbransch/);
  });
});
