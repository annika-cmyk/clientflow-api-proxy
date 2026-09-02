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

  it('formaterar Huvudman kontrollerad mot Bolagsverket [datum]', () => {
    assert.equal(
      Id.formatHuvudmanBolagsverketLabel({
        huvudmanKontrolleradBolagsverketDatum: '2026-08-28'
      }),
      'Huvudman kontrollerad mot Bolagsverket 2026-08-28'
    );
    assert.equal(Id.hasHuvudmanRoll(['Verklig huvudman', 'VD']), true);
    assert.equal(Id.hasHuvudmanRoll(['Styrelseledamot']), false);
  });

  it('tillåter BankID via ClientFlow utan datum', () => {
    assert.equal(Id.datumValfrittForMetod('bankid_clientflow'), true);
    assert.equal(Id.datumValfrittForMetod('fysiskt'), false);
    assert.equal(
      Id.formatLabel({ identitetKontrolleradMetod: 'bankid_clientflow' }),
      'Identitet kontrollerad via BankID via ClientFlow'
    );
    const saved = Id.applyToPerson({ namn: 'Bo' }, '', 'bankid_clientflow', '');
    assert.equal(saved.identitetKontrolleradMetod, 'bankid_clientflow');
    assert.equal(saved.identitetKontrolleradDatum, undefined);
  });

  it('sparar och rensar fält på person', () => {
    const withId = Id.applyToPerson(
      { namn: 'Anna', personnr: '19800101-1111' },
      '2024-03-01',
      'bankid_clientflow',
      '2024-03-02'
    );
    assert.equal(withId.identitetKontrolleradDatum, '2024-03-01');
    assert.equal(withId.identitetKontrolleradMetod, 'bankid_clientflow');
    assert.equal(withId.huvudmanKontrolleradBolagsverketDatum, '2024-03-02');
    const cleared = Id.applyToPerson(withId, '', '', '');
    assert.equal(cleared.identitetKontrolleradDatum, undefined);
    assert.equal(cleared.identitetKontrolleradMetod, undefined);
    assert.equal(cleared.huvudmanKontrolleradBolagsverketDatum, undefined);
  });
});
