const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const GA = require('../public/js/kalender-gcal-actions.js');

describe('kalender-gcal-actions', () => {
  it('bygger tidpayload med justerad längd', () => {
    const payload = GA.buildGcalTidPayload({
      customerId: 'recKund',
      customerName: 'Rydén & Co',
      date: '2026-10-14',
      startHm: '10:15',
      endHm: '11:45',
      title: 'MÖTE Rydén & Co och Sara Leion'
    });
    assert.equal(payload.hours, 1.5);
    assert.equal(payload.start, '2026-10-14T10:15:00');
    assert.equal(payload.end, '2026-10-14T11:45:00');
    assert.equal(payload.activity, 'Möte');
    assert.match(payload.description, /Rydén/);
  });

  it('kräver kund och giltig tid', () => {
    assert.throws(() => GA.buildGcalTidPayload({ date: '2026-10-14', startHm: '10:00', endHm: '11:00' }), /kund/i);
    assert.throws(() => GA.buildGcalTidPayload({
      customerId: 'rec1',
      customerName: 'A',
      date: '2026-10-14',
      startHm: '11:00',
      endHm: '10:00'
    }), /Slut/);
  });

  it('bygger mötesanteckning med rubrik', () => {
    const note = GA.buildGcalNotePayload({
      customerId: 'recKund',
      customerName: 'Rydén & Co',
      byraId: 'recByra',
      orgnr: '556000-0000',
      date: '2026-10-14',
      title: 'MÖTE Rydén & Co',
      startHm: '10:15',
      endHm: '11:15',
      notes: 'Gick igenom moms och nästa steg.'
    });
    assert.deepEqual(note.typAvAnteckning, ['Mötesanteckningar']);
    assert.equal(note.foretagsnamn, 'Rydén & Co');
    assert.match(note.notes, /Möte: MÖTE Rydén/);
    assert.match(note.notes, /Gick igenom moms/);
  });
});
