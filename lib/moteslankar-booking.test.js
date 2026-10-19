const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  omitEmptyEmail,
  withoutExtended,
  unknownFieldNamesFromError,
  airtableErrorMessage,
  EXTENDED_INVITE_FIELDS
} = require('./moteslankar-booking');

describe('moteslankar-booking 422 helpers', () => {
  it('omitEmptyEmail tar bort tom Bokare e-post', () => {
    const out = omitEmptyEmail({
      Titel: 'Möte',
      'Bokare e-post': '  ',
      'Bokare namn': 'Annika'
    });
    assert.equal(out.Titel, 'Möte');
    assert.equal(out['Bokare namn'], 'Annika');
    assert.equal(Object.prototype.hasOwnProperty.call(out, 'Bokare e-post'), false);
  });

  it('omitEmptyEmail behåller giltig e-post', () => {
    const out = omitEmptyEmail({ 'Bokare e-post': 'annika@example.se' });
    assert.equal(out['Bokare e-post'], 'annika@example.se');
  });

  it('withoutExtended strippar Möteslänk-fält', () => {
    const out = withoutExtended({
      Titel: 'Bokslut',
      'Möteslänk ID': 'rec1',
      'Länk-slug': 'bokslutsmote',
      Källa: 'Möteslänk',
      Anteckning: 'yyy'
    });
    assert.equal(out.Titel, 'Bokslut');
    assert.equal(out.Anteckning, 'yyy');
    for (const key of EXTENDED_INVITE_FIELDS) {
      assert.equal(Object.prototype.hasOwnProperty.call(out, key), false);
    }
  });

  it('unknownFieldNamesFromError plockar Unknown field name', () => {
    const err = {
      response: {
        status: 422,
        data: {
          error: {
            type: 'UNKNOWN_FIELD_NAME',
            message: 'Unknown field name: "Möteslänk ID"'
          }
        }
      }
    };
    assert.deepEqual(unknownFieldNamesFromError(err), ['Möteslänk ID']);
    assert.match(airtableErrorMessage(err), /Möteslänk ID/);
  });

  it('unknownFieldNamesFromError vid INVALID_MULTIPLE_CHOICE strippar utökade fält', () => {
    const err = {
      response: {
        status: 422,
        data: {
          error: {
            type: 'INVALID_MULTIPLE_CHOICE_OPTIONS',
            message: 'Insufficient permissions to create new select option "Möteslänk"'
          }
        }
      }
    };
    const names = unknownFieldNamesFromError(err);
    assert.ok(names.includes('Källa'));
    assert.ok(names.includes('Möteslänk ID'));
  });
});
