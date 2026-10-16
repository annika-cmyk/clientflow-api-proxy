const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('kundkort onboarding vs översikt layout', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/kundkort.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
  const ui = fs.readFileSync(path.join(__dirname, '../public/js/kundresa-ui.js'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '../public/js/kundkort.js'), 'utf8');

  it('has mode switch and split tab navigations', () => {
    assert.match(html, /data-kundkort-mode="onboarding"/);
    assert.match(html, /data-kundkort-mode="oversikt"/);
    assert.match(html, /data-kundkort-nav="arbete"/);
    assert.match(html, /data-kundkort-nav="oversikt"/);
    assert.match(html, /id="godkannande"/);
    assert.match(html, /id="kundresa-work-subnav"/);
  });

  it('shows KYC trigger by customer name and Din resa popup modal', () => {
    assert.match(html, /id="kundresa-open-btn"/);
    assert.match(html, /KYC och riskbedömning/);
    assert.match(html, /id="kundresa-modal"/);
    assert.match(html, /id="kundresa-shell"/);
    assert.match(html, /kundresa-shell-host--modal/);
  });

  it('renders kundresa as tjanst-tabs Din resa popup', () => {
    assert.match(ui, /tjanst-tabs/);
    assert.match(ui, /tjanst-tab-dot/);
    assert.match(ui, /Din resa/);
    assert.match(ui, /renderProgressIcon/);
    assert.match(ui, /kundresa-popup-layout/);
  });

  it('wires mode switch, popup and godkannande share flow in kundkort.js', () => {
    assert.match(js, /setKundkortMode/);
    assert.match(js, /setupKundresaModal/);
    assert.match(js, /openKundresaModal/);
    assert.match(js, /_updateKundresaTrigger/);
    assert.match(js, /_gotoKundresaStep/);
    assert.match(js, /loadGodkannande/);
    assert.match(js, /_skickaRiskgranskning/);
    assert.match(js, /nykund-tjanster/);
    assert.match(js, /focus === 'screening'/);
  });

  it('styles KYC trigger, popup and godkannande surface', () => {
    assert.match(css, /\.kundkort-mode-switch/);
    assert.match(css, /\.kundresa-trigger/);
    assert.match(css, /\.kundresa-modal-content/);
    assert.match(css, /\.kundresa-popup-tabs/);
    assert.match(css, /\.godkannande-shell/);
  });
});
