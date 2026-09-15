const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildEngangUppdragPayload } = require('./mejl-koppla-uppdrag');

describe('mejl-koppla-uppdrag', () => {
  it('bygger payload för enstaka Eget uppdrag/Engång', () => {
    const body = buildEngangUppdragPayload({
      customerId: 'recC',
      namn: 'Lön',
      ansvarig: 'Anna',
      klientansvarig: 'Bertil',
      deadline: '2026-09-20',
      today: '2026-09-15'
    });
    assert.equal(body.typ, 'Eget uppdrag');
    assert.equal(body.fields.Frekvens, 'Engång');
    assert.equal(body.fields.Namn, 'Lön');
    assert.equal(body.fields['Nästa deadline'], '2026-09-20');
    assert.equal(body.fields.Status, 'Aktiv');
  });

  it('kräver namn', () => {
    assert.throws(
      () => buildEngangUppdragPayload({
        customerId: 'recC', namn: '  ', ansvarig: 'A', klientansvarig: 'B', deadline: '2026-09-20', today: '2026-09-15'
      }),
      /namn/i
    );
  });
});
