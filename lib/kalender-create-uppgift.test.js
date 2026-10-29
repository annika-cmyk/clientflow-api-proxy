const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const CU = require('../public/js/kalender-create-uppgift.js');

describe('kalender-create-uppgift', () => {
  it('normaliserar create-mode till run eller uppgift', () => {
    assert.equal(CU.normalizeCreateMode('run'), CU.CREATE_MODES.RUN);
    assert.equal(CU.normalizeCreateMode(''), CU.CREATE_MODES.RUN);
    assert.equal(CU.normalizeCreateMode('uppgift'), CU.CREATE_MODES.UPPGIFT);
    assert.equal(CU.normalizeCreateMode('task'), CU.CREATE_MODES.UPPGIFT);
  });

  it('bygger engångs-Eget uppdrag för kalenderuppgift', () => {
    const body = CU.buildEngangUppgiftUppdragPayload({
      customerId: 'recC',
      namn: 'Mejla avtal',
      ansvarig: 'Annika',
      deadline: '2026-10-29',
      today: '2026-10-29'
    });
    assert.equal(body.typ, 'Eget uppdrag');
    assert.equal(body.fields.Frekvens, 'Engång');
    assert.equal(body.fields.Namn, 'Mejla avtal');
    assert.equal(body.fields.Klientansvarig, 'Annika');
    assert.equal(body.fields['Nästa deadline'], '2026-10-29');
    assert.equal(body.fields.Status, 'Aktiv');
  });

  it('kräver titel och kund', () => {
    assert.throws(
      () => CU.buildEngangUppgiftUppdragPayload({
        customerId: '',
        namn: 'X',
        ansvarig: 'A',
        today: '2026-10-29'
      }),
      /kund/i
    );
    assert.throws(
      () => CU.buildEngangUppgiftUppdragPayload({
        customerId: 'recC',
        namn: '  ',
        ansvarig: 'A',
        today: '2026-10-29'
      }),
      /göras/i
    );
  });

  it('bygger anteckning-ToDo utan mejl-prefix', () => {
    const body = CU.buildStandaloneUppgiftNotePayload({
      text: 'Skicka underlag',
      ansvarig: 'Annika',
      byraId: '42',
      orgnr: '556677-8899',
      foretagsnamn: 'Test AB',
      today: '2026-10-29',
      extraNote: 'Kolla moms först'
    });
    assert.deepEqual(body.typAvAnteckning, ['Arbetsanteckningar']);
    assert.equal(body.ToDo1, 'Skicka underlag');
    assert.equal(body.Status1, 'Att göra');
    assert.equal(body.name, 'Annika');
    assert.match(body.notes, /Skicka underlag/);
    assert.match(body.notes, /Kolla moms först/);
    assert.equal(body.orgnr, '556677-8899');
    assert.ok(!/från mejl/i.test(body.notes));
  });

  it('hittar körning för nyskapat uppdrag', () => {
    const run = CU.findRunForUppdrag(
      [
        { id: 'recOther', fields: { 'Uppdrag ID': 'recA' } },
        { id: 'recWanted', fields: { 'Uppdrag ID': 'recU' } }
      ],
      'recU'
    );
    assert.equal(run.id, 'recWanted');
    assert.equal(CU.findRunForUppdrag([], 'recU'), null);
  });

  it('känner igen fristående uppgift (Eget uppdrag)', () => {
    assert.equal(
      CU.isStandaloneUppgiftEvent({ typ: 'Eget uppdrag', record: { fields: { Namn: 'X' } } }),
      true
    );
    assert.equal(
      CU.isStandaloneUppgiftEvent({ typ: 'Löneuppdrag innevarande' }),
      false
    );
  });
});
