/**
 * Tester för mejl hanteringsstatus (hanterat / att hantera / uppgift skapad).
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
  assert.equal(hs.normalizeStatus('task_created'), hs.TASK_CREATED);
  assert.equal(hs.normalizeStatus('uppgift skapad'), hs.TASK_CREATED);
  assert.equal(hs.normalizeStatus('uppgift-skapad'), hs.TASK_CREATED);
  assert.equal(hs.normalizeStatus(''), hs.NONE);
  assert.equal(hs.normalizeStatus('weird'), hs.NONE);
});

test('toggleStatus rensar vid klick på aktiv status', () => {
  assert.equal(hs.toggleStatus('', 'handled'), hs.HANDLED);
  assert.equal(hs.toggleStatus('handled', 'handled'), hs.NONE);
  assert.equal(hs.toggleStatus('handled', 'todo'), hs.TODO);
  assert.equal(hs.toggleStatus('todo', 'todo'), hs.NONE);
  assert.equal(hs.toggleStatus('todo', 'hanterat'), hs.HANDLED);
  assert.equal(hs.toggleStatus('task_created', 'handled'), hs.HANDLED);
});

test('listItemClass ger CSS-klasser', () => {
  assert.equal(hs.listItemClass('handled'), 'is-handled');
  assert.equal(hs.listItemClass('todo'), 'is-todo');
  assert.equal(hs.listItemClass('task_created'), 'is-task-created');
  assert.equal(hs.listItemClass(''), '');
});

test('statusLabel ger svenska etiketter', () => {
  assert.equal(hs.statusLabel('task_created'), 'Uppgift skapad');
  assert.equal(hs.statusLabel('hanterat'), 'Hanterat');
  assert.equal(hs.statusLabel('todo'), 'Att hantera');
  assert.equal(hs.statusLabel(''), '');
});

test('storageBucketKey är användarscopead', () => {
  assert.equal(hs.storageBucketKey('Annika@Byra.se'), 'cf-mejl-handle-status:annika@byra.se');
  assert.equal(hs.storageBucketKey(''), 'cf-mejl-handle-status:anon');
});
