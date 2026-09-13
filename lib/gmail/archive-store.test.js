/**
 * Tester för Mejlarkiv Airtable-store: saknad tabell / 403 → tom läsning, upsert skapar.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

process.env.GMAIL_TOKEN_SECRET = process.env.GMAIL_TOKEN_SECRET || 'test-secret-mejlarkiv-store';
process.env.AIRTABLE_ACCESS_TOKEN = 'pat_test_token';
process.env.AIRTABLE_BASE_ID = 'appTestBase';
delete process.env.AIRTABLE_TABLE_MEJLARKIV_ID;

const archiveStore = require('./archive-store');

function airtableErr(status, type, message) {
  const err = new Error('Request failed with status code ' + status);
  err.response = {
    status,
    data: { error: { type: type || 'NOT_FOUND', message: message || 'Could not find table' } }
  };
  return err;
}

test.beforeEach(() => {
  archiveStore.clearCachedTableId();
  delete process.env.AIRTABLE_TABLE_MEJLARKIV_ID;
});

test('isMissingMejlarkivError känner igen axios 403/404', () => {
  assert.equal(archiveStore.isMissingMejlarkivError(airtableErr(403)), true);
  assert.equal(archiveStore.isMissingMejlarkivError(airtableErr(404)), true);
  assert.equal(archiveStore.isMissingMejlarkivError(new Error('network down')), false);
  assert.match(archiveStore.formatArchiveStoreError(airtableErr(403)), /Mejlarkiv-tabellen saknas/i);
  assert.match(archiveStore.formatArchiveStoreError(airtableErr(500, 'SERVER_ERROR', 'boom')), /boom/);
});

test('findByGmailMessageId returnerar null vid saknad tabell (403)', async (t) => {
  t.mock.method(axios, 'get', async () => {
    throw airtableErr(403);
  });
  const found = await archiveStore.findByGmailMessageId('msg123', 'recCust');
  assert.equal(found, null);
});

test('listByCustomerId returnerar [] vid saknad tabell', async (t) => {
  t.mock.method(axios, 'get', async () => {
    throw airtableErr(404, 'NOT_FOUND', 'Could not find table');
  });
  const rows = await archiveStore.listByCustomerId('recCust');
  assert.deepEqual(rows, []);
});

test('upsertFromMessage skapar tabell + post när Mejlarkiv saknas', async (t) => {
  const calls = [];
  t.mock.method(axios, 'get', async (url) => {
    calls.push({ method: 'GET', url: String(url) });
    if (String(url).includes('/meta/bases/')) {
      return { data: { tables: [] } };
    }
    throw airtableErr(403);
  });
  t.mock.method(axios, 'post', async (url, body) => {
    calls.push({ method: 'POST', url: String(url) });
    if (String(url).includes('/meta/bases/') && String(url).endsWith('/tables')) {
      return {
        data: {
          id: 'tblMejlarkivNew',
          name: 'Mejlarkiv',
          fields: (body.fields || []).map((f, i) => ({ id: 'fld' + i, name: f.name, type: f.type }))
        }
      };
    }
    if (String(url).includes('/meta/bases/') && String(url).includes('/fields')) {
      return { data: { id: 'fldX', name: body.name } };
    }
    assert.ok(String(url).includes('tblMejlarkivNew'), 'ska skriva mot cached table id');
    assert.equal(body.fields.Visibility, 'privat');
    assert.equal(body.fields['Gmail Message ID'], 'msgNew');
    return { data: { id: 'recArchive1', fields: body.fields } };
  });

  const record = await archiveStore.upsertFromMessage({
    user: { id: 'recUser1' },
    customerId: 'recCust1',
    message: {
      id: 'msgNew',
      threadId: 'thr1',
      subject: 'Hej',
      from: 'a@b.se',
      to: 'c@d.se',
      text: 'Body'
    },
    visibility: 'privat'
  });

  assert.equal(record.id, 'recArchive1');
  assert.equal(record.visibility, 'privat');
  assert.equal(record.ownerUserId, 'recUser1');
  assert.equal(archiveStore.tableRef(), 'tblMejlarkivNew');
  assert.ok(calls.some((c) => c.method === 'POST' && c.url.endsWith('/tables')));
});

test('createRecord använder resolved table id efter ensure (inte stale env)', async (t) => {
  process.env.AIRTABLE_TABLE_MEJLARKIV_ID = 'tblStaleWrong';
  archiveStore.clearCachedTableId();

  t.mock.method(axios, 'get', async (url) => {
    if (String(url).includes('/meta/bases/')) {
      return {
        data: {
          tables: [
            {
              id: 'tblRealMejlarkiv',
              name: 'Mejlarkiv',
              fields: archiveStore.REQUIRED_FIELDS.map((f, i) => ({
                id: 'fld' + i,
                name: f.name,
                type: f.type
              }))
            }
          ]
        }
      };
    }
    throw airtableErr(403);
  });
  t.mock.method(axios, 'post', async (url, body) => {
    if (String(url).includes('/meta/')) {
      return { data: { id: 'fldY', name: body && body.name } };
    }
    assert.ok(
      String(url).includes('tblRealMejlarkiv'),
      'ska inte skriva mot stale AIRTABLE_TABLE_MEJLARKIV_ID'
    );
    return { data: { id: 'rec2', fields: body.fields } };
  });

  const rec = await archiveStore.createRecord({
    customerId: 'c1',
    gmailMessageId: 'm1',
    visibility: 'byra',
    ownerUserId: 'u1',
    subject: 'x',
    bodyText: 'y'
  });
  assert.equal(rec.id, 'rec2');
  assert.equal(archiveStore.tableRef(), 'tblRealMejlarkiv');
});

test('createRecord retryar write när första posten får 403', async (t) => {
  let dataPosts = 0;
  t.mock.method(axios, 'get', async (url) => {
    if (String(url).includes('/meta/bases/')) {
      return {
        data: {
          tables: [
            {
              id: 'tblMejlarkiv',
              name: 'Mejlarkiv',
              fields: archiveStore.REQUIRED_FIELDS.map((f, i) => ({
                id: 'fld' + i,
                name: f.name,
                type: f.type
              }))
            }
          ]
        }
      };
    }
    return { data: { records: [] } };
  });
  t.mock.method(axios, 'post', async (url, body) => {
    if (String(url).includes('/meta/')) {
      return { data: { id: 'fldZ', name: body && body.name } };
    }
    dataPosts += 1;
    if (dataPosts === 1) throw airtableErr(403);
    return { data: { id: 'recRetry', fields: body.fields } };
  });

  const rec = await archiveStore.createRecord({
    customerId: 'c1',
    gmailMessageId: 'mRetry',
    visibility: 'privat',
    ownerUserId: 'u1',
    subject: 'retry',
    bodyText: 'x'
  });
  assert.equal(rec.id, 'recRetry');
  assert.equal(dataPosts, 2);
});
