const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  BYRA_PROFIL_FIELDS,
  CHOICE_BETALNINGSMONSTER,
  parseBetalningsmonster,
  normalizeBetalningsmonsterValue,
  formatBetalningsmonster,
  mapProfilFromAirtable,
  formatProfilDisplayValue,
  buildProfilAirtableFields
} = require('./byra-profil-fields');

describe('betalningsmonster multiselect', () => {
  it('är flerval med allowCustom och kuraterade val', () => {
    const field = BYRA_PROFIL_FIELDS.find((f) => f.key === 'betalningsmonster');
    assert.equal(field.type, 'multiselect');
    assert.equal(field.allowCustom, true);
    assert.ok(field.choices.includes('Swish'));
    assert.deepEqual(field.choices, CHOICE_BETALNINGSMONSTER);
  });

  it('migrerar fritext till kryssrutor', () => {
    assert.deepEqual(parseBetalningsmonster('Faktura och Swish är vanligast.'), ['Faktura', 'Swish']);
    assert.equal(
      normalizeBetalningsmonsterValue('Kontant och Swish i butik, faktura i övrigt'),
      'Kontant, Faktura, Swish'
    );
  });

  it('behåller egna alternativ i listformat', () => {
    assert.deepEqual(parseBetalningsmonster('Faktura, Swish, PayPal'), ['Faktura', 'Swish', 'PayPal']);
    assert.equal(formatBetalningsmonster(['Swish', 'Klarna']), 'Swish, Klarna');
  });

  it('normaliserar vid Airtable-läsning och -skrivning', () => {
    const mapped = mapProfilFromAirtable({ 'Betalningsmönster': 'Faktura och Swish är vanligast.' });
    assert.equal(mapped.betalningsmonster, 'Faktura, Swish');
    const { fields, errors } = buildProfilAirtableFields({
      betalningsmonster: 'Faktura och Swish är vanligast.'
    });
    assert.equal(errors.length, 0);
    assert.equal(fields['Betalningsmönster'], 'Faktura, Swish');
    const field = BYRA_PROFIL_FIELDS.find((f) => f.key === 'betalningsmonster');
    assert.equal(formatProfilDisplayValue(field, 'Faktura, Swish'), 'Faktura · Swish');
  });
});
