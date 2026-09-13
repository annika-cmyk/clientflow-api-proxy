/**
 * Tester för Mejlarkiv Saved To → destination-sammanfattning.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const archiveLinks = require('./archive-links');
const archiveAccess = require('./archive-access');

test('normalizeSaveType mappar aliaser', () => {
  assert.equal(archiveLinks.normalizeSaveType('uppdragskorning'), 'korning');
  assert.equal(archiveLinks.normalizeSaveType('run'), 'korning');
  assert.equal(archiveLinks.normalizeSaveType('docs'), 'dokumentation');
  assert.equal(archiveLinks.normalizeSaveType('uppdrag'), 'uppdrag');
});

test('destinationHref pekar på kundkort-flik när customerId finns', () => {
  assert.equal(
    archiveLinks.destinationHref({ type: 'dokumentation', customerId: 'recC' }),
    'kundkort.html?id=recC#dokumentation'
  );
  assert.equal(
    archiveLinks.destinationHref({ type: 'korning', customerId: 'recC' }),
    'kundkort.html?id=recC#uppdrag'
  );
  assert.equal(archiveLinks.destinationHref({ type: 'dokumentation', customerId: '' }), '');
});

test('summarizeSavedTo grupperar destinationer och skiljer mejl/bilagor', () => {
  const summary = archiveLinks.summarizeSavedTo(
    [
      {
        type: 'dokumentation',
        customerId: 'recC',
        filename: '2026-09-11_mail.txt',
        at: '2026-09-11T10:00:00Z'
      },
      {
        type: 'dokumentation',
        customerId: 'recC',
        filename: 'faktura.pdf',
        gmailAttachmentId: 'att1',
        at: '2026-09-11T10:01:00Z'
      },
      {
        type: 'korning',
        customerId: 'recC',
        runId: 'recRun',
        runLabel: '2026-09 · Deklaration',
        filename: 'underlag.pdf',
        gmailAttachmentId: 'att2',
        at: '2026-09-12T08:00:00Z'
      },
      {
        type: 'uppdragskorning',
        customerId: 'recC',
        runId: 'recRun',
        filename: 'underlag2.pdf',
        gmailAttachmentId: 'att3'
      }
    ],
    { customerId: 'recC' }
  );

  assert.equal(summary.hasSaves, true);
  assert.equal(summary.totalSaves, 4);
  assert.equal(summary.emailSaveCount, 1);
  assert.equal(summary.attachmentSaveCount, 3);
  assert.equal(summary.destinations.length, 2);

  const docs = summary.destinations.find((d) => d.type === 'dokumentation');
  assert.ok(docs);
  assert.equal(docs.emailSaved, true);
  assert.deepEqual(docs.attachments, ['faktura.pdf']);
  assert.equal(docs.href, 'kundkort.html?id=recC#dokumentation');

  const run = summary.destinations.find((d) => d.type === 'korning');
  assert.ok(run);
  assert.equal(run.emailSaved, false);
  assert.equal(run.runId, 'recRun');
  assert.equal(run.runName, '2026-09 · Deklaration');
  assert.deepEqual(run.attachments, ['underlag.pdf', 'underlag2.pdf']);
  assert.equal(run.href, 'kundkort.html?id=recC#uppdrag');
  assert.equal(run.saveCount, 2);
});

test('attachmentSaveStatus matchar id och filnamn', () => {
  const status = archiveLinks.attachmentSaveStatus(
    [
      { attachmentId: 'att1', filename: 'a.pdf' },
      { attachmentId: 'att2', filename: 'b.pdf' },
      { attachmentId: 'att3', filename: 'c.pdf' }
    ],
    [{ type: 'dokumentation', gmailAttachmentId: 'att1', filename: 'a.pdf' }],
    [{ gmailAttachmentId: 'attX', filename: 'c.pdf' }]
  );
  assert.deepEqual(
    status.map((s) => s.saved),
    [true, false, true]
  );
});

test('presentArchivedMail inkluderar savedSummary och attachmentMeta', () => {
  const user = { id: 'recOwner', role: 'Anställd' };
  const presented = archiveAccess.presentArchivedMail(user, {
    id: 'recArch',
    customerId: 'recC',
    gmailMessageId: 'msg1',
    ownerUserId: 'recOwner',
    visibility: 'byra',
    sharedWith: ['recCol'],
    subject: 'Test',
    bodyText: 'hej',
    bodyHtml: '',
    maskedRanges: [],
    savedTo: [
      { type: 'uppdrag', customerId: 'recC', uppdragId: 'recU', filename: 'mail.txt' }
    ],
    attachmentMeta: [{ filename: 'x.pdf', gmailAttachmentId: 'att9' }]
  });
  assert.ok(presented.savedSummary);
  assert.equal(presented.savedSummary.hasSaves, true);
  assert.equal(presented.savedSummary.destinations[0].type, 'uppdrag');
  assert.equal(presented.savedSummary.destinations[0].href, 'kundkort.html?id=recC#uppdrag');
  assert.equal(presented.attachmentMeta.length, 1);
  assert.equal(presented.sharedWith.length, 1);
});
