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
    assert.match(ui, /getAttribute\('data-kundresa-vh-seg'\)/);
    assert.match(ui, /sel\.value = val/);
    assert.match(ui, /dispatchEvent\(new Event\('change'/);
    assert.match(css, /\.kundresa-vh-segments/);
    assert.match(css, /\.kundresa-vh-status-banner/);
  });

  it('behåller Förslag 1-struktur med Lugnare-chrome (Förslag 2)', () => {
    assert.match(css, /#kundresa-step-host > \.kundresa-embedded-card\.collapsible-card/);
    assert.match(css, /Förslag 2 · Lugnare/);
    assert.match(css, /\.kundresa-step1-checklist\s*\{[^}]*display:\s*none/s);
    assert.match(css, /border-bottom:\s*1px solid #E6E9EC/);
    assert.match(css, /\.kundresa-popup-tabs\s*\{[^}]*background:\s*#F7F8F9/s);
    assert.match(css, /\.kundresa-step-remaining/);
    assert.match(ui, /kundresa-step1-checklist/);
    assert.match(ui, /remainingLabel/);
    assert.match(ui, /Sparas direkt/);
    assert.match(ui, /calmTitle/);
    assert.match(ui, /Kontroller/);
    assert.match(kk, /Ledamöter hämtas automatiskt från Bolagsverket längre fram/);
    assert.match(kk, /roller-add-actions/);
    assert.match(kk, /roller-person-list--table/);
    assert.match(kk, /data-kundresa-sec/);
    assert.match(kk, /Kunduppläggning –/);
  });

  it('väntar på company cards utan setTimeout-gissning och använder ankare', () => {
    assert.match(kk, /_ensureCompanyCardsReady/);
    assert.match(kk, /_companyInfoReadyResolve/);
    assert.match(kk, /data-kundresa-anchor/);
    assert.match(kk, /_kundresaMountGeneration/);
    assert.match(kk, /_kundresaMountInFlight/);
    assert.doesNotMatch(kk, /setTimeout\(r,\s*40\)/);
    assert.match(kk, /saknar kort vid mount/);
    assert.match(kk, /rolle-person-modal/);
    assert.match(kk, /_refreshKundresaAfterRollerChange/);
    assert.match(kk, /bv-orgnr-missing-hint|kundresa-orgnr-missing/);
  });

  it('steg 3: redovisning autosave + kompakta tjänster under #kundresa-step-host', () => {
    assert.match(kk, /_enhanceKundresaStep3/);
    assert.match(kk, /_renderTjansterKundresaCompact/);
    assert.match(kk, /_autosaveKundresaTjanster/);
    assert.match(kk, /saveRedovisning\(\{ silent: true, keepEditing: true \}\)/);
    assert.match(kk, /Visa bara valda/);
    assert.match(kk, /Välj de tjänster byrån ska utföra/);
    assert.match(kk, /Residualrisk S×K/);
    assert.match(kk, /kundresa-tjanst-risk--low/);
    assert.match(css, /#kundresa-step-host \.kundresa-tjanster-grid/);
    assert.match(css, /#kundresa-step-host \.kundresa-redovisning-live/);
    assert.match(css, /accent-color:\s*var\(--accent\)/);
    assert.match(ui, /isStep3/);
    assert.match(ui, /step3Substatus/);
  });

  it('steg 4 review-and-send i popupen (send-panel + footer Skicka/Klar)', () => {
    const skicka = fs.readFileSync(path.join(root, 'public/js/kundresa-kyc-skicka.js'), 'utf8');
    assert.match(ui, /data-kundresa-kyc-send/);
    assert.match(ui, /data-kundresa-klar/);
    assert.match(ui, /isStep4/);
    assert.match(kk, /_mountKundresaKycSkickaStep/);
    assert.match(kk, /_buildKundresaStep4Send/);
    assert.match(kk, /_sendKycFromKundresa/);
    assert.match(skicka, /Det här får kunden svara på/);
    assert.match(skicka, /Skicka till kund/);
    assert.match(skicka, /Kopiera länk/);
    assert.match(skicka, /Öppna som kunden ser det/);
    assert.match(skicka, /Förifyllt från steg 2/);
    assert.match(css, /#kundresa-step-host \.kundresa-kyc-send-panel/);
    assert.match(css, /#kundresa-step-host ::placeholder/);
  });

});
