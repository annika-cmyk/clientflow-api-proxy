const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isKundDold,
  isAvslutadKund,
  isLeadKund,
  isAktivKund,
  shouldShowRaderaKund,
  filterVisibleKunder,
  filterAktivaKunder,
  filterDoldaKunder,
  mapDoldKundListItem,
  hideFields,
  unhideFields,
  DOLD_FIELD
} = require('./kund-dold');

describe('kund-dold', () => {
  it('känner igen dold kund från checkbox-värden', () => {
    assert.equal(isKundDold({ Dold: true }), true);
    assert.equal(isKundDold({ Dold: 'true' }), true);
    assert.equal(isKundDold({ Dold: false }), false);
    assert.equal(isKundDold({}), false);
  });

  it('filtrerar synliga och dolda listor', () => {
    const rows = [
      { id: 'a', fields: { Namn: 'Synlig' } },
      { id: 'b', fields: { Namn: 'Dold', Dold: true } }
    ];
    assert.deepEqual(filterVisibleKunder(rows).map((r) => r.id), ['a']);
    assert.deepEqual(filterDoldaKunder(rows).map((r) => r.id), ['b']);
  });

  it('bygger länk till kundkort utan att radera posten', () => {
    const item = mapDoldKundListItem({
      id: 'recABC1234567890',
      fields: { Namn: 'Aktiebolaget Volvo', Orgnr: '5560125790', Dold: true, 'Dold av': 'Anna' }
    });
    assert.equal(item.namn, 'Aktiebolaget Volvo');
    assert.equal(item.orgnr, '5560125790');
    assert.equal(item.kundkortUrl, 'kundkort.html?id=recABC1234567890');
    assert.equal(item.doldAv, 'Anna');
  });

  it('visar Radera kund bara för avslutad kund som inte är dold', () => {
    assert.equal(isAvslutadKund({ Kundstatus: 'Avslutad' }), true);
    assert.equal(isAvslutadKund({ Kundstatus: 'Avslutad kund' }), true);
    assert.equal(isAvslutadKund({ Kundstatus: 'Pågående kund' }), false);
    assert.equal(shouldShowRaderaKund({ Kundstatus: 'Avslutad' }), true);
    assert.equal(shouldShowRaderaKund({ Kundstatus: 'Pågående kund' }), false);
    assert.equal(shouldShowRaderaKund({ Kundstatus: 'Lead' }), false);
    assert.equal(shouldShowRaderaKund({ Kundstatus: 'Avslutad', Dold: true }), false);
  });

  it('känner igen aktiv kund för statistik (pågående, ej lead/avslutad/dold)', () => {
    assert.equal(isLeadKund({ Kundstatus: 'Lead' }), true);
    assert.equal(isAktivKund({ Kundstatus: 'Pågående kund' }), true);
    assert.equal(isAktivKund({}), true);
    assert.equal(isAktivKund({ Kundstatus: 'Lead' }), false);
    assert.equal(isAktivKund({ Kundstatus: 'Avslutad' }), false);
    assert.equal(isAktivKund({ Kundstatus: 'Pågående kund', Dold: true }), false);

    const rows = [
      { id: 'a', fields: { Kundstatus: 'Pågående kund' } },
      { id: 'b', fields: { Kundstatus: 'Lead' } },
      { id: 'c', fields: { Kundstatus: 'Avslutad' } },
      { id: 'd', fields: { Kundstatus: 'Pågående kund', Dold: true } },
      { id: 'e', fields: {} }
    ];
    assert.deepEqual(filterAktivaKunder(rows).map((r) => r.id), ['a', 'e']);
  });

  it('hide/unhide sätter bara Dold-flagga, ingen radering', () => {
    const hidden = hideFields('Anna', '2026-08-19T12:00:00.000Z');
    assert.equal(hidden[DOLD_FIELD], true);
    assert.equal(hidden['Dold av'], 'Anna');
    assert.equal(unhideFields()[DOLD_FIELD], false);
  });
});
