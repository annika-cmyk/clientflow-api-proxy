const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { migrateAvvikelseStatuses } = require('./avvikelse-status-migrate');

describe('avvikelse-status-migrate', () => {
  it('patchar bara rader med legacy-status', async () => {
    const patched = [];
    const axios = {
      async get() {
        return {
          data: {
            records: [
              { id: 'recOld', fields: { Status: 'Rapporterad till FM', orgnr: '556677-8899', Företagsnamn: 'Test AB' } },
              { id: 'recOk', fields: { Status: 'Öppen', orgnr: '556000-0000' } },
              { id: 'recCanon', fields: { Status: 'Rapporterad till Finanspolisen (FM)' } }
            ]
          }
        };
      },
      async patch(url, body) {
        patched.push({ url, body });
        return { data: { id: url.split('/').pop(), fields: body.fields } };
      }
    };
    const out = await migrateAvvikelseStatuses({
      axios,
      token: 'tok',
      baseId: 'appX',
      table: 'tblAvv'
    });
    assert.equal(out.scanned, 3);
    assert.equal(out.changed.length, 1);
    assert.equal(out.changed[0].id, 'recOld');
    assert.equal(out.changed[0].fromStatus, 'Rapporterad till FM');
    assert.equal(out.changed[0].toStatus, 'Rapporterad till Finanspolisen (FM)');
    assert.equal(patched.length, 1);
    assert.match(patched[0].url, /recOld$/);
    assert.equal(patched[0].body.fields.Status, 'Rapporterad till Finanspolisen (FM)');
  });
});
