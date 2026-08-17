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
  userListedOnCustomer,
  kunddataFilterFormula,
  filterRecordsForUser,
  mergeAnvandareValue,
  applyAnvandareIds,
  anvandareIdsEqual,
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

  it('känner igen anställd via länkfält (array) eller namn', () => {
    assert.equal(userListedOnCustomer({ id: 'recEmp' }, { Användare: ['recEmp', 'recOther'] }), true);
    assert.equal(userListedOnCustomer({ name: 'Anna Andersson' }, { Användare: 'Anna Andersson' }), true);
    assert.equal(userListedOnCustomer({ email: 'anna@byra.se' }, { Användare: 'anna@byra.se' }), true);
    assert.equal(userListedOnCustomer({ id: 'recEmp' }, { Användare: [{ id: 'recEmp', name: 'Anna' }] }), true);
    assert.equal(userListedOnCustomer({ name: 'Anna Andersson' }, { Klientansvarig: 'Anna Andersson' }), true);
    assert.equal(userListedOnCustomer({ id: 'recNope' }, { Användare: ['recEmp'] }), false);
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

  it('hämtar byråns kunder för anställd, även rollen Användare', () => {
    const f = kunddataFilterFormula({ role: 'Användare', byraId: '12', id: 'recEmp' });
    assert.match(f, /Byrå ID/);
    assert.match(f, /12/);
    assert.doesNotMatch(f, /Användare/);
  });

  it('returnerar null när anställd saknar identitet', () => {
    assert.equal(kunddataFilterFormula({ role: 'Anställd', byraId: '12' }), null);
  });

  it('filtrerar bort kunder den anställda inte har behörighet till', () => {
    const records = [
      { id: 'rec1', fields: { 'Byrå ID': '12', Användare: 'recEmp' } },
      { id: 'rec2', fields: { 'Byrå ID': '12', Användare: 'recOther' } }
    ];
    const kept = filterRecordsForUser({ role: 'Anställd', id: 'recEmp', byraId: '12' }, records);
    assert.deepEqual(kept.map((r) => r.id), ['rec1']);
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

describe('applyAnvandareIds', () => {
  it('lägger till utan att ta bort befintliga', () => {
    assert.equal(applyAnvandareIds('recA', ['recB', 'recA'], 'merge'), 'recA,recB');
  });

  it('kan ersätta hela listan', () => {
    assert.equal(applyAnvandareIds('recA,recB', ['recC'], 'replace'), 'recC');
    assert.deepEqual(applyAnvandareIds(['recA'], ['recC'], 'replace'), ['recC']);
  });

  it('jämför behörighetslistor oberoende av ordning', () => {
    assert.equal(anvandareIdsEqual('recB,recA', ['recA', 'recB']), true);
    assert.equal(anvandareIdsEqual('recA', 'recB'), false);
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

describe('byraUsersFilterFormulas', () => {
  const {
    byraUsersFilterFormulas,
    byraUsersNameFilterFormulas,
    extractLinkedUserIdsFromByraFields,
    userRecordBelongsToByra,
    isAgencyStaffRole
  } = require('./access');

  it('matchar både text och numeriskt byrå-id', () => {
    const formulas = byraUsersFilterFormulas('12');
    assert.ok(formulas[0].includes('Byrå ID i text 2'));
    assert.ok(formulas[0].includes('=12'));
    assert.ok(formulas[0].includes('"12"'));
  });

  it('matchar byrånamn på användarposten och länkfältet', () => {
    const formulas = byraUsersNameFilterFormulas('Rydén Redovisning');
    assert.ok(formulas.some((f) => f.includes('{Byrå}=')));
    assert.ok(formulas.some((f) => f.includes('ARRAYJOIN({Byråer})')));
  });

  it('plockar länkade användar-id från byråposten', () => {
    assert.deepEqual(
      extractLinkedUserIdsFromByraFields({
        Användare: ['recAAAAAAAAAA', 'recBBBBBBBBBB'],
        Konsulter: ['recCCCCCCCCCC'],
        Namn: 'Byrån'
      }),
      ['recAAAAAAAAAA', 'recBBBBBBBBBB', 'recCCCCCCCCCC']
    );
  });

  it('känner igen byråmedlem via text-id eller Byråer-länk', () => {
    assert.equal(userRecordBelongsToByra({ 'Byrå ID i text 2': '12' }, '12', 'recByra'), true);
    assert.equal(userRecordBelongsToByra({ Byråer: ['recByra'] }, '12', 'recByra'), true);
    assert.equal(userRecordBelongsToByra({ 'Byrå ID i text 2': '99' }, '12', 'recByra'), false);
  });

  it('räknar ledare och anställd som byråpersonal', () => {
    assert.equal(isAgencyStaffRole('Ledare'), true);
    assert.equal(isAgencyStaffRole('Användare'), true);
    assert.equal(isAgencyStaffRole('Extern'), false);
  });
});
