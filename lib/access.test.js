/**
 * Enhetstester för roll- och kundbehörighet.
 * Kör: node --test lib/access.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeRole,
  isClientFlowAdmin,
  isLedare,
  isAnstalld,
  isLedareOrAdmin,
  customerByraId,
  parseAnvandareIds,
  userHasCustomerAccess,
  kunddataFilterFormula,
  mergeAnvandareValue,
  resolveUserIdsByNames,
  uppdragAssignedToUser
} = require('./access');

describe('normalizeRole', () => {
  it('mappar Användare och user till Anställd', () => {
    assert.equal(normalizeRole('Användare'), 'Anställd');
    assert.equal(normalizeRole('anvandare'), 'Anställd');
    assert.equal(normalizeRole('user'), 'Anställd');
    assert.equal(normalizeRole('Anställd'), 'Anställd');
    assert.equal(normalizeRole('anstald'), 'Anställd');
  });

  it('behåller Ledare och ClientFlowAdmin', () => {
    assert.equal(normalizeRole('Ledare'), 'Ledare');
    assert.equal(normalizeRole('ClientFlowAdmin'), 'ClientFlowAdmin');
    assert.equal(normalizeRole('admin'), 'ClientFlowAdmin');
  });
});

describe('role helpers', () => {
  it('känner igen ledare och anställd', () => {
    assert.equal(isLedare('Ledare'), true);
    assert.equal(isAnstalld('Användare'), true);
    assert.equal(isClientFlowAdmin('ClientFlowAdmin'), true);
    assert.equal(isLedareOrAdmin('Ledare'), true);
    assert.equal(isLedareOrAdmin('Anställd'), false);
  });
});

describe('parseAnvandareIds', () => {
  it('hanterar array, kommaseparerad text och tomt', () => {
    assert.deepEqual(parseAnvandareIds(['recA', 'recB']), ['recA', 'recB']);
    assert.deepEqual(parseAnvandareIds('recA,recB recC'), ['recA', 'recB', 'recC']);
    assert.deepEqual(parseAnvandareIds(''), []);
    assert.deepEqual(parseAnvandareIds(null), []);
  });
});

describe('userHasCustomerAccess', () => {
  const customer = {
    id: 'recKund',
    fields: { 'Byrå ID': '12', Användare: 'recEmp,recOther' }
  };

  it('ger admin allt', () => {
    assert.equal(userHasCustomerAccess({ role: 'ClientFlowAdmin' }, customer), true);
  });

  it('ger ledare alla kunder på byrån', () => {
    assert.equal(userHasCustomerAccess({ role: 'Ledare', byraId: '12' }, customer), true);
    assert.equal(userHasCustomerAccess({ role: 'Ledare', byraId: '99' }, customer), false);
  });

  it('ger anställd bara kunder hon är kopplad till', () => {
    assert.equal(userHasCustomerAccess({ role: 'Anställd', id: 'recEmp', byraId: '12' }, customer), true);
    assert.equal(userHasCustomerAccess({ role: 'Användare', id: 'recEmp', byraId: '12' }, customer), true);
    assert.equal(userHasCustomerAccess({ role: 'Anställd', id: 'recNope', byraId: '12' }, customer), false);
  });
});

describe('kunddataFilterFormula', () => {
  it('filtrerar inte för admin', () => {
    assert.equal(kunddataFilterFormula({ role: 'ClientFlowAdmin' }), '');
  });

  it('filtrerar ledare på byrå', () => {
    const f = kunddataFilterFormula({ role: 'Ledare', byraId: '12' });
    assert.match(f, /Byrå ID/);
    assert.match(f, /12/);
  });

  it('filtrerar anställd på byrå och Användare, även rollen Användare', () => {
    const f = kunddataFilterFormula({ role: 'Användare', byraId: '12', id: 'recEmp' });
    assert.match(f, /Användare/);
    assert.match(f, /recEmp/);
  });

  it('returnerar null när anställd saknar id', () => {
    assert.equal(kunddataFilterFormula({ role: 'Anställd', byraId: '12' }), null);
  });
});

describe('mergeAnvandareValue', () => {
  it('slår ihop textfält utan dubbletter', () => {
    assert.equal(mergeAnvandareValue('recA', ['recB', 'recA']), 'recA,recB');
  });

  it('behåller arrayform om fältet redan är en lista', () => {
    assert.deepEqual(mergeAnvandareValue(['recA'], ['recB']), ['recA', 'recB']);
  });
});

describe('resolveUserIdsByNames', () => {
  const users = [
    { id: 'rec1', name: 'Anna Andersson', email: 'anna@byra.se' },
    { id: 'rec2', name: 'Bo Berg', email: 'bo@byra.se' }
  ];
  it('matchar namn case-insensitivt', () => {
    assert.deepEqual(resolveUserIdsByNames(users, ['anna andersson', 'Bo Berg']), ['rec1', 'rec2']);
  });
});

describe('uppdragAssignedToUser', () => {
  it('matchar handläggare eller klientansvarig', () => {
    const user = { name: 'Anna Andersson', email: 'anna@byra.se', id: 'rec1' };
    assert.equal(uppdragAssignedToUser({ Ansvarig: 'Anna Andersson' }, user), true);
    assert.equal(uppdragAssignedToUser({ Klientansvarig: 'Anna Andersson' }, user), true);
    assert.equal(uppdragAssignedToUser({ Ansvarig: 'Någon Annan' }, user), false);
  });
});

describe('customerByraId', () => {
  it('läser vanliga fältnamn', () => {
    assert.equal(customerByraId({ 'Byrå ID': '7' }), '7');
    assert.equal(customerByraId({ Byra_ID: '8' }), '8');
  });
});
