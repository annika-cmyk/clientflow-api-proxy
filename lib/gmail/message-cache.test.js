/**
 * Tester för Gmail Mejlcache (Airtable body-persist, utan nätverk).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const messageCache = require('./message-cache');
const syncCache = require('./sync-cache');

test('messageToPayload + recordToFields roundtrip-fält', () => {
  const payload = messageCache.messageToPayload('user1', {
    id: 'm1',
    threadId: 't1',
    labelIds: ['INBOX', 'L1'],
    internalDate: 1727000000000,
    subject: 'Hej',
    from: 'a@b.se',
    to: 'c@d.se',
    cc: '',
    date: 'Mon, 22 Sep 2026 10:00:00 +0000',
    snippet: 'snippet',
    text: 'plain body',
    html: '<p>html body</p>',
    attachments: [{ filename: 'a.pdf', attachmentId: 'att1', mimeType: 'application/pdf', size: 10 }],
    messageIdHeader: '<id@x>',
    inReplyTo: ''
  });
  assert.equal(payload.ownerUserId, 'user1');
  assert.equal(payload.gmailMessageId, 'm1');
  assert.equal(payload.bodyText, 'plain body');
  assert.equal(payload.bodyHtml, '<p>html body</p>');
  assert.equal(payload.attachmentMeta.length, 1);

  const fields = messageCache.recordToFields(payload);
  assert.equal(fields['Owner User ID'], 'user1');
  assert.equal(fields['Gmail Message ID'], 'm1');
  assert.equal(fields['Internal Date'], '1727000000000');
  assert.match(fields['Label Ids'], /INBOX/);
  assert.equal(fields['Body Text'], 'plain body');

  const rec = messageCache.fieldsToRecord('rec1', fields);
  assert.equal(rec.id, 'rec1');
  assert.equal(rec.gmailMessageId, 'm1');
  assert.equal(rec.internalDate, 1727000000000);
  assert.deepEqual(rec.labelIds, ['INBOX', 'L1']);
  assert.equal(messageCache.hasUsableBody(rec), true);

  const summary = messageCache.recordToSummary(rec);
  assert.equal(summary.id, 'm1');
  assert.equal(summary.html, '<p>html body</p>');
  assert.equal(summary.fromCache, true);
  assert.equal(summary.attachmentCount, 1);
});

test('hasUsableBody kräver text eller html', () => {
  assert.equal(messageCache.hasUsableBody(null), false);
  assert.equal(messageCache.hasUsableBody({ bodyText: '', bodyHtml: '' }), false);
  assert.equal(messageCache.hasUsableBody({ bodyText: 'x' }), true);
  assert.equal(messageCache.hasUsableBody({ bodyHtml: '<p>x</p>' }), true);
});

test('utanför sync-fönster: messageToPayload används men isWithinSyncWindow filtrerar', () => {
  const now = Date.parse('2026-09-22T12:00:00.000Z');
  const oldMsg = {
    id: 'old',
    internalDate: now - 60 * syncCache.DAY_MS,
    text: 'gammal'
  };
  assert.equal(syncCache.isWithinSyncWindow(oldMsg, now), false);
  const recent = {
    id: 'new',
    internalDate: now - 2 * syncCache.DAY_MS,
    text: 'ny'
  };
  assert.equal(syncCache.isWithinSyncWindow(recent, now), true);
});
