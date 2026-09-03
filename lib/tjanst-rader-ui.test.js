const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('förenklade tjänsterader', () => {
  it('tar bort manuell PT/TF-, kategori- och evidensklassning i formuläret', () => {
    const js = read('public/js/riskbedomning-byra.v5.js');
    assert.doesNotMatch(js, /class="dyn-typ"/);
    assert.doesNotMatch(js, /class="dyn-kategori"/);
    assert.doesNotMatch(js, /class="dyn-evidens"/);
    assert.doesNotMatch(js, /Bekräftad byråspecifik/);
    assert.doesNotMatch(js, /Tjänstetypisk risk/);
    assert.match(js, /dataset\.hotTyp/);
    assert.match(js, /renderDiscreteKalla/);
    assert.match(js, /Vad kan gå fel\?/);
    assert.match(js, /Varför kan det hända hos byrån\?/);
    assert.match(js, /Hur hanteras risken\?/);
    assert.match(js, /is-befintlig">Befintlig/);
    assert.doesNotMatch(js, /Föreslagen<\/span>/);
  });

  it('visar frågerubrikerna i redigeringsvyn', () => {
    const html = read('public/riskbedomning-byra.html');
    assert.match(html, /Vad kan gå fel\?/);
    assert.match(html, /Varför kan det hända hos byrån\?/);
    assert.match(html, /Hur hanteras risken\?/);
    assert.match(html, /Vilken risk återstår\?/);
    assert.doesNotMatch(html, /Hot och modus \(PT\/TF\)/);
  });

  it('kräver inte kategori eller evidens i AI-JSON', () => {
    const index = read('index.js');
    const start = index.indexOf("app.post('/api/ai-byra-tjanst'");
    const end = index.indexOf("app.post('/api/ai-ovriga-riskfaktor'", start);
    const chunk = index.slice(start, end > start ? end : start + 50000);
    assert.match(chunk, /"sarbarheter": \[ \{ "titel"/);
    assert.doesNotMatch(chunk, /Frontend-dropdownen har 4 kategorier/);
    assert.doesNotMatch(chunk, /normalizeEvidens\(s\?\.evidens\)/);
    assert.match(chunk, /cleanSarbarhetItem/);
  });

  it('rensar läckt evidensetikett i sårbarhets-UI', () => {
    const js = read('public/js/riskbedomning-byra.v5.js');
    assert.match(js, /stripEvidensLeakFromText/);
  });
});
