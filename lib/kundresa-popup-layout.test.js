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
    assert.match(css, /\.kundresa-vh-segments/);
    assert.match(css, /\.kundresa-vh-status-banner/);
    assert.match(css, /#kundresa-step-host \.kundresa-vh-saved-hint/);
  });

  it('behåller Förslag 1-struktur med Lugnare-chrome (Förslag 2)', () => {
    assert.match(css, /#kundresa-step-host > \.kundresa-embedded-card\.collapsible-card/);
    assert.match(css, /Förslag 2 · Lugnare/);
    assert.match(css, /Förslag 1 · v2/);
    assert.match(css, /\.kundresa-popup-layout--steg1 \.kundresa-step1-checklist/);
    assert.match(css, /border-bottom:\s*1px solid #E6E9EC/);
    assert.match(css, /\.kundresa-popup-tabs\s*\{[^}]*background:\s*#F7F8F9/s);
    assert.match(css, /\.kundresa-step-remaining/);
    assert.match(ui, /kundresa-step1-checklist/);
    assert.match(ui, /kundresa-popup-layout--steg1/);
    assert.match(ui, /remainingLabel/);
    assert.match(ui, /calmTitle/);
    assert.match(ui, /Verifiera verklig huvudman/);
    assert.match(kk, /Ledamöter hämtas automatiskt från Bolagsverket längre fram/);
    assert.match(kk, /roller-add-actions/);
    assert.match(kk, /roller-person-list--table/);
    assert.match(kk, /data-kundresa-sec/);
    assert.match(kk, /Kunduppläggning –/);
  });

  it('steg 1: BV-fältgrid 3 kolumner, VH från personlista, saknad kontakt orange', () => {
    assert.match(css, /#kundresa-step-host \.lead-fields\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
    assert.match(css, /\.kundresa-popup-layout--steg1 #kundresa-step-host \.lead-fields\s*\{[^}]*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
    assert.match(css, /#kundresa-step-host \.lead-field\s*\{[^}]*flex-direction:\s*column/s);
    assert.doesNotMatch(css, /90px minmax\(0, 1fr\) 90px minmax\(0, 1fr\)/);
    assert.match(css, /#kundresa-step-host \.sni-code-badge[^}]*font-family:\s*inherit/s);
    assert.match(css, /#8A4105/);
    assert.match(css, /adress-utsatt-calm|Ej i utsatt/);
    assert.match(css, /kundresa-verksamhet-clamp|webkit-line-clamp:\s*1/);
    assert.match(css, /roller-person-line2|12\.5px/);
    assert.match(css, /roller-detail-missing--vh/);
    assert.match(kk, /_formatPersonnrDisplay/);
    assert.match(kk, /_vhRegisterFromKontakt/);
    assert.match(kk, /_verksamhetClampHtml|Visa hela/);
    assert.match(kk, /Ej i utsatt område/);
    assert.match(kk, /VH kontrollerad|formatHuvudmanBolagsverketShort/);
    assert.match(kk, /telefon saknas/);
    assert.match(kk, /Lägg till telefon \(krävs för VH\)/);
    assert.match(kk, /e-post saknas/);
    assert.match(kk, /_enhanceKundresaStep1/);
    assert.match(ui, /Registrerad VH:/);
    assert.match(ui, /formatVhRegisterEntry|personnr/);
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
