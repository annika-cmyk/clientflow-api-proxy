const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseUppdragRiskAtgarderList,
  normalizeUppdragRiskAtgarderDone,
  requiredRiskAtgarderFromUppdrag,
  riskAtgarderAllChecked
} = require('./uppdrag-risk');

test('parseUppdragRiskAtgarderList reads JSON and bullet lists', () => {
  assert.deepEqual(parseUppdragRiskAtgarderList('["A","B"]'), ['A', 'B']);
  assert.deepEqual(parseUppdragRiskAtgarderList('- En\n• Två'), ['En', 'Två']);
  assert.deepEqual(parseUppdragRiskAtgarderList(''), []);
});

test('normalizeUppdragRiskAtgarderDone accepts arrays from the API body', () => {
  const done = normalizeUppdragRiskAtgarderDone([
    { text: 'Kontrollera sanktionslistor', checkedAt: '2026-08-17', user: 'a@b.se' },
    { text: 'Kontrollera sanktionslistor' }
  ]);
  assert.equal(done.length, 1);
  assert.equal(done[0].text, 'Kontrollera sanktionslistor');
  assert.equal(done[0].user, 'a@b.se');
});

test('riskAtgarderAllChecked requires every selected action', () => {
  const required = requiredRiskAtgarderFromUppdrag({
    'Riskåtgärder valda': JSON.stringify(['Åtgärd 1', 'Åtgärd 2'])
  });
  assert.equal(riskAtgarderAllChecked(required, [{ text: 'Åtgärd 1' }]), false);
  assert.equal(riskAtgarderAllChecked(required, [{ text: 'åtgärd 1' }, { text: 'Åtgärd 2' }]), true);
  assert.equal(riskAtgarderAllChecked([], []), true);
});
