const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('Nytt lead-flöde', () => {
  it('har knapp i sidomenyn', () => {
    const sidebar = fs.readFileSync(path.join(root, 'public/Components/sidebar.html'), 'utf8');
    assert.match(sidebar, /id="sidebar-nytt-lead-btn"/);
    assert.match(sidebar, /Nytt lead/);
  });

  it('laddar nytt-lead-modul från components', () => {
    const js = fs.readFileSync(path.join(root, 'public/js/components.js'), 'utf8');
    assert.match(js, /initNyttLead/);
    assert.match(js, /nytt-lead\.js/);
  });

  it('popupen har Bolagsverket-sök först och saknar gammal introtext', () => {
    const js = fs.readFileSync(path.join(root, 'public/js/nytt-lead.js'), 'utf8');
    assert.match(js, /kundlista-add-sok-orgnr/);
    assert.match(js, /Sök organisationsnummer hos Bolagsverket/);
    assert.doesNotMatch(
      js,
      /Skapa en kund innan organisationsnummer finns/
    );
  });

  it('håller Bolagsverket-resultat i samma popup och fortsätter till setup=1', () => {
    const js = fs.readFileSync(path.join(root, 'public/js/nytt-lead.js'), 'utf8');
    assert.match(js, /kundlista-add-result-panel/);
    assert.match(js, /Fortsätt till kunduppläggning/);
    assert.match(js, /continueFromBolagsverketResult/);
    assert.match(js, /\/api\/bolagsverket\/organisationer/);
    assert.match(js, /\/api\/bolagsverket\/save-to-airtable/);
    // Sök ska inte bryta flödet genom att stänga och öppna separat Bolagsverket-modal
    assert.doesNotMatch(
      js,
      /closeModal\(\);\s*\n\s*openBolagsverketModal/
    );
  });

  it('dirigerar nya kunder till kundkort med setup=1', () => {
    const js = fs.readFileSync(path.join(root, 'public/js/nytt-lead.js'), 'utf8');
    assert.match(js, /setup:\s*true/);
    assert.match(js, /setup/);
    const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
    assert.match(app, /setup=1/);
  });

  it('öppnar kundresa-popup vid setup=1 på kundkort', () => {
    const js = fs.readFileSync(path.join(root, 'public/js/kundkort.js'), 'utf8');
    assert.match(js, /shouldOpenSetup/);
    assert.match(js, /openKundresaModal/);
    assert.match(js, /urlParams\.get\('setup'\)/);
  });

  it('kunduppläggning har fyra steg med VH-kontakt för AB', () => {
    const kundresa = require('./kundresa');
    assert.equal(kundresa.KUNDRESA_STEPS.length, 4);
    assert.equal(kundresa.KUNDRESA_STEPS[0].key, 'foretag_personer');
    assert.equal(kundresa.KUNDRESA_STEPS[3].key, 'kyc_skicka');
    const kk = fs.readFileSync(path.join(root, 'public/js/kundkort.js'), 'utf8');
    assert.match(kk, /rp-telefon/);
    assert.match(kk, /_renderLedamoterPlaceholders/);
    assert.match(kk, /Verklig huvudman kräver e-post och telefon/);
  });

  it('bäddar in korten i kundresa-popupen (inte bara länkar)', () => {
    const ui = fs.readFileSync(path.join(root, 'public/js/kundresa-ui.js'), 'utf8');
    const kk = fs.readFileSync(path.join(root, 'public/js/kundkort.js'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');
    assert.match(ui, /kundresa-step-host/);
    assert.match(ui, /kundresa-popup-scroll/);
    assert.match(ui, /data-kundresa-vh-seg/);
    assert.match(ui, /under Personer ovan/);
    assert.match(ui, /closeAfter:\s*false/);
    assert.doesNotMatch(ui, /Öppna steg/);
    assert.match(kk, /_mountKundresaStep/);
    assert.match(kk, /_unmountKundresaStep/);
    assert.match(kk, /_kundresaMovedExtras/);
    assert.match(kk, /_ensureCompanyCardsReady/);
    assert.match(kk, /data-kundresa-anchor/);
    assert.match(kk, /roller-screening-toolbar/);
    assert.match(kk, /kundresa-embedded-card/);
    assert.match(kk, /bolagsverket-card/);
    assert.match(kk, /roller-card/);
    assert.match(kk, /beskrivning-card/);
    assert.match(kk, /redovisning-card/);
    assert.match(kk, /nykund-tjanster-card/);
    assert.match(kk, /kycformular-content/);
    assert.match(kk, /Ledamöter hämtas automatiskt från Bolagsverket längre fram/);
    assert.match(css, /\.kundresa-popup-scroll/);
    assert.match(css, /\.kundresa-vh-segments/);
    assert.match(css, /#kundresa-step-host > \.kundresa-embedded-card/);
  });

  it('har by-orgnr-API för dubblettkoll med behörighet', () => {
    const index = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
    assert.match(index, /\/api\/kunddata\/by-orgnr/);
    assert.match(index, /hasAccess/);
    const lib = fs.readFileSync(path.join(root, 'lib/kund-by-orgnr.js'), 'utf8');
    assert.match(lib, /findKundByOrgnrForByra/);
  });

  it('visar behörighetsmeddelande vid dubblett utan access', () => {
    const js = fs.readFileSync(path.join(root, 'public/js/nytt-lead.js'), 'utf8');
    assert.match(js, /saknar behörighet/);
    const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
    assert.match(app, /hasAccess/);
  });
});
