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

  it('reuses byra-resa card classes in kundresa UI', () => {
    assert.match(ui, /byra-resa-step-card/);
    assert.match(ui, /kundresa-steps--cards/);
    assert.match(ui, /Onboarding &amp; KYC|Onboarding/);
  });

  it('wires mode switch and godkannande share flow in kundkort.js', () => {
    assert.match(js, /setKundkortMode/);
    assert.match(js, /_gotoKundresaStep/);
    assert.match(js, /loadGodkannande/);
    assert.match(js, /_skickaRiskgranskning/);
    assert.match(js, /nykund-tjanster/);
    assert.match(js, /focus === 'screening'/);
  });

  it('styles mode switch and godkannande surface', () => {
    assert.match(css, /\.kundkort-mode-switch/);
    assert.match(css, /\.kundresa-steps--cards/);
    assert.match(css, /\.godkannande-shell/);
  });
});
