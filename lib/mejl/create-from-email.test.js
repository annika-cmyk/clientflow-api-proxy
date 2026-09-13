const test = require('node:test');
const assert = require('node:assert/strict');
const {
  snippetFromEmail,
  defaultTitleFromSubject,
  validateCreateWorkInput,
  buildUppgiftNotePayload,
  buildUppdragPayload,
  EGET_UPPDRAG_TYP,
  UPPGIFT_NOTE_TYP
} = require('./create-from-email');

test('snippetFromEmail truncerar lång text', () => {
  const long = 'a'.repeat(1200);
  const s = snippetFromEmail({ text: long, maxLen: 100 });
  assert.equal(s.length, 100);
  assert.ok(s.endsWith('…'));
});

test('defaultTitleFromSubject tar bort Re:/Fw:', () => {
  assert.equal(defaultTitleFromSubject('Re: Momsdeklaration'), 'Momsdeklaration');
  assert.equal(defaultTitleFromSubject('FWD: Bokslut'), 'Bokslut');
  assert.equal(defaultTitleFromSubject(''), 'Uppföljning från mejl');
});

test('validateCreateWorkInput kräver kund, titel och deadline', () => {
  assert.equal(validateCreateWorkInput({ kind: 'uppgift' }).ok, false);
  assert.equal(
    validateCreateWorkInput({
      kind: 'uppdrag',
      customerId: 'rec1',
      title: 'X',
      deadline: '2026-10-01'
    }).ok,
    true
  );
  assert.match(
    validateCreateWorkInput({
      kind: 'uppgift',
      customerId: 'rec1',
      title: 'X',
      deadline: 'fel'
    }).error,
    /deadline/i
  );
});

test('buildUppgiftNotePayload speglar anteckning+ToDo med deadline', () => {
  const p = buildUppgiftNotePayload({
    title: 'Skicka underlag',
    deadline: '2026-10-15',
    description: 'Från mejl om moms',
    customer: { namn: 'Acme AB', orgnr: '556677-8899', byraId: '12' },
    fromName: 'Lisa',
    emailSubject: 'Re: Underlag'
  });
  assert.deepEqual(p.typAvAnteckning, [UPPGIFT_NOTE_TYP]);
  assert.equal(p.datum, '2026-10-15');
  assert.equal(p.ToDo1, 'Skicka underlag (deadline 2026-10-15)');
  assert.equal(p.Status1, 'Att göra');
  assert.equal(p.foretagsnamn, 'Acme AB');
  assert.equal(p.orgnr, '556677-8899');
  assert.match(p.notes, /Deadline: 2026-10-15/);
  assert.match(p.notes, /Från mejl om moms/);
});

test('buildUppdragPayload skapar Eget uppdrag engång', () => {
  const p = buildUppdragPayload({
    customerId: 'recKund',
    title: 'Genomgång bank',
    deadline: '2026-11-01',
    startDate: '2026-09-13',
    description: 'Mejlsnippet',
    ansvarig: 'Annika',
    klientansvarig: 'Annika'
  });
  assert.equal(p.customerId, 'recKund');
  assert.equal(p.typ, EGET_UPPDRAG_TYP);
  assert.equal(p.fields.Namn, 'Genomgång bank');
  assert.equal(p.fields.Frekvens, 'Engång');
  assert.equal(p.fields['Nästa deadline'], '2026-11-01');
  assert.equal(p.fields.Startdatum, '2026-09-13');
  assert.equal(p.fields.Status, 'Aktiv');
  assert.equal(p.fields.Rutin, 'Mejlsnippet');
});
