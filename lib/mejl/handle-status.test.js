/**
 * Tester för mejl hanteringsstatus (hanterat / att hantera).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const hs = require('./handle-status');

test('normalizeStatus mappar svenska och engelska alias', () => {
  assert.equal(hs.normalizeStatus('handled'), hs.HANDLED);
  assert.equal(hs.normalizeStatus('hanterat'), hs.HANDLED);
  assert.equal(hs.normalizeStatus('todo'), hs.TODO);
  assert.equal(hs.normalizeStatus('att-hantera'), hs.TODO);
  assert.equal(hs.normalizeStatus('att hantera'), hs.TODO);
  assert.equal(hs.normalizeStatus(''), hs.NONE);
  assert.equal(hs.normalizeStatus('weird'), hs.NONE);
});

test('toggleStatus rensar vid klick på aktiv status', () => {
  assert.equal(hs.toggleStatus('', 'handled'), hs.HANDLED);
  assert.equal(hs.toggleStatus('handled', 'handled'), hs.NONE);
  assert.equal(hs.toggleStatus('handled', 'todo'), hs.TODO);
  assert.equal(hs.toggleStatus('todo', 'todo'), hs.NONE);
  assert.equal(hs.toggleStatus('todo', 'hanterat'), hs.HANDLED);
});

test('listItemClass ger CSS-klasser', () => {
  assert.equal(hs.listItemClass('handled'), 'is-handled');
  assert.equal(hs.listItemClass('todo'), 'is-todo');
  assert.equal(hs.listItemClass(''), '');
});

test('storageBucketKey är användarscopead', () => {
  assert.equal(hs.storageBucketKey('Annika@Byra.se'), 'cf-mejl-handle-status:annika@byra.se');
  assert.equal(hs.storageBucketKey(''), 'cf-mejl-handle-status:anon');
});
