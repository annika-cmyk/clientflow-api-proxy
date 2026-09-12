/**
 * Kör: node --test lib/cfa.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isCfa,
  isCfaConfirmed,
  canSignArDokumentation,
  assertCanSignAr,
  matchUserByCentraltName,
  isSoloFirm,
  buildCfaStatus,
  cfaFieldsFromBody,
  confirmCfaPatch,
  wouldLeaveZeroCfa,
  pickCfaSignerFromUsers,
  USER_FIELDS
} = require('./cfa');

describe('cfa flags', () => {
  it('läser isCfa från user och Airtable-fält', () => {
    assert.equal(isCfa({ isCfa: true }), true);
    assert.equal(isCfa({ [USER_FIELDS.IS_CFA]: true }), true);
    assert.equal(isCfa({ isCfa: false }), false);
    assert.equal(isCfa({}), false);
  });

  it('kräver både flagga och bekräftelsetid för signering', () => {
    assert.equal(isCfaConfirmed({ isCfa: true }), false);
    assert.equal(isCfaConfirmed({ isCfa: true, cfaConfirmedAt: '2026-09-12T10:00:00.000Z' }), true);
    assert.equal(canSignArDokumentation({ isCfa: true, cfaConfirmedAt: '2026-09-12' }), true);
    assert.throws(() => assertCanSignAr({ isCfa: true }), /CFA/);
  });
});

describe('solo + migration', () => {
  const annika = { id: 'rec1', name: 'Annika Rydén', email: 'a@x.se', role: 'Ledare' };
  const lisa = { id: 'rec2', name: 'Lisa Bok', email: 'l@x.se', role: 'Anställd' };

  it('detekterar ensam firma och föreslår ägaren', () => {
    assert.equal(isSoloFirm([annika]), true);
    assert.equal(isSoloFirm([annika, lisa]), false);
    const status = buildCfaStatus([annika], {});
    assert.equal(status.isSolo, true);
    assert.equal(status.needsSoloConfirm, true);
    assert.equal(status.suggestedUserId, 'rec1');
    assert.equal(status.hasCfa, false);
  });

  it('matchar Centralt funktionsansvarig mot användare', () => {
    assert.equal(matchUserByCentraltName([annika, lisa], 'Annika Rydén')?.id, 'rec1');
    assert.equal(matchUserByCentraltName([annika], 'Namn Namnsson'), null);
    const status = buildCfaStatus([annika, lisa], { centraltPerson: 'Lisa Bok' });
    assert.equal(status.migrationMatchUserId, 'rec2');
    assert.equal(status.suggestedUserId, 'rec2');
  });

  it('bekräftad CFA ger hasCfa', () => {
    const status = buildCfaStatus(
      [{ ...annika, isCfa: true, cfaConfirmedAt: '2026-09-12T12:00:00.000Z' }],
      {}
    );
    assert.equal(status.hasCfa, true);
    assert.equal(status.needsSoloConfirm, false);
  });
});

describe('patches och signer-pick', () => {
  it('sätter isCfa + confirmedAt vid utnämning', () => {
    const fields = cfaFieldsFromBody({ isCfa: true }, { assignNow: true });
    assert.equal(fields[USER_FIELDS.IS_CFA], true);
    assert.ok(fields[USER_FIELDS.CONFIRMED_AT]);
    const cleared = cfaFieldsFromBody({ isCfa: false }, { assignNow: true });
    assert.equal(cleared[USER_FIELDS.IS_CFA], false);
    assert.equal(cleared[USER_FIELDS.CONFIRMED_AT], '');
  });

  it('confirmCfaPatch sätter båda fälten', () => {
    const patch = confirmCfaPatch('2026-09-12T08:00:00.000Z');
    assert.deepEqual(patch, {
      [USER_FIELDS.IS_CFA]: true,
      [USER_FIELDS.CONFIRMED_AT]: '2026-09-12T08:00:00.000Z'
    });
  });

  it('skyddar mot att ta bort sista CFA', () => {
    const users = [
      { id: 'rec1', isCfa: true, cfaConfirmedAt: 'x' },
      { id: 'rec2', isCfa: false }
    ];
    assert.equal(wouldLeaveZeroCfa(users, 'rec1', false), true);
    assert.equal(wouldLeaveZeroCfa(users, 'rec2', false), false);
    assert.equal(wouldLeaveZeroCfa(users, 'rec1', true), false);
  });

  it('pickCfaSignerFromUsers kräver bekräftad CFA', () => {
    const users = [
      { id: 'rec1', name: 'Annika', email: 'a@x.se', isCfa: true },
      {
        id: 'rec2',
        name: 'Lisa',
        email: 'l@x.se',
        isCfa: true,
        cfaConfirmedAt: '2026-09-12T10:00:00.000Z'
      }
    ];
    assert.equal(pickCfaSignerFromUsers(users, 'rec1'), null);
    const signer = pickCfaSignerFromUsers(users, 'rec2');
    assert.equal(signer.epost, 'l@x.se');
    assert.equal(signer.isCfa, true);
  });
});
