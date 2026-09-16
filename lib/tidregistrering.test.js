const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  STATUS,
  computeAmount,
  roundHours,
  normalizeStatus,
  dateOnly,
  toInvoiceLine,
  summarizeEntries,
  buildEntryFields,
  recordToEntry,
  parsePrislista,
  collectHourlyRates,
  resolveHourlyRateFromPrislista,
  applyResolvedRate,
  enrichEntryWithPrislista
} = require('./tidregistrering');

describe('tidregistrering', () => {
  it('beräknar belopp från timmar × pris', () => {
    assert.equal(computeAmount(1.5, 1000), 1500);
    assert.equal(computeAmount(2, 875.5), 1751);
    assert.equal(computeAmount(0, 100), null);
    assert.equal(computeAmount(-1, 100), null);
  });

  it('normaliserar status och datum', () => {
    assert.equal(normalizeStatus('Klar'), STATUS.READY);
    assert.equal(normalizeStatus(''), STATUS.DRAFT);
    assert.equal(dateOnly('2026-09-15'), '2026-09-15');
    assert.equal(dateOnly('2026-09-15T10:00:00.000Z'), '2026-09-15');
    assert.equal(dateOnly(''), '');
  });

  it('bygger fält för create och kräver kund + timmar', () => {
    const fields = buildEntryFields(
      {
        byraId: 'recByra',
        customerId: 'recKund',
        customerName: 'Acme AB',
        date: '2026-09-15',
        hours: 2.5,
        rate: 1200,
        description: 'Bokslut'
      },
      { forCreate: true, user: { email: 'a@ex.se', name: 'Annika' } }
    );
    assert.equal(fields['Byrå ID'], 'recByra');
    assert.equal(fields.Timmar, 2.5);
    assert.equal(fields.Belopp, 3000);
    assert.equal(fields.Status, STATUS.DRAFT);
    assert.equal(fields['Utförd av'], 'a@ex.se');

    assert.throws(
      () => buildEntryFields({ date: '2026-09-15', hours: 1 }, { forCreate: true }),
      /Kund krävs/
    );
    assert.throws(
      () =>
        buildEntryFields(
          { customerName: 'X', date: '2026-09-15', hours: 0 },
          { forCreate: true }
        ),
      /Timmar/
    );
  });

  it('mappar Airtable-post till entry och fakturarad', () => {
    const entry = recordToEntry({
      id: 'rec1',
      createdTime: '2026-09-15T08:00:00.000Z',
      fields: {
        'Byrå ID': 'b1',
        'Kund ID': 'k1',
        Kundnamn: 'Test AB',
        Datum: '2026-09-14',
        Timmar: 3,
        Timpris: 1000,
        Status: 'Klar',
        Beskrivning: 'Rådgivning'
      }
    });
    assert.equal(entry.hours, 3);
    assert.equal(entry.amount, 3000);
    assert.equal(entry.status, STATUS.READY);

    const line = toInvoiceLine(entry);
    assert.equal(line.invoiceReady, true);
    assert.equal(line.amount, 3000);
    assert.equal(line.description, 'Rådgivning');
  });

  it('summerar fakturaunderlag per status och kund', () => {
    const summary = summarizeEntries([
      {
        customerId: 'a',
        customerName: 'A AB',
        hours: 2,
        amount: 2000,
        status: STATUS.READY
      },
      {
        customerId: 'a',
        customerName: 'A AB',
        hours: 1,
        amount: 1000,
        status: STATUS.DRAFT
      },
      {
        customerId: 'b',
        customerName: 'B AB',
        hours: 4,
        amount: 4000,
        status: STATUS.INVOICED
      }
    ]);
    assert.equal(summary.totalHours, 7);
    assert.equal(summary.invoiceBasis.count, 1);
    assert.equal(summary.invoiceBasis.hours, 2);
    assert.equal(summary.invoiceBasis.amount, 2000);
    assert.equal(summary.byStatus[STATUS.DRAFT].count, 1);
    assert.equal(summary.byCustomer.length, 2);
  });

  it('avrundar timmar till två decimaler', () => {
    assert.equal(roundHours(1.239), 1.24);
    assert.equal(roundHours('2.5'), 2.5);
  });


  it('hämtar timpris från byråns prislista via aktivitet', () => {
    const prislista = parsePrislista(
      JSON.stringify({
        'Löpande bokföring': { pris: 950, enhet: 'h' },
        'Årsbokslut': { pris: 5000, enhet: 'st' }
      }),
      JSON.stringify([{ namn: 'Rådgivning', pris: 1400, enhet: 'h' }])
    );
    const hourly = collectHourlyRates(prislista);
    assert.equal(hourly.length, 2);

    const byActivity = resolveHourlyRateFromPrislista(prislista, { activity: 'Rådgivning' });
    assert.equal(byActivity.rate, 1400);
    assert.equal(byActivity.match, 'exact');

    const byPartial = resolveHourlyRateFromPrislista(prislista, { activity: 'löpande' });
    assert.equal(byPartial.rate, 950);

    const ignoredPiece = resolveHourlyRateFromPrislista(prislista, { activity: 'Årsbokslut' });
    assert.equal(ignoredPiece, null);
  });

  it('använder enda unika timpriset som fallback', () => {
    const prislista = parsePrislista(
      JSON.stringify({
        A: { pris: 1100, enhet: 'h' },
        B: { pris: 1100, enhet: 'timme' }
      }),
      '[]'
    );
    const hit = resolveHourlyRateFromPrislista(prislista, { activity: 'Okänd sak' });
    assert.equal(hit.rate, 1100);
    assert.equal(hit.match, 'single-rate');
  });

  it('applicerar prislista när rate saknas och berikar listposter', () => {
    const prislista = parsePrislista(
      JSON.stringify({ Timpris: { pris: 1250, enhet: 'h' } }),
      '[]'
    );
    const { input, resolved } = applyResolvedRate(
      { activity: 'Något', hours: 2, customerName: 'X', date: '2026-09-15' },
      prislista
    );
    assert.equal(resolved.rate, 1250);
    assert.equal(input.rate, 1250);

    const kept = applyResolvedRate({ rate: 900, activity: 'Något' }, prislista);
    assert.equal(kept.resolved, null);
    assert.equal(kept.input.rate, 900);

    const enriched = enrichEntryWithPrislista(
      { hours: 0.5, rate: null, amount: null, activity: '', uppdragsnamn: '' },
      prislista
    );
    assert.equal(enriched.rate, 1250);
    assert.equal(enriched.amount, 625);
    assert.equal(enriched.rateFromPrislista, true);
  });
});
