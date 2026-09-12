const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SAMARBETE_BANKID_MODE = 'mock';
process.env.SAMARBETE_BANKID_SECRET = 'test-secret-samarbete-bankid';

const bankid = require('./samarbete-bankid');

test('mock BankID start + poll ger session', async () => {
  const started = bankid.startBankId({ samarbeteToken: 'tok123', endUserIp: '127.0.0.1' });
  assert.equal(started.mode, 'mock');
  assert.ok(started.orderRef);

  let result = bankid.pollBankId(started.orderRef);
  assert.equal(result.status, 'pending');

  // Force complete by polling after manipulating — wait loop
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    result = bankid.pollBankId(started.orderRef);
    if (result.status === 'complete') break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(result.status, 'complete');
  assert.ok(result.sessionToken);
  const session = bankid.verifySession(result.sessionToken);
  assert.equal(session.samarbeteToken, 'tok123');
  assert.ok(session.name);
});

test('sessionMatchesToken', () => {
  const token = bankid.createSession({
    samarbeteToken: 'abc',
    name: 'Ada',
    personalNumber: '198001011234'
  });
  const session = bankid.verifySession(token);
  assert.equal(bankid.sessionMatchesToken(session, 'abc'), true);
  assert.equal(bankid.sessionMatchesToken(session, 'other'), false);
});
