const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const JS = fs.readFileSync(path.join(__dirname, '../public/js/byra-profil-enkate.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, '../public/byra-anvandare.html'), 'utf8');

describe('byråprofil enkät egna select-alternativ', () => {
  it('renderSelect erbjuder + Eget alternativ på alla flervals-pills', () => {
    assert.match(JS, /function renderSelect\(field, current\)/);
    assert.match(JS, /\+ Eget alternativ/);
    assert.match(JS, /byra-enkate-choice--add/);
    assert.match(JS, /byra-enkate-select-custom/);
    assert.match(JS, /Skriv eget alternativ/);
    assert.match(JS, /customChoices\.push/);
  });

  it('stilar eget alternativ som dashed pill och input-rad', () => {
    assert.match(CSS, /\.byra-enkate-choice--add\s*\{/);
    assert.match(CSS, /border-style:\s*dashed/);
    assert.match(CSS, /\.byra-enkate-select-custom\s*\{/);
    assert.match(CSS, /\.byra-enkate-select-custom\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
  });

  it('byråinformation har de nya kundintroduktion-valen', () => {
    assert.match(HTML, /Rekommendation via befintliga kunder/);
    assert.match(HTML, /Via personligt nätverkande/);
  });
});
