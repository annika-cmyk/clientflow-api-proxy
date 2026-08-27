const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('kundrisker-mm', () => {
  it('har egen sida med kundrisk, varningsflaggor och risksänkande', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/kundrisker-mm.html'), 'utf8');
    const ovriga = fs.readFileSync(path.join(__dirname, '../public/ovriga-riskfaktorer.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '../public/js/ovriga-riskfaktorer.js'), 'utf8');
    const sidebar = fs.readFileSync(path.join(__dirname, '../public/Components/sidebar.html'), 'utf8');

    assert.match(html, /data-risk-page-scope="kundrisker"/);
    assert.match(html, /<h1>Kundrisker mm<\/h1>/);
    assert.match(html, /Riskfaktorer kopplat till kund/);
    assert.match(html, /id="riskhoj-katalog-section"/);
    assert.match(html, /id="risksank-katalog-section"/);
    assert.match(html, /ovriga-riskfaktorer\.js\?v=26/);
    assert.doesNotMatch(html, /Verksamhetsspecifika riskfaktorer/);
    assert.doesNotMatch(html, /Distrubutionskanaler/);

    assert.match(ovriga, /data-risk-page-scope="ovriga"/);
    assert.doesNotMatch(ovriga, /id="riskhoj-katalog-section"/);
    assert.doesNotMatch(ovriga, /id="risksank-katalog-section"/);
    assert.doesNotMatch(ovriga, /Riskfaktorer kopplat till kund/);
    assert.match(ovriga, /kundrisker-mm\.html/);

    assert.match(js, /pageScope/);
    assert.match(js, /riskBelongsToPageScope/);
    assert.match(js, /isKundriskerPage/);

    assert.match(sidebar, /data-page="kundrisker-mm"/);
    assert.match(sidebar, /kundrisker-mm\.html/);
  });
});
