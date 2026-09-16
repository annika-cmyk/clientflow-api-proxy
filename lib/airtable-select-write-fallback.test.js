const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isSelectOptionWriteError,
  nextSelectWriteFallback
} = require('./airtable-select-write-fallback');

describe('airtable-select-write-fallback', () => {
  it('känner igen Insufficient permissions för Eget uppdrag', () => {
    const msg = 'Insufficient permissions to create new select option ""Eget uppdrag""';
    assert.equal(isSelectOptionWriteError(msg), true);
  });

  it('typecast först, droppa Typ därefter', () => {
    const msg = 'Insufficient permissions to create new select option ""Eget uppdrag""';
    assert.deepEqual(
      nextSelectWriteFallback({
        message: msg,
        usedTypecast: false,
        fields: { Typ: 'Eget uppdrag', Status: 'Planerad' }
      }),
      { action: 'retry_typecast' }
    );
    assert.deepEqual(
      nextSelectWriteFallback({
        message: msg,
        usedTypecast: true,
        fields: { Typ: 'Eget uppdrag', Status: 'Planerad' }
      }),
      { action: 'drop_field', field: 'Typ' }
    );
  });

  it('andra fel failar', () => {
    assert.deepEqual(
      nextSelectWriteFallback({
        message: 'REQUEST_TIMEOUT',
        usedTypecast: false,
        fields: { Typ: 'Eget uppdrag' }
      }),
      { action: 'fail' }
    );
  });
});
