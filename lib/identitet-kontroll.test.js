'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Id = require('./identitet-kontroll');

describe('identitet-kontroll', () => {
  it('formaterar Identitet kontrollerad [datum] via [metod]', () => {
    assert.equal(
      Id.formatLabel({
        identitetKontrolleradDatum: '2019-05-12',
        identitetKontrolleradMetod: 'fore_clientflow'
      }),
      'Identitet kontrollerad 2019-05-12 via Kontrollerad före ClientFlow'
    );
    assert.equal(Id.formatLabel({}), '');
  });

  it('sparar och rensar fält på person', () => {
    const withId = Id.applyToPerson(
      { namn: 'Anna', personnr: '19800101-1111' },
      '2024-03-01',
      'bankid_clientflow'
    );
    assert.equal(withId.identitetKontrolleradDatum, '2024-03-01');
    assert.equal(withId.identitetKontrolleradMetod, 'bankid_clientflow');
    const cleared = Id.applyToPerson(withId, '', '');
    assert.equal(cleared.identitetKontrolleradDatum, undefined);
    assert.equal(cleared.identitetKontrolleradMetod, undefined);
  });
});
