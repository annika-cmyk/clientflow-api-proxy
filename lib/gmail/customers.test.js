/**
 * Gmail kundmappning – säkra Airtable-fält, ID-mappning och send-access.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  SAFE_KUNDDATA_FIELDS,
  mapCustomerRecord,
  resolveCustomerForSend
} = require('./customers');

describe('SAFE_KUNDDATA_FIELDS', () => {
  it('innehåller bara kända KUNDDATA-fält (inte Företagsnamn/Email/E-post)', () => {
    assert.deepEqual([...SAFE_KUNDDATA_FIELDS], [
      'Namn',
      'Orgnr',
      'Byrå ID',
      'Användare',
      'e-post'
    ]);
    assert.ok(!SAFE_KUNDDATA_FIELDS.includes('Företagsnamn'));
    assert.ok(!SAFE_KUNDDATA_FIELDS.includes('Email'));
    assert.ok(!SAFE_KUNDDATA_FIELDS.includes('E-post'));
  });
});

describe('mapCustomerRecord', () => {
  it('mappar Airtable-record-id till customer.id', () => {
    const c = mapCustomerRecord({
      id: 'rec7yJ2SSOh0IPU2x',
      fields: { Namn: 'Redovisningsbyrån Rydén & Co AB', 'e-post': 'info@example.com', Orgnr: '556677-8899' }
    });
    assert.equal(c.id, 'rec7yJ2SSOh0IPU2x');
    assert.equal(c.namn, 'Redovisningsbyrån Rydén & Co AB');
    assert.equal(c.email, 'info@example.com');
    assert.equal(c.orgnr, '556677-8899');
  });

  it('faller tillbaka till Företagsnamn om Namn saknas', () => {
    const c = mapCustomerRecord({ id: 'recX', fields: { Företagsnamn: 'Alt AB' } });
    assert.equal(c.namn, 'Alt AB');
  });
});

describe('resolveCustomerForSend', () => {
  const user = { id: 'reckYh9EaRbaDEYtv', role: 'Ledare', byraId: '49' };
  const customer = {
    id: 'rec7yJ2SSOh0IPU2x',
    namn: 'Redovisningsbyrån Rydén & Co AB',
    orgnr: '',
    email: ''
  };

  it('tillåter kund som syns i dropdown via getAccessibleCustomer även om listan är tom', async () => {
    let listCalls = 0;
    const found = await resolveCustomerForSend(user, customer.id, {
      getAccessibleCustomer: async () => customer,
      listAccessibleCustomers: async () => {
        listCalls += 1;
        return [];
      }
    });
    assert.equal(found.id, customer.id);
    assert.equal(listCalls, 0, 'ska inte falla tillbaka till listan när direkt-access lyckas');
  });

  it('returnerar null (→ 403) när varken ID-access eller listan hittar kunden', async () => {
    const found = await resolveCustomerForSend(user, customer.id, {
      getAccessibleCustomer: async () => null,
      listAccessibleCustomers: async () => []
    });
    assert.equal(found, null);
  });

  it('faller tillbaka till listAccessibleCustomers om getAccessibleCustomer misslyckas', async () => {
    const found = await resolveCustomerForSend(user, customer.id, {
      getAccessibleCustomer: async () => null,
      listAccessibleCustomers: async () => [customer]
    });
    assert.equal(found.id, customer.id);
  });

  it('tom customerId → null utan anrop', async () => {
    let called = false;
    const found = await resolveCustomerForSend(user, '', {
      getAccessibleCustomer: async () => {
        called = true;
        return customer;
      }
    });
    assert.equal(found, null);
    assert.equal(called, false);
  });
});
