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

  it('tar bort Reclaim-boilerplate men behåller agenda', () => {
    const raw =
      'Agenda: moms och bokslut<br><br>This event was created by Reclaim.<br><br>' +
      'You can edit it <a href="https://app.reclaim.ai/m/edit/abc">here</a>, or use these links to ' +
      '<a href="https://app.reclaim.ai/meeting/abc/cancel">cancel</a> or ' +
      '<a href="https://app.reclaim.ai/m/abc/reschedule">reschedule</a>';
    const cleaned = GA.cleanGcalDescription(raw);
    assert.match(cleaned, /Agenda: moms och bokslut/);
    assert.doesNotMatch(cleaned, /Reclaim/i);
    assert.doesNotMatch(cleaned, /reschedule/i);
    assert.doesNotMatch(cleaned, /<a /i);
  });

  it('döljer beskrivning som bara är Reclaim-text', () => {
    const raw =
      'This event was created by Reclaim.<br><br>You can edit it ' +
      '<a href="https://app.reclaim.ai/m/edit/jZPJ">here</a>, or use these links to ' +
      '<a href="https://app.reclaim.ai/meeting/jZPJ/cancel">cancel</a> or ' +
      '<a href="https://app.reclaim.ai/m/jZPJ/reschedule">reschedule</a>';
    assert.equal(GA.cleanGcalDescription(raw), '');
  });

  it('extraherar Google Meet-länk från hangoutLink eller beskrivning', () => {
    assert.equal(
      GA.extractMeetingUrl({ hangoutLink: 'https://meet.google.com/abc-defg-hij' }),
      'https://meet.google.com/abc-defg-hij'
    );
    assert.equal(
      GA.extractMeetingUrl({
        description: 'Join: https://meet.google.com/xyz-uvwx-rst thanks'
      }),
      'https://meet.google.com/xyz-uvwx-rst'
    );
  });
});
