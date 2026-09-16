/**
 * Tester för mejl ↔ uppgift-länk.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const tl = require('./task-link');

test('storageBucketKey är användarscopead', () => {
  assert.equal(tl.storageBucketKey('Annika@Byra.se'), 'cf-mejl-task-link:annika@byra.se');
  assert.equal(tl.storageBucketKey(''), 'cf-mejl-task-link:anon');
});

test('link sparar byMessage, byRun och byUppdrag', () => {
  const { store, link } = tl.link(tl.emptyStore(), {
    messageId: 'msg1',
    runId: 'run1',
    uppdragId: 'upp1'
  });
  assert.equal(link.messageId, 'msg1');
  assert.equal(store.byRun.run1, 'msg1');
  assert.equal(store.byUppdrag.upp1, 'msg1');
  assert.equal(tl.getByMessage(store, 'msg1').runId, 'run1');
  assert.equal(tl.getByRun(store, 'run1').messageId, 'msg1');
  assert.equal(tl.getByUppdrag(store, 'upp1').messageId, 'msg1');
});

test('link kräver messageId och minst ett mål-id', () => {
  assert.equal(tl.link(tl.emptyStore(), { messageId: 'm', runId: '' }), null);
  assert.equal(tl.link(tl.emptyStore(), { messageId: '', runId: 'r' }), null);
});

test('findForKalender hittar via run eller uppdrag', () => {
  const { store } = tl.link(tl.emptyStore(), {
    messageId: 'msgX',
    runId: 'rX',
    uppdragId: 'uX'
  });
  assert.equal(tl.findForKalender(store, { runId: 'rX' }).messageId, 'msgX');
  assert.equal(tl.findForKalender(store, { uppdragId: 'uX' }).messageId, 'msgX');
  assert.equal(tl.findForKalender(store, { runId: 'other' }), null);
});

test('mejlReplyUrl bygger deep-link', () => {
  assert.equal(tl.mejlReplyUrl('abc'), 'mejl.html?messageId=abc');
  assert.equal(tl.mejlReplyUrl('abc', { reply: true }), 'mejl.html?messageId=abc&reply=1');
  assert.equal(tl.mejlReplyUrl(''), 'mejl.html');
});
