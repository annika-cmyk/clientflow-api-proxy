const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildEngangUppdragPayload } = require('./mejl-koppla-uppdrag');

describe('mejl-koppla-uppdrag', () => {
  it('bygger payload för enstaka Eget uppdrag/Engång', () => {
    const body = buildEngangUppdragPayload({
      customerId: 'recC',
      namn: 'Lön',
      ansvarig: 'Anna',
      klientansvarig: 'Bertil',
      deadline: '2026-09-20',
      today: '2026-09-15'
    });
    assert.equal(body.typ, 'Eget uppdrag');
    assert.equal(body.fields.Frekvens, 'Engång');
    assert.equal(body.fields.Namn, 'Lön');
    assert.equal(body.fields['Nästa deadline'], '2026-09-20');
    assert.equal(body.fields.Status, 'Aktiv');
  });

  it('kräver namn', () => {
    assert.throws(
      () => buildEngangUppdragPayload({
        customerId: 'recC', namn: '  ', ansvarig: 'A', klientansvarig: 'B', deadline: '2026-09-20', today: '2026-09-15'
      }),
      /namn/i
    );
  });

  it('bygger anteckning-ToDo för uppgift från mejl', () => {
    const { buildUppgiftNotePayload } = require('./mejl-koppla-uppdrag');
    const body = buildUppgiftNotePayload({
      text: 'Skicka momsdeklaration',
      ansvarig: 'Annika',
      byraId: '42',
      orgnr: '556677-8899',
      foretagsnamn: 'Test AB',
      mejlSubject: 'Moms juli',
      today: '2026-09-16'
    });
    assert.deepEqual(body.typAvAnteckning, ['Emailkonversation']);
    assert.equal(body.ToDo1, 'Skicka momsdeklaration');
    assert.equal(body.Status1, 'Att göra');
    assert.equal(body.name, 'Annika');
    assert.match(body.notes, /Moms juli/);
    assert.equal(body.orgnr, '556677-8899');
  });

  it('kräver uppgiftstext', () => {
    const { buildUppgiftNotePayload } = require('./mejl-koppla-uppdrag');
    assert.throws(
      () => buildUppgiftNotePayload({ text: ' ', ansvarig: 'A', today: '2026-09-16' }),
      /göras/i
    );
  });
});
