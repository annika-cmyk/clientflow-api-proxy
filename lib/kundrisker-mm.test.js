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
    assert.match(html, /Kund- och geografiska riskfaktorer/);
    assert.match(html, /Geografisk riskfaktorer - här finns kundens kunder/);
    assert.match(html, /value="Geografisk riskfaktorer - här finns byråns kunder">Geografisk riskfaktorer - här finns kundens kunder/);
    assert.match(html, /id="riskhoj-katalog-section"/);
    assert.match(html, /id="risksank-katalog-section"/);
    assert.match(html, /ovriga-riskfaktorer\.js\?v=28/);
    assert.doesNotMatch(html, /Verksamhetsspecifika riskfaktorer/);
    assert.doesNotMatch(html, /Distrubutionskanaler/);

    assert.match(ovriga, /data-risk-page-scope="ovriga"/);
    assert.match(ovriga, /Geografisk riskfaktorer - här finns byråns kunder/);
    assert.match(ovriga, /Distribution, geografi och verksamhet/);
    assert.doesNotMatch(ovriga, /id="riskhoj-katalog-section"/);
    assert.doesNotMatch(ovriga, /id="risksank-katalog-section"/);
    assert.doesNotMatch(ovriga, /Riskfaktorer kopplat till kund/);
    assert.match(ovriga, /kundrisker-mm\.html/);

    assert.match(js, /pageScope/);
    assert.match(js, /riskBelongsToPageScope/);
    assert.match(js, /isKundriskerPage/);
    assert.doesNotMatch(js, /risk-subgroup/);
    assert.match(js, /geoDisplayLabel/);

    assert.match(sidebar, /data-page="kundrisker-mm"/);
    assert.match(sidebar, /kundrisker-mm\.html/);
    const ovrigaPos = sidebar.indexOf('data-page="ovriga-riskfaktorer"');
    const kundriskerPos = sidebar.indexOf('data-page="kundrisker-mm"');
    assert.ok(ovrigaPos >= 0 && kundriskerPos >= 0 && ovrigaPos < kundriskerPos, 'Övriga riskfaktorer ska ligga före Kundrisker mm i sidomenyn');
  });
});
