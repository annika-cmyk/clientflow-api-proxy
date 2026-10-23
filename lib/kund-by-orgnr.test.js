const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeOrgnrDigits,
  orgnrVariants,
  recordMatchesOrgnr,
  byraIdFromRecord,
  findKundByOrgnrForByra,
  toLookupPayload
} = require('./kund-by-orgnr');

describe('kund-by-orgnr', () => {
  it('normaliserar orgnr till siffror', () => {
    assert.equal(normalizeOrgnrDigits('556722-3705'), '5567223705');
    assert.equal(normalizeOrgnrDigits(' 55 6722 3705 '), '5567223705');
  });

  it('bygger orgnr-varianter för 10 och 12 siffror', () => {
    const ten = orgnrVariants('5567223705');
    assert.ok(ten.includes('5567223705'));
    assert.ok(ten.includes('556722-3705'));
    const twelve = orgnrVariants('165567223705');
    assert.ok(twelve.includes('165567223705'));
    assert.ok(twelve.includes('5567223705'));
  });

  it('matchar orgnr mellan 10 och 12 siffror', () => {
    const rec = { fields: { Orgnr: '5567223705' } };
    assert.equal(recordMatchesOrgnr(rec, '556722-3705'), true);
    assert.equal(recordMatchesOrgnr(rec, '165567223705'), true);
    assert.equal(recordMatchesOrgnr(rec, '5567223706'), false);
  });

  it('läser Byrå ID robust', () => {
    assert.equal(byraIdFromRecord({ fields: { 'Byrå ID': '123' } }), '123');
    assert.equal(byraIdFromRecord({ fields: { Byra_ID: ['99'] } }), '99');
  });

  it('toLookupPayload speglar exists/hasAccess', () => {
    assert.deepEqual(toLookupPayload(null), {
      exists: false,
      existingId: null,
      existingNamn: '',
      hasAccess: false
    });
    assert.deepEqual(
      toLookupPayload({ id: 'rec1', fields: { Namn: 'Exempel AB' } }, { hasAccess: true }),
      {
        exists: true,
        existingId: 'rec1',
        existingNamn: 'Exempel AB',
        hasAccess: true
      }
    );
  });

  it('findKundByOrgnrForByra filtrerar på byrå och orgnr', async () => {
    const calls = [];
    const axios = {
      get: async (url) => {
        calls.push(url);
        return {
          data: {
            records: [
              { id: 'recA', fields: { Namn: 'A', Orgnr: '5567223705', 'Byrå ID': '1' } },
              { id: 'recB', fields: { Namn: 'B', Orgnr: '5567223705', 'Byrå ID': '2' } }
            ]
          }
        };
      }
    };
    const found = await findKundByOrgnrForByra({
      axios,
      token: 't',
      baseId: 'appX',
      orgnr: '556722-3705',
      byraId: '2'
    });
    assert.equal(found.id, 'recB');
    assert.ok(calls.length >= 1);
  });

  it('findKundByOrgnrForByra returnerar null vid ogiltigt orgnr', async () => {
    const found = await findKundByOrgnrForByra({
      axios: { get: async () => ({ data: { records: [] } }) },
      token: 't',
      baseId: 'appX',
      orgnr: '123',
      byraId: '1'
    });
    assert.equal(found, null);
  });
});
