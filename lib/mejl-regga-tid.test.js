const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildEntryFields, STATUS } = require('./tidregistrering');
const {
  buildMejlTidPayload,
  descriptionFromMejl,
  hoursFromParts
} = require('../public/js/mejl-regga-tid');

describe('mejl-regga-tid', () => {
  it('mappar mejl till tidregistrering-payload och Airtable-fält', () => {
    const payload = buildMejlTidPayload({
      customerId: 'recKund',
      customerName: 'Acme AB',
      uppdragId: 'recUpp',
      uppdragsnamn: 'Löpande bokföring',
      hours: 1,
      minutes: 30,
      date: '2026-09-19',
      subject: 'Fråga om bokslut',
      snippet: 'ignoreras när ämne finns',
      status: 'Utkast'
    });
    assert.equal(payload.customerId, 'recKund');
    assert.equal(payload.hours, 1.5);
    assert.equal(payload.date, '2026-09-19');
    assert.equal(payload.description, 'Fråga om bokslut');
    assert.equal(payload.activity, 'Mejl');
    assert.equal(payload.uppdragId, 'recUpp');
    assert.equal(payload.uppdragsnamn, 'Löpande bokföring');
    assert.equal(payload.status, 'Utkast');

    const fields = buildEntryFields(
      { ...payload, byraId: 'recByra' },
      { forCreate: true, user: { email: 'a@ex.se', name: 'Annika' } }
    );
    assert.equal(fields['Byrå ID'], 'recByra');
    assert.equal(fields['Kund ID'], 'recKund');
    assert.equal(fields.Kundnamn, 'Acme AB');
    assert.equal(fields['Uppdrag ID'], 'recUpp');
    assert.equal(fields.Uppdragsnamn, 'Löpande bokföring');
    assert.equal(fields.Datum, '2026-09-19');
    assert.equal(fields.Timmar, 1.5);
    assert.equal(fields.Beskrivning, 'Fråga om bokslut');
    assert.equal(fields.Aktivitet, 'Mejl');
    assert.equal(fields.Status, STATUS.DRAFT);
    assert.equal(fields['Utförd av'], 'a@ex.se');
    assert.equal(fields['Utförd av namn'], 'Annika');
  });

  it('använder utdrag när ämne saknas och lämnar uppdrag tomt', () => {
    const desc = descriptionFromMejl({ subject: '  ', snippet: 'Hej  igen' });
    assert.equal(desc, 'Hej igen');
    const payload = buildMejlTidPayload({
      customerId: 'recK',
      customerName: 'X',
      hours: 0,
      minutes: 15,
      today: '2026-09-19',
      snippet: 'Kort utdrag'
    });
    assert.equal(payload.hours, 0.25);
    assert.equal(payload.description, 'Kort utdrag');
    assert.equal(payload.date, '2026-09-19');
    assert.equal(payload.uppdragId, '');
    assert.equal(payload.uppdragsnamn, '');
    assert.equal(payload.status, 'Utkast');
  });

  it('låter egen beskrivning vinna över ämnet', () => {
    const payload = buildMejlTidPayload({
      customerId: 'recK',
      hours: '2',
      minutes: '',
      date: '2026-09-18',
      subject: 'Ämne',
      description: '  Egen notering  '
    });
    assert.equal(payload.description, 'Egen notering');
    assert.equal(payload.hours, 2);
  });

  it('kräver kund och tid', () => {
    assert.throws(
      () =>
        buildMejlTidPayload({
          customerName: 'Bara namn',
          hours: 1,
          date: '2026-09-19'
        }),
      /Välj kund/
    );
    assert.throws(
      () =>
        buildMejlTidPayload({
          customerId: 'recK',
          hours: 0,
          minutes: 0,
          date: '2026-09-19'
        }),
      /Ange timmar eller minuter/
    );
    assert.throws(() => hoursFromParts(1, 60), /0–59/);
  });

  it('kan markeras Klar så posten ingår i fakturaunderlag', () => {
    const payload = buildMejlTidPayload({
      customerId: 'recK',
      hours: 1,
      date: '2026-09-19',
      subject: 'Rådgivning',
      status: 'Klar'
    });
    const fields = buildEntryFields(payload, {
      forCreate: true,
      user: { email: 'a@ex.se', name: 'Annika' }
    });
    assert.equal(fields.Status, STATUS.READY);
    assert.equal(fields.Aktivitet, 'Mejl');
  });
});
