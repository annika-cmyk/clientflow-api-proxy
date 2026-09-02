const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  BYRA_PROFIL_FIELDS,
  BYRA_PROFIL_SECTIONS,
  HOGRISK_NONE_LABEL,
  unansweredKeys,
  isProfilComplete,
  isFieldRequired,
  mapProfilFromAirtable,
  airtableEnsureSpecs,
  formatProfilPromptBlock
} = require('./byra-profil-fields');

function sampleValue(field) {
  if (field.type === 'number' || field.type === 'percent') return 1;
  if (field.key === 'branscherKundstock') return HOGRISK_NONE_LABEL;
  if ((field.type === 'select' || field.type === 'multiselect') && Array.isArray(field.choices) && field.choices.length) {
    return field.choices[0];
  }
  return 'Ja';
}

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

  it('kräver alla obligatoriska fält för komplett profil', () => {
    assert.equal(isProfilComplete({}), false);
    const full = Object.fromEntries(BYRA_PROFIL_FIELDS.map((f) => [f.key, sampleValue(f)]));
    assert.equal(unansweredKeys(full).length, 0);
    assert.equal(isProfilComplete(full), true);
  });

  it('kräver Annat-text endast när Annat är valt', () => {
    const base = Object.fromEntries(BYRA_PROFIL_FIELDS.map((f) => [f.key, sampleValue(f)]));
    base.bokforingssystem = 'Fortnox';
    base.bokforingssystemAnnat = '';
    assert.equal(isFieldRequired(BYRA_PROFIL_FIELDS.find((f) => f.key === 'bokforingssystemAnnat'), base), false);
    assert.ok(!unansweredKeys(base).includes('bokforingssystemAnnat'));

    base.bokforingssystem = 'Annat';
    assert.equal(isFieldRequired(BYRA_PROFIL_FIELDS.find((f) => f.key === 'bokforingssystemAnnat'), base), true);
    assert.ok(unansweredKeys(base).includes('bokforingssystemAnnat'));

    base.bokforingssystemAnnat = 'Eget system';
    assert.ok(!unansweredKeys(base).includes('bokforingssystemAnnat'));
    assert.equal(isProfilComplete(base), true);

    base.bokforingssystem = 'Fortnox, Annat';
    base.bokforingssystemAnnat = '';
    assert.equal(isFieldRequired(BYRA_PROFIL_FIELDS.find((f) => f.key === 'bokforingssystemAnnat'), base), true);
    assert.ok(unansweredKeys(base).includes('bokforingssystemAnnat'));
    base.bokforingssystemAnnat = 'Eget system';
    assert.ok(!unansweredKeys(base).includes('bokforingssystemAnnat'));
  });

  it('mappar Airtable och skapar ensure-specs för IT-systemkolumner', () => {
    const mapped = mapProfilFromAirtable({
      'Antal kontor': 2,
      Bokföringssystem: 'Fortnox',
      Bokslutssystem: 'Capego',
      Kundhanteringssystem: 'ClientFlow'
    });
    assert.equal(mapped.antalKontor, 2);
    assert.equal(mapped.bokforingssystem, 'Fortnox');
    assert.equal(mapped.bokslutssystem, 'Capego');
    assert.equal(mapped.kundhanteringssystem, 'ClientFlow');
    const mappedMulti = mapProfilFromAirtable({
      Bokföringssystem: ['Fortnox', 'Visma']
    });
    assert.equal(mappedMulti.bokforingssystem, 'Fortnox, Visma');
    const specs = airtableEnsureSpecs();
    assert.ok(specs.some((s) => s.name === 'Antal kontor'));
    assert.ok(specs.some((s) => s.name === 'Bokföringssystem' && s.type === 'singleLineText'));
    assert.ok(specs.some((s) => s.name === 'Bokslutssystem'));
    assert.ok(specs.some((s) => s.name === 'Kundhanteringssystem'));
    assert.ok(specs.some((s) => s.name === 'Bokföringssystem annat' && s.type === 'singleLineText'));
    assert.ok(!specs.some((s) => s.name === 'Antal anställda'));
  });

  it('formaterar promptblock', () => {
    const block = formatProfilPromptBlock({
      antalAnstallda: 3,
      branscherKundstock: HOGRISK_NONE_LABEL,
      bokforingssystem: 'Fortnox'
    });
    assert.match(block, /Antal anställda: 3/);
    assert.match(block, /Inga högriskbranscher/);
    assert.match(block, /Bokföringssystem: Fortnox/);
    assert.doesNotMatch(block, /Bokföringssystem \(annat\)/);
  });
});
