const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildKalenderTidPayload } = require('../public/js/kalender-klar-tid');

describe('kalender-klar-tid', () => {
  it('bygger tidpayload från avsatt block', () => {
    const body = buildKalenderTidPayload({
      customerId: 'recC',
      customerName: 'Moheda Betongkoll AB',
      uppdragId: 'recU',
      uppdragsnamn: 'Extralön',
      koringId: 'recR',
      hours: 0.5,
      date: '2026-09-18',
      start: '2026-09-18T17:15:00',
      end: '2026-09-18T17:45:00',
      status: 'Klar'
    });
    assert.equal(body.hours, 0.5);
    assert.equal(body.customerId, 'recC');
    assert.equal(body.koringId, 'recR');
    assert.equal(body.status, 'Klar');
    assert.equal(body.activity, 'Uppdragsarbete');
    assert.match(body.description, /17:15/);
  });

  it('kräver avsatta timmar', () => {
    assert.throws(
      () => buildKalenderTidPayload({
        customerId: 'recC',
        customerName: 'X',
        hours: 0,
        date: '2026-09-18'
      }),
      /Avsätt tid/i
    );
  });
});
