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
