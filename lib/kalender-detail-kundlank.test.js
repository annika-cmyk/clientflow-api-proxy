const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('kalender detail kundlänk', () => {
  it('företagsnamnet länkar till kundkort och knappen Öppna kundkort är borttagen', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/js/kalender.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');

    assert.match(js, /kalender-detail-customer-link/);
    assert.match(js, /kundkort\.html\?id=/);
    assert.match(js, /title="Öppna kundkort"/);
    assert.doesNotMatch(js, />\s*Öppna kundkort\s*</);
    assert.doesNotMatch(js, /fa-user"><\/i>\s*Öppna kundkort/);
    assert.match(css, /\.kalender-detail-customer-link/);
    assert.match(css, /\.kalender-detail-customer-link:focus-visible/);
  });
});
