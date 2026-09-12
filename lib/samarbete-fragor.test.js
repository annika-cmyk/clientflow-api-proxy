const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseQuestions,
  encodeQuestions,
  splitPublicAndBankId,
  buildEmailQuestionBlocks,
  questionsForPublicApi
} = require('./samarbete-fragor');

test('parseQuestions läser fil- och bankid-markörer', () => {
  const q = parseQuestions(
    '1. Kontoutdrag [fil obligatorisk]\n2. [bankid] Personuppgifter\n3. [bankid] Ägare [fil obligatorisk]'
  );
  assert.equal(q.length, 3);
  assert.equal(q[0].text, 'Kontoutdrag');
  assert.equal(q[0].fileRequired, true);
  assert.equal(q[0].requiresBankId, false);
  assert.equal(q[1].requiresBankId, true);
  assert.equal(q[1].text, 'Personuppgifter');
  assert.equal(q[2].fileRequired, true);
  assert.equal(q[2].requiresBankId, true);
});

test('encodeQuestions roundtrip', () => {
  const encoded = encodeQuestions([
    { text: 'Offentlig fråga', fileRequired: false, requiresBankId: false },
    { text: 'Hemlig', fileRequired: true, requiresBankId: true }
  ]);
  const parsed = parseQuestions(encoded);
  assert.equal(parsed[0].text, 'Offentlig fråga');
  assert.equal(parsed[1].requiresBankId, true);
  assert.equal(parsed[1].fileRequired, true);
  assert.equal(parsed[1].text, 'Hemlig');
});

test('buildEmailQuestionBlocks döljer bankid-text', () => {
  const title = '1. Synlig fråga\n2. [bankid] Hemlig fråga';
  const { html, publicCount, bankIdCount } = buildEmailQuestionBlocks(title);
  assert.equal(publicCount, 1);
  assert.equal(bankIdCount, 1);
  assert.match(html, /Synlig fråga/);
  assert.doesNotMatch(html, /Hemlig fråga/);
  assert.match(html, /BankID/i);
});

test('questionsForPublicApi låser bankid tills verifierad', () => {
  const q = parseQuestions('1. A\n2. [bankid] B');
  const locked = questionsForPublicApi(q, false);
  assert.equal(locked[1].locked, true);
  assert.doesNotMatch(locked[1].text, /^B$/);
  const open = questionsForPublicApi(q, true);
  assert.equal(open[1].locked, false);
  assert.equal(open[1].text, 'B');
});

test('splitPublicAndBankId', () => {
  const { publicQuestions, bankIdQuestions } = splitPublicAndBankId(
    parseQuestions('1. A\n2. [bankid] B\n3. C')
  );
  assert.equal(publicQuestions.length, 2);
  assert.equal(bankIdQuestions.length, 1);
});
