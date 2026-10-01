const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('byra-profil-enkate source badges', () => {
  const js = fs.readFileSync(path.join(__dirname, '../public/js/byra-profil-enkate.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../public/byra-profil-enkate.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');

  it('spårar Clientflow-källa och visar justerad-badge efter manuell ändring', () => {
    assert.match(js, /FIELD_SOURCES_STORAGE|byraProfilFieldSources/);
    assert.match(js, /fieldSources\[key\] = 'clientflow'/);
    assert.match(js, /clientflow-justerad/);
    assert.match(js, /Clientflow · justerad/);
    assert.match(js, /noteUserEdit/);
    assert.match(js, /fieldSourceBadgeEl/);
    assert.match(js, /statistik-source-badge--byraprofil/);
    assert.match(js, /loadPersistedFieldSources/);
    assert.match(html, /byra-profil-enkate\.js\?v=20261001sourcebadges/);
    assert.match(css, /statistik-source-badge--justerad/);
  });

  it('dokumenterar justerad-UX i Clientflow-bannern', () => {
    assert.match(js, /justerade fält markeras Clientflow · justerad/);
  });
});
