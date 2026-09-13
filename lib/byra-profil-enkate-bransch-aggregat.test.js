const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const JS = fs.readFileSync(path.join(__dirname, '../public/js/byra-profil-enkate.js'), 'utf8');
const AGG = fs.readFileSync(path.join(__dirname, '../public/js/kund-bransch-aggregat.js'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, '../public/byra-profil-enkate.html'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');

describe('byråprofil enkät kundbransch-aggregat UX', () => {
  it('laddar delad aggregat-modul i enkäten', () => {
    assert.match(HTML, /kund-bransch-aggregat\.js/);
    assert.match(AGG, /mapToCommonKundBransch/);
    assert.match(AGG, /COMMON_KUND_BRANSCHER/);
  });

  it('erbjuder sammanfogning av detaljerade SNI-rader utan att röra högrisk', () => {
    assert.match(JS, /allowAggregate:\s*true/);
    assert.match(JS, /Sammanfoga till översiktsgrupper/);
    assert.match(JS, /useBranschParse:\s*true/);
    assert.match(JS, /renderHogrisk\(field\)/);
    assert.match(JS, /allowNone:\s*true/);
    assert.match(JS, /Sök högriskbransch/);
  });

  it('har stil för aggregat-baren', () => {
    assert.match(CSS, /\.byra-enkate-bransch-aggregate/);
    assert.match(CSS, /\.byra-enkate-bransch-aggregate\[hidden\]/);
  });
});
