const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AnalyskortMall = require('../public/js/analyskort-mall');

const EXPECTED = ['utforande', 'oversikt', 'hot', 'sarbarhet', 'inneboende', 'atgard', 'residual'];

function tabOrder(html) {
  return [...html.matchAll(/data-risk-tab="([^"]+)"/g)].map((m) => m[1]);
}

describe('riskfaktor Din resa', () => {
  for (const page of ['ovriga', 'kundrisker']) {
    it(`${page}: gemensam mall har samma 7 steg som tjänsteanalysen`, () => {
      const html = AnalyskortMall.renderPageModals(page);
      const addStart = html.indexOf('id="add-risk-modal"');
      const editStart = html.indexOf('id="edit-risk-modal"');
      const add = html.slice(addStart, editStart);
      const edit = html.slice(editStart);
      assert.deepEqual(tabOrder(add).slice(0, 7), EXPECTED);
      assert.deepEqual(tabOrder(edit).slice(0, 7), EXPECTED);
      assert.match(add, /Frågor från din ClientFlow AI/);
      assert.match(add, /Hot och modus/);
      assert.match(add, /Sårbarheter/);
      assert.match(add, /tjanst-resa-progress/);
      assert.match(add, /tjanst-klarmarkera-btn/);
      assert.match(add, /data-resa-blob="residual"/);
      assert.match(add, /tjanst-panel-klar-footer[\s\S]*?id="add-risk-klarmarkera-btn"/);
      assert.match(
        add,
        /<div class="tjanst-panel-klar-bar">\s*<span id="add-risk-resa-progress" class="tjanst-resa-progress" hidden><\/span>\s*<\/div>/
      );
      assert.match(add, /data-risk-panel="utforande"/);
      assert.match(add, /data-risk-panel="hot"/);
      assert.match(add, /data-risk-panel="sarbarhet"/);
      assert.match(add, /id="add-hot-list"/);
    });
  }

  it('JS öppnar på utforande och sparar Hot/Sårbarheter', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/js/ovriga-riskfaktorer.js'), 'utf8');
    assert.match(js, /setRiskTab\('add-risk-modal', 'utforande'\)/);
    assert.match(js, /setRiskTab\('edit-risk-modal', 'utforande'\)/);
    assert.match(js, /collectHot\(/);
    assert.match(js, /collectSarbarhet\(/);
    assert.match(js, /'Hot': JSON\.stringify/);
    assert.match(js, /'Sårbarheter': JSON\.stringify/);
    assert.match(js, /tjanstResaProgress/);
    assert.match(js, /bindRiskKlarmarkering/);
    assert.match(js, /bindResaTabClicks/);
    assert.match(js, /toggleRiskKlarmarkering\(mode, id\)/);
    assert.match(js, /advanceRiskResaAfterKlar/);
    assert.match(js, /persistRiskKlarmarkeringViaSave/);
    assert.match(js, /_klarSaveInFlight/);
    assert.match(js, /turningOn/);
    assert.match(js, /setRiskTab\(modalId, flikar\[idx \+ 1\]\)/);
  });

  it('schema inkluderar Hot och Sårbarheter', () => {
    const { SCHEMA_FIELDS } = require('./ovriga-risk-fields');
    assert.ok(SCHEMA_FIELDS.some((f) => f.name === 'Hot'));
    assert.ok(SCHEMA_FIELDS.some((f) => f.name === 'Sårbarheter'));
    assert.ok(SCHEMA_FIELDS.some((f) => f.name === 'AI-extra underlag'));
  });
});
