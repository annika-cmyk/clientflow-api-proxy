const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const kundkort = fs.readFileSync(path.join(root, 'public/js/kundkort.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');

describe('kundresa steg 2 beskrivning & frågor', () => {
  it('har chips och placeholders för de fyra beskrivningsfälten', () => {
    assert.match(kundkort, /placeholder: 'T\.ex\. Skogsbruk på egen fastighet/);
    assert.match(kundkort, /label: 'Leverantörer'/);
    assert.match(kundkort, /label: 'Faktureringsprogram'/);
    assert.match(kundkort, /label: 'Tidigare konsult\/revisor'/);
    assert.match(kundkort, /KUNDRESA_STEP2_KYC_FRAGOR/);
  });

  it('enhancar steg 2 i popupen utan att ändra datamodellen', () => {
    assert.match(kundkort, /_enhanceKundresaStep2\(/);
    assert.match(kundkort, /_enhanceBeskrivningDelkortForStep2\(/);
    assert.match(kundkort, /saveBeskrivningDelkort\(id, \{ silent: true \}\)/);
    assert.match(kundkort, /_autosaveKycStep2\(/);
    assert.match(kundkort, /ku-\$\{.*\}-input/);
    assert.match(kundkort, /kyc-vh-noterat-bolag/);
    assert.match(kundkort, /kyc-kontanter/);
    assert.match(kundkort, /kyc-kryptovaluta/);
  });

  it('scopar steg-2-stilar till #kundresa-step-host', () => {
    assert.match(css, /#kundresa-step-host \.kundresa-step2-textarea/);
    assert.match(css, /#kundresa-step-host \.kundresa-step2-chip/);
    assert.match(css, /#kundresa-step-host \.kundresa-step2-segments/);
    assert.match(css, /#kundresa-step-host \.kundresa-step2-hide/);
    assert.match(css, /#kundresa-step-host \.kundresa-step2-progress/);
  });

  it('behåller penna\/read-mode-render för kundkort utanför popup', () => {
    assert.match(kundkort, /card-edit-fab/);
    assert.match(kundkort, /toggleBeskrivningDelkortEdit/);
    assert.match(kundkort, /missing-data">Ej angiven/);
    assert.match(kundkort, /_renderBeskrivningDelkort/);
  });
});
