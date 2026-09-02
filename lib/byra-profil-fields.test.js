const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  BYRA_PROFIL_FIELDS,
  BYRA_PROFIL_SECTIONS,
  HOGRISK_NONE_LABEL,
  unansweredKeys,
  isProfilComplete,
  mapProfilFromAirtable,
  airtableEnsureSpecs,
  formatProfilPromptBlock
} = require('./byra-profil-fields');

describe('byra-profil-fields', () => {
  it('har tio sektioner med fieldKeys', () => {
    assert.equal(BYRA_PROFIL_SECTIONS.length, 10);
    const ids = BYRA_PROFIL_SECTIONS.map((s) => s.id);
    assert.deepEqual(ids, [
      'intern',
      'kundstock',
      'distribution',
      'tjanster',
      'geografi',
      'historik',
      'beroende',
      'hogrisktjanster',
      'kundintro',
      'outsourcing'
    ]);
    BYRA_PROFIL_SECTIONS.forEach((s) => {
      assert.ok(Array.isArray(s.fieldKeys) && s.fieldKeys.length > 0, s.id);
    });
  });

  it('kräver alla fält för komplett profil', () => {
    assert.equal(isProfilComplete({}), false);
    const full = Object.fromEntries(BYRA_PROFIL_FIELDS.map((f) => [f.key, f.type === 'number' || f.type === 'percent' ? 1 : (f.key === 'branscherKundstock' ? HOGRISK_NONE_LABEL : 'Ja')]));
    assert.equal(unansweredKeys(full).length, 0);
    assert.equal(isProfilComplete(full), true);
  });

  it('mappar Airtable och skapar ensure-specs för nya fält', () => {
    const mapped = mapProfilFromAirtable({ 'Antal kontor': 2, 'IT-system': 'Fortnox' });
    assert.equal(mapped.antalKontor, 2);
    assert.equal(mapped.itSystem, 'Fortnox');
    const specs = airtableEnsureSpecs();
    assert.ok(specs.some((s) => s.name === 'Antal kontor'));
    assert.ok(!specs.some((s) => s.name === 'Antal anställda'));
  });

  it('formaterar promptblock', () => {
    const block = formatProfilPromptBlock({ antalAnstallda: 3, branscherKundstock: HOGRISK_NONE_LABEL });
    assert.match(block, /Antal anställda: 3/);
    assert.match(block, /Inga högriskbranscher/);
  });
});
