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

  it('låser popupens höjd/bredd och byter steg utan att remounta skalet', () => {
    assert.match(css, /#kundresa-modal\s*>\s*\.kundresa-modal-content\s*\{[^}]*height:\s*min\(90dvh,\s*920px\)/s);
    assert.match(css, /#kundresa-modal\s*>\s*\.kundresa-modal-content\s*\{[^}]*max-height:\s*min\(90dvh,\s*920px\)/s);
    assert.match(ui, /function updateActiveStep/);
    assert.match(ui, /updateActiveStep/);
    assert.match(kk, /_softGotoKundresaStep/);
    assert.match(kk, /updateActiveStep/);
    assert.match(kk, /_gotoKundresaStep[\s\S]*_softGotoKundresaStep/);
  });

  it('lägger VH-panelen i scroll-bodyn och flyttar in den i host för steg 1', () => {
    assert.match(ui, /data-kundresa-vh-panel/);
    assert.match(ui, /under Personer ovan/);
    assert.match(kk, /kundresa-vh-panel/);
    assert.match(kk, /roller-screening-toolbar/);
    assert.match(kk, /_kundresaMovedExtras/);
    assert.match(kk, /titleEl\.textContent = 'Personer'/);
  });

  it('använder segmentknappar som styr dolt select och sparar direkt', () => {
    assert.match(ui, /data-kundresa-vh-seg/);
    assert.match(ui, /kundresa-vh-select-hidden/);
    assert.match(ui, /getAttribute\('data-kundresa-vh-seg'\)/);
    assert.match(ui, /sel\.value = val/);
    assert.match(ui, /dispatchEvent\(new Event\('change'/);
    assert.match(ui, /emitVhSave\(\)/);
    assert.doesNotMatch(ui, /data-kundresa-vh-save(?!d)/);
    assert.doesNotMatch(ui, /kundresa-vh-save-btn/);
    assert.match(ui, /data-kundresa-vh-saved/);
    assert.match(ui, /Sparat/);
    assert.match(ui, /Registrerad VH:/);
    assert.match(ui, /formatVhRegisterEntry|personnr/);
    assert.match(ui, /is-fade|2000/);
    assert.match(ui, /kundresa-vh-q/);
    assert.match(ui, /Stämmer listan mot Bolagsverket/);
    assert.match(css, /\.kundresa-vh-segments/);
    assert.match(css, /\.kundresa-vh-status-banner/);
    assert.match(css, /#kundresa-step-host \.kundresa-vh-saved-hint/);
  });

  it('behåller Lugnare-chrome och Att göra först-checklista i host', () => {
    assert.match(css, /#kundresa-step-host > \.kundresa-embedded-card\.collapsible-card/);
    assert.match(css, /Förslag 2 · Lugnare/);
    assert.match(css, /Att göra först/);
    assert.match(css, /kundresa-att-gora|kundresa-check-row/);
    assert.match(css, /\.kundresa-popup-tabs\s*\{[^}]*background:\s*#F7F8F9/s);
    assert.match(css, /\.kundresa-step-remaining/);
    assert.match(ui, /remainingLabel/);
    assert.match(ui, /calmTitle/);
    assert.match(ui, /kundresa-popup-layout--steg1/);
    assert.match(ui, /controlsMeta/);
    assert.match(kk, /_mountKundresaStep1Checklist/);
    assert.match(kk, /Att göra först/);
    assert.match(kk, /roller-person-list--checklista/);
    assert.match(kk, /data-kundresa-sec/);
    assert.match(kk, /Kunduppläggning –/);
    assert.match(kk, /_refreshKundresaStep1Remaining/);
  });

  it('steg 1: checklista-rader, personer utan chips, BV kollapsad', () => {
    assert.match(css, /kundresa-check-row\.is-open/);
    assert.match(css, /#FFF9F2/);
    assert.match(css, /kundresa-bv-collapsed|Företaget enligt Bolagsverket/);
    assert.match(css, /kundresa-person-edit-link|kundresa-personer-add-link/);
    assert.match(kk, /_formatPersonnrDisplay/);
    assert.match(kk, /_vhRegisterFromKontakt/);
    assert.match(kk, /_styleKundresaStep1BvCollapsed|_expandKundresaBvBox/);
    assert.match(kk, /_saveKundresaChecklistKontakt/);
    assert.match(kk, /kundresa-person-edit-link/);
    assert.match(kk, /_enhanceKundresaStep1/);
    assert.match(kk, /Screena personer|Screena alla/);
    assert.match(kk, /Lägg till telefon för verklig huvudman/);
    assert.match(ui, /data-kundresa-vh-seg/);
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

  it('steg 3: redovisning autosave + tjänstechip under #kundresa-step-host', () => {
    assert.match(kk, /_enhanceKundresaStep3/);
    assert.match(kk, /_renderTjansterKundresaCompact/);
    assert.match(kk, /_autosaveKundresaTjanster/);
    assert.match(kk, /saveRedovisning\(\{ silent: true, keepEditing: true \}\)/);
    assert.match(kk, /Klicka för att välja\. Valen styr kundens riskbedömning/);
    assert.match(kk, /höjer risken/);
    assert.match(kk, /kundresa-tjanst-chip/);
    assert.match(kk, /_kundresaTjanstGroupKey/);
    assert.match(kk, /Högsta residualrisk/);
    assert.match(kk, /Bokslut & skatt/);
    assert.match(css, /#kundresa-step-host \.kundresa-tjanst-chip/);
    assert.match(css, /#kundresa-step-host \.kundresa-tjanster-summary/);
    assert.match(css, /#kundresa-step-host \.kundresa-redovisning-live/);
    assert.match(css, /border-radius:\s*17px/);
    assert.match(ui, /isStep3/);
    assert.match(ui, /step3Substatus/);
    assert.match(ui, /isStep2\(activeStep\) \|\| isStep3\(activeStep\)/);
    assert.match(ui, /Sparas automatiskt/);
  });

  it('steg 4 review-and-send i popupen (send-panel + footer Stäng)', () => {
    const skicka = fs.readFileSync(path.join(root, 'public/js/kundresa-kyc-skicka.js'), 'utf8');
    assert.match(ui, /data-kundresa-klar/);
    assert.match(ui, /isStep4/);
    assert.match(ui, />\s*Stäng\s*</);
    assert.doesNotMatch(ui, /data-kundresa-kyc-send(?!-)/);
    assert.match(kk, /_mountKundresaKycSkickaStep/);
    assert.match(kk, /_buildKundresaStep4Send/);
    assert.match(kk, /_sendKycFromKundresa/);
    assert.match(skicka, /Det här får kunden se/);
    assert.match(skicka, /Förifyllt visas som förslag som kunden bekräftar/);
    assert.match(skicka, /Skicka till kund/);
    assert.match(skicka, /Kopiera länk/);
    assert.match(skicka, /Öppna som kunden ser det/);
    assert.match(skicka, /questionsLabel|1 fråga/);
    assert.match(skicka, /Kunden svarar/);
    assert.doesNotMatch(skicka, /Förifyllt från steg 2/);
    assert.doesNotMatch(skicka, /Kunden behöver inte fylla i detta igen/);
    assert.match(skicka, /is-collapsed/);
    assert.match(skicka, /kundresa-kyc-blocker|Gå till steg/);
    assert.match(css, /#kundresa-step-host \.kundresa-kyc-send-panel/);
    assert.match(css, /grid-template-columns:\s*140px/);
    assert.match(css, /#kundresa-step-host ::placeholder/);
  });

});
