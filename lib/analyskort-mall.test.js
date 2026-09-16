const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AnalyskortMall = require('../public/js/analyskort-mall');

const EXPECTED = AnalyskortMall.RESA_STEPS.map((s) => s.id);

describe('analyskort-mall (gemensam mall)', () => {
  it('har samma 7 Din resa-steg som tjänstereferensen', () => {
    assert.deepEqual(EXPECTED, [
      'utforande', 'oversikt', 'hot', 'sarbarhet', 'inneboende', 'atgard', 'residual'
    ]);
  });

  it('renderar tjänstmodal med referens-ID:n och Din resa', () => {
    const html = AnalyskortMall.renderPageModals('tjanst');
    assert.match(html, /id="tjanst-modal"/);
    assert.match(html, /data-tjanst-tab="utforande"/);
    assert.match(html, /data-tjanst-panel="oversikt"/);
    assert.match(html, /tjanst-modal-utforande/);
    assert.match(html, /tjanst-klarmarkera-btn/);
    assert.match(html, /data-resa-blob="residual"/);
    assert.match(html, /Spara utkast/);
    assert.match(html, /Feedback till ClientFlow/);
    const tabs = [...html.matchAll(/data-tjanst-tab="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(tabs, EXPECTED);
  });

  it('exponerar bindResaTabClicks för blob-klarmarkering', () => {
    assert.equal(typeof AnalyskortMall.bindResaTabClicks, 'function');
    const html = AnalyskortMall.renderPageModals('tjanst');
    const blobs = [...html.matchAll(/data-resa-blob="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(blobs, EXPECTED);
  });

  it('bindResaTabClicks: blob → klarmarkera, etikett → navigera', () => {
    const navigated = [];
    const toggled = [];
    const listeners = [];
    const blob = {
      closest(sel) {
        return sel === '[data-resa-blob]' ? blob : null;
      }
    };
    const label = {
      closest() {
        return null;
      }
    };
    const tab = {
      dataset: {},
      contains(node) {
        return node === blob || node === label;
      },
      getAttribute(name) {
        return name === 'data-tjanst-tab' ? 'residual' : null;
      },
      addEventListener(type, fn) {
        listeners.push({ type, fn });
      }
    };
    const root = {
      querySelectorAll(sel) {
        assert.equal(sel, '.tjanst-tab[data-tjanst-tab]');
        return [tab];
      }
    };
    AnalyskortMall.bindResaTabClicks(root, {
      tabAttr: 'data-tjanst-tab',
      onNavigate: (id) => navigated.push(id),
      onToggleKlar: (id) => toggled.push(id)
    });
    assert.equal(tab.dataset.resaBlobBound, '1');
    assert.equal(listeners.length, 1);
    listeners[0].fn({
      target: blob,
      preventDefault() {}
    });
    listeners[0].fn({
      target: label,
      preventDefault() {}
    });
    assert.deepEqual(toggled, ['residual']);
    assert.deepEqual(navigated, ['residual']);
  });

  it('renderar riskfaktormodaler för ovriga och kundrisker från samma mall', () => {
    for (const page of ['ovriga', 'kundrisker']) {
      const html = AnalyskortMall.renderPageModals(page);
      assert.match(html, /id="add-risk-modal"/);
      assert.match(html, /id="edit-risk-modal"/);
      assert.match(html, /data-risk-tab="utforande"/);
      assert.match(html, /data-risk-panel="hot"/);
      assert.match(html, /id="add-risk-klarmarkera-btn"/);
      assert.match(html, /id="edit-risk-klarmarkera-btn"/);
      assert.match(html, /tjanst-resa-progress/);
      const addStart = html.indexOf('id="add-risk-modal"');
      const editStart = html.indexOf('id="edit-risk-modal"');
      const add = html.slice(addStart, editStart);
      const edit = html.slice(editStart);
      assert.match(edit, /id="edit-record-id"/);
      assert.match(edit, /name="record-id"/);
      assert.doesNotMatch(add, /id="edit-record-id"/);
      const tabs = [...add.matchAll(/data-risk-tab="([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual(tabs.slice(0, 7), EXPECTED, page);
    }
  });

  it('ovriga och kundrisker får olika typ-alternativ men samma struktur', () => {
    const ovriga = AnalyskortMall.renderPageModals('ovriga');
    const kund = AnalyskortMall.renderPageModals('kundrisker');
    assert.match(ovriga, /Verksamhetsspecifika riskfaktorer/);
    assert.match(ovriga, /Distrubutionskanaler/);
    assert.doesNotMatch(ovriga, /Riskfaktorer kopplat till kund/);
    assert.match(kund, /Riskfaktorer kopplat till kund/);
    assert.match(kund, /egen hemvist/);
    assert.doesNotMatch(kund, /Verksamhetsspecifika riskfaktorer/);
  });

  it('renderCard ger samma analyskort-klass för tjänst och riskfaktor', () => {
    const card = AnalyskortMall.renderCard({
      title: 'Test',
      aktiv: true,
      hasAnalysis: true,
      progress: { doneCount: 2, total: 7, complete: false },
      badges: { inneboende: 'Normal (S×K 9)' },
      overviewHtml: '<p>Översikt</p>',
      menuHtml: '<button type="button">Redigera</button>',
      dataAttrsHtml: ' data-analyskort-kind="riskfaktor"'
    });
    assert.match(card, /class="analyskort tjanst-mall-card/);
    assert.match(card, /data-has-overview/);
    assert.match(card, /tjanst-mall-progress is-partial/);
    assert.match(card, /data-analyskort-kind="riskfaktor"/);
  });

  it('HTML-sidor monterar den gemensamma mallen', () => {
    for (const [file, kind] of [
      ['riskbedomning-byra.html', 'tjanst'],
      ['ovriga-riskfaktorer.html', 'ovriga'],
      ['kundrisker-mm.html', 'kundrisker']
    ]) {
      const html = fs.readFileSync(path.join(__dirname, '../public', file), 'utf8');
      assert.match(html, /analyskort-mall\.js/);
      assert.match(html, new RegExp(`data-analyskort-modals="${kind}"`));
      assert.doesNotMatch(html, /id="add-risk-modal"/);
      if (kind === 'tjanst') {
        assert.doesNotMatch(html, /id="tjanst-modal"/);
      }
    }
  });

  it('JS monterar mallen innan RiskManager skapas', () => {
    const tjanstJs = fs.readFileSync(path.join(__dirname, '../public/js/riskbedomning-byra.v5.js'), 'utf8');
    const riskJs = fs.readFileSync(path.join(__dirname, '../public/js/ovriga-riskfaktorer.js'), 'utf8');
    assert.match(tjanstJs, /AnalyskortMall\.mountPageModals\(document, 'tjanst'\)/);
    assert.match(riskJs, /AnalyskortMall\.mountPageModals\(document, pageKind\)/);
    assert.match(tjanstJs, /Mall\.renderCard/);
    assert.match(riskJs, /Mall\.renderCard/);
    assert.match(tjanstJs, /AnalyskortMall\.bindResaTabClicks/);
    assert.match(riskJs, /AnalyskortMall\.bindResaTabClicks/);
    assert.match(tjanstJs, /toggleKlarmarkering\(id\)/);
    assert.match(riskJs, /toggleRiskKlarmarkering\(mode, id\)/);
  });
});
