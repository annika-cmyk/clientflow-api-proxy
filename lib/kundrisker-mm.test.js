const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('kundrisker-mm', () => {
  it('har egen sida med kundrisk, båda geo-spåren, varningsflaggor och risksänkande', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/kundrisker-mm.html'), 'utf8');
    const ovriga = fs.readFileSync(path.join(__dirname, '../public/ovriga-riskfaktorer.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '../public/js/ovriga-riskfaktorer.js'), 'utf8');
    assert.match(js, /setRiskTab\(/);
    assert.match(js, /bindRiskTabs\(/);
    const sidebar = fs.readFileSync(path.join(__dirname, '../public/Components/sidebar.html'), 'utf8');

    assert.match(html, /data-risk-page-scope="kundrisker"/);
    assert.match(html, /<h1>Vilka är våra kunder<\/h1>/);
    assert.match(html, /Kundkategorier och geografi/);
    assert.match(html, /Geografisk riskfaktorer – egen hemvist/);
    assert.match(html, /Geografisk riskfaktorer – motparters geografi/);
    assert.match(html, /value="Geografisk riskfaktorer - här finns byråns kunder">Geografisk riskfaktorer – egen hemvist/);
    assert.match(html, /value="Geografisk riskfaktorer - här finns kundens kunder & leverantörer">Geografisk riskfaktorer – motparters geografi/);
    assert.match(html, /geo-risk-typer\.js\?v=2/);
    assert.match(html, /id="riskhoj-katalog-section"/);
    assert.match(html, /id="risksank-katalog-section"/);
    assert.match(html, /ovriga-riskfaktorer\.js\?v=48/);
    assert.match(html, /Din resa/);
    assert.match(html, /data-risk-tab="utforande"/);
    assert.match(html, /data-risk-tab="hot"/);
    assert.match(html, /data-risk-tab="sarbarhet"/);
    assert.match(html, /data-risk-tab="oversikt"/);
    assert.match(html, /Frågor från din ClientFlow AI/);
    assert.match(html, /tjanst-resa-progress/);
    assert.match(html, /styles\.css\?v=20260913branschdrill/);
    assert.match(html, /novalidate/);
    assert.match(html, /id="kundrisker-enkat-section"/);
    assert.match(html, /id="kundrisker-enkat-root"/);
    assert.match(html, /id="kundrisker-nav-alert"/);
    assert.match(html, /kundrisker-profil-analysforslag\.js\?v=2/);
    assert.match(html, /kundrisker-enkat-sammanfattning\.js\?v=5/);
    assert.match(html, /components\.js\?v=2\.4/);
    assert.match(html, /components\.js\?v=2\.4/);
    assert.doesNotMatch(html, /Verksamhetsspecifika riskfaktorer/);
    assert.doesNotMatch(html, /Distrubutionskanaler/);

    assert.match(ovriga, /data-risk-page-scope="ovriga"/);
    assert.match(ovriga, /Vilka är våra kunder/);
    assert.match(ovriga, /geo-risk-typer\.js\?v=2/);
    assert.doesNotMatch(ovriga, /<h3>Distribution, geografi och verksamhet<\/h3>/);
    assert.doesNotMatch(ovriga, /Geografisk riskfaktorer - här finns byråns kunder/);
    assert.doesNotMatch(ovriga, /Geografisk riskfaktorer – egen hemvist/);
    assert.match(ovriga, /id="riskhoj-katalog-section"/);
    assert.doesNotMatch(ovriga, /id="risksank-katalog-section"/);
    assert.doesNotMatch(ovriga, /Riskfaktorer kopplat till kund/);
    assert.match(ovriga, /kundrisker-mm\.html/);
    assert.match(ovriga, /ovriga-riskfaktorer\.js\?v=48/);
    assert.match(ovriga, /Din resa/);
    assert.match(ovriga, /data-risk-tab="inneboende"/);
    assert.match(ovriga, /tjanst-modal-content/);
    assert.match(ovriga, /styles\.css\?v=20260912navstatus/);
    assert.match(ovriga, /id="byra-profil-kaskad"/);
    assert.match(ovriga, /byra-profil-risk-forslag\.js\?v=1/);
    assert.match(ovriga, /Byråns geografiska marknad/);

    assert.match(js, /pageScope/);
    assert.match(js, /riskBelongsToPageScope/);
    assert.match(js, /isKundriskerPage/);
    assert.match(js, /migrateRenamedGeoTyp/);
    assert.match(js, /migrateRenamedRiskFactorLabels/);
    assert.match(js, /migrateMisplacedKundTransactionFactors/);
    assert.match(js, /\{\s*'Typ av riskfaktor':\s*newTyp\s*\}/);
    assert.match(js, /\{\s*Riskfaktor:\s*canonical\s*\}/);
    assert.match(js, /ensureMotpartGeoTemplates/);
    assert.match(js, /effectiveTyp/);
    assert.match(js, /egen hemvist/);
    assert.match(js, /motparters geografi/);
    assert.doesNotMatch(js, /risk-subgroup/);
    assert.match(js, /loadKundantal/);
    assert.match(js, /renderKundCountBadge/);
    assert.match(js, /risk-group--geografiska/);
    assert.match(js, /Inaktivera/);
    assert.match(js, /clearOvrigInlineAi\(/);
    assert.match(js, /bumpAiSuggestionEpoch\(/);
    assert.match(js, /openAddModal\(prefill\)[\s\S]*?clearOvrigInlineAi\('add-risk-modal'\)/);
    assert.match(js, /openEditModal\(recordId\)[\s\S]*?clearOvrigInlineAi\('edit-risk-modal'\)/);
    assert.match(js, /closeModal\(modalId\)[\s\S]*?clearOvrigInlineAi\(modalId\)/);
    assert.match(js, /requestEpoch !== this\._aiSuggestionEpoch/);

    assert.match(sidebar, /data-page="kundrisker-mm"/);
    assert.match(sidebar, /kundrisker-mm\.html/);
    assert.match(sidebar, /Vilka är våra kunder/);
    const ovrigaPos = sidebar.indexOf('data-page="ovriga-riskfaktorer"');
    const kundriskerPos = sidebar.indexOf('data-page="kundrisker-mm"');
    assert.ok(
      ovrigaPos >= 0 && kundriskerPos >= 0 && kundriskerPos < ovrigaPos,
      'Vilka är våra kunder ska ligga före Övriga riskfaktorer i sidomenyn'
    );
  });
});
