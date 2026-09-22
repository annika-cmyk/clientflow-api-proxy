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
    assert.equal(body.mejlUrl, undefined);
  });

  it('sparar länk till mejlet på uppgiften', () => {
    const { buildUppgiftNotePayload } = require('./mejl-koppla-uppdrag');
    const body = buildUppgiftNotePayload({
      text: 'Svara kunden',
      ansvarig: 'Annika',
      mejlSubject: 'Kvitto mars',
      today: '2026-09-19',
      messageId: '18abc'
    });
    assert.equal(body.mejlUrl, 'mejl.html?messageId=18abc');
    assert.match(body.notes, /Kvitto mars/);
    assert.match(body.notes, /Svara kunden/);
    assert.match(body.notes, /mejl\.html\?messageId=18abc/);
    assert.equal(body.ToDo1, 'Svara kunden');
  });

  it('kräver uppgiftstext', () => {
    const { buildUppgiftNotePayload } = require('./mejl-koppla-uppdrag');
    assert.throws(
      () => buildUppgiftNotePayload({ text: ' ', ansvarig: 'A', today: '2026-09-16' }),
      /göras/i
    );
  });

  it('Nytt uppdrag och Ny uppgift är egna kopplingsmål', () => {
    const { resolveKopplaSelection, kopplaFieldVisibility } = require('./mejl-koppla-uppdrag');
    const nytt = resolveKopplaSelection({ mode: 'new-uppdrag', splitOn: true });
    assert.deepEqual(nytt, { effective: 'uppdrag', create: 'uppdrag' });
    assert.deepEqual(kopplaFieldVisibility({ mode: 'new-uppdrag', splitOn: true }), {
      run: false,
      uppdrag: false,
      newUppdrag: true,
      uppgift: false,
      existingUppgift: false
    });
    const uppg = resolveKopplaSelection({ mode: 'uppgift' });
    assert.deepEqual(uppg, { effective: 'uppgift', create: 'uppgift' });
    assert.equal(kopplaFieldVisibility({ mode: 'uppgift' }).uppgift, true);
    assert.equal(kopplaFieldVisibility({ mode: 'uppgift' }).newUppdrag, false);
    assert.equal(kopplaFieldVisibility({ mode: 'uppgift' }).existingUppgift, false);
  });

  it('Befintlig uppgift är eget kopplingsmål', () => {
    const {
      resolveKopplaSelection,
      kopplaFieldVisibility,
      listOpenUppgifterFromNotes,
      parseUppgiftValue,
      buildLinkExistingUppgiftPatch
    } = require('./mejl-koppla-uppdrag');
    assert.deepEqual(resolveKopplaSelection({ mode: 'existing-uppgift', splitOn: true }), {
      effective: 'existing-uppgift',
      create: null
    });
    assert.deepEqual(kopplaFieldVisibility({ mode: 'existing-uppgift', splitOn: true }), {
      run: false,
      uppdrag: false,
      newUppdrag: false,
      uppgift: false,
      existingUppgift: true
    });
    const open = listOpenUppgifterFromNotes([
      {
        id: 'recNote1',
        fields: {
          Notes: 'Bakgrund',
          ToDo1: 'Skicka moms',
          Status1: 'Att göra',
          ToDo2: 'Klarad sak',
          Status2: 'Klart',
          ToDo3: 'Pågående lön',
          Status3: 'Pågående',
          Name: 'Annika',
          Datum: '2026-09-20'
        }
      }
    ]);
    assert.equal(open.length, 2);
    assert.equal(open[0].value, 'recNote1:1');
    assert.equal(open[0].text, 'Skicka moms');
    assert.equal(open[1].text, 'Pågående lön');
    assert.deepEqual(parseUppgiftValue('recNote1:3'), { noteId: 'recNote1', index: 3 });
    assert.equal(parseUppgiftValue(''), null);
    const patch = buildLinkExistingUppgiftPatch({
      notesText: 'Bakgrund',
      messageId: '18abc'
    });
    assert.equal(patch.mejlUrl, 'mejl.html?messageId=18abc');
    assert.match(patch.notes, /Bakgrund/);
    assert.match(patch.notes, /mejl\.html\?messageId=18abc/);
  });

  it('befintliga mål och dela-upp påverkas inte av skapa-valen', () => {
    const { resolveKopplaSelection, kopplaFieldVisibility } = require('./mejl-koppla-uppdrag');
    assert.deepEqual(resolveKopplaSelection({ mode: 'korning' }), {
      effective: 'korning',
      create: null
    });
    assert.equal(kopplaFieldVisibility({ mode: 'korning' }).run, true);
    assert.equal(kopplaFieldVisibility({ mode: 'uppdrag' }).uppdrag, true);
    assert.equal(kopplaFieldVisibility({ mode: 'dokumentation' }).newUppdrag, false);
    assert.deepEqual(resolveKopplaSelection({ mode: 'korning', splitOn: true }), {
      effective: 'split',
      create: null
    });
    const splitVis = kopplaFieldVisibility({ mode: 'dokumentation', splitOn: true });
    assert.equal(splitVis.run, true);
    assert.equal(splitVis.uppdrag, true);
    assert.equal(splitVis.newUppdrag, false);
    assert.equal(splitVis.existingUppgift, false);
  });
});

const fs = require('node:fs');
const path = require('node:path');

describe('koppla-meny i mejl-archive', () => {
  const src = fs.readFileSync(path.join(__dirname, '../public/js/mejl-archive.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../public/mejl.html'), 'utf8');

  it('har Nytt uppdrag och Ny uppgift i Kopplingsmål', () => {
    assert.match(src, /<option value="new-uppdrag">Nytt uppdrag<\/option>/);
    assert.match(src, /<option value="uppgift">Ny uppgift<\/option>/);
    assert.doesNotMatch(src, /mejl-advanced-action/);
    assert.match(src, /markUppgiftSkapadFromMejl/);
    assert.match(src, /createUppgiftFromMejl\(customerId, root, m, customerMeta, id\)/);
    assert.match(src, /createEngangUppdrag/);
    assert.match(src, /createUppgiftFromMejl/);
  });

  it('har Befintlig uppgift i Kopplingsmål', () => {
    assert.match(src, /<option value="existing-uppgift">Befintlig uppgift<\/option>/);
    assert.match(src, /mejl-existing-uppgift-wrap/);
    assert.match(src, /linkExistingUppgiftFromMejl/);
    assert.match(src, /loadOpenUppgifter/);
    assert.match(html, /mejl-archive\.js\?v=20260922uppgift/);
  });

  it('döljer form-grid trots hidden-attributet', () => {
    assert.match(html, /\.mejl-koppla-subform\[hidden\]/);
    assert.match(html, /display:\s*none\s*!important/);
  });
});
