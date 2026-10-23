const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('kundresa popup layout', () => {
  const ui = fs.readFileSync(path.join(root, 'public/js/kundresa-ui.js'), 'utf8');
  const kk = fs.readFileSync(path.join(root, 'public/js/kundkort.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');

  it('har en scroll-body med footer utanför', () => {
    assert.match(ui, /kundresa-popup-scroll/);
    assert.match(ui, /data-kundresa-scroll/);
    // Host ligger i scroll; nav (footer) efter scroll-diven
    const scrollIdx = ui.indexOf('kundresa-popup-scroll');
    const hostIdx = ui.indexOf('id="kundresa-step-host"');
    const navIdx = ui.indexOf('kundresa-step-nav');
    assert.ok(scrollIdx > 0 && hostIdx > scrollIdx);
    assert.ok(navIdx > hostIdx);
    assert.match(css, /\.kundresa-popup-scroll\s*\{[^}]*overflow-y:\s*auto/s);
    assert.match(css, /\.kundresa-step-host\s*\{[^}]*overflow:\s*visible/s);
  });

  it('lägger VH-panelen i scroll-bodyn och flyttar in den i host för steg 1', () => {
    assert.match(ui, /data-kundresa-vh-panel/);
    assert.match(ui, /under Personer ovan/);
    assert.match(kk, /kundresa-vh-panel/);
    assert.match(kk, /roller-screening-toolbar/);
    assert.match(kk, /_kundresaMovedExtras/);
    assert.match(kk, /titleEl\.textContent = 'Personer'/);
  });

  it('använder segmentknappar som styr dolt select', () => {
    assert.match(ui, /data-kundresa-vh-seg/);
    assert.match(ui, /kundresa-vh-select-hidden/);
    assert.match(ui, /sel\.value = btn\.getAttribute\('data-kundresa-vh-seg'\)/);
    assert.match(ui, /dispatchEvent\(new Event\('change'/);
    assert.match(css, /\.kundresa-vh-segments/);
    assert.match(css, /\.kundresa-vh-status-banner/);
  });

  it('plattar sektioner och håller 72ch ingress', () => {
    assert.match(css, /#kundresa-step-host > \.kundresa-embedded-card\.collapsible-card/);
    assert.match(css, /box-shadow:\s*none/);
    assert.match(css, /max-width:\s*72ch/);
    assert.match(kk, /Ledamöter hämtas från Bolagsverket snart/);
    assert.match(kk, /roller-add-actions/);
  });
});
