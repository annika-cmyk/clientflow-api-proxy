const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyKycTier,
  kycArchiveYears,
  detectTriggers,
  applyDetectedTriggers,
  clearTriggersAfterNewKyc,
  hasPendingKycTriggers,
  TRIGGER_TYPES
} = require('./kyc-uppfoljning');

test('classifyKycTier by risk level', () => {
  assert.equal(classifyKycTier({ Riskniva: 'Låg' }), 'lag');
  assert.equal(classifyKycTier({ Riskniva: 'Normal' }), 'normal');
  assert.equal(classifyKycTier({ Riskniva: 'Hög' }), 'hog');
});

test('classifyKycTier as hog for PEP and kontantintensiv', () => {
  assert.equal(classifyKycTier({ Riskniva: 'Normal', 'Riskhöjande faktorer övrigt': 'PEP eller RCA' }), 'hog');
  assert.equal(classifyKycTier({ Riskniva: 'Låg', 'Riskhöjande faktorer övrigt': 'Kontantintensiv verksamhet' }), 'hog');
  assert.equal(classifyKycTier({ Riskniva: 'Normal', 'Riskhöjande faktorer övrigt': 'Högriskländer' }), 'hog');
});

test('kycArchiveYears follows tier', () => {
  assert.equal(kycArchiveYears({ Riskniva: 'Låg' }), 5);
  assert.equal(kycArchiveYears({ Riskniva: 'Normal' }), 3);
  assert.equal(kycArchiveYears({ Riskniva: 'Hög' }), 1);
  assert.equal(kycArchiveYears({ Riskniva: 'Normal', 'Riskhöjande faktorer övrigt': 'PEP eller RCA' }), 1);
});

test('detectTriggers for address, huvudman and avvikelse', () => {
  const prev = { Address: 'Storgatan 1', 'Verklig huvudman': 'Anna Andersson' };
  const next = { Address: 'Lillgatan 2', 'Verklig huvudman': 'Bertil Bengtsson' };
  const triggers = detectTriggers(prev, next, { today: '2026-01-15' });
  assert.equal(triggers.length, 2);
  assert.equal(triggers[0].type, TRIGGER_TYPES.NY_ADRESS);
  assert.equal(triggers[1].type, TRIGGER_TYPES.AGARFORANDRING);

  const tx = detectTriggers(prev, prev, { avvikelseTyp: 'Ovanlig transaktion', today: '2026-02-01' });
  assert.equal(tx.length, 1);
  assert.equal(tx[0].type, TRIGGER_TYPES.STOR_TRANSAKTION);
});

test('applyDetectedTriggers merges and clearTriggersAfterNewKyc resets', () => {
  const prev = { Address: 'A' };
  const next = { Address: 'B' };
  const applied = applyDetectedTriggers(null, prev, next, { today: '2026-01-01' });
  assert.equal(applied.changed, true);
  assert.equal(applied.uppfoljning.triggers.length, 1);
  assert.equal(hasPendingKycTriggers(JSON.stringify(applied.uppfoljning)), true);

  const cleared = clearTriggersAfterNewKyc(JSON.stringify(applied.uppfoljning), next);
  assert.deepEqual(cleared.triggers, []);
  assert.equal(cleared.addressSnapshot, 'B');
});
