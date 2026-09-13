/**
 * Tester för Mejlarkiv save-mål / Airtable field mapping.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

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

test('buildRunDocFilename prefixar deadline (samma som run-docs / kundkort-filter)', () => {
  assert.equal(archiveSave.buildRunDocFilename('2028-06-15', 'mejl.txt'), '2028-06-15 - mejl.txt');
  assert.equal(archiveSave.buildRunDocFilename('', 'mejl.txt'), 'mejl.txt');
  assert.equal(archiveSave.buildRunDocFilename('bogus', 'x.pdf'), 'x.pdf');
});

test('buildRunLabel kombinerar period, typ och deadline', () => {
  assert.equal(
    archiveSave.buildRunLabel({
      'Period Label': '2028',
      Typ: 'Bokslut',
      Deadline: '2028-06-15'
    }),
    '2028 · Bokslut · 2028-06-15'
  );
});

test('formatSaveDestination visar körningsnamn', () => {
  assert.equal(
    archiveSave.formatSaveDestination({
      type: 'korning',
      runName: '2028 · Bokslut · 2028-06-15'
    }),
    'Uppdragskörning: 2028 · Bokslut · 2028-06-15'
  );
  assert.equal(
    archiveSave.formatSaveDestination({ type: 'dokumentation' }),
    'Dokumentation på kunden'
  );
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
    savedTo: [{ type: 'korning', runId: 'recRun', filename: 'mail.txt', runName: '2028 · Bokslut' }],
    attachmentMeta: []
  });
  assert.equal(fields['Kund ID'], 'recCust');
  assert.equal(fields['Gmail Message ID'], 'msg1');
  assert.ok(fields['Saved To'].includes('korning'));
  assert.ok(fields['Saved To'].includes('2028 · Bokslut'));
  const rec = archiveStore.fieldsToRecord('recArch', fields);
  assert.equal(rec.savedTo[0].type, 'korning');
  assert.equal(rec.savedTo[0].runId, 'recRun');
  assert.equal(rec.savedTo[0].runName, '2028 · Bokslut');
});

test('buildEmailSnapshotFilename är säkert', () => {
  const name = archiveSave.buildEmailSnapshotFilename({
    subject: 'Re: Inkomstdeklaration 2',
    date: '2026-09-11T16:34:00'
  });
  assert.ok(name.startsWith('2026-09-11_'));
  assert.ok(name.endsWith('.html'));
});

test('saveBufferToTarget(korning) skriver till Uppdrag med deadline-prefix + dual-write till körning', async () => {
  archiveSave.clearCachesForTests();
  const uploaded = [];
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'axios') {
      return {
        get: async (url) => {
          if (String(url).includes('/meta/bases/')) {
            return {
              data: {
                tables: [
                  {
                    id: 'tblRuns',
                    name: 'Uppdragskörningar',
                    fields: [{ id: 'fldRunDoc', name: 'Dokumentation', type: 'multipleAttachments' }]
                  },
                  {
                    id: 'tblUpp',
                    name: 'Uppdrag',
                    fields: [{ id: 'fldUppDoc', name: 'Dokumentation', type: 'multipleAttachments' }]
                  }
                ]
              }
            };
          }
          if (String(url).includes('/tblRuns/recRun1')) {
            return {
              data: {
                id: 'recRun1',
                fields: {
                  'Uppdrag ID': 'recUpp1',
                  'Kund ID': 'recCust1',
                  Deadline: '2028-06-15',
                  Typ: 'Bokslut',
                  PeriodKey: '2028',
                  'Period Label': '2028'
                }
              }
            };
          }
          throw new Error('unexpected GET ' + url);
        },
        post: async (url, body) => {
          uploaded.push({ url, filename: body.filename, contentType: body.contentType });
          return { data: { id: 'att' + uploaded.length, url: 'https://example.test/' + body.filename } };
        }
      };
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    delete require.cache[require.resolve('./archive-save')];
    const fresh = require('./archive-save');
    process.env.AIRTABLE_ACCESS_TOKEN = process.env.AIRTABLE_ACCESS_TOKEN || 'patTEST';
    const saved = await fresh.saveBufferToTarget(
      Buffer.from('hello mejl'),
      'snapshot.txt',
      'text/plain',
      { type: 'korning', runId: 'recRun1', customerId: 'recCust1' }
    );
    assert.equal(saved.type, 'korning');
    assert.equal(saved.uppdragId, 'recUpp1');
    assert.equal(saved.runId, 'recRun1');
    assert.equal(saved.filename, '2028-06-15 - snapshot.txt');
    assert.equal(saved.writePath, 'uppdrag+run');
    assert.ok(String(saved.runName || '').includes('Bokslut'));
    assert.equal(uploaded.length, 2, 'förväntar uppdrag + dual-write till körning');
    assert.ok(uploaded[0].url.includes('/recUpp1/'), uploaded[0].url);
    assert.ok(uploaded[1].url.includes('/recRun1/'), uploaded[1].url);
    assert.equal(uploaded[0].filename, '2028-06-15 - snapshot.txt');
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve('./archive-save')];
  }
});

test('saveBufferToTarget(dokumentation) riktar KUNDDATA/Dokumentation', async () => {
  const uploaded = [];
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'axios') {
      return {
        get: async (url) => {
          if (String(url).includes('/meta/bases/')) {
            return {
              data: {
                tables: [
                  {
                    id: archiveSave.KUNDDATA_TABLE,
                    name: 'KUNDDATA',
                    fields: [{ id: 'fldDoc', name: 'Dokumentation', type: 'multipleAttachments' }]
                  }
                ]
              }
            };
          }
          throw new Error('unexpected GET ' + url);
        },
        post: async (url, body) => {
          uploaded.push({ url, filename: body.filename });
          return { data: { id: 'attK', url: 'https://example.test/' + body.filename } };
        }
      };
    }
    return originalLoad(request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('./archive-save')];
    const fresh = require('./archive-save');
    process.env.AIRTABLE_ACCESS_TOKEN = process.env.AIRTABLE_ACCESS_TOKEN || 'patTEST';
    const saved = await fresh.saveBufferToTarget(Buffer.from('x'), 'mail.txt', 'text/plain', {
      type: 'dokumentation',
      customerId: 'recCustX'
    });
    assert.equal(saved.type, 'dokumentation');
    assert.equal(saved.customerId, 'recCustX');
    assert.equal(saved.filename, 'mail.txt');
    assert.equal(uploaded.length, 1);
    assert.ok(uploaded[0].url.includes('/recCustX/'));
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve('./archive-save')];
  }
});
