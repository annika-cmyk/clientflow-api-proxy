/**
 * Tester för inkrementell Gmail history/merge-cache.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_CACHED_MESSAGES,
  emptyCache,
  toCompactMessage,
  capMessages,
  buildCacheFromFullSync,
  collectHistoryMessageIds,
  mergeHistoryIntoCache,
  parseSyncCache,
  serializeSyncCache,
  normalizeInboxMode,
  isHistoryExpiredError
} = require('./sync-cache');

test('toCompactMessage tar bort body och kapar strängar', () => {
  const c = toCompactMessage({
    id: 'm1',
    threadId: 't1',
    labelIds: ['INBOX', 'L1'],
    internalDate: 100,
    snippet: 'x'.repeat(400),
    subject: 'Hej',
    from: 'a@b.se',
    to: 'c@d.se',
    text: 'hemlig body',
    html: '<p>x</p>',
    attachments: [
      { filename: 'a.pdf', attachmentId: '1' },
      { filename: 'b.pdf', attachmentId: '2' }
    ]
  });
  assert.equal(c.id, 'm1');
  assert.equal(c.snippet.length, 240);
  assert.equal(c.text, undefined);
  assert.equal(c.html, undefined);
  assert.equal(c.attachments, undefined);
  assert.equal(c.attachmentCount, 2);
});

test('toCompactMessage behåller attachmentCount utan bilagelista', () => {
  const { attachmentCountFromMsg } = require('./sync-cache');
  assert.equal(attachmentCountFromMsg({ attachmentCount: 3 }), 3);
  assert.equal(attachmentCountFromMsg({ attachmentMeta: [{}, {}] }), 2);
  assert.equal(toCompactMessage({ id: 'x', attachmentCount: 1 }).attachmentCount, 1);
  assert.equal(toCompactMessage({ id: 'y' }).attachmentCount, 0);
});

test('collectHistoryMessageIds: added, deleted, label changes', () => {
  const { addedIds, removedIds, changedIds } = collectHistoryMessageIds([
    {
      messagesAdded: [{ message: { id: 'a1' } }],
      labelsAdded: [{ message: { id: 'c1' }, labelIds: ['L1'] }]
    },
    {
      messagesDeleted: [{ message: { id: 'd1' } }],
      labelsRemoved: [{ message: { id: 'c2' }, labelIds: ['L2'] }]
    },
    {
      // tillagd och sedan borttagen i samma batch-sekvens
      messagesAdded: [{ message: { id: 'gone' } }]
    },
    {
      messagesDeleted: [{ message: { id: 'gone' } }]
    }
  ]);
  assert.deepEqual([...addedIds].sort(), ['a1']);
  assert.ok(removedIds.has('d1'));
  assert.ok(removedIds.has('gone'));
  assert.ok(changedIds.has('c1'));
  assert.ok(changedIds.has('c2'));
  assert.equal(changedIds.has('a1'), false);
});

test('mergeHistoryIntoCache lägger till, uppdaterar och tar bort', () => {
  const base = buildCacheFromFullSync({
    historyId: '10',
    labels: [{ id: 'L1', name: 'KUNDER/A' }],
    messages: [
      { id: 'old', subject: 'Old', internalDate: 1, labelIds: ['L1'] },
      { id: 'keep', subject: 'Keep', internalDate: 2, labelIds: ['L1'] }
    ],
    syncedAt: '2026-01-01T00:00:00.000Z'
  });
  const next = mergeHistoryIntoCache(base, {
    removedIds: ['old'],
    updatedMessages: [
      { id: 'keep', subject: 'Keep updated', internalDate: 2, labelIds: ['L1', 'INBOX'] },
      { id: 'new', subject: 'New', internalDate: 99, labelIds: ['L1'] }
    ],
    historyId: '20',
    labels: [{ id: 'L1', name: 'KUNDER/A' }, { id: 'L2', name: 'KUNDER/B' }],
    syncedAt: '2026-09-13T12:00:00.000Z'
  });
  assert.equal(next.historyId, '20');
  assert.equal(next.syncedAt, '2026-09-13T12:00:00.000Z');
  assert.equal(next.messages.length, 2);
  assert.equal(next.messages[0].id, 'new');
  assert.equal(next.messages.find((m) => m.id === 'keep').subject, 'Keep updated');
  assert.equal(next.messages.find((m) => m.id === 'old'), undefined);
  assert.equal(next.labels.length, 2);
});

test('capMessages begränsar till MAX och sorterar nyast först', () => {
  const many = Array.from({ length: MAX_CACHED_MESSAGES + 20 }, (_, i) => ({
    id: `m${i}`,
    internalDate: i,
    subject: `S${i}`
  }));
  const capped = capMessages(many);
  assert.equal(capped.length, MAX_CACHED_MESSAGES);
  assert.equal(capped[0].id, `m${MAX_CACHED_MESSAGES + 19}`);
});

test('parse/serialize sync cache roundtrip', () => {
  const cache = buildCacheFromFullSync({
    historyId: '42',
    labels: [{ id: 'L1', name: 'KUNDER/X' }],
    messages: [{ id: 'm1', subject: 'Hi', internalDate: 5, labelIds: ['L1'] }]
  });
  const raw = serializeSyncCache(cache);
  const parsed = parseSyncCache(raw);
  assert.equal(parsed.historyId, '42');
  assert.equal(parsed.messages[0].id, 'm1');
  assert.equal(parseSyncCache('').historyId, null);
  assert.equal(parseSyncCache('not-json').messages.length, 0);
  assert.equal(emptyCache().messages.length, 0);
});

test('normalizeInboxMode tolkar query-parametrar', () => {
  assert.equal(normalizeInboxMode({ mode: 'cache' }), 'cache');
  assert.equal(normalizeInboxMode({ mode: 'full' }), 'full');
  assert.equal(normalizeInboxMode({ mode: 'sync' }), 'sync');
  assert.equal(normalizeInboxMode({ cacheOnly: '1' }), 'cache');
  assert.equal(normalizeInboxMode({ full: '1' }), 'full');
  assert.equal(normalizeInboxMode({ sync: '0' }), 'cache');
  assert.equal(normalizeInboxMode({ sync: 'full' }), 'full');
  assert.equal(normalizeInboxMode({}), 'sync');
});

test('isHistoryExpiredError känner igen 404 / history-meddelanden', () => {
  assert.equal(isHistoryExpiredError({ response: { status: 404 } }), true);
  assert.equal(
    isHistoryExpiredError({
      response: { data: { error: { message: 'Start history id is too old' } } }
    }),
    true
  );
  assert.equal(isHistoryExpiredError({ message: 'network timeout' }), false);
});

test('SYNC_WINDOW_DAYS är 30 och gmailNewerThanQuery', () => {
  const {
    SYNC_WINDOW_DAYS,
    gmailNewerThanQuery,
    appendDateWindowToQuery,
    isWithinSyncWindow,
    filterMessagesToWindow,
    syncWindowStartMs,
    buildCacheFromFullSync
  } = require('./sync-cache');
  assert.equal(SYNC_WINDOW_DAYS, 30);
  assert.equal(gmailNewerThanQuery(), 'newer_than:30d');
  assert.equal(gmailNewerThanQuery(7), 'newer_than:7d');
  assert.equal(appendDateWindowToQuery('label:KUNDER'), 'label:KUNDER newer_than:30d');
  assert.equal(
    appendDateWindowToQuery('label:X newer_than:30d'),
    'label:X newer_than:30d'
  );

  const now = Date.parse('2026-09-22T12:00:00.000Z');
  const recent = { id: 'r', internalDate: now - 5 * 24 * 60 * 60 * 1000 };
  const old = { id: 'o', internalDate: now - 45 * 24 * 60 * 60 * 1000 };
  assert.equal(isWithinSyncWindow(recent, now), true);
  assert.equal(isWithinSyncWindow(old, now), false);
  assert.equal(isWithinSyncWindow({ id: 'tiny', internalDate: 99 }, now), true);
  assert.equal(filterMessagesToWindow([recent, old], now).length, 1);
  assert.ok(syncWindowStartMs(now) < now);

  const cache = buildCacheFromFullSync({
    historyId: '1',
    messages: [recent, old],
    nowMs: now
  });
  assert.equal(cache.messages.length, 1);
  assert.equal(cache.messages[0].id, 'r');
});
