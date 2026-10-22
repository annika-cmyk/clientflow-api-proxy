/**
 * Tester för inkrementell Gmail history/merge-cache.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_CACHED_MESSAGES,
  MIN_PER_LABEL,
  emptyCache,
  toCompactMessage,
  capMessages,
  fairSelectIds,
  buildCacheFromFullSync,
  mergeFullSyncIntoCache,
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
    subject: `S${i}`,
    labelIds: ['LA']
  }));
  const capped = capMessages(many);
  assert.equal(capped.length, MAX_CACHED_MESSAGES);
  assert.equal(capped[0].id, `m${MAX_CACHED_MESSAGES + 19}`);
});

test('fairSelectIds round-robin över etiketter (tysta etiketter svälts inte)', () => {
  const idsByLabel = new Map([
    ['LA', Array.from({ length: 40 }, (_, i) => `a${i}`)],
    ['LB', Array.from({ length: 40 }, (_, i) => `b${i}`)],
    ['LC', Array.from({ length: 5 }, (_, i) => `c${i}`)]
  ]);
  const selected = fairSelectIds(idsByLabel, 30);
  assert.equal(selected.length, 30);
  const fromA = selected.filter((id) => id.startsWith('a')).length;
  const fromB = selected.filter((id) => id.startsWith('b')).length;
  const fromC = selected.filter((id) => id.startsWith('c')).length;
  // Round-robin: C tar slut efter 5, resten delas mellan A och B (~12–13 var).
  assert.ok(fromA >= 10 && fromA <= 14, `A got ${fromA}`);
  assert.ok(fromB >= 10 && fromB <= 14, `B got ${fromB}`);
  assert.equal(fromC, 5, 'C (quiet) måste få alla sina id:n innan A/B fyller resten');
});

test('capMessages behåller minsta antal per etikett trots högvolym-etikett', () => {
  const now = Date.parse('2026-10-22T12:00:00.000Z');
  const messages = [];
  // Kund A: 200 nyare mejl
  for (let i = 0; i < 200; i += 1) {
    messages.push({
      id: `a${i}`,
      internalDate: now - i * 1000,
      labelIds: ['LA', 'INBOX'],
      subject: `A${i}`
    });
  }
  // Kund B och C: få äldre (men inom 30d)
  messages.push({
    id: 'b1',
    internalDate: now - 10 * 24 * 60 * 60 * 1000,
    labelIds: ['LB', 'INBOX'],
    subject: 'B quiet'
  });
  messages.push({
    id: 'c1',
    internalDate: now - 12 * 24 * 60 * 60 * 1000,
    labelIds: ['LC', 'INBOX'],
    subject: 'C quiet'
  });
  const capped = capMessages(messages, 50, now, {
    kunderLabelIds: new Set(['LA', 'LB', 'LC']),
    minPerLabel: MIN_PER_LABEL
  });
  assert.equal(capped.length, 50);
  assert.ok(capped.some((m) => m.id === 'b1'), 'B får inte trängas bort av A');
  assert.ok(capped.some((m) => m.id === 'c1'), 'C får inte trängas bort av A');
});

test('mergeFullSyncIntoCache: A+B kvar när ny sync bara hämtar C', () => {
  const now = Date.parse('2026-10-22T12:00:00.000Z');
  const existing = buildCacheFromFullSync({
    historyId: '10',
    labels: [
      { id: 'LA', name: 'KUNDER/A' },
      { id: 'LB', name: 'KUNDER/B' }
    ],
    messages: [
      {
        id: 'a1',
        subject: 'From A',
        internalDate: now - 5 * 24 * 60 * 60 * 1000,
        labelIds: ['LA', 'INBOX']
      },
      {
        id: 'b1',
        subject: 'From B',
        internalDate: now - 6 * 24 * 60 * 60 * 1000,
        labelIds: ['LB', 'INBOX']
      }
    ],
    nowMs: now,
    kunderLabelIds: new Set(['LA', 'LB'])
  });
  // Simulerar Shift+refresh som bara fick med C (sample/cap-bug tidigare ersatte allt).
  const next = mergeFullSyncIntoCache(existing, {
    historyId: '99',
    labels: [
      { id: 'LA', name: 'KUNDER/A' },
      { id: 'LB', name: 'KUNDER/B' },
      { id: 'LC', name: 'KUNDER/Andreas Gehricke' }
    ],
    messages: [
      {
        id: 'c1',
        subject: 'Tax Return Anaysis',
        internalDate: now - 1 * 24 * 60 * 60 * 1000,
        labelIds: ['LC', 'INBOX']
      }
    ],
    syncedAt: '2026-10-22T12:00:00.000Z',
    nowMs: now,
    kunderLabelIds: new Set(['LA', 'LB', 'LC'])
  });
  const ids = new Set(next.messages.map((m) => m.id));
  assert.ok(ids.has('a1'), 'A måste vara kvar efter full sync-merge');
  assert.ok(ids.has('b1'), 'B måste vara kvar efter full sync-merge');
  assert.ok(ids.has('c1'), 'C (ny) ska finnas');
  assert.equal(next.messages.length, 3);
  assert.equal(next.historyId, '99');
});

test('mergeFullSyncIntoCache evictar bara utanför datumfönster, inte övriga kunder', () => {
  const now = Date.parse('2026-10-22T12:00:00.000Z');
  const existing = {
    historyId: '1',
    syncedAt: null,
    labels: [],
    messages: [
      {
        id: 'old-a',
        subject: 'Too old',
        internalDate: now - 45 * 24 * 60 * 60 * 1000,
        labelIds: ['LA']
      },
      {
        id: 'keep-b',
        subject: 'Keep B',
        internalDate: now - 3 * 24 * 60 * 60 * 1000,
        labelIds: ['LB']
      }
    ]
  };
  const next = mergeFullSyncIntoCache(existing, {
    messages: [
      {
        id: 'new-c',
        subject: 'New C',
        internalDate: now - 1 * 24 * 60 * 60 * 1000,
        labelIds: ['LC']
      }
    ],
    nowMs: now,
    kunderLabelIds: new Set(['LA', 'LB', 'LC'])
  });
  const ids = new Set(next.messages.map((m) => m.id));
  assert.equal(ids.has('old-a'), false);
  assert.ok(ids.has('keep-b'));
  assert.ok(ids.has('new-c'));
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
