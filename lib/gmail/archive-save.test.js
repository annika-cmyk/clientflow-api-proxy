/**
 * Tester för Mejlarkiv save-mål / Airtable field mapping.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.GMAIL_TOKEN_SECRET = process.env.GMAIL_TOKEN_SECRET || 'test-secret-mejlarkiv';

const archiveSave = require('./archive-save');
const archiveStore = require('./archive-store');

test('resolveSaveTargetSpec: dokumentation → KUNDDATA + customerId', () => {
  const spec = archiveSave.resolveSaveTargetSpec({ type: 'dokumentation', customerId: 'recCust' });
  assert.equal(spec.type, 'dokumentation');
  assert.equal(spec.recordId, 'recCust');
  assert.equal(spec.tableName, 'KUNDDATA');
  assert.equal(spec.tableEnv, 'AIRTABLE_TABLE_KUNDDATA_ID');
  assert.equal(spec.fallbackTableId, archiveSave.KUNDDATA_TABLE);
});

test('resolveSaveTargetSpec: uppdrag → Uppdrag + uppdragId', () => {
  const spec = archiveSave.resolveSaveTargetSpec({ type: 'uppdrag', uppdragId: 'recUpp' });
  assert.equal(spec.type, 'uppdrag');
  assert.equal(spec.recordId, 'recUpp');
  assert.equal(spec.tableName, 'Uppdrag');
  assert.equal(spec.tableEnv, 'AIRTABLE_TABLE_UPPDRAG_ID');
});

test('resolveSaveTargetSpec: korning / aliases → Uppdragskörningar + runId', () => {
  for (const type of ['korning', 'run', 'uppdragskorning']) {
    const spec = archiveSave.resolveSaveTargetSpec({ type, runId: 'recRun' });
    assert.equal(spec.type, 'korning', type);
    assert.equal(spec.recordId, 'recRun', type);
    assert.equal(spec.tableName, 'Uppdragskörningar', type);
    assert.equal(spec.tableEnv, 'AIRTABLE_TABLE_UPPDRAG_RUNS_ID', type);
    assert.equal(spec.label, 'Uppdragskörning', type);
  }
});

test('resolveSaveTargetSpec: saknar id ger null recordId', () => {
  assert.equal(archiveSave.resolveSaveTargetSpec({ type: 'korning' }).recordId, null);
  assert.equal(archiveSave.resolveSaveTargetSpec({ type: 'uppdrag' }).recordId, null);
});

test('ATTACHMENT_FIELD_CANDIDATES prioriterar Dokumentation', () => {
  assert.deepEqual(archiveSave.ATTACHMENT_FIELD_CANDIDATES, ['Dokumentation', 'Attachments']);
});

test('formatArchiveStoreError döljer rå Airtable 403-text', () => {
  const err = {
    response: {
      status: 403,
      data: {
        error: {
          type: 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND',
          message:
            'Invalid permissions, or the requested model was not found. Check that both your user and your token have the required permissions, and that the model names and/or ids are correct.'
        }
      }
    },
    message: 'Request failed with status code 403'
  };
  assert.equal(archiveStore.isMissingMejlarkivError(err), true);
  const friendly = archiveStore.formatArchiveStoreError(err);
  assert.ok(/Mejlarkiv|setup-mejlarkiv/i.test(friendly));
  assert.ok(!/Invalid permissions/i.test(friendly));
});

test('recordToFields / fieldsToRecord roundtrip sparar Saved To för körning', () => {
  archiveStore.clearCachedTableId();
  const fields = archiveStore.recordToFields({
    customerId: 'recCust',
    gmailMessageId: 'msg1',
    threadId: 'thr1',
    visibility: 'byra',
    sharedWith: [],
    ownerUserId: 'recOwner',
    subject: 'Ämne',
    from: 'a@b.se',
    to: 'c@d.se',
    cc: '',
    date: '2026-09-11',
    snippet: 'x',
    bodyText: 'hej',
    bodyHtml: '<p>hej</p>',
    maskedRanges: [],
    savedTo: [{ type: 'korning', runId: 'recRun', filename: 'mail.txt' }],
    attachmentMeta: []
  });
  assert.equal(fields['Kund ID'], 'recCust');
  assert.equal(fields['Gmail Message ID'], 'msg1');
  assert.ok(fields['Saved To'].includes('korning'));
  const rec = archiveStore.fieldsToRecord('recArch', fields);
  assert.equal(rec.savedTo[0].type, 'korning');
  assert.equal(rec.savedTo[0].runId, 'recRun');
});

test('buildEmailSnapshotFilename är säkert', () => {
  const name = archiveSave.buildEmailSnapshotFilename({
    subject: 'Re: Inkomstdeklaration 2',
    date: '2026-09-11T16:34:00'
  });
  assert.ok(name.startsWith('2026-09-11_'));
  assert.ok(name.endsWith('.txt'));
});
